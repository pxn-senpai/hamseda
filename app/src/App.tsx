import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, PlugZap } from 'lucide-react';
import { IS_DESKTOP, useBridge } from './bridge';
import { useSettings } from './settings';
import type { ServerConfig } from './types';
import { ServerRail } from './components/ServerRail';
import { ChannelPane } from './components/ChannelPane';
import { ChatArea } from './components/ChatArea';
import { MemberList } from './components/MemberList';
import { UserPanel } from './components/UserPanel';
import { ConnectDialog } from './components/ConnectDialog';
import { SettingsDialog } from './components/SettingsDialog';

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

  const { servers, bridgeUp, connect, disconnect, upsert, remove, send } = useBridge(showToast);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Record<string, number>>({});
  const [dialog, setDialog] = useState<Dialog>(null);

  const list = useMemo(() => Object.values(servers), [servers]);
  const active = activeId ? servers[activeId] : undefined;
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

  return (
    <div className="app">
      {!bridgeUp && (
        <div className="banner" role="alert">
          <PlugZap size={16} />
          <strong>{t('bridgeDown')}</strong>
          <span>{t('bridgeDownHelp')}</span>
        </div>
      )}

      <div className="shell">
        <ServerRail
          servers={list}
          activeId={activeId}
          onSelect={setActiveId}
          onAdd={() => setDialog({ kind: 'connect' })}
        />

        {!active && (
          <main className="welcome">
            <AudioLines size={56} />
            <h1>{t('welcomeTitle')}</h1>
            <p>{t('welcomeText')}</p>
            <div className="welcome-actions">
              <button
                className="btn primary"
                onClick={() => setDialog({ kind: 'connect' })}
              >
                {t('addServer')}
              </button>
              <button
                className="btn"
                onClick={() =>
                  submitConfig({
                    id: crypto.randomUUID(),
                    mode: 'demo',
                    name: 'Night Owls (demo)',
                    address: 'demo.local',
                    port: 9987,
                    nickname: 'Guest',
                    query: { port: 10011, protocol: 'raw' },
                  })
                }
              >
                {t('tryDemo')}
              </button>
            </div>
            <small className="stage-note">{t('stageNote')}</small>
            <div className="welcome-user">
              <UserPanel
                nickname="Guest"
                onToggleMic={() => {}}
                onToggleDeaf={() => {}}
                onSettings={() => setDialog({ kind: 'settings' })}
              />
            </div>
          </main>
        )}

        {active && (
          <>
            <div className="left-col">
              <ChannelPane
                server={active}
                selectedChannelId={channelId}
                onSelectChannel={(id) => setSelectedChannel((s) => ({ ...s, [active.config.id]: id }))}
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
                self={self}
                channelName={selfChannelName}
                onToggleMic={toggleMic}
                onToggleDeaf={toggleDeaf}
                onSettings={() => setDialog({ kind: 'settings' })}
              />
            </div>

            <ChatArea
              channel={channel}
              messages={channelId ? active.messages[channelId] ?? [] : []}
              selfId={snap?.selfId ?? 0}
              canSend={canInteract}
              onSend={(text) =>
                channelId &&
                send({ type: 'sendMessage', connId: active.config.id, channelId, text })
              }
            />

            {snap && <MemberList clients={snap.clients} groups={snap.groups} />}
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
