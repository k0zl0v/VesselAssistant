import { useState } from 'react';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import type { DischargeInput } from '../services/types';

interface Props {
  voyage_id: string;
  hold_id: string;
  onSubmit: (input: DischargeInput) => Promise<void>;
  busy: boolean;
}

const today = (): string => new Date().toISOString().slice(0, 10);

export function DischargeForm({ voyage_id, hold_id, onSubmit, busy }: Props) {
  const t = useT();
  const [tons, setTons] = useState('');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="form-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const tonsNum = Number(tons);
        if (tonsNum <= 0) {
          setError(t('discharge.error.tons_positive'));
          return;
        }
        try {
          await onSubmit({
            voyage_id,
            hold_id,
            tons: tonsNum,
            event_date: date,
            description: description.trim() || null,
          });
          setTons('');
          setDescription('');
        } catch (err) {
          setError(describeError(err));
        }
      }}
    >
      <strong>{t('discharge.title')}</strong>
      <input
        type="number"
        step="0.001"
        min="0.001"
        placeholder={t('discharge.tons_placeholder')}
        data-testid="discharge-tons"
        value={tons}
        onChange={(e) => setTons(e.target.value)}
        required
        style={{ width: '7rem' }}
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
        data-testid="discharge-date"
      />
      <input
        type="text"
        placeholder={t('discharge.description_placeholder')}
        data-testid="discharge-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button type="submit" disabled={busy} data-testid="discharge-submit">
        {t('discharge.submit')}
      </button>
      {error && <span className="error inline" data-testid="discharge-error">{error}</span>}
    </form>
  );
}
