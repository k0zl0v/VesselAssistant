import { seedKavkazDemo } from '../../src/seedDemo';
import { expect, g, holdCell, test } from '../fixtures';

test('discharge into the OGV with a crane — scale weight off the hold, corrected weight on the crane sheet', async ({
  page,
  db,
  login,
}) => {
  const { voyage_id } = await seedKavkazDemo(db);
  await login('Иван Петров');
  await expect(holdCell(page, 3, 'hold-remain')).toHaveText(g('2 825.000'));

  await page.getByTestId('hold-action-discharge').click();
  const dialog = page.getByTestId('discharge-dialog');
  await dialog.getByTestId('discharge-hold-3').click();
  const ogvHold2 = await dialog.getByTestId('discharge-ogv-hold').locator('option', { hasText: '№2' }).getAttribute('value');
  await dialog.getByTestId('discharge-ogv-hold').selectOption(ogvHold2!);
  await dialog.getByTestId('discharge-crane-select').selectOption({ label: 'CRANE # 1' });
  await dialog.getByTestId('discharge-mode').selectOption('from_own');
  await dialog.getByTestId('discharge-tons').fill('500');
  // 500 / 1.060 (working coefficient of CRANE # 1, «ИЗ СЕБЯ») — shown, not written off.
  await expect(dialog.getByTestId('discharge-corrected')).toContainText('471.698');
  await dialog.getByTestId('discharge-submit').click();
  await expect(dialog).toHaveCount(0);

  await expect(holdCell(page, 3, 'hold-remain')).toHaveText(g('2 325.000'));

  const [op] = await db.select<{ id: string; tons: number; crane: string }>(
    `SELECT o.id, o.tons, c.name AS crane FROM operations o JOIN cranes c ON c.id = o.crane_id
      WHERE o.voyage_id = ? AND o.tons = 500`,
    [voyage_id],
  );
  expect(op).toMatchObject({ tons: 500, crane: 'CRANE # 1' });
  const [shift] = await db.select<{ scale_tons: number; coefficient: number; corrected_tons: number; mode: string }>(
    `SELECT scale_tons, coefficient, corrected_tons, mode FROM crane_shift_records WHERE operation_id = ?`,
    [op!.id],
  );
  expect(shift).toMatchObject({ scale_tons: 500, coefficient: 1.06, mode: 'from_own' });
  expect(shift!.corrected_tons).toBeCloseTo(471.698, 3);
  const [receipt] = await db.select<{ hold_no: number; tons: number; source_kind: string }>(
    `SELECT h.hold_no, r.tons, r.source_kind FROM ogv_receipts r JOIN ogv_holds h ON h.id = r.ogv_hold_id
      WHERE r.operation_id = ?`,
    [op!.id],
  );
  expect(receipt).toEqual({ hold_no: 2, tons: 500, source_kind: 'main_hold' });

  await page.getByTestId('nav-ogv').click();
  await expect(page.getByTestId('ogv-hold-2').getByTestId('ogv-hold-loaded')).toHaveText(g('1 677.000'));
});
