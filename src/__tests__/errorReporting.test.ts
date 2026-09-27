/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { reportError } from '../errorReporting';

describe('reportError (NFR-8)', () => {
  afterEach(() => {
    clearMocks();
    Reflect.deleteProperty(window, 'isTauri');
    vi.restoreAllMocks();
  });

  it('outside Tauri writes to console.error exactly once', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await reportError('render', new Error('boom'));

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0]![0])).toContain('[render]');
    expect(String(consoleError.mock.calls[0]![0])).toContain('boom');
  });

  it('inside Tauri sends an error-level plugin:log|log call carrying the source', async () => {
    const calls: { cmd: string; args: unknown }[] = [];
    mockIPC((cmd, args) => {
      calls.push({ cmd, args });
      return null;
    });
    Object.assign(window, { isTauri: true });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await reportError('unhandledrejection', 'disk full');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe('plugin:log|log');
    expect(calls[0]!.args).toMatchObject({ level: 5, message: expect.stringContaining('[unhandledrejection]') });
    expect(calls[0]!.args).toMatchObject({ message: expect.stringContaining('disk full') });
    expect(consoleError).not.toHaveBeenCalled();
  });
});
