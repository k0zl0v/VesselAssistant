# Architecture Decision Records

MADR short form: every record carries exactly four sections — **Контекст**, **Решение**, **Альтернативы**, **Последствия**. Numbering `0001`, `0002`, ... — append-only, a superseded record keeps its number and gets a `superseded_by` pointer instead of being renumbered or deleted.

No ADR convention existed in this repository before `Plans/01` (У13). Records below cover the decisions taken while building the testing foundation (`feature/testing-foundation`); earlier MVP decisions are not backfilled.

| # | Title | Decides |
|---|---|---|
| [0001](./0001-operator-identity-app-session.md) | Operator identity via `app_session` | Why a single persistent row + SQL triggers, not a TEMP table, a per-call bind parameter, or full password/server auth |
| [0002](./0002-atomic-writes-execute-batch.md) | Atomic multi-table writes via `execute_batch` | Why a generic Rust batch primitive over the plugin's own connection pool, not a domain-specific Rust command or a second pool |
| [0003](./0003-test-pyramid-and-ipc-bridge.md) | Test pyramid and the hand-written IPC bridge | Why not `mockIPC`, why `tauri-driver` for Windows-smoke, why a real XLSX fixture, the macOS webview gap |

## Writing a new ADR

1. Next free number = highest existing + 1 (own series, not shared with `Tasks/`/`Research/` numbering in the vault).
2. Four sections, in this order, nothing else mandatory. Keep each section to what a future reader needs to not repeat the decision process — link to the code, not to a chat log.
3. Name every rejected alternative explicitly in **Альтернативы** — "we considered other options" without naming them is not an ADR.
4. A decision reversed later gets a **new** record with `superseded_by`/`supersedes` cross-links, not an edit of the old one.
