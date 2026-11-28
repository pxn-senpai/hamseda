// Demo mode: fake servers so you can try the UI without any TeamSpeak server.
// Everything here is invented data. It also simulates people talking and chatting.

const DATASETS = [
  {
    name: 'Night Owls (demo)',
    welcome: 'Welcome to the demo server. Nothing here is real.',
    groups: [
      { id: 1, name: 'Admin', sortId: 1 },
      { id: 2, name: 'Moderator', sortId: 2 },
      { id: 3, name: 'Member', sortId: 3 },
    ],
    // order = position among siblings (0 is first). parentId 0 = top level.
    channels: [
      { id: 1, parentId: 0, order: 0, name: '[cspacer]Welcome', isSpacer: true },
      { id: 2, parentId: 0, order: 1, name: 'Lobby', topic: 'Say hi and pick a room' },
      { id: 3, parentId: 0, order: 2, name: 'Chill Zone', topic: 'Music and relaxed talk' },
      { id: 4, parentId: 0, order: 3, name: '[cspacer]Games', isSpacer: true },
      { id: 5, parentId: 0, order: 4, name: 'Strategy Room', maxClients: 6 },
      { id: 6, parentId: 0, order: 5, name: 'Raid Hub', topic: 'Pick a raid room below' },
      { id: 7, parentId: 6, order: 0, name: 'Raid 1' },
      { id: 8, parentId: 6, order: 1, name: 'Raid 2', password: true },
      { id: 9, parentId: 0, order: 6, name: '[cspacer]Away', isSpacer: true },
      { id: 10, parentId: 0, order: 7, name: 'AFK' },
    ],
    clients: [
      { id: 11, channelId: 2, nickname: 'Mira', avatarKey: 'demo-Mira', groupIds: [1] },
      { id: 12, channelId: 2, nickname: 'Kian', avatarKey: 'demo-Kian', groupIds: [2] },
      { id: 13, channelId: 3, nickname: 'Sara', avatarKey: 'demo-Sara', groupIds: [3] },
      { id: 14, channelId: 3, nickname: 'Dariush', avatarKey: 'demo-Dariush', groupIds: [3], inputMuted: true },
      { id: 15, channelId: 5, nickname: 'Nika', avatarKey: 'demo-Nika', groupIds: [3] },
      { id: 16, channelId: 5, nickname: 'Arman', avatarKey: 'demo-Arman', groupIds: [2], outputMuted: true },
      { id: 17, channelId: 7, nickname: 'Leila', avatarKey: 'demo-Leila', groupIds: [3] },
      { id: 18, channelId: 10, nickname: 'Bardia', avatarKey: 'demo-Bardia', groupIds: [3], away: true, awayMessage: 'brb' },
    ],
    chat: [
      { channelId: 2, from: 'Mira', text: 'Welcome everyone! Grab a room whenever you like.' },
      { channelId: 2, from: 'Kian', text: 'Raid starts at 21:00, voice in Raid 1.' },
      { channelId: 3, from: 'Sara', text: 'سلام! امشب کسی بازی می‌کنه؟' },
    ],
  },
  {
    name: 'Study Group (demo)',
    welcome: 'Quiet study rooms. Be kind.',
    groups: [
      { id: 1, name: 'Teacher', sortId: 1 },
      { id: 2, name: 'Student', sortId: 2 },
    ],
    channels: [
      { id: 1, parentId: 0, order: 0, name: 'Common Room', topic: 'Announcements and hellos' },
      { id: 2, parentId: 0, order: 1, name: '[cspacer]Study Rooms', isSpacer: true },
      { id: 3, parentId: 0, order: 2, name: 'Math' },
      { id: 4, parentId: 0, order: 3, name: 'Programming' },
      { id: 5, parentId: 0, order: 4, name: 'Languages', topic: 'English / فارسی / Deutsch' },
    ],
    clients: [
      { id: 11, channelId: 1, nickname: 'Ms. Rad', avatarKey: 'demo-Ms. Rad', groupIds: [1] },
      { id: 12, channelId: 4, nickname: 'Pouya', avatarKey: 'demo-Pouya', groupIds: [2] },
      { id: 13, channelId: 4, nickname: 'Ali', avatarKey: 'demo-Ali', groupIds: [2] },
      { id: 14, channelId: 5, nickname: 'Hana', avatarKey: 'demo-Hana', groupIds: [2], inputMuted: true },
    ],
    chat: [
      { channelId: 1, from: 'Ms. Rad', text: 'Homework is due on Sunday.' },
      { channelId: 4, from: 'Pouya', text: 'Does anyone know how to start with React?' },
    ],
  },
];

const SELF_ID = 1;

export function createDemoSession(opts, send) {
  const { connId } = opts;
  const dataset = DATASETS[Math.abs(hash(opts.address)) % DATASETS.length];
  const timers = new Set();
  let closed = false;
  let nextMessageId = 1;

  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!closed) fn();
    }, ms);
    timers.add(t);
    return t;
  };

  // Deep copy so two connections to the same demo do not share state.
  const state = {
    channels: dataset.channels.map((c) => ({ ...c })),
    clients: dataset.clients.map((c) => ({ ...c, talking: false })),
  };
  const firstRoom = state.channels.find((c) => !c.isSpacer && c.parentId === 0);
  const self = {
    id: SELF_ID,
    channelId: firstRoom.id,
    nickname: opts.nickname,
    groupIds: [],
    isSelf: true,
    inputMuted: false,
    outputMuted: false,
    talking: false,
  };
  state.clients.push(self);

  const status = (s, message) => send({ type: 'status', connId, state: s, message });

  const sendSnapshot = () =>
    send({
      type: 'snapshot',
      connId,
      selfId: SELF_ID,
      server: { name: dataset.name, welcome: dataset.welcome },
      groups: dataset.groups,
      channels: state.channels,
      clients: state.clients,
    });

  const patch = (clientId, changes) => {
    const c = state.clients.find((x) => x.id === clientId);
    if (!c) return;
    Object.assign(c, changes);
    send({ type: 'clientPatch', connId, clientId, changes });
  };

  const sendChat = (channelId, from, text) => {
    // `from` is either a nickname (for the scripted chat) or {id, nickname}.
    const sender =
      typeof from === 'string'
        ? { id: state.clients.find((c) => c.nickname === from)?.id ?? 0, nickname: from }
        : from;
    send({
      type: 'message',
      connId,
      channelId,
      message: {
        id: `${connId}-${nextMessageId++}`,
        from: sender,
        text,
        ts: Date.now(),
      },
    });
  };

  // Pretend the connection takes a moment, like a real one.
  status('connecting');
  later(() => {
    status('connected');
    sendSnapshot();
    dataset.chat.forEach((m, i) => {
      later(() => sendChat(m.channelId, m.from, m.text), 300 + i * 500);
    });
    simulateTalking();
  }, 700);

  function simulateTalking() {
    const tick = () => {
      const candidates = state.clients.filter((c) => !c.isSelf && !c.inputMuted && !c.away);
      if (candidates.length) {
        const c = candidates[Math.floor(Math.random() * candidates.length)];
        if (!c.talking) {
          patch(c.id, { talking: true });
          later(() => patch(c.id, { talking: false }), 1200 + Math.random() * 1800);
        }
      }
      later(tick, 1500 + Math.random() * 1500);
    };
    later(tick, 1500);
  }

  return {
    handle(msg) {
      if (msg.type === 'joinChannel') {
        const ch = state.channels.find((c) => c.id === msg.channelId && !c.isSpacer);
        if (!ch) return;
        if (ch.password) {
          send({
            type: 'notice',
            connId,
            code: 'channel-password',
            message: 'This channel needs a password (not supported in the demo).',
          });
          return;
        }
        patch(SELF_ID, { channelId: ch.id });
      } else if (msg.type === 'setSelfState') {
        const changes = {};
        if (typeof msg.inputMuted === 'boolean') changes.inputMuted = msg.inputMuted;
        if (typeof msg.outputMuted === 'boolean') changes.outputMuted = msg.outputMuted;
        if (Object.keys(changes).length) patch(SELF_ID, changes);
      } else if (msg.type === 'sendMessage') {
        const text = String(msg.text ?? '').slice(0, 1000);
        if (!text.trim()) return;
        sendChat(msg.channelId, { id: SELF_ID, nickname: self.nickname }, text);
      }
    },
    close() {
      closed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
