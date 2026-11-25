//! Keeps one TeamSpeak identity per server. The server recognises a user by this key,
//! so reusing it keeps the same user, permissions and nickname across connections.

use std::path::Path;

use anyhow::{Context, Result};
use tsclientlib::Identity;

/// Loads the identity saved at `path`, or creates a new one and saves it there.
///
/// A file that cannot be read is moved aside (as `.bad`), and a new identity is made.
/// The file holds a private key, so it should stay in the user's own profile folder.
pub fn load_or_create(path: &Path) -> Result<Identity> {
	if let Ok(text) = std::fs::read_to_string(path) {
		if let Ok(identity) = serde_json::from_str::<Identity>(&text) {
			return Ok(identity);
		}
		let _ = std::fs::rename(path, path.with_extension("bad"));
	}
	let identity = Identity::create();
	if let Some(dir) = path.parent() {
		std::fs::create_dir_all(dir).context("could not create the identity folder")?;
	}
	let text = serde_json::to_string(&identity).context("could not encode the identity")?;
	std::fs::write(path, text).context("could not save the identity")?;
	Ok(identity)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn same_file_gives_the_same_identity() {
		let dir = std::env::temp_dir().join(format!("hamseda-id-test-{}", std::process::id()));
		let path = dir.join("id.json");
		let _ = std::fs::remove_file(&path);
		let first = load_or_create(&path).unwrap();
		let second = load_or_create(&path).unwrap();
		assert_eq!(first.counter(), second.counter());
		assert_eq!(
			serde_json::to_string(&first).unwrap(),
			serde_json::to_string(&second).unwrap()
		);
		let _ = std::fs::remove_dir_all(&dir);
	}
}
