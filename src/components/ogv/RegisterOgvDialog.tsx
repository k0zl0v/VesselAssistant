import { useState } from 'react';
import { formatTons } from '../../calc/round';
import { reportError } from '../../errorReporting';
import { useT } from '../../i18n';
import { describeError } from '../../i18n/errors';
import type { Db } from '../../services/db';
import { OgvVesselService } from '../../services/OgvVesselService';
import { Dialog } from '../ui/Dialog';

const DEFAULT_HOLDS = 7;
const MAX_HOLDS = 12;

interface Props {
  db: Db;
  voyage_id: string;
  onDone: () => Promise<void>;
  onClose: () => void;
}

/** Registers the voyage's OGV: name, number of holds, cargo plan per hold (stern to bow). */
export function RegisterOgvDialog({ db, voyage_id, onDone, onClose }: Props) {
  const t = useT();
  const [name, setName] = useState('');
  const [count, setCount] = useState(DEFAULT_HOLDS);
  const [plans, setPlans] = useState<string[]>(() => Array.from({ length: MAX_HOLDS }, () => ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Index i holds hold №(i + 1); the grid prints them stern (highest) to bow.
  const nos = Array.from({ length: count }, (_, i) => count - i);
  const parsed = nos.map((no) => {
    const raw = plans[no - 1]!.trim();
    return raw === '' ? 0 : Number(raw);
  });
  const plansValid = parsed.every((v) => Number.isFinite(v) && v >= 0);
  const total = plansValid ? parsed.reduce((s, v) => s + v, 0) : null;
  const nameValid = name.trim() !== '';

  async function submit(): Promise<void> {
    setTouched(true);
    if (!nameValid || !plansValid) return;
    setBusy(true);
    setError(null);
    try {
      await new OgvVesselService(db).create({
        voyage_id,
        name,
        holds: nos.map((no, i) => ({ hold_no: no, planned_tons: parsed[i]! })),
      });
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
      return;
    }
    await onDone().catch((e: unknown) => reportError('ogv-register-refresh', e));
    onClose();
  }

  return (
    <Dialog title={t('ogv.register.title')} subtitle={t('ogv.register.subtitle')} onClose={onClose} testId="ogv-register-dialog">
      <form
        className="ogv-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="dialog-body ogv-form-body">
          <div className="ogv-form-row">
            <div className="field ogv-field-grow">
              <label className="field-label" htmlFor="ogv-name">
                {t('ogv.register.name')}
              </label>
              <input
                id="ogv-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={touched && !nameValid}
                autoFocus
                data-testid="ogv-register-name"
              />
              {touched && !nameValid && <span className="field-error">{t('ogv.register.error.name')}</span>}
            </div>
            <div className="field ogv-field-count">
              <label className="field-label" htmlFor="ogv-count">
                {t('ogv.register.hold_count')}
              </label>
              <input
                id="ogv-count"
                className="input num"
                type="number"
                min={1}
                max={MAX_HOLDS}
                step={1}
                value={count}
                onChange={(e) => setCount(Math.min(MAX_HOLDS, Math.max(1, Math.trunc(Number(e.target.value) || 1))))}
                data-testid="ogv-register-count"
              />
            </div>
          </div>
          <div className="field-label ogv-plan-label">{t('ogv.register.plan')}</div>
          <div className="ogv-plan-grid">
            {nos.map((no) => (
              <div className="field" key={no}>
                <label className="ogv-plan-hold mono" htmlFor={`ogv-plan-${no}`}>
                  {t('ogv.register.hold', { no })}
                </label>
                <input
                  id={`ogv-plan-${no}`}
                  className="input num"
                  type="number"
                  min={0}
                  step="0.001"
                  inputMode="decimal"
                  placeholder="0.000"
                  value={plans[no - 1]}
                  onChange={(e) => {
                    const next = [...plans];
                    next[no - 1] = e.target.value;
                    setPlans(next);
                  }}
                  data-testid={`ogv-register-plan-${no}`}
                />
              </div>
            ))}
          </div>
          {touched && !plansValid && <p className="field-error">{t('ogv.register.error.plan')}</p>}
          <div className="ogv-plan-total">
            <span>{t('ogv.register.total')}</span>
            <span className="mono" data-testid="ogv-register-total">
              {total === null ? '—' : `${formatTons(total)} ${t('ogv.unit.mt')}`}
            </span>
          </div>
          {error && (
            <p className="field-error" role="alert" data-testid="ogv-register-error">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn btn-lg" onClick={onClose} disabled={busy}>
            {t('ogv.cancel')}
          </button>
          <button type="submit" className="btn btn-lg btn-primary" disabled={busy} data-testid="ogv-register-submit">
            {t('ogv.register.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
