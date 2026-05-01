import { useState } from 'react';
import { useT } from '../i18n';
import type { Vessel } from '../services/ReferenceService';

interface Props {
  vessels: Vessel[];
  onSubmit: (input: { vessel_id: string; voyage_no: string }) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}

export function NewVoyageForm({ vessels, onSubmit, onCancel, busy }: Props) {
  const t = useT();
  const [vesselId, setVesselId] = useState(vessels[0]?.id ?? '');
  const [voyageNo, setVoyageNo] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (vessels.length === 0) {
    return (
      <div className="form-panel">
        <p dangerouslySetInnerHTML={{ __html: t('voyage.form.no_vessels') }} />
        <button type="button" onClick={onCancel} className="secondary">
          {t('voyage.form.close')}
        </button>
      </div>
    );
  }

  return (
    <form
      className="form-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onSubmit({ vessel_id: vesselId, voyage_no: voyageNo.trim() });
        } catch (err) {
          setError(String(err));
        }
      }}
    >
      <h3>{t('voyage.form.title')}</h3>
      <label>
        {t('voyage.form.vessel')}
        <select
          value={vesselId}
          onChange={(e) => setVesselId(e.target.value)}
          required
        >
          {vessels.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('voyage.form.voyage_no')}
        <input
          type="text"
          value={voyageNo}
          onChange={(e) => setVoyageNo(e.target.value)}
          required
          placeholder={t('voyage.form.voyage_no_placeholder')}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy || !voyageNo.trim()}>
          {t('voyage.form.create')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="secondary"
          disabled={busy}
        >
          {t('voyage.form.cancel')}
        </button>
      </div>
    </form>
  );
}
