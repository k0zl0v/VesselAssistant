import { useEffect, useState } from 'react';
import { HoldTable } from '../components/HoldTable';
import { NewVoyageForm } from '../components/NewVoyageForm';
import { VoyageTotals } from '../components/VoyageTotals';
import { getDb } from '../db';
import { seedKavkazDemo } from '../seedDemo';
import {
  CalculationService,
  type VoyageCalcResult,
} from '../services/CalculationService';
import { CargoLotService } from '../services/CargoLotService';
import { listHoldLots, type HoldLotView } from '../services/HoldLotsView';
import { OgvService } from '../services/OgvService';
import { ReferenceService, type Cargo, type Vessel } from '../services/ReferenceService';
import { VoyageService } from '../services/VoyageService';
import type { AddLotInput, DischargeInput, Voyage } from '../services/types';

interface ReadyState {
  voyages: Voyage[];
  selectedId: string | null;
  calc: VoyageCalcResult | null;
  vessels: Vessel[];
  cargoes: Cargo[];
  lotsByHold: Record<string, HoldLotView[]>;
  expandedHoldId: string | null;
  showNewVoyage: boolean;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | ({ kind: 'ready' } & ReadyState);

export function VoyagePage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  async function refresh(opts?: {
    selectedId?: string | null;
    expandedHoldId?: string | null;
    showNewVoyage?: boolean;
  }): Promise<void> {
    const db = await getDb();
    const voyages = await db.select<Voyage>(
      `SELECT * FROM voyages ORDER BY created_at DESC`,
    );
    const ref = new ReferenceService(db);
    const [vessels, cargoes] = await Promise.all([ref.listVessels(), ref.listCargoes()]);

    const target = opts?.selectedId ?? voyages[0]?.id ?? null;
    let calc: VoyageCalcResult | null = null;
    if (target) {
      calc = await new CalculationService(db).calculate(target);
    }

    const expandedHoldId = opts?.expandedHoldId ?? null;
    const lotsByHold: Record<string, HoldLotView[]> = {};
    if (expandedHoldId && target) {
      lotsByHold[expandedHoldId] = await listHoldLots(db, target, expandedHoldId);
    }

    setState({
      kind: 'ready',
      voyages,
      selectedId: target,
      calc,
      vessels,
      cargoes,
      lotsByHold,
      expandedHoldId,
      showNewVoyage: opts?.showNewVoyage ?? false,
    });
  }

  useEffect(() => {
    refresh().catch((e: unknown) =>
      setState({ kind: 'error', message: String(e) }),
    );
  }, []);

  async function withBusy<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      setState((s) =>
        s.kind === 'ready' ? s : { kind: 'error', message: String(e) },
      );
      throw e;
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

  const {
    voyages,
    selectedId,
    calc,
    vessels,
    cargoes,
    lotsByHold,
    expandedHoldId,
    showNewVoyage,
  } = state;
  const selected = voyages.find((v) => v.id === selectedId) ?? null;

  return (
    <main className="container">
      <header className="topbar">
        <h1>Voyages</h1>
        <div className="topbar-actions">
          {voyages.length > 0 && (
            <select
              value={selectedId ?? ''}
              onChange={(e) =>
                void withBusy(() =>
                  refresh({ selectedId: e.target.value, expandedHoldId: null }),
                )
              }
              disabled={busy}
            >
              {voyages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.voyage_no} {v.status === 'closed' ? '(closed)' : ''}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => void refresh({ selectedId, showNewVoyage: true })}
            disabled={busy}
            className="secondary"
          >
            New voyage
          </button>
          <button
            onClick={() =>
              void withBusy(async () => {
                const db = await getDb();
                const { voyage_id } = await seedKavkazDemo(db);
                await refresh({ selectedId: voyage_id });
              })
            }
            disabled={busy}
          >
            Seed demo (KAVKAZ IV)
          </button>
        </div>
      </header>

      {showNewVoyage && (
        <NewVoyageForm
          vessels={vessels}
          busy={busy}
          onSubmit={async (input) => {
            await withBusy(async () => {
              const db = await getDb();
              const v = await new VoyageService(db).create(input);
              await refresh({ selectedId: v.id, showNewVoyage: false });
            });
          }}
          onCancel={() => void refresh({ selectedId, showNewVoyage: false })}
        />
      )}

      {voyages.length === 0 && !showNewVoyage && (
        <p className="hint">
          No voyages yet. Click <em>Seed demo</em> for the KAVKAZ IV baseline,
          or <em>New voyage</em> if you have already added a vessel in{' '}
          <strong>Reference</strong>.
        </p>
      )}

      {selected && calc && (
        <>
          <section className="voyage-card">
            <h2>
              Voyage {selected.voyage_no} —{' '}
              <span className={`status status-${selected.status}`}>
                {selected.status}
              </span>
            </h2>
            <VoyageTotals totals={calc.totals} />
            {selected.status === 'open' && (
              <button
                onClick={() =>
                  void withBusy(async () => {
                    const db = await getDb();
                    await new VoyageService(db).close(selected.id);
                    await refresh({ selectedId: selected.id });
                  })
                }
                disabled={busy}
                className="secondary"
              >
                Close voyage
              </button>
            )}
          </section>

          <section>
            <h3>Holds</h3>
            <HoldTable
              holds={calc.holds}
              voyage_id={selected.id}
              cargoes={cargoes}
              lotsByHold={lotsByHold}
              expandedHoldId={expandedHoldId}
              onToggleExpand={(holdId) =>
                void refresh({
                  selectedId: selected.id,
                  expandedHoldId: holdId,
                })
              }
              onAddLot={async (input: AddLotInput) => {
                await withBusy(async () => {
                  const db = await getDb();
                  await new CargoLotService(db).add(input);
                  await refresh({
                    selectedId: selected.id,
                    expandedHoldId: input.hold_id,
                  });
                });
              }}
              onDischarge={async (input: DischargeInput) => {
                await withBusy(async () => {
                  const db = await getDb();
                  await new OgvService(db).discharge(input);
                  await refresh({
                    selectedId: selected.id,
                    expandedHoldId: input.hold_id,
                  });
                });
              }}
              busy={busy}
              voyageOpen={selected.status === 'open'}
            />
          </section>
        </>
      )}
    </main>
  );
}
