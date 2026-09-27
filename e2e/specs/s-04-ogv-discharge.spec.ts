import { ru } from '../../src/i18n/ru';
import { expect, g, holdCell, test, totalsValue } from '../fixtures';
import { seedNordStarLoaded } from '../seeds';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

test('S-4: OGV discharge recalculates the load plan; a short hold is rejected whole in Russian', async ({ page, db, login }) => {
  const seeded = await seedNordStarLoaded(db);
  const layers = () =>
    db.select(`SELECT hold_id, source_vessel, remaining_tons FROM cargo_layers ORDER BY hold_id, load_sequence`);
  await login('Иван Петров');

  await expect(totalsValue(page, 'on-board')).toHaveText(g('25 684.955'));
  await expect(totalsValue(page, 'total-empty-98')).toHaveText(g('13 880.924'));
  const layersBefore = await layers();

  await expect(holdCell(page, 3, 'hold-sf')).toHaveText('1.440');
  await expect(holdCell(page, 3, 'hold-remain')).toHaveText(g('4 002.000'));
  await page.getByTestId('hold-action-discharge').click();
  const dialog = page.getByTestId('discharge-dialog');
  await dialog.getByTestId('discharge-hold-3').click();
  await expect(dialog.getByTestId('discharge-preview')).toHaveCount(1);
  await dialog.getByTestId('discharge-tons').fill('4003');

  // The dry-run preview reports the shortage before anything is sent to the service.
  const shortage = dialog.getByTestId('discharge-shortage');
  await expect(shortage).toContainText(
    ru['error.ogv.insufficient_cargo'].replace('{hold_no}', '3').replace('{short_tons}', '1.000'),
  );
  expect(await shortage.textContent()).not.toMatch(UUID);
  expect(await shortage.textContent()).not.toMatch(/Insufficient|Error/);
  await expect(dialog.getByTestId('discharge-submit')).toBeDisabled();
  expect(await layers()).toEqual(layersBefore);
  expect(await db.select(`SELECT id FROM operations`)).toEqual([]);

  await dialog.getByTestId('discharge-tons').fill('1177');
  await expect(dialog.getByTestId('discharge-preview')).toContainText('BARGE 3');
  await dialog.getByTestId('discharge-submit').click();
  await expect(dialog).toHaveCount(0);
  await expect(holdCell(page, 3, 'hold-remain')).toHaveText(g('2 825.000'));

  await page.getByTestId('hold-action-discharge').click();
  await dialog.getByTestId('discharge-hold-5').click();
  await dialog.getByTestId('discharge-tons').fill('824');
  await dialog.getByTestId('discharge-submit').click();
  await expect(dialog).toHaveCount(0);
  await expect(holdCell(page, 5, 'hold-remain')).toHaveText(g('3 338.955'));

  await expect(holdCell(page, 3, 'hold-discharged')).toHaveText(g('1 177.000'));
  await expect(holdCell(page, 3, 'hold-empty-98')).toHaveText(g('4 490.836'));
  await expect(holdCell(page, 5, 'hold-discharged')).toHaveText('824.000');
  await expect(holdCell(page, 5, 'hold-empty-98')).toHaveText(g('3 988.723'));
  await expect(totalsValue(page, 'total-discharged')).toHaveText(g('2 001.000'));
  await expect(totalsValue(page, 'on-board')).toHaveText(g('23 683.955'));
  await expect(totalsValue(page, 'total-empty-98')).toHaveText(g('15 881.924'));
  await expect(totalsValue(page, 'total-empty-100')).toHaveText(g('16 689.390'));

  await page.getByTestId('nav-ogv').click();
  await expect(page.getByTestId('ogv-total-tons')).toHaveText(g('2 001.000'));

  expect(
    await db.select(
      `SELECT h.hold_no, o.tons FROM operations o JOIN holds h ON h.id = o.source_hold
        WHERE o.voyage_id = ? ORDER BY h.hold_no`,
      [seeded.voyageId],
    ),
  ).toEqual([
    { hold_no: 3, tons: 1177 },
    { hold_no: 5, tons: 824 },
  ]);
});
