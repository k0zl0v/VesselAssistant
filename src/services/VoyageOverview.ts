import type { Db } from './db';

export interface Port {
  id: string;
  name: string;
  code: string | null;
}

/** What the hold table shows next to the numbers: cargo, lot count, protein grades. */
export interface HoldSummary {
  hold_id: string;
  cargo_names: string[];
  lot_count: number;
  protein_percents: number[];
}

/** Read-only voyage context for the app shell and the Load Plan screen. */
export interface VoyageOverview {
  holds: Record<string, HoldSummary>;
  lot_count: number;
  source_vessel_count: number;
  cargo_names: string[];
  discharged_hold_nos: number[];
  discharge_operation_count: number;
  first_lot_at: string | null;
  last_activity_at: string | null;
}

interface LotRow {
  hold_id: string;
  cargo_name: string;
  source_vessel: string;
  protein_percent: number | null;
  loaded_at: string;
}

export async function listPorts(db: Db): Promise<Port[]> {
  return await db.select<Port>(`SELECT id, name, code FROM ports ORDER BY name`);
}

export async function loadVoyageOverview(db: Db, voyage_id: string): Promise<VoyageOverview> {
  const [lots, discharged, ops] = await Promise.all([
    db.select<LotRow>(
      `SELECT l.hold_id, c.name AS cargo_name, l.source_vessel,
              l.protein_percent, l.loaded_at
         FROM cargo_lots l
         JOIN cargoes c ON c.id = l.cargo_id
        WHERE l.voyage_id = ?
        ORDER BY l.load_sequence`,
      [voyage_id],
    ),
    db.select<{ hold_no: number }>(
      `SELECT DISTINCT h.hold_no
         FROM discharge_allocations da
         JOIN operations op ON op.id = da.operation_id
         JOIN holds h ON h.id = da.hold_id
        WHERE op.voyage_id = ?
        ORDER BY h.hold_no`,
      [voyage_id],
    ),
    db.select<{ n: number; last_at: string | null }>(
      `SELECT COUNT(*) AS n, MAX(event_date) AS last_at
         FROM operations
        WHERE voyage_id = ? AND type = 'discharge'`,
      [voyage_id],
    ),
  ]);

  const holds: Record<string, HoldSummary> = {};
  const cargoNames: string[] = [];
  const sources = new Set<string>();
  for (const lot of lots) {
    const h = (holds[lot.hold_id] ??= {
      hold_id: lot.hold_id,
      cargo_names: [],
      lot_count: 0,
      protein_percents: [],
    });
    h.lot_count += 1;
    if (!h.cargo_names.includes(lot.cargo_name)) h.cargo_names.push(lot.cargo_name);
    if (lot.protein_percent !== null && !h.protein_percents.includes(lot.protein_percent)) {
      h.protein_percents.push(lot.protein_percent);
    }
    if (!cargoNames.includes(lot.cargo_name)) cargoNames.push(lot.cargo_name);
    sources.add(lot.source_vessel);
  }

  const loadedDates = lots.map((l) => l.loaded_at).sort();
  const lastOp = ops[0]?.last_at ?? null;
  const lastLot = loadedDates[loadedDates.length - 1] ?? null;

  return {
    holds,
    lot_count: lots.length,
    source_vessel_count: sources.size,
    cargo_names: cargoNames,
    discharged_hold_nos: discharged.map((d) => d.hold_no),
    discharge_operation_count: ops[0]?.n ?? 0,
    first_lot_at: loadedDates[0] ?? null,
    last_activity_at: [lastLot, lastOp].filter((d): d is string => d !== null).sort().pop() ?? null,
  };
}
