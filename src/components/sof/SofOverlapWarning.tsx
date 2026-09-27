import type { OverlapPair } from '../../calc/laytime';
import { useT } from '../../i18n';
import type { SofEvent } from '../../services/SofService';
import { Icon } from '../ui/Icon';
import { eventName, shortDate } from './labels';

interface Props {
  events: SofEvent[];
  pairs: OverlapPair[];
  /** Opens the later event of the first pair for editing; absent when the voyage is closed. */
  onFix?: (event: SofEvent) => void;
}

export function SofOverlapWarning({ events, pairs, onFix }: Props) {
  const t = useT();
  if (pairs.length === 0) return null;
  const text = pairs
    .map(({ a, b }) =>
      t('sof.overlap.pair', {
        date: shortDate(events[a]!.event_date),
        a: eventName(events[a]!),
        b: eventName(events[b]!),
      }),
    )
    .join('; ');
  const target = events[pairs[0]!.b]!;
  return (
    <div className="sof-warning" role="status" data-testid="sof-overlap-warning">
      <Icon name="warning" size={16} />
      <span className="sof-warning-text" data-testid="sof-overlap-text">
        {t('sof.overlap.text', { pairs: text })}
      </span>
      {onFix && (
        <button type="button" className="btn btn-sm" onClick={() => onFix(target)} data-testid="sof-overlap-fix">
          {t('sof.overlap.fix')}
        </button>
      )}
    </div>
  );
}
