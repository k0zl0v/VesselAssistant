import { useState } from 'react';
import { correctedWeight } from '../../calc/capacity';
import { formatTons } from '../../calc/round';
import { getDb } from '../../db';
import { useT } from '../../i18n';
import { describeError } from '../../i18n/errors';
import {
  CRANE_MODES,
  CraneShiftService,
  modeCraneKey,
  workingOn,
  type CraneWorkingCoefficient,
  type DischargeOperationRef,
  type ShiftEntry,
} from '../../services/CraneShiftService';
import type { Crane } from '../../services/ReferenceService';
import { formatDate } from '../../shell/format';
import { Dialog } from '../ui/Dialog';
import { formatK, MODE_META, parseDecimal } from './modes';

interface Props {
  voyage_id: string;
  cranes: Crane[];
  working: CraneWorkingCoefficient[];
  operations: DischargeOperationRef[];
  defaultDate: string;
  onClose: () => void;
  onSaved: (shift_date: string) => Promise<void>;
}

interface RowInput {
  scale: string;
  operation_id: string;
  note: string;
}

const EMPTY: RowInput = { scale: '', operation_id: '', note: '' };

/** «Записать смену»: scale weights per mode × crane for one date, previewed with the working coefficient. */
export function RecordShiftDialog({ voyage_id, cranes, working, operations, defaultDate, onClose, onSaved }: Props) {
  const t = useT();
  const [date, setDate] = useState(defaultDate);
  const [rows, setRows] = useState<Record<string, RowInput>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const dayOps = operations.filter((o) => o.event_date === date);
  const set = (key: string, patch: Partial<RowInput>) => setRows((r) => ({ ...r, [key]: { ...(r[key] ?? EMPTY), ...patch } }));

  const lines = CRANE_MODES.flatMap((mode) =>
    cranes.map((crane) => {
      const key = modeCraneKey(mode, crane.id);
      const input = rows[key] ?? EMPTY;
      const scale = parseDecimal(input.scale);
      const w = date ? workingOn(working, crane.id, mode, date) : null;
      const scaleError = scale !== null && (Number.isNaN(scale) || scale <= 0);
      const corrected = scale !== null && !scaleError && w ? correctedWeight(scale, w.coefficient) : null;
      return { mode, crane, key, input, scale, w, scaleError, corrected };
    }),
  );
  const filled = lines.filter((l) => l.scale !== null);
  const missingWorking = filled.some((l) => !l.scaleError && !l.w);
  const invalid = !date || filled.length === 0 || filled.some((l) => l.scaleError) || missingWorking;
  const totalScale = filled.reduce((s, l) => s + (l.scaleError ? 0 : l.scale!), 0);
  const totalCorrected = filled.reduce((s, l) => s + (l.corrected ?? 0), 0);

  async function submit(): Promise<void> {
    setTouched(true);
    if (invalid) return;
    const entries: ShiftEntry[] = filled.map((l) => ({
      crane_id: l.crane.id,
      mode: l.mode,
      scale_tons: l.scale!,
      operation_id: l.mode === 'from_own' && l.input.operation_id ? l.input.operation_id : null,
      note: l.input.note,
    }));
    setBusy(true);
    setError(null);
    try {
      await new CraneShiftService(await getDb()).recordShift({ voyage_id, shift_date: date, entries });
      await onSaved(date);
      onClose();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <Dialog title={t('cranes.shift.title')} subtitle={t('cranes.shift.subtitle')} onClose={onClose} wide testId="cranes-shift-dialog">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="dialog-body cranes-shift-body">
          <div className="field cranes-shift-date">
            <label className="field-label" htmlFor="cranes-shift-date">{t('cranes.shift.date')}</label>
            <input id="cranes-shift-date" className="input mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="cranes-shift-date" />
            {touched && !date && <p className="field-error">{t('cranes.error.date')}</p>}
          </div>

          <table className="data-table cranes-shift-table">
            <thead>
              <tr>
                <th>{t('cranes.shift.col.mode')}</th>
                <th className="num">{t('cranes.shift.col.scale')}</th>
                <th className="num">{t('cranes.shift.col.k')}</th>
                <th className="num">{t('cranes.shift.col.corrected')}</th>
                <th>{t('cranes.shift.col.link')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const id = `cranes-shift-${l.key}`;
                const label = `${t(MODE_META[l.mode].label)} · ${l.crane.name}`;
                return (
                  <tr key={l.key}>
                    <td>
                      <label htmlFor={id} className="cranes-shift-label">
                        <span className="cranes-shift-mode">{t(MODE_META[l.mode].label)}</span>
                        <span className="muted">{l.crane.name}</span>
                      </label>
                    </td>
                    <td className="num">
                      <input
                        id={id}
                        className="input mono cranes-shift-scale"
                        inputMode="decimal"
                        value={l.input.scale}
                        onChange={(e) => set(l.key, { scale: e.target.value })}
                        aria-invalid={l.scaleError}
                        data-testid={`cranes-shift-scale-${l.mode}-${l.crane.name}`}
                      />
                    </td>
                    <td className={`num${l.scale !== null && !l.w ? ' cranes-shift-missing' : ''}`}>
                      {l.w ? formatK(l.w.coefficient) : l.scale !== null ? t('cranes.k_missing') : '—'}
                    </td>
                    <td className="num">{l.corrected === null ? '—' : formatTons(l.corrected)}</td>
                    <td>
                      {l.mode === 'from_own' && dayOps.length > 0 ? (
                        <select
                          className="input cranes-shift-link"
                          value={l.input.operation_id}
                          onChange={(e) => set(l.key, { operation_id: e.target.value })}
                          aria-label={`${t('cranes.shift.col.link')}: ${label}`}
                        >
                          <option value="">{t('cranes.shift.no_operation')}</option>
                          {dayOps.map((o) => (
                            <option key={o.id} value={o.id}>
                              {t('cranes.shift.operation', {
                                date: formatDate(o.event_date).slice(0, 5),
                                time: o.time_from ?? '',
                                hold: o.hold_no ?? '—',
                                tons: formatTons(o.tons),
                              })}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input cranes-shift-link"
                          value={l.input.note}
                          onChange={(e) => set(l.key, { note: e.target.value })}
                          placeholder={t('cranes.shift.barge')}
                          aria-label={`${t('cranes.shift.barge')}: ${label}`}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {touched && filled.length === 0 && <p className="field-error">{t('cranes.error.empty_shift')}</p>}
          {filled.some((l) => l.scaleError) && <p className="field-error">{t('cranes.error.scale')}</p>}
          {missingWorking && date && (
            <p className="field-error" data-testid="cranes-shift-no-working">
              {t('cranes.error.no_working', { date: formatDate(date) })}
            </p>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <span className="dialog-footer-note mono" data-testid="cranes-shift-total">
            {t('cranes.shift.total', { scale: formatTons(totalScale), corrected: formatTons(totalCorrected) })}
          </span>
          <button type="button" className="btn" onClick={onClose}>
            {t('cranes.history.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || (touched && invalid)} data-testid="cranes-shift-submit">
            {t('cranes.shift.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
