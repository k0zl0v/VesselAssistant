import type { ReactNode } from 'react';

interface Props {
  eyebrow?: ReactNode;
  title: ReactNode;
  titleTestId?: string;
  chip?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

/** White header strip above every screen; actions sit on the right. */
export function PageHeader({ eyebrow, title, titleTestId, chip, meta, actions }: Props) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <div className="page-title-row">
          <h1 className="page-title" data-testid={titleTestId}>
            {title}
          </h1>
          {chip}
        </div>
        {meta && <div className="page-meta">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/** «Рейс DEMO-001 · KAVKAZ IV» above the title of a voyage-scoped screen. */
export function voyageEyebrow(label: string, voyage_no: string, vessel: string | null | undefined): string {
  return vessel ? `${label} ${voyage_no} · ${vessel}` : `${label} ${voyage_no}`;
}
