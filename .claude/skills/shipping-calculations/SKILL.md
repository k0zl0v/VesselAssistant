---
name: shipping-calculations
description: Use when working on the CalculationEngine, computing empty space / hold remainders / cargo lot remainders, applying Stowage Factor (SF), protein percentage, FillPercent, LIFO discharge of cargo layers, or rounding rules. Triggers on edits to src/calc/**, files named CalculationEngine*, CargoLayerService*, OgvService*, or any function computing tonnage/volume/empty space.
---

# Shipping calculations — domain rules

This skill encodes the calculation rules from `TZ_shipping_calculations_offline_v3.md` (sections 5, 5.1, 5.3, Appendix A, Appendix B, Appendix C). When you write or modify calculation code, use these as the authoritative reference.

## Hard invariants

1. **Round to 3 decimals only at display/export boundaries.** Never round intermediate values.
2. **FillPercent is `0.98` for MVP.** A `fillPercent` parameter exists in the data model but UI/services use 0.98 across the board.
3. **SF is keyed by `(hold, cargo, vessel/lot)` — not globally.** Two-tier storage:
   - **Write time (lot-level):** `cargo_lots.sf` = the SF declared when the lot was added.
   - **Calc time (hold-level cache):** `hold_cargo_parameters.sf` = the SF used by `CalculationService.calculate` for capacity. Auto-set from the *first* lot per `(voyage, hold, cargo)`; subsequent lots in the same hold do NOT overwrite.
   - **AT-05 overload guard** (`wouldOverload` in `src/calc/capacity.ts`) uses the *new lot's* SF, not the cached one — what's being recorded right now is what matters.
4. **No division by zero on SF.** `capacityTons` and `wouldOverload` throw on `sf <= 0`. SQL CHECK on `cargo_lots.sf > 0` and `hold_cargo_parameters.sf > 0` is the second line.
5. **`RemainHold[h] >= 0`** is required — if violated, surface as a discrepancy error (do not silently clamp).
6. **`TotalEmpty` sums only positive `EmptySpace[h]`** — negative values do not increase capacity. The per-hold `EmptySpace[h]` itself stays negative for the discrepancy display; only the aggregate clamps.

## Core formulas (from TZ §5)

```ts
// Per-hold loaded / discharged / remaining
LoadedHold[h]      = Σ cargo_lots where hold_id = h → loaded_tons
DischargedHold[h]  = Σ discharge_allocations joined to operations of hold h → discharged_tons
RemainHold[h]      = LoadedHold[h] - DischargedHold[h]

// Per-lot remaining
RemainLot[l]       = LoadedLot[l] - DischargedFromLot[l]   // distributed by LIFO

// Capacity
CapacityTons100[h]      = HoldVolumeM3[h] / SF[h, cargo, vessel]
CapacityTonsAllowed[h]  = HoldVolumeM3[h] * 0.98 / SF[h, cargo, vessel]

// Empty space
EmptySpace100[h]        = CapacityTons100[h]      - RemainHold[h]
EmptySpaceAllowed[h]    = CapacityTonsAllowed[h]  - RemainHold[h]
TotalEmpty98            = Σ max(0, EmptySpaceAllowed[h])

// Volume %
EmptyVolumePercent[h]   = 100 - LoadedVolume[h] / HoldVolumeM3[h] * 100

// Daily total
DailyTotal              = CurrentOnBoard - PreviousOnBoard
                        // OR Σ operations within the day (mode-dependent)

// Crane correction
CorrectedWeight         = ScaleWeight / CraneCoefficient

// Sequence plan
RemainToLoadByHold[h]   = PlannedByHold[h] - ActualLoadedByHold[h]
```

## Rounding helper (single source of truth)

```ts
// src/calc/round.ts
export const roundTo3 = (x: number): number => Math.round(x * 1000) / 1000;
export const formatTons = (x: number): string => roundTo3(x).toFixed(3);
```

Use `roundTo3` only for display/export. Internal calculations stay in `number` (IEEE 754 double — sufficient precision for tons up to ~10^15).

## LIFO discharge algorithm (TZ §5.1)

Inside each hold, lots form a stack. The most recently loaded lot is the **top layer** and is discharged first. Manual selection of which lot to draw from is **forbidden** by the customs rule.

```ts
type Layer = {
  id: string;
  hold_id: string;
  cargo_lot_id: string;
  source_vessel: string;
  remaining_tons: number;
  load_sequence: number;  // higher = later loaded = on top
};

type Allocation = {
  operation_id: string;
  cargo_layer_id: string;
  cargo_lot_id: string;
  hold_id: string;
  source_vessel: string;
  discharged_tons: number;
};

export function dischargeFromHold(
  operationId: string,
  holdId: string,
  dischargeQty: number,
  layers: Layer[],
): Allocation[] {
  if (dischargeQty <= 0) throw new Error('discharge qty must be positive');

  const stack = layers
    .filter(l => l.hold_id === holdId && l.remaining_tons > 0)
    .sort((a, b) => b.load_sequence - a.load_sequence);

  const allocations: Allocation[] = [];
  let qtyLeft = dischargeQty;

  for (const layer of stack) {
    if (qtyLeft <= 0) break;
    const writeOff = Math.min(layer.remaining_tons, qtyLeft);
    layer.remaining_tons -= writeOff;
    allocations.push({
      operation_id: operationId,
      cargo_layer_id: layer.id,
      cargo_lot_id: layer.cargo_lot_id,
      hold_id: holdId,
      source_vessel: layer.source_vessel,
      discharged_tons: writeOff,
    });
    qtyLeft -= writeOff;
  }

  if (qtyLeft > 0) {
    throw new Error(`Insufficient cargo in hold ${holdId}: ${qtyLeft} tons short`);
  }

  return allocations;
}
```

The function mutates `layer.remaining_tons` for the in-memory caller. Persisting layers + allocations is the caller's responsibility (transactional).

## Control example (must pass as a test)

```
Hold X loaded:  DIANA MARIA 1600 t (sequence=1), then VELES 1200 t (sequence=2).
Discharge 500 t  → VELES remaining = 700, DIANA MARIA remaining = 1600.
Discharge 900 t  → VELES remaining = 0,   DIANA MARIA remaining = 1400.
```

## Regression baseline (TZ Appendix C — already wired)

Per-hold values from the actual `Kavkaz IV_  Load St Plan+SOF.xlsx` are encoded in `src/fixtures/kavkaz-iv.ts` (`KAVKAZ_IV_HOLDS` array + `KAVKAZ_IV_TOTALS`). The fixture is used by:
- `src/services/__tests__/calculation.test.ts` — regression assertion against `CalculationService.calculate`.
- `src/services/__tests__/document-engine.test.ts` — XLSX export verification.
- `src/seedDemo.ts` — `Seed demo (KAVKAZ IV)` button in the UI.

Aggregates that must hold within tolerance 0.001:

| Metric | Value |
|---|---:|
| On Board | 23683.955 |
| Total Loaded | 25684.955 |
| Total Discharged | 2001 |
| Total Empty Space 100% | 16689.390454957404 |
| Total Empty Space 98% | 15881.923545858255 (rounds to 15881.924) |
| FillPercent | 0.98 |

⚠ Don't duplicate these numbers in other tests — import from `src/fixtures/kavkaz-iv.ts` and assert via `toBeCloseTo(KAVKAZ_IV_TOTALS.on_board, 3)`.

## AT-05 overload guard

`wouldOverload` in `src/calc/capacity.ts` is the predicate for AT-05 / TZ §8 rule 2. It returns `{ capacity_tons, projected_remain_tons, overshoot_tons, overloads }`. `CargoLotService.add` calls it BEFORE inserting the lot and throws `OVERLOAD:<json>` when overshooting unless `acknowledge_overload: true` is set. The 1e-6 fp tolerance prevents false positives on exact-fit lots.

UI side: `AddLotForm` runs `wouldOverload` live on every input with the lot SF and shows an inline overload panel (capacity 98 %, on board, free, adding, projection, overshoot). Submit stays disabled until the acknowledgement checkbox is ticked, then sends `acknowledge_overload: true`. If the service still throws `OVERLOAD:<json>`, the same panel is filled from the payload — never a raw string, never `window.confirm`.

## Common pitfalls

- **SF taken from `cargoes.default_sf` instead of the per-hold/per-lot row.** Always read from `hold_cargo_parameters` or `cargo_lots.sf`.
- **Rounding intermediate sums.** A sum of three `roundTo3(...)` values diverges from rounding the final sum. Round once at the end.
- **Treating `EmptySpace` < 0 as 0 inside `EmptySpace[h]` itself.** Wrong — keep the negative on the hold (it's a discrepancy signal); only the **total** clamps to 0.
- **Iterating layers in load order instead of reverse.** LIFO requires `DESC` by `load_sequence`.
- **Manual override of which lot is drawn down.** Forbidden by customs rule; if needed, that's a separate operation type with audit-trail reason.

## Required tests

For every pure function in `src/calc/**`, a test in `src/calc/__tests__/` covering:

- Happy path with known control values.
- Boundary: SF = 0 → throws, not NaN.
- Boundary: discharge > sum of layers → throws with hold id and shortage.
- Multi-layer LIFO with the DIANA MARIA / VELES control case.
- Rounding: `roundTo3(0.0005) === 0.001`, `roundTo3(0.0004) === 0` (banker's rounding NOT used — match Excel's `ROUND`).
