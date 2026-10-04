import { useId, useState } from 'react';
import { formatTons } from '../../calc/round';
import { useT, type StringKey } from '../../i18n';
import { describeError } from '../../i18n/errors';
import type { SofTimeSheet, SofTimeSheetInput } from '../../services/SofTimeSheetService';
import { Dialog } from '../ui/Dialog';

interface Props {
  sheet: SofTimeSheet | null;
  /** Total discharged by the log — a hint next to the bill weight, never copied silently. */
  dischargedTons: number;
  onSubmit: (values: SofTimeSheetInput) => Promise<void>;
  onClose: () => void;
}

type TextKey = Exclude<keyof SofTimeSheetInput, 'bill_weight_tons'>;

const TEXT_FIELDS: { key: TextKey; label: StringKey; placeholder?: StringKey; wide?: boolean }[] = [
  { key: 'shipping_company', label: 'sof.sheet.field.1' },
  { key: 'charter_party', label: 'sof.sheet.field.13' },
  { key: 'cargo_description', label: 'sof.sheet.field.8', wide: true },
  { key: 'cargo_documents_on_board', label: 'sof.sheet.field.11', placeholder: 'sof.sheet.dialog.docs_placeholder' },
  { key: 'nor_accepted_note', label: 'sof.sheet.dialog.nor_note', placeholder: 'sof.sheet.dialog.nor_note_placeholder' },
];

/** `2 001.000`, `2001,5` → number; blank → null; anything else → NaN. */
function parseTons(raw: string): number | null {
  const s = raw.replace(/[\s ]/g, '').replace(',', '.');
  if (s === '') return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

/** Edits the header fields kept in `sof_time_sheets`; the rest of the header is derived. */
export function SofTimeSheetDialog({ sheet, dischargedTons, onSubmit, onClose }: Props) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState<Record<TextKey, string>>({
    shipping_company: sheet?.shipping_company ?? '',
    charter_party: sheet?.charter_party ?? '',
    cargo_description: sheet?.cargo_description ?? '',
    cargo_documents_on_board: sheet?.cargo_documents_on_board ?? '',
    nor_accepted_note: sheet?.nor_accepted_note ?? '',
  });
  const [weight, setWeight] = useState(sheet?.bill_weight_tons == null ? '' : String(sheet.bill_weight_tons));
  const [weightError, setWeightError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    const tons = parseTons(weight);
    const invalid = tons !== null && Number.isNaN(tons);
    setWeightError(invalid);
    setSubmitError(null);
    if (invalid) return;
    setBusy(true);
    try {
      await onSubmit({ ...text, bill_weight_tons: tons });
      onClose();
    } catch (err) {
      setSubmitError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t('sof.sheet.dialog.title')}
      subtitle={t('sof.sheet.dialog.subtitle')}
      onClose={onClose}
      testId="sof-sheet-dialog"
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
            {TEXT_FIELDS.map((f) => (
              <div key={f.key} className={`field${f.wide ? ' span-2' : ''}`}>
                <label className="field-label" htmlFor={`${id}-${f.key}`}>
                  {t(f.label)}
                </label>
                <input
                  id={`${id}-${f.key}`}
                  type="text"
                  className="input"
                  value={text[f.key]}
                  onChange={(e) => setText({ ...text, [f.key]: e.target.value })}
                  placeholder={f.placeholder ? t(f.placeholder) : undefined}
                  data-testid={`sof-sheet-input-${f.key}`}
                />
              </div>
            ))}
            <div className="field">
              <label className="field-label" htmlFor={`${id}-weight`}>
                {t('sof.sheet.field.14')}, {t('sof.sheet.dialog.weight_unit')}
              </label>
              <input
                id={`${id}-weight`}
                type="text"
                inputMode="decimal"
                className="input num"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                aria-invalid={weightError || undefined}
                aria-describedby={`${id}-weight-hint`}
                data-testid="sof-sheet-input-bill_weight_tons"
              />
              <span className="field-hint" id={`${id}-weight-hint`}>
                {t('sof.sheet.dialog.weight_hint', { tons: formatTons(dischargedTons) })}
              </span>
            </div>
          </div>
          {(weightError || submitError) && (
            <p className="field-error" role="alert" data-testid="sof-sheet-error">
              {weightError ? t('sof.sheet.dialog.error.weight') : submitError}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t('sof.sheet.dialog.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="sof-sheet-submit">
            {t('sof.sheet.dialog.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
