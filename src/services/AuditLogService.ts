import type { Db, SqlValue } from './db';

export interface AuditEntry {
  id: number;
  entity_type: string;
  entity_id: string;
  action: 'insert' | 'update' | 'delete';
  /** JSON text — leave parsing to caller. */
  old_value: string | null;
  new_value: string | null;
  /** Operator name from `app_session` at write time. */
  user_id: string | null;
  user_role: string | null;
  /** Set only for a correction of a closed voyage. */
  reason: string | null;
  created_at: string;
}

export interface AuditFilter {
  entity_type?: string;
  entity_id?: string;
  /** Inclusive ISO YYYY-MM-DD lower bound on created_at. */
  since?: string;
  /** Cap on rows returned. Default 200. */
  limit?: number;
}

/**
 * Read-only access to the audit_log table (TZ §8 / FR-10).
 *
 * Writes are produced exclusively by SQLite triggers (see
 * `0002_audit_triggers.sql`; `0003` stamps them with `app_session`) so every
 * mutation source — services, raw SQL, future imports — is captured
 * uniformly. This service only reads.
 */
export class AuditLogService {
  constructor(private readonly db: Db) {}

  async list(filter: AuditFilter = {}): Promise<AuditEntry[]> {
    const where: string[] = [];
    const params: SqlValue[] = [];

    if (filter.entity_type) {
      where.push('entity_type = ?');
      params.push(filter.entity_type);
    }
    if (filter.entity_id) {
      where.push('entity_id = ?');
      params.push(filter.entity_id);
    }
    if (filter.since) {
      where.push('created_at >= ?');
      params.push(filter.since);
    }

    const limit = filter.limit ?? 200;
    const sql =
      `SELECT id, entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason, created_at
         FROM audit_log` +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ` ORDER BY created_at DESC, id DESC
         LIMIT ?`;
    params.push(limit);

    return await this.db.select<AuditEntry>(sql, params);
  }

  /** Distinct entity_type values currently present in the log. */
  async listEntityTypes(): Promise<string[]> {
    const rows = await this.db.select<{ entity_type: string }>(
      `SELECT DISTINCT entity_type FROM audit_log ORDER BY entity_type`,
    );
    return rows.map((r) => r.entity_type);
  }
}
