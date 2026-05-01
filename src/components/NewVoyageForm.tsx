import { useState } from 'react';
import type { Vessel } from '../services/ReferenceService';

interface Props {
  vessels: Vessel[];
  onSubmit: (input: { vessel_id: string; voyage_no: string }) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}

export function NewVoyageForm({ vessels, onSubmit, onCancel, busy }: Props) {
  const [vesselId, setVesselId] = useState(vessels[0]?.id ?? '');
  const [voyageNo, setVoyageNo] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (vessels.length === 0) {
    return (
      <div className="form-panel">
        <p>
          You need at least one vessel. Add one in <strong>Reference</strong>{' '}
          first.
        </p>
        <button type="button" onClick={onCancel} className="secondary">
          Close
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
      <h3>New voyage</h3>
      <label>
        Vessel
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
        Voyage No
        <input
          type="text"
          value={voyageNo}
          onChange={(e) => setVoyageNo(e.target.value)}
          required
          placeholder="V-001"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy || !voyageNo.trim()}>
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="secondary"
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
