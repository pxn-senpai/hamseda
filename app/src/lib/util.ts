import type { Group } from '../types';

/** Small stable number from a string, used to pick colors. */
export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** First visible letter of a name (works for Persian too). */
export function initial(name: string): string {
  const ch = Array.from(name.trim())[0];
  return ch ? ch.toUpperCase() : '?';
}

export function avatarColor(name: string): string {
  return `hsl(${hash(name) % 360} 55% 45%)`;
}

// TeamSpeak groups have no color, so Hamseda picks one locally by importance.
// (A backend could store real colors later; see the capability table.)
const ROLE_COLORS = ['#f0605d', '#f0b34a', '#3ccf91', '#5fb4f5', '#b58cf5', '#f58cc4'];

export function roleColor(group: Group | undefined, sortedGroups: Group[]): string | undefined {
  if (!group) return undefined;
  if (group.color) return group.color;
  const i = sortedGroups.findIndex((g) => g.id === group.id);
  return ROLE_COLORS[(i < 0 ? 0 : i) % ROLE_COLORS.length];
}

/** TeamSpeak spacer names look like "[cspacer]Title". Returns the visible title ('' for pure lines). */
export function spacerLabel(name: string): string {
  const label = name.replace(/^\[(?:c|r|\*)?spacer\d*\]/i, '').trim();
  return /^[\s\-_=.~*#]*$/.test(label) ? '' : label;
}

export function formatTime(ts: number, lang: string): string {
  return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(ts);
}

export function formatDay(ts: number, lang: string): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(ts);
}
