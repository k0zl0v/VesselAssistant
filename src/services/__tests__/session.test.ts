import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROLES_CAN_EDIT_CLOSED, SessionService, type OperatorRole } from '../SessionService';
import type { NodeDb } from '../db-node';
import { AppError, isAppError } from '../errors';
import { openTestDb } from './helpers';

describe('SessionService', () => {
  let db: NodeDb;
  let sessions: SessionService;

  beforeEach(async () => {
    db = await openTestDb({ session: null });
    sessions = new SessionService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('current() is null before any start()', async () => {
    expect(await sessions.current()).toBeNull();
  });

  it('start() → current() round-trips operator name and role', async () => {
    const started = await sessions.start({ operator_name: 'Ivan Petrov', operator_role: 'supervisor' });
    expect(started).toMatchObject({ operator_name: 'Ivan Petrov', operator_role: 'supervisor' });
    expect(started.started_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(await sessions.current()).toEqual(started);
  });

  it('a repeated start() replaces the single row and clears override_reason', async () => {
    await sessions.start({ operator_name: 'Ivan Petrov', operator_role: 'supervisor' });
    await db.execute(`UPDATE app_session SET override_reason = 'late SOF fix' WHERE id = 1`);

    await sessions.start({ operator_name: 'Anna Sidorova', operator_role: 'operator' });

    expect(await db.select(`SELECT id, operator_name, operator_role, override_reason FROM app_session`)).toEqual([
      { id: 1, operator_name: 'Anna Sidorova', operator_role: 'operator', override_reason: null },
    ]);
  });

  it('rejects a role outside the allowed set', async () => {
    await expect(
      sessions.start({ operator_name: 'Ivan Petrov', operator_role: 'root' as OperatorRole }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('rejects an empty or blank operator name', async () => {
    await expect(sessions.start({ operator_name: '   ', operator_role: 'operator' })).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it('only supervisor and admin may edit a closed voyage', () => {
    expect([...ROLES_CAN_EDIT_CLOSED].sort()).toEqual(['admin', 'supervisor']);
  });
});

describe('isAppError', () => {
  it('recognises AppError and nothing else', () => {
    const e = new AppError('voyage.closed', { voyage_no: 'V-1' });
    expect(isAppError(e)).toBe(true);
    expect(e.code).toBe('voyage.closed');
    expect(e.params).toEqual({ voyage_no: 'V-1' });
    expect(e.message).toBe('voyage.closed {"voyage_no":"V-1"}');
    expect(isAppError(new Error('voyage.closed'))).toBe(false);
    expect(isAppError({ code: 'voyage.closed', params: {} })).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});
