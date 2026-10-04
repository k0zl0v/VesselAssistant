import { useState } from 'react';
import { formatTons } from '../../calc/round';
import { useT } from '../../i18n';
import { describeError } from '../../i18n/errors';
import type { Db } from '../../services/db';
import { OgvVesselService, type OgvHoldView, type OgvStepView } from '../../services/OgvVesselService';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { stepStateText } from './format';

interface Props {
  db: Db;
  voyage_id: string;
  holds: OgvHoldView[];
  steps: OgvStepView[];
  /** Re-reads the summary; the dialog stays open and shows the new steps. */
  onChanged: () => Promise<void>;
  onClose: () => void;
}

/** Sequence plan editor: steps in loading order, each one OGV hold with its tonnage. */
export function SequencePlanDialog({ db, voyage_id, holds, steps, onChanged, onClose }: Props) {
  const t = useT();
  const [holdId, setHoldId] = useState(holds[0]?.id ?? '');
  const [tons, setTons] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = Number(tons);
  const qtyValid = tons.trim() !== '' && Number.isFinite(qty) && qty > 0;

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(): Promise<void> {
    if (!qtyValid) {
      setError(t('ogv.seq.error.tons'));
      return;
    }
    if (await run(() => new OgvVesselService(db).addStep(voyage_id, { ogv_hold_id: holdId, planned_tons: qty, label }))) {
      setTons('');
      setLabel('');
    }
  }

  return (
    <Dialog title={t('ogv.seq.title')} subtitle={t('ogv.seq.subtitle')} onClose={onClose} wide testId="ogv-sequence-dialog">
      <div className="dialog-body ogv-form-body">
        <table className="data-table ogv-seq-table">
          <thead>
            <tr>
              <th className="col-step">{t('ogv.seq.col.step')}</th>
              <th className="col-hold">{t('ogv.seq.col.hold')}</th>
              <th className="num col-tons">{t('ogv.seq.col.tons')}</th>
              <th>{t('ogv.seq.col.label')}</th>
              <th className="col-state">{t('ogv.seq.col.state')}</th>
              <th className="col-action" />
            </tr>
          </thead>
          <tbody>
            {steps.length === 0 && (
              <tr>
                <td colSpan={6} className="ogv-faint">
                  {t('ogv.steps.empty')}
                </td>
              </tr>
            )}
            {steps.map((s, i) => (
              <tr key={s.id} data-testid={`ogv-seq-row-${i + 1}`}>
                <td className="mono">{i + 1}</td>
                <td className="mono">№{s.ogv_hold_no}</td>
                <td className="num">{formatTons(s.planned_tons)}</td>
                <td className={s.label ? undefined : 'zero'}>{s.label ?? '—'}</td>
                <td className={`ogv-seq-state ${s.state}`}>{stepStateText(t, s)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-icon btn-quiet"
                    aria-label={t('ogv.seq.delete', { n: i + 1 })}
                    onClick={() => void run(() => new OgvVesselService(db).deleteStep(voyage_id, s.id))}
                    disabled={busy}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form
          className="ogv-seq-add"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="field ogv-field-hold">
            <label className="field-label" htmlFor="seq-hold">
              {t('ogv.seq.col.hold')}
            </label>
            <select id="seq-hold" className="input" value={holdId} onChange={(e) => setHoldId(e.target.value)} data-testid="ogv-seq-hold">
              {holds.map((h) => (
                <option key={h.id} value={h.id}>
                  №{h.hold_no}
                </option>
              ))}
            </select>
          </div>
          <div className="field ogv-field-tons">
            <label className="field-label" htmlFor="seq-tons">
              {t('ogv.seq.col.tons')}
            </label>
            <input
              id="seq-tons"
              className="input num"
              type="number"
              step="0.001"
              min="0.001"
              inputMode="decimal"
              placeholder="0.000"
              value={tons}
              onChange={(e) => setTons(e.target.value)}
              data-testid="ogv-seq-tons"
            />
          </div>
          <div className="field ogv-field-grow">
            <label className="field-label" htmlFor="seq-label">
              {t('ogv.seq.col.label')}
            </label>
            <input id="seq-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} data-testid="ogv-seq-label" />
          </div>
          <button type="submit" className="btn" disabled={busy} data-testid="ogv-seq-add">
            <Icon name="plus" size={14} strokeWidth={2.2} />
            {t('ogv.seq.add')}
          </button>
        </form>
        {error && (
          <p className="field-error" role="alert" data-testid="ogv-seq-error">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-lg btn-primary" onClick={onClose} data-testid="ogv-seq-close">
          {t('ogv.seq.close')}
        </button>
      </div>
    </Dialog>
  );
}
