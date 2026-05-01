import { useState } from 'react';
import type { Cargo } from '../services/ReferenceService';
import type { AddLotInput } from '../services/types';

interface Props {
  cargoes: Cargo[];
  voyage_id: string;
  hold_id: string;
  onSubmit: (input: AddLotInput) => Promise<void>;
  busy: boolean;
}

const PROTEIN_OPTIONS = [10.5, 11.5, 12.5, 13.5] as const;

export function AddLotForm({ cargoes, voyage_id, hold_id, onSubmit, busy }: Props) {
  const [sourceVessel, setSourceVessel] = useState('');
  const [cargoId, setCargoId] = useState(cargoes[0]?.id ?? '');
  const [sf, setSf] = useState('1.25');
  const [tons, setTons] = useState('');
  const [protein, setProtein] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (cargoes.length === 0) {
    return (
      <p className="hint inline">
        Add at least one cargo in <strong>Reference</strong> first.
      </p>
    );
  }

  const cargoIsWheat = cargoes.find((c) => c.id === cargoId)?.name.toLowerCase().includes('wheat');

  return (
    <form
      className="form-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const sfNum = Number(sf);
        const tonsNum = Number(tons);
        if (!sourceVessel.trim() || sfNum <= 0 || tonsNum <= 0) {
          setError('Source vessel, SF > 0 and tons > 0 are required');
          return;
        }
        try {
          await onSubmit({
            voyage_id,
            hold_id,
            cargo_id: cargoId,
            source_vessel: sourceVessel.trim(),
            sf: sfNum,
            planned_tons: tonsNum,
            loaded_tons: tonsNum,
            protein_percent: protein ? Number(protein) : null,
          });
          setSourceVessel('');
          setTons('');
        } catch (err) {
          setError(String(err));
        }
      }}
    >
      <strong>Add lot</strong>
      <input
        type="text"
        placeholder="Source vessel"
        value={sourceVessel}
        onChange={(e) => setSourceVessel(e.target.value)}
        required
      />
      <select value={cargoId} onChange={(e) => setCargoId(e.target.value)}>
        {cargoes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {cargoIsWheat && (
        <select value={protein} onChange={(e) => setProtein(e.target.value)}>
          <option value="">Protein —</option>
          {PROTEIN_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p.toFixed(1)} %
            </option>
          ))}
        </select>
      )}
      <input
        type="number"
        step="0.001"
        min="0.001"
        placeholder="SF"
        value={sf}
        onChange={(e) => setSf(e.target.value)}
        required
        style={{ width: '5rem' }}
      />
      <input
        type="number"
        step="0.001"
        min="0.001"
        placeholder="Tons"
        value={tons}
        onChange={(e) => setTons(e.target.value)}
        required
        style={{ width: '7rem' }}
      />
      <button type="submit" disabled={busy}>
        Add
      </button>
      {error && <span className="error inline">{error}</span>}
    </form>
  );
}
