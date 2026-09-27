/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DischargeForm } from '../DischargeForm';
import { KAVKAZ_IV_HOLDS } from '../../fixtures/kavkaz-iv';
import { __resetForTests, setLang } from '../../i18n';
import { ru } from '../../i18n/ru';
import { CargoLotService } from '../../services/CargoLotService';
import { OgvService } from '../../services/OgvService';
import { VoyageService } from '../../services/VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb } from '../../services/__tests__/helpers';
import type { NodeDb } from '../../services/db-node';

/** End of S-3: NORD STAR, holds 1–5 from Appendix C, one lot per hold, nothing discharged. */
async function seedEndOfS3(db: NodeDb): Promise<{ voyageId: string; holdIdByNo: Map<number, string> }> {
  const vesselId = crypto.randomUUID();
  await db.execute(`INSERT INTO vessels (id, name) VALUES (?, 'NORD STAR')`, [vesselId]);
  const cargoIds = { SFM: crypto.randomUUID(), WHEAT: crypto.randomUUID() };
  for (const [name, id] of Object.entries(cargoIds)) {
    await db.execute(`INSERT INTO cargoes (id, name) VALUES (?, ?)`, [id, name]);
  }
  const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({ vessel_id: vesselId, voyage_no: 'NS-01' });
  const holdIdByNo = new Map<number, string>();
  for (const h of KAVKAZ_IV_HOLDS) {
    const holdId = crypto.randomUUID();
    holdIdByNo.set(h.hold_no, holdId);
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
  return { voyageId: voyage.id, holdIdByNo };
}

describe('DischargeForm (D6 on the UI: a short hold is reported in the interface language)', () => {
  let db: NodeDb;

  beforeEach(async () => {
    db = await openTestDb();
    setLang('ru');
  });

  afterEach(() => {
    __resetForTests();
    db.close();
  });

  it('4003 t from hold 3 (4002 t aboard) → error.ogv.insufficient_cargo with "3" / "1.000", layers unchanged', async () => {
    const { voyageId, holdIdByNo } = await seedEndOfS3(db);
    const holdId = holdIdByNo.get(3)!;
    const user = userEvent.setup();
    render(
      <DischargeForm
        voyage_id={voyageId}
        hold_id={holdId}
        busy={false}
        onSubmit={async (input) => {
          await new OgvService(db).discharge(input);
        }}
      />,
    );

    await user.type(screen.getByTestId('discharge-tons'), '4003');
    await user.click(screen.getByTestId('discharge-submit'));

    const error = await screen.findByTestId('discharge-error');
    const expected = ru['error.ogv.insufficient_cargo'].replace('{hold_no}', '3').replace('{short_tons}', '1.000');
    expect(error.textContent).toBe(expected);
    expect(error.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(error.textContent).not.toMatch(/Insufficient|Error/);

    const layers = await db.select<{ remaining_tons: number }>(
      `SELECT remaining_tons FROM cargo_layers WHERE hold_id = ?`,
      [holdId],
    );
    expect(layers).toEqual([{ remaining_tons: 4002 }]);
    expect(await db.select(`SELECT id FROM operations`)).toEqual([]);
  });
});
