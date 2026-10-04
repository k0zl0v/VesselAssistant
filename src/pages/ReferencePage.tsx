import { useState } from 'react';
import { CargoesTab, CranesTab, PortsTab } from '../components/reference/ListTabs';
import { useReferenceData } from '../components/reference/useReferenceData';
import { VesselsTab } from '../components/reference/VesselsTab';
import { ErrorState, Skeleton } from '../components/ui/states';
import { useT, type StringKey } from '../i18n';
import { PageHeader } from '../shell/PageHeader';
import { useVoyage } from '../shell/VoyageContext';
import '../styles/reference.css';

type Tab = 'vessels' | 'cargoes' | 'cranes' | 'ports';

const TABS: readonly { key: Tab; label: StringKey }[] = [
  { key: 'vessels', label: 'refs.tab.vessels' },
  { key: 'cargoes', label: 'refs.tab.cargoes' },
  { key: 'cranes', label: 'refs.tab.cranes' },
  { key: 'ports', label: 'refs.tab.ports' },
];

export function ReferencePage() {
  const t = useT();
  const { data: voyage, reload } = useVoyage();
  const { load, refresh } = useReferenceData();
  const [tab, setTab] = useState<Tab>('vessels');

  // The shell caches vessels/cargoes/ports for the voyage picker and the new-voyage dialog.
  async function changed(): Promise<void> {
    await Promise.all([refresh(), reload()]);
  }

  const tabs = (
    <div className="segmented refs-tabs" role="group" aria-label={t('refs.tabs_label')}>
      {TABS.map((d) => (
        <button
          key={d.key}
          type="button"
          aria-pressed={tab === d.key}
          onClick={() => setTab(d.key)}
          data-testid={`refs-tab-${d.key}`}
        >
          {t(d.label)}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader title={t('reference.title')} actions={tabs} />
      <div className="page-body refs-body">
        {load.kind === 'loading' && <Skeleton rows={6} />}
        {load.kind === 'error' && (
          <ErrorState
            title={t('refs.load_error.title')}
            message={load.message}
            hint={t('refs.load_error.hint')}
            details={load.details}
            actions={
              <button type="button" className="btn" onClick={() => void refresh()}>
                {t('refs.retry')}
              </button>
            }
            testId="refs-load-error"
          />
        )}
        {load.kind === 'ready' && tab === 'vessels' && (
          <VesselsTab
            vessels={load.data.vessels}
            holdsByVessel={load.data.holdsByVessel}
            voyage={voyage}
            onChanged={changed}
          />
        )}
        {load.kind === 'ready' && tab === 'cargoes' && <CargoesTab cargoes={load.data.cargoes} onChanged={changed} />}
        {load.kind === 'ready' && tab === 'cranes' && (
          <CranesTab cranes={load.data.cranes} working={load.data.working} onChanged={changed} />
        )}
        {load.kind === 'ready' && tab === 'ports' && <PortsTab ports={load.data.ports} onChanged={changed} />}
      </div>
    </>
  );
}
