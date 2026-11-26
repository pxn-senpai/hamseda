import { useMemo, useState } from 'react';
import { Headphones, MicOff, MoonStar } from 'lucide-react';
import { useSettings } from '../settings';
import { roleColor } from '../lib/util';
import type { Channel, Client, Group } from '../types';
import { Avatar } from './Avatar';
import { ProfileCard } from './ProfileCard';

interface Props {
  clients: Client[];
  groups: Group[];
  channels: Channel[];
}

interface Section {
  key: string;
  title: string;
  members: { client: Client; color?: string }[];
}

/** Server query clients and the names the user marked as music bots. */
function isBot(c: Client, botNames: string[]): boolean {
  if (c.isQuery) return true;
  const nick = c.nickname.trim().toLowerCase();
  return botNames.some((n) => n.trim().toLowerCase() === nick);
}

export function MemberList({ clients, groups, channels }: Props) {
  const { t, botNames } = useSettings();
  const [open, setOpen] = useState<{ client: Client; anchor: DOMRect } | null>(null);

  const sections = useMemo<Section[]>(() => {
    const sorted = [...groups].sort((a, b) => a.sortId - b.sortId);
    const rank = new Map(sorted.map((g, i) => [g.id, i]));

    // Each person is listed once, under their most important role (like Discord's "hoisted" roles).
    const buckets = new Map<number | 'none', Section>();
    const people = clients.filter((c) => !isBot(c, botNames));
    const bots = clients.filter((c) => isBot(c, botNames));
    for (const client of people) {
      const best = client.groupIds
        .filter((id) => rank.has(id))
        .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))[0];
      const group = sorted.find((g) => g.id === best);
      const key = group ? group.id : 'none';
      if (!buckets.has(key)) {
        buckets.set(key, { key: String(key), title: group ? group.name : t('online'), members: [] });
      }
      buckets.get(key)!.members.push({ client, color: roleColor(group, sorted) });
    }

    const list = [...buckets.entries()]
      .sort(([a], [b]) => {
        if (a === 'none') return 1;
        if (b === 'none') return -1;
        return (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
      })
      .map(([, s]) => s);
    for (const s of list) s.members.sort((a, b) => a.client.nickname.localeCompare(b.client.nickname));
    // Bots go in their own section at the bottom.
    if (bots.length > 0) {
      list.push({
        key: 'bots',
        title: t('botsLabel'),
        members: bots
          .sort((a, b) => a.nickname.localeCompare(b.nickname))
          .map((client) => ({ client })),
      });
    }
    return list;
  }, [clients, groups, botNames, t]);

  const channelName = (id: number) => channels.find((c) => c.id === id)?.name ?? '';

  return (
    <aside className="members" aria-label={t('members')}>
      {sections.map((s) => (
        <section key={s.key}>
          <h4>
            {s.title} <span>{s.members.length}</span>
          </h4>
          <ul>
            {s.members.map(({ client: c, color }) => (
              <li key={c.id} className={c.away ? 'away' : ''}>
                <button
                  type="button"
                  className="member-row"
                  aria-haspopup="dialog"
                  onClick={(e) => setOpen({ client: c, anchor: e.currentTarget.getBoundingClientRect() })}
                >
                  <Avatar name={c.nickname} size={32} talking={c.talking} dim={c.away} />
                  <span className="m-main">
                    <span className="m-name" style={color ? { color } : undefined}>
                      {c.nickname}
                    </span>
                    {c.inputMuted && <MicOff size={14} aria-label={t('mute')} />}
                    {c.outputMuted && <Headphones size={14} aria-label={t('deafen')} />}
                    {c.away && <MoonStar size={14} aria-label={t('away')} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {open && (
        <ProfileCard
          client={open.client}
          channelName={channelName(open.client.channelId)}
          isBot={isBot(open.client, botNames)}
          anchor={open.anchor}
          onClose={() => setOpen(null)}
        />
      )}
    </aside>
  );
}
