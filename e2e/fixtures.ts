import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { ru } from '../src/i18n/ru';
import type { NodeDb } from '../src/services/db-node';
import type { OperatorRole } from '../src/services/SessionService';
import { installTauriBridge } from './tauri-bridge/install';
import { TauriBridgeHost } from './tauri-bridge/node-side';

export { expect };

/** Opens the app on `page` and passes `SessionGate` through its own form. */
export async function loginOn(page: Page, name: string, role: OperatorRole = 'operator'): Promise<void> {
  await page.goto('/');
  const nameInput = page.getByLabel(ru['session.name']);
  await nameInput.fill(name);
  await page.getByLabel(ru['session.role']).selectOption({ label: ru[`session.role.${role}`] });
  await page.getByRole('button', { name: ru['session.start'] }).click();
  await expect(page.getByRole('heading', { name: ru['session.title'] })).toHaveCount(0);
}

/** Wires `page` to `host` with the Russian UI and collects the page's uncaught errors. */
export async function attachPage(page: Page, host: TauriBridgeHost): Promise<Error[]> {
  const errors: Error[] = [];
  page.on('pageerror', (e) => errors.push(e));
  await installTauriBridge(page, host, { lang: 'ru' });
  return errors;
}

/** `<dd>` of the `VoyageTotals` row whose `<dt>` is exactly `label`. */
export function totalsValue(page: Page, label: string): Locator {
  return page.locator('dl.totals > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
}

export function holdCell(page: Page, holdNo: number, testId: string): Locator {
  return page.getByTestId(`hold-row-${holdNo}`).getByTestId(testId);
}

interface Fixtures {
  host: TauriBridgeHost;
  db: NodeDb;
  pageErrors: Error[];
  login: (name: string, role?: OperatorRole) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  host: async ({}, use) => {
    const host = await TauriBridgeHost.create();
    await use(host);
    expect(host.unhandled, 'IPC commands the bridge does not answer').toEqual([]);
    host.db.close();
  },
  db: async ({ host }, use) => {
    await use(host.db);
  },
  pageErrors: [
    async ({ page, host }, use) => {
      const errors = await attachPage(page, host);
      await use(errors);
      expect(errors, 'uncaught page errors').toEqual([]);
    },
    { auto: true },
  ],
  login: async ({ page }, use) => {
    await use((name, role) => loginOn(page, name, role));
  },
});
