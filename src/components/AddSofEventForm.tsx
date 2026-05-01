import { useState } from 'react';
import { t as translate, useT, type StringKey } from '../i18n';
import type { CreateSofEventInput } from '../services/SofService';
import { SOF_CATEGORIES } from '../services/sofCategories';

interface Props {
  voyage_id: string;
  onSubmit: (input: CreateSofEventInput) => Promise<void>;
  busy: boolean;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const categoryLabelKey = (key: string): StringKey =>
  `sof.category.${key}` as StringKey;

export function AddSofEventForm({ voyage_id, onSubmit, busy }: Props) {
  const t = useT();
  const [date, setDate] = useState(today());
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [category, setCategory] = useState(SOF_CATEGORIES[0]!.key);
  const [description, setDescription] = useState(SOF_CATEGORIES[0]!.defaultDescription);
  const [error, setError] = useState<string | null>(null);

  function applyTemplate(key: string): void {
    setCategory(key);
    const tpl = SOF_CATEGORIES.find((c) => c.key === key);
    if (tpl) setDescription(tpl.defaultDescription);
  }

  return (
    <form
      className="form-row sof-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onSubmit({
            voyage_id,
            event_date: date,
            time_from: timeFrom || null,
            time_to: timeTo || null,
            category,
            description: description.trim() || null,
          });
          setTimeFrom('');
          setTimeTo('');
        } catch (err) {
          setError(String(err));
        }
      }}
    >
      <strong>{t('sof.form.title')}</strong>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
      />
      <input
        type="text"
        value={timeFrom}
        onChange={(e) => setTimeFrom(e.target.value)}
        placeholder={t('sof.form.from_placeholder')}
        pattern="\d{1,2}:\d{2}"
        title={t('sof.form.time_title')}
        style={{ width: '6.5rem' }}
      />
      <input
        type="text"
        value={timeTo}
        onChange={(e) => setTimeTo(e.target.value)}
        placeholder={t('sof.form.to_placeholder')}
        pattern="\d{1,2}:\d{2}"
        title={t('sof.form.time_title')}
        style={{ width: '6.5rem' }}
      />
      <select value={category} onChange={(e) => applyTemplate(e.target.value)}>
        {SOF_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {translate(categoryLabelKey(c.key))}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('sof.form.description_placeholder')}
        style={{ flex: 1, minWidth: '14rem' }}
      />
      <button type="submit" disabled={busy}>
        {t('sof.form.add')}
      </button>
      {error && <span className="error inline">{error}</span>}
    </form>
  );
}
