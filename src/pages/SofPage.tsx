import { SofPanel } from '../components/SofPanel';
import { getDb } from '../db';
import { useT } from '../i18n';
import { SofService } from '../services/SofService';
import { PageHeader, voyageEyebrow } from '../shell/PageHeader';
import { useVoyage } from '../shell/VoyageContext';

/** Interim SOF screen: the existing panel inside the new shell. */
export function SofPage() {
  const t = useT();
  const { data, isOpen, refresh } = useVoyage();
  if (!data) return null;
  return (
    <>
      <PageHeader
        eyebrow={voyageEyebrow(t('shell.voyage'), data.voyage.voyage_no, data.vessel?.name)}
        title={t('sof.title')}
      />
      <div className="page-body">
        <SofPanel
          voyage_id={data.voyage.id}
          events={data.sofEvents}
          voyageOpen={isOpen}
          busy={false}
          onAdd={async (input) => {
            await new SofService(await getDb()).create(input);
            await refresh();
          }}
          onDelete={async (id) => {
            await new SofService(await getDb()).delete(id);
            await refresh();
          }}
        />
      </div>
    </>
  );
}
