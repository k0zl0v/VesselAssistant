import { AUDIT_LIMIT, AuditLogPanel } from '../components/AuditLogPanel';
import { useT } from '../i18n';
import { PageHeader } from '../shell/PageHeader';

export function AuditPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('nav.audit')} meta={t('audit.meta', { limit: AUDIT_LIMIT })} />
      <div className="page-body">
        <AuditLogPanel />
      </div>
    </>
  );
}
