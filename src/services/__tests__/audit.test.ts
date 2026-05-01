import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogService } from '../AuditLogService';
import { CargoLotService } from '../CargoLotService';
import { OgvService } from '../OgvService';
import { VoyageService } from '../VoyageService';
import { openTestDb, seedReferenceData } from './helpers';
import type { NodeDb } from '../db-node';

interface RawAuditRow {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
}

describe('audit_log triggers — FR-10', () => {
  let db: NodeDb;
  let voyages: VoyageService;
  let lots: CargoLotService;
  let ogv: OgvService;
  let audit: AuditLogService;
  let vesselId: string;
  let holdId: string;
  let cargoId: string;

  beforeEach(async () => {
    db = await openTestDb();
    const seed = await seedReferenceData(db, {
      vesselName: 'NORD STAR',
      holdNos: [1],
    });
    vesselId = seed.vesselId;
    holdId = seed.holdIds[0]!;
    cargoId = seed.cargoId;

    voyages = new VoyageService(db);
    lots = new CargoLotService(db);
    ogv = new OgvService(db);
    audit = new AuditLogService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('VoyageService.create produces a single insert audit row', async () => {
    const voyage = await voyages.create({
      vessel_id: vesselId,
      voyage_no: 'VY-AUD-1',
    });

    const rows = await db.select<RawAuditRow>(
      `SELECT * FROM audit_log WHERE entity_type = 'voyages'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.entity_id).toBe(voyage.id);
    expect(rows[0]!.action).toBe('insert');
    expect(rows[0]!.old_value).toBeNull();
    const snapshot = JSON.parse(rows[0]!.new_value!);
    expect(snapshot.id).toBe(voyage.id);
    expect(snapshot.voyage_no).toBe('VY-AUD-1');
    expect(snapshot.status).toBe('open');
  });

  it('closing a voyage produces an update row with status open → closed', async () => {
    const voyage = await voyages.create({
      vessel_id: vesselId,
      voyage_no: 'VY-AUD-CLOSE',
    });
    await voyages.close(voyage.id);

    const updates = await db.select<RawAuditRow>(
      `SELECT * FROM audit_log
        WHERE entity_type = 'voyages' AND entity_id = ? AND action = 'update'`,
      [voyage.id],
    );
    expect(updates).toHaveLength(1);
    const before = JSON.parse(updates[0]!.old_value!);
    const after = JSON.parse(updates[0]!.new_value!);
    expect(before.status).toBe('open');
    expect(after.status).toBe('closed');
  });

  it('adding the first cargo lot logs cargo_lots, cargo_layers, and hold_cargo_parameters', async () => {
    const voyage = await voyages.create({
      vessel_id: vesselId,
      voyage_no: 'VY-AUD-LOT',
    });
    const lot = await lots.add({
      voyage_id: voyage.id,
      source_vessel: 'DIANA MARIA',
      cargo_id: cargoId,
      hold_id: holdId,
      sf: 1.25,
      planned_tons: 1000,
      loaded_tons: 1000,
    });

    const lotInserts = await audit.list({ entity_type: 'cargo_lots' });
    expect(lotInserts).toHaveLength(1);
    expect(lotInserts[0]!.action).toBe('insert');
    expect(lotInserts[0]!.entity_id).toBe(lot.id);

    const layerInserts = await audit.list({ entity_type: 'cargo_layers' });
    expect(layerInserts).toHaveLength(1);
    expect(layerInserts[0]!.action).toBe('insert');

    const paramsInserts = await audit.list({
      entity_type: 'hold_cargo_parameters',
    });
    expect(paramsInserts).toHaveLength(1);
    expect(paramsInserts[0]!.action).toBe('insert');
  });

  it('adding a second lot for same (voyage,hold,cargo) does not re-insert hold_cargo_parameters', async () => {
    const voyage = await voyages.create({
      vessel_id: vesselId,
      voyage_no: 'VY-AUD-LOT2',
    });
    await lots.add({
      voyage_id: voyage.id,
      source_vessel: 'DIANA MARIA',
      cargo_id: cargoId,
      hold_id: holdId,
      sf: 1.25,
      planned_tons: 500,
      loaded_tons: 500,
    });
    await lots.add({
      voyage_id: voyage.id,
      source_vessel: 'VELES',
      cargo_id: cargoId,
      hold_id: holdId,
      sf: 1.30,
      planned_tons: 400,
      loaded_tons: 400,
    });

    const lotsAudit = await audit.list({ entity_type: 'cargo_lots' });
    expect(lotsAudit).toHaveLength(2);
    const layersAudit = await audit.list({ entity_type: 'cargo_layers' });
    expect(layersAudit).toHaveLength(2);
    const paramsAudit = await audit.list({
      entity_type: 'hold_cargo_parameters',
    });
    expect(paramsAudit).toHaveLength(1);
  });

  it('OgvService.discharge writes audit rows for operations, allocations, and updated layers', async () => {
    const voyage = await voyages.create({
      vessel_id: vesselId,
      voyage_no: 'VY-AUD-DISC',
    });
    await lots.add({
      voyage_id: voyage.id,
      source_vessel: 'DIANA MARIA',
      cargo_id: cargoId,
      hold_id: holdId,
      sf: 1.25,
      planned_tons: 1000,
      loaded_tons: 1000,
    });
    await lots.add({
      voyage_id: voyage.id,
      source_vessel: 'VELES',
      cargo_id: cargoId,
      hold_id: holdId,
      sf: 1.30,
      planned_tons: 800,
      loaded_tons: 800,
    });

    const result = await ogv.discharge({
      voyage_id: voyage.id,
      hold_id: holdId,
      tons: 1000,
      event_date: '2026-05-01',
    });

    const opsAudit = await audit.list({ entity_type: 'operations' });
    expect(opsAudit).toHaveLength(1);
    expect(opsAudit[0]!.action).toBe('insert');
    expect(opsAudit[0]!.entity_id).toBe(result.operation_id);

    const allocAudit = await audit.list({
      entity_type: 'discharge_allocations',
    });
    expect(allocAudit.length).toBeGreaterThanOrEqual(1);
    expect(allocAudit.every((r) => r.action === 'insert')).toBe(true);

    // Layer updates: dischargeing 1000 t spans VELES (800) + DIANA (200) →
    // 2 layer rows updated. Plus the original 2 inserts.
    const layerAudit = await audit.list({ entity_type: 'cargo_layers' });
    const layerUpdates = layerAudit.filter((r) => r.action === 'update');
    expect(layerUpdates.length).toBeGreaterThanOrEqual(1);
    for (const u of layerUpdates) {
      const before = JSON.parse(u.old_value!);
      const after = JSON.parse(u.new_value!);
      expect(after.remaining_tons).toBeLessThan(before.remaining_tons);
    }
  });

  it('AuditLogService.list filters by entity_type', async () => {
    const voyage = await voyages.create({
      vessel_id: vesselId,
      voyage_no: 'VY-AUD-FILTER',
    });
    await lots.add({
      voyage_id: voyage.id,
      source_vessel: 'DIANA MARIA',
      cargo_id: cargoId,
      hold_id: holdId,
      sf: 1.25,
      planned_tons: 100,
      loaded_tons: 100,
    });

    const onlyVoyages = await audit.list({ entity_type: 'voyages' });
    expect(onlyVoyages.length).toBeGreaterThanOrEqual(1);
    expect(onlyVoyages.every((r) => r.entity_type === 'voyages')).toBe(true);

    const onlyLots = await audit.list({ entity_type: 'cargo_lots' });
    expect(onlyLots.length).toBeGreaterThanOrEqual(1);
    expect(onlyLots.every((r) => r.entity_type === 'cargo_lots')).toBe(true);

    const all = await audit.list({});
    expect(all.length).toBeGreaterThanOrEqual(
      onlyVoyages.length + onlyLots.length,
    );
  });

  it('AuditLogService.list orders by created_at DESC, id DESC', async () => {
    await voyages.create({ vessel_id: vesselId, voyage_no: 'VY-1' });
    await voyages.create({ vessel_id: vesselId, voyage_no: 'VY-2' });
    await voyages.create({ vessel_id: vesselId, voyage_no: 'VY-3' });

    const rows = await audit.list({ entity_type: 'voyages' });
    expect(rows).toHaveLength(3);
    // Most recent first.
    expect(rows[0]!.id).toBeGreaterThan(rows[1]!.id);
    expect(rows[1]!.id).toBeGreaterThan(rows[2]!.id);
  });
});
