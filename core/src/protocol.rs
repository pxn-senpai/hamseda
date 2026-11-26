//! Wire types shared with the UI. They mirror `docs/protocol.md` and `app/src/types.ts`.
//! Keep these three in sync.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnState {
	Connecting,
	Connected,
	Disconnected,
	Error,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
	pub id: u64,
	pub parent_id: u64,
	/// Position among siblings, 0 is first.
	pub order: u32,
	pub name: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub topic: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub max_clients: Option<u16>,
	pub password: bool,
	pub is_spacer: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Client {
	pub id: u16,
	pub channel_id: u64,
	pub nickname: String,
	pub input_muted: bool,
	pub output_muted: bool,
	pub away: bool,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub away_message: Option<String>,
	pub group_ids: Vec<u64>,
	pub is_self: bool,
	/// ServerQuery client (a bot by definition).
	pub is_query: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Group {
	pub id: u64,
	pub name: String,
	/// Lower = more important. TeamSpeak's `sortid`.
	pub sort_id: i32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
	pub name: String,
	pub welcome: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
	pub self_id: u16,
	pub server: ServerInfo,
	pub groups: Vec<Group>,
	pub channels: Vec<Channel>,
	pub clients: Vec<Client>,
}

/// Messages from the core to the UI. Serialized as JSON with `type` and `connId`.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Event {
	Status {
		conn_id: String,
		state: ConnState,
		#[serde(skip_serializing_if = "Option::is_none")]
		message: Option<String>,
	},
	Snapshot {
		conn_id: String,
		#[serde(flatten)]
		snapshot: Snapshot,
	},
	Notice {
		conn_id: String,
		code: String,
		message: String,
	},
	/// A chat message from the server. `channel_id` 0 means "server-wide or private".
	Message {
		conn_id: String,
		channel_id: u64,
		message: ChatMessage,
	},
}

/// A chat message as the UI shows it (`ChatMessage` in `app/src/types.ts`).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
	pub id: String,
	pub from: ChatFrom,
	pub text: String,
	/// Milliseconds since the Unix epoch.
	pub ts: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatFrom {
	pub id: u16,
	pub nickname: String,
}

/// Requests from the UI to the core. Same shapes as the bridge's JSON messages.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Command {
	Connect {
		conn_id: String,
		address: String,
		port: u16,
		nickname: String,
		#[serde(default)]
		password: Option<String>,
	},
	Disconnect {
		conn_id: String,
	},
}

impl Command {
	pub fn conn_id(&self) -> &str {
		match self {
			Command::Connect { conn_id, .. } | Command::Disconnect { conn_id } => conn_id,
		}
	}
}

/// Where a chat message goes.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ChatTarget {
	/// The channel we are in right now.
	Channel,
	/// The whole server.
	Server,
	/// A private message to one client (TeamSpeak client id).
	Client { client_id: u16 },
}

/// Things the UI asks a running session to do.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Action {
	Join {
		channel_id: u64,
		#[serde(default)]
		password: Option<String>,
	},
	Chat {
		target: ChatTarget,
		text: String,
	},
	/// `None` means "leave as it is".
	SetMuted {
		#[serde(default)]
		input_muted: Option<bool>,
		#[serde(default)]
		output_muted: Option<bool>,
	},
	/// Push-to-talk key pressed (`down: true`) or released.
	Ptt {
		down: bool,
	},
	/// Change how the microphone decides when to send.
	SetTransmit {
		mode: TransmitConfig,
	},
	/// Choose the microphone and speaker by name. `None` means the system default.
	SetAudioDevices {
		#[serde(default)]
		input: Option<String>,
		#[serde(default)]
		output: Option<String>,
	},
	Disconnect,
}

/// Transmit mode as the UI sends it.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum TransmitConfig {
	Ptt,
	Voice { threshold_db: f32 },
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn status_event_uses_camel_case_fields() {
		let ev = Event::Status {
			conn_id: "a".into(),
			state: ConnState::Connected,
			message: None,
		};
		let json = serde_json::to_value(&ev).unwrap();
		assert_eq!(json["type"], "status");
		assert_eq!(json["connId"], "a");
		assert_eq!(json["state"], "connected");
		assert!(json.get("message").is_none());
	}

	#[test]
	fn snapshot_event_is_flat_like_the_ui_expects() {
		let ev = Event::Snapshot {
			conn_id: "a".into(),
			snapshot: Snapshot {
				self_id: 3,
				server: ServerInfo { name: "s".into(), welcome: String::new() },
				groups: vec![],
				channels: vec![],
				clients: vec![],
			},
		};
		let json = serde_json::to_value(&ev).unwrap();
		assert_eq!(json["type"], "snapshot");
		assert_eq!(json["connId"], "a");
		assert_eq!(json["selfId"], 3);
		assert_eq!(json["server"]["name"], "s");
		assert!(json["channels"].is_array());
	}

	#[test]
	fn message_event_matches_the_ui_shape() {
		let ev = Event::Message {
			conn_id: "a".into(),
			channel_id: 9,
			message: ChatMessage {
				id: "1".into(),
				from: ChatFrom { id: 2, nickname: "Ali".into() },
				text: "hi".into(),
				ts: 1000,
			},
		};
		let json = serde_json::to_value(&ev).unwrap();
		assert_eq!(json["type"], "message");
		assert_eq!(json["connId"], "a");
		assert_eq!(json["channelId"], 9);
		assert_eq!(json["message"]["from"]["nickname"], "Ali");
		assert_eq!(json["message"]["ts"], 1000);
	}

	#[test]
	fn ui_actions_parse() {
		let join: Action = serde_json::from_str(r#"{"type":"join","channelId":12}"#).unwrap();
		assert!(matches!(join, Action::Join { channel_id: 12, password: None }));

		let mute: Action =
			serde_json::from_str(r#"{"type":"setMuted","inputMuted":true,"outputMuted":null}"#).unwrap();
		assert!(matches!(mute, Action::SetMuted { input_muted: Some(true), output_muted: None }));

		let chat: Action =
			serde_json::from_str(r#"{"type":"chat","target":{"kind":"channel"},"text":"hi"}"#).unwrap();
		assert!(matches!(chat, Action::Chat { target: ChatTarget::Channel, .. }));

		let ptt: Action = serde_json::from_str(r#"{"type":"ptt","down":true}"#).unwrap();
		assert!(matches!(ptt, Action::Ptt { down: true }));

		let mode: Action =
			serde_json::from_str(r#"{"type":"setTransmit","mode":{"kind":"voice","thresholdDb":-40.0}}"#)
				.unwrap();
		assert!(matches!(mode, Action::SetTransmit { mode: TransmitConfig::Voice { .. } }));

		let devs: Action =
			serde_json::from_str(r#"{"type":"setAudioDevices","input":"Mic","output":null}"#).unwrap();
		assert!(matches!(devs, Action::SetAudioDevices { input: Some(_), output: None }));
	}
}
