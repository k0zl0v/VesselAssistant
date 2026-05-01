import type { Db } from './db';
import type { CreateVoyageInput, Voyage } from './types';

export class VoyageService {
  constructor(private readonly db: Db) {}

  async create(input: CreateVoyageInput): Promise<Voyage> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db.execute(
      `INSERT INTO voyages (
         id, vessel_id, voyage_no,
         loading_port_id, discharging_port_id, status,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
      [
        id,
        input.vessel_id,
        input.voyage_no,
        input.loading_port_id ?? null,
        input.discharging_port_id ?? null,
        now,
        now,
      ],
    );

    return (await this.get(id))!;
  }

  async get(id: string): Promise<Voyage | null> {
    const rows = await this.db.select<Voyage>(
      `SELECT * FROM voyages WHERE id = ?`,
      [id],
    );
    return rows[0] ?? null;
  }

  async listByVessel(vessel_id: string): Promise<Voyage[]> {
    return await this.db.select<Voyage>(
      `SELECT * FROM voyages WHERE vessel_id = ? ORDER BY voyage_no DESC`,
      [vessel_id],
    );
  }

  async close(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE voyages
         SET status = 'closed', updated_at = ?
         WHERE id = ? AND status = 'open'`,
      [new Date().toISOString(), id],
    );
  }
}
