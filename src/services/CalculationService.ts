import {
  capacityTons,
  emptySpace,
  emptyVolumePercent,
  totalEmpty,
} from '../calc/capacity';
import type { Db } from './db';

export interface VoyageHoldCalc {
  hold_id: string;
  hold_no: number;
  volume_m3: number;
  sf: number | null;
  fill_percent: number;
  loaded_tons: number;
  discharged_tons: number;
  remain_tons: number;
  used_volume_m3: number;
  capacity_tons_100: number | null;
  capacity_tons_98: number | null;
  empty_space_100: number | null;
  empty_space_98: number | null;
  empty_volume_percent: number | null;
}

export interface VoyageCalcTotals {
  on_board: number;
  total_loaded: number;
  total_discharged: number;
  total_empty_100: number;
  total_empty_98: number;
}

export interface VoyageCalcResult {
  voyage_id: string;
  holds: VoyageHoldCalc[];
  totals: VoyageCalcTotals;
}

interface HoldRow {
  hold_id: string;
  hold_no: number;
  volume_m3: number;
  sf: number | null;
  fill_percent: number | null;
  loaded_tons: number;
  discharged_tons: number;
  remain_tons: number;
  used_volume_m3: number;
}

const DEFAULT_FILL_PERCENT = 0.98;

/**
 * Aggregates a voyage into a per-hold calc + totals view-model.
 * Reads SF and fill_percent from `hold_cargo_parameters` (per-hold,
 * per-cargo — TZ FR-20). When SF is missing, capacity / empty space
 * for that hold are returned as null and excluded from totals.
 *
 * `remain_tons` is read from the denormalized `cargo_layers` field
 * (TZ — see db-migrations skill); `used_volume_m3` is computed
 * across each lot's own SF.
 */
export class CalculationService {
  constructor(private readonly db: Db) {}

  async calculate(voyage_id: string): Promise<VoyageCalcResult> {
    const rows = await this.db.select<HoldRow>(
      `SELECT
         h.id          AS hold_id,
         h.hold_no     AS hold_no,
         h.volume_m3   AS volume_m3,
         hp.sf         AS sf,
         hp.fill_percent AS fill_percent,
         COALESCE(loaded.loaded_tons, 0)     AS loaded_tons,
         COALESCE(disc.discharged_tons, 0)   AS discharged_tons,
         COALESCE(rem.remain_tons, 0)        AS remain_tons,
         COALESCE(used.used_volume_m3, 0)    AS used_volume_m3
       FROM holds h
       JOIN voyages v ON v.vessel_id = h.vessel_id
       LEFT JOIN hold_cargo_parameters hp
              ON hp.voyage_id = v.id AND hp.hold_id = h.id
       LEFT JOIN (
         SELECT hold_id, SUM(loaded_tons) AS loaded_tons
           FROM cargo_lots
          WHERE voyage_id = ?
          GROUP BY hold_id
       ) loaded ON loaded.hold_id = h.id
       LEFT JOIN (
         SELECT da.hold_id, SUM(da.discharged_tons) AS discharged_tons
           FROM discharge_allocations da
           JOIN operations op ON op.id = da.operation_id
          WHERE op.voyage_id = ?
          GROUP BY da.hold_id
       ) disc ON disc.hold_id = h.id
       LEFT JOIN (
         SELECT hold_id, SUM(remaining_tons) AS remain_tons
           FROM cargo_layers
          WHERE voyage_id = ?
          GROUP BY hold_id
       ) rem ON rem.hold_id = h.id
       LEFT JOIN (
         SELECT cl.hold_id, SUM(cl.remaining_tons * lot.sf) AS used_volume_m3
           FROM cargo_layers cl
           JOIN cargo_lots lot ON lot.id = cl.cargo_lot_id
          WHERE cl.voyage_id = ?
          GROUP BY cl.hold_id
       ) used ON used.hold_id = h.id
       WHERE v.id = ?
       ORDER BY h.hold_no`,
      [voyage_id, voyage_id, voyage_id, voyage_id, voyage_id],
    );

    const holds: VoyageHoldCalc[] = rows.map((r) => {
      const fill = r.fill_percent ?? DEFAULT_FILL_PERCENT;
      const sf = r.sf;

      let cap100: number | null = null;
      let cap98: number | null = null;
      let empty100: number | null = null;
      let empty98: number | null = null;

      if (sf !== null && sf > 0) {
        cap100 = capacityTons({
          hold_volume_m3: r.volume_m3,
          sf,
          fill_percent: 1,
        });
        cap98 = capacityTons({
          hold_volume_m3: r.volume_m3,
          sf,
          fill_percent: fill,
        });
        empty100 = emptySpace(cap100, r.remain_tons);
        empty98 = emptySpace(cap98, r.remain_tons);
      }

      const evp =
        r.volume_m3 > 0
          ? emptyVolumePercent(r.used_volume_m3, r.volume_m3)
          : null;

      return {
        hold_id: r.hold_id,
        hold_no: r.hold_no,
        volume_m3: r.volume_m3,
        sf,
        fill_percent: fill,
        loaded_tons: r.loaded_tons,
        discharged_tons: r.discharged_tons,
        remain_tons: r.remain_tons,
        used_volume_m3: r.used_volume_m3,
        capacity_tons_100: cap100,
        capacity_tons_98: cap98,
        empty_space_100: empty100,
        empty_space_98: empty98,
        empty_volume_percent: evp,
      };
    });

    const totals: VoyageCalcTotals = {
      on_board: holds.reduce((s, h) => s + h.remain_tons, 0),
      total_loaded: holds.reduce((s, h) => s + h.loaded_tons, 0),
      total_discharged: holds.reduce((s, h) => s + h.discharged_tons, 0),
      total_empty_100: totalEmpty(holds.map((h) => h.empty_space_100 ?? 0)),
      total_empty_98: totalEmpty(holds.map((h) => h.empty_space_98 ?? 0)),
    };

    return { voyage_id, holds, totals };
  }
}
