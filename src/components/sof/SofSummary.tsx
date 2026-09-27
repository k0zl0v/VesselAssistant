import { formatDuration, type SofSummary as Summary } from '../../calc/laytime';
import { useT } from '../../i18n';
import { formatDateRange } from '../../shell/format';

interface TileProps {
  label: string;
  value: string;
  note: string;
  tone?: 'warn' | 'danger';
  testId: string;
}

function Tile({ label, value, note, tone, testId }: TileProps) {
  return (
    <div className="sof-stat" data-testid={testId}>
      <div className="sof-stat-label">{label}</div>
      <div className={`sof-stat-value${tone ? ` ${tone}` : ''}`} data-testid={`${testId}-value`}>
        {value}
      </div>
      <div className="sof-stat-note">{note}</div>
    </div>
  );
}

/** Summary row over the whole log; every figure comes from `summarizeSof`. */
export function SofSummary({ summary }: { summary: Summary }) {
  const t = useT();
  const overlaps = summary.overlapPairs.length;
  return (
    <div className="sof-stats">
      <Tile
        label={t('sof.stat.events')}
        value={String(summary.eventCount)}
        note={t('sof.stat.events_note', {
          range: formatDateRange(summary.firstDate, summary.lastDate) ?? '—',
          days: summary.spanDays,
        })}
        testId="sof-stat-events"
      />
      <Tile
        label={t('sof.stat.working')}
        value={formatDuration(summary.workingMinutes)}
        note={t('sof.stat.working_note')}
        testId="sof-stat-working"
      />
      <Tile
        label={t('sof.stat.weather')}
        value={formatDuration(summary.weatherMinutes)}
        note={t('sof.stat.weather_note', { count: summary.weatherEventCount })}
        tone={summary.weatherMinutes > 0 ? 'warn' : undefined}
        testId="sof-stat-weather"
      />
      <Tile
        label={t('sof.stat.overlaps')}
        value={String(overlaps)}
        note={t(overlaps > 0 ? 'sof.stat.overlaps_note' : 'sof.stat.overlaps_none')}
        tone={overlaps > 0 ? 'danger' : undefined}
        testId="sof-stat-overlaps"
      />
    </div>
  );
}
