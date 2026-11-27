import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useSettings } from '../settings';

const KEY_STORAGE = 'hamseda.gifKey';

interface GifResult {
  id: string;
  preview: string;
  url: string;
}

function readKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function saveKey(key: string) {
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    // Storage can be blocked; the key then lasts for this session only.
  }
}

interface Props {
  onPick: (url: string) => void;
  onClose: () => void;
}

/** Searches Giphy. The user brings a free API key; the GIF is sent as a link. */
export function GifPicker({ onPick, onClose }: Props) {
  const { t } = useSettings();
  const ref = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState(readKey);
  const [keyDraft, setKeyDraft] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle');

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Search as the user types, after a short pause.
  useEffect(() => {
    if (!key || !query.trim()) {
      setResults([]);
      setState('idle');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState('loading');
      try {
        const url = new URL('https://api.giphy.com/v1/gifs/search');
        url.searchParams.set('api_key', key);
        url.searchParams.set('q', query.trim());
        url.searchParams.set('limit', '24');
        url.searchParams.set('rating', 'pg');
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as {
          data: { id: string; images: { fixed_height_small: { url: string }; original: { url: string } } }[];
        };
        const list = json.data.map((g) => ({
          id: g.id,
          preview: g.images.fixed_height_small.url,
          url: g.images.original.url,
        }));
        setResults(list);
        setState(list.length ? 'idle' : 'empty');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setState('error');
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, query]);

  if (!key) {
    return (
      <div className="emoji-pop gif-pop" ref={ref} role="dialog" aria-label="GIF">
        <p className="gif-note">{t('gifNeedKey')}</p>
        <form
          className="gif-key"
          onSubmit={(e) => {
            e.preventDefault();
            const k = keyDraft.trim();
            if (!k) return;
            saveKey(k);
            setKey(k);
          }}
        >
          <input
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder={t('gifKeyPlaceholder')}
            dir="ltr"
            aria-label={t('gifKeyPlaceholder')}
          />
          <button type="submit" className="btn small primary" disabled={!keyDraft.trim()}>
            {t('gifKeySave')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="emoji-pop gif-pop" ref={ref} role="dialog" aria-label="GIF">
      <label className="gif-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('gifSearch')}
          autoFocus
        />
      </label>

      {state === 'loading' && <p className="gif-note">{t('gifLoading')}</p>}
      {state === 'error' && <p className="gif-note">{t('gifError')}</p>}
      {state === 'empty' && <p className="gif-note">{t('gifNoResults')}</p>}

      <div className="gif-grid">
        {results.map((g) => (
          <button key={g.id} type="button" className="gif-item" onClick={() => onPick(g.url)}>
            <img src={g.preview} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
