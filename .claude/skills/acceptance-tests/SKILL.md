---
name: acceptance-tests
description: Use when adding or modifying tests, when working on CalculationEngine / OgvService / CargoLayerService / SofService, or before committing changes that affect calculation outputs. Maps the 13 acceptance scenarios from TZ §12 into Vitest tests and uses Appendix C control values as a regression baseline.
---

# Acceptance tests — AT-01 to AT-13

The acceptance criteria from TZ §12 must be encoded as automated tests. They are the contract between the customer's expectations (Excel parity) and the application. Any failing AT-test blocks release.

**Tolerance for numeric comparisons: 0.001** (TZ AT-01).

## Scenario table

| ID | Scenario | Expected outcome (assertion) |
|---|---|---|
| AT-01 | Voyage with arbitrary main vessel name, 5 holds, per-hold SF, FillPercent=0.98 | `EmptySpace98[h]`, `RemainHold[h]`, `EmptyVolumePercent[h]` match Excel control with delta ≤ 0.001 |
| AT-02 | Discharge 1177 t from hold 3 and 824 t from hold 5 via OGV | Load Plan auto-updates `Discharged` and `Remain` for those holds |
| AT-03 | Crane coefficient + scale weight | `CorrectedWeight = ScaleWeight / coefficient`, rounded per setting |
| AT-04 | SOF events with `24:00` continuing next day | Chronology preserved; export renders dates correctly |
| AT-05 | Try to load hold beyond 98% capacity | Warning/block per configuration |
| AT-06 | Export Load Plan, OGV, SOF | Files open, contain totals, printable/signable |
| AT-07 | Hold loaded: DIANA MARIA 1600 t, then VELES 1200 t. Discharge 500 t | VELES = 700 t, DIANA MARIA = 1600 t |
| AT-08 | Same hold, next discharge 900 t | VELES = 0 t, DIANA MARIA = 1400 t |
| AT-09 | Voyage with main vessel name ≠ `KAVKAZ IV` | All screens, calculations, exports use the entered name |
| AT-10 | Wheat lot with protein 10.5 / 11.5 / 12.5 / 13.5 | Selected protein persists on lot, appears in documents |
| AT-11 | Different SF per hold for the same cargo | `EmptySpace98` computed per-hold SF, no global SF used |
| AT-12 | OGV operation drawn from main-vessel cargo | OGV shows available remainders; main Load Plan recalculated after operation |
| AT-13 | XLSX/PDF export | Every numeric calculation cell shows 3 decimals |

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
