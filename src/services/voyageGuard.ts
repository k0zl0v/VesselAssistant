import type { Db } from './db';
import { AppError } from './errors';
import { ROLES_CAN_EDIT_CLOSED, SessionService } from './SessionService';
import type { VoyageStatus } from './types';

export interface MutationOptions {
  /** Required to change a closed voyage; the audit triggers store it in `audit_log.reason`. */
  closed_voyage_reason?: string;
}

/**
 * Runs `fn` only if the voyage is open, or closed and the session role may edit it with a reason.
 * The reason is set on `app_session` in autocommit before `fn`, cleared after it whatever the outcome.
 */
export async function withVoyageGuard<T>(
  db: Db,
  voyage_id: string,
  opts: MutationOptions | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const [voyage] = await db.select<{ status: VoyageStatus; voyage_no: string }>(
    `SELECT status, voyage_no FROM voyages WHERE id = ?`,
    [voyage_id],
  );
  if (!voyage) throw new AppError('voyage.not_found', { voyage_id });
  if (voyage.status === 'open') return await fn();

  const session = await new SessionService(db).current();
  if (!session || !ROLES_CAN_EDIT_CLOSED.has(session.operator_role)) {
    throw new AppError('voyage.closed', { voyage_no: voyage.voyage_no });
  }
  const reason = opts?.closed_voyage_reason?.trim();
  if (!reason) throw new AppError('voyage.closed_reason_required');

  await db.execute(`UPDATE app_session SET override_reason = ? WHERE id = 1`, [reason]);
  try {
    return await fn();
  } finally {
    await db.execute(`UPDATE app_session SET override_reason = NULL WHERE id = 1`);
  }
}
