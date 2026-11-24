//! One TeamSpeak connection: connect, keep the UI updated with snapshots, and apply
//! actions from the UI (join channel, send chat, mute/deafen, disconnect).
//!
//! Events go out through an mpsc channel, and actions come in through another one.
//! The caller (the Tauri shell later, or the probe binary now) owns both ends.

use anyhow::{anyhow, Context, Result};
use futures::StreamExt;
use tokio::sync::mpsc;
use tsclientlib::prelude::{M2BClientMoveExt, M2BClientUpdateExt};
use tsclientlib::{ChannelId, ClientId, Connection, DisconnectOptions, Identity, InMessage, MessageTarget, OutCommandExt, StreamItem, TextMessageTargetMode};

use std::sync::{Arc, Mutex};

use tsproto_packets::packets::InAudioBuf;

use crate::audio::{self, Playback, Sender, TransmitMode};
use crate::protocol::{Action, ChatFrom, ChatMessage, ChatTarget, ConnState, Event, TransmitConfig};
use crate::snapshot::build_snapshot;

/// How long to wait for the server's first book before giving up.
const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Voice activation level used until the UI chooses one.
const DEFAULT_VOICE_THRESHOLD_DB: f32 = -45.0;

/// Microphone sender and speaker mixer for one connection.
struct AudioState {
	playback: Arc<Mutex<Playback>>,
	sender: Sender,
}

/// Handle the caller keeps to control a running session.
#[derive(Clone)]
pub struct SessionHandle {
	pub actions: mpsc::UnboundedSender<Action>,
}

/// Starts a connection in a background task. Events arrive on `events`,
/// and the returned handle sends actions back to the session.
pub fn spawn_session(
	conn_id: String,
	address: String,
	port: u16,
	nickname: String,
	password: Option<String>,
	events: mpsc::UnboundedSender<Event>,
) -> SessionHandle {
	let (action_tx, action_rx) = mpsc::unbounded_channel();
	tokio::spawn(async move {
		send_status(&events, &conn_id, ConnState::Connecting, None);
		// Run the connection in its own task. tsclientlib can panic while connecting,
		// and a panic would otherwise end this task without any status for the UI.
		let inner = tokio::spawn({
			let events = events.clone();
			let conn_id = conn_id.clone();
			async move {
				run(&conn_id, &address, port, &nickname, password, &events, action_rx).await
			}
		});
		let result = match inner.await {
			Ok(result) => result,
			Err(join_err) => Err(anyhow!("internal error: {join_err}")),
		};
		match result {
			Ok(()) => send_status(&events, &conn_id, ConnState::Disconnected, None),
			Err(err) => send_status(&events, &conn_id, ConnState::Error, Some(friendly(&err))),
		}
	});
	SessionHandle { actions: action_tx }
}

fn send_status(
	events: &mpsc::UnboundedSender<Event>,
	conn_id: &str,
	state: ConnState,
	message: Option<String>,
) {
	let _ = events.send(Event::Status {
		conn_id: conn_id.to_owned(),
		state,
		message,
	});
}

fn send_notice(events: &mpsc::UnboundedSender<Event>, conn_id: &str, code: &str, message: String) {
	let _ = events.send(Event::Notice {
		conn_id: conn_id.to_owned(),
		code: code.to_owned(),
		message,
	});
}

async fn run(
	conn_id: &str,
	address: &str,
	port: u16,
	nickname: &str,
	password: Option<String>,
	events: &mpsc::UnboundedSender<Event>,
	mut actions: mpsc::UnboundedReceiver<Action>,
) -> Result<()> {
	// A fresh identity per connection for now. Stage 2b will store one per bookmark
	// so the server recognises the user again.
	let identity = Identity::create();

	let mut builder = Connection::build(format!("{address}:{port}"))
		.identity(identity)
		.name(nickname.to_owned());
	if let Some(pwd) = password.filter(|p| !p.is_empty()) {
		builder = builder.password(pwd);
	}
	let mut con = builder.connect().context("could not start the connection")?;

	// Audio is optional: without a usable microphone or speaker the text side still works.
	let playback = Arc::new(Mutex::new(Playback::new()));
	let mut audio_state = AudioState {
		playback: playback.clone(),
		sender: Sender::new(TransmitMode::VoiceActivation {
			threshold_db: DEFAULT_VOICE_THRESHOLD_DB,
		})?,
	};
	let mut engine = match audio::start(playback, None, None) {
		Ok(engine) => Some(engine),
		Err(err) => {
			send_notice(events, conn_id, "audio_unavailable", format!("Audio is off: {err:#}"));
			None
		}
	};

	let mut connected = false;
	// tsclientlib 0.2 can panic inside its own connect task (it then never reports
	// anything), so give up if the server has not sent its book within the deadline.
	let connect_deadline = tokio::time::sleep(CONNECT_TIMEOUT);
	tokio::pin!(connect_deadline);
	loop {
		// Wait for either the next connection event or the next UI action.
		// The borrow of `con` ends inside this statement, so the arms below may use it.
		let step = tokio::select! {
			step = async {
				match con.events().next().await {
					Some(Ok(StreamItem::BookEvents(_))) => Step::Book,
					Some(Ok(StreamItem::MessageEvent(msg))) => Step::Message(msg),
					Some(Ok(StreamItem::Audio(packet))) => Step::Audio(packet),
					Some(Ok(_)) => Step::Other,
					Some(Err(e)) => Step::Failed(e.to_string()),
					None => Step::Closed,
				}
			} => step,
			action = actions.recv() => Step::Action(action),
			frame = next_frame(&mut engine) => Step::Frame(frame),
			_ = &mut connect_deadline, if !connected => Step::TimedOut,
		};

		if let Some(label) = debug_label(&step) {
			eprintln!("[debug] {label}");
		}
		match step {
			Step::Book => {
				if !connected {
					connected = true;
					send_status(events, conn_id, ConnState::Connected, None);
				}
				// Full snapshot after each book update. Simple and always correct;
				// finer-grained patches can come later if the UI needs them.
				let snap = build_snapshot(con.get_state()?);
				let _ = events.send(Event::Snapshot {
					conn_id: conn_id.to_owned(),
					snapshot: snap,
				});
			}
			Step::Message(msg) => {
				if let InMessage::TextMessage(text) = msg {
					let state = con.get_state()?;
					let own_channel = state
						.clients
						.get(&state.own_client)
						.map(|c| c.channel.0)
						.unwrap_or(0);
					for part in text.iter() {
						let channel_id = match part.target {
							TextMessageTargetMode::Channel => own_channel,
							_ => 0,
						};
						let _ = events.send(Event::Message {
							conn_id: conn_id.to_owned(),
							channel_id,
							message: ChatMessage {
								id: next_message_id(),
								from: ChatFrom {
									id: part.invoker_id.0,
									nickname: part.invoker_name.clone(),
								},
								text: part.message.clone(),
								ts: now_millis(),
							},
						});
					}
				}
			}
			Step::Audio(packet) => {
				if let Ok(mut playback) = audio_state.playback.lock() {
					playback.push(packet);
				}
			}
			Step::Frame(Some(frame)) => {
				let state = con.get_state()?;
				let muted = state
					.clients
					.get(&state.own_client)
					.map(|c| c.input_muted)
					.unwrap_or(false);
				if let Some(packet) = audio_state.sender.process(&frame, muted)? {
					con.send_audio(packet)?;
				}
			}
			Step::Frame(None) => {
				// The microphone stopped. Keep the text side running without audio.
				engine = None;
				send_notice(events, conn_id, "audio_stopped", "The microphone stopped.".into());
			}
			Step::Other => {}
			Step::TimedOut => return Err(anyhow!("timed out waiting for the server")),
			Step::Failed(msg) => return Err(anyhow!("connection error: {msg}")),
			Step::Closed => return Err(anyhow!("connection closed by the server")),
			Step::Action(None) | Step::Action(Some(Action::Disconnect)) => {
				con.disconnect(DisconnectOptions::new())?;
				// Let the disconnect packet go out before the task ends.
				con.events().for_each(|_| futures::future::ready(())).await;
				return Ok(());
			}
			Step::Action(Some(Action::SetAudioDevices { input, output })) => {
				// Stop the current streams first, then open the new devices.
				drop(engine.take());
				engine = match audio::start(audio_state.playback.clone(), input.as_deref(), output.as_deref()) {
					Ok(e) => Some(e),
					Err(err) => {
						send_notice(events, conn_id, "audio_unavailable", format!("Audio is off: {err:#}"));
						None
					}
				};
			}
			Step::Action(Some(action)) => {
				if let Err(err) = apply(&mut con, &mut audio_state, action) {
					send_notice(events, conn_id, "action_failed", format!("{err:#}"));
				}
			}
		}
	}
}

/// Waits for the next microphone frame. Pends forever when there is no audio engine.
async fn next_frame(engine: &mut Option<audio::Engine>) -> Option<Vec<f32>> {
	match engine {
		Some(engine) => engine.frames.recv().await,
		None => std::future::pending().await,
	}
}

/// What the connection loop woke up for.
enum Step {
	Book,
	Other,
	Message(InMessage),
	Audio(InAudioBuf),
	Frame(Option<Vec<f32>>),
	Failed(String),
	Closed,
	TimedOut,
	Action(Option<Action>),
}

/// Temporary trace for debugging the first connection; prints to stderr.
fn debug_label(step: &Step) -> Option<String> {
	match step {
		Step::Book => Some("book received".into()),
		Step::Message(_) => Some("text message".into()),
		Step::Other => Some("other connection event".into()),
		Step::Failed(msg) => Some(format!("connection failed: {msg}")),
		Step::Closed => Some("connection closed".into()),
		Step::TimedOut => Some("connect deadline reached".into()),
		Step::Action(_) => Some("ui action".into()),
		Step::Audio(_) | Step::Frame(_) => None,
	}
}

static MESSAGE_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn next_message_id() -> String {
	let n = MESSAGE_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
	format!("{}-{n}", now_millis())
}

fn now_millis() -> i64 {
	std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map(|d| d.as_millis() as i64)
		.unwrap_or(0)
}

/// Applies one UI action to the live connection.
fn apply(con: &mut Connection, audio: &mut AudioState, action: Action) -> Result<()> {
	match action {
		Action::Join { channel_id, password } => {
			let state = con.get_state()?;
			let own = state.own_client;
			let me = state
				.clients
				.get(&own)
				.ok_or_else(|| anyhow!("own client is not known yet"))?;
			let pwd = password.filter(|p| !p.is_empty());
			let mut cmd = me.client_move(ChannelId(channel_id));
			if let Some(pwd) = pwd.as_deref() {
				cmd = cmd.set_password(pwd);
			}
			cmd.send(con)?;
		}
		Action::Chat { target, text } => {
			let state = con.get_state()?;
			let msg = match target {
				ChatTarget::Channel => state.send_message(MessageTarget::Channel, &text),
				ChatTarget::Server => state.send_message(MessageTarget::Server, &text),
				ChatTarget::Client { client_id } => {
					state.send_message(MessageTarget::Client(ClientId(client_id)), &text)
				}
			};
			msg.send(con)?;
		}
		Action::SetMuted { input_muted, output_muted } => {
			let state = con.get_state()?;
			let mut update = state.client_update();
			if let Some(v) = input_muted {
				update = update.set_input_muted(v);
			}
			if let Some(v) = output_muted {
				update = update.set_output_muted(v);
			}
			update.send(con)?;
		}
		Action::SetAudioDevices { .. } => {}
		Action::Ptt { down } => audio.sender.set_ptt(down),
		Action::SetTransmit { mode } => audio.sender.set_mode(match mode {
			TransmitConfig::Ptt => TransmitMode::PushToTalk,
			TransmitConfig::Voice { threshold_db } => TransmitMode::VoiceActivation { threshold_db },
		}),
		Action::Disconnect => {}
	}
	Ok(())
}

fn friendly(err: &anyhow::Error) -> String {
	let msg = format!("{err:#}");
	let lower = msg.to_ascii_lowercase();
	if lower.contains("password") {
		"The server password is wrong, or the server needs one.".into()
	} else if lower.contains("timed out") || lower.contains("timeout") {
		"Timed out. The server may be offline or blocked by a firewall.".into()
	} else if lower.contains("resolve") || lower.contains("lookup") || lower.contains("not known") {
		"Address not found. Check the spelling of the server address.".into()
	} else {
		msg
	}
}
