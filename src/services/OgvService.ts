import { dischargeFromHold } from '../calc/discharge';
import { InsufficientCargoError } from '../calc/errors';
import type { DischargeAllocation, Layer } from '../calc/types';
import type { BatchStatement, Db } from './db';
import { CraneShiftService, type CraneMode } from './CraneShiftService';
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
    source_hold, crane_id, tons, description
  ) VALUES (?, ?, 'discharge', ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_OGV_RECEIPT = `INSERT INTO ogv_receipts (
    id, ogv_id, ogv_hold_id, source_kind, source_name, cargo_id, tons,
    started_at, completed_at, operation_id, note
  ) VALUES (?, ?, ?, 'main_hold', ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_SHIFT_RECORD = `INSERT INTO crane_shift_records (
    id, voyage_id, shift_date, crane_id, mode, scale_tons, coefficient, corrected_tons, operation_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * A discharge from a main-vessel hold. `tons` is the ship's scale weight: it goes into the
 * layers and hold remains; the crane-corrected weight lives only on the crane sheet.
 */
export interface OgvDischargeInput extends DischargeInput {
  crane_id?: string | null;
  /** Default `from_own` — a discharge from the vessel's own holds. */
  crane_mode?: CraneMode;
  /** The OGV hold the cargo went into; writes an `ogv_receipts` row. */
  ogv_hold_id?: string | null;
}

export interface OgvDischargeResult extends DischargeResult {
  /** Present when a crane was given. */
  crane?: { coefficient: number; corrected_tons: number };
}

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
   * With `crane_id` the working coefficient is looked up first (`crane.no_coefficient` if none)
   * and a crane-sheet row joins the batch; with `ogv_hold_id` an OGV receipt does.
   */
  async discharge(input: OgvDischargeInput, opts?: MutationOptions): Promise<OgvDischargeResult> {
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
      const craneId = input.crane_id ?? null;
      const mode: CraneMode = input.crane_mode ?? 'from_own';
      const correction = craneId
        ? await new CraneShiftService(this.db).correct(input.tons, craneId, mode, input.event_date)
        : null;
      const ogvHold = input.ogv_hold_id ? await this.ogvHold(input.voyage_id, input.ogv_hold_id) : null;

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
            craneId,
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
      if (ogvHold) {
        const holdNo = await this.holdNo(input.hold_id);
        const [lot] = await this.db.select<{ cargo_id: string }>(
          `SELECT cargo_id FROM cargo_lots WHERE id = ?`,
          [allocations[0]!.cargo_lot_id],
        );
        batch.push({
          sql: INSERT_OGV_RECEIPT,
          params: [
            crypto.randomUUID(),
            ogvHold.ogv_id,
            ogvHold.id,
            `Hold №${holdNo}`,
            lot?.cargo_id ?? null,
            input.tons,
            stamp(input.event_date, input.time_from),
            input.time_to ? stamp(input.event_date, input.time_to) : null,
            operationId,
            input.description ?? null,
          ],
        });
      }
      if (craneId && correction) {
        batch.push({
          sql: INSERT_SHIFT_RECORD,
          params: [
            crypto.randomUUID(),
            input.voyage_id,
            input.event_date,
            craneId,
            mode,
            input.tons,
            correction.coefficient,
            correction.corrected_tons,
            operationId,
          ],
        });
      }
      await this.db.executeBatch(batch);

      return {
        ...(correction && { crane: { coefficient: correction.coefficient, corrected_tons: correction.corrected_tons } }),
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

  private async ogvHold(voyage_id: string, ogv_hold_id: string): Promise<{ id: string; ogv_id: string }> {
    const [row] = await this.db.select<{ id: string; ogv_id: string }>(
      `SELECT h.id, h.ogv_id FROM ogv_holds h JOIN ogv_vessels v ON v.id = h.ogv_id
        WHERE h.id = ? AND v.voyage_id = ?`,
      [ogv_hold_id, voyage_id],
    );
    if (!row) throw new AppError('ogv.hold_not_found', { ogv_hold_id });
    return row;
  }

  private async holdNo(hold_id: string): Promise<number> {
    const [hold] = await this.db.select<{ hold_no: number }>(`SELECT hold_no FROM holds WHERE id = ?`, [hold_id]);
    if (!hold) throw new AppError('hold.not_found', { hold_id });
    return hold.hold_no;
  }
}

/** `2026-09-24` + `12:40` → `2026-09-24 12:40`; no time → the date alone. */
function stamp(date: string, time: string | null | undefined): string {
  return time ? `${date} ${time}` : date;
}
