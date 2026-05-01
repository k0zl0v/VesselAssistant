---
name: shipping-calculations
description: Use when working on the CalculationEngine, computing empty space / hold remainders / cargo lot remainders, applying Stowage Factor (SF), protein percentage, FillPercent, LIFO discharge of cargo layers, or rounding rules. Triggers on edits to src/calc/**, files named CalculationEngine*, CargoLayerService*, OgvService*, or any function computing tonnage/volume/empty space.
---

# Shipping calculations — domain rules

This skill encodes the calculation rules from `TZ_shipping_calculations_offline_v3.md` (sections 5, 5.1, 5.3, Appendix A, Appendix B, Appendix C). When you write or modify calculation code, use these as the authoritative reference.

## Hard invariants

1. **Round to 3 decimals only at display/export boundaries.** Never round intermediate values.
2. **FillPercent is `0.98` for MVP.** A `fillPercent` parameter must exist in the data model but the UI exposes only 0.98.
3. **SF is keyed by `(hold, cargo, vessel/lot)` — not globally by cargo.** Always look up SF from `hold_cargo_parameters` or the `cargo_lots.sf` field for that specific row.
4. **No division by zero on SF.** Validate `sf > 0` before any capacity formula.
5. **`RemainHold[h] >= 0`** is required — if violated, surface as a discrepancy error (do not silently clamp).
6. **`TotalEmpty` sums only positive `EmptySpace[h]`** — negative values do not increase capacity.

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

## Regression baseline (TZ Appendix C)

The original Excel file `Kavkaz IV_ Load St Plan+SOF.xlsx` produces:

| Metric | Value |
|---|---:|
| On Board | 23683.955 |
| Discharged | 2001 |
| Total Empty Space 100% | 16689.390454957404 |
| Total Empty Space 98% | 15881.924 (after rounding to 3 decimals) |
| FillPercent | 0.98 |

Tolerance for regression tests: **0.001**.

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
