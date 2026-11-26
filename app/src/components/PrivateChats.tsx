import { MessageCircle } from 'lucide-react';
import { useSettings } from '../settings';
import type { Client, ServerState } from '../types';
import { Avatar } from './Avatar';

interface Props {
  server: ServerState;
  selectedId: number | null;
  onOpen: (clientId: number) => void;
}

/** Private conversations with other people, shown above the channel list. */
export function PrivateChats({ server, selectedId, onOpen }: Props) {
  const { t } = useSettings();
  const chats = Object.entries(server.privateMessages ?? {})
    .filter(([, list]) => list.length > 0)
    .map(([id, list]) => {
      const clientId = Number(id);
      const live = server.snapshot?.clients.find((c: Client) => c.id === clientId);
      const name = live?.nickname ?? list[list.length - 1].from.nickname;
      return { clientId, name };
    });

  if (chats.length === 0) return null;

  return (
    <section className="pm-list" aria-label={t('privateChats')}>
      <h4>
        <MessageCircle size={13} /> {t('privateChats')}
      </h4>
      <ul>
        {chats.map((c) => (
          <li key={c.clientId}>
            <button
              type="button"
              className={`pm-item${selectedId === c.clientId ? ' selected' : ''}`}
              onClick={() => onOpen(c.clientId)}
            >
              <Avatar name={c.name} size={22} />
              <span className="pm-name">{c.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
