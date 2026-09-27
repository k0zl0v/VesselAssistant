/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoldTable } from '../HoldTable';
import { CalculationService } from '../../services/CalculationService';
import { CargoLotService } from '../../services/CargoLotService';
import { VoyageService } from '../../services/VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from '../../services/__tests__/helpers';
import type { NodeDb } from '../../services/db-node';

describe('component test environment: jsdom + better-sqlite3 in one file', () => {
  let db: NodeDb;

  beforeEach(async () => {
    db = await openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('renders totals computed from a real in-memory SQLite', async () => {
    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
    const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({
      vessel_id: seed.vesselId,
      voyage_no: 'ENV-1',
    });
    await new CargoLotService(db).add({
      voyage_id: voyage.id,
      source_vessel: 'DIANA MARIA',
      cargo_id: seed.cargoId,
      hold_id: seed.holdIds[0]!,
      sf: 1.25,
      planned_tons: 1600,
      loaded_tons: 1600,
    });
    const { holds, totals } = await new CalculationService(db).calculate(voyage.id);

    render(<HoldTable holds={holds} totals={totals} summaries={{}} />);

    expect(screen.getByText('Voyage total')).toBeInTheDocument();
    expect(screen.getByTestId('totals-on-board').textContent).toBe('1\u202F600.000');
  });
});
