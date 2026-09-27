import { useEffect, useState, type ReactNode } from 'react';
import { wouldOverload } from '../calc/capacity';
import { formatTons } from '../calc/round';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import { OVERLOAD_ERROR_PREFIX } from '../services/CargoLotService';
import type { Cargo } from '../services/ReferenceService';
import { PROTEIN_ALLOWED, type AddLotInput } from '../services/types';
import { cargoColor } from './ui/cargo';
import { Icon } from './ui/Icon';
import '../styles/add-lot.css';

/** The only fill percent of the MVP; CargoLotService checks the same value. */
const FILL_PERCENT = 0.98;

/** The hold the lot goes into, as the capacity check needs it. */
export interface AddLotHold {
  hold_id: string;
  hold_no: number;
  volume_m3: number;
  /** Sum of the hold's layer remainders — what CargoLotService.add sums too. */
  remain_tons: number;
  /** SF fixed in hold_cargo_parameters by the first lot; null for an empty hold. */
  sf: number | null;
  /** Cargo already in the hold — colours the «on board» part of the scale. */
  cargo_name: string | null;
}

interface OverloadPayload {
  capacity_tons: number;
  projected_remain_tons: number;
  overshoot_tons: number;
  overloads: boolean;
  hold_id: string;
}

function parseOverload(e: unknown): OverloadPayload | null {
  const raw = e instanceof Error ? e.message : String(e);
  const idx = raw.indexOf(OVERLOAD_ERROR_PREFIX);
  if (idx < 0) return null;
  try {
    return JSON.parse(raw.slice(idx + OVERLOAD_ERROR_PREFIX.length)) as OverloadPayload;
  } catch {
    return null;
  }
}

interface CheckNumbers {
  capacity: number;
  current: number;
  adding: number;
  projected: number;
  overloads: boolean;
}

type FieldKey = 'source' | 'sf' | 'tons' | 'plan' | 'date';

/** Local calendar date as `YYYY-MM-DD` for `<input type="date">`. */
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The picked date at the current wall-clock time, so lots of one day keep their order. */
function loadedAt(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const now = new Date();
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString();
}

/** Placeholder that `withValue` swaps for a formatted number inside a translated sentence. */
const SLOT = '\u0000';
function withValue(text: string, value: ReactNode): ReactNode {
  const [before, after] = text.split(SLOT);
  return (
    <>
      {before}
      {value}
      {after}
    </>
  );
}

const toNumber = (s: string): number => (s.trim() === '' ? NaN : Number(s));
const isWheat = (c: Cargo | undefined): boolean => !!c && c.name.toLowerCase().includes('wheat');

interface Props {
  voyage_id: string;
  hold: AddLotHold;
  cargoes: Cargo[];
  /** Source vessels already used in this voyage, offered as quick picks. */
  sourceVessels: string[];
  /** Cargo preselected while the operator has not picked one. */
  defaultCargoId?: string;
  /** Hold picker rendered above the fields when the dialog was opened without a hold. */
  holdPicker?: ReactNode;
  busy: boolean;
  onSubmit: (input: AddLotInput) => Promise<void>;
  onCancel: () => void;
}

export function AddLotForm({
  voyage_id,
  hold,
  cargoes,
  sourceVessels,
  defaultCargoId,
  holdPicker,
  busy,
  onSubmit,
  onCancel,
}: Props) {
  const t = useT();
  const holdSf = hold.sf != null ? String(hold.sf) : '';
  const [source, setSource] = useState('');
  const [pickedCargoId, setPickedCargoId] = useState<string | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [sf, setSf] = useState<string | null>(null);
  const [tons, setTons] = useState('');
  const [plan, setPlan] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso);
  const [ack, setAck] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceOverload, setServiceOverload] = useState<OverloadPayload | null>(null);

  // A confirmation belongs to one hold; switching holds asks again.
  useEffect(() => {
    setAck(false);
    setServiceOverload(null);
  }, [hold.hold_id]);

  const cargoId = pickedCargoId ?? defaultCargoId ?? cargoes[0]?.id ?? '';
  const cargo = cargoes.find((c) => c.id === cargoId);
  const wheat = isWheat(cargo);
  // Untouched SF follows the hold's fixed SF; untouched plan mirrors the actual tonnage.
  const sfStr = sf ?? holdSf;
  const planStr = plan ?? tons;
  const sfNum = toNumber(sfStr);
  const tonsNum = toNumber(tons);
  const planNum = toNumber(planStr);

  const fieldErrors: Partial<Record<FieldKey, string>> = {};
  if (!source.trim()) fieldErrors.source = t('addlot.error.source_required');
  if (!(sfNum > 0)) fieldErrors.sf = t('addlot.error.sf');
  if (!(tonsNum > 0)) fieldErrors.tons = t('addlot.error.tons');
  if (!(planNum >= 0)) fieldErrors.plan = t('addlot.error.plan');
  if (!date) fieldErrors.date = t('addlot.error.date');
  // SF is checked live — capacity cannot be shown without it; the rest after the first submit.
  const shown = (k: FieldKey): string | undefined =>
    attempted || (k === 'sf' && sfStr.trim() !== '') ? fieldErrors[k] : undefined;

  const adding = tonsNum > 0 ? tonsNum : 0;
  let check: CheckNumbers | null = null;
  if (serviceOverload) {
    check = {
      capacity: serviceOverload.capacity_tons,
      current: serviceOverload.projected_remain_tons - adding,
      adding,
      projected: serviceOverload.projected_remain_tons,
      overloads: serviceOverload.overloads,
    };
  } else if (sfNum > 0) {
    const r = wouldOverload({
      hold_volume_m3: hold.volume_m3,
      sf: sfNum,
      fill_percent: FILL_PERCENT,
      current_remain_tons: hold.remain_tons,
      added_tons: adding,
    });
    check = {
      capacity: r.capacity_tons,
      current: hold.remain_tons,
      adding,
      projected: r.projected_remain_tons,
      overloads: r.overloads,
    };
  }
  const overload = check?.overloads ?? false;
  const canSubmit = !busy && (!overload || ack);

  function edit(fn: () => void): void {
    fn();
    setServiceOverload(null);
    setError(null);
  }

  async function submit(): Promise<void> {
    setAttempted(true);
    setError(null);
    if (Object.keys(fieldErrors).length > 0) return;
    const input: AddLotInput = {
      voyage_id,
      hold_id: hold.hold_id,
      cargo_id: cargoId,
      source_vessel: source.trim(),
      sf: sfNum,
      planned_tons: planNum,
      loaded_tons: tonsNum,
      protein_percent: wheat ? protein : null,
      loaded_at: loadedAt(date),
      ...(overload && ack ? { acknowledge_overload: true } : {}),
    };
    try {
      await onSubmit(input);
    } catch (e) {
      // Fallback for AT-05: the service saw an overload the live check did not.
      const payload = parseOverload(e);
      if (payload?.overloads) {
        setServiceOverload(payload);
        setAck(false);
        return;
      }
      setError(describeError(e));
    }
  }

  if (cargoes.length === 0) return null;

  const scale = check ? Math.max(check.capacity, check.projected, 1e-9) * 1.04 : 1;
  const pct = (x: number): string => `${((Math.max(0, x) / scale) * 100).toFixed(2)}%`;
  const free = check ? check.capacity - check.current : 0;
  const overshoot = check ? check.projected - check.capacity : 0;
  const dash = '—';

  return (
    <div className="add-lot">
      <form
        className="add-lot-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void submit();
        }}
      >
        {holdPicker}

        <div className="field">
          <label className="field-label" htmlFor="lot-source">
            {t('addlot.source_vessel')}
          </label>
          <input
            id="lot-source"
            className="input"
            type="text"
            value={source}
            onChange={(e) => edit(() => setSource(e.target.value))}
            aria-invalid={shown('source') ? true : undefined}
            data-testid="lot-source-vessel"
          />
          {shown('source') && <div className="field-error">{shown('source')}</div>}
          {sourceVessels.length > 0 && (
            <div className="add-lot-chips">
              {sourceVessels.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="quick-chip"
                  aria-pressed={source.trim() === name}
                  onClick={() => edit(() => setSource(name))}
                  data-testid={`lot-source-chip-${name}`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <span className="field-label" id="lot-cargo-label">
            {t('addlot.cargo')}
          </span>
          <div className="add-lot-chips" role="group" aria-labelledby="lot-cargo-label" data-testid="lot-cargo">
            {cargoes.map((c) => (
              <button
                key={c.id}
                type="button"
                className="quick-chip add-lot-cargo-chip"
                aria-pressed={c.id === cargoId}
                onClick={() =>
                  edit(() => {
                    setPickedCargoId(c.id);
                    if (!isWheat(c)) setProtein(null);
                  })
                }
                data-testid={`lot-cargo-${c.name}`}
              >
                <span className="add-lot-swatch" style={{ background: cargoColor(c.name) }} aria-hidden="true" />
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {wheat && (
          <div className="field">
            <span className="field-label" id="lot-protein-label">
              {t('addlot.protein')}
            </span>
            <div className="add-lot-chips" role="group" aria-labelledby="lot-protein-label" data-testid="lot-protein">
              {PROTEIN_ALLOWED.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="quick-chip mono"
                  aria-pressed={protein === p}
                  onClick={() => edit(() => setProtein(protein === p ? null : p))}
                  data-testid={`lot-protein-${p.toFixed(1)}`}
                >
                  {p.toFixed(1)}&nbsp;%
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="add-lot-row">
          <div className="field add-lot-narrow">
            <label className="field-label" htmlFor="lot-sf">
              {t('addlot.sf')}
            </label>
            <input
              id="lot-sf"
              className="input mono"
              type="number"
              step="0.001"
              min="0.001"
              value={sfStr}
              onChange={(e) => edit(() => setSf(e.target.value))}
              aria-invalid={shown('sf') ? true : undefined}
              data-testid="lot-sf"
            />
            {shown('sf') && (
              <div className="field-error" data-testid="lot-sf-error">
                {shown('sf')}
              </div>
            )}
          </div>
          <div className="field add-lot-grow">
            <label className="field-label" htmlFor="lot-tons">
              {t('addlot.tons_fact')}
            </label>
            <input
              id="lot-tons"
              className={`input mono${overload ? ' add-lot-over' : ''}`}
              type="number"
              step="0.001"
              min="0.001"
              value={tons}
              onChange={(e) => edit(() => setTons(e.target.value))}
              aria-invalid={shown('tons') ? true : undefined}
              data-testid="lot-tons"
            />
            {shown('tons') && <div className="field-error">{shown('tons')}</div>}
          </div>
        </div>

        <div className="add-lot-row">
          <div className="field add-lot-grow">
            <label className="field-label" htmlFor="lot-plan">
              {t('addlot.tons_plan')}
            </label>
            <input
              id="lot-plan"
              className={`input mono${plan === null ? ' add-lot-mirrored' : ''}`}
              type="number"
              step="0.001"
              min="0"
              value={planStr}
              onChange={(e) => setPlan(e.target.value)}
              aria-invalid={shown('plan') ? true : undefined}
              data-testid="lot-plan"
            />
            {shown('plan') && <div className="field-error">{shown('plan')}</div>}
          </div>
          <div className="field add-lot-grow">
            <label className="field-label" htmlFor="lot-date">
              {t('addlot.date')}
            </label>
            <input
              id="lot-date"
              className="input mono"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={shown('date') ? true : undefined}
              data-testid="lot-date"
            />
            {shown('date') && <div className="field-error">{shown('date')}</div>}
          </div>
        </div>

        {hold.sf != null && (
          <div className="add-lot-note" data-testid="lot-hold-sf-note">
            <div className="add-lot-note-title">{t('addlot.hold_sf.title', { hold_no: hold.hold_no })}</div>
            <p>{withValue(t('addlot.hold_sf.text', { sf: SLOT }), <span className="mono">{hold.sf.toFixed(3)}</span>)}</p>
          </div>
        )}

        <span className="add-lot-spacer" />

        {error && (
          <div className="banner banner-danger add-lot-error" role="alert" data-testid="lot-error">
            {error}
          </div>
        )}

        {overload && (
          <label className={`checkbox-row add-lot-ack${ack ? ' checked' : ''}`}>
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              data-testid="lot-overload-ack"
            />
            <span>{t('addlot.over.ack')}</span>
          </label>
        )}

        <div className="add-lot-actions">
          <button type="button" className="btn btn-lg add-lot-cancel" onClick={onCancel} data-testid="lot-cancel">
            {t('addlot.cancel')}
          </button>
          <button
            type="submit"
            className={`btn btn-lg add-lot-submit ${overload ? 'btn-danger' : 'btn-primary'}`}
            disabled={!canSubmit}
            data-testid="lot-submit"
          >
            {overload ? t('addlot.submit_over') : t('addlot.submit')}
          </button>
        </div>
      </form>

      <aside className="add-lot-check" aria-live="polite" data-testid="lot-capacity-check">
        <div className="add-lot-check-title">{t('addlot.check.title')}</div>

        <div className="add-lot-rows">
          <div className="add-lot-line">
            <span>{t('addlot.check.volume')}</span>
            <span className="num">{formatTons(hold.volume_m3)}</span>
          </div>
          <div className="add-lot-line">
            <span>{t('addlot.check.capacity')}</span>
            <span className="num" data-testid="lot-check-capacity">
              {check ? formatTons(check.capacity) : dash}
            </span>
          </div>
          <div className="add-lot-line">
            <span>{t('addlot.check.current')}</span>
            <span className="num" data-testid="lot-check-current">
              {formatTons(check?.current ?? hold.remain_tons)}
            </span>
          </div>
          <div className="add-lot-line strong">
            <span>{t('addlot.check.free')}</span>
            <span className={`num${free < 0 ? ' negative' : ''}`} data-testid="lot-check-free">
              {check ? formatTons(free) : dash}
            </span>
          </div>
          <div className="add-lot-line strong">
            <span className="muted">{t('addlot.check.adding')}</span>
            <span className={`num ${overload ? 'danger' : 'accent'}`} data-testid="lot-check-adding">
              {formatTons(adding)}
            </span>
          </div>
          <div className="add-lot-line total">
            <span>{t('addlot.check.projected')}</span>
            <span className={`num${overload ? ' danger' : ''}`} data-testid="lot-check-projected">
              {formatTons(check?.projected ?? hold.remain_tons + adding)}
            </span>
          </div>
        </div>

        {check ? (
          <div>
            <div className="add-lot-bar">
              <div
                className="add-lot-bar-part"
                style={{ width: pct(check.current), background: cargoColor(hold.cargo_name) }}
              />
              <div className={`add-lot-bar-part ${overload ? 'over' : 'new'}`} style={{ width: pct(check.adding) }} />
              <div className="add-lot-bar-limit" style={{ left: pct(check.capacity) }} />
            </div>
            <div className="add-lot-scale">
              <span>0</span>
              <span className="limit mono">{t('addlot.check.limit', { tons: formatTons(check.capacity) })}</span>
            </div>
            <div className="add-lot-legend">
              <span>
                <span className="add-lot-swatch" style={{ background: cargoColor(hold.cargo_name) }} />
                {t('addlot.check.legend_onboard')}
              </span>
              <span>
                <span className={`add-lot-swatch ${overload ? 'over' : 'new'}`} />
                {t('addlot.check.legend_new')}
              </span>
            </div>
          </div>
        ) : (
          <div className="field-hint">{t('addlot.check.no_sf')}</div>
        )}

        {check && hold.sf != null && !serviceOverload && Math.abs(sfNum - hold.sf) > 1e-9 && (
          <div className="field-hint" data-testid="lot-check-sf-hint">
            {t('addlot.check.by_lot_sf', { lot_sf: sfNum.toFixed(3), hold_sf: hold.sf.toFixed(3) })}
          </div>
        )}

        {check && overload && (
          <div className="add-lot-panel over" role="alert" data-testid="lot-overload-panel">
            <div className="add-lot-panel-title">
              <Icon name="warning" size={15} />
              <span>{t('addlot.over.title', { hold_no: hold.hold_no })}</span>
            </div>
            <p>
              {withValue(t('addlot.over.text', { tons: SLOT }), <strong className="mono" data-testid="lot-overload-overshoot">{formatTons(Math.max(0, overshoot))}</strong>)}
            </p>
            <p className="add-lot-panel-hint">
              {withValue(t('addlot.over.hint', { tons: SLOT }), <strong className="mono">{formatTons(Math.max(0, free))}</strong>)}
            </p>
          </div>
        )}

        {check && !overload && adding > 0 && (
          <div className="add-lot-panel ok" data-testid="lot-ok-panel">
            <div className="add-lot-panel-title">
              <Icon name="check" size={15} strokeWidth={2.2} />
              <span>{t('addlot.ok.title')}</span>
            </div>
            <p>
              {withValue(t('addlot.ok.text', { tons: SLOT }), <strong className="mono">{formatTons(Math.max(0, -overshoot))}</strong>)}
            </p>
          </div>
        )}

        <span className="add-lot-spacer" />

        <div className="add-lot-footnote">{t('addlot.check.footnote')}</div>
      </aside>
    </div>
  );
}
