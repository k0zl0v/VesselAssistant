import { useEffect, useState } from 'react';
import { formatTons, roundTo3 } from '../calc/round';
import { DischargeDialog } from '../components/DischargeDialog';
import { Icon } from '../components/ui/Icon';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import { listDischargeHistory, type DischargeOperationView } from '../services/DischargeHistory';
import { formatDate } from '../shell/format';
import { PageHeader, voyageEyebrow } from '../shell/PageHeader';
import { StatusChip } from '../shell/StatusChip';
import { useVoyage } from '../shell/VoyageContext';
import '../styles/discharge.css';

type History =
  | { kind: 'loading' }
  | { kind: 'error'; voyage_id: string; message: string; details: string }
  | { kind: 'ready'; voyage_id: string; ops: DischargeOperationView[] };

/** «OGV · Operations»: every discharge of the voyage with the layers LIFO wrote off. */
export function OgvPage() {
  const t = useT();
  const { data, isOpen } = useVoyage();
  const [history, setHistory] = useState<History>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  const voyageId = data?.voyage.id;
  // A new calculatedAt means the voyage changed (a discharge among others) — re-read the log.
  const stamp = data?.calculatedAt.getTime();

  useEffect(() => {
    if (!voyageId) return;
    let live = true;
    (async () => {
      try {
        const ops = await listDischargeHistory(await getDb(), voyageId);
        if (live) setHistory({ kind: 'ready', voyage_id: voyageId, ops });
      } catch (e) {
        if (live) {
          setHistory({
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

  if (!data) {
    return (
      <div className="page-body">
        <Skeleton note={t('shell.recalc_note')} />
      </div>
    );
  }

  const { voyage, vessel, overview } = data;
  const current = history.kind !== 'loading' && history.voyage_id === voyage.id ? history : null;
  const ops = current?.kind === 'ready' ? current.ops : [];
  const totalTons = ops.reduce((s, o) => s + o.tons, 0);
  const canDischarge = isOpen && data.calc.totals.on_board > 0;

  return (
    <>
      <PageHeader
        eyebrow={voyageEyebrow(t('shell.voyage'), voyage.voyage_no, vessel?.name)}
        title={t('nav.ogv')}
        titleTestId="ogv-heading"
        chip={voyage.status === 'closed' ? <StatusChip status={voyage.status} /> : undefined}
        meta={
          current?.kind === 'ready' && (
            <span data-testid="ogv-meta">
              {t('ogv.meta', { count: ops.length, tons: formatTons(totalTons) })}
            </span>
          )
        }
        actions={
          isOpen && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setDialogOpen(true)}
              disabled={!canDischarge}
              data-testid="ogv-action-discharge"
            >
              <Icon name="discharge" size={14} strokeWidth={2.2} />
              {t('ogv.action.discharge')}
            </button>
          )
        }
      />

      <div className="page-body">
        {!isOpen && (
          <div className="closed-note banner banner-info" data-testid="voyage-closed-note">
            <Icon name="info" size={14} />
            {t('shell.closed_note')}
          </div>
        )}

        {!current ? (
          <Skeleton />
        ) : current.kind === 'error' ? (
          <div className="ogv-alert">
            <ErrorState
              title={t('ogv.error.title')}
              message={current.message}
              hint={t('shell.db_error.hint')}
              details={current.details}
              actions={
                <button type="button" className="btn btn-sm" onClick={() => setRetry((n) => n + 1)}>
                  {t('shell.retry')}
                </button>
              }
              testId="ogv-error"
            />
          </div>
        ) : ops.length === 0 ? (
          <EmptyState
            icon="discharge"
            title={t('ogv.empty.title')}
            text={t('ogv.empty.text')}
            actions={
              canDischarge && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setDialogOpen(true)}>
                  {t('ogv.action.discharge')}
                </button>
              )
            }
            testId="ogv-empty"
          />
        ) : (
          <>
            <div className="table-card">
              <table className="data-table ogv-table" data-testid="ogv-table">
                <thead>
                  <tr>
                    <th className="col-date">{t('ogv.col.date')}</th>
                    <th className="col-hold">{t('ogv.col.hold')}</th>
                    <th className="num col-tons key-col">{t('ogv.col.tons')}</th>
                    <th>{t('ogv.col.description')}</th>
                    <th className="col-layers">{t('ogv.col.layers')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.map((op) => (
                    <OperationRow key={op.operation_id} op={op} cargo={overview.holds[op.hold_id]?.cargo_names ?? []} />
                  ))}
                  <tr className="total-row" data-testid="ogv-totals">
                    <td colSpan={2} className="total-label">
                      {t('ogv.totals')}
                    </td>
                    <td className="num key-col" data-testid="ogv-total-tons">
                      {formatTons(totalTons)}
                    </td>
                    <td className="muted">{t('ogv.totals_count', { count: ops.length })}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="page-note">
              <Icon name="info" size={13} />
              {t('ogv.note')}
            </div>
          </>
        )}
      </div>

      {dialogOpen && <DischargeDialog onClose={() => setDialogOpen(false)} />}
    </>
  );
}

function OperationRow({ op, cargo }: { op: DischargeOperationView; cargo: string[] }) {
  const t = useT();
  const time = op.time_from ? `${op.time_from}${op.time_to ? `–${op.time_to}` : ''}` : null;
  return (
    <tr data-testid={`ogv-row-${op.operation_id}`}>
      <td>
        <span className="mono">{formatDate(op.event_date)}</span>
        {time && <span className="cell-sub mono">{time}</span>}
      </td>
      <td>
        <span className="mono hold-no">№{op.hold_no}</span>
        {cargo.length > 0 && <span className="cell-sub">{cargo.join(' · ')}</span>}
      </td>
      <td className="num key-col ogv-tons" data-testid="ogv-row-tons">
        {formatTons(op.tons)}
      </td>
      <td className={op.description ? undefined : 'zero'}>{op.description ?? '—'}</td>
      <td>
        <div className="ogv-allocs">
          {op.allocations.map((a) => {
            const closed = roundTo3(a.layer_remaining_tons) === 0;
            return (
              <div className="ogv-alloc" key={a.cargo_layer_id}>
                <span className="ogv-alloc-seq mono">{t('discharge.layer.seq', { seq: a.load_sequence })}</span>
                <span className="ogv-alloc-vessel">{a.source_vessel}</span>
                <span className="ogv-alloc-tons mono">−{formatTons(a.discharged_tons)}</span>
                <span className={`ogv-alloc-state${closed ? ' closed' : ''}`}>
                  {closed ? t('ogv.state.closed') : t('ogv.state.remain', { tons: formatTons(a.layer_remaining_tons) })}
                </span>
              </div>
            );
          })}
        </div>
      </td>
    </tr>
  );
}
