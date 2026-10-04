import type { Db } from './db';
import { withVoyageGuard, type MutationOptions } from './voyageGuard';

/** Header fields of the Standard Time Sheet that neither the journal nor the reference data supply. */
export interface SofTimeSheet {
  id: string;
  voyage_id: string;
  shipping_company: string | null;
  cargo_description: string | null;
  cargo_documents_on_board: string | null;
  charter_party: string | null;
  bill_weight_tons: number | null;
  nor_accepted_note: string | null;
  updated_at: string;
}

export type SofTimeSheetInput = Pick<
  SofTimeSheet,
  | 'shipping_company'
  | 'cargo_description'
  | 'cargo_documents_on_board'
  | 'charter_party'
  | 'bill_weight_tons'
  | 'nor_accepted_note'
>;

const text = (v: string | null | undefined): string | null => {
  const s = v?.trim();
  return s ? s : null;
};

/** One row per voyage (`sof_time_sheets.voyage_id` is UNIQUE); a voyage without a row has an empty header. */
export class SofTimeSheetService {
  constructor(private readonly db: Db) {}

  async get(voyage_id: string): Promise<SofTimeSheet | null> {
    const rows = await this.db.select<SofTimeSheet>(`SELECT * FROM sof_time_sheets WHERE voyage_id = ?`, [voyage_id]);
    return rows[0] ?? null;
  }

  /** Insert or replace every field of the voyage's header; blank strings are stored as NULL. */
  async upsert(voyage_id: string, input: SofTimeSheetInput, opts?: MutationOptions): Promise<SofTimeSheet> {
    const weight = input.bill_weight_tons;
    if (weight !== null && (!Number.isFinite(weight) || weight < 0)) {
      throw new Error(`bill_weight_tons must be a non-negative number, got ${weight}`);
    }
    await withVoyageGuard(this.db, voyage_id, opts, () =>
      this.db.execute(
        `INSERT INTO sof_time_sheets (
           id, voyage_id, shipping_company, cargo_description, cargo_documents_on_board,
           charter_party, bill_weight_tons, nor_accepted_note
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(voyage_id) DO UPDATE SET
           shipping_company = excluded.shipping_company,
           cargo_description = excluded.cargo_description,
           cargo_documents_on_board = excluded.cargo_documents_on_board,
           charter_party = excluded.charter_party,
           bill_weight_tons = excluded.bill_weight_tons,
           nor_accepted_note = excluded.nor_accepted_note,
           updated_at = datetime('now')`,
        [
          crypto.randomUUID(),
          voyage_id,
          text(input.shipping_company),
          text(input.cargo_description),
          text(input.cargo_documents_on_board),
          text(input.charter_party),
          weight,
          text(input.nor_accepted_note),
        ],
      ),
    );
    return (await this.get(voyage_id))!;
  }
}
