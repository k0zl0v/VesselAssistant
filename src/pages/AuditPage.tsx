import { AuditExportButton } from '../components/AuditExportButton';
import { AUDIT_LIMIT, AuditLogPanel } from '../components/AuditLogPanel';
import { useT } from '../i18n';
import { PageHeader } from '../shell/PageHeader';
import { useVoyage } from '../shell/VoyageContext';

export function AuditPage() {
  const t = useT();
  const { data } = useVoyage();
  return (
    <>
      <PageHeader
        title={t('nav.audit')}
        meta={t('audit.meta', { limit: AUDIT_LIMIT })}
        actions={
          data?.vessel && (
            <AuditExportButton
              voyage_id={data.voyage.id}
              voyage_no={data.voyage.voyage_no}
              vessel_name={data.vessel.name}
            />
          )
        }
      />
      <div className="page-body">
        <AuditLogPanel />
      </div>
    </>
  );
}
