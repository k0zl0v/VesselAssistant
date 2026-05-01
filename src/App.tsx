import { useState } from 'react';
import './App.css';
import { ReferencePage } from './pages/ReferencePage';
import { ToolsPage } from './pages/ToolsPage';
import { VoyagePage } from './pages/VoyagePage';

type Tab = 'voyages' | 'reference' | 'tools';

const TABS: { key: Tab; label: string }[] = [
  { key: 'voyages', label: 'Voyages' },
  { key: 'reference', label: 'Reference' },
  { key: 'tools', label: 'Tools' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('voyages');

  return (
    <>
      <nav className="appnav">
        <span className="appnav-brand">VesselAssistant</span>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`appnav-tab ${tab === t.key ? 'active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'voyages' && <VoyagePage />}
      {tab === 'reference' && <ReferencePage />}
      {tab === 'tools' && <ToolsPage />}
    </>
  );
}
