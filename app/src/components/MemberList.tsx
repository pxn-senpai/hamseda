import { useMemo } from 'react';
import { Headphones, MicOff, MoonStar } from 'lucide-react';
import { useSettings } from '../settings';
import { roleColor } from '../lib/util';
import type { Client, Group } from '../types';
import { Avatar } from './Avatar';

interface Props {
  clients: Client[];
  groups: Group[];
}

/** Server query clients and the names the user marked as music bots. */
function isBot(c: Client, botNames: string[]): boolean {
  if (c.isQuery) return true;
  const nick = c.nickname.trim().toLowerCase();
  return botNames.some((n) => n.trim().toLowerCase() === nick);
}

interface Section {
  key: string;
  title: string;
  members: { client: Client; color?: string }[];
}

export function MemberList({ clients, groups }: Props) {
  const { t, botNames } = useSettings();

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
                <Avatar name={c.nickname} size={32} talking={c.talking} dim={c.away} />
                <span className="m-main">
                  <span className="m-name" style={color ? { color } : undefined}>
                    {c.nickname}
                  </span>
                  {c.inputMuted && <MicOff size={14} aria-label={t('mute')} />}
                  {c.outputMuted && <Headphones size={14} aria-label={t('deafen')} />}
                  {c.away && <MoonStar size={14} aria-label={t('away')} />}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
