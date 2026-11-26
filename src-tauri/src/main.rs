//! Hamseda desktop shell.
//!
//! The React UI calls two commands (`connect_server`, `send_action`). Events from the
//! Rust core are forwarded to the window as `hamseda://event`, with the JSON shapes in
//! `core/src/protocol.rs` (the same shapes the UI already uses from the Node bridge).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::Mutex;

use hamseda_core::protocol::{Action, Event};
use hamseda_core::session::{spawn_session, SessionHandle};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;

/// Name of the event the UI listens to.
const EVENT_NAME: &str = "hamseda://event";

#[derive(Default)]
struct AppState {
	/// Running sessions, by the connection id the UI chose (the bookmark id).
	sessions: Mutex<HashMap<String, SessionHandle>>,
}

/// Opens a connection to a TeamSpeak 3 server. Replacing an old session with the same id
/// closes the old one, because its action channel is dropped.
#[tauri::command]
async fn connect_server(
	app: AppHandle,
	state: State<'_, AppState>,
	conn_id: String,
	address: String,
	port: u16,
	nickname: String,
	password: Option<String>,
) -> Result<(), String> {
	// One identity per server, kept in the app's data folder, so the server knows this user again.
	let data_dir = app.path().app_data_dir().map_err(|e| format!("no app data folder: {e}"))?;
	let file_name: String = format!("{address}_{port}")
		.chars()
		.map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' { c } else { '_' })
		.collect();
	let identity_path = data_dir.join("identities").join(format!("{file_name}.json"));
	let identity = hamseda_core::identity::load_or_create(&identity_path)
		.map_err(|e| format!("{e:#}"))?;

	let (tx, mut rx) = mpsc::unbounded_channel::<Event>();

	// Forward every core event to the window.
	let forward_app = app.clone();
	tokio::spawn(async move {
		while let Some(event) = rx.recv().await {
			let _ = forward_app.emit(EVENT_NAME, event);
		}
	});

	let handle = spawn_session(conn_id.clone(), address, port, nickname, password, identity, tx);
	state
		.sessions
		.lock()
		.map_err(|_| "internal lock error".to_string())?
		.insert(conn_id, handle);
	Ok(())
}

/// Lists microphones and speakers for the settings screen.
#[tauri::command]
fn list_audio_devices() -> hamseda_core::audio::AudioDevices {
	hamseda_core::audio::list_devices()
}

/// Sends a UI action (join, chat, mute/deafen, disconnect) to a running session.
#[tauri::command]
fn send_action(state: State<'_, AppState>, conn_id: String, action: Action) -> Result<(), String> {
	let sessions = state
		.sessions
		.lock()
		.map_err(|_| "internal lock error".to_string())?;
	let handle = sessions
		.get(&conn_id)
		.ok_or_else(|| "this server is not connected".to_string())?;
	handle
		.actions
		.send(action)
		.map_err(|_| "the connection has already closed".to_string())
}

fn main() {
	tauri::Builder::default()
		.plugin(tauri_plugin_updater::Builder::new().build())
		.plugin(tauri_plugin_process::init())
		.manage(AppState::default())
		.invoke_handler(tauri::generate_handler![connect_server, send_action, list_audio_devices])
		.run(tauri::generate_context!())
		.expect("error while running Hamseda");
}
