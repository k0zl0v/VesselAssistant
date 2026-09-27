/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddLotDialog } from '../AddLotDialog';
import { __resetForTests, setLang } from '../../i18n';
import { ru } from '../../i18n/ru';
import { CalculationService } from '../../services/CalculationService';
import { CargoLotService } from '../../services/CargoLotService';
import { AppError } from '../../services/errors';
import { ReferenceService } from '../../services/ReferenceService';
import { VoyageService } from '../../services/VoyageService';
import { loadVoyageOverview } from '../../services/VoyageOverview';
import { NOOP_AUTO_BACKUP, openTestDb } from '../../services/__tests__/helpers';
import type { NodeDb } from '../../services/db-node';
import type { AddLotInput } from '../../services/types';

const env = vi.hoisted(() => ({ db: null as unknown, ctx: null as unknown }));
vi.mock('../../db', () => ({ getDb: async () => env.db }));
vi.mock('../../shell/VoyageContext', () => ({ useVoyage: () => env.ctx }));

/** S-2 precondition: TIGHT BARGE, holds of 1000 m³ (SF 1.25 → CapacityTons98 784.000); hold 1 carries lot A 500 t. */
async function seedS2(db: NodeDb) {
  const vesselId = crypto.randomUUID();
  await db.execute(`INSERT INTO vessels (id, name) VALUES (?, 'TIGHT BARGE')`, [vesselId]);
  for (const name of ['SFM', 'WHEAT']) {
    await db.execute(`INSERT INTO cargoes (id, name) VALUES (?, ?)`, [crypto.randomUUID(), name]);
  }
  const holdIds: string[] = [];
  for (const holdNo of [1, 2]) {
    const id = crypto.randomUUID();
    holdIds.push(id);
    await db.execute(`INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, 1000)`, [id, vesselId, holdNo]);
  }
  const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({ vessel_id: vesselId, voyage_no: 'VY-AT05' });
  const ref = new ReferenceService(db);
  const cargoes = await ref.listCargoes();
  await new CargoLotService(db).add({
    voyage_id: voyage.id,
    hold_id: holdIds[0]!,
    cargo_id: cargoes.find((c) => c.name === 'SFM')!.id,
    source_vessel: 'A',
    sf: 1.25,
    planned_tons: 500,
    loaded_tons: 500,
  });
  const [vessel] = await ref.listVessels();
  return { voyage, vessel: vessel!, holdIds, cargoes };
}

describe('AddLotDialog', () => {
  let db: NodeDb;
  let seed: Awaited<ReturnType<typeof seedS2>>;
  let refresh: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;
  let add: MockInstance<CargoLotService['add']>;

  beforeEach(async () => {
    db = await openTestDb();
    seed = await seedS2(db);
    refresh = vi.fn(async () => undefined);
    onClose = vi.fn();
    add = vi.spyOn(CargoLotService.prototype, 'add');
    setLang('ru');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetForTests();
    db.close();
  });

  async function mount(initialHoldId?: string) {
    env.db = db;
    env.ctx = {
      data: {
        voyage: seed.voyage,
        vessel: seed.vessel,
        calc: await new CalculationService(db).calculate(seed.voyage.id),
        overview: await loadVoyageOverview(db, seed.voyage.id),
      },
      cargoes: seed.cargoes,
      isOpen: true,
      refresh,
    };
    render(<AddLotDialog initialHoldId={initialHoldId} onClose={onClose} />);
    // Layers load asynchronously; the subtitle gains the layer number once they are in.
    await screen.findByText(/номер/);
  }

  async function enterLot(source: string, tons: string, cargo = 'SFM') {
    const user = userEvent.setup();
    await user.click(screen.getByTestId(`lot-cargo-${cargo}`));
    await user.type(screen.getByTestId('lot-source-vessel'), source);
    await user.clear(screen.getByTestId('lot-sf'));
    await user.type(screen.getByTestId('lot-sf'), '1.25');
    await user.type(screen.getByTestId('lot-tons'), tons);
    return user;
  }

  const lotsIn = (holdId: string) =>
    db.select<{ source_vessel: string; loaded_tons: number }>(
      `SELECT source_vessel, loaded_tons FROM cargo_lots WHERE hold_id = ? ORDER BY load_sequence`,
      [holdId],
    );
  const text = (id: string) => screen.getByTestId(id).textContent;

  it('names the hold and the next layer, offers used source vessels, notes the fixed hold SF', async () => {
    await mount(seed.holdIds[0]);
    expect(screen.getByRole('heading').textContent).toBe('Добавить партию в трюм №1');
    expect(text('lot-subtitle')).toBe('Рейс VY-AT05 · TIGHT BARGE · слой будет положен сверху, номер 2');
    expect(screen.queryByTestId('lot-hold')).toBeNull();
    expect(text('lot-hold-sf-note')).toContain('1.250');
    await userEvent.setup().click(screen.getByTestId('lot-source-chip-A'));
    expect(screen.getByTestId<HTMLInputElement>('lot-source-vessel').value).toBe('A');
  });

  it('S-2: 285 t over lot A → inline overload panel with all numbers, submit blocked; Cancel → nothing saved', async () => {
    await mount();
    const user = await enterLot('B', '285');

    const panel = screen.getByTestId('lot-overload-panel');
    // scenarios.md S-2 names the hold, the capacity and the overshoot: «трюм 1, вместимость 784.000 т, превышение 1.000 т».
    expect(panel.textContent).toContain('№1');
    expect(text('lot-check-capacity')).toBe('784.000');
    expect(text('lot-check-current')).toBe('500.000');
    expect(text('lot-check-free')).toBe('284.000');
    expect(text('lot-check-adding')).toBe('285.000');
    expect(text('lot-check-projected')).toBe('785.000');
    expect(within(panel).getByTestId('lot-overload-overshoot').textContent).toBe('1.000');
    const submit = screen.getByTestId<HTMLButtonElement>('lot-submit');
    expect(submit.disabled).toBe(true);
    expect(submit.className).toContain('btn-danger');
    expect(submit.textContent).toBe(ru['addlot.submit_over']);

    await user.click(screen.getByTestId('lot-cancel'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(add).not.toHaveBeenCalled();
    expect(await lotsIn(seed.holdIds[0]!)).toEqual([{ source_vessel: 'A', loaded_tons: 500 }]);
    expect(screen.queryByTestId('lot-error')).toBeNull();
  });

  it('S-2: acknowledge → submitted once with acknowledge_overload: true, lot B saved on top, voyage refreshed', async () => {
    await mount(seed.holdIds[0]);
    const user = await enterLot('B', '285');
    await user.click(screen.getByTestId('lot-overload-ack'));
    await user.click(screen.getByTestId('lot-submit'));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(add).toHaveBeenCalledOnce();
    expect(add.mock.calls[0]![0].acknowledge_overload).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
    expect(await lotsIn(seed.holdIds[0]!)).toEqual([
      { source_vessel: 'A', loaded_tons: 500 },
      { source_vessel: 'B', loaded_tons: 285 },
    ]);
  });

  it('S-2 boundary: 784 t into an empty hold → within capacity, saved without acknowledgement', async () => {
    await mount();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('lot-hold-2'));
    expect(screen.getByRole('heading').textContent).toBe('Добавить партию в трюм №2');
    await enterLot('C', '784');

    expect(screen.queryByTestId('lot-overload-panel')).toBeNull();
    expect(screen.getByTestId('lot-ok-panel').textContent).toContain('0.000');
    await user.click(screen.getByTestId('lot-submit'));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const input = add.mock.calls[0]![0] as AddLotInput;
    expect(input.acknowledge_overload).toBeUndefined();
    expect(input.planned_tons).toBe(784);
    expect(await lotsIn(seed.holdIds[1]!)).toEqual([{ source_vessel: 'C', loaded_tons: 784 }]);
  });

  it('FR-19: WHEAT offers exactly the protein grades 10.5 / 11.5 / 12.5 / 13.5, SFM none', async () => {
    await mount(seed.holdIds[1]);
    expect(screen.queryByTestId('lot-protein')).toBeNull();
    const user = await enterLot('D', '100', 'WHEAT');

    const grades = within(screen.getByTestId('lot-protein')).getAllByRole('button').map((b) => b.textContent);
    expect(grades).toEqual(['10.5 %', '11.5 %', '12.5 %', '13.5 %']);
    await user.click(screen.getByTestId('lot-protein-12.5'));
    await user.click(screen.getByTestId('lot-submit'));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(await db.select(`SELECT protein_percent FROM cargo_lots WHERE source_vessel = 'D'`)).toEqual([
      { protein_percent: 12.5 },
    ]);
  });

  it('SF ≤ 0 → message under the SF field, no capacity figure, the service is not called', async () => {
    await mount(seed.holdIds[1]);
    const user = await enterLot('E', '10');
    await user.clear(screen.getByTestId('lot-sf'));
    await user.type(screen.getByTestId('lot-sf'), '0');

    expect(text('lot-sf-error')).toBe(ru['addlot.error.sf']);
    expect(text('lot-check-capacity')).toBe('—');
    await user.click(screen.getByTestId('lot-submit'));
    expect(add).not.toHaveBeenCalled();
  });

  it('a service rejection is shown via describeError in the interface language', async () => {
    add.mockRejectedValue(new AppError('voyage.closed', { voyage_no: 'VY-AT05' }));
    await mount(seed.holdIds[1]);
    const user = await enterLot('F', '10');
    await user.click(screen.getByTestId('lot-submit'));

    expect((await screen.findByTestId('lot-error')).textContent).toBe(
      ru['error.voyage.closed'].replace('{voyage_no}', 'VY-AT05'),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fallback: a service OVERLOAD the live check missed opens the same panel; the acknowledged resubmit error goes via describeError', async () => {
    const overload = `OVERLOAD:${JSON.stringify({ capacity_tons: 784, projected_remain_tons: 785, overshoot_tons: 1, overloads: true, hold_id: 'h' })}`;
    add
      .mockRejectedValueOnce(new Error(overload))
      .mockRejectedValueOnce(new AppError('voyage.closed', { voyage_no: 'VY-AT05' }));
    await mount(seed.holdIds[1]);
    const user = await enterLot('G', '10');
    await user.click(screen.getByTestId('lot-submit'));

    const panel = await screen.findByTestId('lot-overload-panel');
    expect(within(panel).getByTestId('lot-overload-overshoot').textContent).toBe('1.000');
    expect(text('lot-check-capacity')).toBe('784.000');
    expect(screen.getByTestId('add-lot-dialog').textContent).not.toContain('OVERLOAD');
    expect(screen.getByTestId<HTMLButtonElement>('lot-submit').disabled).toBe(true);

    await user.click(screen.getByTestId('lot-overload-ack'));
    await user.click(screen.getByTestId('lot-submit'));

    expect((await screen.findByTestId('lot-error')).textContent).toBe(
      ru['error.voyage.closed'].replace('{voyage_no}', 'VY-AT05'),
    );
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[1]![0].acknowledge_overload).toBe(true);
  });
});
