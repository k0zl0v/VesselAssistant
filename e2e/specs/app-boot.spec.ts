import { expect, test } from '@playwright/test';
import { en } from '../../src/i18n/en';
import { installTauriBridge } from '../tauri-bridge/install';
import { TauriBridgeHost } from '../tauri-bridge/node-side';

test('the built app boots from vite preview against the IPC bridge', async ({ page }) => {
  const host = await TauriBridgeHost.create();
  const pageErrors: Error[] = [];
  page.on('pageerror', (e) => pageErrors.push(e));
  await installTauriBridge(page, host);

  await page.goto('/');

  await expect(page.locator('#root > *').first()).toBeVisible();
  // SessionGate (У9) also opens the DB for its name prefill, so this holds once the gate wraps App.
  await expect.poll(() => host.calls.includes('plugin:sql|load')).toBe(true);
  await expect(page.getByText(en['app.crashed'])).toHaveCount(0);
  await expect(page.getByText(en['app.db_error'].replace('{message}', ''))).toHaveCount(0);
  expect(host.unhandled).toEqual([]);
  expect(pageErrors).toEqual([]);
  host.db.close();
});
