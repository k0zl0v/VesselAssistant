---
name: db-migrations
description: Use when creating or modifying SQLite schema, writing migrations under src-tauri/migrations/, registering them in Rust, or working on tables from TZ §9 (vessels, holds, cargoes, voyages, cargo_lots, cargo_layers, discharge_allocations, operations, hold_cargo_parameters, crane_coefficients, sof_events, documents, audit_log, app_session, plus the audit triggers).
---

# SQLite migrations and schema

The data model is fixed by TZ §9. Migrations live in `src-tauri/migrations/` and are applied via `tauri-plugin-sql` at app startup.

## Existing migrations

| # | File | Contents |
|---|---|---|
| 0001 | `0001_initial_schema.sql` | All 15 tables (TZ §9), CHECK constraints, FK cascades, hot indices. |
| 0002 | `0002_audit_triggers.sql` | 24 AFTER triggers + 1 BEFORE INSERT dedupe trigger on `audit_log`. |
| 0003 | `0003_operator_context.sql` | `app_session` (single-row operator identity), `audit_log` += `user_role`/`reason`, all 24 audit triggers rewritten to pull the actor from `app_session` instead of a literal `NULL` (see `docs/adr/0001-operator-identity-app-session.md`). |
| 0004 | `0004_immutability_guards.sql` | `audit_log_no_update`/`audit_log_no_delete` (immutable log), `voyages_no_reopen` (a closed voyage can never go back to `open`). |
| 0005 | `0005_protein_percent_guard.sql` | `BEFORE INSERT`/`BEFORE UPDATE` triggers on `cargo_lots`/`hold_cargo_parameters` rejecting `protein_percent` outside `{10.5, 11.5, 12.5, 13.5, NULL}` — schema-level FR-19, a trigger rather than a `CHECK` because SQLite can't `ALTER TABLE ... ADD CONSTRAINT` and a table rebuild under FKs/triggers inside the migration transaction risks data loss (NFR-4). |

## How to add a new migration (2 steps — both required)

1. **Create the SQL file** `src-tauri/migrations/NNNN_<description>.sql`. 4-digit zero-padded prefix, snake_case description. One concern per migration — don't bundle (this repo splits what a single conceptual change would suggest bundling: 0003/0004/0005 are three separate concerns from one original ask, precisely to keep this rule).
2. **Register it in Rust.** Append to the `Vec<Migration>` returned by `pub fn migrations()` in `src-tauri/src/lib.rs`:
   ```rust
   Migration {
       version: 6,
       description: "your_change",
       sql: include_str!("../migrations/0006_your_change.sql"),
       kind: MigrationKind::Up,
   },
   ```

**Nothing to mirror in tests by hand anymore.** `src/services/__tests__/helpers.ts`'s `openTestDb` reads `src-tauri/migrations/` at test-run time (`readdirSync`, filter `/^\d{4}_.+\.sql$/`, sort by filename, apply in order) — a new migration file is picked up automatically, no chain to edit.

**Guard against forgetting step 2 (or misordering):** `src-tauri/tests/migrations.rs`'s `every_migration_file_is_registered_in_order` fails if the file count on disk doesn't match `migrations().len()`, or if the registered versions aren't a contiguous `1..N`. Run `npm run test:rust` (`cargo test --manifest-path src-tauri/Cargo.toml`) to confirm, alongside `npm test`.

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

## Audit triggers (0002/0003) — the actor source

- For each of: `voyages`, `cargo_lots`, `cargo_layers`, `discharge_allocations`, `operations`, `sof_events`, `crane_coefficients`, `hold_cargo_parameters` — three triggers (insert/update/delete) named `audit_<table>_<action>`.
- Each writes to `audit_log` with `entity_type` = table name, `entity_id` = `NEW.id` or `OLD.id`, `action` = literal, `old_value` / `new_value` = `json_object(...)` of business columns.
- `created_at` / `updated_at` are excluded from the JSON snapshot.
- **Actor columns (`user_id`/`user_role`/`reason`, added `0003_operator_context.sql`)** are subselects against `app_session` — `(SELECT operator_name FROM app_session WHERE id = 1)` and its role/reason siblings — not a bind parameter passed by the caller. `app_session` is a single persistent row that `SessionService.start()` writes at every app launch and that `withVoyageGuard` stamps with `override_reason` around a guarded mutation on a closed voyage. This works from any pooled connection and from a `DELETE` trigger (where `NEW` isn't available) precisely because the actor lives in a table row, not in per-connection or per-process state — rejected alternatives (a TEMP table/`PRAGMA`, a bind parameter per call, full password/server auth) are in `docs/adr/0001-operator-identity-app-session.md`.
- Services never write to `audit_log` directly. A ninth audited table gets its three triggers in a new migration (not an edit to `0002`/`0003`), reading `app_session` the same way.

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

- **Loading a lot** (`CargoLotService.add`): in one `db.transaction(...)` — overload guard check, INSERT cargo_lots (unique sequence), INSERT cargo_layers, optional INSERT hold_cargo_parameters (only first lot per (voyage, hold, cargo)), return.
- **Discharging** (`OgvService.discharge`): SELECT layers ORDER BY load_sequence DESC (read, outside any transaction), run pure `dischargeFromHold`, then one `Db.executeBatch(BatchStatement[])` — INSERT operations + N discharge_allocations + conditional `UPDATE cargo_layers` (`expectRowsAffected: 1` catches a stale read as `AppError('batch.stale')`). Not `db.transaction` — see `docs/adr/0002-atomic-writes-execute-batch.md` for why.

For atomicity, most services use `db.transaction(async (tx) => { ... })` (both `Db` implementations wrap in `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`). New multi-table writes should prefer `executeBatch` instead — one connection from `tauri-plugin-sql`'s own pool, guaranteed by construction, not by hoping the pool returns the same connection across separate IPC calls.

## Common pitfalls

- **Forgetting `PRAGMA foreign_keys = ON`.** Both `db-tauri.ts` and `db-node.ts` set this on connection open. New impls must too.
- **Storing SF on `cargoes` only.** Violates TZ §3.1 / FR-20. SF lives on `cargo_lots` (write time) and `hold_cargo_parameters` (calc time cache).
- **Using INTEGER for tonnage.** Loses precision.
- **Bundling schema + seed data in one migration.** Seed via `seedDemo.ts` in app code or `seedReferenceData` in test helpers.
- **No unique on `(voyage_id, hold_id, load_sequence)` for `cargo_lots`.** Two lots with the same sequence break LIFO ordering silently.
- **Forgetting the dedupe trigger** when adding new tables to audit.
- **Adding a new audited table but not all 3 triggers.** If only INSERT trigger exists, UPDATE/DELETE silently miss the audit log.
