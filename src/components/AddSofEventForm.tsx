import { useId, useState } from 'react';
import { timeToMinutes } from '../calc/time';
import { useT, type StringKey } from '../i18n';
import { describeError } from '../i18n/errors';
import type { CreateSofEventInput, SofEvent } from '../services/SofService';
import { SOF_CATEGORIES } from '../services/sofCategories';
import { Dialog } from './ui/Dialog';

export type SofEventValues = Omit<CreateSofEventInput, 'voyage_id'>;

interface Props {
  /** Present → edit mode, prefilled from the event. */
  event?: SofEvent;
  /** Date prefilled in add mode (the last logged day, else today). */
  defaultDate: string;
  onSubmit: (values: SofEventValues) => Promise<void>;
  onClose: () => void;
}

type FieldError = { field: 'date' | 'from' | 'to'; key: StringKey };

const defaultDescription = (key: string): string =>
  SOF_CATEGORIES.find((c) => c.key === key)?.defaultDescription ?? '';

function parseTime(value: string): number | null | 'invalid' {
  try {
    return timeToMinutes(value.trim() || null);
  } catch {
    return 'invalid';
  }
}

/** Client-side check with the same rules as SofService.validate, so the message names the field. */
function validate(date: string, from: string, to: string): FieldError | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { field: 'date', key: 'sof.form.error.date' };
  const a = parseTime(from);
  if (a === 'invalid') return { field: 'from', key: 'sof.form.error.time' };
  if (a === 1440) return { field: 'from', key: 'sof.form.error.from_midnight' };
  const b = parseTime(to);
  if (b === 'invalid') return { field: 'to', key: 'sof.form.error.time' };
  if (a !== null && b !== null && b < a) return { field: 'to', key: 'sof.form.error.order' };
  return null;
}

/** «Добавить событие» / «Изменить событие» dialog. */
export function AddSofEventForm({ event, defaultDate, onSubmit, onClose }: Props) {
  const t = useT();
  const id = useId();
  const firstKey = SOF_CATEGORIES[0]!.key;
  const [date, setDate] = useState(event?.event_date ?? defaultDate);
  const [timeFrom, setTimeFrom] = useState(event?.time_from ?? '');
  const [timeTo, setTimeTo] = useState(event?.time_to ?? '');
  const [category, setCategory] = useState(event ? (event.category ?? 'other') : firstKey);
  const [description, setDescription] = useState(event ? (event.description ?? '') : defaultDescription(firstKey));
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickCategory(key: string): void {
    // Replace the description only while it is still the previous template (or empty).
    if (!description.trim() || description === defaultDescription(category)) {
      setDescription(defaultDescription(key));
    }
    setCategory(key);
  }

  async function submit(): Promise<void> {
    const invalid = validate(date, timeFrom, timeTo);
    setFieldError(invalid);
    setSubmitError(null);
    if (invalid) return;
    setBusy(true);
    try {
      await onSubmit({
        event_date: date,
        time_from: timeFrom.trim() || null,
        time_to: timeTo.trim() || null,
        category,
        description: description.trim() || null,
      });
      onClose();
    } catch (err) {
      setSubmitError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const error = fieldError ? t(fieldError.key) : submitError;
  const invalid = (f: FieldError['field']) => (fieldError?.field === f ? true : undefined);
  const categoryKnown = SOF_CATEGORIES.some((c) => c.key === category);

  return (
    <Dialog
      title={t(event ? 'sof.dialog.edit_title' : 'sof.form.title')}
      subtitle={t('sof.dialog.subtitle')}
      onClose={onClose}
      testId="sof-dialog"
    >
      <form
        className="sof-form"
        data-testid="sof-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="dialog-body">
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor={`${id}-date`}>
                {t('sof.col.date')}
              </label>
              <input
                id={`${id}-date`}
                type="date"
                className="input mono"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={invalid('date')}
                data-testid="sof-form-date"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${id}-category`}>
                {t('sof.col.category')}
              </label>
              <select
                id={`${id}-category`}
                className="input"
                value={category}
                onChange={(e) => pickCategory(e.target.value)}
                data-testid="sof-form-category"
              >
                {!categoryKnown && <option value={category}>{category}</option>}
                {SOF_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {t(`sof.category.${c.key}` as StringKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${id}-from`}>
                {t('sof.col.from')}
              </label>
              <input
                id={`${id}-from`}
                type="text"
                inputMode="numeric"
                className="input time"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                placeholder={t('sof.form.from_placeholder')}
                title={t('sof.form.time_title')}
                aria-invalid={invalid('from')}
                data-testid="sof-form-from"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${id}-to`}>
                {t('sof.col.to')}
              </label>
              <input
                id={`${id}-to`}
                type="text"
                inputMode="numeric"
                className="input time"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
                placeholder={t('sof.form.to_placeholder')}
                title={t('sof.form.time_title')}
                aria-invalid={invalid('to')}
                data-testid="sof-form-to"
              />
            </div>
            <div className="field span-2">
              <label className="field-label" htmlFor={`${id}-description`}>
                {t('sof.col.description')}
              </label>
              <input
                id={`${id}-description`}
                type="text"
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('sof.form.description_placeholder')}
                data-testid="sof-form-description"
              />
            </div>
          </div>
          {error && (
            <p className="field-error" role="alert" data-testid="sof-form-error">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn" onClick={onClose} disabled={busy} data-testid="sof-form-cancel">
            {t('sof.form.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="sof-form-submit">
            {t(event ? 'sof.form.save' : 'sof.form.add')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
