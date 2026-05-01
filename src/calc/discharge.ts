import type { DischargeAllocation, Layer } from './types';

/**
 * Discharge `qty` tons from `holdId` following the LIFO customs rule:
 * the most recently loaded lot (highest load_sequence) is on top and
 * is written off first. Mutates `layers[].remaining_tons` for the caller.
 *
 * Throws if total available cargo across active layers is less than `qty`.
 */
export function dischargeFromHold(
  operationId: string,
  holdId: string,
  qty: number,
  layers: Layer[],
): DischargeAllocation[] {
  if (qty <= 0) {
    throw new Error(`discharge qty must be positive, got ${qty}`);
  }

  const stack = layers
    .filter((l) => l.hold_id === holdId && l.remaining_tons > 0)
    .sort((a, b) => b.load_sequence - a.load_sequence);

  const allocations: DischargeAllocation[] = [];
  let qtyLeft = qty;

  for (const layer of stack) {
    if (qtyLeft <= 0) break;
    const writeOff = Math.min(layer.remaining_tons, qtyLeft);
    layer.remaining_tons -= writeOff;
    if (layer.remaining_tons === 0) {
      layer.layer_status = 'depleted';
    }
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
    throw new Error(
      `Insufficient cargo in hold ${holdId}: ${qtyLeft} tons short`,
    );
  }

  return allocations;
}
