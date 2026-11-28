import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { dictionaries } from './i18n';
import { setSoundsEnabled } from './sounds';
import type { Key, Lang } from './i18n';

export type ThemeSetting = 'dark' | 'light' | 'system' | 'amoled' | 'ocean';
export type UserStatus = 'online' | 'idle' | 'dnd' | 'invisible';
export type TransmitSetting = 'voice' | 'ptt';

interface Settings {
  lang: Lang;
  theme: ThemeSetting;
  status: UserStatus;
  transmit: TransmitSetting;
  setTransmit: (m: TransmitSetting) => void;
  /** Device names; empty string means the system default. */
  audioInput: string;
  audioOutput: string;
  setAudioInput: (name: string) => void;
  setAudioOutput: (name: string) => void;
  /** Join and leave sounds on or off. */
  sounds: boolean;
  /** Nicknames of music bots (they connect like people, so they are listed here). */
  botNames: string[];
  setBotNames: (names: string[]) => void;
  setSounds: (on: boolean) => void;
  setLang: (l: Lang) => void;
  setTheme: (t: ThemeSetting) => void;
  setStatus: (s: UserStatus) => void;
  t: (key: Key) => string;
}

const Ctx = createContext<Settings | null>(null);

function load<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {
    /* storage can be blocked; fall back */
  }
  return fallback;
}

function loadText(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function loadList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => load('hamseda.lang', ['fa', 'en'], 'fa'));
  const [theme, setThemeState] = useState<ThemeSetting>(() =>
    load('hamseda.theme', ['dark', 'light', 'system', 'amoled', 'ocean'], 'dark'),
  );
  const [status, setStatusState] = useState<UserStatus>(() =>
    load('hamseda.status', ['online', 'idle', 'dnd', 'invisible'], 'online'),
  );
  const [transmit, setTransmitState] = useState<TransmitSetting>(() =>
    load('hamseda.transmit', ['voice', 'ptt'], 'voice'),
  );
  const [sounds, setSoundsState] = useState(() => load('hamseda.sounds', ['on', 'off'], 'on') === 'on');
  const [botNames, setBotNamesState] = useState<string[]>(() => loadList('hamseda.botNames'));
  const [audioInput, setAudioInputState] = useState(() => loadText('hamseda.audioInput'));
  const [audioOutput, setAudioOutputState] = useState(() => loadText('hamseda.audioOutput'));
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Language decides text direction: Persian is right-to-left.
  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.title = lang === 'fa' ? 'اوا | ava' : 'ava';
  }, [lang]);

  useEffect(() => {
    const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
    document.documentElement.dataset.theme = resolved;
  }, [theme, systemDark]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    save('hamseda.lang', l);
  }, []);
  const setTheme = useCallback((t: ThemeSetting) => {
    setThemeState(t);
    save('hamseda.theme', t);
  }, []);
  const setStatus = useCallback((s: UserStatus) => {
    setStatusState(s);
    save('hamseda.status', s);
  }, []);
  const setTransmit = useCallback((m: TransmitSetting) => {
    setTransmitState(m);
    save('hamseda.transmit', m);
  }, []);
  const setSounds = useCallback((on: boolean) => {
    setSoundsState(on);
    setSoundsEnabled(on);
    save('hamseda.sounds', on ? 'on' : 'off');
  }, []);
  useEffect(() => setSoundsEnabled(sounds), [sounds]);
  const setBotNames = useCallback((names: string[]) => {
    setBotNamesState(names);
    save('hamseda.botNames', JSON.stringify(names));
  }, []);
  const setAudioInput = useCallback((name: string) => {
    setAudioInputState(name);
    save('hamseda.audioInput', name);
  }, []);
  const setAudioOutput = useCallback((name: string) => {
    setAudioOutputState(name);
    save('hamseda.audioOutput', name);
  }, []);

  const value = useMemo<Settings>(
    () => ({
      lang,
      theme,
      status,
      transmit,
      setTransmit,
      audioInput,
      audioOutput,
      setAudioInput,
      setAudioOutput,
      sounds,
      setSounds,
      botNames,
      setBotNames,
      setLang,
      setTheme,
      setStatus,
      t: (key) => dictionaries[lang][key],
    }),
    [lang, theme, status, transmit, setTransmit, audioInput, audioOutput, setAudioInput, setAudioOutput, sounds, setSounds, botNames, setBotNames, setLang, setTheme, setStatus],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings must be used inside <SettingsProvider>');
  return v;
}
