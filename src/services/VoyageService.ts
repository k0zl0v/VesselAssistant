import type { AutoBackupHook } from './AutoBackupService';
import type { Db } from './db';
import { AppError } from './errors';
import type { CreateVoyageInput, Voyage } from './types';

export class VoyageService {
  constructor(
    private readonly db: Db,
    private readonly autoBackup: AutoBackupHook,
  ) {}

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

  /**
   * New open voyage with the source's vessel, ports and hold parameters (fresh ids);
   * lots, operations, SOF and dates are not copied. The source may be closed — it is only read.
   */
  async copy(id: string, voyage_no: string): Promise<Voyage> {
    const newId = await this.db.transaction(async (tx) => {
      const [source] = await tx.select<Voyage>(`SELECT * FROM voyages WHERE id = ?`, [id]);
      if (!source) throw new AppError('voyage.not_found', { voyage_id: id });

      const copyId = crypto.randomUUID();
      const now = new Date().toISOString();
      await tx.execute(
        `INSERT INTO voyages (
           id, vessel_id, voyage_no,
           loading_port_id, discharging_port_id, status,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
        [copyId, source.vessel_id, voyage_no, source.loading_port_id, source.discharging_port_id, now, now],
      );

      const params = await tx.select<{
        vessel_id: string;
        hold_id: string;
        cargo_id: string;
        protein_percent: number | null;
        sf: number;
        fill_percent: number;
      }>(
        `SELECT vessel_id, hold_id, cargo_id, protein_percent, sf, fill_percent
           FROM hold_cargo_parameters WHERE voyage_id = ?`,
        [id],
      );
      for (const p of params) {
        await tx.execute(
          `INSERT INTO hold_cargo_parameters
             (id, voyage_id, vessel_id, hold_id, cargo_id, protein_percent, sf, fill_percent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), copyId, p.vessel_id, p.hold_id, p.cargo_id, p.protein_percent, p.sf, p.fill_percent],
        );
      }
      return copyId;
    });
    return (await this.get(newId))!;
  }

  /** Snapshots `close_voyage` first; closing a voyage that is not open is a no-op. */
  async close(id: string): Promise<void> {
    const voyage = await this.get(id);
    if (!voyage || voyage.status !== 'open') return;
    await this.autoBackup.snapshot('close_voyage');
    await this.db.execute(
      `UPDATE voyages
         SET status = 'closed', updated_at = ?
         WHERE id = ? AND status = 'open'`,
      [new Date().toISOString(), id],
    );
  }
}
