import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useSettings } from '../settings';
import type { ServerState } from '../types';

type Filter = 'all' | 'online' | 'offline';

interface Props {
  servers: ServerState[];
  onOpen: (id: string) => void;
  onConnect: (server: ServerState) => void;
  onAdd: () => void;
}

/** Colour of the status ring and the status dot. */
function toneOf(status: ServerState['status']): string {
  if (status === 'connected') return '#38d39a';
  if (status === 'connecting') return '#6d8dff';
  if (status === 'error') return '#ff6b68';
  return '#f5b84d';
}

/** A stable gradient per server, so each icon keeps its colours. */
const GRADIENTS = [
  'linear-gradient(135deg,#6d8dff,#4f7cff)',
  'linear-gradient(135deg,#38d39a,#1fa67a)',
  'linear-gradient(135deg,#9b6bff,#6d8dff)',
  'linear-gradient(135deg,#f5b84d,#e0892b)',
  'linear-gradient(135deg,#ff6b68,#d9485a)',
  'linear-gradient(135deg,#4fc3f7,#2a8fd6)',
];

function gradientFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

/** Home screen with no server open: all bookmarked servers in a grid of square cards. */
export function ServerHome({ servers, onOpen, onConnect, onAdd }: Props) {
  const { t } = useSettings();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl+K puts the cursor in the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const connectedCount = servers.filter((s) => s.status === 'connected').length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return servers.filter((s) => {
      if (filter === 'online' && s.status !== 'connected') return false;
      if (filter === 'offline' && s.status === 'connected') return false;
      if (!q) return true;
      return s.config.name.toLowerCase().includes(q) || s.config.address.toLowerCase().includes(q);
    });
  }, [servers, query, filter]);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('srvAll') },
    { id: 'online', label: t('srvOnline') },
    { id: 'offline', label: t('srvOffline') },
  ];

  return (
    <main className="srv-home">
      <header className="srv-top">
        <div className="srv-title">
          <div>
            <div className="srv-eyebrow">{t('srvMy')}</div>
            <h1>
              {servers.length} {t('srvServers')}
            </h1>
            <div className="srv-sub">
              {connectedCount} {t('srvConnectedCount')}
            </div>
          </div>
          <button type="button" className="srv-add-btn" onClick={onAdd}>
            <Plus size={16} /> {t('addServer')}
          </button>
        </div>

        <div className="srv-tools">
          <label className="srv-search">
            <Search size={15} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('srvSearch')}
              aria-label={t('srvSearch')}
            />
            <kbd dir="ltr">Ctrl K</kbd>
          </label>
          <div className="srv-seg" role="radiogroup" aria-label={t('srvMy')}>
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={filter === f.id}
                className={filter === f.id ? 'on' : ''}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="srv-grid">
        {shown.map((s) => {
          const tone = toneOf(s.status);
          return (
            <div
              key={s.config.id}
              className="srv-card"
              style={{ ['--c' as string]: tone, ['--grad' as string]: gradientFor(s.config.id) }}
            >
              <div className="srv-avatar-wrap">
                <div className="srv-avatar">{s.config.name.trim().charAt(0) || '?'}</div>
                <span className="srv-dot" />
              </div>
              <div className="srv-name" title={s.config.name}>
                {s.config.name}
              </div>
              <span className="srv-status">
                <i />
                {s.status === 'connected'
                  ? t('srvStateOn')
                  : s.status === 'connecting'
                    ? t('srvStateWait')
                    : s.status === 'error'
                      ? t('srvStateErr')
                      : t('srvStateOff')}
              </span>
              {s.status === 'connected' && (
                <button type="button" className="srv-btn enter" onClick={() => onOpen(s.config.id)}>
                  {t('srvEnter')}
                </button>
              )}
              {s.status === 'connecting' && (
                <button type="button" className="srv-btn" disabled>
                  {t('connecting')}
                </button>
              )}
              {s.status === 'disconnected' && (
                <button
                  type="button"
                  className="srv-btn primary"
                  onClick={() => {
                    onConnect(s);
                    onOpen(s.config.id);
                  }}
                >
                  {t('connect')}
                </button>
              )}
              {s.status === 'error' && (
                <button
                  type="button"
                  className="srv-btn"
                  onClick={() => {
                    onConnect(s);
                    onOpen(s.config.id);
                  }}
                >
                  {t('reconnect')}
                </button>
              )}
            </div>
          );
        })}

        {shown.length === 0 && servers.length > 0 && <p className="srv-none">{t('srvNone')}</p>}

        <button type="button" className="srv-card srv-add-card" onClick={onAdd}>
          <span className="srv-plus">
            <Plus size={22} />
          </span>
          <span>{t('srvAddNew')}</span>
        </button>
      </div>
    </main>
  );
}
