---
name: acceptance-tests
description: Use when adding or modifying tests, when working on CalculationEngine / OgvService / CargoLayerService / SofService, or before committing changes that affect calculation outputs. Maps the 13 acceptance scenarios from TZ §12 into Vitest tests and uses Appendix C control values as a regression baseline.
---

# Acceptance tests — AT-01 to AT-13

The acceptance criteria from TZ §12 are encoded as automated tests. They're the contract between the customer's expectations (Excel parity) and the application. **All 13 are currently green.** Tolerance: 0.001.

## Scenario coverage table

| ID | Scenario | Where it's covered |
|---|---|---|
| AT-01 | Voyage with arbitrary vessel, 5 holds, per-hold SF, fill=0.98 | `services/__tests__/calculation.test.ts` — 6 regression assertions against `KAVKAZ_IV_TOTALS` |
| AT-02 | Discharge 1177 t from hold 3 + 824 t from hold 5 via OGV | `services/__tests__/ogv.test.ts` + `calculation.test.ts` (the regression fixture runs these discharges through `OgvService.discharge`) |
| AT-03 | `CorrectedWeight = ScaleWeight / coefficient` | `services/__tests__/crane.test.ts` (100 / 0.95 = 105.263) |
| AT-04 | SOF events with `24:00` crossing midnight | `calc/__tests__/time.test.ts` + `services/__tests__/sof.test.ts` (creates `22:00→24:00` then `00:00→04:00` next day) |
| AT-05 | Load past 98% → warning/block | `calc/__tests__/capacity.test.ts` (`wouldOverload`) + `services/__tests__/cargo-lot.test.ts` (overshoot throws `OVERLOAD:` JSON) |
| AT-06 | Export Load Plan, OGV, SOF | `services/__tests__/document-engine.test.ts` — 12 tests verify the 4-sheet workbook |
| AT-07 | DIANA MARIA 1600 + VELES 1200, discharge 500 → only VELES drops | `calc/__tests__/discharge.test.ts` (pure) + `services/__tests__/ogv.test.ts` (DB) |
| AT-08 | Subsequent discharge 900 → VELES=0, DIANA=1400 | same files as AT-07 |
| AT-09 | Vessel name ≠ KAVKAZ IV everywhere | `services/__tests__/document-engine.test.ts` "uses the actual vessel name…", several integration tests use other vessel names |
| AT-10 | Wheat protein 10.5/11.5/12.5/13.5 | `services/__tests__/cargo-lot.test.ts` (protein_percent stored on lot), UI dropdown in `AddLotForm` |
| AT-11 | Per-hold SF for same cargo | `services/__tests__/calculation.test.ts` — explicit 'AT-11' test using same WHEAT cargo with sf=1.226 vs 1.30 |
| AT-12 | OGV reads available cargo from main vessel | `services/__tests__/ogv.test.ts` `availableBySource` |
| AT-13 | Every numeric export cell shows 3 decimals | `services/__tests__/document-engine.test.ts` — walks every sheet asserting numFmt |

## Vitest template

Place tests in `src/calc/__tests__/acceptance/`. One file per AT (e.g. `at-07-lifo-discharge.test.ts`).

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { dischargeFromHold } from '../../discharge';
import type { Layer } from '../../types';

describe('AT-07: LIFO discharge of 500 t with two layers', () => {
  let layers: Layer[];

  beforeEach(() => {
    layers = [
      { id: 'L1', hold_id: 'H1', cargo_lot_id: 'LOT-DIANA',
        source_vessel: 'DIANA MARIA', remaining_tons: 1600, load_sequence: 1 },
      { id: 'L2', hold_id: 'H1', cargo_lot_id: 'LOT-VELES',
        source_vessel: 'VELES',       remaining_tons: 1200, load_sequence: 2 },
    ];
  });

  it('writes off 500 t from VELES only', () => {
    const allocs = dischargeFromHold('OP-1', 'H1', 500, layers);

    expect(allocs).toHaveLength(1);
    expect(allocs[0]).toMatchObject({
      source_vessel: 'VELES',
      discharged_tons: 500,
    });
    expect(layers.find(l => l.source_vessel === 'VELES')?.remaining_tons).toBeCloseTo(700, 3);
    expect(layers.find(l => l.source_vessel === 'DIANA MARIA')?.remaining_tons).toBe(1600);
  });
});
```

## Regression baseline (TZ Appendix C)

A dedicated `regression-appendix-c.test.ts` keeps the application honest against the original Excel:

```ts
const TOLERANCE = 0.001;

describe('Regression — Appendix C control values', () => {
  const voyage = loadFixture('appendix-c-voyage.json');
  const result = calculateVoyage(voyage);

  it('On Board = 23683.955', () => {
    expect(result.onBoard).toBeCloseTo(23683.955, 3);
  });

  it('Discharged = 2001', () => {
    expect(result.discharged).toBeCloseTo(2001, 3);
  });

  it('Total Empty Space 100% ≈ 16689.390', () => {
    expect(result.totalEmpty100).toBeCloseTo(16689.390454957404, 3);
  });

  it('Total Empty Space 98% = 15881.924', () => {
    expect(result.totalEmpty98).toBeCloseTo(15881.924, 3);
  });
});
```

The `appendix-c-voyage.json` fixture should be reconstructed from the original Excel and committed to `src/calc/__tests__/fixtures/`.

## Ordering / commit hygiene

- Run `npm run test` before any commit that touches `src/calc/**`.
- Add a CI step (when CI is set up) that runs the AT suite and fails the build on red.
- Snapshot tests for exports (AT-06, AT-13) compare workbook → JSON shape, not raw bytes.

## What to do when an AT fails

1. **Do not adjust the test to match the code.** ATs are the spec — the code is the suspect.
2. Re-read the relevant TZ section (linked in the test docstring).
3. If the TZ is genuinely ambiguous, surface it as an open question rather than guessing — TZ §14.2 already lists open questions; new ambiguities go there.

## Common pitfalls

- **`toBe(15881.924)` instead of `toBeCloseTo(15881.924, 3)`.** Floating-point equality fails.
- **Constructing fixtures with rounded inputs.** Rounding is for output only — fixture inputs use the raw Excel values.
- **Skipping AT-09.** Hardcoded `KAVKAZ IV` in a test is the most common regression for this rule.
- **Not asserting `discharge_allocations`.** AT-07/08 must verify the allocation rows, not just `remaining_tons`.

## Adding a scenario and its autotest

`AT-01..AT-13` are the customer-facing acceptance criteria (TZ §12, table above). `S-1..S-19` are a separate, product-facing numbering — user scenarios in `Requirements/scenarios.md` (vault, not this repo) — each with its own automation-level field. Adding one:

1. **Read the scenario's own `Уровень автоматизации` field** in `Requirements/scenarios.md` — it names the level (`calc`, `service+SQLite`, `UI-компонент`, `e2e`) and the reason. Don't guess a level from the scenario's prose; the field is authoritative.
2. **File it per that level's convention:**
   - `calc` → `src/calc/__tests__/<name>.test.ts`.
   - `service+SQLite` → `src/services/__tests__/<service>.test.ts`, test name prefixed `S-N: ...`.
   - `UI-компонент` → `src/components/__tests__/<Component>.test.tsx`, same `S-N:` prefix, `openTestDb()` + `@testing-library/react`.
   - `e2e` → `e2e/specs/s-NN-<slug>.spec.ts`, one `test('S-N: ...', ...)` per scenario, using `e2e/fixtures.ts`'s `test.extend` (`host`/`db`/`login`).
3. **Seed via the existing helpers**, don't hand-roll: `openTestDb`/`seedReferenceData` (service/UI levels), `e2e/seeds.ts` (e2e level) — add a new `seedX` there if the scenario needs a precondition no existing seed produces.
4. **Add a row to `docs/testing/scenario-traceability.md`** — `Сценарий | Уровень | Покрывает FR/AT | Статус | Тесты | Пробел/причина`. `частично`/`не покрыт` always carry a reason; a reason like "out of this branch's scope" is legitimate, a missing reason is not.
5. **CI job it enters** (`.github/workflows/ci.yml`): `calc`/`service+SQLite`/`UI-компонент` all run inside `npm run test:unit` in job `web`; `e2e` runs inside `npm run test:e2e`, same job. Nothing scenario-specific runs in `rust`/`windows-smoke` unless the scenario is Windows-capability-specific (hypothesis 10 style) — those go in `e2e-smoke/specs/`, not here.
