import { useEffect, useMemo, useState } from 'react';
import { deriveTimeSheetMilestones, summarizeSof } from '../calc/laytime';
import { dailyDischargeTotals, type DailyDischarge } from '../calc/time';
import { AddSofEventForm, type SofEventValues } from '../components/AddSofEventForm';
import { SofPanel } from '../components/SofPanel';
import { SofOverlapWarning } from '../components/sof/SofOverlapWarning';
import { SofSummary } from '../components/sof/SofSummary';
import { SofTimeline } from '../components/sof/SofTimeline';
import { SofTimeSheetDialog } from '../components/sof/SofTimeSheetDialog';
import { SofTimeSheetHeader } from '../components/sof/SofTimeSheetHeader';
import { Icon } from '../components/ui/Icon';
import { EmptyState, Skeleton } from '../components/ui/states';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import { listDischargeHistory } from '../services/DischargeHistory';
import { SofService, type SofEvent } from '../services/SofService';
import { SofTimeSheetService, type SofTimeSheet, type SofTimeSheetInput } from '../services/SofTimeSheetService';
import { useNavigation } from '../shell/navigation';
import { PageHeader, voyageEyebrow } from '../shell/PageHeader';
import { StatusChip } from '../shell/StatusChip';
import { useVoyage } from '../shell/VoyageContext';
import '../styles/sof.css';

type Editor = { mode: 'add' } | { mode: 'edit'; event: SofEvent } | { mode: 'sheet' } | null;

interface SheetData {
  voyage_id: string;
  sheet: SofTimeSheet | null;
  discharge: DailyDischarge[];
}

/** Header row and daily discharge of the voyage; re-read whenever the voyage data is recalculated. */
function useTimeSheetData(voyage_id: string | undefined, version: unknown) {
  const [state, setState] = useState<SheetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!voyage_id) return;
    let alive = true;
    void (async () => {
      try {
        const db = await getDb();
        const [sheet, ops] = await Promise.all([
          new SofTimeSheetService(db).get(voyage_id),
          listDischargeHistory(db, voyage_id),
        ]);
        if (!alive) return;
        setState({ voyage_id, sheet, discharge: dailyDischargeTotals(ops) });
        setError(null);
      } catch (e) {
        if (alive) setError(describeError(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [voyage_id, version, reloadKey]);
  const current = state?.voyage_id === voyage_id ? state : null;
  return { data: current, error, reload: () => setReloadKey((k) => k + 1) };
}

/** Local calendar date: the ship PC's clock, not UTC. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SofPage() {
  const t = useT();
  const { navigate } = useNavigation();
  const { data, isOpen, refresh } = useVoyage();
  const [editor, setEditor] = useState<Editor>(null);

  const events = data?.sofEvents;
  const summary = useMemo(() => summarizeSof(events ?? []), [events]);
  const milestones = useMemo(() => deriveTimeSheetMilestones(events ?? []), [events]);
  const sheetData = useTimeSheetData(data?.voyage.id, data?.calculatedAt);
  const overlapping = useMemo(() => new Set(summary.overlapPairs.flatMap((p) => [p.a, p.b])), [summary]);

  if (!data || !events) {
    return (
      <div className="page-body">
        <Skeleton note={t('shell.recalc_note')} />
      </div>
    );
  }

  const voyage_id = data.voyage.id;
  const openAdd = () => setEditor({ mode: 'add' });
  const openEdit = (event: SofEvent) => setEditor({ mode: 'edit', event });

  async function save(values: SofEventValues): Promise<void> {
    const service = new SofService(await getDb());
    if (editor?.mode === 'edit') await service.update(editor.event.id, values);
    else await service.create({ voyage_id, ...values });
    await refresh();
  }

  async function saveSheet(values: SofTimeSheetInput): Promise<void> {
    await new SofTimeSheetService(await getDb()).upsert(voyage_id, values);
    sheetData.reload();
  }

  async function remove(id: string): Promise<void> {
    await new SofService(await getDb()).delete(id);
    await refresh();
  }

  const header = (
    <SofTimeSheetHeader
      reference={{
        vesselName: data.vessel?.name ?? null,
        owner: data.vessel?.owner ?? null,
        port: data.loadingPort?.name ?? data.dischargingPort?.name ?? null,
        loadedCargo: data.overview.cargo_names,
      }}
      sheet={sheetData.data?.sheet ?? null}
      milestones={milestones}
      onEdit={isOpen && sheetData.data ? () => setEditor({ mode: 'sheet' }) : undefined}
    />
  );

  const addButton = (
    <button type="button" className="btn btn-primary" onClick={openAdd} data-testid="sof-add">
      <Icon name="plus" size={14} strokeWidth={2.2} />
      {t('sof.action.add')}
    </button>
  );

  return (
    <>
      <PageHeader
        eyebrow={voyageEyebrow(t('shell.voyage'), data.voyage.voyage_no, data.vessel?.name)}
        title={t('sof.title')}
        chip={isOpen ? undefined : <StatusChip status={data.voyage.status} />}
        actions={
          <>
            <button type="button" className="btn" onClick={() => navigate('documents')} data-testid="sof-print">
              {t('sof.action.print')}
            </button>
            {isOpen && addButton}
          </>
        }
      />

      <div className="page-body sof-page">
        {!isOpen && (
          <div className="closed-note banner banner-info" data-testid="voyage-closed-note">
            <Icon name="info" size={14} />
            {t('shell.closed_note')}
          </div>
        )}

        {sheetData.error && (
          <div className="banner banner-danger" role="alert" data-testid="sof-sheet-error-banner">
            <Icon name="alert" size={14} />
            {t('sof.sheet.load_error', { message: sheetData.error })}
          </div>
        )}

        {events.length === 0 && header}
        {events.length === 0 ? (
          <EmptyState
            icon="clock"
            title={t('sof.empty')}
            text={t('sof.empty.text')}
            actions={
              isOpen ? (
                <button type="button" className="btn btn-sm btn-primary" onClick={openAdd} data-testid="sof-empty-add">
                  <Icon name="plus" size={13} strokeWidth={2.2} />
                  {t('sof.action.add')}
                </button>
              ) : undefined
            }
            testId="sof-empty"
          />
        ) : (
          <>
            <SofSummary summary={summary} />
            {header}
            <SofOverlapWarning events={events} pairs={summary.overlapPairs} onFix={isOpen ? openEdit : undefined} />
            <SofTimeline events={events} overlapping={overlapping} />
            <SofPanel
              events={events}
              overlapping={overlapping}
              voyageOpen={isOpen}
              onEdit={openEdit}
              onDelete={remove}
              discharge={sheetData.data?.discharge}
            />
          </>
        )}
      </div>

      {editor?.mode === 'sheet' && isOpen && sheetData.data && (
        <SofTimeSheetDialog
          sheet={sheetData.data.sheet}
          dischargedTons={sheetData.data.discharge[sheetData.data.discharge.length - 1]?.total ?? 0}
          onSubmit={saveSheet}
          onClose={() => setEditor(null)}
        />
      )}

      {editor && editor.mode !== 'sheet' && isOpen && (
        <AddSofEventForm
          key={editor.mode === 'edit' ? editor.event.id : 'add'}
          event={editor.mode === 'edit' ? editor.event : undefined}
          defaultDate={events[events.length - 1]?.event_date ?? today()}
          onSubmit={save}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
