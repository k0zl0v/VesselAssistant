import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { Icon } from './Icon';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  testId?: string;
}

/**
 * Modal dialog: Esc and the backdrop close it, focus moves inside on open and
 * returns to the opener on close, Tab stays within the dialog.
 */
export function Dialog({ title, subtitle, onClose, children, footer, wide, testId }: Props) {
  const t = useT();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    // A child with React autoFocus has already taken focus during commit; keep it.
    if (!root?.contains(document.activeElement)) {
      const first = root?.querySelector<HTMLElement>('input, select, textarea, button:not(.dialog-close)');
      (first ?? root)?.focus();
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (items.length === 0) return;
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`dialog${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <div className="dialog-header">
          <div>
            <h2 className="dialog-title" id={titleId}>
              {title}
            </h2>
            {subtitle && <div className="dialog-subtitle">{subtitle}</div>}
          </div>
          <button
            type="button"
            className="btn btn-icon btn-quiet dialog-close"
            onClick={onClose}
            aria-label={t('ui.dialog.close')}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
