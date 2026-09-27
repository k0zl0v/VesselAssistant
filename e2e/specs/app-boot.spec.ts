import { ru } from '../../src/i18n/ru';
import { expect, test } from '../fixtures';
import { seedOpenVoyage } from '../seeds';

test('the built app boots against the IPC bridge; after login the voyage list is shown', async ({ page, host, db, login }) => {
  const seeded = await seedOpenVoyage(db);

  await login('Иван Петров', 'supervisor');

  await expect(page.getByTestId('voyage-select')).toBeVisible();
  await expect(page.getByTestId('voyage-select').locator('option')).toHaveText([seeded.voyageNo + ' ']);
  await expect(page.getByText(ru['app.crashed'])).toHaveCount(0);
  await expect(page.getByTestId('voyage-load-error')).toHaveCount(0);
  expect(host.calls).toContain('plugin:sql|load');
  expect(await db.select(`SELECT operator_name, operator_role FROM app_session`)).toEqual([
    { operator_name: 'Иван Петров', operator_role: 'supervisor' },
  ]);
});
