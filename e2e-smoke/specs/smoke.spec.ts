import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { KAVKAZ_IV_HOLDS, KAVKAZ_IV_VESSEL_NAME } from '../../src/fixtures/kavkaz-iv';
import { ru } from '../../src/i18n/ru';
import { invokeIpc, readTextFileViaIpc, writeTextFileViaIpc } from '../tauri-ipc';

const DB = 'sqlite:vessel_assistant.db';
/** `@tauri-apps/api/path`'s `BaseDirectory.AppData` ordinal — see `tauri-ipc.ts`. */
const APP_DATA = 14;

describe('Windows smoke: real Tauri host behind a wdio + tauri-driver session', () => {
  it('step 1: the window opens and migrations have run before the app renders', async () => {
    // `session.title` only paints once `SessionService.current()` resolved a SELECT against
    // `app_session` — impossible unless every migration up to 0005 already applied.
    const heading = await browser.$(`h2=${ru['session.title']}`);
    try {
      await heading.waitForExist({ timeout: 30_000 });
    } catch (error) {
      throw new Error(`session.title never rendered; window URL is ${await browser.getUrl()}: ${String(error)}`);
    }
  });

  it('step 2: _sqlx_migrations records exactly versions 1..5', async () => {
    const rows = await invokeIpc<{ version: number }[]>('plugin:sql|select', {
      db: DB,
      query: 'SELECT version FROM _sqlx_migrations ORDER BY version',
      values: [],
    });
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4, 5]);
  });

  it('step 3 (hypothesis 10): write_text_file / read_text_file round-trip under $APPDATA/backups', async () => {
    await invokeIpc('plugin:fs|mkdir', { path: 'backups', options: { baseDir: APP_DATA, recursive: true } });
    const marker = `smoke-${Date.now()}`;
    await writeTextFileViaIpc('backups/smoke-test.txt', marker, APP_DATA);
    await expect(readTextFileViaIpc('backups/smoke-test.txt', APP_DATA)).resolves.toBe(marker);
  });

  it('step 4: execute_batch on the real pool rolls back an FK failure entirely', async () => {
    const vesselId = await browser.execute(() => crypto.randomUUID());
    await invokeIpc('plugin:sql|execute', {
      db: DB,
      query: 'INSERT INTO vessels (id, name) VALUES (?, ?)',
      values: [vesselId, KAVKAZ_IV_VESSEL_NAME],
    });
    const seeded = await invokeIpc<{ id: string }[]>('plugin:sql|select', {
      db: DB,
      query: 'SELECT id FROM vessels WHERE id = ?',
      values: [vesselId],
    });
    expect(seeded).toEqual([{ id: vesselId }]);

    const hold = KAVKAZ_IV_HOLDS[0];
    const holdId = await browser.execute(() => crypto.randomUUID());
    // Second statement references a voyage/cargo id that does not exist — the whole
    // batch, including the otherwise-valid `holds` insert, must roll back.
    await expect(
      invokeIpc('execute_batch', {
        db: DB,
        batch: [
          {
            sql: 'INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, ?)',
            params: [holdId, vesselId, hold.hold_no, hold.volume_m3],
            expect_rows_affected: null,
          },
          {
            sql:
              'INSERT INTO hold_cargo_parameters (id, voyage_id, vessel_id, hold_id, cargo_id, sf) ' +
              'VALUES (?, ?, ?, ?, ?, ?)',
            params: [crypto.randomUUID(), 'missing-voyage', vesselId, holdId, 'missing-cargo', hold.sf],
            expect_rows_affected: null,
          },
        ],
      }),
    ).rejects.toBeTruthy();

    const holds = await invokeIpc<{ id: string }[]>('plugin:sql|select', {
      db: DB,
      query: 'SELECT id FROM holds WHERE vessel_id = ?',
      values: [vesselId],
    });
    expect(holds).toEqual([]);
  });

  it('step 5: plugin:log|log writes to the file target', async () => {
    const marker = `smoke-log-${Date.now()}`;
    await invokeIpc('plugin:log|log', { level: 3, message: marker });
    const logPath = path.join(process.env.LOCALAPPDATA ?? '', 'com.vesselassistant.app', 'logs', 'vessel-assistant.log');
    await browser.waitUntil(
      async () => existsSync(logPath) && readFileSync(logPath, 'utf8').includes(marker),
      { timeout: 10_000, timeoutMsg: `log file at ${logPath} never contained marker ${marker}` },
    );
  });
});
