import { AuditLogPanel } from '../components/AuditLogPanel';
import { BackupPanel } from '../components/BackupPanel';
import { ImportPanel } from '../components/ImportPanel';
import { useT } from '../i18n';

export function ToolsPage() {
  const t = useT();
  return (
    <main className="container">
      <h1>{t('tools.title')}</h1>
      <p className="hint">{t('tools.intro')}</p>

      <section className="reference-block">
        <h2>{t('tools.backup_section')}</h2>
        <BackupPanel />
      </section>

      <section className="reference-block">
        <h2>{t('tools.import_section')}</h2>
        <ImportPanel />
      </section>

      <section className="reference-block">
        <h2>{t('tools.audit_section')}</h2>
        <AuditLogPanel />
      </section>
    </main>
  );
}
