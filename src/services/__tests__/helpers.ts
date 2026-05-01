import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeDb } from '../db-node';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  here,
  '../../../src-tauri/migrations/0001_initial_schema.sql',
);
const AUDIT_TRIGGERS_PATH = resolve(
  here,
  '../../../src-tauri/migrations/0002_audit_triggers.sql',
);

const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
const auditTriggersSql = readFileSync(AUDIT_TRIGGERS_PATH, 'utf8');

/**
 * Open a fresh in-memory SQLite, apply the production migrations in order,
 * and return a Db ready for service-level integration tests.
 */
export async function openTestDb(): Promise<NodeDb> {
  const db = NodeDb.openInMemory();
  await db.execute(migrationSql);
  await db.execute(auditTriggersSql);
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
