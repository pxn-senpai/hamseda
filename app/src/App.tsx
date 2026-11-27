import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, MessageCircle, PlugZap } from 'lucide-react';
import { IS_DESKTOP, useBridge } from './bridge';
import { useSettings } from './settings';
import type { ServerConfig } from './types';
import { ServerRail } from './components/ServerRail';
import type { DmItem } from './components/ServerRail';
import { ServerHome } from './components/ServerHome';
import { ChannelPane } from './components/ChannelPane';
import { ChatArea } from './components/ChatArea';
import { PrivateChats } from './components/PrivateChats';
import type { ServerState } from './types';

/** Name shown for a private conversation: the live nickname, else the last sender's name. */
function personName(server: ServerState, id: number): string {
  const live = server.snapshot?.clients.find((c) => c.id === id);
  const last = server.privateMessages?.[id]?.at(-1);
  return live?.nickname ?? last?.from.nickname ?? '';
}
import { MemberList } from './components/MemberList';
import { UserPanel } from './components/UserPanel';
import { ConnectDialog } from './components/ConnectDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { useVoiceSounds } from './useVoiceSounds';
import { playMention } from './sounds';
import { QuickSwitch } from './components/QuickSwitch';
import { Splash } from './components/Splash';
import { mentions } from './components/ChatArea';
import type { ChatMessage } from './types';

type Dialog = { kind: 'connect'; editing?: ServerConfig } | { kind: 'settings' } | null;

export function App() {
  const { t, transmit, audioInput, audioOutput } = useSettings();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const { servers, bridgeUp, connect, disconnect, upsert, remove, send, notePrivate } = useBridge(showToast);
  useVoiceSounds(servers);
  // The private conversation on screen (a client id), or null for the channel.
  const [pmWith, setPmWith] = useState<number | null>(null);
  const [pmPage, setPmPage] = useState(false);
  // Last time each private chat was read, keyed "server:person". Stored per browser.
  const [pmSeen, setPmSeen] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('hamseda.pmSeen') ?? '{}');
    } catch {
      return {};
    }
  });
  const markSeen = useCallback((key: string, ts: number) => {
    setPmSeen((prev) => {
      if ((prev[key] ?? 0) >= ts) return prev;
      const next = { ...prev, [key]: ts };
      try {
        localStorage.setItem('hamseda.pmSeen', JSON.stringify(next));
      } catch {
        /* storage blocked: unread marks reset on restart */
      }
      return next;
    });
  }, []);
  const [quickOpen, setQuickOpen] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Record<string, number>>({});
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showSplash, setShowSplash] = useState(true);

  const list = useMemo(() => Object.values(servers), [servers]);
  const active = activeId ? servers[activeId] : undefined;
  // Switching servers clears the open private chat, except when the bar opens one.
  const keepPmWith = useRef(false);
  useEffect(() => {
    if (keepPmWith.current) {
      keepPmWith.current = false;
      return;
    }
    setPmWith(null);
  }, [activeId]);
  const snap = active?.snapshot;
  const self = snap?.clients.find((c) => c.isSelf);

  // If the active server was removed, go back home.
  useEffect(() => {
    if (activeId && !servers[activeId]) setActiveId(null);
  }, [activeId, servers]);

  // Which channel the chat shows: the one you clicked, else the one you are in, else the first room.
  const channelId = useMemo(() => {
    if (!active || !snap) return null;
    const picked = selectedChannel[active.config.id];
    if (picked && snap.channels.some((c) => c.id === picked)) return picked;
    if (self && snap.channels.some((c) => c.id === self.channelId)) return self.channelId;
    return snap.channels.find((c) => !c.isSpacer)?.id ?? null;
  }, [active, snap, selectedChannel, self]);
  const channel = snap?.channels.find((c) => c.id === channelId) ?? null;

  // Demo and real desktop connections accept actions; the browser's ServerQuery view is read-only.
  const readOnly = !IS_DESKTOP && active?.config.mode === 'serverquery';
  const canInteract = active?.status === 'connected' && !readOnly;

  const toggleMic = useCallback(() => {
    if (!active || !self) return;
    send({ type: 'setSelfState', connId: active.config.id, inputMuted: !self.inputMuted });
  }, [active, self, send]);

  const toggleDeaf = useCallback(() => {
    if (!active || !self) return;
    // Deafen also mutes the microphone, like Discord and TeamSpeak.
    const next = !self.outputMuted;
    send({
      type: 'setSelfState',
      connId: active.config.id,
      outputMuted: next,
      ...(next ? { inputMuted: true } : {}),
    });
  }, [active, self, send]);

  // Keyboard shortcuts: Ctrl+Shift+M mute, Ctrl+Shift+D deafen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMic();
      } else if (e.code === 'KeyD') {
        e.preventDefault();
        toggleDeaf();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleMic, toggleDeaf]);

  // Ctrl+K: jump to a room or a person.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // New mentions and private messages: a sound, and a desktop notification when the window is not focused.
  // The first pass only marks what is already there, so connecting does not ring for old messages.
  useEffect(() => {
    const fresh: { title: string; body: string }[] = [];
    for (const s of Object.values(servers)) {
      const selfId = s.snapshot?.selfId ?? -1;
      const me = s.snapshot?.clients.find((c) => c.isSelf)?.nickname ?? s.config.nickname;
      const scan = (list: ChatMessage[] | undefined, pm: boolean) => {
        for (const m of list ?? []) {
          const key = `${s.config.id}|${pm ? 'p' : 'c'}|${m.id}`;
          if (seenRef.current.has(key)) continue;
          seenRef.current.add(key);
          if (!primedRef.current || m.from.id === selfId) continue;
          if (pm || mentions(m.text, me)) fresh.push({ title: m.from.nickname, body: m.text });
        }
      };
      for (const list of Object.values(s.messages)) scan(list, false);
      for (const list of Object.values(s.privateMessages ?? {})) scan(list, true);
    }
    if (primedRef.current && fresh.length > 0) {
      playMention();
      if (!document.hasFocus() && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          for (const n of fresh.slice(0, 3)) new Notification(n.title, { body: n.body });
        } else if (Notification.permission === 'default') {
          void Notification.requestPermission();
        }
      }
    }
    primedRef.current = true;
  }, [servers]);

  // Desktop connections only: the core handles the microphone and the input mode.
  const liveDesktopId =
    IS_DESKTOP && active?.status === 'connected' && active.config.mode !== 'demo'
      ? active.config.id
      : null;

  // Send the input mode to the live connection, on connect and whenever the setting changes.
  useEffect(() => {
    if (!liveDesktopId) return;
    send({
      type: 'setTransmit',
      connId: liveDesktopId,
      mode: transmit === 'ptt' ? { kind: 'ptt' } : { kind: 'voice', thresholdDb: -45 },
    });
  }, [liveDesktopId, transmit, send]);

  // Microphone and speaker choice, sent on connect and whenever it changes.
  useEffect(() => {
    if (!liveDesktopId) return;
    send({
      type: 'setAudioDevices',
      connId: liveDesktopId,
      input: audioInput || null,
      output: audioOutput || null,
    });
  }, [liveDesktopId, audioInput, audioOutput, send]);

  // Push-to-talk: hold V to send voice while the input mode is push-to-talk.
  useEffect(() => {
    if (!liveDesktopId || transmit !== 'ptt') return;
    const setDown = (down: boolean) => send({ type: 'ptt', connId: liveDesktopId, down });
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyV' || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      setDown(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyV') setDown(false);
    };
    const onBlur = () => setDown(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      setDown(false);
    };
  }, [liveDesktopId, transmit, send]);

  const submitConfig = (config: ServerConfig) => {
    upsert(config);
    setDialog(null);
    setActiveId(config.id);
    connect(config);
  };

  const selfChannelName = snap?.channels.find((c) => c.id === self?.channelId)?.name;

  // Leave the server: disconnect, play the exit animation, then return to the home screen.
  const [leaving, setLeaving] = useState(false);
  const leaveServer = (server: ServerState) => {
    setLeaving(true);
    setTimeout(() => {
      disconnect(server.config.id);
      setActiveId(null);
      setLeaving(false);
    }, 320);
  };

  // Private chats across all servers, newest first, with unread counts.
  const dms: DmItem[] = useMemo(
    () =>
      list
        .flatMap((server) => {
          const selfId = server.snapshot?.selfId ?? -1;
          return Object.entries(server.privateMessages ?? {})
            .filter(([, msgs]) => msgs.length > 0)
            .map(([id, msgs]) => {
              const clientId = Number(id);
              const last = msgs[msgs.length - 1];
              const key = `${server.config.id}:${clientId}`;
              const seen = pmSeen[key] ?? 0;
              const live = server.snapshot?.clients.find((c) => c.id === clientId);
              return {
                key,
                connId: server.config.id,
                clientId,
                name: live?.nickname ?? last.from.nickname,
                unread: msgs.filter((m) => m.from.id !== selfId && m.ts > seen).length,
                last: last.ts,
              };
            });
        })
        .sort((a, b) => b.last - a.last)
        .map(({ last: _last, ...rest }) => rest),
    [list, pmSeen],
  );

  // Opening a private chat from the bar: switch to its server and show the page.
  const openDm = (connId: string, clientId: number) => {
    if (connId !== activeId) keepPmWith.current = true;
    setActiveId(connId);
    setPmWith(clientId);
    setPmPage(true);
    const msgs = servers[connId]?.privateMessages?.[clientId] ?? [];
    if (msgs.length > 0) markSeen(`${connId}:${clientId}`, msgs[msgs.length - 1].ts);
  };

  // While a private chat is open, anything new in it counts as read.
  useEffect(() => {
    if (!active || !pmPage || pmWith === null) return;
    const msgs = active.privateMessages?.[pmWith] ?? [];
    if (msgs.length > 0) markSeen(`${active.config.id}:${pmWith}`, msgs[msgs.length - 1].ts);
  }, [active, pmPage, pmWith, markSeen]);

  const pmCount = active
    ? Object.values(active.privateMessages ?? {}).filter((l) => l.length > 0).length
    : 0;

  if (showSplash) return <Splash onDone={() => setShowSplash(false)} />;

  return (
    <div className="app">
      {!bridgeUp && (
        <div className="banner" role="alert">
          <PlugZap size={16} />
          <strong>{t('bridgeDown')}</strong>
          <span>{t('bridgeDownHelp')}</span>
        </div>
      )}

      <div className={`shell${leaving ? ' leaving' : ''}`}>
        <ServerRail
          servers={list}
          activeId={activeId}
          onSelect={(id) => {
            setPmPage(false);
            setActiveId(id);
          }}
          onAdd={() => setDialog({ kind: 'connect' })}
          dms={dms}
          onOpenDm={openDm}
        />

        {!active && (
          <ServerHome
            servers={list}
            onOpen={(id) => setActiveId(id)}
            onConnect={(s) => connect(s.config)}
            onAdd={() => setDialog({ kind: 'connect' })}
            nickname={list[0]?.config.nickname ?? 'Guest'}
            onSettings={() => setDialog({ kind: 'settings' })}
            onEdit={(config) => setDialog({ kind: 'connect', editing: config })}
            onRemove={(id) => remove(id)}
            onRename={(name) => {
              // The new name is saved on every server and used the next time we connect.
              list.forEach((srv) => upsert({ ...srv.config, nickname: name }));
              showToast(t('profRenamed'));
            }}
          />
        )}

        {active && pmPage && (
          <main className="pm-page">
            <header className="srv-page-head">
              <button
                type="button"
                className="srv-back"
                onClick={() => {
                  setPmPage(false);
                  setPmWith(null);
                }}
              >
                <ArrowRight size={16} /> {t('profileBack')}
              </button>
              <h1>{t('privateChats')}</h1>
            </header>
            <div className="pm-body">
              <div className="pm-side">
                <PrivateChats server={active} selectedId={pmWith} onOpen={(id) => setPmWith(id)} />
                {pmCount === 0 && <p className="pm-empty">{t('noPrivate')}</p>}
              </div>
              {pmWith !== null ? (
                <ChatArea
                  channel={null}
                  selfName={self?.nickname ?? active.config.nickname}
                  privateWith={personName(active, pmWith)}
                  messages={active.privateMessages?.[pmWith] ?? []}
                  selfId={snap?.selfId ?? 0}
                  canSend={canInteract}
                  onSend={(text) => {
                    send({ type: 'sendPrivate', connId: active.config.id, clientId: pmWith, text });
                    notePrivate(active.config.id, pmWith, text);
                  }}
                />
              ) : (
                <div className="pm-placeholder">{t('pickPrivate')}</div>
              )}
            </div>
          </main>
        )}

        {active && !pmPage && (
          <>
            <div className="left-col">
              <button type="button" className="pm-open" onClick={() => setPmPage(true)}>
                <MessageCircle size={16} />
                <span>{t('privateChats')}</span>
                {pmCount > 0 && <b>{pmCount}</b>}
              </button>
              <ChannelPane
              server={active}
              selectedChannelId={channelId}
              onSelectChannel={(id) => {
                setPmWith(null);
                setSelectedChannel((s) => ({ ...s, [active.config.id]: id }));
              }}
              onJoinChannel={(id) => {
                setSelectedChannel((s) => ({ ...s, [active.config.id]: id }));
                if (canInteract) send({ type: 'joinChannel', connId: active.config.id, channelId: id });
              }}
              onReconnect={() => connect(active.config)}
              onDisconnect={() => disconnect(active.config.id)}
              onEdit={() => setDialog({ kind: 'connect', editing: active.config })}
              onRemove={() => remove(active.config.id)}
              />
              <UserPanel
                nickname={active.config.nickname}
                self={active.status === 'connected' ? self : undefined}
                channelName={active.status === 'connected' ? selfChannelName : undefined}
                onToggleMic={toggleMic}
                onToggleDeaf={toggleDeaf}
                onSettings={() => setDialog({ kind: 'settings' })}
                onLeave={
                  active.status === 'connected' || active.status === 'connecting'
                    ? () => leaveServer(active)
                    : undefined
                }
              />
            </div>

            <ChatArea
              channel={pmWith !== null ? null : channel}
              selfName={self?.nickname ?? active.config.nickname}
              privateWith={pmWith !== null ? personName(active, pmWith) : undefined}
              messages={
                pmWith !== null
                  ? active.privateMessages?.[pmWith] ?? []
                  : channelId
                    ? active.messages[channelId] ?? []
                    : []
              }
              selfId={snap?.selfId ?? 0}
              canSend={canInteract}
              onSend={(text) => {
                if (pmWith !== null) {
                  send({ type: 'sendPrivate', connId: active.config.id, clientId: pmWith, text });
                  notePrivate(active.config.id, pmWith, text);
                } else if (channelId) {
                  send({ type: 'sendMessage', connId: active.config.id, channelId, text });
                }
              }}
            />

            {quickOpen && snap && (
              <QuickSwitch
                channels={snap.channels}
                clients={snap.clients.filter((c) => !c.isSelf)}
                onChannel={(id) => {
                  setPmWith(null);
                  setSelectedChannel((s) => ({ ...s, [active.config.id]: id }));
                }}
                onUser={(id) => setPmWith(id)}
                onClose={() => setQuickOpen(false)}
              />
            )}
            {snap && <MemberList
                clients={snap.clients}
                groups={snap.groups}
                channels={snap.channels}
                privateMessages={active.privateMessages}
                onMessage={(id) => setPmWith(id)}
                onJoinChannel={(id) => {
                  if (canInteract) send({ type: 'joinChannel', connId: active.config.id, channelId: id });
                }}
              />}
          </>
        )}
      </div>

      {dialog?.kind === 'connect' && (
        <ConnectDialog
          key={dialog.editing?.id ?? 'new'}
          initial={dialog.editing}
          onSubmit={submitConfig}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}

      {toast && (
        <div className="toast" role="status" dir="auto">
          {toast}
        </div>
      )}
    </div>
  );
}
