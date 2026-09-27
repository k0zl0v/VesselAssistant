import { useEffect, useState } from 'react';
import { ExportButton } from '../components/ExportButton';
import { HoldTable } from '../components/HoldTable';
import { NewVoyageForm } from '../components/NewVoyageForm';
import { SofPanel } from '../components/SofPanel';
import { VoyageTotals } from '../components/VoyageTotals';
import { getAutoBackup } from '../autoBackup';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import { seedKavkazDemo } from '../seedDemo';
import {
  CalculationService,
  type VoyageCalcResult,
} from '../services/CalculationService';
import { CargoLotService } from '../services/CargoLotService';
import { listHoldLots, type HoldLotView } from '../services/HoldLotsView';
import { OgvService } from '../services/OgvService';
import { ReferenceService, type Cargo, type Vessel } from '../services/ReferenceService';
import {
  SofService,
  type CreateSofEventInput,
  type SofEvent,
} from '../services/SofService';
import { VoyageService } from '../services/VoyageService';
import type { AddLotInput, DischargeInput, Voyage } from '../services/types';

type SubTab = 'holds' | 'sof';

interface ReadyState {
  voyages: Voyage[];
  selectedId: string | null;
  calc: VoyageCalcResult | null;
  vessels: Vessel[];
  cargoes: Cargo[];
  lotsByHold: Record<string, HoldLotView[]>;
  expandedHoldId: string | null;
  showNewVoyage: boolean;
  subTab: SubTab;
  sofEvents: SofEvent[];
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | ({ kind: 'ready' } & ReadyState);

interface RefreshOpts {
  selectedId?: string | null;
  expandedHoldId?: string | null;
  showNewVoyage?: boolean;
  subTab?: SubTab;
}

export function VoyagePage() {
  const t = useT();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyVoyageNo, setCopyVoyageNo] = useState<string | null>(null);

  async function refresh(opts?: RefreshOpts): Promise<void> {
    const db = await getDb();
    const voyages = await db.select<Voyage>(
      `SELECT * FROM voyages ORDER BY created_at DESC`,
    );
    const ref = new ReferenceService(db);
    const [vessels, cargoes] = await Promise.all([ref.listVessels(), ref.listCargoes()]);

    const target = opts?.selectedId ?? voyages[0]?.id ?? null;
    const subTab: SubTab = opts?.subTab ?? 'holds';

    let calc: VoyageCalcResult | null = null;
    let sofEvents: SofEvent[] = [];
    if (target) {
      calc = await new CalculationService(db).calculate(target);
      sofEvents = await new SofService(db).list(target);
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
      subTab,
      sofEvents,
    });
  }

  useEffect(() => {
    refresh().catch((e: unknown) =>
      setState({ kind: 'error', message: describeError(e) }),
    );
  }, []);

  async function withBusy<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      setState((s) =>
        s.kind === 'ready' ? s : { kind: 'error', message: describeError(e) },
      );
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function voyageAction(fn: () => Promise<void>): Promise<void> {
    setActionError(null);
    try {
      await withBusy(fn);
    } catch (e) {
      setActionError(describeError(e));
    }
  }

  if (state.kind === 'loading') {
    return <main className="container"><p>{t('app.loading')}</p></main>;
  }
  if (state.kind === 'error') {
    return (
      <main className="container">
        <h1>{t('app.brand')}</h1>
        <p className="error" data-testid="voyage-load-error">{t('app.db_error', { message: state.message })}</p>
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
    subTab,
    sofEvents,
  } = state;
  const selected = voyages.find((v) => v.id === selectedId) ?? null;
  const selectedVessel = selected
    ? vessels.find((v) => v.id === selected.vessel_id) ?? null
    : null;

  return (
    <main className="container">
      <header className="topbar">
        <h1>{t('voyage.title')}</h1>
        <div className="topbar-actions">
          {voyages.length > 0 && (
            <select
              data-testid="voyage-select"
              value={selectedId ?? ''}
              onChange={(e) =>
                void withBusy(() =>
                  refresh({
                    selectedId: e.target.value,
                    expandedHoldId: null,
                    subTab,
                  }),
                )
              }
              disabled={busy}
            >
              {voyages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.voyage_no} {v.status === 'closed' ? t('voyage.closed_suffix') : ''}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => void refresh({ selectedId, showNewVoyage: true, subTab })}
            disabled={busy}
            className="secondary"
            data-testid="voyage-new"
          >
            {t('voyage.new')}
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
            data-testid="voyage-seed-demo"
          >
            {t('voyage.seed_demo')}
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
              const v = await new VoyageService(db, await getAutoBackup()).create(input);
              await refresh({ selectedId: v.id, showNewVoyage: false });
            });
          }}
          onCancel={() => void refresh({ selectedId, showNewVoyage: false, subTab })}
        />
      )}

      {voyages.length === 0 && !showNewVoyage && (
        <p
          className="hint"
          data-testid="voyage-empty-hint"
          dangerouslySetInnerHTML={{ __html: t('voyage.empty_hint') }}
        />
      )}

      {selected && calc && (
        <>
          <section className="voyage-card">
            <h2 data-testid="voyage-heading">
              {t('voyage.heading', { voyage_no: selected.voyage_no })}{' '}
              <span className={`status status-${selected.status}`} data-testid="voyage-status">
                {t(selected.status === 'open' ? 'voyage.status.open' : 'voyage.status.closed')}
              </span>
            </h2>
            <VoyageTotals totals={calc.totals} />
            <div className="voyage-actions">
              {selectedVessel && (
                <ExportButton
                  voyage_id={selected.id}
                  voyage_no={selected.voyage_no}
                  vessel_name={selectedVessel.name}
                />
              )}
              {selected.status === 'open' && (
                <button
                  onClick={() => {
                    if (!window.confirm(t('voyage.close.confirm', { voyage_no: selected.voyage_no }))) return;
                    void voyageAction(async () => {
                      const db = await getDb();
                      await new VoyageService(db, await getAutoBackup()).close(selected.id);
                      await refresh({ selectedId: selected.id, subTab });
                    });
                  }}
                  disabled={busy}
                  className="secondary"
                  data-testid="voyage-close"
                >
                  {t('voyage.close')}
                </button>
              )}
              {copyVoyageNo === null && (
                <button
                  type="button"
                  onClick={() => setCopyVoyageNo('')}
                  disabled={busy}
                  className="secondary"
                  data-testid="voyage-copy"
                >
                  {t('voyage.copy')}
                </button>
              )}
            </div>
            {copyVoyageNo !== null && (
              <form
                className="form-row"
                data-testid="voyage-copy-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const voyage_no = copyVoyageNo.trim();
                  if (!voyage_no) return;
                  void voyageAction(async () => {
                    const db = await getDb();
                    const copy = await new VoyageService(db, await getAutoBackup()).copy(selected.id, voyage_no);
                    setCopyVoyageNo(null);
                    await refresh({ selectedId: copy.id });
                  });
                }}
              >
                <input
                  type="text"
                  value={copyVoyageNo}
                  onChange={(e) => setCopyVoyageNo(e.target.value)}
                  placeholder={t('voyage.copy.voyage_no')}
                  aria-label={t('voyage.copy.voyage_no')}
                  required
                  autoFocus
                  data-testid="voyage-copy-no"
                />
                <button type="submit" disabled={busy || !copyVoyageNo.trim()} data-testid="voyage-copy-submit">
                  {t('voyage.copy.submit')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setCopyVoyageNo(null)}
                  disabled={busy}
                  data-testid="voyage-copy-cancel"
                >
                  {t('voyage.copy.cancel')}
                </button>
              </form>
            )}
            {actionError && (
              <p className="error" data-testid="voyage-error">
                {actionError}
              </p>
            )}
          </section>

          <nav className="subtabs">
            <button
              type="button"
              onClick={() =>
                void refresh({ selectedId: selected.id, subTab: 'holds' })
              }
              className={`subtab ${subTab === 'holds' ? 'active' : ''}`}
              disabled={busy}
              data-testid="voyage-subtab-holds"
            >
              {t('voyage.subtab.holds')}
            </button>
            <button
              type="button"
              onClick={() =>
                void refresh({ selectedId: selected.id, subTab: 'sof' })
              }
              className={`subtab ${subTab === 'sof' ? 'active' : ''}`}
              disabled={busy}
              data-testid="voyage-subtab-sof"
            >
              {t('voyage.subtab.sof', { count: sofEvents.length })}
            </button>
          </nav>

          {subTab === 'holds' && (
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
                  subTab: 'holds',
                })
              }
              onAddLot={async (input: AddLotInput) => {
                await withBusy(async () => {
                  const db = await getDb();
                  await new CargoLotService(db).add(input);
                  await refresh({
                    selectedId: selected.id,
                    expandedHoldId: input.hold_id,
                    subTab: 'holds',
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
                    subTab: 'holds',
                  });
                });
              }}
              busy={busy}
              voyageOpen={selected.status === 'open'}
            />
          )}

          {subTab === 'sof' && (
            <SofPanel
              voyage_id={selected.id}
              events={sofEvents}
              voyageOpen={selected.status === 'open'}
              busy={busy}
              onAdd={async (input: CreateSofEventInput) => {
                await withBusy(async () => {
                  const db = await getDb();
                  await new SofService(db).create(input);
                  await refresh({ selectedId: selected.id, subTab: 'sof' });
                });
              }}
              onDelete={async (id) => {
                await withBusy(async () => {
                  const db = await getDb();
                  await new SofService(db).delete(id);
                  await refresh({ selectedId: selected.id, subTab: 'sof' });
                });
              }}
            />
          )}
        </>
      )}
    </main>
  );
}
