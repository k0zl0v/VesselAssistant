import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortService } from '../PortService';
import type { NodeDb } from '../db-node';
import { openTestDb } from './helpers';

describe('PortService — integration', () => {
  let db: NodeDb;
  let svc: PortService;

  beforeEach(async () => {
    db = await openTestDb();
    svc = new PortService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('starts empty', async () => {
    expect(await svc.list()).toEqual([]);
  });

  it('creates ports and lists them by name', async () => {
    const nov = await svc.create({ name: 'Novorossiysk', code: ' RUNVS ' });
    await svc.create({ name: 'Alexandria' });
    expect(nov).toMatchObject({ name: 'Novorossiysk', code: 'RUNVS' });
    const list = await svc.list();
    expect(list.map((p) => p.name)).toEqual(['Alexandria', 'Novorossiysk']);
    expect(list[0]!.code).toBeNull();
  });

  it('stores an empty code as NULL', async () => {
    const p = await svc.create({ name: 'Izmir', code: '  ' });
    expect(p.code).toBeNull();
  });

  it('rejects an empty name', async () => {
    await expect(svc.create({ name: '   ' })).rejects.toThrow(/name/);
    expect(await svc.list()).toEqual([]);
  });
});
