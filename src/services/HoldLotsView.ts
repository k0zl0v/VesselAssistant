import type { Db } from './db';

export interface HoldLotView {
  cargo_lot_id: string;
  source_vessel: string;
  cargo_name: string;
  load_sequence: number;
  sf: number;
  protein_percent: number | null;
  loaded_tons: number;
  remaining_tons: number;
  loaded_at: string;
}

/**
 * Lots in a hold for the OGV / lot-list UI, joined with cargo name and
 * the latest layer remaining_tons. Ordered by load_sequence ascending
 * so the user reads bottom-to-top (oldest first).
 */
export async function listHoldLots(
  db: Db,
  voyage_id: string,
  hold_id: string,
): Promise<HoldLotView[]> {
  return await db.select<HoldLotView>(
    `SELECT
       l.id            AS cargo_lot_id,
       l.source_vessel AS source_vessel,
       c.name          AS cargo_name,
       l.load_sequence AS load_sequence,
       l.sf            AS sf,
       l.protein_percent AS protein_percent,
       l.loaded_tons   AS loaded_tons,
       COALESCE(cl.remaining_tons, l.loaded_tons) AS remaining_tons,
       l.loaded_at     AS loaded_at
     FROM cargo_lots l
     JOIN cargoes c ON c.id = l.cargo_id
     LEFT JOIN cargo_layers cl ON cl.cargo_lot_id = l.id
     WHERE l.voyage_id = ? AND l.hold_id = ?
     ORDER BY l.load_sequence`,
    [voyage_id, hold_id],
  );
}
