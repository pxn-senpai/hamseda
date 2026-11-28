//! Command-line probe: connects to a TeamSpeak 3 server and prints the channel tree.
//!
//! Usage:
//!   cargo run --bin hamseda-probe -- <address> <port> <nickname> [password]
//!
//! Example:
//!   cargo run --bin hamseda-probe -- 127.0.0.1 9987 Pxn
//!
//! Stops with Ctrl+C. Prints each snapshot as JSON on stdout, then a short tree on stderr.

use std::env;

use hamseda_core::protocol::{Event, Snapshot};
use hamseda_core::session::spawn_session;
use tokio::sync::mpsc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let args: Vec<String> = env::args().skip(1).collect();
	if args.len() < 3 {
		eprintln!("usage: hamseda-probe <address> <port> <nickname> [password]");
		std::process::exit(2);
	}
	let address = args[0].clone();
	let port: u16 = args[1].parse().map_err(|_| anyhow::anyhow!("port must be a number"))?;
	let nickname = args[2].clone();
	let password = args.get(3).cloned();

	let (tx, mut rx) = mpsc::unbounded_channel();
	// Keep the handle alive: dropping it would look like the UI went away.
	let session = spawn_session("probe".into(), address, port, nickname, password, tsclientlib::Identity::create(), tx);

	// AVATAR_FILE=<path>: upload this file as our avatar once connected (for testing).
	let avatar_file = env::var("AVATAR_FILE").ok();
	let mut avatar_sent = false;
	while let Some(event) = rx.recv().await {
		match event {
			Event::Status { state, message, .. } => {
				eprintln!("[status] {state:?} {}", message.unwrap_or_default());
			}
			Event::Snapshot { snapshot, .. } => {
				print_tree(&snapshot);
				if let (Some(path), false) = (&avatar_file, avatar_sent) {
					avatar_sent = true;
					let bytes = std::fs::read(path).expect("read AVATAR_FILE");
					let data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
					eprintln!("[probe] sending avatar, {} bytes", bytes.len());
					let _ = session.actions.send(hamseda_core::protocol::Action::SetAvatar { data });
				}
			}
			Event::Avatar { client_id, data_url, .. } => {
				eprintln!("[avatar] client {client_id}: {} chars, {}", data_url.len(), &data_url[..data_url.find(',').unwrap_or(0)]);
				if let Some(b64) = data_url.split(',').nth(1) {
					let _ = std::fs::write(format!("avatar-{client_id}.b64"), b64);
				}
			}
			Event::Notice { message, .. } => eprintln!("[notice] {message}"),
			Event::Message { channel_id, message, .. } => {
				eprintln!("[chat ch{channel_id}] {}: {}", message.from.nickname, message.text);
			}
		}
	}
	eprintln!("[probe] session ended");
	Ok(())
}

fn print_tree(snap: &Snapshot) {
	eprintln!("--- server: {} (self id {})", snap.server.name, snap.self_id);
	print_children(snap, 0, 0, "");
	eprintln!("---");
}

fn print_children(snap: &Snapshot, parent: u64, depth: usize, indent: &str) {
	let mut kids: Vec<_> = snap
		.channels
		.iter()
		.filter(|c| c.parent_id == parent)
		.collect();
	kids.sort_by_key(|c| c.order);
	for ch in kids {
		let label = if ch.is_spacer { "[category]" } else { "" };
		eprintln!("{indent}#{} {} {label}", ch.id, ch.name);
		for cl in snap.clients.iter().filter(|c| c.channel_id == ch.id) {
			let mut flags = Vec::new();
			if cl.input_muted {
				flags.push("mic-muted");
			}
			if cl.output_muted {
				flags.push("deaf");
			}
			if cl.away {
				flags.push("away");
			}
			let me = if cl.is_self { " (you)" } else { "" };
			eprintln!("{indent}  - {}{me} {}", cl.nickname, flags.join(" "));
		}
		print_children(snap, ch.id, depth + 1, &format!("{indent}  "));
	}
}
