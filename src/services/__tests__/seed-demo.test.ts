import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KAVKAZ_IV_HOLDS, KAVKAZ_IV_TOTALS } from '../../fixtures/kavkaz-iv';
import { DEMO_LOTS, DEMO_SOF } from '../../fixtures/kavkaz-iv-demo';
import { seedKavkazDemo } from '../../seedDemo';
import { CalculationService } from '../CalculationService';
import { CraneCorrectionService } from '../CraneCorrectionService';
import type { NodeDb } from '../db-node';
import { listLayers } from '../DischargeHistory';
import { openTestDb } from './helpers';

describe('seedKavkazDemo — demo voyage from the real working file', () => {
  let db: NodeDb;
  let voyageId: string;

  beforeEach(async () => {
    db = await openTestDb();
    voyageId = (await seedKavkazDemo(db)).voyage_id;
  });

  afterEach(() => {
    db.close();
  });

  it('per-lot data adds up to the Appendix C hold totals and voyage totals', async () => {
    for (const h of KAVKAZ_IV_HOLDS) {
      const sum = DEMO_LOTS.filter((l) => l.hold_no === h.hold_no).reduce((s, l) => s + l.loaded_tons, 0);
      expect(sum, `hold ${h.hold_no}`).toBeCloseTo(h.loaded_tons, 9);
    }
    const { totals } = await new CalculationService(db).calculate(voyageId);
    expect(totals.on_board).toBeCloseTo(KAVKAZ_IV_TOTALS.on_board, 3);
    expect(totals.total_discharged).toBeCloseTo(KAVKAZ_IV_TOTALS.total_discharged, 3);
    expect(totals.total_empty_98).toBeCloseTo(KAVKAZ_IV_TOTALS.total_empty_98, 3);
  });

  it('the 01.05 discharges write off the top VLADIMIR layers of holds 3 and 5 (LIFO)', async () => {
    const layers = await listLayers(db, voyageId);
    const top = (holdNo: number) => layers.find((l) => l.hold_no === holdNo)!;
    expect(top(3)).toMatchObject({ source_vessel: 'VLADIMIR', loaded_tons: 1712 });
    expect(top(3).remaining_tons).toBeCloseTo(535, 9);
    expect(top(5)).toMatchObject({ source_vessel: 'VLADIMIR', loaded_tons: 1725.415 });
    expect(top(5).remaining_tons).toBeCloseTo(901.415, 9);
    expect(layers.filter((l) => l.hold_no !== 3 && l.hold_no !== 5).every((l) => l.remaining_tons === l.loaded_tons)).toBe(true);
    expect(new Set(layers.map((l) => l.source_vessel))).toEqual(new Set(['VLADIMIR', 'ALISA V', 'YEKATERINA']));
  });

  it('crane correction of the 01.05 scale weights matches «CRANE CORR.» D3/D4', async () => {
    const cranes = await db.select<{ id: string; name: string }>(`SELECT id, name FROM cranes ORDER BY name`);
    const svc = new CraneCorrectionService(db);
    const [c1, c2] = cranes;
    const r1 = await svc.correctWeight(1177, { crane_id: c1!.id, operation_type: 'discharging', date: '2026-05-01' });
    const r2 = await svc.correctWeight(824, { crane_id: c2!.id, operation_type: 'discharging', date: '2026-05-01' });
    expect(r1.corrected_weight).toBeCloseTo(1110.377, 3);
    expect(r2.corrected_weight).toBeCloseTo(858.333, 3);
  });

  it('stores every SOF line and the voyage loading port; a second call seeds nothing twice', async () => {
    const [{ n }] = (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM sof_events WHERE voyage_id = ?`, [voyageId])) as [{ n: number }];
    expect(n).toBe(DEMO_SOF.length);
    const [port] = await db.select<{ name: string }>(
      `SELECT p.name FROM voyages v JOIN ports p ON p.id = v.loading_port_id WHERE v.id = ?`,
      [voyageId],
    );
    expect(port?.name).toBe('KAVKAZ');

    const again = await seedKavkazDemo(db);
    expect(again).toMatchObject({ voyage_id: voyageId, created: false });
    for (const table of ['vessels', 'cargo_lots', 'sof_events', 'cranes', 'crane_coefficients']) {
      const before = (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]!.n;
      await seedKavkazDemo(db);
      expect((await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]!.n, table).toBe(before);
    }
  });
});
