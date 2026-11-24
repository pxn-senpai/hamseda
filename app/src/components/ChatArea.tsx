import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Hash, SendHorizontal } from 'lucide-react';
import { useSettings } from '../settings';
import { formatDay, formatTime } from '../lib/util';
import type { Channel, ChatMessage } from '../types';
import { Avatar } from './Avatar';

interface Props {
  channel: Channel | null;
  messages: ChatMessage[];
  selfId: number;
  canSend: boolean;
  onSend: (text: string) => void;
}

export function ChatArea({ channel, messages, selfId, canSend, onSend }: Props) {
  const { t, lang } = useSettings();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

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

  if (!channel) {
    return (
      <section className="chat">
        <div className="chat-empty">{t('noMessages')}</div>
      </section>
    );
  }

  return (
    <section className="chat">
      <header className="chat-head">
        <Hash size={20} />
        <strong>{channel.name}</strong>
        {channel.topic && <span className="topic" dir="auto">{channel.topic}</span>}
      </header>

      <div className="chat-scroll">
        <div className="chat-start">
          <h3>{channel.name}</h3>
          <p>{t('beginning')}</p>
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
                  <p dir="auto">{m.text}</p>
                </div>
              </article>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={canSend ? `${t('chatPlaceholder')} #${channel.name}` : t('chatReadOnly')}
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
