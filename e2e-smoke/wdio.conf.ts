import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** `npm run tauri build -- --debug --no-bundle` output; Windows-only runner, hence the `.exe`. */
const APPLICATION_PATH = path.resolve(here, '../src-tauri/target/debug/vessel-assistant.exe');

const TAURI_DRIVER_PORT = 4444;

interface TauriCapabilities extends WebdriverIO.Capabilities {
  'tauri:options': { application: string };
}

// WebdriverIO 9 opens a WebDriver BiDi session by default; through tauri-driver and
// msedgedriver that session is bound to an about:blank target instead of the app page.
const capabilities: TauriCapabilities = {
  browserName: 'wry',
  'tauri:options': { application: APPLICATION_PATH },
  'wdio:enforceWebDriverClassic': true,
};

let tauriDriver: ChildProcess | undefined;

/**
 * `tauri-driver` proxies WebDriver calls to `msedgedriver` (Windows WebView2) and forwards
 * them to the built app's window; one instance per wdio run, matching maxInstances: 1.
 */
function onPrepare(): void {
  tauriDriver = spawn('tauri-driver', ['--port', String(TAURI_DRIVER_PORT)], {
    stdio: [null, process.stdout, process.stderr],
  });
}

function onComplete(): void {
  tauriDriver?.kill();
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  hostname: '127.0.0.1',
  port: TAURI_DRIVER_PORT,
  specs: ['./specs/**/*.spec.ts'],
  maxInstances: 1,
  capabilities: [capabilities],
  logLevel: 'info',
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120_000,
  },
  onPrepare,
  onComplete,
};
