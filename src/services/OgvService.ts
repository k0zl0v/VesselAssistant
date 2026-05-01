import { dischargeFromHold } from '../calc/discharge';
import type { Layer } from '../calc/types';
import type { Db } from './db';
import type {
  AvailableBySource,
  CargoLayerRow,
  DischargeInput,
  DischargeResult,
} from './types';

export class OgvService {
  constructor(private readonly db: Db) {}

  /**
   * Cargo currently available on the main vessel for the voyage,
   * grouped by source vessel. Used by OGV UI to populate dropdowns
   * (TZ §5.2, FR-21).
   */
  async availableBySource(voyage_id: string): Promise<AvailableBySource[]> {
    return await this.db.select<AvailableBySource>(
      `SELECT source_vessel, SUM(remaining_tons) AS remaining_tons
         FROM cargo_layers
        WHERE voyage_id = ? AND remaining_tons > 0
        GROUP BY source_vessel
        ORDER BY source_vessel`,
      [voyage_id],
    );
  }

  /**
   * Discharge `tons` from a hold using LIFO order (TZ §5.1).
   * Atomically:
   *  1. Inserts an `operations` row.
   *  2. Loads layers for the hold, runs `dischargeFromHold` (pure).
   *  3. Inserts `discharge_allocations` per affected layer.
   *  4. Updates `cargo_layers.remaining_tons` and `layer_status`.
   *
   * Throws if the hold has insufficient cargo. Caller does not see
   * partial state — transaction rolls back.
   */
  async discharge(input: DischargeInput): Promise<DischargeResult> {
    if (input.tons <= 0) {
      throw new Error(`discharge tons must be positive, got ${input.tons}`);
    }

    return await this.db.transaction(async (tx) => {
      const operationId = crypto.randomUUID();
      await tx.execute(
        `INSERT INTO operations (
           id, voyage_id, type, event_date, time_from, time_to,
           source_hold, tons, description
         ) VALUES (?, ?, 'discharge', ?, ?, ?, ?, ?, ?)`,
        [
          operationId,
          input.voyage_id,
          input.event_date,
          input.time_from ?? null,
          input.time_to ?? null,
          input.hold_id,
          input.tons,
          input.description ?? null,
        ],
      );

      const layerRows = await tx.select<CargoLayerRow>(
        `SELECT * FROM cargo_layers
          WHERE voyage_id = ? AND hold_id = ? AND remaining_tons > 0
          ORDER BY load_sequence DESC`,
        [input.voyage_id, input.hold_id],
      );

      // Map DB rows to the calc engine's Layer shape; this also gives us
      // a mutable working copy so dischargeFromHold can update remaining_tons.
      const layers: Layer[] = layerRows.map((r) => ({ ...r }));

      const allocations = dischargeFromHold(
        operationId,
        input.hold_id,
        input.tons,
        layers,
      );

      for (const alloc of allocations) {
        await tx.execute(
          `INSERT INTO discharge_allocations (
             id, operation_id, cargo_layer_id, cargo_lot_id, hold_id,
             source_vessel, discharged_tons
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            alloc.operation_id,
            alloc.cargo_layer_id,
            alloc.cargo_lot_id,
            alloc.hold_id,
            alloc.source_vessel,
            alloc.discharged_tons,
          ],
        );
      }

      for (const layer of layers) {
        if (layer.remaining_tons !== layerRows.find((r) => r.id === layer.id)!.remaining_tons) {
          await tx.execute(
            `UPDATE cargo_layers
                SET remaining_tons = ?, layer_status = ?
              WHERE id = ?`,
            [layer.remaining_tons, layer.layer_status, layer.id],
          );
        }
      }

      return {
        operation_id: operationId,
        allocations: allocations.map((a) => ({
          cargo_layer_id: a.cargo_layer_id,
          cargo_lot_id: a.cargo_lot_id,
          source_vessel: a.source_vessel,
          discharged_tons: a.discharged_tons,
        })),
      };
    });
  }
}
