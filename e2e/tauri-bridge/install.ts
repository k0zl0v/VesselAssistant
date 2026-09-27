import type { Page } from '@playwright/test';
import { tauriInitScript } from './init-script';
import type { TauriBridgeHost } from './node-side';

export const BRIDGE_NAME = '__vesselAssistantBridge';

/** Wires `page` to `host`: every Tauri `invoke` from the app is answered by `host.dispatch`. */
export async function installTauriBridge(
  page: Page,
  host: TauriBridgeHost,
  opts: { lang?: 'en' | 'ru' } = {},
): Promise<void> {
  await page.exposeFunction(BRIDGE_NAME, (cmd: string, args: unknown, options: unknown) =>
    host.dispatch(cmd, args, options),
  );
  await page.addInitScript(tauriInitScript, { bridgeName: BRIDGE_NAME, lang: opts.lang });
}
