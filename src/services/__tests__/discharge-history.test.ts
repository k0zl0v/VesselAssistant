import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedKavkazDemo } from '../../seedDemo';
import { listDischargeHistory, listLayers } from '../DischargeHistory';
import type { NodeDb } from '../db-node';
import { loadVoyageOverview } from '../VoyageOverview';
import { openTestDb } from './helpers';

describe('read models for the layers / OGV / Load Plan screens (Appendix C demo voyage)', () => {
  let db: NodeDb;
  let voyageId: string;

  beforeEach(async () => {
    db = await openTestDb();
    voyageId = (await seedKavkazDemo(db)).voyage_id;
  });

  afterEach(() => {
    db.close();
  });

  it('listLayers orders each hold top of stack first and sums to On Board', async () => {
    const layers = await listLayers(db, voyageId);
    const remain = layers.reduce((s, l) => s + l.remaining_tons, 0);
    expect(Math.round(remain * 1000) / 1000).toBe(23683.955);
    for (let i = 1; i < layers.length; i++) {
      const [a, b] = [layers[i - 1]!, layers[i]!];
      if (a.hold_no === b.hold_no) expect(a.load_sequence).toBeGreaterThan(b.load_sequence);
    }
    expect(layers.every((l) => l.cargo_name === 'SFM' || l.cargo_name === 'WHEAT')).toBe(true);
  });

  it('listDischargeHistory returns the two demo discharges with their allocations', async () => {
    const ops = await listDischargeHistory(db, voyageId);
    expect(ops.map((o) => [o.hold_no, o.tons]).sort()).toEqual([[3, 1177], [5, 824]]);
    for (const op of ops) {
      expect(op.allocations.reduce((s, a) => s + a.discharged_tons, 0)).toBeCloseTo(op.tons, 9);
    }
  });

  it('loadVoyageOverview counts lots, sources and discharged holds', async () => {
    const o = await loadVoyageOverview(db, voyageId);
    expect(o.cargo_names.sort()).toEqual(['SFM', 'WHEAT']);
    expect(o.discharged_hold_nos).toEqual([3, 5]);
    expect(o.discharge_operation_count).toBe(2);
    expect(o.lot_count).toBe(Object.values(o.holds).reduce((s, h) => s + h.lot_count, 0));
  });
});
