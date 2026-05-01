import { useEffect, useState } from 'react';
import { formatTons } from '../calc/round';
import { getDb } from '../db';
import { useT } from '../i18n';
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
  const t = useT();
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
      <h2>{t('crane.title')}</h2>

      {cranes.length === 0 ? (
        <p className="hint inline">{t('crane.no_cranes_hint')}</p>
      ) : (
        <>
          <div className="filter-row">
            <label>
              {t('crane.filter.label')}
              <select
                value={filterCrane}
                onChange={(e) => setFilterCrane(e.target.value)}
              >
                <option value="">{t('crane.filter.all')}</option>
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
                <th>{t('crane.col.crane')}</th>
                <th>{t('crane.col.op_type')}</th>
                <th>{t('crane.col.side')}</th>
                <th>{t('crane.col.vessel')}</th>
                <th>{t('crane.col.valid_from')}</th>
                <th>{t('crane.col.valid_to')}</th>
                <th className="num">{t('crane.col.coefficient')}</th>
              </tr>
            </thead>
            <tbody>
              {coefs.length === 0 && (
                <tr>
                  <td colSpan={7} className="hint inline">
                    {t('crane.empty')}
                  </td>
                </tr>
              )}
              {coefs.map((c) => (
                <tr key={c.id}>
                  <td>{craneName(c.crane_id)}</td>
                  <td>{c.operation_type}</td>
                  <td>{c.side ?? t('crane.side.any')}</td>
                  <td>{c.vessel_name ?? t('crane.vessel.any')}</td>
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
  const t = useT();
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
      <strong>{t('crane.add_title')}</strong>
      <select value={craneId} onChange={(e) => setCraneId(e.target.value)}>
        {cranes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select value={opType} onChange={(e) => setOpType(e.target.value)}>
        {CRANE_OPERATION_TYPES.map((tp) => (
          <option key={tp} value={tp}>
            {tp}
          </option>
        ))}
      </select>
      <select value={side} onChange={(e) => setSide(e.target.value)}>
        <option value="">{t('crane.side.any_option')}</option>
        {SIDES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select value={vesselName} onChange={(e) => setVesselName(e.target.value)}>
        <option value="">{t('crane.vessel.any_option')}</option>
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
        placeholder={t('crane.valid_to_placeholder')}
      />
      <input
        type="number"
        step="0.001"
        min="0.001"
        value={coef}
        onChange={(e) => setCoef(e.target.value)}
        placeholder={t('crane.coef_placeholder')}
        required
        style={{ width: '6rem' }}
      />
      <button type="submit" disabled={busy || !coef}>
        {t('crane.add')}
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
  const t = useT();
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
      setError(t('crane.calc.error.scale_positive'));
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

  const unit = t('crane.calc.unit_t');

  return (
    <div className="calculator">
      <h3>{t('crane.calc.title')}</h3>
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
          {CRANE_OPERATION_TYPES.map((tp) => (
            <option key={tp} value={tp}>
              {tp}
            </option>
          ))}
        </select>
        <select value={side} onChange={(e) => setSide(e.target.value)}>
          <option value="">{t('crane.side.any_option')}</option>
          {SIDES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={vesselName} onChange={(e) => setVesselName(e.target.value)}>
          <option value="">{t('crane.vessel.any_option')}</option>
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
          placeholder={t('crane.calc.scale_weight_placeholder')}
          required
          style={{ width: '8rem' }}
        />
        <button type="submit">{t('crane.calc.calculate')}</button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <dl className="totals">
          <div>
            <dt>{t('crane.calc.scale_weight')}</dt>
            <dd>{formatTons(result.scale_weight)} {unit}</dd>
          </div>
          <div>
            <dt>{t('crane.calc.coefficient')}</dt>
            <dd>{result.coefficient.toFixed(3)}</dd>
          </div>
          <div>
            <dt>{t('crane.calc.corrected_weight')}</dt>
            <dd>{formatTons(result.corrected_weight)} {unit}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
