import ExcelJS from 'exceljs';
import { ru } from '../../src/i18n/ru';
import { CargoLotService } from '../../src/services/CargoLotService';
import { OgvService } from '../../src/services/OgvService';
import { SofService } from '../../src/services/SofService';
import { attachPage, expect, loginOn, test } from '../fixtures';
import { seedNordStarDischarged } from '../seeds';

const CLOSE_SNAPSHOT = /^\$AppData\/backups\/auto-.+-close_voyage\.json$/;

test('S-13: closing asks first, snapshots, audits, and leaves the voyage read-only', async ({
  page,
  context,
  host,
  db,
  login,
}) => {
  const seeded = await seedNordStarDischarged(db);
  const { voyageId, voyageNo } = seeded;
  const snapshots = () => [...host.fs.files.keys()].filter((k) => CLOSE_SNAPSHOT.test(k));
  const status = async () =>
    (await db.select<{ status: string }>(`SELECT status FROM voyages WHERE id = ?`, [voyageId]))[0]!.status;
  const dataCounts = () =>
    db.select(
      `SELECT (SELECT COUNT(*) FROM cargo_lots) AS lots, (SELECT COUNT(*) FROM operations) AS ops,
              (SELECT COUNT(*) FROM sof_events) AS sof, (SELECT SUM(remaining_tons) FROM cargo_layers) AS aboard`,
    );
  await login('Иван Петров');

  // A second window, opened before the close, still shows the add-lot dialog of the open voyage.
  const stale = await context.newPage();
  const staleErrors = await attachPage(stale, host);
  await loginOn(stale, 'Иван Петров');
  await stale.getByTestId('hold-action-add-lot').click();
  await stale.getByTestId('lot-hold-1').click();
  await stale.getByTestId('lot-cargo-SFM').click();

  const expectedPrompt = ru['voyage.close.confirm'].replace('{voyage_no}', voyageNo);
  // Closing is confirmed inline (no window.confirm): the panel states the consequence.
  const confirm = page.getByTestId('voyage-close-confirm');
  await page.getByTestId('voyage-close').click();
  await expect(confirm).toContainText(expectedPrompt);
  await page.getByTestId('voyage-close-confirm-cancel').click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByTestId('voyage-status')).toHaveText(ru['voyage.status.open']);
  expect(await status()).toBe('open');
  expect(snapshots()).toEqual([]);

  await page.getByTestId('voyage-close').click();
  await expect(confirm).toContainText(expectedPrompt);
  await page.getByTestId('voyage-close-confirm-confirm').click();
  await expect(page.getByTestId('voyage-status')).toHaveText(ru['voyage.status.closed']);
  expect(await status()).toBe('closed');
  expect(snapshots()).toHaveLength(1);
  const snapshot = JSON.parse(host.fs.readText(snapshots()[0]!)!) as { tables: { voyages: { status: string }[] } };
  expect(snapshot.tables.voyages).toEqual([expect.objectContaining({ status: 'open' })]);
  expect(
    await db.select(
      `SELECT user_id, user_role FROM audit_log
        WHERE entity_type = 'voyages' AND action = 'update' AND entity_id = ?
          AND json_extract(new_value, '$.status') = 'closed'`,
      [voyageId],
    ),
  ).toEqual([{ user_id: 'Иван Петров', user_role: 'operator' }]);
  await expect(page.getByTestId('voyage-close')).toHaveCount(0);
  const afterClose = await dataCounts();

  await expect(page.getByTestId('voyage-closed-note')).toBeVisible();
  await expect(page.getByTestId('hold-action-add-lot')).toHaveCount(0);
  await expect(page.getByTestId('hold-action-discharge')).toHaveCount(0);

  await stale.getByTestId('lot-source-vessel').fill('LATE BARGE');
  await stale.getByTestId('lot-tons').fill('10');
  await stale.getByTestId('lot-submit').click();
  await expect(stale.getByTestId('lot-error')).toHaveText(ru['error.voyage.closed'].replace('{voyage_no}', voyageNo));
  expect(staleErrors).toEqual([]);

  const holdId = seeded.holdIdByNo.get(1)!;
  const closed = { code: 'voyage.closed' };
  await expect(
    new CargoLotService(db).add({
      voyage_id: voyageId,
      hold_id: holdId,
      cargo_id: seeded.cargoIdByName.get('SFM')!,
      source_vessel: 'BYPASS',
      sf: 1.44,
      planned_tons: 10,
      loaded_tons: 10,
    }),
  ).rejects.toMatchObject(closed);
  await expect(
    new OgvService(db).discharge({ voyage_id: voyageId, hold_id: holdId, tons: 10, event_date: '2026-05-04' }),
  ).rejects.toMatchObject(closed);
  await expect(
    new SofService(db).create({ voyage_id: voyageId, event_date: '2026-05-04', time_from: '10:00', time_to: '11:00' }),
  ).rejects.toMatchObject(closed);
  await expect(db.execute(`UPDATE voyages SET status = 'open' WHERE id = ?`, [voyageId])).rejects.toThrow(
    'closed voyage cannot be reopened',
  );
  expect(await status()).toBe('closed');
  expect(await dataCounts()).toEqual(afterClose);

  const exportPath = '/exports/s-13.xlsx';
  host.dialogs.enqueue('save', exportPath);
  await page.getByRole('button', { name: ru['export.button'] }).click();
  await expect.poll(() => host.fs.files.has(exportPath)).toBe(true);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(host.fs.files.get(exportPath)!));
  expect(wb.worksheets.map((s) => s.name)).toEqual(['NORD STAR', 'SOF', 'OGV', 'CRANE CORR.']);
  const totals = wb.getWorksheet('NORD STAR')!.getRow(12);
  expect(totals.getCell(1).value).toBe('TOTAL');
  expect(totals.getCell(7).value).toBeCloseTo(23683.955, 3);
  expect(totals.getCell(9).value).toBeCloseTo(15881.924, 3);
});
