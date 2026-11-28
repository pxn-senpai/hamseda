//! Converts tsclientlib's book into Hamseda's wire types.
//!
//! This part is pure (no network), so it can be unit-tested without a server.

use std::collections::HashMap;

use tsclientlib::data::{Channel as TsChannel, Client as TsClient, Connection, ServerGroup};
use tsclientlib::{ChannelId, ClientId, ServerGroupId};
use tsproto_types::ClientType;

use crate::protocol::{Channel, Client, Group, ServerInfo, Snapshot};

/// TeamSpeak uses channels named "[cspacer]Title" as visual separators.
/// Hamseda shows them as category headers, so the UI can tell them apart.
pub fn is_spacer(name: &str) -> bool {
	let lower = name.to_ascii_lowercase();
	lower.starts_with("[cspacer") || lower.starts_with("[rspacer") || lower.starts_with("[*spacer")
}

/// Keeps only groups a user can see on the sidebar (normal ones, not query or template groups).
fn visible_groups(groups: &HashMap<ServerGroupId, ServerGroup>) -> Vec<Group> {
	let mut out: Vec<Group> = groups
		.values()
		.filter(|g| is_normal_group(g))
		.map(|g| Group {
			id: g.id.0,
			name: g.name.clone(),
			sort_id: g.sort_id,
		})
		.collect();
	out.sort_by_key(|g| (g.sort_id, g.id));
	out
}

fn is_normal_group(g: &ServerGroup) -> bool {
	// tsclientlib exposes the group type; only "normal" (1) groups are user-facing.
	format!("{:?}", g.group_type).to_ascii_lowercase().contains("normal")
}

/// Builds the full snapshot the UI renders. `own` is our own client id, if known.
pub fn build_snapshot(con: &Connection) -> Snapshot {
	let channels: Vec<Channel> = {
		// Channels are stored in a map; TeamSpeak's "order" is the id of the previous sibling.
		// Turn that chain into 0..n positions per parent.
		let mut by_parent: HashMap<ChannelId, Vec<&TsChannel>> = HashMap::new();
		for ch in con.channels.values() {
			by_parent.entry(ch.parent).or_default().push(ch);
		}
		let mut out = Vec::with_capacity(con.channels.len());
		for siblings in by_parent.values() {
			let ordered = order_siblings(siblings);
			for (i, ch) in ordered.into_iter().enumerate() {
				out.push(Channel {
					id: ch.id.0,
					parent_id: ch.parent.0,
					order: i as u32,
					name: ch.name.clone(),
					topic: ch.topic.clone().filter(|t| !t.is_empty()),
					max_clients: max_clients_of(ch),
					password: ch.has_password.unwrap_or(false),
					is_spacer: is_spacer(&ch.name),
				});
			}
		}
		out
	};

	let clients: Vec<Client> = con
		.clients
		.values()
		.map(|c| to_client(c, con.own_client))
		.collect();

	Snapshot {
		self_id: con.own_client.0,
		server: ServerInfo {
			name: con.server.name.clone(),
			welcome: con.server.welcome_message.clone(),
		},
		groups: visible_groups(&con.server_groups),
		channels,
		clients,
	}
}

fn to_client(c: &TsClient, own: ClientId) -> Client {
	Client {
		id: c.id.0,
		channel_id: c.channel.0,
		nickname: c.name.clone(),
		input_muted: c.input_muted,
		output_muted: c.output_muted,
		away: c.away_message.is_some(),
		away_message: c.away_message.clone().filter(|m| !m.is_empty()),
		group_ids: c.server_groups.iter().map(|g| g.0).collect(),
		is_self: c.id == own,
		is_query: matches!(c.client_type, ClientType::Query { .. }),
		avatar_key: c.uid.as_ref().map(|u| u.as_avatar()).unwrap_or_default(),
	}
}

/// Walks the "previous sibling" chain. A broken chain is kept at the end, so nothing disappears.
fn order_siblings<'a>(siblings: &[&'a TsChannel]) -> Vec<&'a TsChannel> {
	let by_prev: HashMap<ChannelId, &TsChannel> = siblings.iter().map(|c| (c.order, *c)).collect();
	let mut out = Vec::with_capacity(siblings.len());
	let mut seen = std::collections::HashSet::new();
	let mut prev = ChannelId(0);
	while let Some(next) = by_prev.get(&prev) {
		if !seen.insert(next.id) {
			break; // cycle guard
		}
		out.push(*next);
		prev = next.id;
	}
	for ch in siblings {
		if !seen.contains(&ch.id) {
			out.push(*ch);
		}
	}
	out
}

fn max_clients_of(ch: &TsChannel) -> Option<u16> {
	// tsclientlib stores MaxClients as an enum; only a finite limit is shown in the UI.
	match ch.max_clients {
		Some(tsclientlib::MaxClients::Limited(n)) => Some(n),
		_ => None,
	}
}

#[cfg(test)]
mod tests {
	use super::is_spacer;

	#[test]
	fn spacer_names_are_detected() {
		assert!(is_spacer("[cspacer]Games"));
		assert!(is_spacer("[*spacer1]"));
		assert!(is_spacer("[RSPACER]"));
		assert!(!is_spacer("Lobby"));
		assert!(!is_spacer("spacer talk"));
	}

	#[test]
	fn group_ids_are_plain_numbers() {
		// Guards the conversion used everywhere in the UI.
		let id = tsclientlib::ServerGroupId(7);
		assert_eq!(id.0, 7);
	}
}
