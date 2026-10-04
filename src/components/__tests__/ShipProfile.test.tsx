/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ShipProfileStrip } from '../ShipProfile';
import { KAVKAZ_IV_HOLDS } from '../../fixtures/kavkaz-iv';
import { formatTons as fmt } from '../../calc/round';
import { setLang } from '../../i18n';
import { CalculationService, type VoyageCalcResult } from '../../services/CalculationService';
import { CargoLotService } from '../../services/CargoLotService';
import { OgvService } from '../../services/OgvService';
import { loadShipProfileCranes } from '../../services/ShipProfileView';
import { loadVoyageOverview, type VoyageOverview } from '../../services/VoyageOverview';
import { VoyageService } from '../../services/VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb } from '../../services/__tests__/helpers';
import type { NodeDb } from '../../services/db-node';

// toHaveTextContent collapses whitespace, U+202F included.
const formatTons = (x: number): string => fmt(x).replace(/\s/g, ' ');

interface Seeded {
  voyageId: string;
  holdIds: string[];
  cranes: { id: string; name: string }[];
}

/** KAVKAZ IV holds with the Appendix C remains, two cranes, and a working coefficient for Кран 1. */
async function seed(db: NodeDb): Promise<Seeded> {
  const vesselId = crypto.randomUUID();
  await db.execute(`INSERT INTO vessels (id, name) VALUES (?, 'KAVKAZ IV')`, [vesselId]);
  const cargoIds: Record<string, string> = {};
  for (const name of ['SFM', 'WHEAT']) {
    cargoIds[name] = crypto.randomUUID();
    await db.execute(`INSERT INTO cargoes (id, name) VALUES (?, ?)`, [cargoIds[name]!, name]);
  }
  const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({ vessel_id: vesselId, voyage_no: 'PROFILE' });
  const lots = new CargoLotService(db);
  const ogv = new OgvService(db);
  const holdIds: string[] = [];
  for (const h of KAVKAZ_IV_HOLDS) {
    const holdId = crypto.randomUUID();
    holdIds.push(holdId);
    await db.execute(`INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, ?)`, [
      holdId, vesselId, h.hold_no, h.volume_m3,
    ]);
    await db.execute(
      `INSERT INTO hold_cargo_parameters (id, voyage_id, vessel_id, hold_id, cargo_id, sf, fill_percent)
       VALUES (?, ?, ?, ?, ?, ?, 0.98)`,
      [crypto.randomUUID(), voyage.id, vesselId, holdId, cargoIds[h.cargo]!, h.sf],
    );
    await lots.add({
      voyage_id: voyage.id, source_vessel: 'AGG', cargo_id: cargoIds[h.cargo]!, hold_id: holdId,
      sf: h.sf, planned_tons: h.loaded_tons, loaded_tons: h.loaded_tons,
    });
    if (h.discharged_tons > 0) {
      await ogv.discharge({ voyage_id: voyage.id, hold_id: holdId, tons: h.discharged_tons, event_date: '2026-05-01' });
    }
  }
  const cranes = [
    { id: crypto.randomUUID(), name: 'Кран 1' },
    { id: crypto.randomUUID(), name: 'Кран 2' },
  ];
  for (const c of cranes) await db.execute(`INSERT INTO cranes (id, name) VALUES (?, ?)`, [c.id, c.name]);
  await db.execute(
    `INSERT INTO crane_working_coefficients (id, crane_id, mode, coefficient, valid_from) VALUES (?, ?, 'from_own', 1.06, '2026-01-01')`,
    [crypto.randomUUID(), cranes[0]!.id],
  );
  return { voyageId: voyage.id, holdIds, cranes };
}

async function addShiftRecord(
  db: NodeDb,
  r: { voyageId: string; craneId: string; date: string; scale: number; k: number; holdId?: string },
): Promise<void> {
  const [op] = r.holdId
    ? await db.select<{ operation_id: string }>(
        `SELECT operation_id FROM discharge_allocations WHERE hold_id = ? LIMIT 1`,
        [r.holdId],
      )
    : [];
  await db.execute(
    `INSERT INTO crane_shift_records (id, voyage_id, shift_date, crane_id, mode, scale_tons, coefficient, corrected_tons, operation_id)
     VALUES (?, ?, ?, ?, 'from_own', ?, ?, ?, ?)`,
    [crypto.randomUUID(), r.voyageId, r.date, r.craneId, r.scale, r.k, r.scale * r.k, op?.operation_id ?? null],
  );
}

describe('Ship profile strip (README step 3, excel-reference §3)', () => {
  let db: NodeDb;
  let seeded: Seeded;
  let calc: VoyageCalcResult;
  let overview: VoyageOverview;

  beforeEach(async () => {
    setLang('ru');
    db = await openTestDb();
    seeded = await seed(db);
    calc = await new CalculationService(db).calculate(seeded.voyageId);
    overview = await loadVoyageOverview(db, seeded.voyageId);
  });

  afterEach(() => {
    cleanup();
    db.close();
    setLang('en');
  });

  it('draws holds stern → bow (№5 … №1) with V % and free volume from the Excel profile', () => {
    render(<ShipProfileStrip holds={calc.holds} summaries={overview.holds} cranes={null} onOpenCranes={() => {}} />);
    const holds = screen.getAllByTestId(/^profile-hold-/);
    expect(holds.map((h) => h.dataset.testid)).toEqual([5, 4, 3, 2, 1].map((n) => `profile-hold-${n}`));

    const h5 = screen.getByTestId('profile-hold-5');
    expect(within(h5).getByTestId('profile-filled')).toHaveTextContent('V = 44.7 %');
    expect(within(h5).getByTestId('profile-free')).toHaveTextContent(formatTons(5959.105));
    expect(h5).toHaveTextContent('SFM');
    const free = [4462.42, 2515.802, 6681.8, 3383.81];
    free.forEach((v, i) => {
      expect(within(screen.getByTestId(`profile-hold-${i + 1}`)).getByTestId('profile-free')).toHaveTextContent(formatTons(v));
    });
  });

  it('renders holds and no crane markers when the voyage has no cranes', async () => {
    const view = await loadShipProfileCranes(db, seeded.voyageId, [], '2026-05-01');
    render(<ShipProfileStrip holds={calc.holds} summaries={overview.holds} cranes={view} onOpenCranes={() => {}} />);
    expect(screen.getAllByTestId(/^profile-hold-/)).toHaveLength(5);
    expect(screen.queryAllByTestId(/^profile-crane-/)).toHaveLength(0);
    expect(screen.getByTestId('ship-profile-cranes-link')).toHaveTextContent('Крановая поправка');
    expect(screen.queryByTestId('ship-profile-shift-correction')).toBeNull();
  });

  it('cranes without shift records: working coefficient with 3 decimals, «no operations», missing coefficient as —', async () => {
    const view = await loadShipProfileCranes(db, seeded.voyageId, seeded.cranes, '2026-05-01');
    expect(view.shift).toBeNull();
    expect(view.active_crane_id).toBeNull();
    render(<ShipProfileStrip holds={calc.holds} summaries={overview.holds} cranes={view} onOpenCranes={() => {}} />);
    const [c1, c2] = seeded.cranes;
    const m1 = screen.getByTestId(`profile-crane-${c1!.id}`);
    expect(within(m1).getByTestId('profile-crane-k')).toHaveTextContent('k 1.060');
    expect(within(m1).getByTestId('profile-crane-last')).toHaveTextContent('операций за рейс нет');
    expect(within(screen.getByTestId(`profile-crane-${c2!.id}`)).getByTestId('profile-crane-k')).toHaveTextContent('k —');
  });

  it('last operation per crane from crane_shift_records: scale weight, hold, mode; shift correction in the header', async () => {
    const [c1, c2] = seeded.cranes;
    const hold3 = seeded.holdIds[2]!;
    await addShiftRecord(db, { voyageId: seeded.voyageId, craneId: c1!.id, date: '2026-05-01', scale: 500, k: 1.06 });
    await addShiftRecord(db, { voyageId: seeded.voyageId, craneId: c1!.id, date: '2026-05-02', scale: 1177, k: 1.06, holdId: hold3 });
    await addShiftRecord(db, { voyageId: seeded.voyageId, craneId: c2!.id, date: '2026-05-02', scale: 824, k: 0.96 });

    const view = await loadShipProfileCranes(db, seeded.voyageId, seeded.cranes, '2026-06-01');
    expect(view.active_crane_id).toBe(c2!.id);
    // Latest shift only (2026-05-02): 1177 × 0.06 − 824 × 0.04.
    expect(view.shift?.date).toBe('2026-05-02');
    expect(view.shift?.correction_tons).toBeCloseTo(1177 * 0.06 - 824 * 0.04, 9);

    let opened = 0;
    render(<ShipProfileStrip holds={calc.holds} summaries={overview.holds} cranes={view} onOpenCranes={() => opened++} />);
    const m1 = screen.getByTestId(`profile-crane-${c1!.id}`);
    expect(within(m1).getByTestId('profile-crane-last')).toHaveTextContent(`посл. выгрузка: трюм №3, ${formatTons(1177)} т`);
    expect(m1.className).not.toContain('active');
    const m2 = screen.getByTestId(`profile-crane-${c2!.id}`);
    expect(within(m2).getByTestId('profile-crane-last')).toHaveTextContent(`посл. выгрузка: ${formatTons(824)} т`);
    expect(m2.className).toContain('active');
    expect(screen.getByTestId('ship-profile-shift-correction')).toHaveTextContent(formatTons(1177 * 0.06 - 824 * 0.04));

    fireEvent.click(screen.getByTestId('ship-profile-cranes-link'));
    expect(opened).toBe(1);
  });

  it('shows a readable error and still renders the holds when cranes cannot be read', () => {
    render(
      <ShipProfileStrip holds={calc.holds} summaries={overview.holds} cranes={null} error="база недоступна" onOpenCranes={() => {}} />,
    );
    expect(screen.getByTestId('ship-profile-error')).toHaveTextContent('Не удалось прочитать краны: база недоступна');
    expect(screen.getAllByTestId(/^profile-hold-/)).toHaveLength(5);
  });
});
