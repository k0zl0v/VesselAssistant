import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openTestDb } from './helpers';
import type { NodeDb } from '../db-node';

const MIGRATION = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src-tauri/migrations/0006_crane_model.sql');

/** The two `INSERT … SELECT … FROM crane_coefficients` statements that carry old rows over. */
const carryOver: string[] = readFileSync(MIGRATION, 'utf8')
  .replace(/^--.*$/gm, '')
  .split(';')
  .map((s) => s.trim())
  .filter((s) => /^INSERT/i.test(s) && /FROM\s+crane_coefficients/i.test(s));

describe('0006 carry-over of crane_coefficients', () => {
  let db: NodeDb;
  let craneId: string;

  async function old(id: string, operation_type: string, side: string | null, vessel_name: string | null, valid_from: string, k: number) {
    await db.execute(
      `INSERT INTO crane_coefficients (id, crane_id, operation_type, side, vessel_name, valid_from, coefficient)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, craneId, operation_type, side, vessel_name, valid_from, k],
    );
  }

  beforeEach(async () => {
    db = await openTestDb();
    craneId = crypto.randomUUID();
    await db.execute(`INSERT INTO cranes (id, name) VALUES (?, 'CRANE # 1')`, [craneId]);
  });

  afterEach(() => db.close());

  it('finds exactly the two statements in the migration', () => {
    expect(carryOver).toHaveLength(2);
    expect(carryOver[0]).toMatch(/INTO crane_measurements/);
    expect(carryOver[1]).toMatch(/INTO crane_working_coefficients/);
  });

  it('vessel-specific rows become measurements, vessel-agnostic ones working values; shifting is dropped', async () => {
    await old('m1', 'discharging', null, 'BETA', '2025-08-06', 1.06);
    await old('m2', 'loading', 'PORT', 'LYDIA V', '2025-09-03', 1.1);
    await old('m3', 'loading', 'STARBOARD', 'BRAVO', '2025-09-04', 0.97);
    await old('m4', 'loading', null, 'DELTA', '2025-09-05', 1.07);
    await old('w1', 'discharging', null, null, '2025-11-09', 1.06);
    await old('w2', 'loading', 'STARBOARD', null, '2025-09-03', 0.98);
    await old('w3', 'loading', 'BOTH', null, '2025-09-03', 1.01);
    await old('w4', 'loading', 'PORT', null, '2025-09-03', 1.02);
    await old('s1', 'shifting', null, null, '2025-09-03', 1.5);
    await old('s2', 'shifting', null, 'GAMMA', '2025-09-03', 1.5);

    await db.execute(`DELETE FROM crane_measurements`);
    await db.execute(`DELETE FROM crane_working_coefficients`);
    for (const sql of carryOver) await db.execute(sql);

    const measurements = await db.select<{ id: string; mode: string; vessel_name: string; measured_on: string; coefficient: number; excluded: number }>(
      `SELECT id, mode, vessel_name, measured_on, coefficient, excluded FROM crane_measurements ORDER BY id`,
    );
    expect(measurements).toEqual([
      { id: 'm1', mode: 'from_own', vessel_name: 'BETA', measured_on: '2025-08-06', coefficient: 1.06, excluded: 0 },
      { id: 'm2', mode: 'into_own_port', vessel_name: 'LYDIA V', measured_on: '2025-09-03', coefficient: 1.1, excluded: 0 },
      { id: 'm3', mode: 'into_own_starboard', vessel_name: 'BRAVO', measured_on: '2025-09-04', coefficient: 0.97, excluded: 0 },
      { id: 'm4', mode: 'into_own_port', vessel_name: 'DELTA', measured_on: '2025-09-05', coefficient: 1.07, excluded: 0 },
    ]);

    // w3 (BOTH → port) and w4 (PORT) collide on (crane, into_own_port, valid_from): INSERT OR IGNORE keeps the first.
    const working = await db.select<{ id: string; mode: string; valid_from: string; coefficient: number }>(
      `SELECT id, mode, valid_from, coefficient FROM crane_working_coefficients ORDER BY mode, id`,
    );
    expect(working).toHaveLength(3);
    expect(working.find((w) => w.mode === 'from_own')).toEqual({ id: 'w1', mode: 'from_own', valid_from: '2025-11-09', coefficient: 1.06 });
    expect(working.find((w) => w.mode === 'into_own_starboard')).toEqual({
      id: 'w2', mode: 'into_own_starboard', valid_from: '2025-09-03', coefficient: 0.98,
    });
    expect(working.filter((w) => w.mode === 'into_own_port').map((w) => w.id)).toHaveLength(1);
    expect(working.some((w) => w.mode === 'direct')).toBe(false);
  });
});
