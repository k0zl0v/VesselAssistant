import { useEffect, useState } from 'react';
import { formatTons } from '../calc/round';
import { getDb } from '../db';
import {
  CraneCorrectionService,
  CRANE_OPERATION_TYPES,
  type CorrectionResult,
  type CraneCoefficient,
} from '../services/CraneCorrectionService';
import type { Crane, Vessel } from '../services/ReferenceService';

const SIDES = ['PORT', 'STARBOARD'] as const;

interface Props {
  cranes: Crane[];
  vessels: Vessel[];
  refresh: () => Promise<void>;
}

const today = (): string => new Date().toISOString().slice(0, 10);

export function CraneCorrectionPanel({ cranes, vessels, refresh }: Props) {
  const [coefs, setCoefs] = useState<CraneCoefficient[]>([]);
  const [filterCrane, setFilterCrane] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload(): Promise<void> {
    const db = await getDb();
    const svc = new CraneCorrectionService(db);
    const list = await svc.list(filterCrane ? { crane_id: filterCrane } : {});
    setCoefs(list);
  }

  useEffect(() => {
    reload().catch((e: unknown) => setError(String(e)));
  }, [filterCrane]);

  async function handleAdd(input: Parameters<CraneCorrectionService['create']>[0]): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const db = await getDb();
      await new CraneCorrectionService(db).create(input);
      await reload();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const craneName = (id: string): string =>
    cranes.find((c) => c.id === id)?.name ?? '?';

  return (
    <section className="reference-block">
      <h2>Crane corrections</h2>

      {cranes.length === 0 ? (
        <p className="hint inline">Add at least one crane above first.</p>
      ) : (
        <>
          <div className="filter-row">
            <label>
              Filter by crane
              <select
                value={filterCrane}
                onChange={(e) => setFilterCrane(e.target.value)}
              >
                <option value="">All cranes</option>
                {cranes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <table className="ref-table">
            <thead>
              <tr>
                <th>Crane</th>
                <th>Op type</th>
                <th>Side</th>
                <th>Vessel</th>
                <th>Valid from</th>
                <th>Valid to</th>
                <th className="num">Coefficient</th>
              </tr>
            </thead>
            <tbody>
              {coefs.length === 0 && (
                <tr>
                  <td colSpan={7} className="hint inline">
                    No coefficients yet.
                  </td>
                </tr>
              )}
              {coefs.map((c) => (
                <tr key={c.id}>
                  <td>{craneName(c.crane_id)}</td>
                  <td>{c.operation_type}</td>
                  <td>{c.side ?? 'any'}</td>
                  <td>{c.vessel_name ?? 'any'}</td>
                  <td>{c.valid_from}</td>
                  <td>{c.valid_to ?? '∞'}</td>
                  <td className="num">{c.coefficient.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <NewCoefficientForm
            cranes={cranes}
            vessels={vessels}
            onSubmit={handleAdd}
            busy={busy}
          />

          {error && <p className="error">{error}</p>}

          <hr />
          <CalculatorWidget cranes={cranes} vessels={vessels} />
        </>
      )}
    </section>
  );
}

function NewCoefficientForm({
  cranes,
  vessels,
  onSubmit,
  busy,
}: {
  cranes: Crane[];
  vessels: Vessel[];
  onSubmit: (input: Parameters<CraneCorrectionService['create']>[0]) => Promise<void>;
  busy: boolean;
}) {
  const [craneId, setCraneId] = useState(cranes[0]?.id ?? '');
  const [opType, setOpType] = useState<string>(CRANE_OPERATION_TYPES[0]);
  const [side, setSide] = useState<string>('');
  const [vesselName, setVesselName] = useState<string>('');
  const [validFrom, setValidFrom] = useState(today());
  const [validTo, setValidTo] = useState('');
  const [coef, setCoef] = useState('');

  return (
    <form
      className="form-row"
      onSubmit={async (e) => {
        e.preventDefault();
        const c = Number(coef);
        if (!craneId || !(c > 0)) return;
        await onSubmit({
          crane_id: craneId,
          operation_type: opType,
          side: side || null,
          vessel_name: vesselName || null,
          valid_from: validFrom,
          valid_to: validTo || null,
          coefficient: c,
        });
        setCoef('');
      }}
    >
      <strong>Add coefficient</strong>
      <select value={craneId} onChange={(e) => setCraneId(e.target.value)}>
        {cranes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select value={opType} onChange={(e) => setOpType(e.target.value)}>
        {CRANE_OPERATION_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select value={side} onChange={(e) => setSide(e.target.value)}>
        <option value="">any side</option>
        {SIDES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select value={vesselName} onChange={(e) => setVesselName(e.target.value)}>
        <option value="">any vessel</option>
        {vessels.map((v) => (
          <option key={v.id} value={v.name}>
            {v.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={validFrom}
        onChange={(e) => setValidFrom(e.target.value)}
        required
      />
      <input
        type="date"
        value={validTo}
        onChange={(e) => setValidTo(e.target.value)}
        placeholder="Valid to"
      />
      <input
        type="number"
        step="0.001"
        min="0.001"
        value={coef}
        onChange={(e) => setCoef(e.target.value)}
        placeholder="Coef"
        required
        style={{ width: '6rem' }}
      />
      <button type="submit" disabled={busy || !coef}>
        Add
      </button>
    </form>
  );
}

function CalculatorWidget({
  cranes,
  vessels,
}: {
  cranes: Crane[];
  vessels: Vessel[];
}) {
  const [craneId, setCraneId] = useState(cranes[0]?.id ?? '');
  const [opType, setOpType] = useState<string>(CRANE_OPERATION_TYPES[0]);
  const [side, setSide] = useState<string>('');
  const [vesselName, setVesselName] = useState<string>('');
  const [date, setDate] = useState(today());
  const [scaleWeight, setScaleWeight] = useState('');
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function calc(): Promise<void> {
    setError(null);
    setResult(null);
    const sw = Number(scaleWeight);
    if (!(sw > 0)) {
      setError('Scale weight must be > 0');
      return;
    }
    try {
      const db = await getDb();
      const r = await new CraneCorrectionService(db).correctWeight(sw, {
        crane_id: craneId,
        operation_type: opType,
        side: side || null,
        vessel_name: vesselName || null,
        date,
      });
      setResult(r);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="calculator">
      <h3>Correction calculator</h3>
      <form
        className="form-row"
        onSubmit={(e) => {
          e.preventDefault();
          void calc();
        }}
      >
        <select value={craneId} onChange={(e) => setCraneId(e.target.value)}>
          {cranes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={opType} onChange={(e) => setOpType(e.target.value)}>
          {CRANE_OPERATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={side} onChange={(e) => setSide(e.target.value)}>
          <option value="">any side</option>
          {SIDES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={vesselName} onChange={(e) => setVesselName(e.target.value)}>
          <option value="">any vessel</option>
          {vessels.map((v) => (
            <option key={v.id} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        <input
          type="number"
          step="0.001"
          min="0.001"
          value={scaleWeight}
          onChange={(e) => setScaleWeight(e.target.value)}
          placeholder="Scale weight"
          required
          style={{ width: '8rem' }}
        />
        <button type="submit">Calculate</button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <dl className="totals">
          <div>
            <dt>Scale weight</dt>
            <dd>{formatTons(result.scale_weight)} t</dd>
          </div>
          <div>
            <dt>Coefficient</dt>
            <dd>{result.coefficient.toFixed(3)}</dd>
          </div>
          <div>
            <dt>Corrected weight</dt>
            <dd>{formatTons(result.corrected_weight)} t</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
