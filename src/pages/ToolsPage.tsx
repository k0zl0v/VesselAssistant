import { BackupPanel } from '../components/BackupPanel';
import { ImportPanel } from '../components/ImportPanel';
import { useT } from '../i18n';
import { PageHeader } from '../shell/PageHeader';
import '../styles/tools.css';

export function ToolsPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('nav.tools')} meta={t('tools.meta')} />
      <div className="page-body">
        <div className="tools-grid">
          <BackupPanel />
          <ImportPanel />
        </div>
      </div>
    </>
  );
}
