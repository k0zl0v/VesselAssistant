import { useT } from '../i18n';
import type { VoyageStatus } from '../services/types';

export function StatusChip({ status }: { status: VoyageStatus }) {
  const t = useT();
  return (
    <span className={`chip ${status === 'open' ? 'chip-positive' : ''}`} data-testid="voyage-status">
      {t(status === 'open' ? 'voyage.status.open' : 'voyage.status.closed')}
    </span>
  );
}
