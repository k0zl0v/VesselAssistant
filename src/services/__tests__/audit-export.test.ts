import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogService, type AuditEntry } from '../AuditLogService';
import { CargoLotService } from '../CargoLotService';
import { CraneCorrectionService } from '../CraneCorrectionService';
import { DocumentEngine } from '../DocumentEngine';
import { AppError } from '../errors';
import { OgvService } from '../OgvService';
import { ReferenceService } from '../ReferenceService';
import { SessionService } from '../SessionService';
import { SofService } from '../SofService';
import { VoyageService } from '../VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData, TEST_SESSION } from './helpers';
import type { NodeDb } from '../db-node';

async function loadXlsx(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb;
}

/** Every entity id that belongs to a voyage, read from the live tables. */
async function voyageEntityIds(db: NodeDb, voyageId: string): Promise<Set<string>> {
  const rows = await db.select<{ id: string }>(
    `SELECT id FROM voyages WHERE id = ?
     UNION SELECT id FROM cargo_lots WHERE voyage_id = ?
     UNION SELECT id FROM cargo_layers WHERE voyage_id = ?
     UNION SELECT id FROM hold_cargo_parameters WHERE voyage_id = ?
     UNION SELECT id FROM operations WHERE voyage_id = ?
     UNION SELECT id FROM sof_events WHERE voyage_id = ?
     UNION SELECT da.id FROM discharge_allocations da
             JOIN operations o ON o.id = da.operation_id WHERE o.voyage_id = ?`,
    Array(7).fill(voyageId),
  );
  return new Set(rows.map((r) => r.id));
}

describe('FR-10 — voyage audit log export', () => {
  let db: NodeDb;
  let audit: AuditLogService;
  let voyageA: string;
  let voyageB: string;
  let craneCoefficientId: string;
  let operationA: string;
  let allocationsA: string[];

  beforeEach(async () => {
    db = await openTestDb();
    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
    const holdId = seed.holdIds[0]!;
    const voyages = new VoyageService(db, NOOP_AUTO_BACKUP);
    const lots = new CargoLotService(db);
    const ogv = new OgvService(db);
    const sof = new SofService(db);
    audit = new AuditLogService(db);

    voyageA = (await voyages.create({ vessel_id: seed.vesselId, voyage_no: 'VY-A' })).id;
    voyageB = (await voyages.create({ vessel_id: seed.vesselId, voyage_no: 'VY-B' })).id;
    for (const voyage_id of [voyageA, voyageB]) {
      await lots.add({
        voyage_id,
        source_vessel: 'DIANA MARIA',
        cargo_id: seed.cargoId,
        hold_id: holdId,
        sf: 1.25,
        planned_tons: 1000,
        loaded_tons: 1000,
      });
    }
    operationA = (
      await ogv.discharge({ voyage_id: voyageA, hold_id: holdId, tons: 300, event_date: '2026-05-01' })
    ).operation_id;
    await ogv.discharge({ voyage_id: voyageB, hold_id: holdId, tons: 100, event_date: '2026-05-01' });
    allocationsA = (
      await db.select<{ id: string }>(`SELECT id FROM discharge_allocations WHERE operation_id = ?`, [operationA])
    ).map((r) => r.id);

    const crane = await new ReferenceService(db).createCrane({ name: 'CRANE 1' });
    craneCoefficientId = (
      await new CraneCorrectionService(db).create({
        crane_id: crane.id,
        operation_type: 'discharge',
        valid_from: '2026-01-01',
        coefficient: 1.01,
      })
    ).id;

    await sof.create({ voyage_id: voyageA, event_date: '2026-05-01', category: 'nor_tendered', description: 'NOR tendered' });
    await voyages.close(voyageA);
    await new SessionService(db).start({ operator_name: 'chief-mate', operator_role: 'supervisor' });
    await sof.create(
      { voyage_id: voyageA, event_date: '2026-05-02', category: 'berthed', description: 'Berthed late' },
      { closed_voyage_reason: 'late NOR correction' },
    );
  });

  afterEach(() => {
    db.close();
  });

  it('exports exactly the audit rows of the voyage and its entities, including discharge allocations', async () => {
    const rows = await audit.listForVoyage(voyageA);
    const ids = await voyageEntityIds(db, voyageA);
    const [{ n }] = await db.select<{ n: number }>(
      `SELECT COUNT(*) AS n FROM audit_log WHERE entity_id IN (${[...ids].map(() => '?').join(', ')})`,
      [...ids],
    );

    expect(rows).toHaveLength(n);
    expect(new Set(rows.map((r) => r.entity_id))).toEqual(ids);
    expect(new Set(rows.map((r) => r.entity_type))).toEqual(
      new Set(['voyages', 'cargo_lots', 'cargo_layers', 'hold_cargo_parameters', 'operations', 'discharge_allocations', 'sof_events']),
    );
    expect(allocationsA.length).toBeGreaterThan(0);
    for (const id of allocationsA) {
      expect(rows.some((r) => r.entity_type === 'discharge_allocations' && r.entity_id === id)).toBe(true);
    }
  });

  it('leaks neither another voyage nor shared crane reference data', async () => {
    const rows = await audit.listForVoyage(voyageA);
    const idsB = await voyageEntityIds(db, voyageB);

    expect(rows.some((r) => r.entity_type === 'crane_coefficients')).toBe(false);
    expect(rows.some((r) => r.entity_id === craneCoefficientId)).toBe(false);
    expect(rows.filter((r) => idsB.has(r.entity_id))).toEqual([]);
    expect((await audit.listForVoyage(voyageB)).some((r) => r.entity_id === voyageA)).toBe(false);
  });

  it('carries operator, role, reason, timestamp and entity on every row, in chronological order', async () => {
    const rows = await audit.listForVoyage(voyageA);

    for (const r of rows) {
      expect(r.entity_type).not.toBe('');
      expect(r.entity_id).not.toBe('');
      expect(r.user_id).not.toBeNull();
      expect(r.user_role).not.toBeNull();
      expect(r.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    }
    expect(rows.map((r) => r.id)).toEqual([...rows.map((r) => r.id)].sort((a, b) => a - b));

    const close = rows.find((r) => r.entity_type === 'voyages' && r.action === 'update')!;
    expect(JSON.parse(close.new_value!).status).toBe('closed');
    expect(close).toMatchObject({ user_id: TEST_SESSION.operator_name, user_role: 'operator', reason: null });

    const correction = rows.find((r) => r.entity_type === 'sof_events' && r.reason !== null)!;
    expect(correction).toMatchObject<Partial<AuditEntry>>({
      action: 'insert',
      user_id: 'chief-mate',
      user_role: 'supervisor',
      reason: 'late NOR correction',
    });
  });

  it('keeps discharge allocation rows after their operation is deleted, as a backup restore does', async () => {
    await db.execute(`DELETE FROM discharge_allocations WHERE operation_id = ?`, [operationA]);
    await db.execute(`DELETE FROM operations WHERE id = ?`, [operationA]);

    const rows = await audit.listForVoyage(voyageA);

    for (const id of allocationsA) {
      const actions = rows.filter((r) => r.entity_id === id).map((r) => r.action);
      expect(actions).toEqual(['insert', 'delete']);
    }
    expect(rows.some((r) => r.entity_id === operationA && r.action === 'delete')).toBe(true);
  });

  it('caps rows only when a limit is passed', async () => {
    const all = await audit.listForVoyage(voyageA);
    expect(all.length).toBeGreaterThan(3);
    expect(await audit.listForVoyage(voyageA, { limit: 3 })).toEqual(all.slice(0, 3));
    expect(await audit.listForVoyage(crypto.randomUUID())).toEqual([]);
  });

  it('DocumentEngine.generateAuditLog writes one value-only row per audit entry', async () => {
    const rows = await audit.listForVoyage(voyageA);
    const wb = await loadXlsx(await new DocumentEngine(db).generateAuditLog(voyageA));

    expect(wb.worksheets.map((s) => s.name)).toEqual(['AUDIT LOG']);
    const sheet = wb.worksheets[0]!;
    expect(String(sheet.getCell('A1').value)).toContain('NORD STAR');
    expect(String(sheet.getCell('A1').value)).toContain('VY-A');

    const HEADER = 4;
    expect((sheet.getRow(HEADER).values as unknown[]).slice(1)).toEqual([
      'Time', 'Entity', 'Entity ID', 'Action', 'Operator', 'Role', 'Reason', 'Old value', 'New value',
    ]);
    expect(sheet.rowCount).toBe(HEADER + rows.length);

    const correctionIdx = rows.findIndex((r) => r.reason === 'late NOR correction');
    const cells = (sheet.getRow(HEADER + 1 + correctionIdx).values as unknown[]).slice(1);
    const entry = rows[correctionIdx]!;
    expect(cells).toEqual([
      entry.created_at, 'sof_events', entry.entity_id, 'insert', 'chief-mate', 'supervisor',
      'late NOR correction', '', entry.new_value,
    ]);

    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        expect(typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value).toBe(false);
      });
    });
  });

  it('DocumentEngine.generateAuditLog rejects an unknown voyage', async () => {
    await expect(new DocumentEngine(db).generateAuditLog('nope')).rejects.toBeInstanceOf(AppError);
  });
});
