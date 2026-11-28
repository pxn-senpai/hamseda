import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { BridgeEvent, ServerConfig, ServerState, ChatMessage } from './types';
import { createDemoSession } from '../../bridge/src/demo.mjs';
import type { DemoSession } from '../../bridge/src/demo.mjs';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL ?? 'ws://127.0.0.1:8787';
/** True inside the desktop app (Tauri). In a plain browser the Node bridge is used instead. */
export const IS_DESKTOP = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
/** Static demo build (GitHub Pages): no bridge, the demo servers run inside the page. */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';
const DESKTOP_EVENT = 'hamseda://event';
const STORAGE_KEY = 'hamseda.servers';

type Servers = Record<string, ServerState>;

type Action =
  | { type: 'privateSent'; connId: string; peerId: number; text: string }
  | { type: 'upsert'; config: ServerConfig }
  | { type: 'remove'; id: string }
  | { type: 'bridgeDown' }
  | { type: 'event'; event: BridgeEvent };

function reducer(state: Servers, action: Action): Servers {
  switch (action.type) {
    case 'privateSent': {
      // Our own private message: the server does not echo it back, so the UI adds it.
      const s = state[action.connId];
      if (!s) return state;
      const me = s.snapshot?.clients.find((c) => c.isSelf);
      const message = {
        id: `${Date.now()}-${Math.random()}`,
        from: { id: me?.id ?? 0, nickname: me?.nickname ?? '' },
        text: action.text,
        ts: Date.now(),
      };
      const list = s.privateMessages?.[action.peerId] ?? [];
      return {
        ...state,
        [action.connId]: {
          ...s,
          privateMessages: { ...(s.privateMessages ?? {}), [action.peerId]: [...list, message].slice(-200) },
        },
      };
    }
    case 'upsert': {
      const old = state[action.config.id];
      return {
        ...state,
        [action.config.id]: old
          ? { ...old, config: action.config }
          : { config: action.config, status: 'disconnected', messages: {} },
      };
    }
    case 'remove': {
      const next = { ...state };
      delete next[action.id];
      return next;
    }
    case 'bridgeDown': {
      const next: Servers = {};
      for (const [id, s] of Object.entries(state)) {
        const wasLive = s.status === 'connecting' || s.status === 'connected';
        next[id] = wasLive ? { ...s, status: 'disconnected', message: undefined } : s;
      }
      return next;
    }
    case 'event': {
      const ev = action.event;
      const s = state[ev.connId];
      if (!s) return state;
      switch (ev.type) {
        case 'status':
          return {
            ...state,
            [ev.connId]: {
              ...s,
              status: ev.state,
              message: ev.message,
              // a fresh connection starts with a clean slate
              ...(ev.state === 'connecting' ? { snapshot: undefined, messages: {}, avatars: {} } : {}),
            },
          };
        case 'snapshot': {
          const { type: _t, connId: _c, ...snapshot } = ev;
          return { ...state, [ev.connId]: { ...s, snapshot } };
        }
        case 'clientPatch': {
          if (!s.snapshot) return state;
          return {
            ...state,
            [ev.connId]: {
              ...s,
              snapshot: {
                ...s.snapshot,
                clients: s.snapshot.clients.map((c) =>
                  c.id === ev.clientId ? { ...c, ...ev.changes } : c,
                ),
              },
            },
          };
        }
        case 'message': {
          if (ev.pmWith !== undefined) {
            const pm = s.privateMessages?.[ev.pmWith] ?? [];
            return {
              ...state,
              [ev.connId]: {
                ...s,
                privateMessages: { ...(s.privateMessages ?? {}), [ev.pmWith]: [...pm, ev.message].slice(-200) },
              },
            };
          }
          const list = s.messages[ev.channelId] ?? [];
          return {
            ...state,
            [ev.connId]: {
              ...s,
              messages: { ...s.messages, [ev.channelId]: [...list, ev.message].slice(-200) },
            },
          };
        }
        case 'avatar':
          return {
            ...state,
            [ev.connId]: { ...s, avatars: { ...(s.avatars ?? {}), [ev.clientId]: ev.dataUrl } },
          };
        case 'notice':
          return state; // shown as a toast by the caller
      }
    }
  }
}

/** Bookmarks live in localStorage. Passwords are only kept when the user asked for it. */
function loadBookmarks(): Servers {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const list = JSON.parse(raw) as ServerConfig[];
    const out: Servers = {};
    for (const config of list)
      out[config.id] = { config, status: 'disconnected', messages: {}, privateMessages: loadPrivate(config.id) };
    return out;
  } catch {
    return {};
  }
}

const pmKey = (id: string) => `hamseda.pm.${id}`;

/** Private messages are kept on this computer, the last 200 per server. */
function loadPrivate(id: string): Record<number, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(pmKey(id));
    return raw ? (JSON.parse(raw) as Record<number, ChatMessage[]>) : {};
  } catch {
    return {};
  }
}

function savePrivate(id: string, data: Record<number, ChatMessage[]> | undefined) {
  try {
    const trimmed: Record<number, ChatMessage[]> = {};
    for (const [peer, list] of Object.entries(data ?? {})) trimmed[Number(peer)] = list.slice(-200);
    localStorage.setItem(pmKey(id), JSON.stringify(trimmed));
  } catch {
    /* storage blocked: private messages just will not persist */
  }
}

function saveBookmarks(servers: Servers) {
  try {
    const list = Object.values(servers).map(({ config }) => {
      const keep = config.rememberPassword;
      return {
        ...config,
        password: keep ? config.password : undefined,
        query: { ...config.query, password: keep ? config.query.password : undefined },
      };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked: bookmarks just will not persist */
  }
}

export interface AudioDevices {
inputs: string[];
outputs: string[];
}

/** Lists microphones and speakers (desktop only; empty in the browser). */
export async function listAudioDevices(): Promise<AudioDevices> {
if (!IS_DESKTOP) return { inputs: [], outputs: [] };
try {
  return await invoke<AudioDevices>('list_audio_devices');
} catch {
  return { inputs: [], outputs: [] };
}
}

export function useBridge(onNotice: (message: string) => void) {
  const [servers, dispatch] = useReducer(reducer, undefined, loadBookmarks);
  const [bridgeUp, setBridgeUp] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  useEffect(() => saveBookmarks(servers), [servers]);
  useEffect(() => {
    for (const s of Object.values(servers)) savePrivate(s.config.id, s.privateMessages);
  }, [servers]);

  // Desktop app: events come from the Rust core. Browser: a WebSocket to the Node bridge.
  useEffect(() => {
    if (IS_DESKTOP) {
      let unlisten: (() => void) | undefined;
      let stopped = false;
      setBridgeUp(true);
      listen<BridgeEvent>(DESKTOP_EVENT, (e) => {
        if (e.payload.type === 'notice') noticeRef.current(e.payload.message);
        dispatch({ type: 'event', event: e.payload });
      }).then((off) => {
        if (stopped) off();
        else unlisten = off;
      });
      return () => {
        stopped = true;
        unlisten?.();
      };
    }

    if (STATIC_DEMO) {
      setBridgeUp(true);
      return;
    }

    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      const ws = new WebSocket(BRIDGE_URL);
      wsRef.current = ws;
      ws.onopen = () => setBridgeUp(true);
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data as string) as BridgeEvent;
          if (event.type === 'notice') noticeRef.current(event.message);
          dispatch({ type: 'event', event });
        } catch {
          /* ignore garbage */
        }
      };
      ws.onclose = () => {
        setBridgeUp(false);
        dispatch({ type: 'bridgeDown' });
        if (!stopped) retry = setTimeout(open, 2000);
      };
    };
    open();

    return () => {
      stopped = true;
      clearTimeout(retry);
      const ws = wsRef.current;
      if (!ws) return;
      ws.onclose = null;
      // Closing a socket that is still connecting logs a browser warning (StrictMode mounts twice),
      // so wait for it to open and close it then.
      if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close();
      else ws.close();
    };
  }, []);

/** Desktop: turns the UI's messages into core actions. Browser: sends JSON over the WebSocket. */
  const send = useCallback((msg: Record<string, unknown>) => {
    if (IS_DESKTOP) {
      const action = toCoreAction(msg);
      if (!action) return false;
      invoke('send_action', { connId: msg.connId, action }).catch((err: unknown) =>
        noticeRef.current(String(err)),
      );
      return true;
    }
    if (STATIC_DEMO) return staticSend(msg);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  // Static demo: the same message flow as the Node bridge, but inside the page.
  const demoRef = useRef<Map<string, DemoSession>>(new Map());
  const staticSend = useCallback((msg: Record<string, unknown>) => {
    const emit = (event: Record<string, unknown>) => {
      const typed = event as unknown as BridgeEvent;
      if (typed.type === 'notice') noticeRef.current(typed.message);
      dispatch({ type: 'event', event: typed });
    };
    const connId = String(msg.connId ?? '');
    if (msg.type === 'connect') {
      if (msg.mode !== 'demo') {
        emit({ type: 'status', connId, state: 'error', message: 'desktop-unsupported' });
        return true;
      }
      demoRef.current.get(connId)?.close();
      emit({ type: 'status', connId, state: 'connecting' });
      const session = createDemoSession(msg, emit);
      demoRef.current.set(connId, session);
      return true;
    }
    if (msg.type === 'disconnect') {
      demoRef.current.get(connId)?.close();
      demoRef.current.delete(connId);
      emit({ type: 'status', connId, state: 'disconnected' });
      return true;
    }
    const session = demoRef.current.get(connId);
    if (!session) return false;
    session.handle(msg);
    return true;
  }, []);

  const connect = useCallback(
    (config: ServerConfig) => {
      if (IS_DESKTOP) {
        if (config.mode === 'demo' || !config.address) {
          dispatch({
            type: 'event',
            event: {
              type: 'status',
              connId: config.id,
              state: 'error',
              message: 'desktop-unsupported',
            },
          });
          return;
        }
        invoke('connect_server', {
          connId: config.id,
          address: config.address,
          port: config.port,
          nickname: config.nickname,
          password: config.password || null,
        }).catch((err: unknown) => {
          dispatch({
            type: 'event',
            event: { type: 'status', connId: config.id, state: 'error', message: String(err) },
          });
        });
        return;
      }
      const ok = send({
        type: 'connect',
        connId: config.id,
        mode: config.mode,
        address: config.address,
        port: config.port,
        nickname: config.nickname,
        password: config.password,
        query: config.query,
      });
      if (!ok) {
        dispatch({
          type: 'event',
          event: { type: 'status', connId: config.id, state: 'error', message: 'bridge-down' },
        });
      }
    },
    [send],
  );

  const disconnect = useCallback(
    (id: string) => {
      send({ type: 'disconnect', connId: id });
    },
    [send],
  );

  const upsert = useCallback((config: ServerConfig) => dispatch({ type: 'upsert', config }), []);

  const remove = useCallback(
    (id: string) => {
      send({ type: 'disconnect', connId: id });
      dispatch({ type: 'remove', id });
    },
    [send],
  );

  const notePrivate = useCallback(
    (connId: string, peerId: number, text: string) =>
      dispatch({ type: 'privateSent', connId, peerId, text }),
    [],
  );

  return { servers, bridgeUp, connect, disconnect, upsert, remove, send, notePrivate };
}

/**
 * Maps the UI's messages (the same ones the Node bridge understands) to actions of the
 * Rust core. Returns null for messages the desktop core does not support yet.
 */
function toCoreAction(msg: Record<string, unknown>): Record<string, unknown> | null {
  switch (msg.type) {
    case 'disconnect':
      return { type: 'disconnect' };
    case 'joinChannel':
      return { type: 'join', channelId: msg.channelId };
    case 'setSelfState':
      return {
        type: 'setMuted',
        inputMuted: msg.inputMuted ?? null,
        outputMuted: msg.outputMuted ?? null,
      };
    case 'ptt':
      return { type: 'ptt', down: msg.down };
    case 'setAudioDevices':
      return { type: 'setAudioDevices', input: msg.input ?? null, output: msg.output ?? null };
    case 'setTransmit':
      return { type: 'setTransmit', mode: msg.mode };
    case 'sendPrivate':
      return { type: 'chat', target: { kind: 'client', clientId: msg.clientId }, text: msg.text };
    case 'setAvatar':
      return { type: 'setAvatar', data: msg.data };
    case 'sendMessage':
      // The core sends to the channel we are in; a channel id from another channel is not supported yet.
      return { type: 'chat', target: { kind: 'channel' }, text: msg.text };
    default:
      return null;
  }
}
