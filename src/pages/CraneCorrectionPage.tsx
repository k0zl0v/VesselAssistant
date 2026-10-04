import { useMemo, useState } from 'react';
import { formatPercent, formatTons, roundTo3 } from '../calc/round';
import { CoefficientHistory } from '../components/cranes/CoefficientHistory';
import { CraneModeCard, type CraneRow } from '../components/cranes/CraneModeCard';
import { formatSigned, today } from '../components/cranes/modes';
import { RecordShiftDialog } from '../components/cranes/RecordShiftDialog';
import { useCraneData, type CraneData } from '../components/cranes/useCraneData';
import { Icon } from '../components/ui/Icon';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { useT } from '../i18n';
import {
  CRANE_MODES,
  modeCraneKey,
  summarizeShift,
  workingOn,
  type CraneMode,
  type CraneShiftRecord,
} from '../services/CraneShiftService';
import type { Crane } from '../services/ReferenceService';
import { formatDate } from '../shell/format';
import { useNavigation } from '../shell/navigation';
import { PageHeader, voyageEyebrow } from '../shell/PageHeader';
import { StatusChip } from '../shell/StatusChip';
import { useVoyage } from '../shell/VoyageContext';
import '../styles/cranes.css';

type Scope = 'shift' | 'voyage';

interface Selection {
  mode: CraneMode;
  crane_id: string;
}

export function CraneCorrectionPage() {
  const t = useT();
  const { navigate } = useNavigation();
  const { data, cranes, isOpen } = useVoyage();
  const { load, refresh } = useCraneData(data?.voyage.id ?? null);
  const [scope, setScope] = useState<Scope>('shift');
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [recording, setRecording] = useState(false);

  const sortedCranes = useMemo(() => [...cranes].sort((a, b) => a.name.localeCompare(b.name)), [cranes]);

  if (!data) {
    return (
      <div className="page-body">
        <Skeleton note={t('shell.recalc_note')} />
      </div>
    );
  }

  const ready = load.kind === 'ready' ? load.data : null;
  const dates = ready ? [...new Set(ready.records.map((r) => r.shift_date))].sort().reverse() : [];
  const shiftDate = pickedDate && dates.includes(pickedDate) ? pickedDate : (dates[0] ?? null);
  const refDate = scope === 'shift' && shiftDate ? shiftDate : today();
  const selection: Selection | null =
    selected ?? (sortedCranes[0] ? { mode: 'direct', crane_id: sortedCranes[0].id } : null);
  const selectedCrane = selection ? sortedCranes.find((c) => c.id === selection.crane_id) : undefined;

  const eyebrowBase = voyageEyebrow(t('shell.voyage'), data.voyage.voyage_no, data.vessel?.name);
  const eyebrow =
    scope === 'shift' && shiftDate ? t('cranes.eyebrow_shift', { voyage: eyebrowBase, date: formatDate(shiftDate) }) : eyebrowBase;

  const actions = (
    <>
      {dates.length > 0 && (
        <>
          <div className="segmented" role="group" aria-label={t('cranes.scope_label')}>
            {(['shift', 'voyage'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)} data-testid={`cranes-scope-${s}`}>
                {t(s === 'shift' ? 'cranes.scope.shift' : 'cranes.scope.voyage')}
              </button>
            ))}
          </div>
          {scope === 'shift' && dates.length > 1 && (
            <select
              className="input mono cranes-date-select"
              value={shiftDate ?? ''}
              onChange={(e) => setPickedDate(e.target.value)}
              aria-label={t('cranes.shift_date')}
              data-testid="cranes-shift-select"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {formatDate(d)}
                </option>
              ))}
            </select>
          )}
        </>
      )}
      {isOpen && ready && sortedCranes.length > 0 && (
        <button type="button" className="btn btn-primary" onClick={() => setRecording(true)} data-testid="cranes-record">
          {t('cranes.record')}
        </button>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={t('cranes.title')}
        chip={isOpen ? undefined : <StatusChip status={data.voyage.status} />}
        actions={actions}
      />
      <div className="page-body cranes-page">
        {!isOpen && (
          <div className="closed-note banner banner-info" data-testid="voyage-closed-note">
            <Icon name="info" size={14} />
            {t('cranes.closed_note')}
          </div>
        )}

        {load.kind === 'loading' && <Skeleton rows={8} />}
        {load.kind === 'error' && (
          <ErrorState
            title={t('cranes.load_error.title')}
            message={load.message}
            hint={t('cranes.load_error.hint')}
            details={load.details}
            actions={
              <button type="button" className="btn" onClick={() => void refresh()}>
                {t('cranes.retry')}
              </button>
            }
            testId="cranes-load-error"
          />
        )}
        {ready && sortedCranes.length === 0 && (
          <EmptyState
            icon="crane"
            title={t('cranes.no_cranes.title')}
            text={t('cranes.no_cranes.text')}
            actions={
              <button type="button" className="btn btn-primary" onClick={() => navigate('reference')}>
                {t('cranes.no_cranes.action')}
              </button>
            }
            testId="cranes-no-cranes"
          />
        )}
        {ready && sortedCranes.length > 0 && (
          <CraneSheet
            data={ready}
            cranes={sortedCranes}
            records={scope === 'shift' && shiftDate ? ready.records.filter((r) => r.shift_date === shiftDate) : ready.records}
            scope={scope}
            discharged={scope === 'shift' && shiftDate ? (ready.dischargedByDate[shiftDate] ?? 0) : ready.dischargedTotal}
            refDate={refDate}
            selection={selection}
            selectedCrane={selectedCrane}
            onSelect={(mode, crane_id) => setSelected({ mode, crane_id })}
            canRecord={isOpen}
            onRecord={() => setRecording(true)}
            onChanged={refresh}
          />
        )}
      </div>

      {recording && ready && (
        <RecordShiftDialog
          voyage_id={data.voyage.id}
          cranes={sortedCranes}
          working={ready.working}
          operations={ready.operations}
          defaultDate={today()}
          onClose={() => setRecording(false)}
          onSaved={async (d) => {
            setScope('shift');
            setPickedDate(d);
            await refresh();
          }}
        />
      )}
    </>
  );
}

interface SheetProps {
  data: CraneData;
  cranes: Crane[];
  records: CraneShiftRecord[];
  scope: Scope;
  discharged: number;
  refDate: string;
  selection: Selection | null;
  selectedCrane: Crane | undefined;
  onSelect: (mode: CraneMode, crane_id: string) => void;
  canRecord: boolean;
  onRecord: () => void;
  onChanged: () => Promise<void>;
}

function CraneSheet({
  data,
  cranes,
  records,
  scope,
  discharged,
  refDate,
  selection,
  selectedCrane,
  onSelect,
  canRecord,
  onRecord,
  onChanged,
}: SheetProps) {
  const t = useT();
  const summary = summarizeShift(records);
  const operations = new Map(data.operations.map((o) => [o.id, o]));

  // Within one shift the date is in the header; across the voyage the line needs it.
  function linkOf(lines: CraneShiftRecord[]): string {
    const parts = lines.map((l) => {
      const op = l.operation_id ? operations.get(l.operation_id) : undefined;
      if (!op) return l.note ?? '';
      const hold = op.hold_no === null ? null : t('cranes.link_hold', { hold: op.hold_no });
      return [hold, scope === 'voyage' ? formatDate(op.event_date).slice(0, 5) : null].filter(Boolean).join(' · ');
    });
    return [...new Set(parts.filter(Boolean))].join(', ');
  }

  const rowsOf = (mode: CraneMode): CraneRow[] =>
    cranes.map((crane) => {
      const lines = records.filter((r) => r.mode === mode && r.crane_id === crane.id);
      return {
        crane,
        lines,
        totals: summary.byModeCrane[modeCraneKey(mode, crane.id)],
        working: workingOn(data.working, crane.id, mode, refDate)?.coefficient ?? null,
        link: linkOf(lines),
      };
    });

  const fromOwn = summary.byMode.from_own.scale_tons;
  const matches = roundTo3(fromOwn) === roundTo3(discharged);
  const linked = records.some((r) => r.operation_id);

  return (
    <div className="cranes-layout">
      <div className="cranes-main">
        {summary.count === 0 ? (
          <EmptyState
            icon="crane"
            title={t('cranes.empty.title')}
            text={t('cranes.empty.text')}
            actions={
              canRecord ? (
                <button type="button" className="btn btn-sm btn-primary" onClick={onRecord} data-testid="cranes-empty-record">
                  {t('cranes.record')}
                </button>
              ) : undefined
            }
            testId="cranes-empty"
          />
        ) : (
          <div className="cranes-tiles" data-testid="cranes-summary">
            <Tile
              label={t('cranes.tile.scale')}
              value={formatTons(summary.scale_tons)}
              note={t(scope === 'shift' ? 'cranes.tile.scale_note_shift' : 'cranes.tile.scale_note_voyage', { count: summary.count })}
              testId="cranes-tile-scale"
            />
            <Tile
              tone="key"
              label={t('cranes.tile.corrected')}
              value={formatTons(summary.corrected_tons)}
              note={t('cranes.tile.corrected_note')}
              testId="cranes-tile-corrected"
            />
            <Tile
              tone={summary.delta_tons < 0 ? 'danger' : 'positive'}
              label={t('cranes.tile.delta')}
              value={formatSigned(summary.delta_tons)}
              note={t('cranes.tile.delta_note', {
                percent: formatPercent(summary.scale_tons > 0 ? (Math.abs(summary.delta_tons) / summary.scale_tons) * 100 : 0),
              })}
              testId="cranes-tile-delta"
            />
            <Tile
              label={t('cranes.tile.discharge')}
              value={formatTons(fromOwn)}
              note={matches ? t('cranes.tile.discharge_match') : t('cranes.tile.discharge_mismatch', { tons: formatTons(discharged) })}
              warn={!matches}
              testId="cranes-tile-discharge"
            />
          </div>
        )}

        <div className="cranes-columns">
          <div className="cranes-modes">
            {CRANE_MODES.map((mode) => (
              <CraneModeCard key={mode} mode={mode} totals={summary.byMode[mode]} rows={rowsOf(mode)} selected={selection} onSelect={onSelect} />
            ))}
            <p className="cranes-note">
              <Icon name="info" size={14} />
              <span>
                {t('cranes.formula_note')}
                {linked && t('cranes.formula_note_linked')}
              </span>
            </p>
          </div>
          {selection && selectedCrane && (
            <CoefficientHistory
              key={`${selection.mode}|${selection.crane_id}`}
              mode={selection.mode}
              crane={selectedCrane}
              measurements={data.measurements}
              working={data.working}
              refDate={refDate}
              onChanged={onChanged}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
  warn,
  testId,
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'key' | 'danger' | 'positive';
  warn?: boolean;
  testId: string;
}) {
  const t = useT();
  return (
    <div className={`cranes-tile${tone ? ` is-${tone}` : ''}`} data-testid={testId}>
      <div className="cranes-tile-label">{label}</div>
      <div className="cranes-tile-value mono">
        <span data-testid={`${testId}-value`}>{value}</span>
        <span className="cranes-tile-unit">{t('cranes.unit_t')}</span>
      </div>
      <div className={`cranes-tile-note${warn ? ' is-warn' : ''}`}>{note}</div>
    </div>
  );
}
