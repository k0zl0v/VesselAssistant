import { useT } from '../i18n';
import { PageHeader, voyageEyebrow } from '../shell/PageHeader';
import { useVoyage } from '../shell/VoyageContext';

/** Placeholder — replaced by the OGV operations screen. */
export function OgvPage() {
  const t = useT();
  const { data } = useVoyage();
  if (!data) return null;
  return (
    <PageHeader
      eyebrow={voyageEyebrow(t('shell.voyage'), data.voyage.voyage_no, data.vessel?.name)}
      title={t('nav.ogv')}
    />
  );
}
