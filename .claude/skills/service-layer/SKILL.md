---
name: service-layer
description: Use when adding or modifying TS services in src/services/, writing integration tests against real SQLite, picking transaction boundaries, generating IDs, or wiring a new service into the UI. Triggers on edits to src/services/**, src/services/__tests__/**, or any file that imports from `./db` or `./services/`.
---

# Service layer architecture

The TS service layer is the home of business logic. Rust (`src-tauri/`) is intentionally a thin SQL host — services own transactions, validation, and orchestration. UI components only call services; they never touch the DB directly.

## Module layout

```
src/services/
  db.ts                  # Db interface + SqlValue type
  db-tauri.ts            # production impl over @tauri-apps/plugin-sql
  db-node.ts             # tests-only impl over better-sqlite3
  types.ts               # cross-service domain types

  errors.ts              # AppError + AppErrorCode
  voyageGuard.ts         # withVoyageGuard — closed-voyage mutation guard
  SessionService.ts      # operator identity (app_session): start/current
  AutoBackupService.ts   # snapshot/rotate(10)/startTimer — AutoBackupHook
  BackupStore.ts         # BackupStore interface + MemoryBackupStore (tests)

  VoyageService.ts       # voyages CRUD + close (idempotent) + copy
  ReferenceService.ts    # vessels, cargoes, holds, cranes
  CargoLotService.ts     # add (lot + layer + auto-SF), list (overload guard)
  OgvService.ts          # availableBySource, discharge (LIFO, executeBatch)
  CalculationService.ts  # one big SQL → per-hold view-model + totals
  SofService.ts          # SOF events CRUD with HH:MM normalization
  CraneCorrectionService.ts  # findCoefficient + correctWeight
  AuditLogService.ts     # read-only viewer over audit_log (+ user_role/reason)
  BackupService.ts       # exportToJson / importFromJson (15-table envelope)
  ImportService.ts       # parse KAVKAZ-style xlsx → applyImport
  DocumentEngine.ts      # generateLoadPlan(voyage_id) → 4-sheet xlsx bytes
  HoldLotsView.ts        # joined read for the OGV expansion UI
  sofCategories.ts       # 17 SOF event templates

  __tests__/
    helpers.ts           # openTestDb (reads src-tauri/migrations/ by filename), seedReferenceData, NOOP_AUTO_BACKUP
    *.test.ts            # one file per service
```

## The Db abstraction

```ts
// src/services/db.ts
export interface Db {
  execute(sql: string, params?: SqlValue[]): Promise<void>;
  select<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  /** All statements on one connection in one IMMEDIATE transaction; any failure rolls back everything. */
  executeBatch(batch: BatchStatement[]): Promise<number[]>;
}
```

`executeBatch` is the newer of the two mutation primitives — for **new** multi-table writes, prefer it over `db.transaction`: `TauriDb.executeBatch` calls the Rust `execute_batch` command, which acquires one connection from `tauri-plugin-sql`'s own pool and runs the whole batch inside a single `BEGIN IMMEDIATE`, removing the "two writers" risk that `db.transaction`'s separate IPC calls (`BEGIN`/statements/`COMMIT`) don't fully rule out. `OgvService.discharge` and `VoyageService.copy` are the current examples; see `docs/adr/0002-atomic-writes-execute-batch.md` for the rejected alternatives. `db.transaction` stays the pattern for existing multi-table mutations (`CargoLotService`, `ImportService`, `BackupService.importFromJson`) — not deprecated, just not the default for new code.

All services accept `Db` in their constructor. **Don't import a specific impl** — that breaks test isolation. The two impls:

| Impl | Use | Notes |
|---|---|---|
| `TauriDb` | Production runtime | `Database.load('sqlite:vessel_assistant.db')`. Lazy singleton via `src/db.ts` `getDb()`. |
| `NodeDb` | Vitest only | `better-sqlite3` in-memory. **Don't** import `node:sqlite` — Vite/Vitest can't resolve `node:` URIs in worker pools (this was a real blocker; `better-sqlite3` is the workaround). |

Parameters use `?` positional placeholders (works for both impls). SQL string identical in tests and prod.

## Writing a new service

1. Define types in `src/services/types.ts` (or local file if very specific).
2. Class with `constructor(private readonly db: Db) {}`.
3. **Multi-table mutations — use `executeBatch`, not `db.transaction`.** Build a `BatchStatement[]` and call `this.db.executeBatch(batch)`; Rust runs the whole array on one pooled connection inside a single `BEGIN IMMEDIATE` (`docs/adr/0002-atomic-writes-execute-batch.md`). The example pattern (from `VoyageService.copy`):

   ```ts
   const batch: BatchStatement[] = [
     {
       sql: `INSERT INTO voyages (id, vessel_id, voyage_no, ...) VALUES (?, ?, ?, ...)`,
       params: [copyId, source.vessel_id, voyage_no, ...],
     },
     ...params.map((p) => ({
       sql: `INSERT INTO hold_cargo_parameters (id, voyage_id, ...) VALUES (?, ?, ...)`,
       params: [crypto.randomUUID(), copyId, ...],
     })),
   ];
   await this.db.executeBatch(batch);
   ```

   A failed statement, or an `expectRowsAffected` mismatch, rolls back the entire batch — nothing partially commits. `db.transaction` remains only on the services that already used it before this convention existed (`CargoLotService`, `ImportService`, `BackupService.importFromJson`) — it is not a pattern to reach for in new code.

4. **IDs:** `crypto.randomUUID()` for all `TEXT PRIMARY KEY` columns. The only INTEGER AUTOINCREMENT key is `audit_log.id`.
5. **No manual audit log writes.** SQL triggers in migrations 0002/0003 cover all 8 audited tables and stamp the actor from `app_session`. If you mutate an audited table, a row will appear in `audit_log` automatically. Don't duplicate.
6. **Errors are `AppError`** (`src/services/errors.ts`), not a plain `Error`/string:
   ```ts
   export class AppError extends Error {
     constructor(readonly code: AppErrorCode, readonly params: Record<string, string | number> = {}) {}
   }
   ```
   Throw `new AppError('voyage.not_found', { voyage_id })` etc. UI never sees the raw error — it calls `describeError(e)` (`src/i18n/errors.ts`), which maps a known `AppError` code to a localized, parameterized string and falls back to `error.unexpected` + `reportError(e)` for anything else. **Never `setError(String(e))`** in new code (see `CLAUDE.md` → What NOT to do). The one legacy exception: `CargoLotService.add`'s `OVERLOAD:<json>` prefix (`AddLotForm` still parses it to show overshoot tons) — inherited, not a pattern to repeat.
7. **A mutating method on a voyage-scoped service that a closed voyage should reject** goes through `withVoyageGuard(db, voyage_id, opts, fn)` (`src/services/voyageGuard.ts`) — see `CargoLotService.add`, `OgvService.discharge`, `SofService.create/update/delete` for the pattern. It resolves `voyage.not_found` / `voyage.closed` / `voyage.closed_reason_required` and clears `app_session.override_reason` after `fn` runs (even on throw).
8. **A service that mutates data reachable by "close voyage / import Excel / import project file / restore backup"** takes an `AutoBackupHook` as a constructor parameter — not optional, not defaulted to a no-op in production code. `VoyageService`, `ImportService`, `BackupService` are the current three; each snapshots (`hook.snapshot(trigger)`) before the mutation, and a throwing hook aborts the whole action. Tests use `NOOP_AUTO_BACKUP` from `src/services/__tests__/helpers.ts` — never import it outside `__tests__/`.

## Integration tests

Pattern (from any `__tests__/*.test.ts`):

```ts
beforeEach(async () => {
  db = await openTestDb();   // fresh in-memory SQLite + migrations 0001 + 0002 applied
  // seedReferenceData inserts a vessel + holds + cargo with sane defaults
  const seed = await seedReferenceData(db, { vesselName: 'X', holdNos: [1, 2, 3] });
  // build voyage / lots / etc. via the existing services
});

afterEach(() => {
  db.close();
});
```

`seedReferenceData` defaults `holdVolumeM3` to 100 000 m³ — large enough to never trip the AT-05 overload guard in tests not focused on it. For overload-specific tests, pass `holdVolumeM3: 1000` to get a tight 784-tonne capacity at SF=1.25 / fill=0.98.

## Two-tier SF (subtle gotcha)

`hold_cargo_parameters.sf` is a *cache* — automatically populated by `CargoLotService.add` from the first lot's SF per `(voyage, hold, cargo)` triple. Subsequent lots in the same hold do NOT overwrite. `CalculationService.calculate` reads SF from `hold_cargo_parameters` for capacity computation — i.e. ALL lots in a given hold share the SF declared by the first lot for that cargo. This matches the original Excel which had ONE SF per hold row.

The AT-05 overload guard uses `input.sf` (the new lot's SF), NOT the cached one — see comment in `CargoLotService.add`. Rationale: if the operator is declaring a different cargo physics now, that's what they should be guarded against.

## Wiring into UI

- One-shot lookups: pages call `getDb()` once, instantiate the service, call methods. State managed locally in `useState`. After mutation, refresh by re-running the read.
- Heavy services (DocumentEngine, ImportService — both pull `exceljs`): UI components MUST use `await import('../services/...')` lazy-load. Eager imports balloon initial bundle to >1 MB.
- See `src/components/ExportButton.tsx` and `src/components/ImportPanel.tsx` for the lazy pattern.

## When to extend vs create a new service

- **Extend** when the new method works on the same aggregate root (e.g. `VoyageService.archive` would belong in `VoyageService`).
- **New service** when the responsibility is independent (e.g. `BackupService`, `ImportService`, `DocumentEngine` are all cross-cutting).
- **Pure functions** for anything that can be expressed without DB access — put in `src/calc/` and unit-test there. The calc engine is where most logic gets verified deterministically.

## Common pitfalls

- **Sync `node:sqlite` import** — won't resolve under Vitest/Vite. Use `better-sqlite3`.
- **Using single `execute()` calls for a multi-table mutation instead of `executeBatch` (new code) or `db.transaction` (the three legacy services)** — partial writes on error.
- **Reading from a service inside another service's transaction.** Each service has its own `db` reference; nested transactions on better-sqlite3 require SAVEPOINTs which we don't expose. If you need cross-service work in one tx, pass `tx` explicitly or refactor.
- **Manual audit writes** — duplicate rows. Triggers cover everything.
- **Hardcoding SQL column lists in two places.** `BackupService.ts` keeps one canonical `TABLES` array used for SELECT, DELETE, INSERT — follow this pattern for any new bulk-table operation.
- **Mixing types in `select<T>`.** SQLite returns `null` for missing values, REAL for numbers — match your `T` shape carefully (`number | null`, not `number`).
