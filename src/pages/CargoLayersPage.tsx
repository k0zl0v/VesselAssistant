import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddLotDialog } from '../components/AddLotDialog';
import { DischargeDialog } from '../components/DischargeDialog';
import { LayerStacks } from '../components/layers/LayerStacks';
import { LayersInspector } from '../components/layers/LayersInspector';
import { buildHistory, buildSources, buildStacks } from '../components/layers/model';
import { Icon } from '../components/ui/Icon';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import { listDischargeHistory, listLayers, type DischargeOperationView, type LayerView } from '../services/DischargeHistory';
import { OgvService } from '../services/OgvService';
import type { AvailableBySource } from '../services/types';
import { PageHeader, voyageEyebrow } from '../shell/PageHeader';
import { StatusChip } from '../shell/StatusChip';
import { useVoyage } from '../shell/VoyageContext';
import '../styles/layers.css';

interface LayersData {
  voyage_id: string;
  layers: LayerView[];
  sources: AvailableBySource[];
  history: DischargeOperationView[];
}

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; details: string }
  | { kind: 'ready'; data: LayersData };

type Modal = 'discharge' | 'add-lot' | null;

export function CargoLayersPage() {
  const t = useT();
  const { data, isOpen } = useVoyage();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [selectedHoldId, setSelectedHoldId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  const voyage_id = data?.voyage.id ?? null;
  const calculatedAt = data?.calculatedAt;

  // Re-read after every recalculation (a mutation anywhere refreshes the voyage); the old stacks stay meanwhile.
  useEffect(() => {
    if (!voyage_id) return;
    let live = true;
    void (async () => {
      try {
        const db = await getDb();
        const [layers, sources, history] = await Promise.all([
          listLayers(db, voyage_id),
          new OgvService(db).availableBySource(voyage_id),
          listDischargeHistory(db, voyage_id),
        ]);
        if (live) setLoad({ kind: 'ready', data: { voyage_id, layers, sources, history } });
      } catch (e) {
        if (live) setLoad({ kind: 'error', message: describeError(e), details: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
  }, [voyage_id, calculatedAt, attempt]);

  const retry = useCallback(() => {
    setLoad({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const ready = load.kind === 'ready' && load.data.voyage_id === voyage_id ? load.data : null;

  const view = useMemo(() => {
    if (!data || !ready) return null;
    return {
      stacks: buildStacks(data.calc.holds, ready.layers),
      sources: buildSources(ready.sources, ready.layers),
      history: buildHistory(ready.history),
      cargoNames: [...new Set(ready.layers.map((l) => l.cargo_name))].sort(),
    };
  }, [data, ready]);

  if (!data) return null;
  const { voyage, vessel, calc } = data;
  const selectedHold = calc.holds.find((h) => h.hold_id === selectedHoldId) ?? null;
  const canDischarge = selectedHold ? selectedHold.remain_tons > 0 : calc.totals.on_board > 0;
  const hasLayers = (ready?.layers.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        eyebrow={voyageEyebrow(t('shell.voyage'), voyage.voyage_no, vessel?.name)}
        title={t('layers.title')}
        titleTestId="layers-heading"
        chip={isOpen ? undefined : <StatusChip status={voyage.status} />}
        actions={
          <>
            <span className="layers-lifo" data-testid="layers-lifo-note">
              <Icon name="arrowUp" size={14} />
              {t('layers.lifo_note')}
            </span>
            {isOpen && hasLayers && (
              <>
                <button type="button" className="btn" onClick={() => setModal('add-lot')} data-testid="layers-add-lot">
                  <Icon name="plus" size={14} strokeWidth={2.2} />
                  {t('holds.action.add_lot')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setModal('discharge')}
                  disabled={!canDischarge}
                  data-testid="layers-discharge"
                >
                  {t('layers.action.discharge')}
                </button>
              </>
            )}
          </>
        }
      />

      <div className="page-body layers-body">
        {!isOpen && (
          <div className="closed-note banner banner-info" data-testid="voyage-closed-note">
            <Icon name="info" size={14} />
            {t('shell.closed_note')}
          </div>
        )}
        {load.kind === 'error' ? (
          <ErrorState
            title={t('layers.error.title')}
            message={load.message}
            hint={t('shell.db_error.hint')}
            details={load.details}
            actions={
              <button type="button" className="btn btn-sm" onClick={retry} data-testid="layers-retry">
                {t('shell.retry')}
              </button>
            }
            testId="layers-error"
          />
        ) : !view ? (
          <Skeleton note={t('shell.recalc_note')} />
        ) : !hasLayers ? (
          <EmptyState
            icon="layers"
            title={t('layers.empty.title')}
            text={t('layers.empty.text')}
            actions={
              isOpen && calc.holds.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setModal('add-lot')}
                  data-testid="layers-empty-add-lot"
                >
                  <Icon name="plus" size={14} strokeWidth={2.2} />
                  {t('holds.action.add_lot')}
                </button>
              ) : undefined
            }
            testId="layers-empty"
          />
        ) : (
          <div className="layers-layout">
            <LayerStacks
              stacks={view.stacks}
              cargoNames={view.cargoNames}
              selectedHoldId={selectedHoldId}
              onSelectHold={(id) => setSelectedHoldId((cur) => (cur === id ? null : id))}
            />
            <LayersInspector sources={view.sources} onBoard={calc.totals.on_board} history={view.history} />
          </div>
        )}
      </div>

      {modal === 'discharge' && (
        <DischargeDialog initialHoldId={selectedHoldId ?? undefined} onClose={() => setModal(null)} />
      )}
      {modal === 'add-lot' && <AddLotDialog initialHoldId={selectedHoldId ?? undefined} onClose={() => setModal(null)} />}
    </>
  );
}
