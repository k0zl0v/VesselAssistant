---
name: excel-export
description: Use when generating XLSX/PDF/DOCX exports for Load/Stowage Plan, OGV (operational goods-vessel log), Statement of Facts (SOF), or Crane Correction; when working with files in templates/, with the DocumentEngine module, or when matching the structure of the original `Kavkaz IV_ Load St Plan+SOF.xlsx` template.
---

# Document export — structure and rules

The application must reproduce the structure of the original Excel template `Kavkaz IV_ Load St Plan+SOF.xlsx` as the **primary** export mode (TZ §13). An enhanced/modern view is allowed as an additional optional mode but must not replace the Excel-faithful one.

## Sheet-to-module mapping (TZ §2)

| Original sheet | Module / data source | Purpose |
|---|---|---|
| `SOF` | `SofService` + `sof_events` | Hronological event log: vessel card, port, dates/times, formalities, signatures. **No formulas** in source — purely journal/document. |
| `KAVKAZ IV` (renamed) | `CalculationEngine` + `cargo_lots` + `hold_cargo_parameters` | Main Load/Stowage Plan: holds, SF, volume, loaded/discharged/remain, empty space 100% & 98%, daily total. |
| `OGV` | `OgvService` + `operations` (filtered by type) | Operations per source vessel/barge across holds №1–7; loads pulled from main vessel data. |
| `CRANE CORR.` | `crane_coefficients` + corrected-weight calc | Coefficients table by operation type / side / crane / date; computed corrected weight. |

## Hard rules for any export

1. **Numbers formatted as `0.000`** (3 decimals) in every cell that contains a tonnage, volume, capacity, empty space or corrected weight.
2. **No Excel formulas in exported files** (TZ §6 FR-22, §8 rule 16). Write computed *values*, not `=SUM(...)` or similar. The user must be able to open the file on a different machine and see frozen, deterministic numbers.
3. **Vessel name is a parameter.** Never hardcode `KAVKAZ IV` in any sheet name, header text, file name template, or constant. Read from `voyages.vessel_id → vessels.name`.
4. **Sheet name = vessel name** (sanitised: ≤31 chars, no `[]:*?/\`). `KAVKAZ IV` exists in the original only as an example — replaced by the actual vessel.
5. **All four sheets** present in the main Load Plan + SOF export, even if some are empty (preserve template shape).
6. **Date/time format** matches the rest of the app (locale-aware), with `24:00` accepted as end-of-day (TZ §8 rule 5).

## Recommended libraries

| Side | Library | Notes |
|---|---|---|
| JS (preferred — runs inside the renderer for speed) | [`exceljs`](https://www.npmjs.com/package/exceljs) | Full styling, sheet structure, no formulas needed for our case. |
| JS PDF | [`pdf-lib`](https://www.npmjs.com/package/pdf-lib) or print via Tauri webview to PDF | For form-style SOF prints. |
| Rust (if heavy export pushed to backend) | [`rust_xlsxwriter`](https://crates.io/crates/rust_xlsxwriter) | Streams large files efficiently. |
| DOCX (if needed) | [`docx`](https://www.npmjs.com/package/docx) | Optional — only for SOF if requested. |

Default: do XLSX in TS via `exceljs` from a service that receives a calculated voyage view-model. Keep generation in `src/services/document/` or via Tauri command if performance demands.

## Templates

- Templates live in `templates/` (binary `.xlsx` or programmatic builders).
- Variables in templates: `${vesselName}`, `${voyageNo}`, `${loadingPort}`, `${dischargingPort}`, `${date}`, etc.
- Programmatic generation is preferred over `.xlsx` template patching — easier to test and version.

## Project-level safeguards

- Add a unit test that exports a sample voyage and asserts:
  - All numeric cells with tonnage match `roundTo3(value).toFixed(3)`.
  - No cell has `cell.formula` set (only `cell.value`).
  - Sheet `KAVKAZ IV` is absent unless the actual vessel is named that.
- Add a snapshot of the original control values (Appendix C of TZ) into a fixture and compare an exported workbook against it.

## Common pitfalls

- **Embedding `=SUM(...)` to mimic the Excel original.** Forbidden — the original had formulas, our app emits values.
- **Hardcoding sheet name `KAVKAZ IV`.** Read from voyage.
- **Forgetting to round.** A raw `15881.92402957...` in a cell breaks AT-13.
- **Using cell number format `0.00` instead of `0.000`.** Visual rounding to 2 decimals masks the actual value.
- **Naming the export file `Load Plan KAVKAZ IV.xlsx` regardless of vessel.** Use `Load Plan ${vesselName} ${voyageNo}.xlsx`.
- **Mixing locale separators.** Decide once (period vs comma) per export; XLSX stores numbers as numbers — let Excel render the locale.
