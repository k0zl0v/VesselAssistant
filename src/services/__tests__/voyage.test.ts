import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VoyageService } from '../VoyageService';
import { openTestDb, seedReferenceData } from './helpers';
import type { NodeDb } from '../db-node';

describe('VoyageService — integration', () => {
  let db: NodeDb;
  let svc: VoyageService;
  let vesselId: string;

  beforeEach(async () => {
    db = await openTestDb();
    svc = new VoyageService(db);
    const seed = await seedReferenceData(db, {
      vesselName: 'NORD STAR',
      holdNos: [],
    });
    vesselId = seed.vesselId;
  });

  afterEach(() => {
    db.close();
  });

  it('creates a voyage and reads it back', async () => {
    const voyage = await svc.create({
      vessel_id: vesselId,
      voyage_no: 'V-001',
    });

    expect(voyage.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(voyage.vessel_id).toBe(vesselId);
    expect(voyage.voyage_no).toBe('V-001');
    expect(voyage.status).toBe('open');

    const fetched = await svc.get(voyage.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.voyage_no).toBe('V-001');
  });

  it('lists voyages for a vessel in voyage_no DESC order', async () => {
    await svc.create({ vessel_id: vesselId, voyage_no: 'V-001' });
    await svc.create({ vessel_id: vesselId, voyage_no: 'V-002' });
    await svc.create({ vessel_id: vesselId, voyage_no: 'V-003' });

    const list = await svc.listByVessel(vesselId);
    expect(list).toHaveLength(3);
    expect(list.map((v) => v.voyage_no)).toEqual(['V-003', 'V-002', 'V-001']);
  });

  it('closes an open voyage and rejects duplicate close attempts as no-op', async () => {
    const voyage = await svc.create({
      vessel_id: vesselId,
      voyage_no: 'V-100',
    });

    await svc.close(voyage.id);
    expect((await svc.get(voyage.id))!.status).toBe('closed');

    // closing twice does not raise — the second call is a no-op (idempotent).
    await svc.close(voyage.id);
    expect((await svc.get(voyage.id))!.status).toBe('closed');
  });

  it('rejects duplicate (vessel_id, voyage_no) by FK/UNIQUE', async () => {
    await svc.create({ vessel_id: vesselId, voyage_no: 'V-DUP' });
    await expect(
      svc.create({ vessel_id: vesselId, voyage_no: 'V-DUP' }),
    ).rejects.toThrow(/UNIQUE/);
  });
});
