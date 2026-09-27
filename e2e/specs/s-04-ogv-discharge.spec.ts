import { ru } from '../../src/i18n/ru';
import { expect, holdCell, test, totalsValue } from '../fixtures';
import { seedNordStarLoaded } from '../seeds';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

test('S-4: OGV discharge recalculates the load plan; a short hold is rejected whole in Russian', async ({ page, db, login }) => {
  const seeded = await seedNordStarLoaded(db);
  const layers = () =>
    db.select(`SELECT hold_id, source_vessel, remaining_tons FROM cargo_layers ORDER BY hold_id, load_sequence`);
  await login('Иван Петров');

  await expect(totalsValue(page, ru['voyage.totals.on_board'])).toHaveText('25684.955 т');
  await expect(totalsValue(page, ru['voyage.totals.total_empty_98'])).toHaveText('13880.924 т');
  const layersBefore = await layers();

  await page.getByTestId('hold-expand-3').click();
  await page.getByTestId('hold-action-discharge').click();
  await page.getByTestId('discharge-tons').fill('4003');
  await page.getByTestId('discharge-submit').click();

  const error = page.getByTestId('discharge-error');
  await expect(error).toHaveText(
    ru['error.ogv.insufficient_cargo'].replace('{hold_no}', '3').replace('{short_tons}', '1.000'),
  );
  expect(await error.textContent()).not.toMatch(UUID);
  expect(await error.textContent()).not.toMatch(/Insufficient|Error/);
  expect(await layers()).toEqual(layersBefore);
  expect(await db.select(`SELECT id FROM operations`)).toEqual([]);
  await expect(holdCell(page, 3, 'hold-remain')).toHaveText('4002.000');

  await page.getByTestId('discharge-tons').fill('1177');
  await page.getByTestId('discharge-submit').click();
  await expect(holdCell(page, 3, 'hold-remain')).toHaveText('2825.000');
  await expect(error).toHaveCount(0);

  await page.getByTestId('hold-expand-5').click();
  await page.getByTestId('hold-action-discharge').click();
  await page.getByTestId('discharge-tons').fill('824');
  await page.getByTestId('discharge-submit').click();
  await expect(holdCell(page, 5, 'hold-remain')).toHaveText('3338.955');

  await expect(holdCell(page, 3, 'hold-discharged')).toHaveText('1177.000');
  await expect(holdCell(page, 3, 'hold-empty-98')).toHaveText('4490.836');
  await expect(holdCell(page, 5, 'hold-discharged')).toHaveText('824.000');
  await expect(holdCell(page, 5, 'hold-empty-98')).toHaveText('3988.723');
  await expect(totalsValue(page, ru['voyage.totals.total_discharged'])).toHaveText('2001.000 т');
  await expect(totalsValue(page, ru['voyage.totals.on_board'])).toHaveText('23683.955 т');
  await expect(totalsValue(page, ru['voyage.totals.total_empty_98'])).toHaveText('15881.924 т');
  await expect(totalsValue(page, ru['voyage.totals.total_empty_100'])).toHaveText('16689.390 т');

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
