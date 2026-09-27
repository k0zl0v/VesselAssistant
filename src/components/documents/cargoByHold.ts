import type { Db } from '../../services/db';

/**
 * Per-hold cargo label exactly as the Load Plan sheet writes it ("WHEAT 12.5%").
 * Mirrors DocumentEngine.loadCargoByHold (private there) so the preview shows the export's text.
 */
export async function loadCargoByHold(db: Db, voyage_id: string): Promise<Map<string, string>> {
  const rows = await db.select<{ hold_id: string; cargo_name: string; protein_percent: number | null }>(
    `SELECT hp.hold_id AS hold_id, c.name AS cargo_name, hp.protein_percent
       FROM hold_cargo_parameters hp
       JOIN cargoes c ON c.id = hp.cargo_id
      WHERE hp.voyage_id = ?`,
    [voyage_id],
  );
  const out = new Map<string, string>();
  for (const r of rows) {
    const suffix = r.protein_percent === null ? '' : ` ${r.protein_percent.toFixed(1)}%`;
    out.set(r.hold_id, `${r.cargo_name}${suffix}`);
  }
  return out;
}
