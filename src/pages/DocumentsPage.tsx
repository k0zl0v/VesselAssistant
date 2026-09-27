import { ExportButton } from '../components/ExportButton';
import { useT } from '../i18n';
import { PageHeader, voyageEyebrow } from '../shell/PageHeader';
import { useVoyage } from '../shell/VoyageContext';

/** Interim Documents screen: the existing export action inside the new shell. */
export function DocumentsPage() {
  const t = useT();
  const { data } = useVoyage();
  if (!data) return null;
  return (
    <PageHeader
      eyebrow={voyageEyebrow(t('shell.voyage'), data.voyage.voyage_no, data.vessel?.name)}
      title={t('nav.documents')}
      actions={
        data.vessel && (
          <ExportButton
            voyage_id={data.voyage.id}
            voyage_no={data.voyage.voyage_no}
            vessel_name={data.vessel.name}
            className="btn btn-primary"
          />
        )
      }
    />
  );
}
