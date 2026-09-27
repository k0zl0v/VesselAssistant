import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  tone?: 'warning' | 'danger';
  testId?: string;
}

/**
 * Inline confirmation instead of window.confirm (banned by ui-kit): the
 * consequence stays on screen next to the control that asked for it.
 */
export function ConfirmPanel({
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy,
  tone = 'warning',
  testId,
}: Props) {
  return (
    <div className={`confirm-panel${tone === 'danger' ? ' danger' : ''}`} role="alertdialog" data-testid={testId}>
      <div className="confirm-panel-text">{children}</div>
      <div className="confirm-panel-actions">
        <button
          type="button"
          className="btn btn-sm"
          onClick={onCancel}
          disabled={busy}
          data-testid={testId ? `${testId}-cancel` : undefined}
          autoFocus
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={busy}
          data-testid={testId ? `${testId}-confirm` : undefined}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
