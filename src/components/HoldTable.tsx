import { Fragment, useState } from 'react';
import { formatTons } from '../calc/round';
import type { VoyageHoldCalc } from '../services/CalculationService';
import type { HoldLotView } from '../services/HoldLotsView';
import type { Cargo } from '../services/ReferenceService';
import type { AddLotInput, DischargeInput } from '../services/types';
import { AddLotForm } from './AddLotForm';
import { DischargeForm } from './DischargeForm';

const fmt = (x: number | null): string => (x === null ? '—' : formatTons(x));
const fmtPercent = (x: number | null): string =>
  x === null ? '—' : `${x.toFixed(1)} %`;

interface Props {
  holds: VoyageHoldCalc[];
  voyage_id: string;
  cargoes: Cargo[];
  /** Lots grouped by hold_id; only loaded for the expanded hold. */
  lotsByHold: Record<string, HoldLotView[]>;
  expandedHoldId: string | null;
  onToggleExpand: (hold_id: string | null) => void;
  onAddLot: (input: AddLotInput) => Promise<void>;
  onDischarge: (input: DischargeInput) => Promise<void>;
  busy: boolean;
  voyageOpen: boolean;
}

const COL_COUNT = 10;

export function HoldTable({
  holds,
  voyage_id,
  cargoes,
  lotsByHold,
  expandedHoldId,
  onToggleExpand,
  onAddLot,
  onDischarge,
  busy,
  voyageOpen,
}: Props) {
  return (
    <table className="hold-table">
      <thead>
        <tr>
          <th></th>
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
        {holds.map((h) => {
          const expanded = expandedHoldId === h.hold_id;
          return (
            <Fragment key={h.hold_id}>
              <tr className={expanded ? 'expanded' : ''}>
                <td>
                  <button
                    type="button"
                    onClick={() => onToggleExpand(expanded ? null : h.hold_id)}
                    className="expand-btn secondary"
                    aria-label="Toggle hold details"
                  >
                    {expanded ? '▾' : '▸'}
                  </button>
                </td>
                <td>№{h.hold_no}</td>
                <td className="num">{formatTons(h.volume_m3)}</td>
                <td className="num">{h.sf === null ? '—' : h.sf.toFixed(3)}</td>
                <td className="num">{formatTons(h.loaded_tons)}</td>
                <td className="num">{formatTons(h.discharged_tons)}</td>
                <td className="num">{formatTons(h.remain_tons)}</td>
                <td className="num">{fmt(h.capacity_tons_98)}</td>
                <td
                  className={`num ${h.empty_space_98 !== null && h.empty_space_98 < 0 ? 'negative' : ''}`}
                >
                  {fmt(h.empty_space_98)}
                </td>
                <td className="num">{fmtPercent(h.empty_volume_percent)}</td>
              </tr>
              {expanded && (
                <ExpansionRow
                  voyage_id={voyage_id}
                  hold_id={h.hold_id}
                  lots={lotsByHold[h.hold_id] ?? []}
                  cargoes={cargoes}
                  onAddLot={onAddLot}
                  onDischarge={onDischarge}
                  busy={busy}
                  voyageOpen={voyageOpen}
                />
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

interface ExpansionProps {
  voyage_id: string;
  hold_id: string;
  lots: HoldLotView[];
  cargoes: Cargo[];
  onAddLot: (input: AddLotInput) => Promise<void>;
  onDischarge: (input: DischargeInput) => Promise<void>;
  busy: boolean;
  voyageOpen: boolean;
}

function ExpansionRow({
  voyage_id,
  hold_id,
  lots,
  cargoes,
  onAddLot,
  onDischarge,
  busy,
  voyageOpen,
}: ExpansionProps) {
  const [tab, setTab] = useState<'add' | 'discharge' | null>(null);

  return (
    <tr className="expansion">
      <td colSpan={COL_COUNT}>
        <div className="expansion-content">
          <div className="lots-list">
            <strong>
              Lots in this hold (oldest → newest, top of stack is{' '}
              {lots.length > 0 ? `#${lots[lots.length - 1]!.load_sequence}` : '—'})
            </strong>
            {lots.length === 0 ? (
              <p className="hint inline">No lots loaded yet.</p>
            ) : (
              <ul>
                {lots.map((l) => (
                  <li key={l.cargo_lot_id}>
                    #{l.load_sequence} <strong>{l.source_vessel}</strong>{' '}
                    — {l.cargo_name}
                    {l.protein_percent !== null
                      ? ` ${l.protein_percent.toFixed(1)}%`
                      : ''}
                    , SF {l.sf.toFixed(3)}, loaded {formatTons(l.loaded_tons)},{' '}
                    remain {formatTons(l.remaining_tons)} t
                  </li>
                ))}
              </ul>
            )}
          </div>

          {voyageOpen && (
            <div className="action-tabs">
              <div className="tab-buttons">
                <button
                  type="button"
                  onClick={() => setTab(tab === 'add' ? null : 'add')}
                  className="secondary"
                >
                  + Add lot
                </button>
                <button
                  type="button"
                  onClick={() => setTab(tab === 'discharge' ? null : 'discharge')}
                  className="secondary"
                  disabled={lots.every((l) => l.remaining_tons === 0)}
                >
                  ↓ Discharge
                </button>
              </div>
              {tab === 'add' && (
                <AddLotForm
                  cargoes={cargoes}
                  voyage_id={voyage_id}
                  hold_id={hold_id}
                  onSubmit={async (i) => {
                    await onAddLot(i);
                  }}
                  busy={busy}
                />
              )}
              {tab === 'discharge' && (
                <DischargeForm
                  voyage_id={voyage_id}
                  hold_id={hold_id}
                  onSubmit={async (i) => {
                    await onDischarge(i);
                  }}
                  busy={busy}
                />
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
