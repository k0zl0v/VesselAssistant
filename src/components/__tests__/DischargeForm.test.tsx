/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DischargeForm } from '../DischargeForm';
import { KAVKAZ_IV_HOLDS } from '../../fixtures/kavkaz-iv';
import { __resetForTests, setLang } from '../../i18n';
import { ru } from '../../i18n/ru';
import { CalculationService } from '../../services/CalculationService';
import { CargoLotService } from '../../services/CargoLotService';
import { OgvService } from '../../services/OgvService';
import { OgvVesselService, type OgvHoldView } from '../../services/OgvVesselService';
import type { Crane } from '../../services/ReferenceService';
import { VoyageService } from '../../services/VoyageService';
import { loadVoyageOverview } from '../../services/VoyageOverview';
import { NOOP_AUTO_BACKUP, openTestDb } from '../../services/__tests__/helpers';
import type { NodeDb } from '../../services/db-node';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-/i;

interface Seeded {
  voyageId: string;
  holdIdByNo: Map<number, string>;
  cargoIds: Record<'SFM' | 'WHEAT', string>;
}

/** End of S-3: NORD STAR, holds 1–5 from Appendix C, one lot per hold, nothing discharged. */
async function seedEndOfS3(db: NodeDb): Promise<Seeded> {
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
  return { voyageId: voyage.id, holdIdByNo, cargoIds };
}

async function renderForm(
  db: NodeDb,
  voyageId: string,
  initialHoldId: string,
  handlers: { onDischarged?: () => Promise<void>; onClose?: () => void } = {},
  extra: { cranes?: Crane[]; ogvHolds?: OgvHoldView[] } = {},
): Promise<void> {
  const calc = await new CalculationService(db).calculate(voyageId);
  const overview = await loadVoyageOverview(db, voyageId);
  const cargoNames = Object.fromEntries(Object.entries(overview.holds).map(([id, s]) => [id, s.cargo_names]));
  render(
    <DischargeForm
      db={db}
      voyage_id={voyageId}
      holds={calc.holds}
      cargoNames={cargoNames}
      initialHoldId={initialHoldId}
      cranes={extra.cranes}
      ogvHolds={extra.ogvHolds}
      onDischarged={handlers.onDischarged ?? (async () => {})}
      onClose={handlers.onClose ?? (() => {})}
    />,
  );
  await screen.findByText(/Доступно в трюме/);
}

const layersOf = (db: NodeDb, holdId: string) =>
  db.select<{ load_sequence: number; remaining_tons: number }>(
    `SELECT load_sequence, remaining_tons FROM cargo_layers WHERE hold_id = ? ORDER BY load_sequence`,
    [holdId],
  );

const insufficient = (holdNo: string, short: string): string =>
  ru['error.ogv.insufficient_cargo'].replace('{hold_no}', holdNo).replace('{short_tons}', short);

describe('DischargeForm (D6 on the UI: a short hold is reported in the interface language)', () => {
  let db: NodeDb;

  beforeEach(async () => {
    db = await openTestDb();
    setLang('ru');
  });

  afterEach(() => {
    cleanup();
    __resetForTests();
    db.close();
  });

  it('4003 t from hold 3 (4002 t aboard) → inline shortage in Russian, submit disabled, layers unchanged', async () => {
    const { voyageId, holdIdByNo } = await seedEndOfS3(db);
    const holdId = holdIdByNo.get(3)!;
    const user = userEvent.setup();
    await renderForm(db, voyageId, holdId);

    await user.type(screen.getByTestId('discharge-tons'), '4003');

    const shortage = await screen.findByTestId('discharge-shortage');
    expect(shortage.textContent).toContain(insufficient('3', '1.000'));
    expect(shortage.textContent).not.toMatch(UUID);
    expect(shortage.textContent).not.toMatch(/Insufficient|Error/);
    expect(screen.getByTestId('discharge-submit')).toBeDisabled();

    expect(await layersOf(db, holdId)).toEqual([{ load_sequence: 1, remaining_tons: 4002 }]);
    expect(await db.select(`SELECT id FROM operations`)).toEqual([]);
  });

  it('the hold shrinks between preview and submit → the service error in Russian, nothing written', async () => {
    const { voyageId, holdIdByNo } = await seedEndOfS3(db);
    const holdId = holdIdByNo.get(3)!;
    const onClose = vi.fn();
    const user = userEvent.setup();
    await renderForm(db, voyageId, holdId, { onClose });

    await user.type(screen.getByTestId('discharge-tons'), '4002');
    await screen.findByTestId('discharge-preview-row-1');
    // Another operation takes 1 t while the dialog still shows the old stack.
    await new OgvService(db).discharge({ voyage_id: voyageId, hold_id: holdId, tons: 1, event_date: '2026-09-27' });
    await user.click(screen.getByTestId('discharge-submit'));

    const error = await screen.findByTestId('discharge-error');
    expect(error.textContent).toBe(insufficient('3', '1.000'));
    expect(error.textContent).not.toMatch(UUID);
    expect(onClose).not.toHaveBeenCalled();
    expect(await layersOf(db, holdId)).toEqual([{ load_sequence: 1, remaining_tons: 4001 }]);
    expect(await db.select(`SELECT id FROM operations`)).toHaveLength(1);
  });

  it('previews LIFO top-down as a dry run, then writes exactly that on submit', async () => {
    const { voyageId, holdIdByNo, cargoIds } = await seedEndOfS3(db);
    const holdId = holdIdByNo.get(3)!;
    const lots = new CargoLotService(db);
    for (const [vessel, tons] of [['VLADIMIR', 300], ['YEKATERINA', 23]] as const) {
      await lots.add({
        voyage_id: voyageId, hold_id: holdId, cargo_id: cargoIds.SFM, source_vessel: vessel,
        sf: 1.44, planned_tons: tons, loaded_tons: tons, protein_percent: null,
      });
    }
    const onDischarged = vi.fn(async () => {});
    const onClose = vi.fn();
    const user = userEvent.setup();
    await renderForm(db, voyageId, holdId, { onDischarged, onClose });

    expect(screen.getByTestId('discharge-available').textContent).toBe('Доступно в трюме: 4\u202f325.000 т в 3 слоях');
    await user.type(screen.getByTestId('discharge-tons'), '500');

    const top = await screen.findByTestId('discharge-preview-row-3');
    expect(top.textContent).toContain('YEKATERINA');
    expect(top.textContent).toContain('−23.000');
    expect(top.textContent).toContain(ru['discharge.layer.closed']);
    expect(screen.getByTestId('discharge-preview-row-2').textContent).toContain('−300.000');
    const bottom = screen.getByTestId('discharge-preview-row-1');
    expect(bottom.textContent).toContain('−177.000');
    expect(bottom.textContent).toContain('3\u202f825.000');
    expect(screen.getByTestId('discharge-preview').textContent).toContain('сверху вниз · 3 слоя затронуто');
    expect(screen.getByTestId('discharge-after-layers').textContent).toContain('1');

    // The preview wrote nothing.
    expect((await layersOf(db, holdId)).map((l) => l.remaining_tons)).toEqual([4002, 300, 23]);

    await user.click(screen.getByTestId('discharge-submit'));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onDischarged).toHaveBeenCalledOnce();
    expect((await layersOf(db, holdId)).map((l) => l.remaining_tons)).toEqual([3825, 0, 0]);
  });

  describe('crane and OGV hold', () => {
    async function withCraneAndOgv(voyageId: string): Promise<{ cranes: Crane[]; ogvHolds: OgvHoldView[] }> {
      const cranes: Crane[] = [
        { id: crypto.randomUUID(), name: 'CRANE # 1', notes: null },
        { id: crypto.randomUUID(), name: 'CRANE # 2', notes: null },
      ];
      for (const c of cranes) await db.execute(`INSERT INTO cranes (id, name) VALUES (?, ?)`, [c.id, c.name]);
      await db.execute(
        `INSERT INTO crane_working_coefficients (id, crane_id, mode, coefficient, valid_from) VALUES (?, ?, 'from_own', 1.06, '2026-01-01')`,
        [crypto.randomUUID(), cranes[0]!.id],
      );
      const ogv = new OgvVesselService(db);
      await ogv.create({
        voyage_id: voyageId,
        name: 'AAI PRELUDE',
        holds: [{ hold_no: 2, planned_tons: 10869 }, { hold_no: 5, planned_tons: 8324 }],
      });
      return { cranes, ogvHolds: (await ogv.summary(voyageId))!.holds };
    }

    it('1177 t by scale with crane 1 (k 1.060) → corrected 1 110.377 live; LIFO and remains take the scale weight', async () => {
      const { voyageId, holdIdByNo } = await seedEndOfS3(db);
      const holdId = holdIdByNo.get(3)!;
      const extra = await withCraneAndOgv(voyageId);
      const onClose = vi.fn();
      const user = userEvent.setup();
      await renderForm(db, voyageId, holdId, { onClose }, extra);

      // Default target: the OGV hold with the most left to load (№2).
      expect((screen.getByTestId('discharge-ogv-hold') as HTMLSelectElement).selectedOptions[0]!.textContent).toBe(
        '№2 · осталось 10\u202f869.000',
      );
      await user.type(screen.getByTestId('discharge-tons'), '1177');
      await waitFor(() => expect(screen.getByTestId('discharge-coef')).toHaveProperty('value', '1.060'));
      expect(screen.getByTestId('discharge-corrected').textContent).toBe('1\u202f110.377т');
      expect(screen.getByTestId('discharge-crane').textContent).toContain('1\u202f177.000');
      expect(screen.getByTestId('discharge-after-remain').textContent).toContain('2\u202f825.000');
      expect(screen.getByTestId('discharge-after-ogv-hold').textContent).toContain('1\u202f177.000');
      expect(screen.getByTestId('discharge-after-ogv-hold').textContent).toContain('осталось 9\u202f692.000');

      await user.click(screen.getByTestId('discharge-submit'));
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
      expect(await layersOf(db, holdId)).toEqual([{ load_sequence: 1, remaining_tons: 2825 }]);
      const [shift] = await db.select<{ scale_tons: number; coefficient: number; corrected_tons: number }>(
        `SELECT scale_tons, coefficient, corrected_tons FROM crane_shift_records`,
      );
      expect(shift!.scale_tons).toBe(1177);
      expect(shift!.coefficient).toBe(1.06);
      expect(Math.round(shift!.corrected_tons * 1000) / 1000).toBe(1110.377);
      const receipts = await db.select<{ tons: number; hold_no: number }>(
        `SELECT r.tons, h.hold_no FROM ogv_receipts r JOIN ogv_holds h ON h.id = r.ogv_hold_id`,
      );
      expect(receipts).toEqual([{ tons: 1177, hold_no: 2 }]);
    });

    it('no working coefficient for the mode → the reason in Russian, submit blocked until «Без крана»', async () => {
      const { voyageId, holdIdByNo } = await seedEndOfS3(db);
      const extra = await withCraneAndOgv(voyageId);
      const user = userEvent.setup();
      await renderForm(db, voyageId, holdIdByNo.get(5)!, {}, extra);

      await user.type(screen.getByTestId('discharge-tons'), '824');
      await user.selectOptions(screen.getByTestId('discharge-crane-select'), extra.cranes[1]!.id);
      const error = await screen.findByTestId('discharge-crane-error');
      expect(error.textContent).toContain('нет рабочего коэффициента');
      expect(error.textContent).not.toMatch(UUID);
      expect(screen.getByTestId('discharge-submit')).toBeDisabled();

      await user.selectOptions(screen.getByTestId('discharge-crane-select'), '');
      expect(screen.getByTestId('discharge-submit')).toBeEnabled();
      expect(screen.queryByTestId('discharge-corrected')).toBeNull();
    });
  });
});
