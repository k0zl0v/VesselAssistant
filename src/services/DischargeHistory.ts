import type { Db } from './db';
import type { CargoLayerRow } from './types';

/** A cargo layer with what the layers screen and the discharge preview print next to it. */
export interface LayerView extends CargoLayerRow {
  hold_no: number;
  cargo_name: string;
  sf: number;
  protein_percent: number | null;
  loaded_at: string;
}

/** One OGV discharge operation and the layers it wrote off, top layer first. */
export interface DischargeOperationView {
  operation_id: string;
  event_date: string;
  time_from: string | null;
  time_to: string | null;
  hold_id: string;
  hold_no: number;
  tons: number;
  description: string | null;
  created_at: string;
  allocations: {
    cargo_layer_id: string;
    load_sequence: number;
    source_vessel: string;
    discharged_tons: number;
    /** Remaining tons of the layer now — 0 means this or a later operation closed it. */
    layer_remaining_tons: number;
  }[];
}

/**
 * Layers of a voyage, every hold or one, ordered top of stack first
 * (highest load_sequence) — the order LIFO writes them off.
 */
export async function listLayers(db: Db, voyage_id: string, hold_id?: string): Promise<LayerView[]> {
  return await db.select<LayerView>(
    `SELECT cl.*, h.hold_no AS hold_no, c.name AS cargo_name, lot.sf AS sf,
            lot.protein_percent AS protein_percent, lot.loaded_at AS loaded_at
       FROM cargo_layers cl
       JOIN cargo_lots lot ON lot.id = cl.cargo_lot_id
       JOIN cargoes c ON c.id = lot.cargo_id
       JOIN holds h ON h.id = cl.hold_id
      WHERE cl.voyage_id = ? AND (? IS NULL OR cl.hold_id = ?)
      ORDER BY h.hold_no, cl.load_sequence DESC`,
    [voyage_id, hold_id ?? null, hold_id ?? null],
  );
}

interface OperationRow {
  operation_id: string;
  event_date: string;
  time_from: string | null;
  time_to: string | null;
  hold_id: string;
  hold_no: number;
  tons: number;
  description: string | null;
  created_at: string;
}

interface AllocationRow {
  operation_id: string;
  cargo_layer_id: string;
  load_sequence: number;
  source_vessel: string;
  discharged_tons: number;
  layer_remaining_tons: number;
}

/** Discharge operations of a voyage, newest first, each with its LIFO allocations. */
export async function listDischargeHistory(db: Db, voyage_id: string): Promise<DischargeOperationView[]> {
  const [ops, allocs] = await Promise.all([
    db.select<OperationRow>(
      `SELECT op.id AS operation_id, op.event_date, op.time_from, op.time_to,
              op.source_hold AS hold_id, h.hold_no AS hold_no, op.tons, op.description, op.created_at
         FROM operations op
         JOIN holds h ON h.id = op.source_hold
        WHERE op.voyage_id = ? AND op.type = 'discharge'
        ORDER BY op.event_date DESC, op.created_at DESC`,
      [voyage_id],
    ),
    db.select<AllocationRow>(
      `SELECT da.operation_id, da.cargo_layer_id, cl.load_sequence, da.source_vessel,
              da.discharged_tons, cl.remaining_tons AS layer_remaining_tons
         FROM discharge_allocations da
         JOIN operations op ON op.id = da.operation_id
         JOIN cargo_layers cl ON cl.id = da.cargo_layer_id
        WHERE op.voyage_id = ?
        ORDER BY cl.load_sequence DESC`,
      [voyage_id],
    ),
  ]);
  return ops.map((op) => ({
    ...op,
    allocations: allocs
      .filter((a) => a.operation_id === op.operation_id)
      .map(({ operation_id: _op, ...a }) => a),
  }));
}
