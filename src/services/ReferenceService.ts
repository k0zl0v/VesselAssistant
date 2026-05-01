import type { Db } from './db';

export interface Vessel {
  id: string;
  name: string;
  flag: string | null;
  owner: string | null;
  imo: string | null;
  default_fill_percent: number;
}

export interface Cargo {
  id: string;
  name: string;
  default_protein: number | null;
  unit: string;
  density: number | null;
  active: number;
}

export interface Hold {
  id: string;
  vessel_id: string;
  hold_no: number;
  volume_m3: number;
  notes: string | null;
}

export class ReferenceService {
  constructor(private readonly db: Db) {}

  async listVessels(): Promise<Vessel[]> {
    return await this.db.select<Vessel>(
      `SELECT * FROM vessels ORDER BY name`,
    );
  }

  async createVessel(input: {
    name: string;
    flag?: string | null;
    owner?: string | null;
    imo?: string | null;
  }): Promise<Vessel> {
    const id = crypto.randomUUID();
    await this.db.execute(
      `INSERT INTO vessels (id, name, flag, owner, imo) VALUES (?, ?, ?, ?, ?)`,
      [id, input.name, input.flag ?? null, input.owner ?? null, input.imo ?? null],
    );
    const rows = await this.db.select<Vessel>(`SELECT * FROM vessels WHERE id = ?`, [id]);
    return rows[0]!;
  }

  async listCargoes(): Promise<Cargo[]> {
    return await this.db.select<Cargo>(
      `SELECT * FROM cargoes WHERE active = 1 ORDER BY name`,
    );
  }

  async createCargo(input: { name: string; default_protein?: number | null }): Promise<Cargo> {
    const id = crypto.randomUUID();
    await this.db.execute(
      `INSERT INTO cargoes (id, name, default_protein) VALUES (?, ?, ?)`,
      [id, input.name, input.default_protein ?? null],
    );
    const rows = await this.db.select<Cargo>(`SELECT * FROM cargoes WHERE id = ?`, [id]);
    return rows[0]!;
  }

  async listHolds(vessel_id: string): Promise<Hold[]> {
    return await this.db.select<Hold>(
      `SELECT * FROM holds WHERE vessel_id = ? ORDER BY hold_no`,
      [vessel_id],
    );
  }

  async createHold(input: {
    vessel_id: string;
    hold_no: number;
    volume_m3: number;
    notes?: string | null;
  }): Promise<Hold> {
    const id = crypto.randomUUID();
    await this.db.execute(
      `INSERT INTO holds (id, vessel_id, hold_no, volume_m3, notes) VALUES (?, ?, ?, ?, ?)`,
      [id, input.vessel_id, input.hold_no, input.volume_m3, input.notes ?? null],
    );
    const rows = await this.db.select<Hold>(`SELECT * FROM holds WHERE id = ?`, [id]);
    return rows[0]!;
  }
}
