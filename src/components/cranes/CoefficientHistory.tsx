import { useState } from 'react';
import { roundTo3 } from '../../calc/round';
import { getDb } from '../../db';
import { useT } from '../../i18n';
import { describeError } from '../../i18n/errors';
import {
  averageOfIncluded,
  CraneShiftService,
  workingOn,
  type CraneMeasurement,
  type CraneMode,
  type CraneWorkingCoefficient,
} from '../../services/CraneShiftService';
import type { Crane } from '../../services/ReferenceService';
import { formatDate } from '../../shell/format';
import { AddMeasurementDialog } from './AddMeasurementDialog';
import { formatK, MODE_META, parseDecimal, today } from './modes';

interface Props {
  mode: CraneMode;
  crane: Crane;
  measurements: CraneMeasurement[];
  working: CraneWorkingCoefficient[];
  /** Date the accepted value is read on and a new one starts from (the shift on screen, or today). */
  refDate: string;
  onChanged: () => Promise<void>;
}

/**
 * Measurement history of one (mode, crane) with manual outlier exclusion, the average over
 * the included ones and the separately accepted working value (excel-reference §2).
 */
export function CoefficientHistory({ mode, crane, measurements, working, refDate, onChanged }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ k: string; from: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const own = measurements.filter((m) => m.crane_id === crane.id && m.mode === mode);
  const avg = averageOfIncluded(own);
  const history = working.filter((w) => w.crane_id === crane.id && w.mode === mode);
  const accepted = workingOn(history, crane.id, mode, refDate) ?? history[0] ?? null;
  const earlier = history.filter((w) => w.id !== accepted?.id).slice(0, 3);

  async function run(fn: (svc: CraneShiftService) => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn(new CraneShiftService(await getDb()));
      await onChanged();
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const accept = (coefficient: number, valid_from: string) =>
    run((svc) => svc.setWorkingCoefficient({ crane_id: crane.id, mode, coefficient, valid_from }));

  const editK = editing ? parseDecimal(editing.k) : null;
  const editError =
    editing && (editK === null || Number.isNaN(editK) || editK <= 0)
      ? t('cranes.error.k')
      : editing && !editing.from
        ? t('cranes.error.date')
        : null;

  return (
    <section className="cranes-history" aria-labelledby="cranes-history-title" data-testid="cranes-history">
      <div className="cranes-history-head">
        <h2 className="card-title" id="cranes-history-title">
          {t('cranes.history.title')}
        </h2>
        <div className="cranes-history-sub">
          <span className="cranes-mode-tag">{t(MODE_META[mode].label)}</span>
          <span>{t('cranes.history.sub', { crane: crane.name })}</span>
        </div>
      </div>

      <ul className="cranes-history-list" data-testid="cranes-history-list">
        {own.length === 0 && <li className="cranes-history-empty">{t('cranes.history.empty')}</li>}
        {own.map((m) => {
          const id = `cranes-m-${m.id}`;
          return (
            <li key={m.id} className={`cranes-measure${m.excluded ? ' is-excluded' : ''}`} data-testid="cranes-measure">
              <input
                id={id}
                type="checkbox"
                checked={!m.excluded}
                disabled={busy}
                onChange={(e) => void run((svc) => svc.setMeasurementExcluded(m.id, !e.target.checked))}
                aria-label={t('cranes.history.include', {
                  vessel: m.vessel_name ?? t('cranes.history.no_vessel'),
                  date: formatDate(m.measured_on),
                })}
              />
              <label htmlFor={id} className="cranes-measure-main">
                <span className="cranes-measure-vessel">{m.vessel_name ?? t('cranes.history.no_vessel')}</span>
                <span className="cranes-measure-date mono">{formatDate(m.measured_on)}</span>
              </label>
              <span className="cranes-measure-k mono">{formatK(m.coefficient)}</span>
              <span className="cranes-measure-tag">{m.excluded ? t('cranes.history.outlier') : ''}</span>
            </li>
          );
        })}
      </ul>

      <div className="cranes-history-foot">
        <div className="cranes-avg">
          <span>{t('cranes.history.avg')}</span>
          <span className="cranes-avg-value mono" data-testid="cranes-avg">
            {avg === null ? '—' : formatK(avg)}
          </span>
        </div>

        {editing ? (
          <form
            className="cranes-accepted-form"
            noValidate
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(null);
            }}
            onSubmit={(e) => {
              e.preventDefault();
              if (editError || editK === null) return;
              void accept(editK, editing.from).then((ok) => ok && setEditing(null));
            }}
          >
            <div className="field">
              <label className="field-label" htmlFor="cranes-accept-k">
                {t('cranes.history.edit_label')}
              </label>
              <input
                id="cranes-accept-k"
                className="input mono"
                inputMode="decimal"
                value={editing.k}
                onChange={(e) => setEditing({ ...editing, k: e.target.value })}
                autoFocus
                data-testid="cranes-accept-k"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="cranes-accept-from">
                {t('cranes.history.valid_from')}
              </label>
              <input
                id="cranes-accept-from"
                className="input mono"
                type="date"
                value={editing.from}
                onChange={(e) => setEditing({ ...editing, from: e.target.value })}
              />
            </div>
            {editError && <p className="field-error cranes-span-2">{editError}</p>}
            <div className="cranes-actions cranes-span-2">
              <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
                {t('cranes.history.cancel')}
              </button>
              <button type="submit" className="btn btn-sm btn-primary" disabled={busy || editError !== null} data-testid="cranes-accept-save">
                {t('cranes.history.save')}
              </button>
            </div>
          </form>
        ) : (
          <div className="cranes-accepted" data-testid="cranes-accepted">
            <span className="cranes-accepted-label">
              {t('cranes.history.accepted')}
              {accepted && <span className="cranes-accepted-since">{t('cranes.history.accepted_since', { date: formatDate(accepted.valid_from) })}</span>}
            </span>
            <span className="cranes-accepted-value mono" data-testid="cranes-accepted-value">
              {accepted ? formatK(accepted.coefficient) : t('cranes.history.accepted_none')}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-quiet cranes-accepted-edit"
              onClick={() => setEditing({ k: accepted ? formatK(accepted.coefficient) : '', from: refDate })}
              data-testid="cranes-accept-edit"
            >
              {t('cranes.history.edit')}
            </button>
          </div>
        )}
        {earlier.length > 0 && (
          <p className="cranes-history-earlier">
            {t('cranes.history.previous', {
              list: earlier.map((w) => `${formatK(w.coefficient)} · ${formatDate(w.valid_from)}`).join('; '),
            })}
          </p>
        )}
        <p className="cranes-history-explain">{t('cranes.history.explain')}</p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="cranes-actions">
          <button
            type="button"
            className="btn btn-sm cranes-grow"
            disabled={busy || avg === null}
            onClick={() => avg !== null && void accept(roundTo3(avg), refDate)}
            data-testid="cranes-accept-avg"
          >
            {t('cranes.history.accept_avg')}
          </button>
          <button type="button" className="btn btn-sm cranes-grow cranes-add" onClick={() => setAdding(true)} data-testid="cranes-add-measure">
            {t('cranes.history.add')}
          </button>
        </div>
      </div>

      {adding && (
        <AddMeasurementDialog
          mode={mode}
          crane={crane}
          onClose={() => setAdding(false)}
          onSaved={onChanged}
          defaultDate={today()}
        />
      )}
    </section>
  );
}
