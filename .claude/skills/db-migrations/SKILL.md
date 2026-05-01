---
name: db-migrations
description: Use when creating or modifying SQLite schema, writing migrations under src-tauri/migrations/, registering them in Rust, mirroring them in test helpers, or working on tables from TZ §9 (vessels, holds, cargoes, voyages, cargo_lots, cargo_layers, discharge_allocations, operations, hold_cargo_parameters, crane_coefficients, sof_events, documents, audit_log, plus the audit triggers).
---

# SQLite migrations and schema

The data model is fixed by TZ §9. Migrations live in `src-tauri/migrations/` and are applied via `tauri-plugin-sql` at app startup.

## Existing migrations

| # | File | Contents |
|---|---|---|
| 0001 | `0001_initial_schema.sql` | All 15 tables (TZ §9), CHECK constraints, FK cascades, hot indices. |
| 0002 | `0002_audit_triggers.sql` | 24 AFTER triggers + 1 BEFORE INSERT dedupe trigger on `audit_log`. |

## How to add a new migration (3 steps — all required)

1. **Create the SQL file** `src-tauri/migrations/NNNN_<description>.sql`. 4-digit zero-padded prefix, snake_case description. One concern per migration — don't bundle.
2. **Register it in Rust.** Append to the `Vec<Migration>` in `src-tauri/src/lib.rs`:
   ```rust
   Migration {
       version: 3,
       description: "your_change",
       sql: include_str!("../migrations/0003_your_change.sql"),
       kind: MigrationKind::Up,
   },
   ```
3. **Mirror it in tests.** `src/services/__tests__/helpers.ts` reads each migration file via `readFileSync` and applies via `db.execute` in `openTestDb`. Add the new file to that chain. Without this step, tests still pass but DON'T cover the new schema, and a future test depending on it will fail mysteriously.

After these three steps, run `npm test` and `cargo check --manifest-path src-tauri/Cargo.toml` to confirm.

## Tables (TZ §9, current state)

| Table | Required columns (minimum) |
|---|---|
| `vessels` | `id, name, flag, owner, imo, default_fill_percent, created_at, updated_at` |
| `holds` | `id, vessel_id, hold_no, volume_m3, notes` |
| `cargoes` | `id, name, default_protein, unit, density, active` |
| `ports` | `id, name, code` |
| `cranes` | `id, name, notes` |
| `voyages` | `id, vessel_id, voyage_no, loading_port_id, discharging_port_id, status, arrived_at, nor_at, berthed_at, operations_started_at, operations_ended_at, departed_at, created_at, updated_at` |
| `hold_cargo_parameters` | `id, voyage_id, vessel_id, hold_id, cargo_id, protein_percent, sf, fill_percent` |
| `cargo_lots` | `id, voyage_id, source_vessel, cargo_id, hold_id, protein_percent, sf, planned_tons, loaded_tons, bl_no, load_sequence, loaded_at` |
| `cargo_layers` | `id, cargo_lot_id, voyage_id, hold_id, source_vessel, loaded_tons, remaining_tons, load_sequence, layer_status` |
| `operations` | `id, voyage_id, type, event_date, time_from, time_to, source_hold, target_hold, crane_id, tons, description, created_at` |
| `discharge_allocations` | `id, operation_id, cargo_layer_id, cargo_lot_id, hold_id, source_vessel, discharged_tons, created_at` |
| `crane_coefficients` | `id, crane_id, operation_type, side, vessel_name, valid_from, valid_to, coefficient` |
| `sof_events` | `id, voyage_id, event_date, time_from, time_to, category, description, daily_qty, total_qty` |
| `documents` | `id, voyage_id, document_type, revision, generated_at, local_file_path, status` |
| `audit_log` | `id INTEGER AUTOINCREMENT, entity_type, entity_id, action, old_value, new_value, user_id, created_at` |

## Constraints in 0001

- **`PRAGMA foreign_keys = ON`** at top of migration — SQLite ignores FK constraints by default.
- **FK ON DELETE policies:**
  - `holds.vessel_id` RESTRICT
  - `cargo_lots.voyage_id` / `hold_id` / `cargo_id` RESTRICT
  - `cargo_layers.cargo_lot_id` CASCADE
  - `discharge_allocations.cargo_layer_id` / `operation_id` RESTRICT (preserve customs trail)
- **CHECK constraints:**
  - `vessels.default_fill_percent BETWEEN 0 AND 1`
  - `hold_cargo_parameters.fill_percent BETWEEN 0 AND 1` (default 0.98)
  - `cargo_lots.sf > 0`, `hold_cargo_parameters.sf > 0`
  - `cargo_layers.remaining_tons >= 0`
  - `cargo_layers.remaining_tons <= cargo_layers.loaded_tons`
- **UNIQUE:**
  - `(vessels.imo)` when not null
  - `(holds.vessel_id, holds.hold_no)`
  - `(voyages.vessel_id, voyages.voyage_no)`
  - `(cargo_lots.voyage_id, cargo_lots.hold_id, cargo_lots.load_sequence)` — enforces LIFO ordering integrity

## Hot index

`idx_cargo_layers_hold_seq ON cargo_layers(hold_id, load_sequence DESC)` — used by `dischargeFromHold` to scan layers top-down without sorting. Don't drop it.

## Audit triggers (0002)

- For each of: `voyages`, `cargo_lots`, `cargo_layers`, `discharge_allocations`, `operations`, `sof_events`, `crane_coefficients`, `hold_cargo_parameters` — three triggers (insert/update/delete) named `audit_<table>_<action>`.
- Each writes to `audit_log` with `entity_type` = table name, `entity_id` = `NEW.id` or `OLD.id`, `action` = literal, `old_value` / `new_value` = `json_object(...)` of business columns.
- `created_at` / `updated_at` are excluded from the JSON snapshot.

### The dedupe trigger — critical

```sql
CREATE TRIGGER audit_log_dedupe BEFORE INSERT ON audit_log
WHEN EXISTS (SELECT 1 FROM audit_log WHERE id = NEW.id)
BEGIN SELECT RAISE(IGNORE); END;
```

Without this, `BackupService.importFromJson` collides on `audit_log.id`: the AFTER triggers on business tables fire as the import inserts cargo_lots / voyages / etc., and the IDs they auto-allocate clash with the audit_log rows that arrive later in the same JSON. **DO NOT remove this dedupe trigger** unless you've also rewritten BackupService.

## Denormalization

`cargo_layers.remaining_tons` is denormalized for read speed: equals `loaded_tons - SUM(discharge_allocations.discharged_tons)` for the layer. Mutated transactionally inside `OgvService.discharge`. A nightly integrity check (not currently scheduled but easy to add) would be:

```sql
SELECT cl.id,
       cl.loaded_tons - COALESCE(SUM(da.discharged_tons), 0) AS computed,
       cl.remaining_tons AS stored
FROM cargo_layers cl
LEFT JOIN discharge_allocations da ON da.cargo_layer_id = cl.id
GROUP BY cl.id
HAVING ABS(computed - stored) > 0.001;
```

## Number storage

- Tonnage / volume / SF / coefficient / percent: **`REAL`** (IEEE 754 double, ~15 digits — plenty for tons in the 10^4 range).
- Don't store rounded values; rounding is presentation-only via `formatTons` / numFmt.
- Don't use INTEGER × 1000 tricks. Tons aren't currency.

## Transactional patterns (matched in services)

- **Loading a lot** (`CargoLotService.add`): in one tx — overload guard check, INSERT cargo_lots (unique sequence), INSERT cargo_layers, optional INSERT hold_cargo_parameters (only first lot per (voyage, hold, cargo)), return.
- **Discharging** (`OgvService.discharge`): in one tx — INSERT operations, SELECT layers ORDER BY load_sequence DESC, run pure `dischargeFromHold`, INSERT N discharge_allocations, UPDATE affected cargo_layers (`remaining_tons`, `layer_status`).

For atomicity, services use `db.transaction(async (tx) => { ... })`. The `Db` interface implementations both wrap in `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`.

## Common pitfalls

- **Forgetting `PRAGMA foreign_keys = ON`.** Both `db-tauri.ts` and `db-node.ts` set this on connection open. New impls must too.
- **Storing SF on `cargoes` only.** Violates TZ §3.1 / FR-20. SF lives on `cargo_lots` (write time) and `hold_cargo_parameters` (calc time cache).
- **Using INTEGER for tonnage.** Loses precision.
- **Bundling schema + seed data in one migration.** Seed via `seedDemo.ts` in app code or `seedReferenceData` in test helpers.
- **No unique on `(voyage_id, hold_id, load_sequence)` for `cargo_lots`.** Two lots with the same sequence break LIFO ordering silently.
- **Forgetting the dedupe trigger** when adding new tables to audit. Or worse — adding triggers and forgetting to mirror them in `helpers.ts`.
- **Adding a new audited table but not all 3 triggers.** If only INSERT trigger exists, UPDATE/DELETE silently miss the audit log.
