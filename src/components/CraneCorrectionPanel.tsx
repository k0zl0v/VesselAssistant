import { useEffect, useRef, useState } from 'react';
import { formatTons } from '../calc/round';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import {
  CraneCorrectionService,
  CRANE_OPERATION_TYPES,
  type CorrectionResult,
  type CraneCoefficient,
} from '../services/CraneCorrectionService';
import type { Crane, Vessel } from '../services/ReferenceService';
import { formatDate, formatDateRange } from '../shell/format';
import { FormDialog } from './reference/FormDialog';
import { EmptyState, ErrorState } from './ui/states';

const SIDES = ['PORT', 'STARBOARD'] as const;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Props {
  cranes: Crane[];
  coefficients: CraneCoefficient[];
  vessels: Vessel[];
  /** Vessel of the selected voyage — the calculator's default. */
  defaultVesselName: string | null;
  onChanged: () => Promise<void>;
  onOpenCranes: () => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

// findCoefficient throws a plain Error when nothing is active on the date;
// that is the «blocked» outcome, anything else is a real failure.
const isNoCoefficient = (e: unknown): boolean =>
  e instanceof Error && e.message.startsWith('No active crane coefficient');

export function CraneCorrectionPanel({ cranes, coefficients, vessels, defaultVesselName, onChanged, onOpenCranes }: Props) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const craneName = (id: string): string => cranes.find((c) => c.id === id)?.name ?? '—';
  const sorted = [...coefficients].sort(
    (a, b) =>
      craneName(a.crane_id).localeCompare(craneName(b.crane_id)) ||
      a.operation_type.localeCompare(b.operation_type) ||
      (a.side ?? '').localeCompare(b.side ?? '') ||
      b.valid_from.localeCompare(a.valid_from),
  );

  if (cranes.length === 0) {
    return (
      <section className="table-card refs-crane" data-testid="crane-panel">
        <div className="refs-crane-main">
          <div className="refs-card-head">
            <h2 className="card-title">{t('refs.coefs.title')}</h2>
          </div>
          <div className="refs-card-empty">
            <EmptyState
              icon="import"
              title={t('refs.coefs.no_cranes.title')}
              text={t('refs.coefs.no_cranes.text')}
              actions={
                <button type="button" className="btn btn-primary" onClick={onOpenCranes} data-testid="crane-to-cranes">
                  {t('refs.coefs.to_cranes')}
                </button>
              }
              testId="crane-no-cranes"
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="table-card refs-crane" data-testid="crane-panel">
      <div className="refs-crane-main">
        <div className="refs-card-head">
          <h2 className="card-title">{t('refs.coefs.title')}</h2>
          <span className="toolbar-spacer" />
          <button type="button" className="btn btn-sm refs-add" onClick={() => setAdding(true)} data-testid="crane-add-coef">
            {t('refs.coefs.add')}
          </button>
        </div>
        {sorted.length === 0 ? (
          <div className="refs-card-empty">
            <EmptyState
              icon="table"
              title={t('refs.coefs.empty.title')}
              text={t('refs.coefs.empty.text')}
              actions={
                <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                  {t('refs.coefs.add')}
                </button>
              }
              testId="crane-coefs-empty"
            />
          </div>
        ) : (
          <table className="data-table refs-coef-table" data-testid="crane-coefs-table">
            <thead>
              <tr>
                <th>{t('refs.coefs.col.crane')}</th>
                <th>{t('refs.coefs.col.side')}</th>
                <th>{t('refs.coefs.col.op')}</th>
                <th className="num">{t('refs.coefs.col.k')}</th>
                <th>{t('refs.coefs.col.valid')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id} className={c.id === pickedId ? 'refs-picked' : undefined} data-testid={`crane-coef-${c.id}`}>
                  <td className="refs-crane-name">
                    {craneName(c.crane_id)}
                    {c.vessel_name && <span className="cell-sub">{t('refs.coefs.vessel_only', { vessel: c.vessel_name })}</span>}
                  </td>
                  <td className="muted refs-small">{c.side ?? t('refs.coefs.side_any')}</td>
                  <td className="muted refs-small refs-upper">{c.operation_type}</td>
                  <td className="num refs-k">{formatTons(c.coefficient)}</td>
                  <td className="mono refs-valid">{validity(c, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Calculator
        cranes={cranes}
        coefficients={coefficients}
        vessels={vessels}
        defaultVesselName={defaultVesselName}
        onPicked={setPickedId}
      />

      {adding && (
        <NewCoefficientDialog cranes={cranes} vessels={vessels} onClose={() => setAdding(false)} onCreated={onChanged} />
      )}
    </section>
  );
}

function validity(c: CraneCoefficient, t: ReturnType<typeof useT>): string {
  return c.valid_to ? formatDateRange(c.valid_from, c.valid_to)! : t('refs.coefs.valid_from', { date: formatDate(c.valid_from) });
}

type CalcState =
  | { kind: 'idle' }
  | { kind: 'invalid' }
  | { kind: 'ok'; result: CorrectionResult }
  | { kind: 'blocked' }
  | { kind: 'error'; message: string };

function Calculator({
  cranes,
  coefficients,
  vessels,
  defaultVesselName,
  onPicked,
}: {
  cranes: Crane[];
  coefficients: CraneCoefficient[];
  vessels: Vessel[];
  defaultVesselName: string | null;
  onPicked: (id: string | null) => void;
}) {
  const t = useT();
  const firstWithCoef = cranes.find((c) => coefficients.some((k) => k.crane_id === c.id)) ?? cranes[0];
  const [craneId, setCraneId] = useState(firstWithCoef?.id ?? '');
  const [side, setSide] = useState<string>(SIDES[0]);
  const [opType, setOpType] = useState<string>(CRANE_OPERATION_TYPES[0]);
  const [date, setDate] = useState(today());
  const [vesselName, setVesselName] = useState(defaultVesselName ?? '');
  const [scale, setScale] = useState('');
  const [state, setState] = useState<CalcState>({ kind: 'idle' });
  const seq = useRef(0);

  // The voyage may finish loading after the panel mounted.
  useEffect(() => {
    if (defaultVesselName) setVesselName((v) => v || defaultVesselName);
  }, [defaultVesselName]);

  // A crane deleted/added elsewhere must not leave the select pointing nowhere.
  const crane = cranes.find((c) => c.id === craneId) ?? cranes[0];

  useEffect(() => {
    const mine = ++seq.current;
    const sw = Number(scale);
    if (!crane || scale.trim() === '' || !ISO_DATE_RE.test(date)) {
      setState({ kind: 'idle' });
      onPicked(null);
      return;
    }
    if (!(sw > 0)) {
      setState({ kind: 'invalid' });
      onPicked(null);
      return;
    }
    void (async () => {
      try {
        const r = await new CraneCorrectionService(await getDb()).correctWeight(sw, {
          crane_id: crane.id,
          operation_type: opType,
          side: side || null,
          vessel_name: vesselName || null,
          date,
        });
        if (mine !== seq.current) return;
        setState({ kind: 'ok', result: r });
        onPicked(r.coefficient_id);
      } catch (e) {
        if (mine !== seq.current) return;
        setState(isNoCoefficient(e) ? { kind: 'blocked' } : { kind: 'error', message: describeError(e) });
        onPicked(null);
      }
    })();
    // coefficients: a new coefficient may unblock the current inputs.
  }, [crane, opType, side, vesselName, date, scale, coefficients, onPicked]);

  const picked = state.kind === 'ok' ? coefficients.find((c) => c.id === state.result.coefficient_id) : undefined;
  const unit = t('refs.unit_t');
  const sideLabel = side || t('refs.calc.side_none');

  return (
    <aside className="refs-calc" aria-labelledby="refs-calc-title" data-testid="crane-calc">
      <h2 id="refs-calc-title" className="card-title">
        {t('refs.calc.title')}
      </h2>
      <div className="refs-calc-row">
        <div className="field refs-grow">
          <label className="field-label refs-micro-label" htmlFor="crane-calc-crane">{t('refs.calc.crane')}</label>
          <select id="crane-calc-crane" className="input" value={crane?.id ?? ''} onChange={(e) => setCraneId(e.target.value)} data-testid="crane-calc-crane">
            {cranes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field refs-calc-narrow">
          <label className="field-label refs-micro-label" htmlFor="crane-calc-side">{t('refs.calc.side')}</label>
          <select id="crane-calc-side" className="input" value={side} onChange={(e) => setSide(e.target.value)} data-testid="crane-calc-side">
            {SIDES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="">{t('refs.calc.side_none')}</option>
          </select>
        </div>
      </div>
      <div className="refs-calc-row">
        <div className="field refs-grow">
          <label className="field-label refs-micro-label" htmlFor="crane-calc-op">{t('refs.calc.op')}</label>
          <select id="crane-calc-op" className="input" value={opType} onChange={(e) => setOpType(e.target.value)} data-testid="crane-calc-op">
            {CRANE_OPERATION_TYPES.map((o) => (
              <option key={o} value={o}>{o.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <div className="field refs-calc-narrow">
          <label className="field-label refs-micro-label" htmlFor="crane-calc-date">{t('refs.calc.date')}</label>
          <input id="crane-calc-date" type="date" className="input mono refs-date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="crane-calc-date" />
        </div>
      </div>
      <div className="field">
        <label className="field-label refs-micro-label" htmlFor="crane-calc-vessel">{t('refs.calc.vessel')}</label>
        <select id="crane-calc-vessel" className="input" value={vesselName} onChange={(e) => setVesselName(e.target.value)} data-testid="crane-calc-vessel">
          <option value="">{t('refs.calc.vessel_none')}</option>
          {vessels.map((v) => (
            <option key={v.id} value={v.name}>{v.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label refs-micro-label" htmlFor="crane-calc-scale">{t('refs.calc.scale')}</label>
        <input
          id="crane-calc-scale"
          type="number"
          step="0.001"
          min="0"
          inputMode="decimal"
          className="input num"
          value={scale}
          onChange={(e) => setScale(e.target.value)}
          aria-invalid={state.kind === 'invalid'}
          data-testid="crane-calc-scale"
        />
        {state.kind === 'invalid' && <p className="field-error">{t('refs.calc.error.scale')}</p>}
      </div>

      {state.kind === 'blocked' ? (
        <ErrorState
          title={t('refs.calc.blocked.title')}
          message={t('refs.calc.blocked.text', {
            date: formatDate(date),
            crane: crane?.name ?? '—',
            side: sideLabel,
            op: opType.toUpperCase(),
          })}
          testId="crane-calc-blocked"
        />
      ) : state.kind === 'error' ? (
        <ErrorState title={t('refs.calc.blocked.title')} message={state.message} testId="crane-calc-error" />
      ) : (
        <div className="refs-calc-result" data-testid="crane-calc-result">
          <div className="metric-label">{t('refs.calc.result')}</div>
          <div className="refs-calc-value" data-testid="crane-calc-value">
            {state.kind === 'ok' ? formatTons(state.result.corrected_weight) : '—'}
            <span className="metric-unit">{unit}</span>
          </div>
          <div className="refs-calc-formula" data-testid="crane-calc-formula">
            {state.kind === 'ok'
              ? `${formatTons(state.result.scale_weight)} ÷ ${formatTons(state.result.coefficient)}`
              : t('refs.calc.enter_weight')}
          </div>
        </div>
      )}

      <p className="refs-calc-note" data-testid="crane-calc-note">
        {picked &&
          t('refs.calc.picked', {
            k: formatTons(picked.coefficient),
            crane: crane?.name ?? '—',
            side: picked.side ?? t('refs.coefs.side_any'),
            op: picked.operation_type.toUpperCase(),
            vessel: picked.vessel_name ? t('refs.calc.picked_vessel', { vessel: picked.vessel_name }) : '',
            valid: validity(picked, t),
          }) + ' '}
        {t('refs.calc.block_rule')}
      </p>
    </aside>
  );
}

function NewCoefficientDialog({
  cranes,
  vessels,
  onClose,
  onCreated,
}: {
  cranes: Crane[];
  vessels: Vessel[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const t = useT();
  const [craneId, setCraneId] = useState(cranes[0]?.id ?? '');
  const [opType, setOpType] = useState<string>(CRANE_OPERATION_TYPES[0]);
  const [side, setSide] = useState('');
  const [vesselName, setVesselName] = useState('');
  const [validFrom, setValidFrom] = useState(today());
  const [validTo, setValidTo] = useState('');
  const [coef, setCoef] = useState('');

  return (
    <FormDialog
      title={t('refs.coefs.dialog.title')}
      subtitle={t('refs.coefs.dialog.subtitle')}
      onClose={onClose}
      testId="crane-coef-dialog"
      validate={() => {
        if (!ISO_DATE_RE.test(validFrom)) return t('refs.coefs.error.from');
        if (validTo && validTo < validFrom) return t('refs.coefs.error.to');
        if (!(Number(coef) > 0)) return t('refs.coefs.error.k');
        return null;
      }}
      submit={async () => {
        await new CraneCorrectionService(await getDb()).create({
          crane_id: craneId,
          operation_type: opType,
          side: side || null,
          vessel_name: vesselName || null,
          valid_from: validFrom,
          valid_to: validTo || null,
          coefficient: Number(coef),
        });
        await onCreated();
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor="crane-nc-crane">{t('refs.coefs.crane')}</label>
          <select id="crane-nc-crane" className="input" value={craneId} onChange={(e) => setCraneId(e.target.value)} data-testid="crane-nc-crane">
            {cranes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="crane-nc-op">{t('refs.coefs.op')}</label>
          <select id="crane-nc-op" className="input" value={opType} onChange={(e) => setOpType(e.target.value)} data-testid="crane-nc-op">
            {CRANE_OPERATION_TYPES.map((o) => (
              <option key={o} value={o}>{o.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="crane-nc-side">{t('refs.coefs.side')}</label>
          <select id="crane-nc-side" className="input" value={side} onChange={(e) => setSide(e.target.value)} data-testid="crane-nc-side">
            <option value="">{t('refs.coefs.side_any')}</option>
            {SIDES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="crane-nc-vessel">{t('refs.coefs.vessel')}</label>
          <select id="crane-nc-vessel" className="input" value={vesselName} onChange={(e) => setVesselName(e.target.value)} data-testid="crane-nc-vessel">
            <option value="">{t('refs.coefs.vessel_any')}</option>
            {vessels.map((v) => (
              <option key={v.id} value={v.name}>{v.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="crane-nc-from">{t('refs.coefs.valid_from_label')}</label>
          <input id="crane-nc-from" type="date" className="input mono" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} data-testid="crane-nc-from" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="crane-nc-to">{t('refs.coefs.valid_to_label')}</label>
          <input id="crane-nc-to" type="date" className="input mono" value={validTo} onChange={(e) => setValidTo(e.target.value)} data-testid="crane-nc-to" />
          <p className="field-hint">{t('refs.coefs.valid_to_hint')}</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="crane-nc-k">{t('refs.coefs.k')}</label>
          <input id="crane-nc-k" type="number" step="0.001" min="0" inputMode="decimal" className="input num" value={coef} onChange={(e) => setCoef(e.target.value)} data-testid="crane-nc-k" />
        </div>
      </div>
    </FormDialog>
  );
}
