import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Headphones,
  Loader2,
  Lock,
  MicOff,
  MoonStar,
  MoreVertical,
  Volume2,
} from 'lucide-react';
import { useSettings } from '../settings';
import { buildRows } from '../lib/tree';
import type { Client, ServerState } from '../types';
import { Avatar } from './Avatar';

interface Props {
  server: ServerState;
  selectedChannelId: number | null;
  onSelectChannel: (id: number) => void;
  onJoinChannel: (id: number) => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

export function ChannelPane({
  server,
  selectedChannelId,
  onSelectChannel,
  onJoinChannel,
  onReconnect,
  onDisconnect,
  onEdit,
  onRemove,
}: Props) {
  const { t } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const snap = server.snapshot;

  const rows = useMemo(() => (snap ? buildRows(snap.channels) : []), [snap]);
  const clientsByChannel = useMemo(() => {
    const map = new Map<number, Client[]>();
    for (const c of snap?.clients ?? []) {
      const list = map.get(c.channelId) ?? [];
      list.push(c);
      map.set(c.channelId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.nickname.localeCompare(b.nickname));
    return map;
  }, [snap]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const message = server.message === 'bridge-down' ? t('bridgeDown') : server.message;

  return (
    <section className="pane">
      <header className="pane-head">
        <div className="pane-title">
          <strong>{snap?.server.name ?? server.config.name}</strong>
          <small dir="ltr">
            {server.config.address}:{server.config.port}
          </small>
        </div>
        <div className="menu-wrap">
          <button
            className="icon-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t('serverMenu')}
            aria-expanded={menuOpen}
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <>
              <div className="menu-cover" onClick={() => setMenuOpen(false)} />
              <ul className="menu" role="menu" onClick={() => setMenuOpen(false)}>
                {server.status === 'connected' || server.status === 'connecting' ? (
                  <li role="menuitem" onClick={onDisconnect}>
                    {t('disconnect')}
                  </li>
                ) : (
                  <li role="menuitem" onClick={onReconnect}>
                    {t('reconnect')}
                  </li>
                )}
                <li role="menuitem" onClick={onEdit}>
                  {t('edit')}
                </li>
                <li role="menuitem" className="danger" onClick={onRemove}>
                  {t('remove')}
                </li>
              </ul>
            </>
          )}
        </div>
      </header>

      <div className="pane-scroll">
        {server.status === 'connecting' && (
          <div className="state-box">
            <Loader2 className="spin" size={22} />
            <p>{t('connecting')}</p>
          </div>
        )}

        {server.status === 'error' && (
          <div className="state-box error">
            <AlertTriangle size={22} />
            <strong>{t('errorTitle')}</strong>
            <p dir="auto">{message}</p>
            <button className="btn small" onClick={onReconnect}>
              {t('reconnect')}
            </button>
          </div>
        )}

        {server.status === 'disconnected' && (
          <div className="state-box">
            <p>{t('disconnected')}</p>
            <button className="btn small primary" onClick={onReconnect}>
              {t('connect')}
            </button>
          </div>
        )}

        {snap && server.status === 'connected' && rows.length === 0 && (
          <div className="state-box">
            <p>{t('emptyChannels')}</p>
          </div>
        )}

        {snap && server.status === 'connected' && (
          <ul className="channels">
            {rows.map((row) => {
              if (row.kind === 'category') {
                if (!row.label) return <li key={row.key} className="cat-line" />;
                const closed = collapsed.has(row.key);
                return (
                  <li key={row.key}>
                    <button
                      className={`cat${closed ? ' closed' : ''}`}
                      onClick={() => toggle(row.key)}
                      aria-expanded={!closed}
                      title={t('toggleCategory')}
                    >
                      <ChevronDown size={12} />
                      {row.label}
                    </button>
                  </li>
                );
              }

              if (row.category && collapsed.has(row.category)) return null;

              const ch = row.channel;
              const users = clientsByChannel.get(ch.id) ?? [];
              const hasSelf = users.some((u) => u.isSelf);
              return (
                <li key={row.key}>
                  <button
                    className={`channel${selectedChannelId === ch.id ? ' selected' : ''}${hasSelf ? ' joined' : ''}`}
                    style={{ paddingInlineStart: 10 + row.depth * 16 }}
                    onClick={() => onSelectChannel(ch.id)}
                    onDoubleClick={() => onJoinChannel(ch.id)}
                    title={ch.topic ? `${ch.topic} · ${t('joinHint')}` : t('joinHint')}
                  >
                    <Volume2 size={16} />
                    <span className="channel-name">{ch.name}</span>
                    {ch.password && <Lock size={12} />}
                    {ch.maxClients ? (
                      <small className="count">
                        {users.length}/{ch.maxClients}
                      </small>
                    ) : null}
                  </button>
                  {users.length > 0 && (
                    <ul className="channel-users" style={{ paddingInlineStart: 28 + row.depth * 16 }}>
                      {users.map((u) => (
                        <li key={u.id} className={u.away ? 'away' : ''}>
                          <Avatar name={u.nickname} size={22} talking={u.talking} dim={u.away} />
                          <span className="u-main">
                            <span className="u-name">{u.nickname}</span>
                            {u.inputMuted && <MicOff size={13} aria-label={t('mute')} />}
                            {u.outputMuted && <Headphones size={13} aria-label={t('deafen')} />}
                            {u.away && <MoonStar size={13} aria-label={t('away')} />}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
