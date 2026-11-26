import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import type { Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { IS_DESKTOP } from '../bridge';
import { useSettings } from '../settings';

type Phase = 'idle' | 'checking' | 'upToDate' | 'available' | 'installing' | 'failed';

/** Shows the app version and a button that asks GitHub for the newest release and installs it. */
export function UpdateSection() {
  const { t } = useSettings();
  const [version, setVersion] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [update, setUpdate] = useState<Update | null>(null);
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (!IS_DESKTOP) return;
    getVersion().then(setVersion).catch(() => setVersion(''));
  }, []);

  async function checkNow() {
    setPhase('checking');
    setDetail('');
    try {
      const found = await check();
      setUpdate(found);
      setPhase(found ? 'available' : 'upToDate');
    } catch (e) {
      setPhase('failed');
      setDetail(String(e));
    }
  }

  async function install() {
    if (!update) return;
    setPhase('installing');
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setPhase('failed');
      setDetail(String(e));
    }
  }

  if (!IS_DESKTOP) {
    return (
      <div className="field">
        <span>{t('updates')}</span>
        <p className="hint">{t('updateWebOnly')}</p>
      </div>
    );
  }

  const busy = phase === 'checking' || phase === 'installing';

  return (
    <div className="field">
      <span>{t('updates')}</span>
      <div className="update-row">
        <span dir="ltr">
          {t('appVersion')} {version}
        </span>
        {phase === 'available' && update ? (
          <>
            <span>
              {t('updateAvailable')} <b dir="ltr">{update.version}</b>
            </span>
            <button type="button" className="btn primary small" onClick={install} disabled={busy}>
              {t('installUpdate')}
            </button>
          </>
        ) : (
          <button type="button" className="btn small" onClick={checkNow} disabled={busy}>
            {phase === 'checking' ? t('checkingUpdates') : t('checkUpdates')}
          </button>
        )}
      </div>
      {phase === 'upToDate' && <p className="hint">{t('upToDate')}</p>}
      {phase === 'installing' && <p className="hint">{t('installingUpdate')}</p>}
      {phase === 'failed' && (
        <p className="hint">
          {t('updateFailed')}
          {detail && <span dir="ltr"> {detail}</span>}
        </p>
      )}
      <p className="hint">{t('updateNote')}</p>
    </div>
  );
}
