//! Hamseda core: the layer that talks to a real TeamSpeak 3 server.
//!
//! It turns tsclientlib's book (channels, clients, server groups) into the same JSON
//! shapes that `docs/protocol.md` describes, so the React UI does not need to change
//! when the Node bridge is replaced by this crate.

pub mod audio;
pub mod identity;
pub mod protocol;
pub mod snapshot;
pub mod session;
