import { useT } from '../i18n';
import { useWorkbookExport } from './documents/useWorkbookExport';
import { Icon } from './ui/Icon';

interface Props {
  voyage_id: string;
  voyage_no: string;
  vessel_name: string;
  className?: string;
}

export function ExportButton({ voyage_id, voyage_no, vessel_name, className = 'btn' }: Props) {
  const t = useT();
  const { busy, error, run } = useWorkbookExport({ voyage_id, voyage_no, vessel_name });

  return (
    <>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className={className}
        data-testid="export-button"
      >
        <Icon name="export" size={14} />
        {busy ? t('export.exporting') : t('export.button')}
      </button>
      {error && (
        <span className="field-error" role="alert" data-testid="export-error">
          {error}
        </span>
      )}
    </>
  );
}
