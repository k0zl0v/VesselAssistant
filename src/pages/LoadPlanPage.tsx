import { useMemo, useState } from 'react';
import { formatTons } from '../calc/round';
import { AddLotDialog } from '../components/AddLotDialog';
import { DischargeDialog } from '../components/DischargeDialog';
import { ExportButton } from '../components/ExportButton';
import { HoldTable } from '../components/HoldTable';
import { ShipProfile } from '../components/ShipProfile';
import { ConfirmPanel } from '../components/ui/ConfirmPanel';
import { Dialog } from '../components/ui/Dialog';
import { Icon } from '../components/ui/Icon';
import { Metric } from '../components/ui/Metric';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { getAutoBackup } from '../autoBackup';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import { VoyageService } from '../services/VoyageService';
import { formatClock, formatDateRange } from '../shell/format';
import { useNavigation } from '../shell/navigation';
import { PageHeader } from '../shell/PageHeader';
import { StatusChip } from '../shell/StatusChip';
import { useVoyage } from '../shell/VoyageContext';
import '../styles/load-plan.css';

type Modal = 'add-lot' | 'discharge' | 'copy' | null;

export function LoadPlanPage() {
  const t = useT();
  const { navigate } = useNavigation();
  const { data, isOpen, refresh, reload } = useVoyage();
  const [modal, setModal] = useState<Modal>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cargoFilter, setCargoFilter] = useState<string | null>(null);

  const visibleHolds = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.calc.holds.filter((h) => {
      const s = data.overview.holds[h.hold_id];
      const names = s?.cargo_names ?? [];
      if (cargoFilter && !names.includes(cargoFilter)) return false;
      if (!q) return true;
      return `№${h.hold_no} ${h.hold_no} ${names.join(' ')}`.toLowerCase().includes(q);
    });
  }, [data, query, cargoFilter]);

  if (!data) {
    return (
      <div className="page-body">
        <Skeleton note={t('shell.recalc_note')} />
      </div>
    );
  }

  const { voyage, vessel, calc, overview } = data;
  const totals = calc.totals;
  const unit = t('voyage.totals.unit_t');
  const negativeHolds = calc.holds.filter((h) => h.remain_tons < 0);
  const dates = formatDateRange(overview.first_lot_at, overview.last_activity_at);
  const ports = [data.loadingPort?.name, data.dischargingPort?.name].filter(Boolean).join(' → ');

  async function closeVoyage(): Promise<void> {
    setClosing(true);
    setActionError(null);
    try {
      await new VoyageService(await getDb(), await getAutoBackup()).close(voyage.id);
      setConfirmClose(false);
      await refresh();
    } catch (e) {
      setActionError(describeError(e));
    } finally {
      setClosing(false);
    }
  }

  const meta = (
    <>
      {vessel && (
        <span>
          <strong>{vessel.name}</strong>
          {vessel.flag ? ` · ${vessel.flag}` : ''}
        </span>
      )}
      {ports && (
        <>
          <span className="page-meta-sep">|</span>
          <span>{ports}</span>
        </>
      )}
      {dates && (
        <>
          <span className="page-meta-sep">|</span>
          <span className="mono">{dates}</span>
        </>
      )}
      {overview.cargo_names.length > 0 && (
        <>
          <span className="page-meta-sep">|</span>
          <span>{overview.cargo_names.join(' · ')}</span>
        </>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={t('voyage.heading', { voyage_no: voyage.voyage_no })}
        titleTestId="voyage-heading"
        chip={<StatusChip status={voyage.status} />}
        meta={meta}
        actions={
          <>
            <span className="page-stamp" data-testid="recalc-stamp">
              {t('shell.recalc_at', { time: formatClock(data.calculatedAt) })}
            </span>
            {vessel && <ExportButton voyage_id={voyage.id} voyage_no={voyage.voyage_no} vessel_name={vessel.name} />}
            <button type="button" className="btn btn-quiet" onClick={() => setModal('copy')} data-testid="voyage-copy">
              {t('voyage.copy')}
            </button>
            {isOpen && (
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setConfirmClose(true)}
                disabled={confirmClose}
                data-testid="voyage-close"
              >
                {t('voyage.close')}
              </button>
            )}
          </>
        }
      />

      <div className="page-body">
        {confirmClose && (
          <div className="load-plan-confirm">
            <ConfirmPanel
              tone="danger"
              confirmLabel={t('voyage.close')}
              cancelLabel={t('voyage.copy.cancel')}
              onConfirm={() => void closeVoyage()}
              onCancel={() => setConfirmClose(false)}
              busy={closing}
              testId="voyage-close-confirm"
            >
              {t('voyage.close.confirm', { voyage_no: voyage.voyage_no })}
            </ConfirmPanel>
          </div>
        )}
        {actionError && (
          <div className="load-plan-alert">
            <ErrorState title={t('shell.action_failed')} message={actionError} testId="voyage-error" />
          </div>
        )}
        {!isOpen && (
          <div className="closed-note banner banner-info" data-testid="voyage-closed-note">
            <Icon name="info" size={14} />
            {t('shell.closed_note')}
          </div>
        )}
        {negativeHolds.length > 0 && (
          <div className="load-plan-alert">
            <ErrorState
              title={t('holds.negative.title')}
              message={t('holds.negative.text', {
                holds: negativeHolds.map((h) => `№${h.hold_no} (${formatTons(h.remain_tons)} ${unit})`).join(', '),
              })}
              hint={t('holds.negative.hint')}
              actions={
                <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => navigate('ogv')}>
                  {t('holds.negative.action')}
                </button>
              }
              testId="holds-negative"
            />
          </div>
        )}

        <div className="metrics">
          <Metric
            primary
            label={t('voyage.totals.on_board')}
            value={formatTons(totals.on_board)}
            unit={unit}
            note={t('shell.on_board_note', {
              holds: calc.holds.length,
              lots: overview.lot_count,
              sources: overview.source_vessel_count,
            })}
            testId="metric-on-board"
          />
          <Metric
            label={t('voyage.totals.total_loaded')}
            value={formatTons(totals.total_loaded)}
            unit={unit}
            note={t('shell.loaded_note', { lots: overview.lot_count })}
            testId="metric-total-loaded"
          />
          <Metric
            label={t('voyage.totals.total_discharged')}
            value={formatTons(totals.total_discharged)}
            unit={unit}
            note={
              overview.discharged_hold_nos.length > 0
                ? t('shell.discharged_note', { holds: overview.discharged_hold_nos.map((n) => `№${n}`).join(', ') })
                : t('shell.discharged_none')
            }
            testId="metric-total-discharged"
          />
          <Metric
            label={t('voyage.totals.total_empty_98')}
            value={formatTons(totals.total_empty_98)}
            unit={unit}
            note={t('shell.empty98_note')}
            testId="metric-total-empty-98"
          />
          <Metric
            label={t('voyage.totals.total_empty_100')}
            value={formatTons(totals.total_empty_100)}
            unit={unit}
            note={t('shell.empty100_note')}
            testId="metric-total-empty-100"
          />
        </div>

        {calc.holds.length === 0 ? (
          <EmptyState
            icon="table"
            title={t('holds.no_holds.title')}
            text={t('holds.no_holds.text')}
            actions={
              <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate('reference')}>
                {t('nav.reference')}
              </button>
            }
            testId="holds-empty"
          />
        ) : (
          <>
            <ShipProfile />
            <div className="toolbar">
              <label className="search-box">
                <Icon name="search" size={14} />
                <span className="visually-hidden">{t('holds.search')}</span>
                <input
                  type="search"
                  className="input-bare"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('holds.search')}
                  data-testid="holds-search"
                />
              </label>
              {overview.cargo_names.length > 1 && (
                <div className="segmented" role="group" aria-label={t('holds.col.cargo')}>
                  <button type="button" aria-pressed={cargoFilter === null} onClick={() => setCargoFilter(null)}>
                    {t('holds.filter.all')}
                  </button>
                  {overview.cargo_names.map((c) => (
                    <button key={c} type="button" aria-pressed={cargoFilter === c} onClick={() => setCargoFilter(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
              {data.sofOverlapCount > 0 && (
                <button
                  type="button"
                  className="banner banner-warning btn-reset"
                  onClick={() => navigate('sof')}
                  data-testid="load-plan-sof-warning"
                >
                  <Icon name="warning" size={14} />
                  {t('shell.sof_overlap_banner', { count: data.sofOverlapCount })}
                </button>
              )}
              <span className="toolbar-spacer" />
              {isOpen && (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setModal('discharge')}
                    disabled={calc.totals.on_board <= 0}
                    data-testid="hold-action-discharge"
                  >
                    {t('holds.action.discharge')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setModal('add-lot')}
                    data-testid="hold-action-add-lot"
                  >
                    <Icon name="plus" size={14} strokeWidth={2.2} />
                    {t('holds.action.add_lot')}
                  </button>
                </>
              )}
            </div>

            <HoldTable
              holds={visibleHolds}
              totals={totals}
              summaries={overview.holds}
              showTotals={visibleHolds.length === calc.holds.length}
            />
            <div className="page-note">
              <Icon name="info" size={13} />
              {t('holds.footnote')}
            </div>
          </>
        )}
      </div>

      {modal === 'add-lot' && <AddLotDialog onClose={() => setModal(null)} />}
      {modal === 'discharge' && <DischargeDialog onClose={() => setModal(null)} />}
      {modal === 'copy' && (
        <CopyVoyageDialog
          voyage_id={voyage.id}
          onClose={() => setModal(null)}
          onCopied={(id) => void reload(id)}
        />
      )}
    </>
  );
}

function CopyVoyageDialog({
  voyage_id,
  onClose,
  onCopied,
}: {
  voyage_id: string;
  onClose: () => void;
  onCopied: (id: string) => void;
}) {
  const t = useT();
  const [voyageNo, setVoyageNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title={t('voyage.copy')} subtitle={t('shell.copy_hint')} onClose={onClose}>
      <form
        data-testid="voyage-copy-form"
        onSubmit={(e) => {
          e.preventDefault();
          const no = voyageNo.trim();
          if (!no) return;
          setBusy(true);
          setError(null);
          void (async () => {
            try {
              const copy = await new VoyageService(await getDb(), await getAutoBackup()).copy(voyage_id, no);
              onCopied(copy.id);
              onClose();
            } catch (err) {
              setError(describeError(err));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <div className="dialog-body">
          <div className="field">
            <label className="field-label" htmlFor="copy-no">
              {t('voyage.copy.voyage_no')}
            </label>
            <input
              id="copy-no"
              className="input mono"
              value={voyageNo}
              onChange={(e) => setVoyageNo(e.target.value)}
              required
              autoFocus
              data-testid="voyage-copy-no"
            />
          </div>
          {error && (
            <p className="field-error" role="alert" data-testid="voyage-copy-error">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn" onClick={onClose} disabled={busy} data-testid="voyage-copy-cancel">
            {t('voyage.copy.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !voyageNo.trim()}
            data-testid="voyage-copy-submit"
          >
            {t('voyage.copy.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
