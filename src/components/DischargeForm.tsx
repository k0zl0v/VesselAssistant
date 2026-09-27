import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { dischargeFromHold } from '../calc/discharge';
import { InsufficientCargoError } from '../calc/errors';
import { formatPercent, formatTons, roundTo3 } from '../calc/round';
import { reportError } from '../errorReporting';
import { getLang, useT, type Lang } from '../i18n';
import { describeError } from '../i18n/errors';
import type { VoyageHoldCalc } from '../services/CalculationService';
import type { Db } from '../services/db';
import { listLayers, type LayerView } from '../services/DischargeHistory';
import { OgvService } from '../services/OgvService';
import { fillPercent98 } from './HoldTable';
import { cargoColor } from './ui/cargo';
import { Dialog } from './ui/Dialog';
import { Icon } from './ui/Icon';
import { EmptyState, ErrorState, Skeleton } from './ui/states';
import '../styles/discharge.css';

type Plural = 'one' | 'few' | 'many';

/** Russian needs three forms (1 слой / 2 слоя / 5 слоёв); English collapses few into many. */
export function pluralForm(n: number, lang: Lang = getLang()): Plural {
  if (lang !== 'ru') return n === 1 ? 'one' : 'many';
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'one';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'few';
  return 'many';
}

/** `{tons}` stays a slot in the translated sentence so the number can be set in mono. */
function withNumber(text: string, slot: string, value: ReactNode): ReactNode {
  const [head, tail] = text.split(slot);
  return (
    <>
      {head}
      {value}
      {tail}
    </>
  );
}

const today = (): string => new Date().toISOString().slice(0, 10);

interface PreviewRow {
  layer: LayerView;
  step: number;
  before: number;
  off: number;
  after: number;
  isTop: boolean;
  isBottom: boolean;
}

type Preview =
  | { kind: 'idle' }
  | { kind: 'short'; short: number }
  | { kind: 'ok'; qty: number; rows: PreviewRow[]; activeAfter: number };

export interface DischargeFormProps {
  db: Db;
  voyage_id: string;
  /** Holds of the voyage as calculated for the Load Plan. */
  holds: VoyageHoldCalc[];
  /** hold_id → cargo names in the hold, for the «№3 · SFM» picker label. */
  cargoNames: Record<string, string[]>;
  initialHoldId?: string;
  /** Called after the operation is written; the dialog closes once it settles. */
  onDischarged: () => Promise<void>;
  onClose: () => void;
}

/** Discharge dialog: hold, tonnage, and a dry-run LIFO preview before anything is written. */
export function DischargeForm({ db, voyage_id, holds, cargoNames, initialHoldId, onDischarged, onClose }: DischargeFormProps) {
  const t = useT();
  const pickable = holds.filter((h) => h.remain_tons > 0 || h.hold_id === initialHoldId);
  const [holdId, setHoldId] = useState(initialHoldId ?? pickable[0]?.hold_id ?? '');
  const [tons, setTons] = useState('');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [layers, setLayers] = useState<LayerView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hold = holds.find((h) => h.hold_id === holdId) ?? null;

  useEffect(() => {
    if (!holdId) return;
    let live = true;
    setLayers(null);
    setLoadError(null);
    listLayers(db, voyage_id, holdId).then(
      (rows) => live && setLayers(rows),
      (e: unknown) => live && setLoadError(describeError(e)),
    );
    return () => {
      live = false;
    };
  }, [db, voyage_id, holdId, reloadKey]);

  const active = useMemo(() => (layers ?? []).filter((l) => l.remaining_tons > 0), [layers]);
  const available = active.reduce((s, l) => s + l.remaining_tons, 0);
  const qty = Number(tons);
  const qtyValid = tons.trim() !== '' && Number.isFinite(qty) && qty > 0;

  const preview = useMemo<Preview>(() => {
    if (!layers || !qtyValid || active.length === 0) return { kind: 'idle' };
    // dischargeFromHold mutates its input — the preview runs on a copy.
    const draft = structuredClone(layers);
    try {
      const allocations = dischargeFromHold('preview', holdId, qty, draft);
      const rows = allocations.map((a, i) => {
        const layer = layers.find((l) => l.id === a.cargo_layer_id)!;
        return {
          layer,
          step: i + 1,
          before: layer.remaining_tons,
          off: a.discharged_tons,
          after: layer.remaining_tons - a.discharged_tons,
          isTop: layer.id === active[0]!.id,
          isBottom: active.length > 1 && layer.id === active[active.length - 1]!.id,
        };
      });
      return { kind: 'ok', qty, rows, activeAfter: draft.filter((l) => l.remaining_tons > 0).length };
    } catch (e) {
      if (e instanceof InsufficientCargoError) return { kind: 'short', short: e.short_tons };
      throw e;
    }
  }, [layers, active, holdId, qty, qtyValid]);

  const canSubmit = preview.kind === 'ok' && !busy && !!date;

  function pickHold(id: string): void {
    setHoldId(id);
    setError(null);
  }

  function setQty(value: string): void {
    setTons(value);
    setError(null);
  }

  async function submit(): Promise<void> {
    if (preview.kind !== 'ok') return;
    setBusy(true);
    setError(null);
    try {
      await new OgvService(db).discharge({
        voyage_id,
        hold_id: holdId,
        tons: preview.qty,
        event_date: date,
        description: description.trim() || null,
      });
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
      // The layers may have moved under us (another operation) — re-read them for the preview.
      setReloadKey((k) => k + 1);
      return;
    }
    // Written: a failed refresh must not leave the dialog open for a second submit.
    await onDischarged().catch((e: unknown) => reportError('discharge-refresh', e));
    onClose();
  }

  const title = hold ? t('discharge.dialog.title', { hold_no: hold.hold_no }) : t('discharge.dialog.title_plain');
  const top = active[0];

  if (pickable.length === 0) {
    return (
      <Dialog title={t('discharge.dialog.title_plain')} onClose={onClose} wide testId="discharge-dialog">
        <div className="dialog-body">
          <EmptyState icon="discharge" title={t('discharge.no_cargo.title')} text={t('discharge.no_cargo.text')} testId="discharge-no-cargo" />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={title} subtitle={t('discharge.dialog.subtitle')} onClose={onClose} wide testId="discharge-dialog">
      <form
        className="discharge-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void submit();
        }}
      >
        <div className="discharge-fields">
          <div className="field">
            <span className="field-label" id="discharge-hold-label">
              {t('discharge.field.hold')}
            </span>
            <div className="segmented discharge-holds" role="group" aria-labelledby="discharge-hold-label">
              {pickable.map((h) => {
                const cargo = cargoNames[h.hold_id]?.join(' · ');
                return (
                  <button
                    key={h.hold_id}
                    type="button"
                    aria-pressed={h.hold_id === holdId}
                    onClick={() => pickHold(h.hold_id)}
                    disabled={busy}
                    data-testid={`discharge-hold-${h.hold_no}`}
                  >
                    <span className="mono">№{h.hold_no}</span>
                    {cargo && ` · ${cargo}`}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="discharge-row">
            <div className="field discharge-field-tons">
              <label className="field-label" htmlFor="discharge-tons">
                {t('discharge.field.tons')}
              </label>
              <input
                id="discharge-tons"
                className="input num discharge-tons"
                type="number"
                step="0.001"
                min="0.001"
                inputMode="decimal"
                placeholder="0.000"
                value={tons}
                onChange={(e) => setQty(e.target.value)}
                aria-invalid={preview.kind === 'short'}
                required
                data-testid="discharge-tons"
              />
            </div>
            <div className="field discharge-field-date">
              <label className="field-label" htmlFor="discharge-date">
                {t('discharge.field.date')}
              </label>
              <input
                id="discharge-date"
                className="input mono"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                data-testid="discharge-date"
              />
            </div>
            <div className="field discharge-field-desc">
              <label className="field-label" htmlFor="discharge-description">
                {t('discharge.field.description')}
              </label>
              <input
                id="discharge-description"
                className="input"
                type="text"
                placeholder={t('discharge.description_placeholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-testid="discharge-description"
              />
            </div>
          </div>
        </div>

        <div className="discharge-available">
          <span data-testid="discharge-available">
            {layers &&
              withNumber(
                t(`discharge.available_${pluralForm(active.length)}`, { count: active.length }),
                '{tons}',
                <strong className="mono">{formatTons(available)}</strong>,
              )}
          </span>
          {active.length > 0 && (
            <div className="discharge-quick">
              <button
                type="button"
                className="quick-chip"
                aria-pressed={qtyValid && roundTo3(qty) === roundTo3(available)}
                onClick={() => setQty(roundTo3(available).toFixed(3))}
                disabled={busy}
                data-testid="discharge-quick-all"
              >
                {t('discharge.quick.all')}
              </button>
              {top && (
                <button
                  type="button"
                  className="quick-chip"
                  aria-pressed={qtyValid && roundTo3(qty) === roundTo3(top.remaining_tons)}
                  onClick={() => setQty(roundTo3(top.remaining_tons).toFixed(3))}
                  disabled={busy}
                  data-testid="discharge-quick-top"
                >
                  {t('discharge.quick.top')}
                </button>
              )}
            </div>
          )}
        </div>

        <section className="discharge-preview" data-testid="discharge-preview" aria-live="polite">
          <div className="discharge-preview-head">
            <h3 className="discharge-preview-title">{t('discharge.preview.title')}</h3>
            {preview.kind === 'ok' && (
              <span className="discharge-badge">
                {t(`discharge.preview.badge_${pluralForm(preview.rows.length)}`, { count: preview.rows.length })}
              </span>
            )}
          </div>

          {loadError ? (
            <ErrorState title={t('discharge.load_error')} message={loadError} testId="discharge-load-error" />
          ) : !layers ? (
            <Skeleton rows={2} />
          ) : active.length === 0 ? (
            <p className="discharge-preview-hint">{t('discharge.preview.empty_hold')}</p>
          ) : preview.kind === 'short' ? (
            <div className="banner banner-danger discharge-shortage" role="alert" data-testid="discharge-shortage">
              <Icon name="alert" size={14} />
              <span>
                <strong>
                  {t('error.ogv.insufficient_cargo', {
                    hold_no: hold?.hold_no ?? '',
                    short_tons: formatTons(preview.short),
                  })}
                </strong>{' '}
                {t('discharge.shortage.available', { tons: formatTons(available) })}
              </span>
            </div>
          ) : preview.kind === 'idle' ? (
            <p className="discharge-preview-hint">{t('discharge.preview.hint')}</p>
          ) : (
            <div className="discharge-layers">
              {preview.rows.map((r) => (
                <PreviewLine key={r.layer.id} row={r} />
              ))}
            </div>
          )}

          {preview.kind === 'ok' && hold && (
            <HoldAfter hold={hold} qty={preview.qty} activeBefore={active.length} activeAfter={preview.activeAfter} />
          )}

          <div className="discharge-note">
            <Icon name="info" size={14} />
            <span>{t('discharge.lifo_note')}</span>
          </div>
        </section>

        {error && (
          <p className="field-error discharge-error" role="alert" data-testid="discharge-error">
            {error}
          </p>
        )}

        <div className="dialog-footer">
          <button type="button" className="btn btn-lg" onClick={onClose} disabled={busy} data-testid="discharge-cancel">
            {t('discharge.dialog.cancel')}
          </button>
          <button type="submit" className="btn btn-lg btn-primary" disabled={!canSubmit} data-testid="discharge-submit">
            {t('discharge.dialog.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function PreviewLine({ row }: { row: PreviewRow }) {
  const t = useT();
  const closed = roundTo3(row.after) === 0;
  const offPct = row.before > 0 ? (row.off / row.before) * 100 : 0;
  const seq = [
    t('discharge.layer.seq', { seq: row.layer.load_sequence }),
    row.isTop ? t('discharge.layer.top') : null,
    row.isBottom ? t('discharge.layer.bottom') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="discharge-layer" data-testid={`discharge-preview-row-${row.layer.load_sequence}`}>
      <div className={`discharge-step mono${closed ? ' closed' : ''}`}>{row.step}</div>
      <div className="discharge-layer-main">
        <div className="discharge-layer-title">
          <span className="discharge-seq mono">{seq}</span>
          <span className="discharge-vessel">{row.layer.source_vessel}</span>
          <span className="discharge-cargo">{row.layer.cargo_name}</span>
        </div>
        <div className="discharge-layer-bar">
          <div className="discharge-bar" aria-hidden="true">
            <div className="discharge-bar-off" style={{ width: `${offPct}%` }} />
            <div className="discharge-bar-keep" style={{ width: `${100 - offPct}%`, background: cargoColor(row.layer.cargo_name) }} />
          </div>
          <span className="discharge-of">
            {withNumber(t('discharge.layer.of', {}), '{tons}', <span className="mono">{formatTons(row.before)}</span>)}
          </span>
        </div>
      </div>
      <div className="discharge-layer-num">
        <div className="discharge-num-label">{t('discharge.col.write_off')}</div>
        <div className="discharge-num-value off mono" data-testid="discharge-preview-off">
          −{formatTons(row.off)}
        </div>
      </div>
      <div className="discharge-layer-num after">
        <div className="discharge-num-label">{t('discharge.col.remains')}</div>
        <div className={`discharge-num-value mono${closed ? ' closed' : ''}`} data-testid="discharge-preview-after">
          {closed ? t('discharge.layer.closed') : formatTons(row.after)}
        </div>
      </div>
    </div>
  );
}

function HoldAfter({
  hold,
  qty,
  activeBefore,
  activeAfter,
}: {
  hold: VoyageHoldCalc;
  qty: number;
  activeBefore: number;
  activeAfter: number;
}) {
  const t = useT();
  const fillBefore = fillPercent98(hold);
  const remainAfter = hold.remain_tons - qty;
  const fillAfter =
    hold.capacity_tons_98 === null || hold.capacity_tons_98 <= 0 ? null : (remainAfter / hold.capacity_tons_98) * 100;
  const level = (p: number | null): string => (p === null ? '' : p >= 95 ? ' over' : p >= 75 ? ' warn' : '');
  const pct = (p: number | null): string => (p === null ? '—' : formatPercent(p));
  const tiles = [
    {
      key: 'remain',
      label: t('discharge.after.remain'),
      value: formatTons(remainAfter),
      was: formatTons(hold.remain_tons),
      tone: remainAfter < 0 ? ' negative' : '',
    },
    {
      key: 'empty-98',
      label: t('discharge.after.empty_98'),
      value: hold.empty_space_98 === null ? '—' : formatTons(hold.empty_space_98 + qty),
      was: hold.empty_space_98 === null ? '—' : formatTons(hold.empty_space_98),
      tone: '',
    },
    { key: 'fill-98', label: t('discharge.after.fill_98'), value: pct(fillAfter), was: pct(fillBefore), tone: level(fillAfter) },
    { key: 'layers', label: t('discharge.after.layers'), value: String(activeAfter), was: String(activeBefore), tone: '' },
  ];
  return (
    <div className="discharge-after" data-testid="discharge-after">
      <div className="discharge-after-title">{t('discharge.after.title', { hold_no: hold.hold_no })}</div>
      <div className="discharge-after-tiles">
        {tiles.map((x) => (
          <div className="discharge-tile" key={x.key} data-testid={`discharge-after-${x.key}`}>
            <div className="discharge-tile-label">{x.label}</div>
            <div className={`discharge-tile-value mono${x.tone}`}>{x.value}</div>
            <div className="discharge-tile-delta">{t('discharge.after.was', { value: x.was })}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
