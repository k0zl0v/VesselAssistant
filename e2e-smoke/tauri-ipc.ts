import { browser } from '@wdio/globals';

/** Same shape as `window.__TAURI_INTERNALS__.invoke` (`@tauri-apps/api/core`'s `invoke` calls into this). */
interface TauriInternals {
  invoke<T>(cmd: string, args?: unknown, options?: { headers?: Record<string, string> }): Promise<T>;
}

/**
 * Calls a real Tauri IPC command inside the running app's webview — the same wire commands
 * `e2e/tauri-bridge/node-side.ts` answers for Playwright, but against the actual Rust host.
 */
export async function invokeIpc<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return browser.execute(
    async (invokeCmd, invokeArgs) => {
      const internals = (window as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__;
      return internals.invoke(invokeCmd, invokeArgs);
    },
    cmd,
    args,
  ) as Promise<T>;
}

/** Mirrors `@tauri-apps/plugin-fs`'s `writeTextFile`: body is bytes, path/options ride in headers. */
export async function writeTextFileViaIpc(relPath: string, contents: string, baseDir: number): Promise<void> {
  await browser.execute(
    async (targetPath, text, options) => {
      const internals = (window as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__;
      const bytes = new TextEncoder().encode(text);
      await internals.invoke('plugin:fs|write_text_file', bytes, {
        headers: { path: encodeURIComponent(targetPath), options: JSON.stringify(options) },
      });
    },
    relPath,
    contents,
    { baseDir },
  );
}

/** Mirrors `@tauri-apps/plugin-fs`'s `readTextFile`: plain JSON args, byte-array reply. */
export async function readTextFileViaIpc(relPath: string, baseDir: number): Promise<string> {
  return browser.execute(
    async (targetPath, options) => {
      const internals = (window as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__;
      const arr = await internals.invoke<number[] | ArrayBuffer>('plugin:fs|read_text_file', {
        path: targetPath,
        options,
      });
      const bytes = arr instanceof ArrayBuffer ? new Uint8Array(arr) : Uint8Array.from(arr);
      return new TextDecoder().decode(bytes);
    },
    relPath,
    { baseDir },
  ) as unknown as Promise<string>;
}
