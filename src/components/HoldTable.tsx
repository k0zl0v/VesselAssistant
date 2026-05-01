import { formatTons } from '../calc/round';
import type { VoyageHoldCalc } from '../services/CalculationService';

const fmt = (x: number | null): string => (x === null ? '—' : formatTons(x));

const fmtPercent = (x: number | null): string =>
  x === null ? '—' : `${x.toFixed(1)} %`;

export function HoldTable({ holds }: { holds: VoyageHoldCalc[] }) {
  return (
    <table className="hold-table">
      <thead>
        <tr>
          <th>Hold</th>
          <th className="num">Volume m³</th>
          <th className="num">SF</th>
          <th className="num">Loaded</th>
          <th className="num">Discharged</th>
          <th className="num">Remain</th>
          <th className="num">Capacity 98%</th>
          <th className="num">Empty 98%</th>
          <th className="num">Empty Vol %</th>
        </tr>
      </thead>
      <tbody>
        {holds.map((h) => (
          <tr key={h.hold_id}>
            <td>№{h.hold_no}</td>
            <td className="num">{formatTons(h.volume_m3)}</td>
            <td className="num">{h.sf === null ? '—' : h.sf.toFixed(3)}</td>
            <td className="num">{formatTons(h.loaded_tons)}</td>
            <td className="num">{formatTons(h.discharged_tons)}</td>
            <td className="num">{formatTons(h.remain_tons)}</td>
            <td className="num">{fmt(h.capacity_tons_98)}</td>
            <td className={`num ${h.empty_space_98 !== null && h.empty_space_98 < 0 ? 'negative' : ''}`}>
              {fmt(h.empty_space_98)}
            </td>
            <td className="num">{fmtPercent(h.empty_volume_percent)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
