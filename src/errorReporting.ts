import { isTauri } from '@tauri-apps/api/core';
import { error as logError } from '@tauri-apps/plugin-log';

function describe(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  return String(err);
}

/**
 * NFR-8: unexpected errors go to the Rust-side file log (`$APPLOG/vessel-assistant.log`).
 * Outside the Tauri runtime (Vite dev, tests) — to the console.
 */
export async function reportError(source: string, err: unknown): Promise<void> {
  const text = `[${source}] ${describe(err)}`;
  if (!isTauri()) {
    console.error(text);
    return;
  }
  try {
    await logError(text);
  } catch (logFailure) {
    console.error(text, logFailure);
  }
}
