import { normalizeTime, timeToMinutes } from '../calc/time';
import type { Db } from './db';

export interface SofEvent {
  id: string;
  voyage_id: string;
  event_date: string;
  time_from: string | null;
  time_to: string | null;
  category: string | null;
  description: string | null;
  daily_qty: number | null;
  total_qty: number | null;
}

export interface CreateSofEventInput {
  voyage_id: string;
  event_date: string;
  time_from?: string | null;
  time_to?: string | null;
  category?: string | null;
  description?: string | null;
  daily_qty?: number | null;
  total_qty?: number | null;
}

export interface UpdateSofEventInput {
  event_date?: string;
  time_from?: string | null;
  time_to?: string | null;
  category?: string | null;
  description?: string | null;
  daily_qty?: number | null;
  total_qty?: number | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validate(input: { event_date: string; time_from?: string | null; time_to?: string | null }): {
  event_date: string;
  time_from: string | null;
  time_to: string | null;
} {
  if (!ISO_DATE_RE.test(input.event_date)) {
    throw new Error(`event_date must be YYYY-MM-DD, got "${input.event_date}"`);
  }
  const time_from = normalizeTime(input.time_from ?? null);
  const time_to = normalizeTime(input.time_to ?? null);
  if (time_from !== null && time_to !== null) {
    const a = timeToMinutes(time_from)!;
    const b = timeToMinutes(time_to)!;
    if (b < a) {
      throw new Error(`time_to (${time_to}) must be >= time_from (${time_from})`);
    }
  }
  return { event_date: input.event_date, time_from, time_to };
}

/**
 * Statement of Facts journal (TZ §10 / FR-07).
 *
 * Time stored as zero-padded HH:MM text; "24:00" is accepted as
 * end-of-day. Interval overlap detection is intentionally NOT enforced
 * here — TZ §8 rule 4 says overlaps "require a warning", not a block.
 * UI uses `findOverlapping` from src/calc/time.ts on the loaded list.
 */
export class SofService {
  constructor(private readonly db: Db) {}

  async create(input: CreateSofEventInput): Promise<SofEvent> {
    const validated = validate(input);
    const id = crypto.randomUUID();
    await this.db.execute(
      `INSERT INTO sof_events (
         id, voyage_id, event_date, time_from, time_to,
         category, description, daily_qty, total_qty
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.voyage_id,
        validated.event_date,
        validated.time_from,
        validated.time_to,
        input.category ?? null,
        input.description ?? null,
        input.daily_qty ?? null,
        input.total_qty ?? null,
      ],
    );
    return (await this.get(id))!;
  }

  async get(id: string): Promise<SofEvent | null> {
    const rows = await this.db.select<SofEvent>(
      `SELECT * FROM sof_events WHERE id = ?`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Chronologically sorted by (event_date, time_from). Null times sort last. */
  async list(voyage_id: string): Promise<SofEvent[]> {
    return await this.db.select<SofEvent>(
      `SELECT * FROM sof_events
        WHERE voyage_id = ?
        ORDER BY event_date,
                 CASE WHEN time_from IS NULL THEN 1 ELSE 0 END,
                 time_from,
                 CASE WHEN time_to IS NULL THEN 1 ELSE 0 END,
                 time_to`,
      [voyage_id],
    );
  }

  async update(id: string, patch: UpdateSofEventInput): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error(`SOF event ${id} not found`);
    const next = {
      event_date: patch.event_date ?? current.event_date,
      time_from: patch.time_from === undefined ? current.time_from : patch.time_from,
      time_to: patch.time_to === undefined ? current.time_to : patch.time_to,
      category: patch.category === undefined ? current.category : patch.category,
      description: patch.description === undefined ? current.description : patch.description,
      daily_qty: patch.daily_qty === undefined ? current.daily_qty : patch.daily_qty,
      total_qty: patch.total_qty === undefined ? current.total_qty : patch.total_qty,
    };
    const validated = validate(next);
    await this.db.execute(
      `UPDATE sof_events
          SET event_date = ?, time_from = ?, time_to = ?,
              category = ?, description = ?, daily_qty = ?, total_qty = ?
        WHERE id = ?`,
      [
        validated.event_date,
        validated.time_from,
        validated.time_to,
        next.category,
        next.description,
        next.daily_qty,
        next.total_qty,
        id,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM sof_events WHERE id = ?`, [id]);
  }
}
