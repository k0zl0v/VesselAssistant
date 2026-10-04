import { useEffect, useMemo, useState } from 'react';
import { DischargeDialog } from '../components/DischargeDialog';
import { BargeReceiptDialog } from '../components/ogv/BargeReceiptDialog';
import { DischargeLog } from '../components/ogv/DischargeLog';
import { OgvHolds } from '../components/ogv/OgvHolds';
import { OgvReceipts } from '../components/ogv/OgvReceipts';
import { OgvSidebar, type AvailableHold } from '../components/ogv/OgvSidebar';
import { OgvTiles } from '../components/ogv/OgvTiles';
import { RegisterOgvDialog } from '../components/ogv/RegisterOgvDialog';
import { SequencePlanDialog } from '../components/ogv/SequencePlanDialog';
import { Icon } from '../components/ui/Icon';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import type { Db } from '../services/db';
import { listDischargeHistory, listLayers, type DischargeOperationView, type LayerView } from '../services/DischargeHistory';
import { OgvVesselService, type OgvStatus, type OgvSummary } from '../services/OgvVesselService';
import { PageHeader, voyageEyebrow } from '../shell/PageHeader';
import { StatusChip } from '../shell/StatusChip';
import { useVoyage } from '../shell/VoyageContext';
import '../styles/discharge.css';
import '../styles/ogv.css';

interface Loaded {
  voyage_id: string;
  db: Db;
  summary: OgvSummary | null;
  ops: DischargeOperationView[];
  layers: LayerView[];
}

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; voyage_id: string; message: string; details: string }
  | { kind: 'ready'; data: Loaded };

type Modal = { kind: 'discharge'; holdId?: string } | { kind: 'register' } | { kind: 'barge' } | { kind: 'sequence' } | null;

const STATUS_CHIP: Record<OgvStatus, string> = {
  planned: 'chip',
  loading: 'chip chip-warning',
  completed: 'chip chip-positive',
};

/** OGV — the ocean-going vessel under loading at the roads (docs/ui/artboards/Ogv.dc.html). */
export function OgvPage() {
  const t = useT();
  const { data, cargoes, isOpen, refresh } = useVoyage();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const [modal, setModal] = useState<Modal>(null);

  const voyageId = data?.voyage.id;
  // A new calculatedAt means the voyage changed (a discharge, a receipt) — re-read.
  const stamp = data?.calculatedAt.getTime();

  useEffect(() => {
    if (!voyageId) return;
    let live = true;
    (async () => {
      try {
        const db = await getDb();
        const [summary, ops, layers] = await Promise.all([
          new OgvVesselService(db).summary(voyageId),
          listDischargeHistory(db, voyageId),
          listLayers(db, voyageId),
        ]);
        if (live) setLoad({ kind: 'ready', data: { voyage_id: voyageId, db, summary, ops, layers } });
      } catch (e) {
        if (live) {
          setLoad({
            kind: 'error',
            voyage_id: voyageId,
            message: describeError(e),
            details: e instanceof Error ? e.message : String(e),
          });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [voyageId, stamp, retry]);

  const cargoNames = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [id, s] of Object.entries(data?.overview.holds ?? {})) out[id] = s.cargo_names;
    return out;
  }, [data]);

  const ready = load.kind === 'ready' && load.data.voyage_id === voyageId ? load.data : null;
  const failed = load.kind === 'error' && load.voyage_id === voyageId ? load : null;

  const available = useMemo<AvailableHold[]>(() => {
    if (!data || !ready) return [];
    return data.calc.holds
      .filter((h) => h.remain_tons > 0)
      .map((h) => ({
        hold: h,
        cargo_names: cargoNames[h.hold_id] ?? [],
        // listLayers orders each hold top of stack first.
        top_vessel: ready.layers.find((l) => l.hold_id === h.hold_id && l.remaining_tons > 0)?.source_vessel ?? null,
      }));
  }, [data, ready, cargoNames]);

  if (!data) {
    return (
      <div className="page-body">
        <Skeleton note={t('shell.recalc_note')} />
      </div>
    );
  }

  const { voyage, vessel } = data;
  const mainVessel = vessel?.name ?? '';
  const summary = ready?.summary ?? null;
  const canDischarge = isOpen && data.calc.totals.on_board > 0;
  const closedChip = voyage.status === 'closed' ? <StatusChip status={voyage.status} /> : null;

  const sources = summary
    ? [
        ...new Set(summary.receipts.filter((r) => r.source_kind === 'barge').map((r) => r.source_name)),
        ...(summary.totals.main_hold_operations > 0 ? [t('ogv.sources.main', { vessel: mainVessel })] : []),
      ]
    : [];
  const lastBarge = summary ? ([...summary.receipts].reverse().find((r) => r.source_kind === 'barge')?.source_name ?? '') : '';

  const dischargeButton = isOpen && (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => setModal({ kind: 'discharge' })}
      disabled={!canDischarge}
      data-testid="ogv-action-discharge"
    >
      <Icon name="discharge" size={14} strokeWidth={2.2} />
      {t('ogv.action.discharge')}
    </button>
  );

  return (
    <>
      <PageHeader
        eyebrow={
          summary
            ? t('ogv.eyebrow', { voyage_no: voyage.voyage_no })
            : voyageEyebrow(t('shell.voyage'), voyage.voyage_no, vessel?.name)
        }
        title={summary ? t('ogv.title', { name: summary.vessel.name }) : t('nav.ogv')}
        titleTestId="ogv-heading"
        chip={
          (summary || closedChip) && (
            <>
              {summary && (
                <span className={STATUS_CHIP[summary.vessel.status]} data-testid="ogv-status">
                  {t(`ogv.status.${summary.vessel.status}`)}
                </span>
              )}
              {closedChip}
            </>
          )
        }
        meta={
          summary && (
            <span data-testid="ogv-meta">
              {t('ogv.subtitle', {
                holds: summary.holds.length,
                sources: sources.length > 0 ? sources.join(', ') : t('ogv.sources.none'),
              })}
            </span>
          )
        }
        actions={
          isOpen && (
            <>
              {summary && (
                <>
                  <button type="button" className="btn" onClick={() => setModal({ kind: 'barge' })} data-testid="ogv-action-barge">
                    <Icon name="plus" size={14} strokeWidth={2.2} />
                    {t('ogv.action.barge')}
                  </button>
                  <button type="button" className="btn" onClick={() => setModal({ kind: 'sequence' })} data-testid="ogv-action-sequence">
                    {t('ogv.action.sequence')}
                  </button>
                </>
              )}
              {dischargeButton}
            </>
          )
        }
      />

      <div className="page-body ogv-body">
        {!isOpen && (
          <div className="closed-note banner banner-info" data-testid="voyage-closed-note">
            <Icon name="info" size={14} />
            {t('shell.closed_note')}
          </div>
        )}

        {failed ? (
          <ErrorState
            title={t('ogv.load_error')}
            message={failed.message}
            hint={t('shell.db_error.hint')}
            details={failed.details}
            actions={
              <button type="button" className="btn btn-sm" onClick={() => setRetry((n) => n + 1)}>
                {t('shell.retry')}
              </button>
            }
            testId="ogv-error"
          />
        ) : !ready ? (
          <Skeleton />
        ) : summary ? (
          <>
            <OgvTiles summary={summary} mainVessel={mainVessel} />
            <OgvHolds summary={summary} />
            <div className="ogv-columns">
              <OgvReceipts summary={summary} mainVessel={mainVessel} />
              <OgvSidebar
                mainVessel={mainVessel}
                available={available}
                onBoard={data.calc.totals.on_board}
                steps={summary.steps}
                onPickHold={canDischarge ? (holdId) => setModal({ kind: 'discharge', holdId }) : null}
                onEditSequence={isOpen ? () => setModal({ kind: 'sequence' }) : null}
              />
            </div>
          </>
        ) : (
          <>
            <EmptyState
              icon="ship"
              title={t('ogv.none.title')}
              text={t('ogv.none.text')}
              actions={
                isOpen && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setModal({ kind: 'register' })}
                    data-testid="ogv-register"
                  >
                    <Icon name="plus" size={14} strokeWidth={2.2} />
                    {t('ogv.none.action')}
                  </button>
                )
              }
              testId="ogv-empty"
            />
            {ready.ops.length > 0 && (
              <section className="ogv-legacy">
                <h2 className="ogv-section-title">{t('ogv.legacy.title', { vessel: mainVessel })}</h2>
                <DischargeLog ops={ready.ops} cargoNames={cargoNames} />
                <div className="page-note">
                  <Icon name="info" size={13} />
                  {t('ogv.note')}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {modal?.kind === 'discharge' && (
        <DischargeDialog initialHoldId={modal.holdId} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'register' && ready && (
        <RegisterOgvDialog db={ready.db} voyage_id={voyage.id} onDone={refresh} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'barge' && ready && summary && (
        <BargeReceiptDialog
          db={ready.db}
          voyage_id={voyage.id}
          mainVessel={mainVessel}
          holds={summary.holds}
          cargoes={cargoes}
          lastBarge={lastBarge}
          onDone={refresh}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'sequence' && ready && summary && (
        <SequencePlanDialog
          db={ready.db}
          voyage_id={voyage.id}
          holds={summary.holds}
          steps={summary.steps}
          onChanged={refresh}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
