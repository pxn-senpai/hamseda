// Hamseda bridge, stage 1.
//
// The UI (browser) cannot talk to TeamSpeak directly, so it talks to this small
// program over a WebSocket using the JSON messages described in docs/protocol.md.
// In stage 2 the same messages will come from a Rust core instead of this file,
// and the UI will not need to change.

import { WebSocketServer } from 'ws';
import { createDemoSession } from './demo.mjs';
import { createQuerySession } from './serverquery.mjs';

const PORT = Number(process.env.BRIDGE_PORT || 8787);

// Only pages served from these addresses may use the bridge. Without this check,
// any website you visit could open a WebSocket to localhost and drive the bridge.
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const wss = new WebSocketServer({
  port: PORT,
  host: '127.0.0.1',
  verifyClient: ({ origin }) => !origin || ALLOWED_ORIGINS.has(origin),
});

wss.on('listening', () => {
  console.log(`[bridge] listening on ws://127.0.0.1:${PORT}`);
  console.log(`[bridge] allowed origins: ${[...ALLOWED_ORIGINS].join(', ')}`);
});

wss.on('error', (err) => {
  console.error(`[bridge] cannot start: ${err.message}`);
  process.exit(1);
});

wss.on('connection', (ws) => {
  /** connId -> session. One UI window can hold several server connections at once. */
  const sessions = new Map();

  const send = (msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const closeSession = (connId) => {
    const s = sessions.get(connId);
    if (s) {
      sessions.delete(connId);
      try {
        s.close();
      } catch (err) {
        console.error('[bridge] close failed:', err);
      }
    }
  };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string' || typeof msg.connId !== 'string') return;
    const { connId } = msg;

    if (msg.type === 'connect') {
      const problem = validateConnect(msg);
      if (problem) {
        send({ type: 'status', connId, state: 'error', message: problem });
        return;
      }
      closeSession(connId);
      const session =
        msg.mode === 'serverquery'
          ? createQuerySession(msg, send)
          : createDemoSession(msg, send);
      sessions.set(connId, session);
      return;
    }

    if (msg.type === 'disconnect') {
      closeSession(connId);
      send({ type: 'status', connId, state: 'disconnected' });
      return;
    }

    // Everything else (joinChannel, sendMessage, setSelfState, ...) belongs to a session.
    const session = sessions.get(connId);
    if (session) session.handle(msg);
  });

  ws.on('close', () => {
    for (const connId of [...sessions.keys()]) closeSession(connId);
  });
});

function validateConnect(msg) {
  if (msg.mode !== 'demo' && msg.mode !== 'serverquery') return 'Unknown mode';
  if (typeof msg.address !== 'string' || !msg.address.trim() || msg.address.length > 255)
    return 'Invalid server address';
  if (!Number.isInteger(msg.port) || msg.port < 1 || msg.port > 65535) return 'Invalid port';
  if (typeof msg.nickname !== 'string' || !msg.nickname.trim() || msg.nickname.length > 30)
    return 'Invalid nickname';
  if (msg.mode === 'serverquery') {
    const q = msg.query ?? {};
    if (q.port !== undefined && (!Number.isInteger(q.port) || q.port < 1 || q.port > 65535))
      return 'Invalid query port';
  }
  return null;
}
