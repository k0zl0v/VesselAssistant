import { dischargeFromHold } from '../calc/discharge';
import { InsufficientCargoError } from '../calc/errors';
import type { DischargeAllocation, Layer } from '../calc/types';
import type { BatchStatement, Db } from './db';
import { AppError } from './errors';
import type {
  AvailableBySource,
  CargoLayerRow,
  DischargeInput,
  DischargeResult,
} from './types';
import { withVoyageGuard, type MutationOptions } from './voyageGuard';

const INSERT_OPERATION = `INSERT INTO operations (
    id, voyage_id, type, event_date, time_from, time_to,
    source_hold, tons, description
  ) VALUES (?, ?, 'discharge', ?, ?, ?, ?, ?, ?)`;

const INSERT_ALLOCATION = `INSERT INTO discharge_allocations (
    id, operation_id, cargo_layer_id, cargo_lot_id, hold_id,
    source_vessel, discharged_tons
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`;

const UPDATE_LAYER_IF_UNCHANGED = `UPDATE cargo_layers
    SET remaining_tons = ?, layer_status = ?
  WHERE id = ? AND remaining_tons = ?`;

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
   * Discharge `tons` from a hold using LIFO order (TZ §5.1). Reads the hold's layers,
   * runs `dischargeFromHold` (pure), then writes the operation, its allocations and the
   * changed layers as one `executeBatch` — all or nothing.
   *
   * The read is outside the batch: each layer update is conditioned on the value read,
   * so a layer changed in between aborts the whole batch with `batch.stale`.
   * A short hold throws `ogv.insufficient_cargo` before anything is written.
   */
  async discharge(input: DischargeInput, opts?: MutationOptions): Promise<DischargeResult> {
    if (input.tons <= 0) {
      throw new Error(`discharge tons must be positive, got ${input.tons}`);
    }

    return withVoyageGuard(this.db, input.voyage_id, opts, async () => {
      const before = await this.db.select<CargoLayerRow>(
        `SELECT * FROM cargo_layers
          WHERE voyage_id = ? AND hold_id = ? AND remaining_tons > 0
          ORDER BY load_sequence DESC`,
        [input.voyage_id, input.hold_id],
      );
      const layers: Layer[] = before.map((r) => ({ ...r }));
      const operationId = crypto.randomUUID();

      let allocations: DischargeAllocation[];
      try {
        allocations = dischargeFromHold(operationId, input.hold_id, input.tons, layers);
      } catch (e) {
        if (!(e instanceof InsufficientCargoError)) throw e;
        throw new AppError('ogv.insufficient_cargo', {
          hold_no: await this.holdNo(input.hold_id),
          short_tons: e.short_tons,
        });
      }

      const batch: BatchStatement[] = [
        {
          sql: INSERT_OPERATION,
          params: [
            operationId,
            input.voyage_id,
            input.event_date,
            input.time_from ?? null,
            input.time_to ?? null,
            input.hold_id,
            input.tons,
            input.description ?? null,
          ],
        },
        ...allocations.map((a) => ({
          sql: INSERT_ALLOCATION,
          params: [
            crypto.randomUUID(),
            a.operation_id,
            a.cargo_layer_id,
            a.cargo_lot_id,
            a.hold_id,
            a.source_vessel,
            a.discharged_tons,
          ],
        })),
        ...layers.flatMap((layer, i) => {
          const read = before[i]!.remaining_tons;
          if (layer.remaining_tons === read) return [];
          return [{
            sql: UPDATE_LAYER_IF_UNCHANGED,
            params: [layer.remaining_tons, layer.layer_status, layer.id, read],
            expectRowsAffected: 1,
          }];
        }),
      ];
      await this.db.executeBatch(batch);

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

  private async holdNo(hold_id: string): Promise<number> {
    const [hold] = await this.db.select<{ hold_no: number }>(`SELECT hold_no FROM holds WHERE id = ?`, [hold_id]);
    if (!hold) throw new AppError('hold.not_found', { hold_id });
    return hold.hold_no;
  }
}
