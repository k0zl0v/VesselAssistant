import type { Db } from './db';

export type OperatorRole = 'operator' | 'supervisor' | 'admin' | 'viewer';

export interface OperatorSession {
  operator_name: string;
  operator_role: OperatorRole;
  started_at: string;
}

export const ROLES_CAN_EDIT_CLOSED: ReadonlySet<OperatorRole> = new Set(['supervisor', 'admin']);

/**
 * Who is at the console (FR-10). The single `app_session` row is read by the
 * audit triggers from migration 0003, so every mutation is stamped with it.
 */
export class SessionService {
  constructor(private readonly db: Db) {}

  /** Replaces the session row; a stale `override_reason` from an interrupted guard is dropped. */
  async start(input: { operator_name: string; operator_role: OperatorRole }): Promise<OperatorSession> {
    await this.db.execute(
      `INSERT OR REPLACE INTO app_session (id, operator_name, operator_role, override_reason, started_at)
       VALUES (1, ?, ?, NULL, datetime('now'))`,
      [input.operator_name, input.operator_role],
    );
    return (await this.current())!;
  }

  async current(): Promise<OperatorSession | null> {
    const rows = await this.db.select<OperatorSession>(
      `SELECT operator_name, operator_role, started_at FROM app_session WHERE id = 1`,
    );
    return rows[0] ?? null;
  }
}
