import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Hash, SmilePlus, SendHorizontal } from 'lucide-react';
import { useSettings } from '../settings';
import { formatDay, formatTime } from '../lib/util';
import type { Channel, ChatMessage } from '../types';
import { Avatar } from './Avatar';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';

/** A message that is only a link to a GIF from Giphy is shown as the picture. */
function gifUrl(text: string): string | null {
  const t = text.trim();
  if (/\s/.test(t) || !t.startsWith('https://')) return null;
  try {
    const u = new URL(t);
    return /(^|\.)giphy\.com$/.test(u.hostname) && /\.gif$/i.test(u.pathname) ? u.href : null;
  } catch {
    return null;
  }
}

interface Props {
  channel: Channel | null;
  messages: ChatMessage[];
  selfId: number;
  canSend: boolean;
  onSend: (text: string) => void;
  /** Name of the person in a private conversation. When set, `channel` is null. */
  privateWith?: string;
}

export function ChatArea({ channel, messages, selfId, canSend, onSend, privateWith }: Props) {
  const { t, lang } = useSettings();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<'emoji' | 'gif' | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);

  // Put text where the cursor is, then move the cursor after it.
  const insertText = (text: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, channel?.id]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;
    onSend(text);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter makes a new line. Do not send while an IME is composing (Persian/Arabic keyboards).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  if (!channel && !privateWith) {
    return (
      <section className="chat">
        <div className="chat-empty">{t('noMessages')}</div>
      </section>
    );
  }

  return (
    <section className="chat">
      <header className="chat-head">
        {privateWith ? (
          <>
            <strong>{privateWith}</strong>
            <span className="topic">{t('privateMessage')}</span>
          </>
        ) : (
          <>
            <Hash size={20} />
            <strong>{channel?.name}</strong>
            {channel?.topic && <span className="topic" dir="auto">{channel.topic}</span>}
          </>
        )}
      </header>

      <div className="chat-scroll">
        <div className="chat-start">
          <h3>{privateWith ?? channel?.name}</h3>
          <p>{privateWith ? t('privateBeginning') : t('beginning')}</p>
        </div>

        {messages.length === 0 && <p className="chat-none">{t('noMessages')}</p>}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || formatDay(prev.ts, lang) !== formatDay(m.ts, lang);
          // Same sender within 5 minutes: show as a continuation without repeating the name.
          const grouped = !newDay && prev && prev.from.id === m.from.id && m.ts - prev.ts < 5 * 60_000;
          return (
            <div key={m.id}>
              {newDay && <div className="day-sep"><span>{formatDay(m.ts, lang)}</span></div>}
              <article className={`msg${grouped ? ' grouped' : ''}${m.from.id === selfId ? ' mine' : ''}`}>
                {grouped ? (
                  <time className="msg-time-side">{formatTime(m.ts, lang)}</time>
                ) : (
                  <Avatar name={m.from.nickname} size={38} />
                )}
                <div className="msg-main">
                  {!grouped && (
                    <header>
                      <strong>{m.from.nickname}</strong>
                      <time>{formatTime(m.ts, lang)}</time>
                    </header>
                  )}
                  {/* React escapes the text, so a message can never inject HTML. dir="auto" picks RTL or LTR per message. */}
                  {gifUrl(m.text) ? (
                    <img className="msg-gif" src={gifUrl(m.text)!} alt="GIF" loading="lazy" />
                  ) : (
                    <p dir="auto">{m.text}</p>
                  )}
                </div>
              </article>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        {panel === 'emoji' && <EmojiPicker onPick={(e) => insertText(e)} onClose={closePanel} />}
        {panel === 'gif' && (
          <GifPicker
            onPick={(url) => {
              onSend(url);
              setPanel(null);
            }}
            onClose={closePanel}
          />
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={t('emoji')}
          title={t('emoji')}
          disabled={!canSend}
          onClick={() => setPanel((p) => (p === 'emoji' ? null : 'emoji'))}
        >
          <SmilePlus size={18} />
        </button>
        <button
          type="button"
          className="gif-btn"
          aria-label={t('gif')}
          title={t('gif')}
          disabled={!canSend}
          onClick={() => setPanel((p) => (p === 'gif' ? null : 'gif'))}
        >
          GIF
        </button>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            canSend
              ? privateWith
                ? `${t('privateTo')} ${privateWith}`
                : `${t('chatPlaceholder')} #${channel?.name}`
              : t('chatReadOnly')
          }
          disabled={!canSend}
          rows={1}
          maxLength={1000}
          dir="auto"
          aria-label={t('chatPlaceholder')}
        />
        <button className="icon-btn send" type="submit" disabled={!canSend || !draft.trim()} aria-label={t('send')}>
          <SendHorizontal size={18} />
        </button>
      </form>
    </section>
  );
}
