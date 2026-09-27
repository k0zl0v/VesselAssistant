/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { LayerStacks } from '../layers/LayerStacks';
import { LayersInspector } from '../layers/LayersInspector';
import { buildHistory, buildSources, buildStacks } from '../layers/model';
import { formatTons as fmt } from '../../calc/round';
import { CalculationService } from '../../services/CalculationService';
import { CargoLotService } from '../../services/CargoLotService';
import { listDischargeHistory, listLayers } from '../../services/DischargeHistory';
import { OgvService } from '../../services/OgvService';
import { VoyageService } from '../../services/VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb } from '../../services/__tests__/helpers';
import type { NodeDb } from '../../services/db-node';

// toHaveTextContent collapses whitespace, U+202F included.
const formatTons = (x: number): string => fmt(x).replace(/\s/g, ' ');

/**
 * Hold 1: ALISA V 2000 t, then VLADIMIR 1000 t on top. Hold 2: VLADIMIR 1500 t.
 * Discharge 1: 600 t from hold 1 (VLADIMIR 1000 → 400). Discharge 2: 700 t from hold 1
 * closes VLADIMIR (−400) and takes 300 t from ALISA V (2000 → 1700).
 */
async function seed(db: NodeDb): Promise<string> {
  const vesselId = crypto.randomUUID();
  await db.execute(`INSERT INTO vessels (id, name) VALUES (?, 'NORD STAR')`, [vesselId]);
  const sfm = crypto.randomUUID();
  await db.execute(`INSERT INTO cargoes (id, name) VALUES (?, 'SFM')`, [sfm]);
  const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({ vessel_id: vesselId, voyage_no: 'NS-01' });
  const holds = [crypto.randomUUID(), crypto.randomUUID()];
  for (const [i, id] of holds.entries()) {
    await db.execute(`INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, 10000)`, [id, vesselId, i + 1]);
  }
  const lots = new CargoLotService(db);
  const add = (hold_id: string, source_vessel: string, tons: number) =>
    lots.add({ voyage_id: voyage.id, hold_id, cargo_id: sfm, source_vessel, sf: 1.44, planned_tons: tons, loaded_tons: tons });
  await add(holds[0]!, 'ALISA V', 2000);
  await add(holds[0]!, 'VLADIMIR', 1000);
  await add(holds[1]!, 'VLADIMIR', 1500);
  const ogv = new OgvService(db);
  await ogv.discharge({ voyage_id: voyage.id, hold_id: holds[0]!, tons: 600, event_date: '2026-09-24' });
  await ogv.discharge({ voyage_id: voyage.id, hold_id: holds[0]!, tons: 700, event_date: '2026-09-25' });
  return voyage.id;
}

async function loadView(db: NodeDb, voyageId: string) {
  const [calc, layers, available, ops] = await Promise.all([
    new CalculationService(db).calculate(voyageId),
    listLayers(db, voyageId),
    new OgvService(db).availableBySource(voyageId),
    listDischargeHistory(db, voyageId),
  ]);
  return {
    calc,
    stacks: buildStacks(calc.holds, layers),
    sources: buildSources(available, layers),
    history: buildHistory(ops),
  };
}

describe('Cargo layers screen (LIFO stacks, FR-18 remains, discharge history)', () => {
  let db: NodeDb;
  let voyageId: string;

  beforeEach(async () => {
    db = await openTestDb();
    voyageId = await seed(db);
  });

  afterEach(() => {
    cleanup();
    db.close();
  });

  it('stacks each hold top layer first and marks the next layer LIFO writes off', async () => {
    const { stacks } = await loadView(db, voyageId);
    render(<LayerStacks stacks={stacks} cargoNames={['SFM']} selectedHoldId={null} onSelectHold={() => {}} />);

    const hold1 = screen.getByTestId('layers-hold-1');
    const blocks = within(hold1).getAllByTestId(/^layer-1-/);
    expect(blocks.map((b) => b.dataset.testid)).toEqual(['layer-1-2', 'layer-1-1']);

    // VLADIMIR is written off, so ALISA V below it is now the top.
    const closed = screen.getByTestId('layer-1-2');
    expect(closed).toHaveTextContent('VLADIMIR');
    expect(closed).toHaveTextContent('layer closed');
    expect(closed).not.toHaveTextContent('TOP');
    const top = screen.getByTestId('layer-1-1');
    expect(top).toHaveTextContent('LAYER 1 · TOP');
    expect(top).toHaveTextContent('ALISA V');
    expect(top).toHaveTextContent('SFM');
    expect(top).toHaveTextContent(`${formatTons(1700)} t`);

    expect(within(hold1).getByText(formatTons(1700))).toBeInTheDocument();
  });

  it('draws every hold on one tonnage scale', async () => {
    const { stacks } = await loadView(db, voyageId);
    const [h1, h2] = stacks;
    const alisa = h1!.layers.find((l) => l.source_vessel === 'ALISA V')!;
    const vladimir2 = h2!.layers[0]!;
    expect(alisa.heightPct / vladimir2.heightPct).toBeCloseTo(2000 / 1500, 6);
    expect(h1!.capPct).toBeCloseTo(h2!.capPct!, 6);
    expect(alisa.solidPct).toBeCloseTo(85, 6);
  });

  it('offers no way to pick a lower layer — only whole holds are selectable', async () => {
    const { stacks } = await loadView(db, voyageId);
    const picked: string[] = [];
    render(<LayerStacks stacks={stacks} cargoNames={['SFM']} selectedHoldId={null} onSelectHold={(id) => picked.push(id)} />);
    for (const block of screen.getAllByTestId(/^layer-\d+-\d+$/)) {
      expect(within(block).queryAllByRole('button')).toHaveLength(0);
    }
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    screen.getByTestId('layers-hold-select-2').click();
    expect(picked).toEqual([stacks[1]!.hold_id]);
  });

  it('shows remains by source vessel and what each discharge closed', async () => {
    const { calc, sources, history } = await loadView(db, voyageId);
    render(<LayersInspector sources={sources} onBoard={calc.totals.on_board} history={history} />);

    expect(screen.getByTestId('layers-source-ALISA V')).toHaveTextContent(`${formatTons(1700)} t`);
    const vladimir = screen.getByTestId('layers-source-VLADIMIR');
    expect(vladimir).toHaveTextContent(`${formatTons(1500)} t`);
    expect(vladimir).toHaveTextContent('holds №2 · written off in №1');
    expect(screen.getByTestId('layers-on-board')).toHaveTextContent(`${formatTons(3200)} t`);

    // Newest first; the older discharge left 400 t in VLADIMIR, the newer one closed it.
    const newer = screen.getByTestId('layers-op-2');
    expect(newer).toHaveTextContent('OGV-0002');
    expect(newer).toHaveTextContent('25.09.2026');
    expect(newer).toHaveTextContent('layer closed');
    expect(newer).toHaveTextContent(`remain ${formatTons(1700)}`);
    const older = screen.getByTestId('layers-op-1');
    expect(older).toHaveTextContent(`remain ${formatTons(400)}`);
    expect(older).not.toHaveTextContent('layer closed');
  });
});
