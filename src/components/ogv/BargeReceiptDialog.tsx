import { useState } from 'react';
import { formatTons, roundTo3 } from '../../calc/round';
import { reportError } from '../../errorReporting';
import { useT } from '../../i18n';
import { describeError } from '../../i18n/errors';
import type { Db } from '../../services/db';
import { OgvVesselService, type OgvHoldView } from '../../services/OgvVesselService';
import type { Cargo } from '../../services/ReferenceService';
import { Dialog } from '../ui/Dialog';
import { holdRemainText, joinStamp, today } from './format';

interface Props {
  db: Db;
  voyage_id: string;
  mainVessel: string;
  holds: OgvHoldView[];
  cargoes: Cargo[];
  /** The barge of the last receipt, pre-filled — a barge usually feeds several holds. */
  lastBarge: string;
  onDone: () => Promise<void>;
  onClose: () => void;
}

/** Barge → OGV hold, bypassing the main vessel. Shows what the hold will hold after it. */
export function BargeReceiptDialog({ db, voyage_id, mainVessel, holds, cargoes, lastBarge, onDone, onClose }: Props) {
  const t = useT();
  const firstOpen = holds.find((h) => roundTo3(h.remain_tons) > 0) ?? holds[0];
  const [source, setSource] = useState(lastBarge);
  const [holdId, setHoldId] = useState(firstOpen?.id ?? '');
  const [cargoId, setCargoId] = useState('');
  const [tons, setTons] = useState('');
  const [date, setDate] = useState(today());
  const [time, setTime] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hold = holds.find((h) => h.id === holdId) ?? null;
  const qty = Number(tons);
  const qtyValid = tons.trim() !== '' && Number.isFinite(qty) && qty > 0;
  const sourceValid = source.trim() !== '';
  const after = hold && qtyValid ? hold.loaded_tons + qty : null;
  const overBy = hold && after !== null ? after - hold.planned_tons : null;

  async function submit(): Promise<void> {
    setTouched(true);
    if (!sourceValid || !qtyValid || !hold) return;
    setBusy(true);
    setError(null);
    try {
      await new OgvVesselService(db).addBargeReceipt({
        voyage_id,
        ogv_hold_id: hold.id,
        source_name: source,
        cargo_id: cargoId || null,
        tons: qty,
        started_at: joinStamp(date, time),
      });
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
      return;
    }
    await onDone().catch((e: unknown) => reportError('ogv-barge-refresh', e));
    onClose();
  }

  return (
    <Dialog
      title={t('ogv.barge.title')}
      subtitle={t('ogv.barge.subtitle', { vessel: mainVessel })}
      onClose={onClose}
      testId="ogv-barge-dialog"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="dialog-body ogv-form-body">
          <div className="ogv-form-row">
            <div className="field ogv-field-grow">
              <label className="field-label" htmlFor="barge-source">
                {t('ogv.barge.source')}
              </label>
              <input
                id="barge-source"
                className="input"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                aria-invalid={touched && !sourceValid}
                data-testid="ogv-barge-source"
              />
              {touched && !sourceValid && <span className="field-error">{t('ogv.barge.error.source')}</span>}
            </div>
            <div className="field ogv-field-hold">
              <label className="field-label" htmlFor="barge-hold">
                {t('ogv.barge.hold')}
              </label>
              <select
                id="barge-hold"
                className="input"
                value={holdId}
                onChange={(e) => setHoldId(e.target.value)}
                data-testid="ogv-barge-hold"
              >
                {holds.map((h) => (
                  <option key={h.id} value={h.id}>
                    {holdRemainText(t, h.hold_no, h.remain_tons)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="ogv-form-row">
            <div className="field ogv-field-tons">
              <label className="field-label" htmlFor="barge-tons">
                {t('ogv.barge.tons')}
              </label>
              <input
                id="barge-tons"
                className="input num"
                type="number"
                step="0.001"
                min="0.001"
                inputMode="decimal"
                placeholder="0.000"
                value={tons}
                onChange={(e) => setTons(e.target.value)}
                aria-invalid={touched && !qtyValid}
                data-testid="ogv-barge-tons"
              />
              {touched && !qtyValid && <span className="field-error">{t('ogv.barge.error.tons')}</span>}
            </div>
            <div className="field ogv-field-cargo">
              <label className="field-label" htmlFor="barge-cargo">
                {t('ogv.barge.cargo')}
              </label>
              <select id="barge-cargo" className="input" value={cargoId} onChange={(e) => setCargoId(e.target.value)}>
                <option value="">{t('ogv.barge.cargo_none')}</option>
                {cargoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field ogv-field-date">
              <label className="field-label" htmlFor="barge-date">
                {t('ogv.barge.date')}
              </label>
              <input id="barge-date" className="input mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field ogv-field-time">
              <label className="field-label" htmlFor="barge-time">
                {t('ogv.barge.time')}
              </label>
              <input id="barge-time" className="input mono" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          {hold && after !== null && overBy !== null && (
            <p className={`ogv-barge-after${roundTo3(overBy) > 0 ? ' over' : ''}`} data-testid="ogv-barge-after">
              {t('ogv.barge.after', { no: hold.hold_no, loaded: formatTons(after), plan: formatTons(hold.planned_tons) })}
              {roundTo3(overBy) > 0 && <> · {t('ogv.barge.after_over', { tons: formatTons(overBy) })}</>}
            </p>
          )}
          {error && (
            <p className="field-error" role="alert" data-testid="ogv-barge-error">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn btn-lg" onClick={onClose} disabled={busy}>
            {t('ogv.cancel')}
          </button>
          <button type="submit" className="btn btn-lg btn-primary" disabled={busy} data-testid="ogv-barge-submit">
            {t('ogv.barge.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
