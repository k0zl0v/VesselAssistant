import { useState } from 'react';
import { getDb } from '../../db';
import { useT } from '../../i18n';
import { describeError } from '../../i18n/errors';
import { CraneShiftService, type CraneMode } from '../../services/CraneShiftService';
import type { Crane } from '../../services/ReferenceService';
import { Dialog } from '../ui/Dialog';
import { MODE_META, parseDecimal } from './modes';

interface Props {
  mode: CraneMode;
  crane: Crane;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

/** «+ Замер»: one (vessel, date, coefficient) line of the history. */
export function AddMeasurementDialog({ mode, crane, defaultDate, onClose, onSaved }: Props) {
  const t = useT();
  const [vessel, setVessel] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [k, setK] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const kValue = parseDecimal(k);
  const kError = kValue === null || Number.isNaN(kValue) || kValue <= 0 ? t('cranes.error.k') : null;
  const dateError = date ? null : t('cranes.error.date');

  async function submit(): Promise<void> {
    setTouched(true);
    if (kError || dateError || kValue === null) return;
    setBusy(true);
    setError(null);
    try {
      await new CraneShiftService(await getDb()).addMeasurement({
        crane_id: crane.id,
        mode,
        vessel_name: vessel,
        measured_on: date,
        coefficient: kValue,
        note: note.trim() || null,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t('cranes.measure.title')}
      subtitle={t('cranes.measure.subtitle', { mode: t(MODE_META[mode].label), crane: crane.name })}
      onClose={onClose}
      testId="cranes-measure-dialog"
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="dialog-body">
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="cranes-nm-vessel">{t('cranes.measure.vessel')}</label>
              <input id="cranes-nm-vessel" className="input" value={vessel} onChange={(e) => setVessel(e.target.value)} autoFocus data-testid="cranes-nm-vessel" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="cranes-nm-date">{t('cranes.measure.date')}</label>
              <input id="cranes-nm-date" className="input mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              {touched && dateError && <p className="field-error">{dateError}</p>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="cranes-nm-k">{t('cranes.measure.k')}</label>
              <input
                id="cranes-nm-k"
                className="input mono"
                inputMode="decimal"
                value={k}
                onChange={(e) => setK(e.target.value)}
                aria-invalid={touched && kError !== null}
                data-testid="cranes-nm-k"
              />
              {touched && kError && <p className="field-error">{kError}</p>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="cranes-nm-note">{`${t('cranes.measure.note')} (${t('cranes.optional')})`}</label>
              <input id="cranes-nm-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn" onClick={onClose}>
            {t('cranes.history.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="cranes-nm-submit">
            {t('cranes.history.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
