import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Settings } from 'lucide-react';
import { useSettings } from '../settings';
import type { Client } from '../types';
import { Avatar } from './Avatar';

interface Props {
  nickname: string;
  self?: Client;
  channelName?: string;
  onToggleMic: () => void;
  onToggleDeaf: () => void;
  onSettings: () => void;
  /** Leaves the voice connection. Shown only while connected. */
  onLeave?: () => void;
}

export function UserPanel({ nickname, self, channelName, onToggleMic, onToggleDeaf, onSettings, onLeave }: Props) {
  const { t, status } = useSettings();
  const statusLabel = {
    online: t('statusOnline'),
    idle: t('statusIdle'),
    dnd: t('statusDnd'),
    invisible: t('statusInvisible'),
  }[status];

  const disabled = !self;
  const micOff = Boolean(self?.inputMuted);
  const deaf = Boolean(self?.outputMuted);

  return (
    <div className="user-panel">
      <div className="user-id">
        <span className="avatar-wrap">
          <Avatar name={nickname} size={34} talking={self?.talking} />
          <i className={`dot ${status}`} />
        </span>
        <span className="user-text">
          <strong>{nickname}</strong>
          <small>{channelName ? `${t('inChannel')} ${channelName}` : statusLabel}</small>
        </span>
      </div>
      <div className="user-actions">
        <button
          className={`icon-btn${micOff ? ' danger' : ''}`}
          onClick={onToggleMic}
          disabled={disabled}
          title={disabled ? t('noSelf') : micOff ? t('unmute') : t('mute')}
          aria-label={micOff ? t('unmute') : t('mute')}
          aria-pressed={micOff}
        >
          {micOff ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button
          className={`icon-btn${deaf ? ' danger' : ''}`}
          onClick={onToggleDeaf}
          disabled={disabled}
          title={disabled ? t('noSelf') : deaf ? t('undeafen') : t('deafen')}
          aria-label={deaf ? t('undeafen') : t('deafen')}
          aria-pressed={deaf}
        >
          {deaf ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
        </button>
        <button className="icon-btn" onClick={onSettings} title={t('settings')} aria-label={t('settings')}>
          <Settings size={18} />
        </button>
        {onLeave && (
          <button
            className="icon-btn leave"
            onClick={onLeave}
            title={t('leaveVoice')}
            aria-label={t('leaveVoice')}
          >
            <PhoneOff size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
