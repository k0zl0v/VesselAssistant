import { useState } from 'react';
import './App.css';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useT } from './i18n';
import { ReferencePage } from './pages/ReferencePage';
import { ToolsPage } from './pages/ToolsPage';
import { VoyagePage } from './pages/VoyagePage';

type Tab = 'voyages' | 'reference' | 'tools';

const TABS: { key: Tab; labelKey: 'app.nav.voyages' | 'app.nav.reference' | 'app.nav.tools' }[] = [
  { key: 'voyages', labelKey: 'app.nav.voyages' },
  { key: 'reference', labelKey: 'app.nav.reference' },
  { key: 'tools', labelKey: 'app.nav.tools' },
];

export default function App() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('voyages');

  return (
    <>
      <nav className="appnav">
        <span className="appnav-brand">{t('app.brand')}</span>
        {TABS.map((tabDef) => (
          <button
            key={tabDef.key}
            type="button"
            onClick={() => setTab(tabDef.key)}
            className={`appnav-tab ${tab === tabDef.key ? 'active' : ''}`}
          >
            {t(tabDef.labelKey)}
          </button>
        ))}
        <span className="appnav-spacer" style={{ flex: 1 }} />
        <LanguageSwitcher />
      </nav>
      {tab === 'voyages' && <VoyagePage />}
      {tab === 'reference' && <ReferencePage />}
      {tab === 'tools' && <ToolsPage />}
    </>
  );
}
