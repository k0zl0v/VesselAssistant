import { formatPercent, formatTons } from '../calc/round';
import { useT } from '../i18n';
import type { VoyageCalcResult, VoyageHoldCalc } from '../services/CalculationService';
import type { HoldSummary } from '../services/VoyageOverview';
import { cargoColor } from './ui/cargo';
import { FillBar } from './ui/FillBar';

const fmt = (x: number | null): string => (x === null ? '—' : formatTons(x));
const fmtPercent = (x: number | null): string => (x === null ? '—' : formatPercent(x));

/** Fill relative to the 98 % capacity limit — the scale the operator loads against. */
export function fillPercent98(h: VoyageHoldCalc): number | null {
  return h.capacity_tons_98 === null || h.capacity_tons_98 <= 0
    ? null
    : (h.remain_tons / h.capacity_tons_98) * 100;
}

interface Props {
  holds: VoyageHoldCalc[];
  totals: VoyageCalcResult['totals'];
  summaries: Record<string, HoldSummary>;
  /** Totals row is shown only when the table lists every hold (no filter applied). */
  showTotals?: boolean;
}

export function HoldTable({ holds, totals, summaries, showTotals = true }: Props) {
  const t = useT();
  const capacity98 = holds.reduce((s, h) => s + (h.capacity_tons_98 ?? 0), 0);

  return (
    <div className="table-card">
      <table className="data-table hold-table">
        <thead>
          <tr>
            <th className="col-hold">{t('holds.col.hold')}</th>
            <th className="col-cargo">{t('holds.col.cargo')}</th>
            <th className="num col-sf">{t('holds.col.sf')}</th>
            <th className="num col-t">{t('holds.col.volume_m3')}</th>
            <th className="num col-t">{t('holds.col.loaded')}</th>
            <th className="num col-t">{t('holds.col.discharged')}</th>
            <th className="num col-t key-col">{t('holds.col.remain')}</th>
            <th className="num col-t">{t('holds.col.capacity_98')}</th>
            <th className="num col-t">{t('holds.col.empty_98')}</th>
            <th className="num col-pct">{t('holds.col.empty_vol_pct')}</th>
            <th className="col-fill">{t('holds.col.fill_98')}</th>
          </tr>
        </thead>
        <tbody>
          {holds.map((h) => {
            const summary = summaries[h.hold_id];
            const cargo = summary?.cargo_names.join(' · ') ?? '';
            const empty98Negative = h.empty_space_98 !== null && h.empty_space_98 < 0;
            return (
              <tr key={h.hold_id} data-testid={`hold-row-${h.hold_no}`}>
                <td className="mono hold-no">№{h.hold_no}</td>
                <td>
                  {cargo ? (
                    <span className="cargo-tag">
                      <span className="cargo-swatch" style={{ background: cargoColor(summary?.cargo_names[0]) }} />
                      {cargo}
                    </span>
                  ) : (
                    <span className="zero">—</span>
                  )}
                  {summary && (
                    <span className="cell-sub">
                      {t('holds.lots_count', { count: summary.lot_count })}
                      {summary.protein_percents.length > 0 &&
                        ` · ${summary.protein_percents.map(formatPercent).join(', ')}`}
                    </span>
                  )}
                </td>
                <td className="num muted" data-testid="hold-sf">
                  {h.sf === null ? (
                    <span className="sf-missing" data-testid="hold-sf-error">
                      {t('holds.error.no_sf')}
                    </span>
                  ) : (
                    h.sf.toFixed(3)
                  )}
                </td>
                <td className="num muted" data-testid="hold-volume">
                  {formatTons(h.volume_m3)}
                </td>
                <td className="num" data-testid="hold-loaded">
                  {formatTons(h.loaded_tons)}
                </td>
                <td className={`num${h.discharged_tons === 0 ? ' zero' : ''}`} data-testid="hold-discharged">
                  {h.discharged_tons === 0 ? '—' : formatTons(h.discharged_tons)}
                </td>
                <td className={`num key-col${h.remain_tons < 0 ? ' negative' : ''}`} data-testid="hold-remain">
                  {formatTons(h.remain_tons)}
                </td>
                <td className="num muted" data-testid="hold-capacity-98">
                  {fmt(h.capacity_tons_98)}
                </td>
                <td className={`num${empty98Negative ? ' negative' : ''}`} data-testid="hold-empty-98">
                  {fmt(h.empty_space_98)}
                </td>
                <td className="num muted" data-testid="hold-empty-vol-pct">
                  {fmtPercent(h.empty_volume_percent)}
                </td>
                <td>
                  <FillBar percent={fillPercent98(h)} color={cargoColor(summary?.cargo_names[0])} testId="hold-fill" />
                </td>
              </tr>
            );
          })}
          {showTotals && (
            <tr className="total-row" data-testid="hold-totals">
              <td colSpan={4} className="total-label">
                {t('holds.totals')}
              </td>
              <td className="num" data-testid="totals-loaded">
                {formatTons(totals.total_loaded)}
              </td>
              <td className="num" data-testid="totals-discharged">
                {formatTons(totals.total_discharged)}
              </td>
              <td className={`num key-col${totals.on_board < 0 ? ' negative' : ''}`} data-testid="totals-on-board">
                {formatTons(totals.on_board)}
              </td>
              <td className="num muted">{formatTons(capacity98)}</td>
              <td className="num" data-testid="totals-empty-98">
                {formatTons(totals.total_empty_98)}
              </td>
              <td colSpan={2} className="totals-aside">
                {t('holds.totals_empty_100')}{' '}
                <span className="mono" data-testid="totals-empty-100">
                  {formatTons(totals.total_empty_100)}
                </span>{' '}
                {t('voyage.totals.unit_t')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
