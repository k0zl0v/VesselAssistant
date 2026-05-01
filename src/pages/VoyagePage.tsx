import { useEffect, useState } from 'react';
import { HoldTable } from '../components/HoldTable';
import { VoyageTotals } from '../components/VoyageTotals';
import { getDb } from '../db';
import { seedKavkazDemo } from '../seedDemo';
import {
  CalculationService,
  type VoyageCalcResult,
} from '../services/CalculationService';
import { VoyageService } from '../services/VoyageService';
import type { Voyage } from '../services/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; voyages: Voyage[]; selectedId: string | null; calc: VoyageCalcResult | null };

export function VoyagePage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  async function loadVoyages(selectedId?: string | null): Promise<void> {
    const db = await getDb();
    const voyages = await db.select<Voyage>(
      `SELECT * FROM voyages ORDER BY created_at DESC`,
    );
    let calc: VoyageCalcResult | null = null;
    const target = selectedId ?? voyages[0]?.id ?? null;
    if (target) {
      calc = await new CalculationService(db).calculate(target);
    }
    setState({ kind: 'ready', voyages, selectedId: target, calc });
  }

  useEffect(() => {
    loadVoyages().catch((e: unknown) =>
      setState({ kind: 'error', message: String(e) }),
    );
  }, []);

  async function handleSeedDemo(): Promise<void> {
    setBusy(true);
    try {
      const db = await getDb();
      const { voyage_id } = await seedKavkazDemo(db);
      await loadVoyages(voyage_id);
    } catch (e) {
      setState({ kind: 'error', message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSelect(id: string): Promise<void> {
    setBusy(true);
    try {
      await loadVoyages(id);
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(id: string): Promise<void> {
    setBusy(true);
    try {
      const db = await getDb();
      await new VoyageService(db).close(id);
      await loadVoyages(id);
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === 'loading') {
    return <main className="container"><p>Loading…</p></main>;
  }
  if (state.kind === 'error') {
    return (
      <main className="container">
        <h1>VesselAssistant</h1>
        <p className="error">Database error: {state.message}</p>
      </main>
    );
  }

  const { voyages, selectedId, calc } = state;
  const selected = voyages.find((v) => v.id === selectedId) ?? null;

  return (
    <main className="container">
      <header className="topbar">
        <h1>VesselAssistant</h1>
        <div className="topbar-actions">
          {voyages.length > 0 && (
            <select
              value={selectedId ?? ''}
              onChange={(e) => void handleSelect(e.target.value)}
              disabled={busy}
            >
              {voyages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.voyage_no} {v.status === 'closed' ? '(closed)' : ''}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => void handleSeedDemo()} disabled={busy}>
            Seed demo (KAVKAZ IV)
          </button>
        </div>
      </header>

      {voyages.length === 0 && (
        <p className="hint">
          No voyages yet. Click <em>Seed demo</em> to load the KAVKAZ IV
          baseline from Appendix C of the TZ.
        </p>
      )}

      {selected && calc && (
        <>
          <section className="voyage-card">
            <h2>
              Voyage {selected.voyage_no} — {' '}
              <span className={`status status-${selected.status}`}>
                {selected.status}
              </span>
            </h2>
            <VoyageTotals totals={calc.totals} />
            {selected.status === 'open' && (
              <button
                onClick={() => void handleClose(selected.id)}
                disabled={busy}
                className="secondary"
              >
                Close voyage
              </button>
            )}
          </section>

          <section>
            <h3>Holds</h3>
            <HoldTable holds={calc.holds} />
          </section>
        </>
      )}
    </main>
  );
}
