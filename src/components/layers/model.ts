import { roundTo3 } from '../../calc/round';
import type { VoyageHoldCalc } from '../../services/CalculationService';
import type { DischargeOperationView, LayerView } from '../../services/DischargeHistory';
import type { AvailableBySource } from '../../services/types';

/** Share of the stack the tallest hold (capacity or loaded) takes; the rest is headroom for the 98 % label. */
const STACK_FILL = 0.84;

export interface StackLayer {
  id: string;
  load_sequence: number;
  source_vessel: string;
  cargo_name: string;
  loaded_tons: number;
  remaining_tons: number;
  depleted: boolean;
  /** Next layer LIFO writes off: the highest sequence that still holds cargo. */
  isTop: boolean;
  /** Block height, % of the stack — one scale for every hold so heights compare. */
  heightPct: number;
  /** Remaining part of the block, % of the block itself. */
  solidPct: number;
}

export interface HoldStack {
  hold_id: string;
  hold_no: number;
  sf: number | null;
  remain_tons: number;
  empty_space_98: number | null;
  capacity_tons_98: number | null;
  /** Position of the 98 % line, % of the stack; null without an SF. */
  capPct: number | null;
  layers: StackLayer[];
}

const isZero = (x: number): boolean => roundTo3(x) <= 0;

/** Stacks per hold in hold order; `layers` must come top-first per hold (as `listLayers` returns them). */
export function buildStacks(holds: VoyageHoldCalc[], layers: LayerView[]): HoldStack[] {
  const byHold = new Map<string, LayerView[]>();
  for (const l of layers) byHold.set(l.hold_id, [...(byHold.get(l.hold_id) ?? []), l]);

  const tallest = Math.max(
    0,
    ...holds.map((h) => {
      const loaded = (byHold.get(h.hold_id) ?? []).reduce((s, l) => s + l.loaded_tons, 0);
      return Math.max(loaded, h.capacity_tons_98 ?? 0);
    }),
  );
  const unit = tallest > 0 ? (STACK_FILL * 100) / tallest : 0;

  return [...holds]
    .sort((a, b) => a.hold_no - b.hold_no)
    .map((h) => {
      const own = [...(byHold.get(h.hold_id) ?? [])].sort((a, b) => b.load_sequence - a.load_sequence);
      const top = own.find((l) => !isZero(l.remaining_tons));
      return {
        hold_id: h.hold_id,
        hold_no: h.hold_no,
        sf: h.sf,
        remain_tons: h.remain_tons,
        empty_space_98: h.empty_space_98,
        capacity_tons_98: h.capacity_tons_98,
        capPct: h.capacity_tons_98 !== null ? h.capacity_tons_98 * unit : null,
        layers: own.map((l) => {
          const depleted = isZero(l.remaining_tons);
          return {
            id: l.id,
            load_sequence: l.load_sequence,
            source_vessel: l.source_vessel,
            cargo_name: l.cargo_name,
            loaded_tons: l.loaded_tons,
            remaining_tons: l.remaining_tons,
            depleted,
            isTop: l === top,
            heightPct: l.loaded_tons * unit,
            solidPct: depleted || l.loaded_tons <= 0 ? 0 : Math.min(100, (l.remaining_tons / l.loaded_tons) * 100),
          };
        }),
      };
    });
}

export interface SourceRemain {
  source_vessel: string;
  remaining_tons: number;
  /** Bar width, % of the largest source. */
  barPct: number;
  /** Holds where this source still has cargo. */
  hold_nos: number[];
  /** Holds where every layer of this source is written off. */
  written_off_hold_nos: number[];
}

/** FR-18 remains by source vessel, plus which holds each source sits in. */
export function buildSources(available: AvailableBySource[], layers: LayerView[]): SourceRemain[] {
  const holds = new Map<string, { live: Set<number>; all: Set<number> }>();
  for (const l of layers) {
    const entry = holds.get(l.source_vessel) ?? { live: new Set<number>(), all: new Set<number>() };
    entry.all.add(l.hold_no);
    if (!isZero(l.remaining_tons)) entry.live.add(l.hold_no);
    holds.set(l.source_vessel, entry);
  }
  const tons = new Map(available.map((a) => [a.source_vessel, a.remaining_tons]));
  // A source written off everywhere drops out of availableBySource; keep it visible at zero.
  for (const name of holds.keys()) if (!tons.has(name)) tons.set(name, 0);

  const max = Math.max(0, ...tons.values());
  return [...tons.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source_vessel, remaining_tons]) => {
      const h = holds.get(source_vessel);
      const live = [...(h?.live ?? [])].sort((a, b) => a - b);
      const gone = [...(h?.all ?? [])].filter((n) => !h?.live.has(n)).sort((a, b) => a - b);
      return {
        source_vessel,
        remaining_tons,
        barPct: max > 0 ? (remaining_tons / max) * 100 : 0,
        hold_nos: live,
        written_off_hold_nos: gone,
      };
    });
}

export interface HistoryAllocation {
  cargo_layer_id: string;
  load_sequence: number;
  source_vessel: string;
  discharged_tons: number;
  /** What the layer held right after this operation. */
  remaining_after: number;
  closed: boolean;
}

export interface HistoryEntry {
  operation_id: string;
  /** 1-based chronological number among the voyage's discharges. */
  seq: number;
  event_date: string;
  hold_no: number;
  tons: number;
  crane_name: string | null;
  crane_mode: string | null;
  coefficient: number | null;
  corrected_tons: number | null;
  ogv_hold_no: number | null;
  allocations: HistoryAllocation[];
}

/**
 * Discharges newest first. The layer's remain after an operation = its remain now
 * plus whatever later discharges took from it.
 */
export function buildHistory(ops: DischargeOperationView[]): HistoryEntry[] {
  const takenLater = new Map<string, number>();
  const out: HistoryEntry[] = [];
  ops.forEach((op, i) => {
    out.push({
      operation_id: op.operation_id,
      seq: ops.length - i,
      event_date: op.event_date,
      hold_no: op.hold_no,
      tons: op.tons,
      crane_name: op.crane_name,
      crane_mode: op.crane_mode,
      coefficient: op.coefficient,
      corrected_tons: op.corrected_tons,
      ogv_hold_no: op.ogv_hold_no,
      allocations: op.allocations.map((a) => {
        const after = a.layer_remaining_tons + (takenLater.get(a.cargo_layer_id) ?? 0);
        return {
          cargo_layer_id: a.cargo_layer_id,
          load_sequence: a.load_sequence,
          source_vessel: a.source_vessel,
          discharged_tons: a.discharged_tons,
          remaining_after: after,
          closed: isZero(after),
        };
      }),
    });
    for (const a of op.allocations) {
      takenLater.set(a.cargo_layer_id, (takenLater.get(a.cargo_layer_id) ?? 0) + a.discharged_tons);
    }
  });
  return out;
}
