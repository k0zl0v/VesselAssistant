import { useCallback } from 'react';
import { useT } from '../i18n';
import type { Db } from '../services/db';
import type { DocumentRevision } from '../services/DocumentRevisionService';
import { useRecordedExport } from './documents/useRecordedExport';
import { sanitizeFilePart } from './documents/useWorkbookExport';
import { Icon } from './ui/Icon';

interface Props {
  voyage_id: string;
  voyage_no: string;
  vessel_name: string;
  className?: string;
  onRecorded?: (revision: DocumentRevision) => void;
}

export function AuditExportButton({ voyage_id, voyage_no, vessel_name, className = 'btn', onRecorded }: Props) {
  const t = useT();
  const generate = useCallback(
    async (db: Db) => {
      const { DocumentEngine } = await import('../services/DocumentEngine');
      return new DocumentEngine(db).generateAuditLog(voyage_id);
    },
    [voyage_id],
  );
  const { busy, error, run } = useRecordedExport({
    voyage_id,
    document_type: 'audit_log',
    dialogTitle: t('audit.export.dialog.title'),
    defaultPath: `Audit Log ${sanitizeFilePart(vessel_name)} ${sanitizeFilePart(voyage_no)}.xlsx`,
    generate,
    onRecorded,
  });

  return (
    <>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className={className}
        data-testid="audit-export"
      >
        <Icon name="export" size={14} />
        {busy ? t('audit.export.exporting') : t('audit.export.button')}
      </button>
      {error && (
        <span className="field-error" role="alert" data-testid="audit-export-error">
          {error}
        </span>
      )}
    </>
  );
}
