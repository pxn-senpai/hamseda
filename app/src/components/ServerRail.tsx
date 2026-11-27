import { AudioLines, Plus } from 'lucide-react';
import { useSettings } from '../settings';
import { hash, initial } from '../lib/util';
import type { ServerState } from '../types';

/** A private conversation shown at the top of the bar, apart from the servers. */
export interface DmItem {
  key: string;
  connId: string;
  clientId: number;
  name: string;
  unread: number;
}

interface Props {
  servers: ServerState[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  dms: DmItem[];
  onOpenDm: (connId: string, clientId: number) => void;
}

export function ServerRail({ servers, activeId, onSelect, onAdd, dms, onOpenDm }: Props) {
  const { t } = useSettings();
  return (
    <nav className="rail" aria-label={t('appName')}>
      <button
        className={`rail-item home${activeId === null ? ' active' : ''}`}
        onClick={() => onSelect(null)}
        data-tip={t('appName')}
        aria-label={t('appName')}
      >
        <AudioLines size={24} />
      </button>
      <div className="rail-sep" />
      {dms.slice(0, 8).map((d) => (
        <button
          key={d.key}
          className="rail-item dm"
          style={{ ['--hue' as string]: hash(d.name) % 360 }}
          onClick={() => onOpenDm(d.connId, d.clientId)}
          data-tip={d.name}
          aria-label={d.name}
        >
          <span className="rail-letter">{initial(d.name)}</span>
          {d.unread > 0 && <span className="rail-badge">{d.unread}</span>}
        </button>
      ))}
      {dms.length > 0 && <div className="rail-sep" />}
      {servers.map(({ config, status }) => (
        <button
          key={config.id}
          className={`rail-item${activeId === config.id ? ' active' : ''}`}
          style={{ ['--hue' as string]: hash(config.name) % 360 }}
          onClick={() => onSelect(config.id)}
          data-tip={config.name}
          aria-label={config.name}
        >
          <span className="rail-letter">{initial(config.name)}</span>
          <i className={`rail-status ${status}`} />
        </button>
      ))}
      <button className="rail-item add" onClick={onAdd} data-tip={t('addServer')} aria-label={t('addServer')}>
        <Plus size={22} />
      </button>
    </nav>
  );
}
