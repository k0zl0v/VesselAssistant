import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CargoLotService } from '../CargoLotService';
import { OgvService } from '../OgvService';
import { SofService } from '../SofService';
import { VoyageService } from '../VoyageService';
import type { NodeDb } from '../db-node';
import { openTestDb, seedReferenceData } from './helpers';

interface AuditActor {
  entity_type: string;
  action: string;
  user_id: string | null;
  user_role: string | null;
}

/** Create voyage → add lot → discharge → SOF create/update/delete → close. */
async function runAuditedChain(db: NodeDb): Promise<void> {
  const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
  const voyages = new VoyageService(db);
  const voyage = await voyages.create({ vessel_id: seed.vesselId, voyage_no: 'SG-1' });
  await new CargoLotService(db).add({
    voyage_id: voyage.id,
    source_vessel: 'DIANA MARIA',
    cargo_id: seed.cargoId,
    hold_id: seed.holdIds[0]!,
    sf: 1.25,
    planned_tons: 1600,
    loaded_tons: 1600,
  });
  await new OgvService(db).discharge({
    voyage_id: voyage.id,
    hold_id: seed.holdIds[0]!,
    tons: 500,
    event_date: '2026-05-01',
  });
  const sof = new SofService(db);
  const ev = await sof.create({ voyage_id: voyage.id, event_date: '2026-05-01', time_from: '08:00' });
  await sof.update(ev.id, { description: 'NOR tendered' });
  await sof.delete(ev.id);
  await voyages.close(voyage.id);
}

async function auditActors(db: NodeDb): Promise<AuditActor[]> {
  const rows = await db.select<Record<string, unknown>>(`SELECT * FROM audit_log ORDER BY id`);
  return rows.map((r) => ({
    entity_type: r.entity_type as string,
    action: r.action as string,
    user_id: (r.user_id ?? null) as string | null,
    user_role: (r.user_role ?? null) as string | null,
  }));
}

describe('schema guards — operator context in audit_log (FR-10)', () => {
  let db: NodeDb;

  afterEach(() => {
    db.close();
  });

  it('stamps every audit row of a mutation chain with the session operator and role', async () => {
    db = await openTestDb();
    await runAuditedChain(db);

    const actors = await auditActors(db);
    const actions = new Set(actors.map((a) => `${a.entity_type}.${a.action}`));
    expect(actions).toEqual(
      new Set([
        'voyages.insert',
        'cargo_lots.insert',
        'cargo_layers.insert',
        'hold_cargo_parameters.insert',
        'operations.insert',
        'discharge_allocations.insert',
        'cargo_layers.update',
        'sof_events.insert',
        'sof_events.update',
        'sof_events.delete',
        'voyages.update',
      ]),
    );
    for (const a of actors) {
      expect(a, `${a.entity_type}.${a.action}`).toMatchObject({
        user_id: 'test-operator',
        user_role: 'operator',
      });
    }
  });

  it('leaves the actor NULL without failing when no session row exists', async () => {
    db = await openTestDb({ session: null });
    await runAuditedChain(db);

    const actors = await auditActors(db);
    expect(actors.length).toBeGreaterThan(0);
    for (const a of actors) {
      expect(a.user_id).toBeNull();
      expect(a.user_role).toBeNull();
    }
  });
});

describe('schema guards — irreversible states (D3, S-13)', () => {
  let db: NodeDb;
  let voyageId: string;

  beforeEach(async () => {
    db = await openTestDb();
    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
    voyageId = (await new VoyageService(db).create({ vessel_id: seed.vesselId, voyage_no: 'IG-1' })).id;
  });

  afterEach(() => {
    db.close();
  });

  it('rejects UPDATE of an audit_log row', async () => {
    await expect(db.execute(`UPDATE audit_log SET user_id = 'forged' WHERE id = 1`)).rejects.toThrow(
      'audit_log is immutable',
    );
  });

  it('rejects DELETE of an audit_log row', async () => {
    await expect(db.execute(`DELETE FROM audit_log WHERE id = 1`)).rejects.toThrow('audit_log is immutable');
  });

  it('closes an open voyage but rejects reopening a closed one', async () => {
    await new VoyageService(db).close(voyageId);
    expect((await new VoyageService(db).get(voyageId))!.status).toBe('closed');

    await expect(
      db.execute(`UPDATE voyages SET status = 'open' WHERE id = ?`, [voyageId]),
    ).rejects.toThrow('closed voyage cannot be reopened');
  });
});

describe('schema guards — protein_percent allowed set (FR-19)', () => {
  let db: NodeDb;
  let ids: { voyageId: string; vesselId: string; holdId: string; cargoId: string };

  beforeEach(async () => {
    db = await openTestDb();
    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
    const voyage = await new VoyageService(db).create({ vessel_id: seed.vesselId, voyage_no: 'PG-1' });
    ids = { voyageId: voyage.id, vesselId: seed.vesselId, holdId: seed.holdIds[0]!, cargoId: seed.cargoId };
  });

  afterEach(() => {
    db.close();
  });

  const TABLES = {
    cargo_lots: (id: string, protein: number | null) =>
      db.execute(
        `INSERT INTO cargo_lots (id, voyage_id, source_vessel, cargo_id, hold_id, protein_percent,
                                 sf, planned_tons, loaded_tons, load_sequence, loaded_at)
         VALUES (?, ?, 'DIANA MARIA', ?, ?, ?, 1.25, 100, 100, 1, '2026-05-01T00:00:00Z')`,
        [id, ids.voyageId, ids.cargoId, ids.holdId, protein],
      ),
    hold_cargo_parameters: (id: string, protein: number | null) =>
      db.execute(
        `INSERT INTO hold_cargo_parameters (id, voyage_id, vessel_id, hold_id, cargo_id, protein_percent, sf)
         VALUES (?, ?, ?, ?, ?, ?, 1.25)`,
        [id, ids.voyageId, ids.vesselId, ids.holdId, ids.cargoId, protein],
      ),
  } as const;
  const tableNames = Object.keys(TABLES) as (keyof typeof TABLES)[];

  describe.each(tableNames)('%s', (table) => {
    it.each([10.5, 11.5, 12.5, 13.5, null])('accepts %s on INSERT and UPDATE', async (value) => {
      await TABLES[table]('row-1', value);
      await db.execute(`UPDATE ${table} SET protein_percent = ? WHERE id = 'row-1'`, [value]);
      const rows = await db.select<{ protein_percent: number | null }>(
        `SELECT protein_percent FROM ${table} WHERE id = 'row-1'`,
      );
      expect(rows).toEqual([{ protein_percent: value }]);
    });

    it.each([99.9, 12.0])('rejects %s on INSERT', async (value) => {
      await expect(TABLES[table]('row-1', value)).rejects.toThrow('protein_percent not in allowed set');
    });

    it.each([99.9, 12.0])('rejects %s on UPDATE', async (value) => {
      await TABLES[table]('row-1', 12.5);
      await expect(
        db.execute(`UPDATE ${table} SET protein_percent = ? WHERE id = 'row-1'`, [value]),
      ).rejects.toThrow('protein_percent not in allowed set');
    });
  });
});
