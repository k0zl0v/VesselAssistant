import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../errorReporting';
import { useT } from '../i18n';
import { ErrorState } from './ui/states';

function CrashFallback() {
  const t = useT();
  return (
    <main className="crash-screen">
      <ErrorState
        title={t('app.crashed')}
        message={t('app.crashed_hint')}
        actions={
          <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => window.location.reload()}>
            {t('app.reload')}
          </button>
        }
      />
    </main>
  );
}

/** NFR-8: a render error goes to the file log and the app shows a reload screen instead of a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo): void {
    void reportError('render', error);
  }

  render(): ReactNode {
    return this.state.failed ? <CrashFallback /> : this.props.children;
  }
}
