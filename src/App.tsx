import './App.css';
import { formatTons } from './calc';

function App() {
  const totalEmpty98Demo = 15881.924;

  return (
    <main className="container">
      <h1>VesselAssistant</h1>
      <p>Offline-first desktop app for ship loading/discharging calculations.</p>
      <p>
        Demo: Total Empty Space 98% from Appendix C ={' '}
        <strong>{formatTons(totalEmpty98Demo)}</strong> t
      </p>
    </main>
  );
}

export default App;
