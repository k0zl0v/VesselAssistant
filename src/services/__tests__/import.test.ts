import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CalculationService } from '../CalculationService';
import { ImportService } from '../ImportService';
import {
  KAVKAZ_IV_HOLDS,
  KAVKAZ_IV_TOTALS,
} from '../../fixtures/kavkaz-iv';
import { openTestDb } from './helpers';
import type { NodeDb } from '../db-node';

const SOURCE_FILE = '/Users/akozlov/Downloads/Kavkaz IV_  Load St Plan+SOF.xlsx';
const TOLERANCE = 0.001;

describe('ImportService — KAVKAZ IV xlsx', () => {
  const haveFile = existsSync(SOURCE_FILE);
  const maybeIt = haveFile ? it : it.skip;
  if (!haveFile) {
    // eslint-disable-next-line no-console
    console.warn(
      `import.test: source XLSX not found at ${SOURCE_FILE} — skipping.`,
    );
  }

  let bytes: Uint8Array;
  beforeAll(() => {
    if (haveFile) {
      const buf = readFileSync(SOURCE_FILE);
      bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
  });

  let db: NodeDb | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  maybeIt('parseLoadPlan extracts vessel + 5 holds with values from the fixture', async () => {
    const importer = new ImportService(await openTestDb());
    const parsed = await importer.parseLoadPlan(bytes);

    expect(parsed.vessel_name).toBe('KAVKAZ IV');
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

  maybeIt('applyImport persists data so CalculationService matches KAVKAZ_IV_TOTALS', async () => {
    db = await openTestDb();
    const importer = new ImportService(db);
    const calc = new CalculationService(db);

    const parsed = await importer.parseLoadPlan(bytes);
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
  });
});
