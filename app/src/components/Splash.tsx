import { useEffect, useRef, useState } from 'react';
import { AudioLines } from 'lucide-react';
import { useSettings } from '../settings';

/** Opening animation: the app icon appears, then the screen fades into the app. */
export function Splash({ onDone }: { onDone: () => void }) {
  const { t } = useSettings();
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), 1500);
    const done = setTimeout(() => doneRef.current(), 2000);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, []);

  return (
    <div className={`splash${leaving ? ' out' : ''}`} aria-hidden="true">
      <div className="splash-tile">
        <AudioLines size={46} />
      </div>
      <div className="splash-name">{t('appName')}</div>
    </div>
  );
}
