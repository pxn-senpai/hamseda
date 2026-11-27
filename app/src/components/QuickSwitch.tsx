import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Hash, User } from 'lucide-react';
import { useSettings } from '../settings';
import type { Channel, Client } from '../types';

type Item = { kind: 'channel'; id: number; label: string } | { kind: 'user'; id: number; label: string };

interface Props {
  channels: Channel[];
  /** People other than you. */
  clients: Client[];
  onChannel: (id: number) => void;
  onUser: (id: number) => void;
  onClose: () => void;
}

/** Ctrl+K: type a room or a person's name and press Enter to go there. */
export function QuickSwitch({ channels, clients, onChannel, onUser, onClose }: Props) {
  const { t } = useSettings();
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const all: Item[] = [
      ...channels.filter((c) => !c.isSpacer).map((c) => ({ kind: 'channel' as const, id: c.id, label: c.name })),
      ...clients.map((c) => ({ kind: 'user' as const, id: c.id, label: c.nickname })),
    ];
    return all.filter((i) => !needle || i.label.toLowerCase().includes(needle)).slice(0, 30);
  }, [q, channels, clients]);

  useEffect(() => setIndex(0), [q]);

  const pick = (item?: Item) => {
    if (!item) return;
    if (item.kind === 'channel') onChannel(item.id);
    else onUser(item.id);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      pick(items[index]);
    }
  };

  return (
    <div className="quick-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="quick-box" role="dialog" aria-label={t('quickSwitch')}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('quickPlaceholder')}
          aria-label={t('quickSwitch')}
        />
        <ul className="quick-list">
          {items.map((item, i) => (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                className={`quick-item${i === index ? ' on' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => pick(item)}
              >
                {item.kind === 'channel' ? <Hash size={15} /> : <User size={15} />}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="quick-none">{t('noSearchResults')}</li>}
        </ul>
      </div>
    </div>
  );
}
