// ServerQuery mode: connects to the admin interface of a TeamSpeak 3 server
// (TCP 10011 by default) and reads channels and users.
//
// IMPORTANT: this is NOT a real TeamSpeak client. It cannot carry voice, and it
// usually needs a ServerQuery login from the server admin. It is only here so you
// can see real channels and users in the UI during stage 1.
// Stage 2 replaces it with a real client (Rust + tsclientlib) that needs only
// address, password and nickname.

import { TeamSpeak, QueryProtocol } from 'ts3-nodejs-library';

const SPACER_RE = /^\[(?:c|r|\*)?spacer\d*\]/i;

export function createQuerySession(opts, send) {
  const { connId } = opts;
  const query = opts.query ?? {};
  let ts = null;
  let closed = false;
  let refreshTimer = null;
  let periodicTimer = null;

  const status = (state, message, code) =>
    send({ type: 'status', connId, state, message, code });

  status('connecting');

  (async () => {
    try {
      ts = await TeamSpeak.connect({
        host: opts.address,
        protocol: query.protocol === 'ssh' ? QueryProtocol.SSH : QueryProtocol.RAW,
        queryport: query.port ?? (query.protocol === 'ssh' ? 10022 : 10011),
        serverport: opts.port,
        username: query.username || undefined,
        password: query.password || undefined,
        nickname: opts.nickname,
        ignoreQueries: true,
        readyTimeout: 10000,
      });
      if (closed) {
        ts.quit().catch(() => {});
        return;
      }

      ts.on('close', () => {
        if (!closed) status('disconnected', 'The server closed the connection');
      });
      ts.on('error', (err) => {
        if (!closed) status('error', friendly(err));
      });
      for (const ev of [
        'clientconnect',
        'clientdisconnect',
        'clientmoved',
        'channelcreate',
        'channeledit',
        'channeldelete',
        'channelmoved',
        'serveredit',
      ]) {
        ts.on(ev, scheduleRefresh);
      }

      // Events need permission; if one is refused we still work, just via polling.
      await ts.registerEvent('server').catch(() => {});
      await ts.registerEvent('channel', '0').catch(() => {});

      status('connected');
      await refresh();
      periodicTimer = setInterval(refresh, 15000);
    } catch (err) {
      if (!closed) status('error', friendly(err), err?.code);
    }
  })();

  function scheduleRefresh() {
    if (closed || refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh();
    }, 250);
  }

  async function refresh() {
    if (closed || !ts) return;
    try {
      const [channelList, clientList] = await Promise.all([ts.channelList(), ts.clientList()]);
      const groupList = await ts.serverGroupList().catch(() => []);
      const info = await ts.serverInfo().catch(() => null);
      if (closed) return;

      send({
        type: 'snapshot',
        connId,
        selfId: 0, // a query connection is not a visible user
        server: {
          name: info?.virtualserverName || opts.address,
          welcome: info?.virtualserverWelcomemessage || '',
        },
        groups: groupList
          .filter((g) => g.type === 1) // 1 = normal groups (not templates or query groups)
          .map((g) => ({ id: Number(g.sgid), name: g.name, sortId: Number(g.sortid) })),
        channels: toChannels(channelList),
        clients: clientList.map((c) => ({
          id: Number(c.clid),
          channelId: Number(c.cid),
          nickname: c.nickname,
          away: Boolean(c.away),
          awayMessage: c.awayMessage || undefined,
          inputMuted: Boolean(c.inputMuted),
          outputMuted: Boolean(c.outputMuted),
          groupIds: (c.servergroups ?? []).map(Number),
        })),
      });
    } catch (err) {
      status('error', friendly(err), err?.code);
    }
  }

  return {
    handle(msg) {
      // A query connection can only look. Tell the UI instead of silently ignoring it.
      send({
        type: 'notice',
        connId,
        code: 'read-only',
        message: `"${msg.type}" is not available in ServerQuery mode (view only).`,
      });
    },
    close() {
      closed = true;
      clearTimeout(refreshTimer);
      clearInterval(periodicTimer);
      if (ts) ts.quit().catch(() => {});
    },
  };
}

/**
 * TeamSpeak stores channel order as "this channel comes after channel X" (0 = first).
 * Turn that into a plain position number per parent so the UI can just sort.
 */
function toChannels(list) {
  const items = list.map((c) => ({
    id: Number(c.cid),
    parentId: Number(c.pid),
    after: Number(c.order),
    name: c.name,
    topic: c.topic || undefined,
    maxClients: c.maxclients > 0 ? c.maxclients : undefined,
    password: Boolean(c.flagPassword),
    isSpacer: SPACER_RE.test(c.name),
  }));

  const byParent = new Map();
  for (const it of items) {
    if (!byParent.has(it.parentId)) byParent.set(it.parentId, []);
    byParent.get(it.parentId).push(it);
  }

  const out = [];
  for (const siblings of byParent.values()) {
    const byPrev = new Map(siblings.map((s) => [s.after, s]));
    const ordered = [];
    const seen = new Set();
    let prev = 0;
    while (byPrev.has(prev) && !seen.has(prev)) {
      seen.add(prev);
      const next = byPrev.get(prev);
      ordered.push(next);
      prev = next.id;
    }
    for (const s of siblings) if (!ordered.includes(s)) ordered.push(s); // broken chain: keep them anyway
    ordered.forEach((s, i) => {
      const { after, ...rest } = s;
      out.push({ ...rest, order: i });
    });
  }
  return out;
}

function friendly(err) {
  const code = err?.code;
  if (code === 'ECONNREFUSED')
    return 'Connection refused. Check the address and the ServerQuery port (default 10011).';
  if (code === 'ETIMEDOUT' || /time ?out/i.test(err?.message ?? ''))
    return 'Timed out. The server or its ServerQuery port may be blocked by a firewall.';
  if (code === 'ENOTFOUND') return 'Address not found. Check the spelling of the server address.';
  return err?.message || String(err);
}
