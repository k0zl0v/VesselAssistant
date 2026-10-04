import { useState } from 'react';
import './App.css';
import { AuditPage } from './pages/AuditPage';
import { CargoLayersPage } from './pages/CargoLayersPage';
import { CraneCorrectionPage } from './pages/CraneCorrectionPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { LoadPlanPage } from './pages/LoadPlanPage';
import { OgvPage } from './pages/OgvPage';
import { ReferencePage } from './pages/ReferencePage';
import { SofPage } from './pages/SofPage';
import { ToolsPage } from './pages/ToolsPage';
import { NavigationProvider, type Screen } from './shell/navigation';
import { NewVoyageDialog } from './shell/NewVoyageDialog';
import { Rail } from './shell/Rail';
import { VoyageProvider } from './shell/VoyageContext';
import { VoyageRequired } from './shell/VoyageRequired';

export default function App() {
  const [screen, setScreen] = useState<Screen>('load-plan');
  const [newVoyage, setNewVoyage] = useState(false);
  const openNewVoyage = () => setNewVoyage(true);

  return (
    <VoyageProvider>
      <NavigationProvider value={{ screen, navigate: setScreen }}>
        <div className="shell">
          <Rail onNewVoyage={openNewVoyage} />
          <main className="workspace">
            {screen === 'load-plan' && <VoyageRequired onNewVoyage={openNewVoyage}>{() => <LoadPlanPage />}</VoyageRequired>}
            {screen === 'layers' && <VoyageRequired onNewVoyage={openNewVoyage}>{() => <CargoLayersPage />}</VoyageRequired>}
            {screen === 'ogv' && <VoyageRequired onNewVoyage={openNewVoyage}>{() => <OgvPage />}</VoyageRequired>}
            {screen === 'cranes' && <VoyageRequired onNewVoyage={openNewVoyage}>{() => <CraneCorrectionPage />}</VoyageRequired>}
            {screen === 'sof' && <VoyageRequired onNewVoyage={openNewVoyage}>{() => <SofPage />}</VoyageRequired>}
            {screen === 'documents' && <VoyageRequired onNewVoyage={openNewVoyage}>{() => <DocumentsPage />}</VoyageRequired>}
            {screen === 'reference' && <ReferencePage />}
            {screen === 'tools' && <ToolsPage />}
            {screen === 'audit' && <AuditPage />}
          </main>
        </div>
        {newVoyage && <NewVoyageDialog onClose={() => setNewVoyage(false)} />}
      </NavigationProvider>
    </VoyageProvider>
  );
}
