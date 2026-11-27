import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Moon, Sun, MonitorSmartphone } from 'lucide-react';
import { Droplets } from 'lucide-react';
import { listAudioDevices } from '../bridge';
import type { AudioDevices } from '../bridge';
import { useSettings } from '../settings';
import type { ThemeSetting, TransmitSetting, UserStatus } from '../settings';
import type { Lang } from '../i18n';
import { Modal } from './Modal';
import { UpdateSection } from './UpdateSection';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const {
    t,
    lang,
    setLang,
    theme,
    setTheme,
    status,
    setStatus,
    transmit,
    setTransmit,
    audioInput,
    audioOutput,
    setAudioInput,
    setAudioOutput,
  } = useSettings();
  const [devices, setDevices] = useState<AudioDevices>({ inputs: [], outputs: [] });

  useEffect(() => {
    listAudioDevices().then(setDevices);
  }, []);

  const themes: { id: ThemeSetting; label: string; icon: ReactNode }[] = [
    { id: 'dark', label: t('themeDark'), icon: <Moon size={16} /> },
    { id: 'light', label: t('themeLight'), icon: <Sun size={16} /> },
    { id: 'system', label: t('themeSystem'), icon: <MonitorSmartphone size={16} /> },
    { id: 'amoled', label: t('themeAmoled'), icon: <Moon size={16} /> },
    { id: 'ocean', label: t('themeOcean'), icon: <Droplets size={16} /> },
  ];
  const statuses: { id: UserStatus; label: string }[] = [
    { id: 'online', label: t('statusOnline') },
    { id: 'idle', label: t('statusIdle') },
    { id: 'dnd', label: t('statusDnd') },
    { id: 'invisible', label: t('statusInvisible') },
  ];

  return (
    <Modal title={t('settings')} onClose={onClose}>
      <div className="form">
        <div className="field">
          <span>{t('theme')}</span>
          <div className="segmented wrap" role="radiogroup" aria-label={t('theme')}>
            {themes.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={theme === x.id}
                className={theme === x.id ? 'on' : ''}
                onClick={() => setTheme(x.id)}
              >
                {x.icon}
                {x.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>{t('language')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('language')}>
            {(['fa', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                className={lang === l ? 'on' : ''}
                onClick={() => setLang(l)}
              >
                {l === 'fa' ? t('language_fa') : t('language_en')}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>{t('status')}</span>
          <div className="segmented wrap" role="radiogroup" aria-label={t('status')}>
            {statuses.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={status === s.id}
                className={status === s.id ? 'on' : ''}
                onClick={() => setStatus(s.id)}
              >
                <i className={`dot ${s.id}`} />
                {s.label}
              </button>
            ))}
          </div>
          <p className="hint">{t('statusLocalNote')}</p>
        </div>

        <div className="field">
          <span>{t('transmitMode')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('transmitMode')}>
            {(['voice', 'ptt'] as TransmitSetting[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={transmit === m}
                className={transmit === m ? 'on' : ''}
                onClick={() => setTransmit(m)}
              >
                {m === 'voice' ? t('transmitVoice') : t('transmitPtt')}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>{t('audioDevices')}</span>
          <label className="select-row">
            {t('microphone')}
            <select value={audioInput} onChange={(e) => setAudioInput(e.target.value)}>
              <option value="">{t('systemDefault')}</option>
              {devices.inputs.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="select-row">
            {t('speaker')}
            <select value={audioOutput} onChange={(e) => setAudioOutput(e.target.value)}>
              <option value="">{t('systemDefault')}</option>
              {devices.outputs.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <p className="hint">{t('audioNote')}</p>
        </div>

        <div className="field">
          <span>{t('shortcuts')}</span>
          <ul className="shortcuts">
            <li>
              <kbd dir="ltr">Ctrl</kbd> <kbd dir="ltr">Shift</kbd> <kbd dir="ltr">M</kbd>
              <em>{t('shortcutMute')}</em>
            </li>
            <li>
              <kbd dir="ltr">Ctrl</kbd> <kbd dir="ltr">Shift</kbd> <kbd dir="ltr">D</kbd>
              <em>{t('shortcutDeafen')}</em>
            </li>
            <li>
              <kbd dir="ltr">V</kbd>
              <em>{t('shortcutPtt')}</em>
            </li>
          </ul>
        </div>
        <UpdateSection />
      </div>
    </Modal>
  );
}
