import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CraneCorrectionService } from '../CraneCorrectionService';
import { ReferenceService } from '../ReferenceService';
import { openTestDb } from './helpers';
import type { NodeDb } from '../db-node';

describe('CraneCorrectionService — integration', () => {
  let db: NodeDb;
  let svc: CraneCorrectionService;
  let craneAId: string;
  let craneBId: string;

  beforeEach(async () => {
    db = await openTestDb();
    const ref = new ReferenceService(db);
    const a = await ref.createCrane({ name: 'CRANE # 1' });
    const b = await ref.createCrane({ name: 'CRANE # 2' });
    craneAId = a.id;
    craneBId = b.id;
    svc = new CraneCorrectionService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('AT-03: corrected_weight = scale_weight / coefficient, rounded to 3 decimals', async () => {
    await svc.create({
      crane_id: craneAId,
      operation_type: 'loading',
      valid_from: '2026-01-01',
      coefficient: 0.95,
    });

    const result = await svc.correctWeight(100, {
      crane_id: craneAId,
      operation_type: 'loading',
      date: '2026-05-01',
    });

    expect(result.coefficient).toBe(0.95);
    expect(result.corrected_weight).toBeCloseTo(105.263, 3);
  });

  it('rejects creating a coefficient with zero or negative value', async () => {
    await expect(
      svc.create({
        crane_id: craneAId,
        operation_type: 'loading',
        valid_from: '2026-01-01',
        coefficient: 0,
      }),
    ).rejects.toThrow(/coefficient must be > 0/);
  });

  it('rejects malformed valid_from / valid_to and inverted ranges', async () => {
    await expect(
      svc.create({
        crane_id: craneAId,
        operation_type: 'loading',
        valid_from: '01.01.2026',
        coefficient: 0.95,
      }),
    ).rejects.toThrow(/valid_from must be YYYY-MM-DD/);

    await expect(
      svc.create({
        crane_id: craneAId,
        operation_type: 'loading',
        valid_from: '2026-06-01',
        valid_to: '2026-05-01',
        coefficient: 0.95,
      }),
    ).rejects.toThrow(/valid_to.*must be >= valid_from/);
  });

  it('TZ §8 rule 6: throws when no coefficient is active for the date', async () => {
    await svc.create({
      crane_id: craneAId,
      operation_type: 'loading',
      valid_from: '2026-01-01',
      valid_to: '2026-04-30',
      coefficient: 0.95,
    });

    await expect(
      svc.correctWeight(100, {
        crane_id: craneAId,
        operation_type: 'loading',
        date: '2026-05-01',
      }),
    ).rejects.toThrow(/No active crane coefficient/);
  });

  it('throws when operation_type does not match', async () => {
    await svc.create({
      crane_id: craneAId,
      operation_type: 'loading',
      valid_from: '2026-01-01',
      coefficient: 0.95,
    });

    await expect(
      svc.findCoefficient({
        crane_id: craneAId,
        operation_type: 'discharging',
        date: '2026-05-01',
      }),
    ).rejects.toThrow(/No active crane coefficient/);
  });

  it('side stored as NULL acts as wildcard; specific side overrides', async () => {
    await svc.create({
      crane_id: craneAId,
      operation_type: 'loading',
      side: null,
      valid_from: '2026-01-01',
      coefficient: 0.95,
    });
    await svc.create({
      crane_id: craneAId,
      operation_type: 'loading',
      side: 'PORT',
      valid_from: '2026-01-01',
      coefficient: 0.97,
    });

    const portMatch = await svc.findCoefficient({
      crane_id: craneAId,
      operation_type: 'loading',
      side: 'PORT',
      date: '2026-05-01',
    });
    // Specific PORT row wins over the wildcard.
    expect(portMatch.coefficient).toBe(0.97);

    const stbdMatch = await svc.findCoefficient({
      crane_id: craneAId,
      operation_type: 'loading',
      side: 'STARBOARD',
      date: '2026-05-01',
    });
    // Wildcard applies because no STARBOARD-specific row exists.
    expect(stbdMatch.coefficient).toBe(0.95);
  });

  it('most recent valid_from wins among matching rows', async () => {
    await svc.create({
      crane_id: craneAId, operation_type: 'loading',
      valid_from: '2026-01-01', valid_to: '2026-12-31', coefficient: 0.90,
    });
    await svc.create({
      crane_id: craneAId, operation_type: 'loading',
      valid_from: '2026-04-01', valid_to: '2026-12-31', coefficient: 0.95,
    });

    const result = await svc.findCoefficient({
      crane_id: craneAId, operation_type: 'loading', date: '2026-05-01',
    });
    expect(result.coefficient).toBe(0.95);
  });

  it('list filters by crane_id and operation_type', async () => {
    await svc.create({
      crane_id: craneAId, operation_type: 'loading',
      valid_from: '2026-01-01', coefficient: 0.95,
    });
    await svc.create({
      crane_id: craneAId, operation_type: 'discharging',
      valid_from: '2026-01-01', coefficient: 0.97,
    });
    await svc.create({
      crane_id: craneBId, operation_type: 'loading',
      valid_from: '2026-01-01', coefficient: 0.93,
    });

    const allCraneA = await svc.list({ crane_id: craneAId });
    expect(allCraneA).toHaveLength(2);

    const aLoading = await svc.list({ crane_id: craneAId, operation_type: 'loading' });
    expect(aLoading).toHaveLength(1);
    expect(aLoading[0]!.coefficient).toBe(0.95);

    const all = await svc.list();
    expect(all).toHaveLength(3);
  });

  it('rejects scale_weight <= 0', async () => {
    await svc.create({
      crane_id: craneAId, operation_type: 'loading',
      valid_from: '2026-01-01', coefficient: 0.95,
    });

    await expect(
      svc.correctWeight(0, {
        crane_id: craneAId, operation_type: 'loading', date: '2026-05-01',
      }),
    ).rejects.toThrow(/scale_weight must be > 0/);
  });
});
