---
name: excel-export
description: Use when generating XLSX exports (Load Plan, OGV, SOF, Crane Correction), parsing xlsx in ImportService, modifying DocumentEngine, working with `templates/`, or when matching the structure of the original `Kavkaz IV_ Load St Plan+SOF.xlsx`. Triggers on edits to src/services/DocumentEngine.ts, src/services/ImportService.ts, scripts/inspect-xlsx.mjs, or any code that imports `exceljs`.
---

# Document export — structure and rules

The application must reproduce the structure of the original Excel template `Kavkaz IV_ Load St Plan+SOF.xlsx` as the **primary** export mode (TZ §13). The current `DocumentEngine.generateLoadPlan(voyage_id)` produces a four-sheet workbook covering Load Plan + SOF + OGV + Crane Correction in one file.

## Sheet ordering (UX rule, learned the hard way)

| Order | Sheet name | Source |
|---:|---|---|
| 1 | **(vessel name)** — Load Plan | `CalculationService` + `cargoes` |
| 2 | `SOF` | `SofService.list` |
| 3 | `OGV` | `discharge_allocations` JOIN `operations` |
| 4 | `CRANE CORR.` | `crane_shift_records` (scale ÷ k = corrected, TOTAL per shift) + `crane_working_coefficients` with the average of included `crane_measurements` |

⚠ **Load Plan goes first**, NOT SOF (which the original Excel had as sheet 1). Excel and Numbers open the first sheet by default; an empty SOF (no events recorded yet) makes the file *look* broken to a fresh user. Load Plan always has data, so it's the safe default view. This was a real bug fix — see commit `ebc7f65`.

## Hard rules for any export

1. **Numbers formatted as `numFmt = "0.000"`** (3 decimals) in every cell with a tonnage, volume, capacity, empty space, or corrected weight. Use `"0.0"` for percentages and `"0"` for integer hold numbers.
2. **No Excel formulas** (TZ §6 FR-22, §8 rule 16). Only `cell.value = number`, never `cell.formula = "..."`. The user must open the file on another machine and see frozen, deterministic numbers.
3. **Vessel name is a parameter.** Never hardcode `KAVKAZ IV` in sheet names, header text, file-name templates, or constants. Read from `voyages.vessel_id → vessels.name`.
4. **Sheet name = sanitized vessel name** (≤31 chars, strip `[ ] : * ? / \`). Helper `safeSheetName` exists in `DocumentEngine.ts`.
5. **All four sheets** present, even if empty (preserve template shape — keep at least the header row).
6. **Date strings stay as `YYYY-MM-DD`**; times as `HH:MM` (24:00 allowed). Don't convert to Date objects.

## Defensive sweep at end of generateLoadPlan

The current implementation walks every sheet × every row × every cell at the end and throws if any `cell.value` is an object with a `formula` key. Keep this sweep — it's the last-line defense against an accidental formula leak via copy-paste from the Excel original. There's a test (`contains no formula cells across all sheets`) verifying this.

## Lazy import — mandatory

`exceljs` weighs ~940 KB minified (~270 KB gzipped). Loading it on app start blows the initial JS bundle from 285 KB to 1.2 MB. Strict rule:

- `DocumentEngine` and `ImportService` are imported via `await import('../services/DocumentEngine')` from UI components (`ExportButton`, `ImportPanel`).
- Tests can `import { DocumentEngine } from '../DocumentEngine'` directly — Vitest doesn't ship to users.
- If you add a new service that needs `exceljs`, the corresponding UI component MUST lazy-load it.

After modifying anything in this area, run `npm run build` and check the `dist/assets/index-*.js` size — should stay around 280 KB. If it jumped to >500 KB, you have an eager `exceljs` import somewhere.

## DocumentEngine internals

```ts
async generateLoadPlan(voyage_id: string): Promise<Uint8Array> {
  // Load voyage / vessel / ports / cargo metadata
  // Run CalculationService.calculate
  const wb = new ExcelJS.Workbook();

  // 4 sheets, in order
  this.buildLoadPlanSheet(...);   // sheet 1 — must be first
  await this.buildSofSheet(...);  // sheet 2
  await this.buildOgvSheet(...);  // sheet 3
  await this.buildCraneCorrSheet(...);  // sheet 4

  // Defensive sweep — throw on any formula cell
  wb.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => { ... })));

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
```

Sub-builders are private methods on the class. Each:
- Runs SQL via `this.db.select<T>` to get rows.
- Calls `sheet.columns = [{ width: ... }]` for layout.
- Sets bold/fill on header row.
- Iterates rows, sets `cell.value` and `cell.numFmt`.

## Recommended libraries

| Need | Library | Notes |
|---|---|---|
| XLSX read/write | `exceljs` (already a dep) | Full styling support; no formula APIs needed for write side |
| PDF | `pdf-lib` or webview-print | Out of scope currently |
| DOCX | `docx` | Out of scope currently |
| Cell layout exploration | `scripts/inspect-xlsx.mjs <path> <sheet>` | Dumps all non-empty cells of a sheet — useful for understanding new client templates |

## Project-level safeguards

The 12 tests in `src/services/__tests__/document-engine.test.ts` cover:
- Valid XLSX byte stream (PK ZIP magic).
- Sheet ordering (Load Plan first).
- Vessel name not hardcoded.
- Per-hold values match `CalculationService` output.
- Totals row equals Appendix C aggregates from `src/fixtures/kavkaz-iv.ts`.
- Every numeric cell uses `0.000` / `0.0` / `0` numFmt (AT-13).
- Every sheet has zero formula cells.
- SOF sheet has events that were inserted via `SofService`.
- OGV sheet shows discharges for this voyage.
- CRANE CORR. sheet has header even when empty.
- Throws on unknown voyage id.

When extending the export (new column, new sheet, new format), add a test in this file. The `loadXlsx(bytes)` helper at the top of the file uses ExcelJS in reader mode — pattern to follow.

## Common pitfalls

- **Embedding `=SUM(...)`** to mimic the Excel original. Forbidden. The defensive sweep will throw.
- **Hardcoding sheet name `KAVKAZ IV`.** Read from voyage.
- **Forgetting to round / using `0.00` instead of `0.000`.** AT-13 fails.
- **Naming the export file `Load Plan KAVKAZ IV.xlsx` regardless of vessel.** Use `Load Plan ${vesselName} ${voyageNo}.xlsx` (helper `sanitize` in `ExportButton`).
- **Eager `exceljs` import** somewhere on the cold path. Run `npm run build` and check chunk sizes after any new export feature.
- **Putting SOF first.** Don't.
- **Forgetting to mirror new SOF event categories** in `sofCategories.ts` — the export reads `category` raw text, so unknown values fall through. UI also looks up via `t('sof.category.<key>')` — if you add a category and forget i18n keys, label silently falls back to the raw key.
