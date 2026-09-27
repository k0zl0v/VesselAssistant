import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AutoBackupHook } from '../AutoBackupService';
import { NodeDb } from '../db-node';
import type { OperatorSession } from '../SessionService';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '../../../src-tauri/migrations');

const migrationSqls: readonly string[] = readdirSync(MIGRATIONS_DIR)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));

type SessionSeed = Pick<OperatorSession, 'operator_name' | 'operator_role'>;

export const TEST_SESSION: SessionSeed = { operator_name: 'test-operator', operator_role: 'operator' };

/** Tests only: prod code always gets a real `AutoBackupService` (`src/autoBackup.ts`). */
export const NOOP_AUTO_BACKUP: AutoBackupHook = { snapshot: async () => undefined };

/**
 * Open a fresh in-memory SQLite, apply every production migration from
 * `src-tauri/migrations` in filename order, and return a Db ready for
 * service-level integration tests. An `app_session` row for
 * `TEST_SESSION` is seeded unless `session: null` is passed.
 */
export async function openTestDb(
  opts: { session?: SessionSeed | null } = {},
): Promise<NodeDb> {
  const db = NodeDb.openInMemory();
  for (const sql of migrationSqls) await db.execute(sql);
  const session = opts.session === undefined ? TEST_SESSION : opts.session;
  if (session) {
    await db.execute(
      `INSERT INTO app_session (id, operator_name, operator_role) VALUES (1, ?, ?)`,
      [session.operator_name, session.operator_role],
    );
  }
  return db;
}

/**
 * Convenience: insert the minimum reference rows needed to satisfy FKs
 * for cargo_lots / cargo_layers / operations during tests.
 */
export async function seedReferenceData(
  db: NodeDb,
  opts: {
    vesselName: string;
    holdNos: number[];
    cargoName?: string;
    /**
     * Per-hold volume in m³. Default 100_000 — large enough that existing
     * tests do not trip the AT-05 overload guard. Tests targeting the
     * guard itself should pass an explicit value (e.g. 1000).
     */
    holdVolumeM3?: number;
  },
): Promise<{
  vesselId: string;
  holdIds: string[];
  cargoId: string;
}> {
  const vesselId = crypto.randomUUID();
  const cargoId = crypto.randomUUID();

  await db.execute(
    `INSERT INTO vessels (id, name) VALUES (?, ?)`,
    [vesselId, opts.vesselName],
  );
  await db.execute(
    `INSERT INTO cargoes (id, name) VALUES (?, ?)`,
    [cargoId, opts.cargoName ?? 'Wheat'],
  );

  const holdIds: string[] = [];
  for (const holdNo of opts.holdNos) {
    const holdId = crypto.randomUUID();
    holdIds.push(holdId);
    await db.execute(
      `INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, ?)`,
      [holdId, vesselId, holdNo, opts.holdVolumeM3 ?? 100_000],
    );
  }

  return { vesselId, holdIds, cargoId };
}
