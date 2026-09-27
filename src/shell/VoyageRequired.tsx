import type { ReactNode } from 'react';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { useT } from '../i18n';
import { useVoyage, type VoyageData } from './VoyageContext';

interface Props {
  onNewVoyage: () => void;
  children: (data: VoyageData) => ReactNode;
}

/** Renders the four screen states for voyage-scoped screens; `children` get the loaded voyage. */
export function VoyageRequired({ onNewVoyage, children }: Props) {
  const t = useT();
  const { state, voyages, data, reload } = useVoyage();

  if (state.kind === 'loading') {
    return (
      <div className="page-body">
        <Skeleton note={t('shell.recalc_note')} />
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="page-body">
        <ErrorState
          title={t('shell.db_error.title')}
          message={t('app.db_error', { message: state.message })}
          hint={t('shell.db_error.hint')}
          details={state.details}
          actions={
            <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => void reload()}>
              {t('shell.retry')}
            </button>
          }
          testId="voyage-load-error"
        />
      </div>
    );
  }
  if (voyages.length === 0) {
    return (
      <div className="page-body">
        <EmptyState
          icon="ship"
          title={t('shell.empty.title')}
          text={t('shell.empty.text')}
          actions={
            <button type="button" className="btn btn-sm btn-primary" onClick={onNewVoyage} data-testid="voyage-empty-new">
              {t('voyage.new')}
            </button>
          }
          testId="voyage-empty-hint"
        />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page-body">
        <Skeleton note={t('shell.recalc_note')} />
      </div>
    );
  }
  return <>{children(data)}</>;
}
