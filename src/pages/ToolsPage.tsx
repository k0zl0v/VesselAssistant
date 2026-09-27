import { BackupPanel } from '../components/BackupPanel';
import { ImportPanel } from '../components/ImportPanel';
import { useT } from '../i18n';
import { PageHeader } from '../shell/PageHeader';

export function ToolsPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('nav.tools')} meta={t('tools.intro')} />
      <div className="page-body">

      <section className="reference-block">
        <h2>{t('tools.backup_section')}</h2>
        <BackupPanel />
      </section>

      <section className="reference-block">
        <h2>{t('tools.import_section')}</h2>
        <ImportPanel />
      </section>
      </div>
    </>
  );
}
