import type { Db } from './db';
import { listPorts, type Port } from './VoyageOverview';

export type { Port };

/** Ports reference (loading / discharging ports of a voyage). */
export class PortService {
  constructor(private readonly db: Db) {}

  async list(): Promise<Port[]> {
    return await listPorts(this.db);
  }

  async create(input: { name: string; code?: string | null }): Promise<Port> {
    const name = input.name.trim();
    if (!name) throw new Error('port name must not be empty');
    const code = input.code?.trim() || null;
    const id = crypto.randomUUID();
    await this.db.execute(`INSERT INTO ports (id, name, code) VALUES (?, ?, ?)`, [id, name, code]);
    const rows = await this.db.select<Port>(`SELECT id, name, code FROM ports WHERE id = ?`, [id]);
    return rows[0]!;
  }
}
