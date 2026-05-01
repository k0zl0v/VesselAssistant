import type { Db } from './db';
import type { AddLotInput, CargoLot } from './types';

export class CargoLotService {
  constructor(private readonly db: Db) {}

  /**
   * Adds a lot AND its corresponding cargo_layers row in one transaction.
   * `load_sequence` is the next free integer for (voyage_id, hold_id).
   * Layer's `remaining_tons` starts equal to lot's `loaded_tons` (TZ §3, §5).
   */
  async add(input: AddLotInput): Promise<CargoLot> {
    return await this.db.transaction(async (tx) => {
      const seqRows = await tx.select<{ next_seq: number }>(
        `SELECT COALESCE(MAX(load_sequence), 0) + 1 AS next_seq
           FROM cargo_lots
          WHERE voyage_id = ? AND hold_id = ?`,
        [input.voyage_id, input.hold_id],
      );
      const load_sequence = seqRows[0]!.next_seq;

      const lotId = crypto.randomUUID();
      const layerId = crypto.randomUUID();
      const loadedAt = input.loaded_at ?? new Date().toISOString();

      await tx.execute(
        `INSERT INTO cargo_lots (
           id, voyage_id, source_vessel, cargo_id, hold_id,
           protein_percent, sf, planned_tons, loaded_tons,
           bl_no, load_sequence, loaded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lotId,
          input.voyage_id,
          input.source_vessel,
          input.cargo_id,
          input.hold_id,
          input.protein_percent ?? null,
          input.sf,
          input.planned_tons,
          input.loaded_tons,
          input.bl_no ?? null,
          load_sequence,
          loadedAt,
        ],
      );

      await tx.execute(
        `INSERT INTO cargo_layers (
           id, cargo_lot_id, voyage_id, hold_id, source_vessel,
           loaded_tons, remaining_tons, load_sequence, layer_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          layerId,
          lotId,
          input.voyage_id,
          input.hold_id,
          input.source_vessel,
          input.loaded_tons,
          input.loaded_tons,
          load_sequence,
        ],
      );

      const rows = await tx.select<CargoLot>(
        `SELECT * FROM cargo_lots WHERE id = ?`,
        [lotId],
      );
      return rows[0]!;
    });
  }

  async listByVoyage(voyage_id: string): Promise<CargoLot[]> {
    return await this.db.select<CargoLot>(
      `SELECT * FROM cargo_lots
        WHERE voyage_id = ?
        ORDER BY hold_id, load_sequence`,
      [voyage_id],
    );
  }

  async listByHold(voyage_id: string, hold_id: string): Promise<CargoLot[]> {
    return await this.db.select<CargoLot>(
      `SELECT * FROM cargo_lots
        WHERE voyage_id = ? AND hold_id = ?
        ORDER BY load_sequence`,
      [voyage_id, hold_id],
    );
  }
}
