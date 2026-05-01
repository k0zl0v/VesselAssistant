import type { Db } from './db';
import type { AddLotInput, CargoLot } from './types';

export class CargoLotService {
  constructor(private readonly db: Db) {}

  /**
   * Adds a lot AND its corresponding cargo_layers row in one transaction.
   * `load_sequence` is the next free integer for (voyage_id, hold_id).
   * Layer's `remaining_tons` starts equal to lot's `loaded_tons` (TZ §3, §5).
   *
   * When this is the first lot in a hold for the given cargo (no row in
   * `hold_cargo_parameters` for the (voyage, hold, cargo) triple), the
   * lot's SF is also written there so CalculationService has an SF to
   * compute capacity. Subsequent lots in the same hold leave the existing
   * parameter row untouched — matching the original Excel which stores
   * one SF per hold.
   */
  async add(input: AddLotInput): Promise<CargoLot> {
    return await this.db.transaction(async (tx) => {
      const vesselRows = await tx.select<{ vessel_id: string }>(
        `SELECT vessel_id FROM voyages WHERE id = ?`,
        [input.voyage_id],
      );
      const vesselId = vesselRows[0]?.vessel_id;
      if (!vesselId) throw new Error(`voyage ${input.voyage_id} not found`);

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

      const existingParam = await tx.select<{ id: string }>(
        `SELECT id FROM hold_cargo_parameters
          WHERE voyage_id = ? AND hold_id = ? AND cargo_id = ?`,
        [input.voyage_id, input.hold_id, input.cargo_id],
      );
      if (existingParam.length === 0) {
        await tx.execute(
          `INSERT INTO hold_cargo_parameters
             (id, voyage_id, vessel_id, hold_id, cargo_id, protein_percent, sf, fill_percent)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0.98)`,
          [
            crypto.randomUUID(),
            input.voyage_id,
            vesselId,
            input.hold_id,
            input.cargo_id,
            input.protein_percent ?? null,
            input.sf,
          ],
        );
      }

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
