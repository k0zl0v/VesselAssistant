import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NodeDb } from '../db-node';
import { AppError } from '../errors';
import { SessionService } from '../SessionService';
import { SofTimeSheetService, type SofTimeSheetInput } from '../SofTimeSheetService';
import { VoyageService } from '../VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from './helpers';

const HEADER: SofTimeSheetInput = {
  shipping_company: '  AL MADHIK Shipping Co. ',
  cargo_description: 'SFM · WHEAT IN BULK',
  cargo_documents_on_board: '',
  charter_party: 'N/A',
  bill_weight_tons: 2001,
  nor_accepted_note: null,
};

describe('SofTimeSheetService', () => {
  let db: NodeDb;
  let service: SofTimeSheetService;
  let voyages: VoyageService;
  let voyageId: string;

  beforeEach(async () => {
    db = await openTestDb();
    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
    voyages = new VoyageService(db, NOOP_AUTO_BACKUP);
    voyageId = (await voyages.create({ vessel_id: seed.vesselId, voyage_no: 'NS-1' })).id;
    service = new SofTimeSheetService(db);
  });

  afterEach(() => db.close());

  it('a voyage without a header row reads as null', async () => {
    expect(await service.get(voyageId)).toBeNull();
  });

  it('inserts once, then updates the same row; blanks become NULL', async () => {
    const first = await service.upsert(voyageId, HEADER);
    expect(first).toMatchObject({
      voyage_id: voyageId,
      shipping_company: 'AL MADHIK Shipping Co.',
      cargo_documents_on_board: null,
      charter_party: 'N/A',
      bill_weight_tons: 2001,
      nor_accepted_note: null,
    });

    const second = await service.upsert(voyageId, { ...HEADER, cargo_documents_on_board: '25.09 16:00', bill_weight_tons: null });
    expect(second.id).toBe(first.id);
    expect(second.cargo_documents_on_board).toBe('25.09 16:00');
    expect(second.bill_weight_tons).toBeNull();
    const [{ n }] = await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM sof_time_sheets`);
    expect(n).toBe(1);

    const audit = await db.select<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity_type = 'sof_time_sheets' ORDER BY id`,
    );
    expect(audit.map((a) => a.action)).toEqual(['insert', 'update']);
  });

  it('rejects a negative or non-finite bill weight before touching the table', async () => {
    await expect(service.upsert(voyageId, { ...HEADER, bill_weight_tons: -1 })).rejects.toThrow(/bill_weight_tons/);
    await expect(service.upsert(voyageId, { ...HEADER, bill_weight_tons: Number.NaN })).rejects.toThrow(/bill_weight_tons/);
    expect(await service.get(voyageId)).toBeNull();
  });

  it('a closed voyage refuses the edit for an operator', async () => {
    await voyages.close(voyageId);
    const e = await service.upsert(voyageId, HEADER).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe('voyage.closed');
    expect(await service.get(voyageId)).toBeNull();
  });

  it('a supervisor edits a closed voyage with a reason, and the reason lands in the audit log', async () => {
    await new SessionService(db).start({ operator_name: 'Anna', operator_role: 'supervisor' });
    await voyages.close(voyageId);
    await service.upsert(voyageId, HEADER, { closed_voyage_reason: 'C/P received late' });
    const [row] = await db.select<{ reason: string | null }>(
      `SELECT reason FROM audit_log WHERE entity_type = 'sof_time_sheets'`,
    );
    expect(row!.reason).toBe('C/P received late');
  });
});
