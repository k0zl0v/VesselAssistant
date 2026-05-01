---
name: db-migrations
description: Use when creating or modifying SQLite schema, writing migrations under src-tauri/migrations/, or working on tables from TZ §9 (vessels, holds, cargoes, voyages, cargo_lots, cargo_layers, discharge_allocations, operations, hold_cargo_parameters, crane_coefficients, sof_events, documents, audit_log).
---

# SQLite migrations and schema

The data model is fixed by TZ §9. Migrations live in `src-tauri/migrations/` and are applied via `tauri-plugin-sql`.

## Naming convention

```
src-tauri/migrations/
├── 0001_initial_schema.sql
├── 0002_add_indices.sql
├── 0003_<short_description>.sql
```

- 4-digit zero-padded sequence prefix (NOT timestamp — sequence is easier to reason about for a small team).
- Snake_case description.
- One concern per migration. Don't bundle unrelated changes.
- Each `NNNN_*.sql` (up) **must** have a sibling `NNNN_*.down.sql` for rollback. Even if rollback is destructive — document it.

## Tables (TZ §9)

| Table | Required columns (minimum) |
|---|---|
| `vessels` | `id, name, flag, owner, imo, default_fill_percent` |
| `holds` | `id, vessel_id, hold_no, volume_m3, notes` |
| `cargoes` | `id, name, default_protein, unit, density, active` |
| `voyages` | `id, vessel_id, voyage_no, loading_port_id, discharging_port_id, status, dates` |
| `cargo_lots` | `id, voyage_id, source_vessel, cargo_id, hold_id, protein_percent, sf, planned_tons, loaded_tons, bl_no, load_sequence, loaded_at` |
| `cargo_layers` | `id, cargo_lot_id, voyage_id, hold_id, source_vessel, loaded_tons, remaining_tons, load_sequence, layer_status` |
| `discharge_allocations` | `id, operation_id, cargo_layer_id, cargo_lot_id, hold_id, source_vessel, discharged_tons, created_at` |
| `operations` | `id, voyage_id, type, event_date, time_from, time_to, source_hold, target_hold, crane_id, tons, description` |
| `hold_cargo_parameters` | `id, voyage_id, vessel_id, hold_id, cargo_id, protein_percent, sf, fill_percent` (default 0.98) |
| `crane_coefficients` | `id, crane_id, operation_type, side, vessel_name, valid_from, valid_to, coefficient` |
| `sof_events` | `id, voyage_id, event_date, time_from, time_to, category, description, daily_qty, total_qty` |
| `documents` | `id, voyage_id, document_type, revision, generated_at, local_file_path, status` |
| `audit_log` | `id, entity_type, entity_id, action, old_value, new_value, user_id, created_at` |

## Required constraints

- **Foreign keys**: enable `PRAGMA foreign_keys = ON;` in the connection setup; declare every FK explicitly with `ON DELETE` policy chosen deliberately (mostly `RESTRICT`; `audit_log` keeps orphans).
- **Cascades**:
  - `holds.vessel_id → vessels.id` ON DELETE RESTRICT.
  - `cargo_lots.voyage_id → voyages.id` ON DELETE RESTRICT.
  - `cargo_lots.hold_id → holds.id` ON DELETE RESTRICT.
  - `cargo_layers.cargo_lot_id → cargo_lots.id` ON DELETE CASCADE.
  - `discharge_allocations.cargo_layer_id → cargo_layers.id` ON DELETE RESTRICT (preserve customs trail).
  - `discharge_allocations.operation_id → operations.id` ON DELETE RESTRICT.
- **Check constraints**:
  - `vessels.default_fill_percent BETWEEN 0 AND 1`.
  - `hold_cargo_parameters.fill_percent BETWEEN 0 AND 1`, default `0.98`.
  - `cargo_lots.sf > 0`, `hold_cargo_parameters.sf > 0`.
  - `cargo_layers.remaining_tons >= 0`.
  - `cargo_layers.remaining_tons <= cargo_layers.loaded_tons`.
  - `cargo_lots.protein_percent IN (10.5, 11.5, 12.5, 13.5) OR cargo_lots.protein_percent IS NULL` — only enforced where cargo is wheat (handle in service layer if SQLite check can't reference cargo type).
- **Unique**:
  - `(vessels.imo)` unique when not null.
  - `(holds.vessel_id, holds.hold_no)` unique.
  - `(voyages.vessel_id, voyages.voyage_no)` unique.
  - `(cargo_lots.voyage_id, cargo_lots.hold_id, cargo_lots.load_sequence)` unique — enforces ordering inside a hold.
- **Defaults**:
  - `created_at`, `updated_at` use `DEFAULT (datetime('now'))`.
  - `cargo_layers.layer_status` default `'active'`.

## Indices

Create in `0002_add_indices.sql` (separate from schema for clarity):

```sql
CREATE INDEX idx_holds_vessel              ON holds(vessel_id);
CREATE INDEX idx_cargo_lots_voyage         ON cargo_lots(voyage_id);
CREATE INDEX idx_cargo_lots_hold           ON cargo_lots(hold_id);
CREATE INDEX idx_cargo_layers_hold_seq     ON cargo_layers(hold_id, load_sequence DESC);
CREATE INDEX idx_cargo_layers_lot          ON cargo_layers(cargo_lot_id);
CREATE INDEX idx_dalloc_operation          ON discharge_allocations(operation_id);
CREATE INDEX idx_dalloc_layer              ON discharge_allocations(cargo_layer_id);
CREATE INDEX idx_operations_voyage_date    ON operations(voyage_id, event_date);
CREATE INDEX idx_sof_voyage_date           ON sof_events(voyage_id, event_date, time_from);
CREATE INDEX idx_audit_entity              ON audit_log(entity_type, entity_id, created_at);
```

`idx_cargo_layers_hold_seq` is the **hot index** for LIFO discharge — it lets `dischargeFromHold` scan layers top-down without sorting.

## Denormalization rule

`cargo_layers.remaining_tons` is **denormalized** for performance: it's `loaded_tons - SUM(discharge_allocations.discharged_tons)` for that layer. Mutated transactionally with the corresponding `discharge_allocations` insert.

A nightly/manual integrity check should verify:

```sql
SELECT cl.id,
       cl.loaded_tons - COALESCE(SUM(da.discharged_tons), 0) AS computed,
       cl.remaining_tons AS stored
FROM cargo_layers cl
LEFT JOIN discharge_allocations da ON da.cargo_layer_id = cl.id
GROUP BY cl.id
HAVING ABS(computed - stored) > 0.001;
```

Any row returned indicates corruption — surface in audit log.

## Number storage

- All tonnages, volumes, SF: **`REAL`** (SQLite IEEE 754 double).
- Do not store rounded values; rounding is presentation-only.
- Money-like precision tricks (storing × 1000 as INTEGER) are unnecessary here — tons are in the 10^4 range and double precision (~15 digits) is plenty.

## Transactional patterns

- **Loading a lot**: insert `cargo_lots` + insert exactly one `cargo_layers` row with `remaining_tons = loaded_tons` and `load_sequence = MAX(...) + 1` for that hold — all in one transaction.
- **Discharging from a hold**: select layers with `FOR UPDATE`-equivalent (`BEGIN IMMEDIATE`), apply LIFO, insert N `discharge_allocations`, update each affected `cargo_layers.remaining_tons`, commit.
- **Audit**: every mutation writes a row to `audit_log` with `old_value` / `new_value` JSON snapshots. Wrap as a SQLite trigger or in the service layer — pick one and stick with it.

## Common pitfalls

- **Forgetting `PRAGMA foreign_keys = ON;`.** SQLite ignores FK constraints by default. Set on every connection open.
- **Storing SF on `cargoes` only.** Violates TZ §3.1 / FR-20. SF lives on `cargo_lots` and `hold_cargo_parameters`.
- **Using `INTEGER` for tonnage to "avoid float issues".** Loses sub-ton precision; tons are not currency.
- **Bundling schema + seed data in one migration.** Seed in a separate `NNNN_seed_*.sql` so test environments can opt in.
- **Missing `down.sql`.** Even if you never rollback in production, dev environments break without it.
- **No unique on `(voyage_id, hold_id, load_sequence)` for `cargo_lots`.** Two lots with the same sequence break LIFO ordering silently.
