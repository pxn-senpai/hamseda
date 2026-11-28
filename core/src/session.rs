//! One TeamSpeak connection: connect, keep the UI updated with snapshots, and apply
//! actions from the UI (join channel, send chat, mute/deafen, disconnect).
//!
//! Events go out through an mpsc channel, and actions come in through another one.
//! The caller (the Tauri shell later, or the probe binary now) owns both ends.

use anyhow::{anyhow, Context, Result};
use futures::StreamExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, Mutex as AsyncMutex};
use base64::Engine as _;
use tsclientlib::prelude::{M2BClientMoveExt, M2BClientUpdateExt};
use tsclientlib::{ChannelId, ClientId, Connection, DisconnectOptions, FileDownloadResult, FiletransferHandle, Identity, InMessage, MessageTarget, OutCommandExt, StreamItem, TextMessageTargetMode};

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use tsproto_packets::packets::InAudioBuf;

use crate::audio::{self, PacketSink, Playback, Sender, TransmitMode};
use crate::protocol::{Action, ChatFrom, ChatMessage, ChatTarget, ConnState, Event, TransmitConfig};
use crate::snapshot::build_snapshot;

/// How many times a connection attempt is tried when the library fails before connecting.
const CONNECT_ATTEMPTS: u32 = 3;
/// Pause between attempts.
const RETRY_DELAY: std::time::Duration = std::time::Duration::from_secs(2);

/// How long to wait for the server's first book before giving up.
const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Largest avatar we send or accept, in bytes (TeamSpeak's own default limit is 500 KB).
const MAX_AVATAR_BYTES: usize = 500 * 1024;

/// Voice activation level used until the UI chooses one.
const DEFAULT_VOICE_THRESHOLD_DB: f32 = -45.0;

/// Microphone sender and speaker mixer for one connection.
struct AudioState {
	playback: Arc<Mutex<Playback>>,
	sink: PacketSink,
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
	identity: Identity,
	events: mpsc::UnboundedSender<Event>,
) -> SessionHandle {
	let (action_tx, action_rx) = mpsc::unbounded_channel();
	// The action receiver is shared with each attempt, so a retry keeps the same UI actions.
	let actions = Arc::new(AsyncMutex::new(action_rx));
	tokio::spawn(async move {
		for attempt in 1..=CONNECT_ATTEMPTS {
			send_status(&events, &conn_id, ConnState::Connecting, None);
			// Run the attempt in its own task. tsclientlib can panic while connecting, and a
			// panic would otherwise end this task without any status for the UI.
			let inner = tokio::spawn({
				let events = events.clone();
				let conn_id = conn_id.clone();
				let address = address.clone();
				let nickname = nickname.clone();
				let password = password.clone();
				let identity = identity.clone();
				let actions = actions.clone();
				async move {
					run(&conn_id, &address, port, &nickname, password, identity, &events, actions).await
				}
			});
			let result = match inner.await {
				Ok(result) => result,
				Err(join_err) => Err(anyhow!("internal error: {join_err}")),
			};
			match result {
				Ok(()) => {
					send_status(&events, &conn_id, ConnState::Disconnected, None);
					return;
				}
				Err(err) => {
					// Only the failures that come from the library's connect step are retried.
					let msg = format!("{err:#}").to_ascii_lowercase();
					let transient = ["timed out", "timeout", "not acked", "internal error"]
						.iter()
						.any(|pat| msg.contains(pat));
					if transient && attempt < CONNECT_ATTEMPTS {
						tokio::time::sleep(RETRY_DELAY).await;
						continue;
					}
					// Show the plain explanation and the technical detail, so the cause can be reported.
					let detail = format!("{err:#}");
					send_status(
						&events,
						&conn_id,
						ConnState::Error,
						Some(format!("{}\n\nTechnical detail: {detail}", friendly(&err))),
					);
					return;
				}
			}
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
	identity: Identity,
	events: &mpsc::UnboundedSender<Event>,
	actions: Arc<AsyncMutex<mpsc::UnboundedReceiver<Action>>>,
) -> Result<()> {
	// Holding the lock for this attempt only: it is released when the attempt ends or panics.
	let mut actions = actions.lock_owned().await;
	let mut builder = Connection::build(format!("{address}:{port}"))
		.identity(identity)
		.name(nickname.to_owned());
	if let Some(pwd) = password.filter(|p| !p.is_empty()) {
		builder = builder.password(pwd);
	}
	let mut con = builder.connect().context("could not start the connection")?;

	// Audio is optional: without a usable microphone or speaker the text side still works.
	let (playback_obj, sink) = Playback::new();
	let playback = Arc::new(Mutex::new(playback_obj));
	let mut audio_state = AudioState {
		playback: playback.clone(),
		sink,
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
	// False once every UI handle is gone. The connection then keeps running, and only
	// an explicit Disconnect action (or the connect deadline) ends it.
	let mut actions_open = true;
	// tsclientlib 0.2 can panic inside its own connect task (it then never reports
	// anything), so give up if the server has not sent its book within the deadline.
	let connect_deadline = tokio::time::sleep(CONNECT_TIMEOUT);
	tokio::pin!(connect_deadline);
	// File transfers in flight: avatar downloads (by client id) and our own avatar upload.
	let mut downloads: HashMap<FiletransferHandle, u16> = HashMap::new();
	let mut uploads: HashMap<FiletransferHandle, Vec<u8>> = HashMap::new();
	// (client id, avatar name) pairs already requested, so each avatar is asked for once.
	let mut asked: HashSet<(u16, String)> = HashSet::new();
	loop {
		// Wait for either the next connection event or the next UI action.
		// The borrow of `con` ends inside this statement, so the arms below may use it.
		let step = tokio::select! {
			step = async {
				match con.events().next().await {
					Some(Ok(StreamItem::BookEvents(_))) => Step::Book,
					Some(Ok(StreamItem::MessageEvent(msg))) => Step::Message(msg),
					Some(Ok(StreamItem::Audio(packet))) => Step::Audio(packet),
					Some(Ok(StreamItem::FileDownload(handle, result))) => Step::Download(handle, result),
					Some(Ok(StreamItem::FileUpload(handle, result))) => Step::Upload(handle, result),
					Some(Ok(StreamItem::FiletransferFailed(handle, _))) => Step::TransferFailed(handle),
					Some(Ok(_)) => Step::Other,
					Some(Err(e)) => Step::Failed(e.to_string()),
					None => Step::Closed,
				}
			} => step,
			action = actions.recv(), if actions_open => Step::Action(action),
			frame = next_frame(&mut engine) => Step::Frame(frame),
			_ = &mut connect_deadline, if !connected => Step::TimedOut,
		};

		match step {
			Step::Book => {
				if !connected {
					connected = true;
					// Like the official client, subscribe to all channels. Without this the
					// server only tells us about people in our own channel.
					let subscribe = con.get_state()?.server.set_subscribed(true);
					subscribe.send(&mut con)?;
					send_status(events, conn_id, ConnState::Connected, None);
				}
				// Full snapshot after each book update. Simple and always correct;
				// finer-grained patches can come later if the UI needs them.
				let snap = build_snapshot(con.get_state()?);
				let _ = events.send(Event::Snapshot {
					conn_id: conn_id.to_owned(),
					snapshot: snap,
				});
				request_avatars(&mut con, &mut downloads, &mut asked);
			}
			Step::Message(msg) => {
				if let InMessage::TextMessage(text) = msg {
					let Ok(state) = con.get_state() else { continue };
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
						// A private message is shown in the conversation with its sender. Our own
						// private messages are added by the UI when we send them.
						let pm_with = match part.target {
							TextMessageTargetMode::Client if part.invoker_id.0 != state.own_client.0 => {
								Some(part.invoker_id.0)
							}
							TextMessageTargetMode::Client => continue,
							_ => None,
						};
						let _ = events.send(Event::Message {
							conn_id: conn_id.to_owned(),
							channel_id,
							pm_with,
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
				// Hand the packet to the speaker thread. Never blocks.
				let _ = audio_state.sink.send(packet);
			}
			Step::Frame(Some(frame)) => {
				// The microphone can deliver frames while the server is still answering.
				// The library reports "Currently not connected" for those, so such frames are
				// dropped instead of ending the session.
				if let Ok(state) = con.get_state() {
					let muted = state
						.clients
						.get(&state.own_client)
						.map(|c| c.input_muted)
						.unwrap_or(false);
					if let Some(packet) = audio_state.sender.process(&frame, muted)? {
						let _ = con.send_audio(packet);
					}
				}
			}
			Step::Frame(None) => {
				// The microphone stopped. Keep the text side running without audio.
				engine = None;
				send_notice(events, conn_id, "audio_stopped", "The microphone stopped.".into());
			}
			Step::Download(handle, result) => {
				if let Some(client_id) = downloads.remove(&handle) {
					tokio::spawn(read_avatar(events.clone(), conn_id.to_owned(), client_id, result));
				}
			}
			Step::Upload(handle, result) => {
				if let Some(bytes) = uploads.remove(&handle) {
					tokio::spawn(async move {
						let mut stream = result.stream;
						let _ = stream.write_all(&bytes).await;
						let _ = stream.shutdown().await;
					});
				}
			}
			Step::TransferFailed(handle) => {
				// No avatar on the server for that person, or the transfer broke. Show the letter.
				downloads.remove(&handle);
				uploads.remove(&handle);
			}
			Step::Action(Some(Action::SetAvatar { data })) => match upload_avatar(&mut con, &data) {
				Ok((handle, bytes)) => {
					uploads.insert(handle, bytes);
				}
				Err(err) => send_notice(events, conn_id, "avatar_failed", format!("{err:#}")),
			},
			Step::Other => {}
			Step::TimedOut => return Err(anyhow!("timed out waiting for the server")),
			Step::Failed(msg) => return Err(anyhow!("connection error: {msg}")),
			Step::Closed => return Err(anyhow!("connection closed by the server")),
			Step::Action(None) => actions_open = false,
			Step::Action(Some(Action::Disconnect)) => {
				con.disconnect(DisconnectOptions::new())?;
				// Let the disconnect packet go out before the task ends, but never wait long.
				let flush = con.events().for_each(|_| futures::future::ready(()));
				let _ = tokio::time::timeout(std::time::Duration::from_secs(2), flush).await;
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
	Download(FiletransferHandle, FileDownloadResult),
	Upload(FiletransferHandle, tsclientlib::FileUploadResult),
	TransferFailed(FiletransferHandle),
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
			// Deafen also silences what we hear here, not only what the server sends us.
			if let Some(v) = output_muted {
				if let Ok(mut p) = audio.playback.lock() {
					p.muted = v;
				}
			}
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
		// Handled in the connection loop, where the file transfer can be tracked.
		Action::SetAvatar { .. } => {}
	}
	Ok(())
}

/// Asks the server for the avatar of everyone in the book who has not been asked for yet.
/// Most people have no avatar; the server then answers with a transfer failure.
fn request_avatars(
	con: &mut Connection,
	downloads: &mut HashMap<FiletransferHandle, u16>,
	asked: &mut HashSet<(u16, String)>,
) {
	let wanted: Vec<(u16, String)> = match con.get_state() {
		Ok(state) => {
			let own = state.own_client;
			state
				.clients
				.iter()
				.filter(|(id, _)| **id != own)
				.filter_map(|(id, c)| c.uid.as_ref().map(|uid| (id.0, uid.as_avatar())))
				.collect()
		}
		Err(_) => return,
	};
	for (client_id, avatar) in wanted {
		if !asked.insert((client_id, avatar.clone())) {
			continue;
		}
		if let Ok(handle) = con.download_file(ChannelId(0), &format!("/avatar_{avatar}"), None, None) {
			downloads.insert(handle, client_id);
		}
	}
}

/// Reads one downloaded avatar and sends it to the UI as a data URL.
async fn read_avatar(
	events: mpsc::UnboundedSender<Event>,
	conn_id: String,
	client_id: u16,
	result: FileDownloadResult,
) {
	let size = result.size as usize;
	if size == 0 || size > MAX_AVATAR_BYTES {
		return;
	}
	let mut stream = result.stream;
	let mut bytes = vec![0u8; size];
	if stream.read_exact(&mut bytes).await.is_err() {
		return;
	}
	let _ = events.send(Event::Avatar {
		conn_id,
		client_id,
		data_url: data_url(&bytes),
	});
}

/// The bytes as a `data:` URL, with the type taken from the file's first bytes.
fn data_url(bytes: &[u8]) -> String {
	let mime = if bytes.starts_with(b"\x89PNG") {
		"image/png"
	} else if bytes.starts_with(b"GIF8") {
		"image/gif"
	} else {
		"image/jpeg"
	};
	format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Decodes our avatar from the UI and starts the upload. The bytes are written later,
/// when the library reports that the transfer is ready.
fn upload_avatar(con: &mut Connection, data: &str) -> Result<(FiletransferHandle, Vec<u8>)> {
	let bytes = base64::engine::general_purpose::STANDARD
		.decode(data.trim())
		.context("the avatar is not valid base64")?;
	if bytes.is_empty() || bytes.len() > MAX_AVATAR_BYTES {
		return Err(anyhow!("the avatar must be between 1 byte and 500 KB"));
	}
	let handle = con
		.upload_file(ChannelId(0), "/avatar", None, bytes.len() as u64, true, false)
		.context("could not start the avatar upload")?;
	Ok((handle, bytes))
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
