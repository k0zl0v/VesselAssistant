import { useState } from 'react';
import { useT } from '../i18n';
import type { Cargo } from '../services/ReferenceService';
import type { AddLotInput } from '../services/types';

const OVERLOAD_PREFIX = 'OVERLOAD:';

interface OverloadPayload {
  capacity_tons: number;
  projected_remain_tons: number;
  overshoot_tons: number;
  overloads: boolean;
  hold_id: string;
}

function parseOverload(raw: string): OverloadPayload | null {
  const idx = raw.indexOf(OVERLOAD_PREFIX);
  if (idx < 0) return null;
  try {
    return JSON.parse(raw.slice(idx + OVERLOAD_PREFIX.length)) as OverloadPayload;
  } catch {
    return null;
  }
}

interface Props {
  cargoes: Cargo[];
  voyage_id: string;
  hold_id: string;
  onSubmit: (input: AddLotInput) => Promise<void>;
  busy: boolean;
}

const PROTEIN_OPTIONS = [10.5, 11.5, 12.5, 13.5] as const;

export function AddLotForm({ cargoes, voyage_id, hold_id, onSubmit, busy }: Props) {
  const t = useT();
  const [sourceVessel, setSourceVessel] = useState('');
  const [cargoId, setCargoId] = useState(cargoes[0]?.id ?? '');
  const [sf, setSf] = useState('1.25');
  const [tons, setTons] = useState('');
  const [protein, setProtein] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (cargoes.length === 0) {
    return (
      <p
        className="hint inline"
        dangerouslySetInnerHTML={{ __html: t('lot.no_cargoes') }}
      />
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
          setError(t('lot.error.required'));
          return;
        }
        const baseInput: AddLotInput = {
          voyage_id,
          hold_id,
          cargo_id: cargoId,
          source_vessel: sourceVessel.trim(),
          sf: sfNum,
          planned_tons: tonsNum,
          loaded_tons: tonsNum,
          protein_percent: protein ? Number(protein) : null,
        };
        try {
          await onSubmit(baseInput);
          setSourceVessel('');
          setTons('');
        } catch (err) {
          // AT-05: service signals an overload via "OVERLOAD:<json>".
          // Surface the overshoot to the operator and let them confirm.
          const payload = parseOverload(String(err instanceof Error ? err.message : err));
          if (payload && payload.overloads) {
            const ok = window.confirm(
              t('lot.confirm.overload', { overshoot: payload.overshoot_tons }),
            );
            if (!ok) {
              // User cancelled — keep form values, clear any error from a prior attempt.
              setError(null);
              return;
            }
            try {
              await onSubmit({ ...baseInput, acknowledge_overload: true });
              setSourceVessel('');
              setTons('');
            } catch (err2) {
              setError(String(err2 instanceof Error ? err2.message : err2));
            }
            return;
          }
          setError(String(err instanceof Error ? err.message : err));
        }
      }}
    >
      <strong>{t('lot.title')}</strong>
      <input
        type="text"
        placeholder={t('lot.source_vessel_placeholder')}
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
          <option value="">{t('lot.protein_none')}</option>
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
        placeholder={t('lot.sf_placeholder')}
        value={sf}
        onChange={(e) => setSf(e.target.value)}
        required
        style={{ width: '5rem' }}
      />
      <input
        type="number"
        step="0.001"
        min="0.001"
        placeholder={t('lot.tons_placeholder')}
        value={tons}
        onChange={(e) => setTons(e.target.value)}
        required
        style={{ width: '7rem' }}
      />
      <button type="submit" disabled={busy}>
        {t('lot.add')}
      </button>
      {error && <span className="error inline">{error}</span>}
    </form>
  );
}
