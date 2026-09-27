import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
