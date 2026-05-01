import { useState } from 'react';
import type { CreateSofEventInput } from '../services/SofService';
import { SOF_CATEGORIES } from '../services/sofCategories';

interface Props {
  voyage_id: string;
  onSubmit: (input: CreateSofEventInput) => Promise<void>;
  busy: boolean;
}

const today = (): string => new Date().toISOString().slice(0, 10);

export function AddSofEventForm({ voyage_id, onSubmit, busy }: Props) {
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
      <strong>Add event</strong>
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
        placeholder="From HH:MM"
        pattern="\d{1,2}:\d{2}"
        title="HH:MM (24:00 allowed as end-of-day)"
        style={{ width: '6.5rem' }}
      />
      <input
        type="text"
        value={timeTo}
        onChange={(e) => setTimeTo(e.target.value)}
        placeholder="To HH:MM"
        pattern="\d{1,2}:\d{2}"
        title="HH:MM (24:00 allowed as end-of-day)"
        style={{ width: '6.5rem' }}
      />
      <select value={category} onChange={(e) => applyTemplate(e.target.value)}>
        {SOF_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        style={{ flex: 1, minWidth: '14rem' }}
      />
      <button type="submit" disabled={busy}>
        Add
      </button>
      {error && <span className="error inline">{error}</span>}
    </form>
  );
}
