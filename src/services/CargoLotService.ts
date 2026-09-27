import { wouldOverload } from '../calc/capacity';
import type { Db } from './db';
import { AppError } from './errors';
import { PROTEIN_ALLOWED, type AddLotInput, type CargoLot } from './types';
import { withVoyageGuard, type MutationOptions } from './voyageGuard';

/**
 * Marker prefix for overload-guard errors (AT-05 / TZ §8 rule 2).
 * The full message is `OVERLOAD:<json>` where `<json>` carries the
 * OverloadCheckResult plus `hold_id` so the UI can show a localized
 * confirm dialog via `t('lot.confirm.overload', ...)`.
 */
export const OVERLOAD_ERROR_PREFIX = 'OVERLOAD:';

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
  async add(input: AddLotInput, opts?: MutationOptions): Promise<CargoLot> {
    const protein = input.protein_percent;
    if (protein != null && !PROTEIN_ALLOWED.includes(protein)) {
      throw new AppError('protein.invalid', { value: protein });
    }
    return withVoyageGuard(this.db, input.voyage_id, opts, () => this.db.transaction(async (tx) => {
      const vesselRows = await tx.select<{ vessel_id: string }>(
        `SELECT vessel_id FROM voyages WHERE id = ?`,
        [input.voyage_id],
      );
      const vesselId = vesselRows[0]?.vessel_id;
      if (!vesselId) throw new AppError('voyage.not_found', { voyage_id: input.voyage_id });

      // Overload guard (TZ §8 rule 2, AT-05). We check BEFORE inserting so a
      // refused lot doesn't pollute the layer table. The SF used here is the
      // SF the operator is recording on THIS lot — even if a different SF was
      // saved earlier in `hold_cargo_parameters`, what matters for the check
      // is the cargo physics being declared right now.
      const holdRows = await tx.select<{ volume_m3: number }>(
        `SELECT volume_m3 FROM holds WHERE id = ?`,
        [input.hold_id],
      );
      const hold_volume_m3 = holdRows[0]?.volume_m3;
      if (hold_volume_m3 == null) {
        throw new AppError('hold.not_found', { hold_id: input.hold_id });
      }
      const remainRows = await tx.select<{ remain: number | null }>(
        `SELECT COALESCE(SUM(remaining_tons), 0) AS remain
           FROM cargo_layers
          WHERE voyage_id = ? AND hold_id = ?`,
        [input.voyage_id, input.hold_id],
      );
      const current_remain_tons = Number(remainRows[0]?.remain ?? 0);
      const overload = wouldOverload({
        hold_volume_m3,
        sf: input.sf,
        fill_percent: 0.98,
        current_remain_tons,
        added_tons: input.loaded_tons,
      });
      if (overload.overloads && !input.acknowledge_overload) {
        throw new Error(
          `${OVERLOAD_ERROR_PREFIX}${JSON.stringify({
            ...overload,
            hold_id: input.hold_id,
          })}`,
        );
      }

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
    }));
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
