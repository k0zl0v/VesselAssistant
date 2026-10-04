/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { HoldTable } from '../HoldTable';
import { KAVKAZ_IV_HOLDS } from '../../fixtures/kavkaz-iv';
import { CalculationService } from '../../services/CalculationService';
import { CargoLotService } from '../../services/CargoLotService';
import { VoyageService } from '../../services/VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb } from '../../services/__tests__/helpers';
import type { NodeDb } from '../../services/db-node';
import type { VoyageHoldCalc } from '../../services/CalculationService';

/**
 * `remain_tons < 0` cannot occur through the real service layer (FR-17's guard
 * blocks a discharge past what's loaded) — only a component-level test can
 * construct it directly, bypassing the service layer, to verify FR-08.
 */
const makeHoldCalc = (overrides: Partial<VoyageHoldCalc>): VoyageHoldCalc => ({
  hold_id: crypto.randomUUID(),
  hold_no: 1,
  volume_m3: 5000,
  sf: 1.2,
  fill_percent: 0.98,
  loaded_tons: 100,
  discharged_tons: 0,
  remain_tons: 100,
  used_volume_m3: 0,
  capacity_tons_100: 4000,
  capacity_tons_98: 3920,
  empty_space_100: 3900,
  empty_space_98: 3820,
  empty_volume_percent: 95,
  filled_volume_percent: 5,
  free_volume_m3: 5000,
  ...overrides,
});

/** End of S-3 (NORD STAR, holds 1–5, one lot each) plus hold 6 with no lot, hence no SF. */
async function seedEndOfS3WithHoldWithoutSf(db: NodeDb): Promise<string> {
  const vesselId = crypto.randomUUID();
  await db.execute(`INSERT INTO vessels (id, name) VALUES (?, 'NORD STAR')`, [vesselId]);
  const cargoIds = { SFM: crypto.randomUUID(), WHEAT: crypto.randomUUID() };
  for (const [name, id] of Object.entries(cargoIds)) {
    await db.execute(`INSERT INTO cargoes (id, name) VALUES (?, ?)`, [id, name]);
  }
  const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({ vessel_id: vesselId, voyage_no: 'NS-01' });
  for (const h of KAVKAZ_IV_HOLDS) {
    const holdId = crypto.randomUUID();
    await db.execute(`INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, ?)`, [
      holdId, vesselId, h.hold_no, h.volume_m3,
    ]);
    await new CargoLotService(db).add({
      voyage_id: voyage.id,
      hold_id: holdId,
      cargo_id: cargoIds[h.cargo],
      source_vessel: `BARGE ${h.hold_no}`,
      sf: h.sf,
      planned_tons: h.loaded_tons,
      loaded_tons: h.loaded_tons,
      protein_percent: h.cargo === 'WHEAT' ? 12.5 : null,
    });
  }
  await db.execute(`INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, 6, 5000)`, [
    crypto.randomUUID(), vesselId,
  ]);
  return voyage.id;
}

describe('HoldTable (S-3: free space per hold for the next barge)', () => {
  let db: NodeDb;

  beforeEach(async () => {
    db = await openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  async function mount() {
    const voyageId = await seedEndOfS3WithHoldWithoutSf(db);
    const calc = await new CalculationService(db).calculate(voyageId);
    render(
      <HoldTable holds={calc.holds} totals={calc.totals} summaries={{}} />,
    );
  }

  const cell = (holdNo: number, name: string): string =>
    within(screen.getByTestId(`hold-row-${holdNo}`)).getByTestId(name).textContent ?? '';

  it('EmptySpace98 for holds 1–5 equals the S-3 values in 0.000 format, thousands grouped with U+202F', async () => {
    await mount();
    expect([1, 2, 3, 4, 5].map((n) => cell(n, 'hold-empty-98'))).toEqual([
      '2\u202F955.285', '1\u202F869.540', '3\u202F313.836', '2\u202F577.540', '3\u202F164.723',
    ]);
    expect([1, 2, 3, 4, 5].map((n) => cell(n, 'hold-remain'))).toEqual([
      '4\u202F082.000', '7\u202F073.000', '4\u202F002.000', '6\u202F365.000', '4\u202F162.955',
    ]);
    expect(cell(2, 'hold-sf')).toBe('1.226');
  });

  it('a hold with no SF is marked with the "SF not set" error and gets no capacity or empty space (rendered as "—", excluded from totals)', async () => {
    await mount();
    expect(cell(6, 'hold-sf')).toBe('SF not set');
    expect(cell(6, 'hold-sf-error')).toBe('SF not set');
    expect(screen.getByTestId('hold-sf-error').className).toContain('sf-missing');
    expect(cell(6, 'hold-capacity-98')).toBe('—');
    expect(cell(6, 'hold-empty-98')).toBe('—');
    expect(cell(6, 'hold-remain')).toBe('0.000');
  });

  it('FR-08: a negative RemainHold[h] is highlighted with the "negative" class on the remainder cell itself; a non-negative one is not', () => {
    render(
      <HoldTable
        holds={[
          makeHoldCalc({ hold_no: 1, remain_tons: -50 }),
          makeHoldCalc({ hold_no: 2, remain_tons: 100 }),
        ]}
        totals={{ on_board: 50, total_loaded: 200, total_discharged: 0, total_empty_100: 0, total_empty_98: 0 }}
        summaries={{}}
      />,
    );
    expect(cell(1, 'hold-remain')).toBe('\u2212' + '50.000');
    expect(within(screen.getByTestId('hold-row-1')).getByTestId('hold-remain').className).toContain('negative');
    expect(cell(2, 'hold-remain')).toBe('100.000');
    expect(within(screen.getByTestId('hold-row-2')).getByTestId('hold-remain').className).not.toContain('negative');
  });
});
