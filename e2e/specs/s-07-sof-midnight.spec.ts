import ExcelJS from 'exceljs';
import type { Page } from '@playwright/test';
import { ru } from '../../src/i18n/ru';
import { expect, test } from '../fixtures';
import { seedOpenVoyage } from '../seeds';

async function addEvent(page: Page, date: string, from: string, to: string): Promise<void> {
  await page.getByTestId('sof-form-date').fill(date);
  await page.getByTestId('sof-form-from').fill(from);
  await page.getByTestId('sof-form-to').fill(to);
  await page.getByTestId('sof-form-submit').click();
}

async function logRows(page: Page): Promise<string[][]> {
  return page.getByTestId('sof-row').evaluateAll((rows) =>
    rows.map((r) =>
      ['sof-row-date', 'sof-row-from', 'sof-row-to'].map(
        (id) => r.querySelector(`[data-testid="${id}"]`)?.textContent ?? '',
      ),
    ),
  );
}

test('S-7: SOF events across midnight are entered through the form fields, ordered, checked and exported', async ({
  page,
  host,
  db,
  login,
}) => {
  const seeded = await seedOpenVoyage(db);
  await login('Иван Петров');
  await page.getByTestId('voyage-subtab-sof').click();
  await expect(page.getByTestId('sof-empty')).toBeVisible();

  await page.getByTestId('sof-form-category').selectOption('loading_commenced');
  await expect(page.getByTestId('sof-form-description')).toHaveValue('Loading operations commenced');
  await addEvent(page, '2026-05-01', '22:00', '24:00');
  await expect(page.getByTestId('sof-row')).toHaveCount(1);
  await addEvent(page, '2026-05-02', '00:00', '04:00');
  await expect(page.getByTestId('sof-row')).toHaveCount(2);
  await expect(page.getByTestId('sof-row').first().getByTestId('sof-row-description')).toHaveText(
    'Loading operations commenced',
  );
  await expect(page.getByTestId('sof-overlap-warning')).toHaveCount(0);

  await addEvent(page, '2026-05-01', '23:00', '24:30');
  await expect(page.getByTestId('sof-form-error')).toBeVisible();
  await expect(page.getByTestId('sof-row')).toHaveCount(2);

  await addEvent(page, '2026-05-01', '23:00', '23:30');
  await expect(page.getByTestId('sof-row')).toHaveCount(3);
  await expect(page.getByTestId('sof-form-error')).toHaveCount(0);
  await expect(page.getByTestId('sof-overlap-warning')).toHaveText(
    ru['sof.warning.overlap_many'].replace('{count}', '2'),
  );
  expect(await logRows(page)).toEqual([
    ['2026-05-01', '22:00', '24:00'],
    ['2026-05-01', '23:00', '23:30'],
    ['2026-05-02', '00:00', '04:00'],
  ]);
  await expect(page.getByTestId('sof-row').nth(0)).toHaveClass(/overlap/);
  await expect(page.getByTestId('sof-row').nth(1)).toHaveClass(/overlap/);
  await expect(page.getByTestId('sof-row').nth(2)).not.toHaveClass(/overlap/);

  const overlappingRow = page.getByTestId('sof-row').nth(1);
  const dismissedPrompts: string[] = [];
  page.once('dialog', async (d) => {
    dismissedPrompts.push(d.message());
    await d.dismiss();
  });
  await overlappingRow.getByTestId('sof-row-delete').click();
  await expect.poll(() => dismissedPrompts).toEqual([ru['sof.delete.confirm']]);
  await expect(page.getByTestId('sof-row')).toHaveCount(3);

  const acceptedPrompts: string[] = [];
  page.once('dialog', async (d) => {
    acceptedPrompts.push(d.message());
    await d.accept();
  });
  await overlappingRow.getByTestId('sof-row-delete').click();
  await expect(page.getByTestId('sof-row')).toHaveCount(2);
  expect(acceptedPrompts).toEqual([ru['sof.delete.confirm']]);
  expect(await logRows(page)).toEqual([
    ['2026-05-01', '22:00', '24:00'],
    ['2026-05-02', '00:00', '04:00'],
  ]);
  await expect(page.getByTestId('sof-overlap-warning')).toHaveCount(0);

  expect(
    await db.select(
      `SELECT event_date, time_from, time_to, category FROM sof_events WHERE voyage_id = ? ORDER BY event_date, time_from`,
      [seeded.voyageId],
    ),
  ).toEqual([
    { event_date: '2026-05-01', time_from: '22:00', time_to: '24:00', category: 'loading_commenced' },
    { event_date: '2026-05-02', time_from: '00:00', time_to: '04:00', category: 'loading_commenced' },
  ]);

  const exportPath = '/exports/s-07.xlsx';
  host.dialogs.enqueue('save', exportPath);
  await page.getByRole('button', { name: ru['export.button'] }).click();
  await expect.poll(() => host.fs.files.has(exportPath)).toBe(true);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(host.fs.files.get(exportPath)!));
  const sof = wb.getWorksheet('SOF')!;
  const exported: string[][] = [];
  sof.eachRow((row, n) => {
    if (n > 1) exported.push([1, 2, 3].map((c) => String(row.getCell(c).value)));
  });
  expect(exported).toContainEqual(['2026-05-01', '22:00', '24:00']);
  expect(exported).toContainEqual(['2026-05-02', '00:00', '04:00']);
});
