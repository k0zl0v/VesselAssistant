import { formatPercent, formatTons, roundTo3 } from '../../calc/round';
import { useT } from '../../i18n';
import type { OgvSummary } from '../../services/OgvVesselService';
import { pluralForm } from '../DischargeForm';

interface Props {
  summary: OgvSummary;
  mainVessel: string;
}

/** Cargo plan · loaded · remains to load · from the main vessel's holds. */
export function OgvTiles({ summary, mainVessel }: Props) {
  const t = useT();
  const { totals, holds, vessel } = summary;
  const unit = t('ogv.unit.mt');
  const pct = totals.planned_tons > 0 ? (totals.loaded_tons / totals.planned_tons) * 100 : null;
  const biggest = holds.filter((h) => roundTo3(h.remain_tons) > 0).sort((a, b) => b.remain_tons - a.remain_tons)[0];
  const remainOver = roundTo3(totals.remain_tons) < 0;

  return (
    <div className="ogv-tiles" data-testid="ogv-tiles">
      <div className="ogv-tile" data-testid="ogv-tile-plan">
        <div className="ogv-tile-label">{t('ogv.tile.plan')}</div>
        <div className="ogv-tile-value">
          <span data-testid="ogv-plan-tons">{formatTons(totals.planned_tons)}</span>
          <span className="ogv-tile-unit">{unit}</span>
        </div>
        <div className="ogv-tile-note">{t('ogv.tile.plan_note', { name: vessel.name, count: holds.length })}</div>
      </div>
      <div className="ogv-tile key" data-testid="ogv-tile-loaded">
        <div className="ogv-tile-label">{t('ogv.tile.loaded')}</div>
        <div className="ogv-tile-value">
          <span data-testid="ogv-loaded-tons">{formatTons(totals.loaded_tons)}</span>
          <span className="ogv-tile-unit">{unit}</span>
        </div>
        <div className="ogv-tile-note">{pct === null ? '—' : t('ogv.tile.loaded_note', { pct: formatPercent(pct) })}</div>
      </div>
      <div className="ogv-tile" data-testid="ogv-tile-remain">
        <div className="ogv-tile-label">{t('ogv.tile.remain')}</div>
        <div className={`ogv-tile-value${remainOver ? ' negative' : ''}`}>
          <span data-testid="ogv-remain-tons">{formatTons(totals.remain_tons)}</span>
          <span className="ogv-tile-unit">{unit}</span>
        </div>
        <div className="ogv-tile-note">
          {biggest ? t('ogv.tile.remain_note', { no: biggest.hold_no }) : t('ogv.tile.remain_done')}
        </div>
      </div>
      <div className="ogv-tile accent" data-testid="ogv-tile-main">
        <div className="ogv-tile-label">{t('ogv.tile.main', { vessel: mainVessel })}</div>
        <div className="ogv-tile-value">
          <span data-testid="ogv-total-tons">{formatTons(totals.main_hold_tons)}</span>
          <span className="ogv-tile-unit">{unit}</span>
        </div>
        <div className="ogv-tile-note">
          {t(`ogv.tile.main_note_${pluralForm(totals.main_hold_operations)}`, { count: totals.main_hold_operations })}
        </div>
      </div>
    </div>
  );
}
