import { useState } from 'react';
import './App.css';
import { ReferencePage } from './pages/ReferencePage';
import { VoyagePage } from './pages/VoyagePage';

type Tab = 'voyages' | 'reference';

export default function App() {
  const [tab, setTab] = useState<Tab>('voyages');

  return (
    <>
      <nav className="appnav">
        <span className="appnav-brand">VesselAssistant</span>
        <button
          type="button"
          onClick={() => setTab('voyages')}
          className={`appnav-tab ${tab === 'voyages' ? 'active' : ''}`}
        >
          Voyages
        </button>
        <button
          type="button"
          onClick={() => setTab('reference')}
          className={`appnav-tab ${tab === 'reference' ? 'active' : ''}`}
        >
          Reference
        </button>
      </nav>
      {tab === 'voyages' ? <VoyagePage /> : <ReferencePage />}
    </>
  );
}
