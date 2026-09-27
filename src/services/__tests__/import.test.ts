import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalculationService } from '../CalculationService';
import { isAppError } from '../errors';
import { ImportService } from '../ImportService';
import {
  KAVKAZ_IV_HOLDS,
  KAVKAZ_IV_TOTALS,
  KAVKAZ_IV_VESSEL_NAME,
} from '../../fixtures/kavkaz-iv';
import { NOOP_AUTO_BACKUP, openTestDb } from './helpers';
import type { NodeDb } from '../db-node';

/** Committed fixture (`npm run fixtures:import`). A missing file fails the tests, never skips them. */
const SOURCE_FILE = fileURLToPath(
  new URL('./fixtures/import/appendix-c-load-plan.xlsx', import.meta.url),
);
const TOLERANCE = 0.001;

function readFixture(): Uint8Array {
  const buf = readFileSync(SOURCE_FILE);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

describe('ImportService — Appendix C load plan xlsx', () => {
  let db: NodeDb | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('parseLoadPlan extracts vessel + 5 holds with values from the fixture', async () => {
    db = await openTestDb();
    const importer = new ImportService(db, NOOP_AUTO_BACKUP);
    const parsed = await importer.parseLoadPlan(readFixture());

    expect(parsed.vessel_name).toBe(KAVKAZ_IV_VESSEL_NAME);
    expect(parsed.holds).toHaveLength(KAVKAZ_IV_HOLDS.length);

    for (const expected of KAVKAZ_IV_HOLDS) {
      const got = parsed.holds.find((h) => h.hold_no === expected.hold_no);
      expect(got, `hold #${expected.hold_no} present`).toBeDefined();
      expect(got!.volume_m3).toBeCloseTo(expected.volume_m3, 3);
      expect(got!.sf).toBeCloseTo(expected.sf, 3);
      expect(got!.loaded_tons).toBeCloseTo(expected.loaded_tons, 3);
      expect(got!.discharged_tons).toBeCloseTo(expected.discharged_tons, 3);
      expect(got!.cargo_name).toBe(expected.cargo);
    }
  });

  it('applyImport persists data so CalculationService matches KAVKAZ_IV_TOTALS', async () => {
    db = await openTestDb();
    const importer = new ImportService(db, NOOP_AUTO_BACKUP);
    const calc = new CalculationService(db);

    const parsed = await importer.parseLoadPlan(readFixture());
    const { voyage_id } = await importer.applyImport(parsed);

    const result = await calc.calculate(voyage_id);

    expect(result.totals.on_board).toBeCloseTo(KAVKAZ_IV_TOTALS.on_board, 3);
    expect(result.totals.total_loaded).toBeCloseTo(
      KAVKAZ_IV_TOTALS.total_loaded,
      3,
    );
    expect(result.totals.total_discharged).toBeCloseTo(
      KAVKAZ_IV_TOTALS.total_discharged,
      3,
    );
    expect(result.totals.total_empty_98).toBeCloseTo(
      KAVKAZ_IV_TOTALS.total_empty_98,
      3,
    );
    expect(result.totals.total_empty_100).toBeCloseTo(
      KAVKAZ_IV_TOTALS.total_empty_100,
      3,
    );

    // Also verify per-hold remain matches fixture (within tolerance).
    for (const expected of KAVKAZ_IV_HOLDS) {
      const got = result.holds.find((h) => h.hold_no === expected.hold_no);
      expect(got, `hold #${expected.hold_no} in calc result`).toBeDefined();
      expect(Math.abs(got!.remain_tons - expected.expected.remain_tons))
        .toBeLessThan(TOLERANCE);
    }

    // S-12: the discharge operations the import produced (from the bottom-of-sheet
    // aggregate cells) actually exist in `operations`, with the file's tonnage —
    // not just reconstructable after the fact from CalculationService totals.
    expect(
      await db.select<{ tons: number }>(
        `SELECT o.tons FROM operations o JOIN holds h ON h.id = o.source_hold
          WHERE o.voyage_id = ? ORDER BY h.hold_no`,
        [voyage_id],
      ),
    ).toEqual([{ tons: 1177 }, { tons: 824 }]);
  });

  describe('auto-backup before applyImport (FR-14)', () => {
    it('applyImport snapshots import_excel before writing anything', async () => {
      db = await openTestDb();
      const target = db;
      const voyagesAtSnapshot: number[] = [];
      const hook = {
        snapshot: vi.fn(async () => {
          voyagesAtSnapshot.push((await target.select<{ n: number }>('SELECT count(*) AS n FROM voyages'))[0]!.n);
        }),
      };
      const importer = new ImportService(db, hook);

      await importer.applyImport(await importer.parseLoadPlan(readFixture()));

      expect(hook.snapshot).toHaveBeenCalledTimes(1);
      expect(hook.snapshot).toHaveBeenCalledWith('import_excel');
      expect(voyagesAtSnapshot).toEqual([0]);
    });

    it('a throwing hook rejects applyImport and writes no rows', async () => {
      db = await openTestDb();
      const hook = { snapshot: vi.fn(async () => Promise.reject(new Error('disk full'))) };
      const importer = new ImportService(db, hook);
      const parsed = await importer.parseLoadPlan(readFixture());

      await expect(importer.applyImport(parsed)).rejects.toThrow('disk full');
      expect(await db.select('SELECT count(*) AS n FROM cargo_lots')).toEqual([{ n: 0 }]);
      expect(await db.select('SELECT count(*) AS n FROM voyages')).toEqual([{ n: 0 }]);
    });
  });

  describe('protein in the import (FR-19, S-12)', () => {
    /** The committed fixture with protein written into column N of the given holds' top-table rows. */
    async function fixtureWithProtein(proteinByHold: Record<number, number>): Promise<{ bytes: Uint8Array; cellByHold: Record<number, string> }> {
      const wb = new ExcelJS.Workbook();
      const src = readFixture();
      await wb.xlsx.load(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer);
      const ws = wb.getWorksheet(KAVKAZ_IV_VESSEL_NAME)!;
      const cellByHold: Record<number, string> = {};
      for (let row = 4; row <= 8; row++) {
        const holdNo = ws.getCell(`P${row}`).value as number;
        if (proteinByHold[holdNo] === undefined) continue;
        ws.getCell(`N${row}`).value = proteinByHold[holdNo]!;
        cellByHold[holdNo] = `N${row}`;
      }
      return { bytes: new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer), cellByHold };
    }

    async function lotsByHold(target: NodeDb, voyageId: string): Promise<Map<number, number | null>> {
      const rows = await target.select<{ hold_no: number; protein_percent: number | null }>(
        `SELECT h.hold_no, l.protein_percent FROM cargo_lots l JOIN holds h ON h.id = l.hold_id WHERE l.voyage_id = ?`,
        [voyageId],
      );
      return new Map(rows.map((r) => [r.hold_no, r.protein_percent]));
    }

    it('rejects only the row with protein 14.0 and names sheet, cell and reason', async () => {
      db = await openTestDb();
      const importer = new ImportService(db, NOOP_AUTO_BACKUP);
      const { bytes, cellByHold } = await fixtureWithProtein({ 1: 12.5, 3: 14.0 });

      const result = await importer.applyImport(await importer.parseLoadPlan(bytes));

      expect(result.rejected).toHaveLength(1);
      const [row] = result.rejected;
      expect([row!.sheet, row!.cell, row!.hold_no]).toEqual([KAVKAZ_IV_VESSEL_NAME, cellByHold[3], 3]);
      expect(isAppError(row!.error) && [row!.error.code, row!.error.params]).toEqual(['protein.invalid', { value: 14 }]);

      const lots = await lotsByHold(db, result.voyage_id);
      expect([...lots.keys()].sort()).toEqual(KAVKAZ_IV_HOLDS.map((h) => h.hold_no).filter((n) => n !== 3).sort());
      expect(lots.get(1)).toBe(12.5);
      const hold3Ops = await db.select(
        `SELECT o.id FROM operations o JOIN holds h ON h.id = o.source_hold WHERE o.voyage_id = ? AND h.hold_no = 3`,
        [result.voyage_id],
      );
      expect(hold3Ops).toEqual([]);
    });

    it('the unmodified fixture imports with no rejected rows', async () => {
      db = await openTestDb();
      const importer = new ImportService(db, NOOP_AUTO_BACKUP);
      const result = await importer.applyImport(await importer.parseLoadPlan(readFixture()));
      expect(result.rejected).toEqual([]);
      expect((await lotsByHold(db, result.voyage_id)).size).toBe(KAVKAZ_IV_HOLDS.length);
    });
  });
});
