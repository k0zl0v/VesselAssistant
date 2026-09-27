import { Fragment, useState } from 'react';
import { formatTons } from '../calc/round';
import { useT } from '../i18n';
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
  const t = useT();
  return (
    <table className="hold-table">
      <thead>
        <tr>
          <th></th>
          <th>{t('holds.col.hold')}</th>
          <th className="num">{t('holds.col.volume_m3')}</th>
          <th className="num">{t('holds.col.sf')}</th>
          <th className="num">{t('holds.col.loaded')}</th>
          <th className="num">{t('holds.col.discharged')}</th>
          <th className="num">{t('holds.col.remain')}</th>
          <th className="num">{t('holds.col.capacity_98')}</th>
          <th className="num">{t('holds.col.empty_98')}</th>
          <th className="num">{t('holds.col.empty_vol_pct')}</th>
        </tr>
      </thead>
      <tbody>
        {holds.map((h) => {
          const expanded = expandedHoldId === h.hold_id;
          return (
            <Fragment key={h.hold_id}>
              <tr className={expanded ? 'expanded' : ''} data-testid={`hold-row-${h.hold_no}`}>
                <td>
                  <button
                    type="button"
                    onClick={() => onToggleExpand(expanded ? null : h.hold_id)}
                    className="expand-btn secondary"
                    aria-label={t('holds.toggle_aria')}
                    data-testid={`hold-expand-${h.hold_no}`}
                  >
                    {expanded ? '▾' : '▸'}
                  </button>
                </td>
                <td>№{h.hold_no}</td>
                <td className="num" data-testid="hold-volume">{formatTons(h.volume_m3)}</td>
                <td className="num" data-testid="hold-sf">
                  {h.sf === null ? (
                    <span className="error" data-testid="hold-sf-error">
                      {t('holds.error.no_sf')}
                    </span>
                  ) : (
                    h.sf.toFixed(3)
                  )}
                </td>
                <td className="num" data-testid="hold-loaded">{formatTons(h.loaded_tons)}</td>
                <td className="num" data-testid="hold-discharged">{formatTons(h.discharged_tons)}</td>
                <td className={`num ${h.remain_tons < 0 ? 'negative' : ''}`} data-testid="hold-remain">{formatTons(h.remain_tons)}</td>
                <td className="num" data-testid="hold-capacity-98">{fmt(h.capacity_tons_98)}</td>
                <td
                  className={`num ${h.empty_space_98 !== null && h.empty_space_98 < 0 ? 'negative' : ''}`}
                  data-testid="hold-empty-98"
                >
                  {fmt(h.empty_space_98)}
                </td>
                <td className="num" data-testid="hold-empty-vol-pct">{fmtPercent(h.empty_volume_percent)}</td>
              </tr>
              {expanded && (
                <ExpansionRow
                  voyage_id={voyage_id}
                  hold_id={h.hold_id}
                  hold_no={h.hold_no}
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
  hold_no: number;
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
  hold_no,
  lots,
  cargoes,
  onAddLot,
  onDischarge,
  busy,
  voyageOpen,
}: ExpansionProps) {
  const t = useT();
  const [tab, setTab] = useState<'add' | 'discharge' | null>(null);

  const topSeq = lots.length > 0 ? lots[lots.length - 1]!.load_sequence : null;

  return (
    <tr className="expansion" data-testid="hold-expansion">
      <td colSpan={COL_COUNT}>
        <div className="expansion-content">
          <div className="lots-list">
            <strong>
              {topSeq === null
                ? t('holds.lots.title_empty')
                : t('holds.lots.title_top', { seq: topSeq })}
            </strong>
            {lots.length === 0 ? (
              <p className="hint inline">{t('holds.lots.empty')}</p>
            ) : (
              <ul data-testid="hold-lots">
                {lots.map((l) => (
                  <li key={l.cargo_lot_id} data-testid={`hold-lot-${l.load_sequence}`}>
                    {t('holds.lots.line', {
                      seq: l.load_sequence,
                      vessel: l.source_vessel,
                      cargo: l.cargo_name,
                      protein:
                        l.protein_percent !== null
                          ? ` ${l.protein_percent.toFixed(1)}%`
                          : '',
                      sf: l.sf.toFixed(3),
                      loaded: formatTons(l.loaded_tons),
                      remain: formatTons(l.remaining_tons),
                    })}
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
                  data-testid="hold-action-add-lot"
                >
                  {t('holds.action.add_lot')}
                </button>
                <button
                  type="button"
                  onClick={() => setTab(tab === 'discharge' ? null : 'discharge')}
                  className="secondary"
                  disabled={lots.every((l) => l.remaining_tons === 0)}
                  data-testid="hold-action-discharge"
                >
                  {t('holds.action.discharge')}
                </button>
              </div>
              {tab === 'add' && (
                <AddLotForm
                  cargoes={cargoes}
                  voyage_id={voyage_id}
                  hold_id={hold_id}
                  hold_no={hold_no}
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
