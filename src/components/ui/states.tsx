import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { Icon, type IconName } from './Icon';

interface EmptyProps {
  icon?: IconName;
  title: string;
  text?: ReactNode;
  actions?: ReactNode;
  testId?: string;
}

/** «Пусто»: icon, one line of explanation, one action (ui-kit § Состояния экрана). */
export function EmptyState({ icon = 'table', title, text, actions, testId }: EmptyProps) {
  return (
    <div className="state-empty" data-testid={testId}>
      <Icon name={icon} size={28} strokeWidth={1.6} />
      <div className="state-title">{title}</div>
      {text && <p className="state-text">{text}</p>}
      {actions && <div className="state-actions">{actions}</div>}
    </div>
  );
}

interface ErrorProps {
  title: string;
  message: ReactNode;
  hint?: ReactNode;
  /** Technical detail, shown collapsed under «подробности» — never the main text. */
  details?: string;
  actions?: ReactNode;
  testId?: string;
}

/** «Ошибка данных»: explanation, what to do next, an action. */
export function ErrorState({ title, message, hint, details, actions, testId }: ErrorProps) {
  const t = useT();
  return (
    <div className="state-error" role="alert" data-testid={testId}>
      <div className="state-error-title">
        <Icon name="alert" size={16} />
        <span>{title}</span>
      </div>
      <p>{message}</p>
      {hint && <p className="state-error-hint">{hint}</p>}
      {details && (
        <details>
          <summary>{t('ui.error.details')}</summary>
          <pre>{details}</pre>
        </details>
      )}
      {actions && <div className="state-actions">{actions}</div>}
    </div>
  );
}

const SKELETON_WIDTHS = ['54px', '82px', '48px', '70px', '60px'];

/** «Загрузка»: table-row skeleton instead of a bare «Loading…». */
export function Skeleton({ rows = 5, note }: { rows?: number; note?: string }) {
  const t = useT();
  return (
    <div className="skeleton" aria-busy="true" aria-label={t('app.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton-bar" style={{ width: SKELETON_WIDTHS[i % SKELETON_WIDTHS.length] }} />
          <div className="skeleton-bar fill" />
        </div>
      ))}
      {note && <div className="field-hint">{note}</div>}
    </div>
  );
}
