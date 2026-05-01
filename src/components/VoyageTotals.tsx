import { formatTons } from '../calc/round';
import type { VoyageCalcTotals } from '../services/CalculationService';

export function VoyageTotals({ totals }: { totals: VoyageCalcTotals }) {
  return (
    <dl className="totals">
      <div>
        <dt>On Board</dt>
        <dd>{formatTons(totals.on_board)} t</dd>
      </div>
      <div>
        <dt>Total Loaded</dt>
        <dd>{formatTons(totals.total_loaded)} t</dd>
      </div>
      <div>
        <dt>Total Discharged</dt>
        <dd>{formatTons(totals.total_discharged)} t</dd>
      </div>
      <div>
        <dt>Total Empty 100%</dt>
        <dd>{formatTons(totals.total_empty_100)} t</dd>
      </div>
      <div>
        <dt>Total Empty 98%</dt>
        <dd>{formatTons(totals.total_empty_98)} t</dd>
      </div>
    </dl>
  );
}
