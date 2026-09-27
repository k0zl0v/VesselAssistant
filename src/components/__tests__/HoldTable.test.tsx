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
      <HoldTable
        holds={calc.holds}
        voyage_id={voyageId}
        cargoes={[]}
        lotsByHold={{}}
        expandedHoldId={null}
        onToggleExpand={() => undefined}
        onAddLot={async () => undefined}
        onDischarge={async () => undefined}
        busy={false}
        voyageOpen
      />,
    );
  }

  const cell = (holdNo: number, name: string): string =>
    within(screen.getByTestId(`hold-row-${holdNo}`)).getByTestId(name).textContent ?? '';

  it('EmptySpace98 for holds 1–5 equals the S-3 values in 0.000 format', async () => {
    await mount();
    expect([1, 2, 3, 4, 5].map((n) => cell(n, 'hold-empty-98'))).toEqual([
      '2955.285', '1869.540', '3313.836', '2577.540', '3164.723',
    ]);
    expect([1, 2, 3, 4, 5].map((n) => cell(n, 'hold-remain'))).toEqual([
      '4082.000', '7073.000', '4002.000', '6365.000', '4162.955',
    ]);
    expect(cell(2, 'hold-sf')).toBe('1.226');
  });

  it('a hold with no SF gets no capacity or empty space (rendered as "—", excluded from totals)', async () => {
    await mount();
    expect(cell(6, 'hold-sf')).toBe('—');
    expect(cell(6, 'hold-capacity-98')).toBe('—');
    expect(cell(6, 'hold-empty-98')).toBe('—');
    expect(cell(6, 'hold-remain')).toBe('0.000');
  });
});
