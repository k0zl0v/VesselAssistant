import { useEffect, useMemo, useState } from 'react';
import { loadCargoByHold } from '../components/documents/cargoByHold';
import { LoadPlanPreview } from '../components/documents/LoadPlanPreview';
import { workbookSheets } from '../components/documents/sheets';
import { defaultExportFileName, useWorkbookExport } from '../components/documents/useWorkbookExport';
import { WorkbookContents } from '../components/documents/WorkbookContents';
import { Icon } from '../components/ui/Icon';
import { ErrorState } from '../components/ui/states';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import { formatDate } from '../shell/format';
import { AuditExportButton } from '../components/AuditExportButton';
import { PageHeader, voyageEyebrow } from '../shell/PageHeader';
import { StatusChip } from '../shell/StatusChip';
import { useVoyage } from '../shell/VoyageContext';
import '../styles/documents.css';

const localIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** «Документы»: what the XLSX workbook contains, its file name, a preview of sheet 1, and the export itself. */
export function DocumentsPage() {
  const t = useT();
  const { data, isOpen } = useVoyage();
  const [cargoByHold, setCargoByHold] = useState<Map<string, string> | null>(null);
  const [cargoError, setCargoError] = useState<string | null>(null);

  const voyageId = data?.voyage.id ?? '';
  const calculatedAt = data?.calculatedAt;
  const vesselName = data?.vessel?.name ?? null;
  const exporter = useWorkbookExport({
    voyage_id: voyageId,
    voyage_no: data?.voyage.voyage_no ?? '',
    vessel_name: vesselName ?? '',
  });

  // Re-read after every recalculation: a new lot can change a hold's cargo label.
  useEffect(() => {
    if (!voyageId) return;
    let alive = true;
    setCargoError(null);
    void (async () => {
      try {
        const map = await loadCargoByHold(await getDb(), voyageId);
        if (alive) setCargoByHold(map);
      } catch (e) {
        if (alive) setCargoError(describeError(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [voyageId, calculatedAt]);

  const sheets = useMemo(() => workbookSheets(vesselName ?? ''), [vesselName]);

  if (!data) return null;
  const { voyage, calc, overview } = data;
  const route = [data.loadingPort?.name, data.dischargingPort?.name].filter(Boolean).join(' → ');

  return (
    <>
      <PageHeader
        eyebrow={voyageEyebrow(t('shell.voyage'), voyage.voyage_no, vesselName)}
        title={t('nav.documents')}
        chip={isOpen ? undefined : <StatusChip status={voyage.status} />}
        actions={
          <>
            {data.vessel && (
              <AuditExportButton voyage_id={voyage.id} voyage_no={voyage.voyage_no} vessel_name={data.vessel.name} />
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void exporter.run()}
              disabled={exporter.busy || !vesselName}
              data-testid="documents-generate"
            >
              <Icon name="export" size={14} />
              {exporter.busy ? t('documents.generating') : t('documents.generate')}
            </button>
          </>
        }
      />

      <div className="page-body documents-body">
        {exporter.error && (
          <ErrorState title={t('shell.action_failed')} message={exporter.error} testId="documents-export-error" />
        )}
        {exporter.savedPath && !exporter.error && (
          <div className="banner banner-positive doc-saved" role="status" data-testid="documents-export-saved">
            <Icon name="check" size={14} />
            <span className="doc-saved-title">{t('documents.saved.title')}</span>
            <span className="doc-saved-path">{exporter.savedPath}</span>
          </div>
        )}

        <div className="documents-grid">
          <WorkbookContents
            sheets={sheets}
            sofEventCount={data.sofEvents.length}
            sofOverlapCount={data.sofOverlapCount}
            dischargeOperationCount={overview.discharge_operation_count}
            fileName={vesselName ? defaultExportFileName(vesselName, voyage.voyage_no) : null}
          />
          {cargoError ? (
            <ErrorState title={t('shell.action_failed')} message={cargoError} testId="documents-preview-error" />
          ) : (
            <LoadPlanPreview
              vessel_name={vesselName ?? '—'}
              voyage_no={voyage.voyage_no}
              route={route}
              asOf={formatDate(localIsoDate(data.calculatedAt))}
              calc={calc}
              cargoByHold={cargoByHold}
              sheets={sheets}
            />
          )}
        </div>
      </div>
    </>
  );
}
