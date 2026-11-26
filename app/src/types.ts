// These types mirror the JSON messages in docs/protocol.md.
// Keep the two in sync: they are the contract between the UI and whatever sits behind it
// (the Node bridge in stage 1, a Rust core later).

export type ConnState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface Channel {
  id: number;
  parentId: number; // 0 = top level
  order: number; // position among siblings, 0 is first
  name: string;
  topic?: string;
  maxClients?: number;
  password?: boolean;
  isSpacer?: boolean; // TeamSpeak "[cspacer]Title" channels, shown as category headers
}

export interface Client {
  id: number;
  channelId: number;
  nickname: string;
  talking?: boolean;
  inputMuted?: boolean;
  outputMuted?: boolean;
  away?: boolean;
  awayMessage?: string;
  groupIds: number[];
  isSelf?: boolean;
  /** ServerQuery client: always shown with the bots. */
  isQuery?: boolean;
}

export interface Group {
  id: number;
  name: string;
  sortId: number; // lower = more important
  color?: string;
}

export interface Snapshot {
  selfId: number; // 0 when we are not a visible user (ServerQuery mode)
  server: { name: string; welcome?: string };
  groups: Group[];
  channels: Channel[];
  clients: Client[];
}

export interface ChatMessage {
  id: string;
  from: { id: number; nickname: string };
  text: string;
  ts: number;
}

/** demo: invented data. teamspeak: a real voice connection (desktop app). serverquery: read-only (browser). */
export type ConnectMode = 'demo' | 'serverquery' | 'teamspeak';

export interface ServerConfig {
  id: string;
  mode: ConnectMode;
  name: string; // label shown in the UI
  address: string;
  port: number; // TeamSpeak voice port, 9987 by default
  nickname: string;
  password?: string;
  rememberPassword?: boolean;
  query: {
    port: number; // ServerQuery port, 10011 by default
    protocol: 'raw' | 'ssh';
    username?: string;
    password?: string;
  };
}

export interface ServerState {
  config: ServerConfig;
  status: ConnState;
  message?: string;
  snapshot?: Snapshot;
  messages: Record<number, ChatMessage[]>; // by channel id
  /** Private conversations, by the other person's client id. */
  privateMessages?: Record<number, ChatMessage[]>;
}

/** Messages the bridge sends to the UI. */
export type BridgeEvent =
  | { type: 'status'; connId: string; state: ConnState; message?: string; code?: string }
  | ({ type: 'snapshot'; connId: string } & Snapshot)
  | { type: 'clientPatch'; connId: string; clientId: number; changes: Partial<Client> }
  | { type: 'message'; connId: string; channelId: number; pmWith?: number; message: ChatMessage }
  | { type: 'notice'; connId: string; code: string; message: string };
