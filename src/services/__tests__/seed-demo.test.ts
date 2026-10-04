import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KAVKAZ_IV_HOLDS, KAVKAZ_IV_TOTALS } from '../../fixtures/kavkaz-iv';
import { DEMO_LOTS, DEMO_SOF } from '../../fixtures/kavkaz-iv-demo';
import { seedKavkazDemo } from '../../seedDemo';
import { CalculationService } from '../CalculationService';
import { CraneShiftService } from '../CraneShiftService';
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

  it('crane shift reproduces «CRANE CORR.»: 1177 → 1110.377, 824 → 858.333, shift 8 835.000 → 8 405.971', async () => {
    const cranes = await db.select<{ id: string; name: string }>(`SELECT id, name FROM cranes ORDER BY name`);
    const svc = new CraneShiftService(db);
    const r1 = await svc.correct(1177, cranes[0]!.id, 'from_own', '2026-05-01');
    const r2 = await svc.correct(824, cranes[1]!.id, 'from_own', '2026-05-01');
    expect(r1.corrected_tons).toBeCloseTo(1110.377, 3);
    expect(r2.corrected_tons).toBeCloseTo(858.333, 3);
    const [shift] = await db.select<{ scale: number; corrected: number; linked: number }>(
      `SELECT SUM(scale_tons) AS scale, SUM(corrected_tons) AS corrected, COUNT(operation_id) AS linked
         FROM crane_shift_records WHERE voyage_id = ?`,
      [voyageId],
    );
    expect(shift!.scale).toBeCloseTo(8835, 9);
    expect(shift!.corrected).toBeCloseTo(8405.971, 3);
    expect(shift!.linked).toBe(2);
    const [excluded] = await db.select<{ vessel_name: string; coefficient: number }>(
      `SELECT vessel_name, coefficient FROM crane_measurements WHERE excluded = 1`,
    );
    expect(excluded).toEqual({ vessel_name: 'IVAN VIKULOV', coefficient: 1.39 });
  });

  it('OGV AAI PRELUDE: barge 56 753.045 + KAVKAZ IV 2 001.000 = 58 754.045 of the 69 000.000 plan', async () => {
    const [ogv] = await db.select<{ id: string; name: string }>(`SELECT id, name FROM ogv_vessels WHERE voyage_id = ?`, [voyageId]);
    expect(ogv?.name).toBe('AAI PRELUDE');
    const sum = async (sql: string) => (await db.select<{ t: number }>(sql, [ogv!.id]))[0]!.t;
    expect(await sum(`SELECT SUM(planned_tons) AS t FROM ogv_holds WHERE ogv_id = ?`)).toBeCloseTo(69000, 9);
    expect(await sum(`SELECT SUM(tons) AS t FROM ogv_receipts WHERE ogv_id = ? AND source_kind = 'barge'`)).toBeCloseTo(56753.045, 9);
    expect(await sum(`SELECT SUM(tons) AS t FROM ogv_receipts WHERE ogv_id = ? AND source_kind = 'main_hold'`)).toBeCloseTo(2001, 9);
    const [hold5] = await db.select<{ t: number }>(
      `SELECT SUM(r.tons) AS t FROM ogv_receipts r JOIN ogv_holds h ON h.id = r.ogv_hold_id WHERE h.ogv_id = ? AND h.hold_no = 5`,
      [ogv!.id],
    );
    expect(hold5!.t).toBeCloseTo(7762.661, 9);
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
    for (const table of ['vessels', 'cargo_lots', 'sof_events', 'cranes', 'crane_measurements', 'ogv_vessels', 'crane_shift_records']) {
      const before = (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]!.n;
      await seedKavkazDemo(db);
      expect((await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]!.n, table).toBe(before);
    }
  });
});
