import { beforeEach, describe, expect, it } from 'vitest';
import { dischargeFromHold } from '../discharge';
import type { Layer } from '../types';

const makeLayer = (overrides: Partial<Layer>): Layer => ({
  id: 'L?',
  hold_id: 'H1',
  cargo_lot_id: 'LOT?',
  voyage_id: 'V1',
  source_vessel: 'X',
  loaded_tons: 0,
  remaining_tons: 0,
  load_sequence: 0,
  layer_status: 'active',
  ...overrides,
});

describe('AT-07 / AT-08: LIFO discharge from a hold', () => {
  let layers: Layer[];

  beforeEach(() => {
    layers = [
      makeLayer({
        id: 'L1',
        cargo_lot_id: 'LOT-DIANA',
        source_vessel: 'DIANA MARIA',
        loaded_tons: 1600,
        remaining_tons: 1600,
        load_sequence: 1,
      }),
      makeLayer({
        id: 'L2',
        cargo_lot_id: 'LOT-VELES',
        source_vessel: 'VELES',
        loaded_tons: 1200,
        remaining_tons: 1200,
        load_sequence: 2,
      }),
    ];
  });

  it('AT-07: discharging 500 t writes off only from VELES (top layer)', () => {
    const allocs = dischargeFromHold('OP-1', 'H1', 500, layers);

    expect(allocs).toHaveLength(1);
    expect(allocs[0]).toMatchObject({
      source_vessel: 'VELES',
      cargo_lot_id: 'LOT-VELES',
      discharged_tons: 500,
    });

    const veles = layers.find((l) => l.source_vessel === 'VELES')!;
    const diana = layers.find((l) => l.source_vessel === 'DIANA MARIA')!;
    expect(veles.remaining_tons).toBeCloseTo(700, 3);
    expect(diana.remaining_tons).toBe(1600);
  });

  it('AT-08: subsequent 900 t discharge spans VELES and DIANA MARIA', () => {
    dischargeFromHold('OP-1', 'H1', 500, layers);
    const allocs = dischargeFromHold('OP-2', 'H1', 900, layers);

    expect(allocs).toHaveLength(2);
    const fromVeles = allocs.find((a) => a.source_vessel === 'VELES')!;
    const fromDiana = allocs.find((a) => a.source_vessel === 'DIANA MARIA')!;
    expect(fromVeles.discharged_tons).toBeCloseTo(700, 3);
    expect(fromDiana.discharged_tons).toBeCloseTo(200, 3);

    const veles = layers.find((l) => l.source_vessel === 'VELES')!;
    const diana = layers.find((l) => l.source_vessel === 'DIANA MARIA')!;
    expect(veles.remaining_tons).toBe(0);
    expect(veles.layer_status).toBe('depleted');
    expect(diana.remaining_tons).toBeCloseTo(1400, 3);
    expect(diana.layer_status).toBe('active');
  });
});

describe('dischargeFromHold validation', () => {
  it('rejects non-positive quantity', () => {
    expect(() => dischargeFromHold('OP', 'H1', 0, [])).toThrow(/positive/);
    expect(() => dischargeFromHold('OP', 'H1', -10, [])).toThrow(/positive/);
  });

  it('throws when hold is short of cargo', () => {
    const layers: Layer[] = [
      makeLayer({
        id: 'L1',
        cargo_lot_id: 'LOT',
        source_vessel: 'X',
        loaded_tons: 100,
        remaining_tons: 100,
        load_sequence: 1,
      }),
    ];
    expect(() => dischargeFromHold('OP', 'H1', 200, layers)).toThrow(
      /Insufficient cargo in hold H1/,
    );
  });

  it('ignores layers from other holds', () => {
    const layers: Layer[] = [
      makeLayer({
        id: 'L1',
        hold_id: 'H1',
        loaded_tons: 100,
        remaining_tons: 100,
        load_sequence: 1,
      }),
      makeLayer({
        id: 'L2',
        hold_id: 'H2',
        loaded_tons: 500,
        remaining_tons: 500,
        load_sequence: 1,
      }),
    ];
    const allocs = dischargeFromHold('OP', 'H1', 50, layers);
    expect(allocs).toHaveLength(1);
    expect(allocs[0].cargo_layer_id).toBe('L1');
  });
});
