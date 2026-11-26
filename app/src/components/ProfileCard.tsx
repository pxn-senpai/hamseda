import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bot, Headphones, MicOff, MoonStar, Volume2 } from 'lucide-react';
import { useSettings } from '../settings';
import { avatarColor } from '../lib/util';
import type { Client } from '../types';
import { Avatar } from './Avatar';

interface Props {
  client: Client;
  channelName: string;
  isBot: boolean;
  /** Where the member row is on screen; the card opens next to it. */
  anchor: DOMRect;
  onClose: () => void;
}

const WIDTH = 288;
const GAP = 10;
const EDGE = 8;

/** A small profile card that opens next to a member's row. */
export function ProfileCard({ client, channelName, isBot, anchor, onClose }: Props) {
  const { t } = useSettings();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Open to the side of the row that has room, then keep the card inside the window.
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.right + GAP;
    if (left + WIDTH > vw - EDGE) left = anchor.left - WIDTH - GAP;
    left = Math.max(EDGE, Math.min(left, vw - WIDTH - EDGE));
    const top = Math.max(EDGE, Math.min(anchor.top, vh - height - EDGE));
    setPos({ left, top });
  }, [anchor]);

  // Close on Escape, on a click outside, or when the window scrolls or resizes.
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

  const status = client.away ? 'away' : 'online';

  return (
    <div
      className="profile-card"
      role="dialog"
      aria-label={client.nickname}
      ref={ref}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
    >
      <div className="profile-banner" style={{ background: avatarColor(client.nickname) }} />
      <div className="profile-avatar">
        <Avatar name={client.nickname} size={68} talking={client.talking} dim={client.away} />
        <span className={`profile-status ${status}`} aria-label={t(status === 'away' ? 'away' : 'online')} />
      </div>

      <div className="profile-body">
        <h3 className="profile-name">
          <span>{client.nickname}</span>
          {client.isSelf && <span className="badge">{t('profileYou')}</span>}
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

        <div className="profile-field">
          <span className="profile-label">{t('profileChannel')}</span>
          <span className="profile-value">
            <Volume2 size={14} />
            {channelName || '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
