import type { Channel } from '../types';
import { spacerLabel } from './util';

export type Row =
  | { kind: 'category'; key: string; label: string }
  | { kind: 'channel'; key: string; channel: Channel; depth: number; category: string | null };

/**
 * Turns the flat TeamSpeak channel list into the rows a Discord-like sidebar shows.
 * - A spacer channel ("[cspacer]Title") becomes a category header.
 * - Every other channel is a room. Sub-channels are indented under their parent.
 */
export function buildRows(channels: Channel[]): Row[] {
  const byParent = new Map<number, Channel[]>();
  for (const c of channels) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);

  const rows: Row[] = [];
  let category: string | null = null;

  const walk = (list: Channel[], depth: number) => {
    for (const ch of list) {
      if (ch.isSpacer && depth === 0) {
        category = `cat-${ch.id}`;
        rows.push({ kind: 'category', key: category, label: spacerLabel(ch.name) });
        continue;
      }
      rows.push({ kind: 'channel', key: `ch-${ch.id}`, channel: ch, depth, category });
      walk(byParent.get(ch.id) ?? [], depth + 1);
    }
  };
  walk(byParent.get(0) ?? [], 0);
  return rows;
}
