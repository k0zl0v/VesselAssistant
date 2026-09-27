import { useEffect, useState, type ReactNode } from 'react';
import { getDb } from '../db';
import { useT } from '../i18n';
import { Icon } from './ui/Icon';
import { describeError } from '../i18n/errors';
import type { Db } from '../services/db';
import { SessionService, type OperatorRole, type OperatorSession } from '../services/SessionService';

const ROLES: readonly OperatorRole[] = ['operator', 'supervisor', 'admin', 'viewer'];

interface Props {
  children: ReactNode;
  /** Called once, after `start()` has written the `app_session` row. */
  onStarted?: (session: OperatorSession) => void;
  openDb?: () => Promise<Db>;
}

/** FR-10: the operator names themselves and their role at every launch; `children` render only after that. */
export function SessionGate({ children, onStarted, openDb = getDb }: Props) {
  const t = useT();
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<OperatorRole>('operator');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const last = await new SessionService(await openDb()).current();
        if (cancelled || !last) return;
        setName(last.operator_name);
        setRole(last.operator_role);
      } catch (e) {
        if (!cancelled) setError(describeError(e));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openDb]);

  if (session) return <>{children}</>;
  if (!ready) return <p className="session-gate-loading">{t('app.loading')}</p>;

  return (
    <main className="session-gate">
      <div className="session-gate-brand">
        <span className="rail-logo">
          <Icon name="ship" />
        </span>
        <span>{t('shell.brand')}</span>
      </div>
      <h2>{t('session.title')}</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const operator_name = name.trim();
          if (!operator_name) {
            setError(t('session.name_required'));
            return;
          }
          setBusy(true);
          setError(null);
          try {
            const started = await new SessionService(await openDb()).start({ operator_name, operator_role: role });
            setSession(started);
            onStarted?.(started);
          } catch (err) {
            setError(describeError(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          <span className="field-label">{t('session.name')}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={busy} />
        </label>
        <label className="field">
          <span className="field-label">{t('session.role')}</span>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as OperatorRole)}
            disabled={busy}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`session.role.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {t('session.start')}
        </button>
      </form>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
