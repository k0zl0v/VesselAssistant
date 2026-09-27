import { CargoLotService } from '../../src/services/CargoLotService';
import { expect, g, holdCell, test } from '../fixtures';
import { seedS1 } from '../seeds';

test('S-1: a VELES lot is loaded over DIANA MARIA through the form, recalculated and audited with the operator name', async ({
  page,
  db,
  login,
}) => {
  const seeded = await seedS1(db);
  const holdId = seeded.holdIdByNo.get(1)!;
  await login('Иван Петров');

  await expect(holdCell(page, 1, 'hold-loaded')).toHaveText(g('1 600.000'));
  await page.getByTestId('hold-action-add-lot').click();
  const dialog = page.getByTestId('add-lot-dialog');
  await dialog.getByTestId('lot-hold-1').click();
  await dialog.getByTestId('lot-source-vessel').fill('VELES');
  await dialog.getByTestId('lot-cargo-WHEAT').click();
  await dialog.getByTestId('lot-protein-12.5').click();
  await dialog.getByTestId('lot-sf').fill('1.25');
  await dialog.getByTestId('lot-tons').fill('1200');
  await dialog.getByTestId('lot-submit').click();
  await expect(dialog).toHaveCount(0);

  await expect(holdCell(page, 1, 'hold-loaded')).toHaveText(g('2 800.000'));
  await expect(holdCell(page, 1, 'hold-remain')).toHaveText(g('2 800.000'));
  // CapacityTons98 = 100000 / 1.25 × 0.98 = 78400.000
  await expect(holdCell(page, 1, 'hold-empty-98')).toHaveText(g('75 600.000'));

  // The layers screen shows the new lot on top of the stack (LIFO order, top first).
  await page.getByTestId('nav-layers').click();
  const top = page.getByTestId('layer-1-2');
  await expect(top).toContainText('VELES');
  await expect(top).toContainText(g('1 200.000'));
  await expect(page.getByTestId('layer-1-1')).toContainText('DIANA MARIA');
  await expect(page.getByTestId('layer-1-1')).toContainText(g('1 600.000'));
  const order = await page.getByTestId('layers-hold-1').locator('[data-testid^="layer-1-"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid')),
  );
  expect(order).toEqual(['layer-1-2', 'layer-1-1']);

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
