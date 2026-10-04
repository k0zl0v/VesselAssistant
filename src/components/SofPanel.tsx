import { Fragment, useState } from 'react';
import { durationMinutes, eventDays, formatDuration } from '../calc/laytime';
import { formatTons } from '../calc/round';
import type { DailyDischarge } from '../calc/time';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import type { SofEvent } from '../services/SofService';
import { formatDate } from '../shell/format';
import { categoryLabel, dayLabel, groupClass, timeRange } from './sof/labels';
import { Icon } from './ui/Icon';

interface Props {
  events: SofEvent[];
  /** Indices into `events` that overlap another event. */
  overlapping: ReadonlySet<number>;
  /** Row actions are rendered only when the voyage is open. */
  voyageOpen: boolean;
  onEdit: (event: SofEvent) => void;
  onDelete: (id: string) => Promise<void>;
  /** Discharged tons per date (`dailyDischargeTotals`); printed on the day separator rows. */
  discharge?: readonly DailyDischarge[];
}

interface DayGroup {
  date: string;
  /** Indices into `events`. */
  rows: number[];
  tons: number;
  /** Running total up to and including this day; 0 before the first discharge. */
  total: number;
}

/** Days of the log and of the discharges, ascending, each with its rows and discharge figures. */
function groupByDay(events: SofEvent[], discharge: readonly DailyDischarge[]): DayGroup[] {
  const byDate = new Map(discharge.map((d) => [d.date, d]));
  const days = Array.from(new Set([...eventDays(events), ...byDate.keys()])).sort();
  let total = 0;
  return days.map((date) => {
    const d = byDate.get(date);
    if (d) total = d.total;
    return {
      date,
      rows: events.flatMap((e, i) => (e.event_date === date ? [i] : [])),
      tons: d?.tons ?? 0,
      total,
    };
  });
}

/** Events table with an inline delete confirmation under the row (no window.confirm). */
export function SofPanel({ events, overlapping, voyageOpen, onEdit, onDelete, discharge = [] }: Props) {
  const t = useT();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await onDelete(id);
      setConfirmId(null);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const columns = voyageOpen ? 9 : 8;
  const days = groupByDay(events, discharge);

  return (
    <section className="table-card" data-testid="sof-panel">
      <table className="data-table sof-table" data-testid="sof-log">
        <thead>
          <tr>
            <th className="col-date">{t('sof.col.date')}</th>
            <th className="col-time">{t('sof.col.from')}</th>
            <th className="col-time">{t('sof.col.to')}</th>
            <th className="col-dur">{t('sof.col.duration')}</th>
            <th className="col-cat">{t('sof.col.category')}</th>
            <th>{t('sof.col.description')}</th>
            <th className="col-disch">{t('sof.col.disch_day')}</th>
            <th className="col-disch key-col">{t('sof.col.disch_total')}</th>
            {voyageOpen && (
              <th className="col-actions">
                <span className="visually-hidden">{t('sof.col.actions')}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <Fragment key={day.date}>
              <tr className="sof-day-row" data-testid="sof-day-row">
                <td colSpan={6} className="cell-day">
                  {dayLabel(day.date, true)}
                </td>
                <td className={`cell-disch${day.tons > 0 ? '' : ' zero'}`} data-testid="sof-day-disch">
                  {day.tons > 0 ? formatTons(day.tons) : '—'}
                </td>
                <td className={`cell-disch cell-total${day.total > 0 ? '' : ' zero'}`} data-testid="sof-day-total">
                  {day.total > 0 ? formatTons(day.total) : '—'}
                </td>
                {voyageOpen && <td />}
              </tr>
              {day.rows.map((i) => {
                const e = events[i]!;
                const dur = durationMinutes(e);
                const confirming = confirmId === e.id;
                return (
                  <Fragment key={e.id}>
                    <tr className={overlapping.has(i) ? 'overlap' : ''} data-testid="sof-row">
                      <td className="mono cell-date" data-testid="sof-row-date">
                        {formatDate(e.event_date)}
                      </td>
                      <td className="num" data-testid="sof-row-from">
                        {e.time_from ?? '—'}
                      </td>
                      <td className={`num cell-to${e.time_to ? '' : ' empty'}`} data-testid="sof-row-to">
                        {e.time_to ?? '—'}
                      </td>
                      <td className={`num cell-dur${dur === null ? ' zero' : ''}`} data-testid="sof-row-duration">
                        {dur === null ? '—' : formatDuration(dur)}
                      </td>
                      <td data-testid="sof-row-category">
                        <span className={`sof-cat ${groupClass(e.category)}`}>
                          <span className="sof-swatch sm" />
                          {categoryLabel(e.category)}
                        </span>
                      </td>
                      <td className="cell-desc" data-testid="sof-row-description">
                        {e.description ?? '—'}
                      </td>
                      <td className="cell-disch" />
                      <td className="cell-disch cell-total" />
                      {voyageOpen && (
                        <td>
                          <div className="sof-row-actions">
                            <button
                              type="button"
                              className="btn btn-sm btn-quiet"
                              onClick={() => onEdit(e)}
                              aria-label={t('sof.row.edit_aria')}
                              data-testid="sof-row-edit"
                            >
                              {t('sof.row.edit')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-quiet btn-icon"
                              onClick={() => {
                                setError(null);
                                setConfirmId(e.id);
                              }}
                              disabled={confirming}
                              aria-label={t('sof.delete_aria')}
                              data-testid="sof-row-delete"
                            >
                              <Icon name="close" size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {voyageOpen && confirming && (
                      <tr className="sof-confirm-row">
                        <td colSpan={columns}>
                          <div className="confirm-panel danger" role="alertdialog" data-testid="sof-row-delete-panel">
                            <div className="confirm-panel-text">
                              {t('sof.delete.prompt', {
                                label: categoryLabel(e.category),
                                date: formatDate(e.event_date),
                                time: timeRange(e),
                              })}
                            </div>
                            <div className="confirm-panel-actions">
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setConfirmId(null)}
                                disabled={busy}
                                autoFocus
                                data-testid="sof-row-delete-cancel"
                              >
                                {t('sof.delete.cancel')}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                onClick={() => void confirmDelete(e.id)}
                                disabled={busy}
                                data-testid="sof-row-delete-confirm"
                              >
                                {t('sof.delete.submit')}
                              </button>
                            </div>
                          </div>
                          {error && (
                            <p className="field-error" role="alert" data-testid="sof-row-delete-error">
                              {error}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="sof-table-foot">
        {t('sof.footnote.count', { count: events.length })}
        {' · '}
        <MidnightNote />
      </div>
    </section>
  );
}

/** «24:00 трактуется как конец суток» with the time set in mono. */
function MidnightNote() {
  const t = useT();
  const [before, after] = t('sof.footnote.midnight', { time: '\u0000' }).split('\u0000');
  return (
    <span data-testid="sof-midnight-note">
      {before}
      <span className="mono">24:00</span>
      {after}
    </span>
  );
}
