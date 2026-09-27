import { eventDays, SOF_GROUPS } from '../../calc/laytime';
import { timeToMinutes } from '../../calc/time';
import { useT } from '../../i18n';
import type { SofEvent } from '../../services/SofService';
import { categoryLabel, dayLabel, groupClass, groupLabel, timeRange } from './labels';

const DAY_MINUTES = 1440;
const TICKS = ['00', '04', '08', '12', '16', '20', '24'];
/** Below this a bar is too narrow for text; the title attribute still names it. */
const LABEL_MIN_MINUTES = 120;

const pct = (minutes: number): string => `${(minutes / DAY_MINUTES) * 100}%`;

interface Props {
  events: SofEvent[];
  /** Indices into `events` that overlap another event (drawn with a danger border). */
  overlapping: ReadonlySet<number>;
}

/** One 00–24 track per event day; a bar per timed event, coloured by category group. */
export function SofTimeline({ events, overlapping }: Props) {
  const t = useT();
  const days = eventDays(events);
  return (
    <section className="card sof-timeline" data-testid="sof-timeline">
      <div className="sof-timeline-head">
        <h2 className="sof-timeline-title">{t('sof.timeline.title')}</h2>
        <ul className="sof-legend">
          {SOF_GROUPS.map((g) => (
            <li key={g} className={`sof-g-${g}`}>
              <span className="sof-swatch" />
              {groupLabel(g)}
            </li>
          ))}
        </ul>
      </div>
      <div className="sof-axis" aria-hidden="true">
        <span className="sof-axis-spacer" />
        <div className="sof-axis-ticks">
          {TICKS.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
      </div>
      {days.map((day) => (
        <div className="sof-day" key={day} data-testid="sof-timeline-day">
          <span className="sof-day-label">{dayLabel(day)}</span>
          <div className="sof-track">
            {events.map((e, i) => {
              if (e.event_date !== day) return null;
              const from = timeToMinutes(e.time_from);
              if (from === null) return null;
              const to = timeToMinutes(e.time_to);
              const point = to === null || to <= from;
              const label = e.description || categoryLabel(e.category);
              const title = `${categoryLabel(e.category)} ${timeRange(e)}${to === null ? ` · ${t('sof.timeline.no_end')}` : ''}${e.description ? ` · ${e.description}` : ''}`;
              return (
                <div
                  key={e.id}
                  className={`sof-bar ${groupClass(e.category)}${point ? ' point' : ''}${overlapping.has(i) ? ' overlap' : ''}`}
                  style={{ left: pct(from), width: point ? undefined : pct(to - from) }}
                  title={title}
                  data-testid="sof-timeline-bar"
                >
                  {!point && to - from >= LABEL_MIN_MINUTES && <span className="sof-bar-label">{label}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
