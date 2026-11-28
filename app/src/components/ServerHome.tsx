import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Copy, ImagePlus, MessageCircle, MoreVertical, Plus, Search, Settings, Sparkles, X } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { useSettings } from '../settings';
import type { UserStatus } from '../settings';
import type { ServerConfig, ServerState } from '../types';
import { Avatar } from './Avatar';
import { CHANGELOG } from '../lib/changelog';
import { loadProfile, saveProfile, readPicture } from '../lib/profile';
import type { Profile } from '../lib/profile';

type Filter = 'all' | 'online' | 'offline';

interface Props {
  servers: ServerState[];
  onOpen: (id: string) => void;
  onConnect: (server: ServerState) => void;
  onAdd: () => void;
  onEdit: (config: ServerConfig) => void;
  onRemove: (id: string) => void;
  nickname: string;
  onSettings: () => void;
  onRename: (name: string) => void;
  onOpenPrivate: () => void;
  pmUnread: number;
  /** Our own picture changed (undefined = removed). */
  onPictureChange: (picture?: string) => void;
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

/** Shown once after the app is updated: the new version and what changed. */
function UpdateBanner() {
  const { t, lang } = useSettings();
  const [version, setVersion] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    getVersion()
      .then((v) => {
        setVersion(v);
        let seen: string | null = null;
        try {
          seen = localStorage.getItem('hamseda.seenVersion');
        } catch {
          seen = null;
        }
        if (seen !== v) setShow(true);
      })
      .catch(() => setVersion(''));
  }, []);

  if (!show || !version) return null;
  const notes = CHANGELOG[version]?.[lang === 'fa' ? 'fa' : 'en'] ?? [];

  const dismiss = () => {
    try {
      localStorage.setItem('hamseda.seenVersion', version);
    } catch {
      /* storage blocked: the banner may show again next time */
    }
    setShow(false);
  };

  return (
    <section className="srv-welcome">
      <div className="srv-welcome-icon">
        <Sparkles size={22} />
      </div>
      <div className="srv-welcome-body">
        <h2>
          {t('updWelcome')} <span dir="ltr">{version}</span>
        </h2>
        {notes.length > 0 && (
          <ul>
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="btn small primary" onClick={dismiss}>
        {t('updGot')}
      </button>
    </section>
  );
}

/** Full profile page: status, voice mode, copy name and settings. */
function ProfilePage({
  nickname,
  onRename,
  onPictureChange,
  onBack,
  onSettings,
}: {
  nickname: string;
  onRename: (name: string) => void;
  onPictureChange: (picture?: string) => void;
  onBack: () => void;
  onSettings: () => void;
}) {
  const { t, status, setStatus } = useSettings();
  const [copied, setCopied] = useState(false);
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [draftName, setDraftName] = useState(nickname);
  const [picError, setPicError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bioLeft = 160 - profile.bio.length;

  const updateProfile = (next: Profile) => {
    setProfile(next);
    saveProfile(next);
  };
  const saveName = () => {
    const name = draftName.trim();
    if (!name || name === nickname) {
      setDraftName(nickname);
      return;
    }
    onRename(name);
  };
  const pickPicture = async (file: File | undefined) => {
    if (!file) return;
    try {
      const picture = await readPicture(file);
      setPicError(false);
      updateProfile({ ...profile, picture });
      onPictureChange(picture);
    } catch {
      setPicError(true);
    }
  };
  const statuses: { id: UserStatus; label: string; color: string }[] = [
    { id: 'online', label: t('statusOnline'), color: '#38d39a' },
    { id: 'idle', label: t('statusIdle'), color: '#f5b84d' },
    { id: 'dnd', label: t('statusDnd'), color: '#ff6b68' },
    { id: 'invisible', label: t('statusInvisible'), color: '#9aa1b2' },
  ];
  const current = statuses.find((s) => s.id === status) ?? statuses[0];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(nickname);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <main className="srv-home srv-page">
      <header className="srv-page-head">
        <button type="button" className="srv-back" onClick={onBack}>
          <ArrowRight size={16} /> {t('profileBack')}
        </button>
        <h1>{t('srvProfile')}</h1>
      </header>

      <section className="srv-profile-card">
        <div className="srv-profile-hero">
          <div className="srv-profile-avatar">
            <Avatar name={nickname} size={84} picture={profile.picture} />
            <span className="srv-profile-dot" style={{ background: current.color }} />
          </div>
          <div className="srv-profile-name">
            <strong>{nickname}</strong>
            <span>{current.label}</span>
          </div>
          <div className="srv-profile-tools">
            <button type="button" className="srv-tool" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={15} /> {t('profChoosePicture')}
            </button>
            {profile.picture && (
              <button
                type="button"
                className="srv-tool"
                onClick={() => {
                  updateProfile({ ...profile, picture: undefined });
                  onPictureChange(undefined);
                }}
              >
                <X size={15} /> {t('profRemovePicture')}
              </button>
            )}
            <button type="button" className="srv-tool" onClick={copy}>
              <Copy size={15} /> {copied ? t('copied') : t('copyName')}
            </button>
            <button type="button" className="srv-tool" onClick={onSettings}>
              <Settings size={15} /> {t('settings')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                pickPicture(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {picError && <small className="srv-field-error">{t('profPictureError')}</small>}
        </div>

        <div className="srv-profile-edit">
          <label className="srv-field">
            <span>{t('profName')}</span>
            <div className="srv-field-row">
              <input
                value={draftName}
                maxLength={30}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
              />
              <button type="button" className="btn small" onClick={saveName} disabled={draftName.trim() === nickname}>
                {t('save')}
              </button>
            </div>
          </label>

          <label className="srv-field">
            <span>
              {t('profBio')} <small>{bioLeft}</small>
            </span>
            <textarea
              value={profile.bio}
              maxLength={160}
              rows={3}
              onChange={(e) => updateProfile({ ...profile, bio: e.target.value })}
            />
          </label>

        </div>

        <div className="srv-profile-row">
          <span className="srv-profile-label">{t('status')}</span>
          <div className="srv-seg" role="radiogroup" aria-label={t('status')}>
            {statuses.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={status === s.id}
                className={status === s.id ? 'on' : ''}
                onClick={() => setStatus(s.id)}
              >
                <i className="srv-status-dot" style={{ background: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

      </section>
    </main>
  );
}

/** Home screen: the update notice, the list of saved servers and a link to your profile. */
export function ServerHome({
  servers,
  onOpen,
  onConnect,
  onAdd,
  onEdit,
  onRemove,
  nickname,
  onSettings,
  onRename,
  onOpenPrivate,
  pmUnread,
  onPictureChange,
}: Props) {
  const { t } = useSettings();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState<'home' | 'profile'>('home');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
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

  // A click anywhere else closes the card menu.
  useEffect(() => {
    if (!menuFor) return;
    const close = () => {
      setMenuFor(null);
      setConfirmFor(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuFor]);

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

  if (page === 'profile') {
    return (
      <ProfilePage
        nickname={nickname}
        onRename={onRename}
        onPictureChange={onPictureChange}
        onBack={() => setPage('home')}
        onSettings={onSettings}
      />
    );
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('srvAll') },
    { id: 'online', label: t('srvOnline') },
    { id: 'offline', label: t('srvOffline') },
  ];

  return (
    <main className="srv-home">
      <UpdateBanner />

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
          <div className="srv-title-actions">
            <button type="button" className="srv-profile-btn" onClick={() => setPage('profile')}>
              <Avatar name={nickname} size={30} />
              <span>{t('srvProfile')}</span>
            </button>
            <button type="button" className="srv-icon-btn" onClick={onOpenPrivate} aria-label={t('privateChats')} title={t('privateChats')}>
              <MessageCircle size={17} />
              {pmUnread > 0 && <span className="srv-icon-badge">{pmUnread}</span>}
            </button>
            <button type="button" className="srv-icon-btn" onClick={onSettings} aria-label={t('settings')} title={t('settings')}>
              <Settings size={17} />
            </button>
            <button type="button" className="srv-add-btn" onClick={onAdd}>
              <Plus size={16} /> {t('addServer')}
            </button>
          </div>
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
          const open = menuFor === s.config.id;
          return (
            <div
              key={s.config.id}
              className="srv-card"
              style={{ ['--c' as string]: tone, ['--grad' as string]: gradientFor(s.config.id) }}
            >
              <button
                type="button"
                className="srv-more"
                aria-label={t('srvMenu')}
                aria-expanded={open}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmFor(null);
                  setMenuFor(open ? null : s.config.id);
                }}
              >
                <MoreVertical size={14} />
              </button>
              {open && (
                <ul className="srv-menu" role="menu" onMouseDown={(e) => e.stopPropagation()}>
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuFor(null);
                        onEdit(s.config);
                      }}
                    >
                      {t('srvEdit')}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className="danger"
                      onClick={() => {
                        if (confirmFor !== s.config.id) {
                          setConfirmFor(s.config.id);
                          return;
                        }
                        setMenuFor(null);
                        setConfirmFor(null);
                        onRemove(s.config.id);
                      }}
                    >
                      {confirmFor === s.config.id ? t('srvRemoveConfirm') : t('srvRemove')}
                    </button>
                  </li>
                </ul>
              )}

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

        {servers.length === 0 && (
          <section className="srv-empty">
            <div className="srv-empty-icon">
              <Plus size={26} />
            </div>
            <h2>{t('srvEmptyTitle')}</h2>
            <p>{t('srvEmptyText')}</p>
            <button type="button" className="srv-add-btn" onClick={onAdd}>
              <Plus size={16} /> {t('addServer')}
            </button>
          </section>
        )}

        {servers.length > 0 && (
        <button type="button" className="srv-card srv-add-card" onClick={onAdd}>
          <span className="srv-plus">
            <Plus size={22} />
          </span>
          <span>{t('srvAddNew')}</span>
        </button>
        )}
      </div>
    </main>
  );
}
