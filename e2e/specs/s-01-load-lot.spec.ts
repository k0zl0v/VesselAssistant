import { ru } from '../../src/i18n/ru';
import { CargoLotService } from '../../src/services/CargoLotService';
import { expect, holdCell, test } from '../fixtures';
import { seedS1 } from '../seeds';

test('S-1: a VELES lot is loaded over DIANA MARIA through the form, recalculated and audited with the operator name', async ({
  page,
  db,
  login,
}) => {
  const seeded = await seedS1(db);
  const holdId = seeded.holdIdByNo.get(1)!;
  await login('Иван Петров');

  await expect(holdCell(page, 1, 'hold-loaded')).toHaveText('1600.000');
  await page.getByTestId('hold-expand-1').click();
  await page.getByTestId('hold-action-add-lot').click();
  await page.getByTestId('lot-source-vessel').fill('VELES');
  await page.getByTestId('lot-cargo').selectOption({ label: 'WHEAT' });
  await page.getByTestId('lot-protein').selectOption('12.5');
  await page.getByTestId('lot-sf').fill('1.25');
  await page.getByTestId('lot-tons').fill('1200');
  await page.getByTestId('lot-submit').click();

  await expect(holdCell(page, 1, 'hold-loaded')).toHaveText('2800.000');
  await expect(holdCell(page, 1, 'hold-remain')).toHaveText('2800.000');
  // CapacityTons98 = 100000 / 1.25 × 0.98 = 78400.000
  await expect(holdCell(page, 1, 'hold-empty-98')).toHaveText('75600.000');
  await expect(page.getByTestId('hold-expansion')).toContainText(ru['holds.lots.title_top'].replace('{seq}', '2'));
  await expect(page.getByTestId('hold-lot-2')).toContainText('#2 VELES');
  await expect(page.getByTestId('hold-lot-2')).toContainText('1200.000');
  await expect(page.getByTestId('hold-lot-1')).toContainText('#1 DIANA MARIA');
  await expect(page.getByTestId('hold-lot-1')).toContainText('1600.000');

  expect(
    await db.select(
      `SELECT l.source_vessel, l.protein_percent, l.loaded_tons, l.load_sequence, y.remaining_tons
         FROM cargo_lots l JOIN cargo_layers y ON y.cargo_lot_id = l.id
        WHERE l.hold_id = ? ORDER BY l.load_sequence DESC`,
      [holdId],
    ),
  ).toEqual([
    { source_vessel: 'VELES', protein_percent: 12.5, loaded_tons: 1200, load_sequence: 2, remaining_tons: 1200 },
    { source_vessel: 'DIANA MARIA', protein_percent: 12.5, loaded_tons: 1600, load_sequence: 1, remaining_tons: 1600 },
  ]);
  expect(
    await db.select(
      `SELECT user_id, user_role FROM audit_log
        WHERE entity_type = 'cargo_lots' AND action = 'insert'
          AND json_extract(new_value, '$.source_vessel') = 'VELES'`,
    ),
  ).toEqual([{ user_id: 'Иван Петров', user_role: 'operator' }]);

  const bypass = new CargoLotService(db).add({
    voyage_id: seeded.voyageId,
    hold_id: holdId,
    cargo_id: seeded.cargoIdByName.get('WHEAT')!,
    source_vessel: 'BYPASS',
    protein_percent: 12.0,
    sf: 1.25,
    planned_tons: 10,
    loaded_tons: 10,
  });
  await expect(bypass).rejects.toMatchObject({ code: 'protein.invalid' });
  expect(await db.select(`SELECT id FROM cargo_lots WHERE source_vessel = 'BYPASS'`)).toEqual([]);
});
