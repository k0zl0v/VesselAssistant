import { roundTo3 } from '../calc/round';
import type { BatchStatement, Db } from './db';
import { AppError } from './errors';
import { withVoyageGuard, type MutationOptions } from './voyageGuard';

export type OgvStatus = 'planned' | 'loading' | 'completed';

export interface OgvVessel {
  id: string;
  voyage_id: string;
  name: string;
  status: OgvStatus;
}

export interface OgvHold {
  id: string;
  ogv_id: string;
  hold_no: number;
  planned_tons: number;
}

export interface CreateOgvInput {
  voyage_id: string;
  name: string;
  status?: OgvStatus;
  holds: { hold_no: number; planned_tons: number }[];
}

export interface BargeReceiptInput {
  voyage_id: string;
  ogv_hold_id: string;
  /** The barge name, e.g. «KAVKAZ III». */
  source_name: string;
  cargo_id?: string | null;
  tons: number;
  started_at?: string | null;
  completed_at?: string | null;
  note?: string | null;
}

export interface SequenceStepInput {
  ogv_hold_id: string;
  planned_tons: number;
  label?: string | null;
}

export interface OgvSequenceStep {
  id: string;
  ogv_id: string;
  step_no: number;
  ogv_hold_id: string;
  planned_tons: number;
  label: string | null;
}

/** Per OGV hold: cargo plan vs what came aboard. A negative remain is loading over plan — normal for an OGV. */
export interface OgvHoldView extends OgvHold {
  loaded_tons: number;
  barge_tons: number;
  main_hold_tons: number;
  /** planned − loaded, full precision. */
  remain_tons: number;
  over_plan: boolean;
  /** loaded / planned × 100; null for a zero plan. */
  fill_percent: number | null;
}

export interface OgvReceiptView {
  id: string;
  ogv_hold_id: string;
  ogv_hold_no: number;
  source_kind: 'barge' | 'main_hold';
  source_name: string;
  cargo_name: string | null;
  tons: number;
  started_at: string | null;
  completed_at: string | null;
  operation_id: string | null;
  note: string | null;
  /** main_hold only: the discharged hold of the main vessel. */
  source_hold_no: number | null;
  crane_name: string | null;
  crane_mode: string | null;
  coefficient: number | null;
  corrected_tons: number | null;
}

export type StepState = 'done' | 'current' | 'pending';

export interface OgvStepView extends OgvSequenceStep {
  ogv_hold_no: number;
  /** The part of the hold's receipts this step accounts for, in step order. */
  filled_tons: number;
  remain_tons: number;
  state: StepState;
}

export interface OgvSummary {
  vessel: OgvVessel;
  /** Stern to bow — highest hold number first, as in the cargo plan. */
  holds: OgvHoldView[];
  receipts: OgvReceiptView[];
  steps: OgvStepView[];
  totals: {
    planned_tons: number;
    loaded_tons: number;
    remain_tons: number;
    barge_tons: number;
    main_hold_tons: number;
    main_hold_operations: number;
    over_plan_hold_nos: number[];
  };
}

const isOver = (remain: number): boolean => roundTo3(remain) < 0;

/**
 * The ocean-going vessel loaded on a voyage (docs/ui/excel-reference.md §1): one per voyage,
 * its holds with the cargo plan, barge receipts, the sequence plan, and the read model of the
 * OGV screen. Receipts from the main vessel's holds are written by `OgvService.discharge`.
 */
export class OgvVesselService {
  constructor(private readonly db: Db) {}

  async get(voyage_id: string): Promise<OgvVessel | null> {
    const [row] = await this.db.select<OgvVessel>(
      `SELECT id, voyage_id, name, status FROM ogv_vessels WHERE voyage_id = ?`,
      [voyage_id],
    );
    return row ?? null;
  }

  async holds(ogv_id: string): Promise<OgvHold[]> {
    return await this.db.select<OgvHold>(
      `SELECT id, ogv_id, hold_no, planned_tons FROM ogv_holds WHERE ogv_id = ? ORDER BY hold_no DESC`,
      [ogv_id],
    );
  }

  /** Registers the voyage's OGV with its holds and cargo plan in one batch. */
  async create(input: CreateOgvInput, opts?: MutationOptions): Promise<OgvVessel> {
    const name = input.name.trim();
    if (!name) throw new Error('OGV name must not be empty');
    if (input.holds.length === 0) throw new Error('OGV needs at least one hold');
    const nos = new Set(input.holds.map((h) => h.hold_no));
    if (nos.size !== input.holds.length) throw new Error('OGV hold numbers must be unique');
    for (const h of input.holds) {
      if (!Number.isInteger(h.hold_no) || h.hold_no <= 0) throw new Error(`invalid OGV hold number ${h.hold_no}`);
      if (!Number.isFinite(h.planned_tons) || h.planned_tons < 0) throw new Error(`invalid planned tons ${h.planned_tons}`);
    }

    return withVoyageGuard(this.db, input.voyage_id, opts, async () => {
      if (await this.get(input.voyage_id)) throw new AppError('ogv.already_exists');
      const id = crypto.randomUUID();
      const status = input.status ?? 'loading';
      await this.db.executeBatch([
        {
          sql: `INSERT INTO ogv_vessels (id, voyage_id, name, status) VALUES (?, ?, ?, ?)`,
          params: [id, input.voyage_id, name, status],
        },
        ...input.holds.map<BatchStatement>((h) => ({
          sql: `INSERT INTO ogv_holds (id, ogv_id, hold_no, planned_tons) VALUES (?, ?, ?, ?)`,
          params: [crypto.randomUUID(), id, h.hold_no, h.planned_tons],
        })),
      ]);
      return { id, voyage_id: input.voyage_id, name, status };
    });
  }

  async setStatus(voyage_id: string, status: OgvStatus, opts?: MutationOptions): Promise<void> {
    return withVoyageGuard(this.db, voyage_id, opts, async () => {
      const ogv = await this.require(voyage_id);
      await this.db.execute(`UPDATE ogv_vessels SET status = ? WHERE id = ?`, [status, ogv.id]);
    });
  }

  async setHoldPlan(voyage_id: string, ogv_hold_id: string, planned_tons: number, opts?: MutationOptions): Promise<void> {
    if (!Number.isFinite(planned_tons) || planned_tons < 0) throw new Error(`invalid planned tons ${planned_tons}`);
    return withVoyageGuard(this.db, voyage_id, opts, async () => {
      await this.requireHold(voyage_id, ogv_hold_id);
      await this.db.execute(`UPDATE ogv_holds SET planned_tons = ? WHERE id = ?`, [planned_tons, ogv_hold_id]);
    });
  }

  /** Cargo transshipped from a barge straight into an OGV hold, bypassing the main vessel. */
  async addBargeReceipt(input: BargeReceiptInput, opts?: MutationOptions): Promise<string> {
    if (!(input.tons > 0)) throw new Error(`receipt tons must be positive, got ${input.tons}`);
    const source = input.source_name.trim();
    if (!source) throw new Error('barge name must not be empty');
    return withVoyageGuard(this.db, input.voyage_id, opts, async () => {
      const hold = await this.requireHold(input.voyage_id, input.ogv_hold_id);
      const id = crypto.randomUUID();
      await this.db.execute(
        `INSERT INTO ogv_receipts (id, ogv_id, ogv_hold_id, source_kind, source_name, cargo_id, tons,
                                   started_at, completed_at, note)
         VALUES (?, ?, ?, 'barge', ?, ?, ?, ?, ?, ?)`,
        [
          id, hold.ogv_id, hold.id, source, input.cargo_id ?? null, input.tons,
          input.started_at ?? null, input.completed_at ?? null, input.note ?? null,
        ],
      );
      return id;
    });
  }

  /** Only barge receipts are deleted here; a main-hold receipt belongs to its discharge operation. */
  async deleteBargeReceipt(voyage_id: string, receipt_id: string, opts?: MutationOptions): Promise<void> {
    return withVoyageGuard(this.db, voyage_id, opts, async () => {
      const ogv = await this.require(voyage_id);
      await this.db.executeBatch([
        {
          sql: `DELETE FROM ogv_receipts WHERE id = ? AND ogv_id = ? AND source_kind = 'barge'`,
          params: [receipt_id, ogv.id],
          expectRowsAffected: 1,
        },
      ]);
    });
  }

  async listSteps(ogv_id: string): Promise<OgvSequenceStep[]> {
    return await this.db.select<OgvSequenceStep>(
      `SELECT id, ogv_id, step_no, ogv_hold_id, planned_tons, label
         FROM ogv_sequence_steps WHERE ogv_id = ? ORDER BY step_no`,
      [ogv_id],
    );
  }

  /** Appends a step at the end of the sequence plan. */
  async addStep(voyage_id: string, input: SequenceStepInput, opts?: MutationOptions): Promise<string> {
    if (!(input.planned_tons > 0)) throw new Error(`step tons must be positive, got ${input.planned_tons}`);
    return withVoyageGuard(this.db, voyage_id, opts, async () => {
      const hold = await this.requireHold(voyage_id, input.ogv_hold_id);
      const [last] = await this.db.select<{ n: number | null }>(
        `SELECT MAX(step_no) AS n FROM ogv_sequence_steps WHERE ogv_id = ?`,
        [hold.ogv_id],
      );
      const id = crypto.randomUUID();
      await this.db.execute(
        `INSERT INTO ogv_sequence_steps (id, ogv_id, step_no, ogv_hold_id, planned_tons, label) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, hold.ogv_id, (last?.n ?? 0) + 1, hold.id, input.planned_tons, input.label?.trim() || null],
      );
      return id;
    });
  }

  async updateStep(voyage_id: string, step_id: string, input: SequenceStepInput, opts?: MutationOptions): Promise<void> {
    if (!(input.planned_tons > 0)) throw new Error(`step tons must be positive, got ${input.planned_tons}`);
    return withVoyageGuard(this.db, voyage_id, opts, async () => {
      const hold = await this.requireHold(voyage_id, input.ogv_hold_id);
      await this.db.executeBatch([
        {
          sql: `UPDATE ogv_sequence_steps SET ogv_hold_id = ?, planned_tons = ?, label = ? WHERE id = ? AND ogv_id = ?`,
          params: [hold.id, input.planned_tons, input.label?.trim() || null, step_id, hold.ogv_id],
          expectRowsAffected: 1,
        },
      ]);
    });
  }

  /** Step numbers may have gaps after a delete; the plan is read in step_no order. */
  async deleteStep(voyage_id: string, step_id: string, opts?: MutationOptions): Promise<void> {
    return withVoyageGuard(this.db, voyage_id, opts, async () => {
      const ogv = await this.require(voyage_id);
      await this.db.executeBatch([
        { sql: `DELETE FROM ogv_sequence_steps WHERE id = ? AND ogv_id = ?`, params: [step_id, ogv.id], expectRowsAffected: 1 },
      ]);
    });
  }

  /** Everything the OGV screen prints; null when the voyage has no OGV yet. */
  async summary(voyage_id: string): Promise<OgvSummary | null> {
    const vessel = await this.get(voyage_id);
    if (!vessel) return null;
    const [holds, receipts, steps] = await Promise.all([
      this.holds(vessel.id),
      this.db.select<OgvReceiptView>(
        `SELECT r.id, r.ogv_hold_id, oh.hold_no AS ogv_hold_no, r.source_kind, r.source_name,
                COALESCE(c.name, (SELECT c2.name FROM discharge_allocations da
                                     JOIN cargo_lots l ON l.id = da.cargo_lot_id
                                     JOIN cargoes c2 ON c2.id = l.cargo_id
                                    WHERE da.operation_id = r.operation_id LIMIT 1)) AS cargo_name,
                r.tons, r.started_at, r.completed_at, r.operation_id, r.note,
                h.hold_no AS source_hold_no, cr.name AS crane_name, sr.mode AS crane_mode,
                sr.coefficient AS coefficient, sr.corrected_tons AS corrected_tons
           FROM ogv_receipts r
           JOIN ogv_holds oh ON oh.id = r.ogv_hold_id
           LEFT JOIN cargoes c ON c.id = r.cargo_id
           LEFT JOIN operations op ON op.id = r.operation_id
           LEFT JOIN holds h ON h.id = op.source_hold
           LEFT JOIN crane_shift_records sr ON sr.id = (SELECT id FROM crane_shift_records WHERE operation_id = r.operation_id LIMIT 1)
           LEFT JOIN cranes cr ON cr.id = COALESCE(sr.crane_id, op.crane_id)
          WHERE r.ogv_id = ?
          ORDER BY CASE r.source_kind WHEN 'barge' THEN 0 ELSE 1 END,
                   COALESCE(r.started_at, ''), r.rowid`,
        [vessel.id],
      ),
      this.listSteps(vessel.id),
    ]);

    const holdViews: OgvHoldView[] = holds.map((h) => {
      const own = receipts.filter((r) => r.ogv_hold_id === h.id);
      const barge = own.filter((r) => r.source_kind === 'barge').reduce((s, r) => s + r.tons, 0);
      const main = own.filter((r) => r.source_kind === 'main_hold').reduce((s, r) => s + r.tons, 0);
      const loaded = barge + main;
      const remain = h.planned_tons - loaded;
      return {
        ...h,
        loaded_tons: loaded,
        barge_tons: barge,
        main_hold_tons: main,
        remain_tons: remain,
        over_plan: isOver(remain),
        fill_percent: h.planned_tons > 0 ? (loaded / h.planned_tons) * 100 : null,
      };
    });

    const sum = (f: (h: OgvHoldView) => number): number => holdViews.reduce((s, h) => s + f(h), 0);
    const planned = sum((h) => h.planned_tons);
    const loaded = sum((h) => h.loaded_tons);

    return {
      vessel,
      holds: holdViews,
      receipts,
      steps: deriveSteps(steps, holdViews),
      totals: {
        planned_tons: planned,
        loaded_tons: loaded,
        remain_tons: planned - loaded,
        barge_tons: sum((h) => h.barge_tons),
        main_hold_tons: sum((h) => h.main_hold_tons),
        main_hold_operations: receipts.filter((r) => r.source_kind === 'main_hold').length,
        over_plan_hold_nos: holdViews.filter((h) => h.over_plan).map((h) => h.hold_no),
      },
    };
  }

  private async require(voyage_id: string): Promise<OgvVessel> {
    const ogv = await this.get(voyage_id);
    if (!ogv) throw new AppError('ogv.not_found', { voyage_id });
    return ogv;
  }

  private async requireHold(voyage_id: string, ogv_hold_id: string): Promise<OgvHold> {
    const [row] = await this.db.select<OgvHold>(
      `SELECT h.id, h.ogv_id, h.hold_no, h.planned_tons
         FROM ogv_holds h JOIN ogv_vessels v ON v.id = h.ogv_id
        WHERE h.id = ? AND v.voyage_id = ?`,
      [ogv_hold_id, voyage_id],
    );
    if (!row) throw new AppError('ogv.hold_not_found', { ogv_hold_id });
    return row;
  }
}

/**
 * Step state from receipts: a hold's loaded tons fill its steps in step order, the last step of
 * a hold takes any excess. The first step not yet filled is the current one, later ones pending.
 */
export function deriveSteps(steps: OgvSequenceStep[], holds: OgvHoldView[]): OgvStepView[] {
  const left = new Map(holds.map((h) => [h.id, h.loaded_tons]));
  const lastStepOfHold = new Map<string, string>();
  for (const s of steps) lastStepOfHold.set(s.ogv_hold_id, s.id);
  let currentTaken = false;
  return steps.map((s) => {
    const available = left.get(s.ogv_hold_id) ?? 0;
    const filled = lastStepOfHold.get(s.ogv_hold_id) === s.id ? available : Math.min(available, s.planned_tons);
    left.set(s.ogv_hold_id, available - filled);
    const remain = s.planned_tons - filled;
    let state: StepState;
    if (roundTo3(remain) <= 0) state = 'done';
    else if (!currentTaken) {
      state = 'current';
      currentTaken = true;
    } else state = 'pending';
    return {
      ...s,
      ogv_hold_no: holds.find((h) => h.id === s.ogv_hold_id)?.hold_no ?? 0,
      filled_tons: filled,
      remain_tons: remain,
      state,
    };
  });
}
