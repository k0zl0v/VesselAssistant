/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';
import { en } from '../../i18n/en';
import { reportError } from '../../errorReporting';

// Replaces the log-file write (plugin-log IPC / console) — the only side effect of reportError.
vi.mock('../../errorReporting', () => ({ reportError: vi.fn(async () => undefined) }));

function Thrower(): never {
  throw new Error('render boom');
}

describe('ErrorBoundary (NFR-8)', () => {
  afterEach(() => {
    vi.mocked(reportError).mockClear();
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>APP CONTENT</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('APP CONTENT')).toBeInTheDocument();
    expect(reportError).not.toHaveBeenCalled();
  });

  it('a throwing child → app.crashed fallback with a reload button, reportError("render", error)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText(en['app.crashed'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['app.reload'] })).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledOnce();
    const [source, err] = vi.mocked(reportError).mock.calls[0]!;
    expect(source).toBe('render');
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('render boom');
  });
});
