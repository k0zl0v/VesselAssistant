import { BackupPanel } from '../components/BackupPanel';
import { ImportPanel } from '../components/ImportPanel';

export function ToolsPage() {
  return (
    <main className="container">
      <h1>Tools</h1>
      <p className="hint">
        Project-level operations — local backup/restore (FR-14) and Excel
        import from KAVKAZ IV-style templates (FR-12).
      </p>

      <section className="reference-block">
        <h2>Backup &amp; restore</h2>
        <BackupPanel />
      </section>

      <section className="reference-block">
        <h2>Import from Excel</h2>
        <ImportPanel />
      </section>
    </main>
  );
}
