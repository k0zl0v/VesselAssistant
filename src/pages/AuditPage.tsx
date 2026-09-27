import { AuditLogPanel } from '../components/AuditLogPanel';
import { useT } from '../i18n';
import { PageHeader } from '../shell/PageHeader';

/** Interim audit screen: the existing panel inside the new shell. */
export function AuditPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('audit.title')} />
      <div className="page-body">
        <AuditLogPanel />
      </div>
    </>
  );
}
