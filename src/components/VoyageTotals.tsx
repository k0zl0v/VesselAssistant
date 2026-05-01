import { formatTons } from '../calc/round';
import { useT } from '../i18n';
import type { VoyageCalcTotals } from '../services/CalculationService';

export function VoyageTotals({ totals }: { totals: VoyageCalcTotals }) {
  const t = useT();
  const unit = t('voyage.totals.unit_t');
  return (
    <dl className="totals">
      <div>
        <dt>{t('voyage.totals.on_board')}</dt>
        <dd>{formatTons(totals.on_board)} {unit}</dd>
      </div>
      <div>
        <dt>{t('voyage.totals.total_loaded')}</dt>
        <dd>{formatTons(totals.total_loaded)} {unit}</dd>
      </div>
      <div>
        <dt>{t('voyage.totals.total_discharged')}</dt>
        <dd>{formatTons(totals.total_discharged)} {unit}</dd>
      </div>
      <div>
        <dt>{t('voyage.totals.total_empty_100')}</dt>
        <dd>{formatTons(totals.total_empty_100)} {unit}</dd>
      </div>
      <div>
        <dt>{t('voyage.totals.total_empty_98')}</dt>
        <dd>{formatTons(totals.total_empty_98)} {unit}</dd>
      </div>
    </dl>
  );
}
