import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bot, Check, Copy, Headphones, Hash, MessageCircle, MicOff, MoonStar, Volume2 } from 'lucide-react';
import { useSettings } from '../settings';
import { avatarColor } from '../lib/util';
import type { Client } from '../types';
import { Avatar } from './Avatar';

interface Props {
  client: Client;
  channelName: string;
  isBot: boolean;
  /** The person is in the channel we are in. */
  sameChannel: boolean;
  /** Text of the last private message with them, if any. */
  lastPrivate?: string;
  /** Where the member row is on screen; the card opens next to it. */
  anchor: DOMRect;
  onMessage?: () => void;
  onJoin?: () => void;
  /** Marks or unmarks this person as a music bot. */
  onToggleBot?: () => void;
  onClose: () => void;
}

const WIDTH = 300;
const GAP = 10;
const EDGE = 8;

/** The user panel: a card with a person's status, channel, last private message and actions. */
export function ProfileCard({
  client,
  channelName,
  isBot,
  sameChannel,
  lastPrivate,
  anchor,
  onMessage,
  onJoin,
  onToggleBot,
  onClose,
}: Props) {
  const { t } = useSettings();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // Open to the side of the row that has room, then keep the card inside the window.
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.right + GAP;
    if (left + WIDTH > vw - EDGE) left = anchor.left - WIDTH - GAP;
    left = Math.max(EDGE, Math.min(left, vw - WIDTH - EDGE));
    const top = Math.max(EDGE, Math.min(anchor.top, vh - height - EDGE));
    setPos({ left, top });
  }, [anchor]);

  // Close on Escape, on a click outside, or when the window resizes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(client.nickname);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The clipboard can be blocked; the name is still on screen.
    }
  };

  const status = client.away ? 'away' : 'online';
  const isSelf = client.isSelf;

  return (
    <div
      className="profile-card"
      role="dialog"
      aria-label={client.nickname}
      ref={ref}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
    >
      <div className="profile-banner" style={{ background: `linear-gradient(135deg, ${avatarColor(client.nickname)}, var(--accent))` }} />
      <div className="profile-avatar">
        <Avatar name={client.nickname} size={68} talking={client.talking} dim={client.away} />
        <span className={`profile-status ${status}`} aria-label={t(status === 'away' ? 'away' : 'online')} />
      </div>

      <div className="profile-body">
        <h3 className="profile-name">
          <span>{client.nickname}</span>
          {isSelf && <span className="badge">{t('profileYou')}</span>}
          {isBot && (
            <span className="badge bot">
              <Bot size={12} /> {t('profileBot')}
            </span>
          )}
        </h3>

        {(client.inputMuted || client.outputMuted || client.away) && (
          <div className="profile-chips">
            {client.inputMuted && (
              <span className="chip bad">
                <MicOff size={13} /> {t('mute')}
              </span>
            )}
            {client.outputMuted && (
              <span className="chip bad">
                <Headphones size={13} /> {t('deafen')}
              </span>
            )}
            {client.away && (
              <span className="chip warn">
                <MoonStar size={13} /> {t('away')}
              </span>
            )}
          </div>
        )}

        {client.awayMessage && <p className="profile-quote">{client.awayMessage}</p>}

        <div className="profile-fields">
          <div className="profile-field">
            <span className="profile-label">{t('profileChannel')}</span>
            <span className="profile-value">
              <Volume2 size={14} />
              {channelName || '—'}
              {sameChannel && !isSelf && <span className="chip good">{t('inYourChannel')}</span>}
            </span>
          </div>
          <div className="profile-field">
            <span className="profile-label">ID</span>
            <span className="profile-value">
              <Hash size={14} />
              {client.id}
            </span>
          </div>
        </div>

        {lastPrivate && (
          <div className="profile-field">
            <span className="profile-label">{t('lastPrivate')}</span>
            <p className="profile-quote">{lastPrivate}</p>
          </div>
        )}

        <div className="profile-actions">
          {!isSelf && onMessage && (
            <button type="button" className="btn primary small" onClick={onMessage}>
              <MessageCircle size={14} /> {t('sendPrivate')}
            </button>
          )}
          {!isSelf && !sameChannel && onJoin && (
            <button type="button" className="btn small" onClick={onJoin}>
              {t('goToChannel')}
            </button>
          )}
          {!isSelf && onToggleBot && (
            <button type="button" className="btn small" onClick={onToggleBot}>
              <Bot size={14} /> {isBot ? t('unmarkBot') : t('markBot')}
            </button>
          )}
          <button type="button" className="btn small" onClick={copyName}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('copied') : t('copyName')}
          </button>
        </div>
      </div>
    </div>
  );
}
