import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSettings } from '../settings';
import { IS_DESKTOP } from '../bridge';
import type { ConnectMode, ServerConfig } from '../types';
import { Modal } from './Modal';

interface Props {
  initial?: ServerConfig;
  defaultMode?: ConnectMode;
  onSubmit: (config: ServerConfig) => void;
  onClose: () => void;
}

export function ConnectDialog({ initial, defaultMode = 'demo', onSubmit, onClose }: Props) {
  const { t } = useSettings();
  // The desktop app only makes real connections, so there is no mode to choose there.
  const [mode, setMode] = useState<ConnectMode>(
    initial?.mode ?? (IS_DESKTOP ? 'teamspeak' : defaultMode),
  );
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? (defaultMode === 'demo' ? 'demo.local' : ''));
  const [port, setPort] = useState(String(initial?.port ?? 9987));
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [password, setPassword] = useState(initial?.password ?? '');
  const [remember, setRemember] = useState(initial?.rememberPassword ?? false);
  const [queryPort, setQueryPort] = useState(String(initial?.query.port ?? 10011));
  const [queryProtocol, setQueryProtocol] = useState<'raw' | 'ssh'>(initial?.query.protocol ?? 'raw');
  const [queryUser, setQueryUser] = useState(initial?.query.username ?? '');
  const [queryPass, setQueryPass] = useState(initial?.query.password ?? '');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const portNum = Number(port);
    const queryPortNum = Number(queryPort);
    if (!address.trim() || !nickname.trim()) return setError('⚠ ' + t('address') + ' / ' + t('nickname'));
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535)
      return setError('⚠ ' + t('port') + ' (1–65535)');
    if (!Number.isInteger(queryPortNum) || queryPortNum < 1 || queryPortNum > 65535)
      return setError('⚠ ' + t('queryPort') + ' (1–65535)');

    onSubmit({
      id: initial?.id ?? crypto.randomUUID(),
      mode,
      name: name.trim() || address.trim(),
      address: address.trim(),
      port: portNum,
      nickname: nickname.trim(),
      password: password || undefined,
      rememberPassword: remember,
      query: {
        port: queryPortNum,
        protocol: queryProtocol,
        username: queryUser.trim() || undefined,
        password: queryPass || undefined,
      },
    });
  };

  return (
    <Modal
      title={initial ? t('editServer') : t('connectTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" form="connect-form" className="btn primary">
            {initial ? t('save') : t('connect')}
          </button>
        </>
      }
    >
      <form id="connect-form" className="form" onSubmit={submit}>
        {!IS_DESKTOP && (
          <>
            <label className="field">
              <span>{t('mode')}</span>
              <select value={mode} onChange={(e) => setMode(e.target.value as ConnectMode)}>
                <option value="demo">{t('modeDemo')}</option>
                <option value="serverquery">{t('modeQuery')}</option>
              </select>
            </label>
            <p className="hint">{mode === 'demo' ? t('demoHelp') : t('queryHelp')}</p>
          </>
        )}
        {IS_DESKTOP && <p className="hint">{t('teamspeakHelp')}</p>}

        <label className="field">
          <span>{t('name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>

        <div className="field-row">
          <label className="field grow">
            <span>{t('address')}</span>
            <input
              dir="ltr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ts.example.com"
              spellCheck={false}
            />
          </label>
          <label className="field narrow">
            <span>{t('port')}</span>
            <input dir="ltr" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>{t('nickname')}</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} />
        </label>

        <label className="field">
          <span>{t('password')}</span>
          <input
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
        </label>

        {mode === 'serverquery' && (
          <fieldset className="fieldset">
            <legend>{t('advanced')}</legend>
            <div className="field-row">
              <label className="field narrow">
                <span>{t('queryPort')}</span>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  value={queryPort}
                  onChange={(e) => setQueryPort(e.target.value)}
                />
              </label>
              <label className="field grow">
                <span>{t('queryProtocol')}</span>
                <select
                  value={queryProtocol}
                  onChange={(e) => {
                    const p = e.target.value as 'raw' | 'ssh';
                    setQueryProtocol(p);
                    setQueryPort(p === 'ssh' ? '10022' : '10011');
                  }}
                >
                  <option value="raw">Raw (10011)</option>
                  <option value="ssh">SSH (10022)</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>{t('queryUser')}</span>
              <input dir="ltr" value={queryUser} onChange={(e) => setQueryUser(e.target.value)} autoComplete="off" />
            </label>
            <label className="field">
              <span>{t('queryPass')}</span>
              <input
                type="password"
                dir="ltr"
                value={queryPass}
                onChange={(e) => setQueryPass(e.target.value)}
                autoComplete="off"
              />
            </label>
          </fieldset>
        )}

        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            {t('savePassword')}
            <small>{t('savePasswordWarn')}</small>
          </span>
        </label>

        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}
