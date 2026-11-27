import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Hash, Search, SendHorizontal, SmilePlus, X } from 'lucide-react';
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

/** Is `name` mentioned in this text as @name? */
export function mentions(text: string, name: string): boolean {
  if (!name) return false;
  return text.toLowerCase().includes(`@${name.toLowerCase()}`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Shows the text, with @name highlighted when it is you. */
function Text({ text, name }: { text: string; name: string }) {
  if (!mentions(text, name)) return <p dir="auto">{text}</p>;
  const parts = text.split(new RegExp(`(@${escapeRegExp(name)})`, 'i'));
  return (
    <p dir="auto">
      {parts.map((part, i) =>
        part.toLowerCase() === `@${name.toLowerCase()}` ? (
          <mark key={i} className="mention-tag">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

interface Reaction {
  count: number;
  mine: boolean;
}

interface Props {
  channel: Channel | null;
  messages: ChatMessage[];
  selfId: number;
  /** Your own nickname, used to find @mentions. */
  selfName: string;
  canSend: boolean;
  onSend: (text: string) => void;
  /** Name of the person in a private conversation. When set, `channel` is null. */
  privateWith?: string;
}

export function ChatArea({ channel, messages, selfId, selfName, canSend, onSend, privateWith }: Props) {
  const { t, lang } = useSettings();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<'emoji' | 'gif' | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);

  // Reactions are kept on this computer only: TeamSpeak has no reaction message type.
  const [reactions, setReactions] = useState<Record<string, Record<string, Reaction>>>({});
  const [reactFor, setReactFor] = useState<string | null>(null);
  const closeReact = useCallback(() => setReactFor(null), []);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  // A new room or person starts with a clean search.
  useEffect(() => {
    setQuery('');
    setSearchOpen(false);
  }, [channel?.id, privateWith]);

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, channel?.id]);

  // Put text where the cursor is, then move the cursor after it.
  const insertText = (text: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + text + draft.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const toggleReaction = (msgId: string, emoji: string) => {
    setReactions((prev) => {
      const msg = prev[msgId] ?? {};
      const cur = msg[emoji] ?? { count: 0, mine: false };
      const mine = !cur.mine;
      const count = cur.count + (mine ? 1 : -1);
      const nextMsg = { ...msg };
      if (count <= 0) delete nextMsg[emoji];
      else nextMsg[emoji] = { count, mine };
      return { ...prev, [msgId]: nextMsg };
    });
  };

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

  const q = query.trim().toLowerCase();
  const shown = q ? messages.filter((m) => m.text.toLowerCase().includes(q)) : messages;

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
        <div className="chat-head-tools">
          {searchOpen ? (
            <label className="chat-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchMessages')}
                autoFocus
                onKeyDown={(e) => e.key === 'Escape' && (setSearchOpen(false), setQuery(''))}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={t('close')}
                onClick={() => {
                  setSearchOpen(false);
                  setQuery('');
                }}
              >
                <X size={14} />
              </button>
            </label>
          ) : (
            <button
              type="button"
              className="icon-btn"
              aria-label={t('searchMessages')}
              title={t('searchMessages')}
              onClick={() => setSearchOpen(true)}
            >
              <Search size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="chat-scroll">
        <div className="chat-start">
          <h3>{privateWith ?? channel?.name}</h3>
          <p>{privateWith ? t('privateBeginning') : t('beginning')}</p>
        </div>

        {messages.length === 0 && <p className="chat-none">{t('noMessages')}</p>}
        {messages.length > 0 && shown.length === 0 && <p className="chat-none">{t('noSearchResults')}</p>}

        {shown.map((m, i) => {
          const prev = shown[i - 1];
          const newDay = !prev || formatDay(prev.ts, lang) !== formatDay(m.ts, lang);
          // Same sender within 5 minutes: show as a continuation without repeating the name.
          const grouped = !newDay && prev && prev.from.id === m.from.id && m.ts - prev.ts < 5 * 60_000;
          const mentioned = mentions(m.text, selfName) && m.from.id !== selfId;
          const msgReactions = reactions[m.id] ?? {};
          return (
            <div key={m.id}>
              {newDay && <div className="day-sep"><span>{formatDay(m.ts, lang)}</span></div>}
              <article
                className={`msg${grouped ? ' grouped' : ''}${m.from.id === selfId ? ' mine' : ''}${mentioned ? ' mention' : ''}`}
              >
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
                    <Text text={m.text} name={selfName} />
                  )}
                  {Object.keys(msgReactions).length > 0 && (
                    <div className="reactions">
                      {Object.entries(msgReactions).map(([emoji, r]) => (
                        <button
                          key={emoji}
                          type="button"
                          className={`reaction${r.mine ? ' mine' : ''}`}
                          title={t('reactLocal')}
                          onClick={() => toggleReaction(m.id, emoji)}
                        >
                          {emoji} <span>{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="msg-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('react')}
                    title={t('react')}
                    onClick={() => setReactFor((cur) => (cur === m.id ? null : m.id))}
                  >
                    <SmilePlus size={16} />
                  </button>
                </div>
                {reactFor === m.id && (
                  <div className="react-anchor">
                    <EmojiPicker
                      onPick={(emoji) => {
                        toggleReaction(m.id, emoji);
                        closeReact();
                      }}
                      onClose={closeReact}
                    />
                  </div>
                )}
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
