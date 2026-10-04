import type { CSSProperties } from 'react';
import { formatPercent, formatTons, roundTo3 } from '../../calc/round';
import { useT } from '../../i18n';
import type { OgvSummary } from '../../services/OgvVesselService';
import { pluralForm } from '../DischargeForm';
import { Icon } from '../ui/Icon';

/** The fill bar tops out a little above the plan line, so an over-plan hold still reads as over. */
const BAR_CAP_PERCENT = 103;

/**
 * OGV holds stern to bow with plan / loaded / left. Loading over plan is normal for an OGV
 * (ui-kit § Числа): the danger colour, but labelled «сверх плана», not as an error.
 */
export function OgvHolds({ summary }: { summary: OgvSummary }) {
  const t = useT();
  const over = summary.totals.over_plan_hold_nos;
  const list = over.map((n) => `№${n}`).join(', ');

  return (
    <section className="card ogv-holds" data-testid="ogv-holds">
      <div className="ogv-section-head">
        <h2 className="ogv-section-title">{t('ogv.holds.title', { name: summary.vessel.name })}</h2>
        <span className="ogv-section-sub">{t('ogv.holds.order')}</span>
        <span className="ogv-spacer" />
        {over.length > 0 && (
          <span className="ogv-over-badge" data-testid="ogv-over-badge">
            <Icon name="alert" size={12} strokeWidth={2.2} />
            {t(`ogv.holds.over_${pluralForm(over.length)}`, { count: over.length, list })}
          </span>
        )}
      </div>
      <div className="ogv-hold-row">
        {summary.holds.map((h) => {
          const remain = roundTo3(h.remain_tons);
          const fill = Math.min(h.fill_percent ?? 0, BAR_CAP_PERCENT) / 100;
          return (
            <div
              key={h.id}
              className={`ogv-hold${h.over_plan ? ' over' : ''}`}
              data-testid={`ogv-hold-${h.hold_no}`}
            >
              <div className="ogv-hold-head">
                <span className="ogv-hold-no mono">№{h.hold_no}</span>
                <span className="ogv-hold-pct mono">{h.fill_percent === null ? '—' : formatPercent(h.fill_percent)}</span>
              </div>
              <div className="ogv-hold-bar" aria-hidden="true">
                <div className="ogv-hold-fill" style={{ '--fill': fill } as CSSProperties} />
                <div className="ogv-hold-plan-line" />
              </div>
              <div className="ogv-hold-figures">
                <div className="ogv-hold-line plan">
                  <span>{t('ogv.hold.plan')}</span>
                  <span className="mono">{formatTons(h.planned_tons)}</span>
                </div>
                <div className="ogv-hold-line">
                  <span className="ogv-hold-caption">{t('ogv.hold.loaded')}</span>
                  <span className="mono strong" data-testid="ogv-hold-loaded">
                    {formatTons(h.loaded_tons)}
                  </span>
                </div>
                <div className="ogv-hold-line">
                  <span className="ogv-hold-caption">{h.over_plan ? t('ogv.hold.over') : t('ogv.hold.remain')}</span>
                  <span
                    className={`mono strong${h.over_plan ? ' negative' : remain === 0 ? ' positive' : ''}`}
                    data-testid="ogv-hold-remain"
                  >
                    {formatTons(h.remain_tons)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
