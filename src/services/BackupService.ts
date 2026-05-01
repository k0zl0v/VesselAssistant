import type { Db, SqlValue } from './db';

/**
 * Tables in FK-dependency order for INSERT (parents before children).
 * Reverse this list for DELETE.
 *
 * The columns array is the canonical column list per table — derived
 * directly from `src-tauri/migrations/0001_initial_schema.sql` (TZ §9).
 * If the schema changes, bump SCHEMA_VERSION and update both ends here.
 */
interface TableSpec {
  readonly name: string;
  readonly columns: readonly string[];
}

const TABLES: readonly TableSpec[] = [
  {
    name: 'vessels',
    columns: [
      'id',
      'name',
      'flag',
      'owner',
      'imo',
      'default_fill_percent',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'cargoes',
    columns: ['id', 'name', 'default_protein', 'unit', 'density', 'active'],
  },
  {
    name: 'ports',
    columns: ['id', 'name', 'code'],
  },
  {
    name: 'cranes',
    columns: ['id', 'name', 'notes'],
  },
  {
    name: 'holds',
    columns: ['id', 'vessel_id', 'hold_no', 'volume_m3', 'notes'],
  },
  {
    name: 'voyages',
    columns: [
      'id',
      'vessel_id',
      'voyage_no',
      'loading_port_id',
      'discharging_port_id',
      'status',
      'arrived_at',
      'nor_at',
      'berthed_at',
      'operations_started_at',
      'operations_ended_at',
      'departed_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'hold_cargo_parameters',
    columns: [
      'id',
      'voyage_id',
      'vessel_id',
      'hold_id',
      'cargo_id',
      'protein_percent',
      'sf',
      'fill_percent',
    ],
  },
  {
    name: 'cargo_lots',
    columns: [
      'id',
      'voyage_id',
      'source_vessel',
      'cargo_id',
      'hold_id',
      'protein_percent',
      'sf',
      'planned_tons',
      'loaded_tons',
      'bl_no',
      'load_sequence',
      'loaded_at',
    ],
  },
  {
    name: 'cargo_layers',
    columns: [
      'id',
      'cargo_lot_id',
      'voyage_id',
      'hold_id',
      'source_vessel',
      'loaded_tons',
      'remaining_tons',
      'load_sequence',
      'layer_status',
    ],
  },
  {
    name: 'operations',
    columns: [
      'id',
      'voyage_id',
      'type',
      'event_date',
      'time_from',
      'time_to',
      'source_hold',
      'target_hold',
      'crane_id',
      'tons',
      'description',
      'created_at',
    ],
  },
  {
    name: 'discharge_allocations',
    columns: [
      'id',
      'operation_id',
      'cargo_layer_id',
      'cargo_lot_id',
      'hold_id',
      'source_vessel',
      'discharged_tons',
      'created_at',
    ],
  },
  {
    name: 'crane_coefficients',
    columns: [
      'id',
      'crane_id',
      'operation_type',
      'side',
      'vessel_name',
      'valid_from',
      'valid_to',
      'coefficient',
    ],
  },
  {
    name: 'sof_events',
    columns: [
      'id',
      'voyage_id',
      'event_date',
      'time_from',
      'time_to',
      'category',
      'description',
      'daily_qty',
      'total_qty',
    ],
  },
  {
    name: 'documents',
    columns: [
      'id',
      'voyage_id',
      'document_type',
      'revision',
      'generated_at',
      'local_file_path',
      'status',
    ],
  },
  {
    name: 'audit_log',
    columns: [
      'id',
      'entity_type',
      'entity_id',
      'action',
      'old_value',
      'new_value',
      'user_id',
      'created_at',
    ],
  },
];

export const SCHEMA_VERSION = 1;

export interface BackupEnvelope {
  schema_version: number;
  exported_at: string;
  tables: Record<string, Record<string, SqlValue>[]>;
}

export class BackupService {
  constructor(private readonly db: Db) {}

  /**
   * Dump every TZ §9 table into a single JSON envelope. Order of rows
   * within a table is by primary key (`id`) when present, so output is
   * stable across runs and diff-friendly.
   */
  async exportToJson(): Promise<string> {
    const tables: Record<string, Record<string, SqlValue>[]> = {};
    for (const spec of TABLES) {
      const cols = spec.columns.map((c) => `"${c}"`).join(', ');
      const rows = await this.db.select<Record<string, SqlValue>>(
        `SELECT ${cols} FROM ${spec.name} ORDER BY "id"`,
      );
      tables[spec.name] = rows;
    }

    const envelope: BackupEnvelope = {
      schema_version: SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      tables,
    };
    return JSON.stringify(envelope, null, 2);
  }

  /**
   * Restore a backup envelope into the current DB. Runs in a single
   * transaction so a malformed file leaves the DB untouched.
   *
   * Default `wipeFirst: true` because mixing two voyages from different
   * sources via UUID collision is bug-prone — the explicit, safe default
   * is "this backup replaces the project state". Pass `wipeFirst: false`
   * only if you know the two datasets are disjoint.
   */
  async importFromJson(
    json: string,
    opts: { wipeFirst?: boolean } = {},
  ): Promise<void> {
    const envelope = JSON.parse(json) as BackupEnvelope;
    if (envelope.schema_version !== SCHEMA_VERSION) {
      throw new Error(
        `backup schema_version mismatch: expected ${SCHEMA_VERSION}, got ${envelope.schema_version}`,
      );
    }
    if (!envelope.tables || typeof envelope.tables !== 'object') {
      throw new Error('backup envelope is missing `tables` object');
    }

    const wipeFirst = opts.wipeFirst ?? true;

    await this.db.transaction(async (tx) => {
      if (wipeFirst) {
        // Reverse FK dependency order so children go first.
        for (let i = TABLES.length - 1; i >= 0; i--) {
          await tx.execute(`DELETE FROM ${TABLES[i]!.name}`);
        }
      }

      for (const spec of TABLES) {
        const rows = envelope.tables[spec.name];
        if (!rows || rows.length === 0) continue;

        const colList = spec.columns.map((c) => `"${c}"`).join(', ');
        const placeholders = spec.columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${spec.name} (${colList}) VALUES (${placeholders})`;

        for (const row of rows) {
          const params: SqlValue[] = spec.columns.map((c) => {
            const v = row[c];
            return v === undefined ? null : (v as SqlValue);
          });
          await tx.execute(sql, params);
        }
      }
    });
  }
}
