import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useSettings } from '../settings';
import type { Client, ServerState } from '../types';
import { Avatar } from './Avatar';

interface Props {
  server: ServerState;
  selectedId: number | null;
  onOpen: (clientId: number) => void;
  /** How many messages in this chat are not read yet. */
  unreadOf: (clientId: number) => number;
}

/** Private conversations with other people: search, last message and unread count. */
export function PrivateChats({ server, selectedId, onOpen, unreadOf }: Props) {
  const { t } = useSettings();
  const [query, setQuery] = useState('');

  const chats = useMemo(
    () =>
      Object.entries(server.privateMessages ?? {})
        .filter(([, list]) => list.length > 0)
        .map(([id, list]) => {
          const clientId = Number(id);
          const last = list[list.length - 1];
          const live = server.snapshot?.clients.find((c: Client) => c.id === clientId);
          return {
            clientId,
            name: live?.nickname ?? last.from.nickname,
            preview: last.text,
            ts: last.ts,
          };
        })
        .sort((a, b) => b.ts - a.ts),
    [server],
  );

  const shown = chats.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  if (chats.length === 0) return null;

  return (
    <section className="pm-list" aria-label={t('privateChats')}>
      <label className="pm-search">
        <Search size={14} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchChats')}
        />
      </label>
      <ul>
        {shown.map((c) => {
          const unread = unreadOf(c.clientId);
          return (
            <li key={c.clientId}>
              <button
                type="button"
                className={`pm-item${selectedId === c.clientId ? ' selected' : ''}`}
                onClick={() => onOpen(c.clientId)}
              >
                <Avatar name={c.name} size={36} />
                <span className="pm-text">
                  <span className="pm-name">{c.name}</span>
                  <span className="pm-preview">{c.preview}</span>
                </span>
                {unread > 0 && <b className="pm-unread">{unread}</b>}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="pm-none">{t('noSearchResults')}</li>}
      </ul>
    </section>
  );
}
