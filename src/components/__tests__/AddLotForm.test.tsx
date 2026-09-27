/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddLotForm } from '../AddLotForm';
import { __resetForTests, setLang } from '../../i18n';
import { ru } from '../../i18n/ru';
import { CargoLotService } from '../../services/CargoLotService';
import { AppError } from '../../services/errors';
import { ReferenceService, type Cargo } from '../../services/ReferenceService';
import { VoyageService } from '../../services/VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb } from '../../services/__tests__/helpers';
import type { NodeDb } from '../../services/db-node';
import type { AddLotInput } from '../../services/types';

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
  const cargoes = await new ReferenceService(db).listCargoes();
  const sfm = cargoes.find((c) => c.name === 'SFM')!;
  await new CargoLotService(db).add({
    voyage_id: voyage.id,
    hold_id: holdIds[0]!,
    cargo_id: sfm.id,
    source_vessel: 'A',
    sf: 1.25,
    planned_tons: 500,
    loaded_tons: 500,
  });
  return { voyageId: voyage.id, holdIds, cargoes };
}

describe('AddLotForm', () => {
  let db: NodeDb;
  let seed: Awaited<ReturnType<typeof seedS2>>;
  let submitted: AddLotInput[];

  beforeEach(async () => {
    db = await openTestDb();
    seed = await seedS2(db);
    submitted = [];
    setLang('ru');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetForTests();
    db.close();
  });

  function mount(
    holdId: string,
    hold_no: number,
    cargoes: Cargo[] = seed.cargoes,
    onSubmit?: (i: AddLotInput) => Promise<void>,
  ) {
    render(
      <AddLotForm
        cargoes={cargoes}
        voyage_id={seed.voyageId}
        hold_id={holdId}
        hold_no={hold_no}
        busy={false}
        onSubmit={
          onSubmit ??
          (async (input) => {
            submitted.push(input);
            await new CargoLotService(db).add(input);
          })
        }
      />,
    );
  }

  async function enterLot(source: string, tons: string, cargo = 'SFM') {
    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('lot-cargo'), cargo);
    await user.type(screen.getByTestId('lot-source-vessel'), source);
    await user.clear(screen.getByTestId('lot-sf'));
    await user.type(screen.getByTestId('lot-sf'), '1.25');
    await user.type(screen.getByTestId('lot-tons'), tons);
    await user.click(screen.getByTestId('lot-submit'));
  }

  const lotsIn = (holdId: string) =>
    db.select<{ source_vessel: string; loaded_tons: number }>(
      `SELECT source_vessel, loaded_tons FROM cargo_lots WHERE hold_id = ? ORDER BY load_sequence`,
      [holdId],
    );

  it('S-2: 285 t over lot A → confirm; Cancel → the service is not called again, lot B not saved', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount(seed.holdIds[0]!, 1);
    await enterLot('B', '285');

    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalledWith(
      'Трюм 1, вместимость 784.000 т, превышение 1.000 т. Продолжить?',
    );
    expect(submitted).toHaveLength(1);
    expect(submitted[0]!.acknowledge_overload).toBeUndefined();
    expect(await lotsIn(seed.holdIds[0]!)).toEqual([{ source_vessel: 'A', loaded_tons: 500 }]);
    expect(screen.queryByTestId('lot-error')).toBeNull();
  });

  it('S-2: Confirm → resubmitted with acknowledge_overload: true, lot B saved on top', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount(seed.holdIds[0]!, 1);
    await enterLot('B', '285');

    await vi.waitFor(() => expect(submitted).toHaveLength(2));
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(
      'Трюм 1, вместимость 784.000 т, превышение 1.000 т. Продолжить?',
    );
    expect(submitted[1]!.acknowledge_overload).toBe(true);
    expect(await lotsIn(seed.holdIds[0]!)).toEqual([
      { source_vessel: 'A', loaded_tons: 500 },
      { source_vessel: 'B', loaded_tons: 285 },
    ]);
  });

  it('S-2 boundary: 784 t into an empty hold → saved with no dialog', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    mount(seed.holdIds[1]!, 2);
    await enterLot('C', '784');

    await vi.waitFor(() => expect(submitted).toHaveLength(1));
    expect(confirm).not.toHaveBeenCalled();
    expect(await lotsIn(seed.holdIds[1]!)).toEqual([{ source_vessel: 'C', loaded_tons: 784 }]);
  });

  it('FR-19: WHEAT offers exactly the protein grades 10.5 / 11.5 / 12.5 / 13.5', async () => {
    mount(seed.holdIds[1]!, 2);
    await userEvent.setup().selectOptions(screen.getByTestId('lot-cargo'), 'WHEAT');

    const options = [...screen.getByTestId<HTMLSelectElement>('lot-protein').options].map((o) => o.value);
    expect(options).toEqual(['', '10.5', '11.5', '12.5', '13.5']);
  });

  it('a service rejection is shown via describeError in the interface language', async () => {
    mount(seed.holdIds[1]!, 2, seed.cargoes, async () => {
      throw new AppError('voyage.closed', { voyage_no: 'VY-AT05' });
    });
    await enterLot('D', '10');

    expect((await screen.findByTestId('lot-error')).textContent).toBe(
      ru['error.voyage.closed'].replace('{voyage_no}', 'VY-AT05'),
    );
  });

  it('a rejection of the acknowledged resubmit is shown via describeError too', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const overload = `OVERLOAD:${JSON.stringify({ capacity_tons: 784, projected_remain_tons: 785, overshoot_tons: 1, overloads: true, hold_id: 'h' })}`;
    let call = 0;
    mount(seed.holdIds[1]!, 2, seed.cargoes, async () => {
      call += 1;
      if (call === 1) throw new Error(overload);
      throw new AppError('voyage.closed', { voyage_no: 'VY-AT05' });
    });
    await enterLot('E', '10');

    expect((await screen.findByTestId('lot-error')).textContent).toBe(
      ru['error.voyage.closed'].replace('{voyage_no}', 'VY-AT05'),
    );
  });
});
