import { formatTons, roundTo3 } from '../../calc/round';
import { useT } from '../../i18n';
import type { DischargeOperationView } from '../../services/DischargeHistory';
import { formatDate } from '../../shell/format';

interface Props {
  ops: DischargeOperationView[];
  /** hold_id → cargo names, printed under the hold number. */
  cargoNames: Record<string, string[]>;
}

/** Discharges from the main vessel's holds with the layers LIFO wrote off — shown while no OGV is registered. */
export function DischargeLog({ ops, cargoNames }: Props) {
  const t = useT();
  const totalTons = ops.reduce((s, o) => s + o.tons, 0);
  return (
    <div className="table-card">
      <table className="data-table ogv-table" data-testid="ogv-table">
        <thead>
          <tr>
            <th className="col-date">{t('ogv.col.date')}</th>
            <th className="col-hold">{t('ogv.col.hold')}</th>
            <th className="num col-tons key-col">{t('ogv.col.tons')}</th>
            <th>{t('ogv.col.description')}</th>
            <th className="col-layers">{t('ogv.col.layers')}</th>
          </tr>
        </thead>
        <tbody>
          {ops.map((op) => (
            <OperationRow key={op.operation_id} op={op} cargo={cargoNames[op.hold_id] ?? []} />
          ))}
          <tr className="total-row" data-testid="ogv-totals">
            <td colSpan={2} className="total-label">
              {t('ogv.totals')}
            </td>
            <td className="num key-col" data-testid="ogv-total-tons">
              {formatTons(totalTons)}
            </td>
            <td className="muted">{t('ogv.totals_count', { count: ops.length })}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function OperationRow({ op, cargo }: { op: DischargeOperationView; cargo: string[] }) {
  const t = useT();
  const time = op.time_from ? `${op.time_from}${op.time_to ? `–${op.time_to}` : ''}` : null;
  return (
    <tr data-testid={`ogv-row-${op.operation_id}`}>
      <td>
        <span className="mono">{formatDate(op.event_date)}</span>
        {time && <span className="cell-sub mono">{time}</span>}
      </td>
      <td>
        <span className="mono hold-no">№{op.hold_no}</span>
        {cargo.length > 0 && <span className="cell-sub">{cargo.join(' · ')}</span>}
      </td>
      <td className="num key-col ogv-tons" data-testid="ogv-row-tons">
        {formatTons(op.tons)}
      </td>
      <td className={op.description ? undefined : 'zero'}>{op.description ?? '—'}</td>
      <td>
        <div className="ogv-allocs">
          {op.allocations.map((a) => {
            const closed = roundTo3(a.layer_remaining_tons) === 0;
            return (
              <div className="ogv-alloc" key={a.cargo_layer_id}>
                <span className="ogv-alloc-seq mono">{t('discharge.layer.seq', { seq: a.load_sequence })}</span>
                <span className="ogv-alloc-vessel">{a.source_vessel}</span>
                <span className="ogv-alloc-tons mono">−{formatTons(a.discharged_tons)}</span>
                <span className={`ogv-alloc-state${closed ? ' closed' : ''}`}>
                  {closed ? t('ogv.state.closed') : t('ogv.state.remain', { tons: formatTons(a.layer_remaining_tons) })}
                </span>
              </div>
            );
          })}
        </div>
      </td>
    </tr>
  );
}
