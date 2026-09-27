import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import { SessionService } from '../SessionService';
import { SofService } from '../SofService';
import { VoyageService } from '../VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from './helpers';
import type { NodeDb } from '../db-node';

describe('SofService — integration', () => {
  let db: NodeDb;
  let sof: SofService;
  let voyageId: string;

  beforeEach(async () => {
    db = await openTestDb();
    const seed = await seedReferenceData(db, {
      vesselName: 'KAVKAZ IV',
      holdNos: [],
    });
    const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({
      vessel_id: seed.vesselId,
      voyage_no: 'V-SOF',
    });
    voyageId = voyage.id;
    sof = new SofService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates and reads back an event with normalized HH:MM time', async () => {
    const ev = await sof.create({
      voyage_id: voyageId,
      event_date: '2026-05-01',
      time_from: '9:30',
      time_to: '12:00',
      category: 'loading_commenced',
      description: 'Loading commenced at hatch 1',
    });

    expect(ev.time_from).toBe('09:30');
    expect(ev.time_to).toBe('12:00');
    expect(ev.category).toBe('loading_commenced');
  });

  it('AT-04: accepts 24:00 as end-of-day and continues next day', async () => {
    await sof.create({
      voyage_id: voyageId,
      event_date: '2026-05-01',
      time_from: '22:00',
      time_to: '24:00',
      description: 'Loading until midnight',
    });
    await sof.create({
      voyage_id: voyageId,
      event_date: '2026-05-02',
      time_from: '00:00',
      time_to: '04:00',
      description: 'Loading resumed',
    });

    const list = await sof.list(voyageId);
    expect(list).toHaveLength(2);
    expect(list[0]!.time_to).toBe('24:00');
    expect(list[1]!.event_date).toBe('2026-05-02');
  });

  it('rejects 24:30 (24:xx is end-of-day only)', async () => {
    await expect(
      sof.create({
        voyage_id: voyageId,
        event_date: '2026-05-01',
        time_from: '23:00',
        time_to: '24:30',
      }),
    ).rejects.toThrow(/24:xx/);
  });

  it('rejects time_to before time_from', async () => {
    await expect(
      sof.create({
        voyage_id: voyageId,
        event_date: '2026-05-01',
        time_from: '12:00',
        time_to: '08:00',
      }),
    ).rejects.toThrow(/time_to/);
  });

  it('rejects malformed event_date', async () => {
    await expect(
      sof.create({
        voyage_id: voyageId,
        event_date: '01.05.2026',
      }),
    ).rejects.toThrow(/event_date must be YYYY-MM-DD/);
  });

  it('list returns events sorted chronologically', async () => {
    await sof.create({
      voyage_id: voyageId, event_date: '2026-05-02', time_from: '08:00', time_to: '10:00',
    });
    await sof.create({
      voyage_id: voyageId, event_date: '2026-05-01', time_from: '14:00', time_to: '16:00',
    });
    await sof.create({
      voyage_id: voyageId, event_date: '2026-05-01', time_from: '08:00', time_to: '10:00',
    });

    const list = await sof.list(voyageId);
    expect(list.map((e) => `${e.event_date} ${e.time_from}`)).toEqual([
      '2026-05-01 08:00',
      '2026-05-01 14:00',
      '2026-05-02 08:00',
    ]);
  });

  it('events without time_from sort last for that date', async () => {
    await sof.create({
      voyage_id: voyageId, event_date: '2026-05-01',
    });
    await sof.create({
      voyage_id: voyageId, event_date: '2026-05-01', time_from: '08:00', time_to: '10:00',
    });

    const list = await sof.list(voyageId);
    expect(list[0]!.time_from).toBe('08:00');
    expect(list[1]!.time_from).toBeNull();
  });

  it('update only the fields provided in the patch', async () => {
    const ev = await sof.create({
      voyage_id: voyageId,
      event_date: '2026-05-01',
      time_from: '08:00',
      time_to: '10:00',
      description: 'original',
    });
    await sof.update(ev.id, { description: 'updated' });

    const after = await sof.get(ev.id);
    expect(after!.description).toBe('updated');
    expect(after!.time_from).toBe('08:00');
    expect(after!.event_date).toBe('2026-05-01');
  });

  it('delete removes the event', async () => {
    const ev = await sof.create({
      voyage_id: voyageId, event_date: '2026-05-01',
    });
    await sof.delete(ev.id);
    const list = await sof.list(voyageId);
    expect(list).toHaveLength(0);
  });

  describe('S-14: correcting a closed voyage', () => {
    let lateEventId: string;

    beforeEach(async () => {
      await sof.create({
        voyage_id: voyageId, event_date: '2026-05-01', time_from: '22:00', time_to: '24:00',
      });
      lateEventId = (
        await sof.create({ voyage_id: voyageId, event_date: '2026-05-02', time_from: '00:00', time_to: '04:00' })
      ).id;
      await new VoyageService(db, NOOP_AUTO_BACKUP).close(voyageId);
    });

    it('supervisor with a reason changes time_to; audit keeps old/new/user/role/reason', async () => {
      await new SessionService(db).start({ operator_name: 'Olga Supervisor', operator_role: 'supervisor' });

      await sof.update(lateEventId, { time_to: '03:30' }, { closed_voyage_reason: 'clock drift on the log' });

      expect((await sof.get(lateEventId))!.time_to).toBe('03:30');
      const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).get(voyageId);
      expect(voyage!.status).toBe('closed');
      const [entry] = await db.select<{
        old_value: string; new_value: string; user_id: string; user_role: string; reason: string;
      }>(
        `SELECT old_value, new_value, user_id, user_role, reason FROM audit_log
          WHERE entity_type = 'sof_events' AND entity_id = ? AND action = 'update'`,
        [lateEventId],
      );
      expect(JSON.parse(entry!.old_value!).time_to).toBe('04:00');
      expect(JSON.parse(entry!.new_value!).time_to).toBe('03:30');
      expect(entry).toMatchObject({
        user_id: 'Olga Supervisor',
        user_role: 'supervisor',
        reason: 'clock drift on the log',
      });
    });

    it('supervisor without a reason → voyage.closed_reason_required, event keeps 04:00', async () => {
      await new SessionService(db).start({ operator_name: 'Olga Supervisor', operator_role: 'supervisor' });

      await expect(sof.update(lateEventId, { time_to: '03:30' })).rejects.toMatchObject({
        code: 'voyage.closed_reason_required',
      });
      expect((await sof.get(lateEventId))!.time_to).toBe('04:00');
    });

    it('operator, even with a reason → voyage.closed, event keeps 04:00', async () => {
      const e = await sof
        .update(lateEventId, { time_to: '03:30' }, { closed_voyage_reason: 'clock drift on the log' })
        .then(() => new Error('promise resolved instead of rejecting'), (err: unknown) => err);
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('voyage.closed');
      expect((await sof.get(lateEventId))!.time_to).toBe('04:00');
    });
  });
});
