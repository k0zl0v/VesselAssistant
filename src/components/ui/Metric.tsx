import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: string;
  unit?: string;
  note?: ReactNode;
  /** The dark key tile («На борту»); grows to fill the row. */
  primary?: boolean;
  testId?: string;
}

export function Metric({ label, value, unit, note, primary, testId }: Props) {
  return (
    <div className={`metric${primary ? ' metric-key' : ''}`} data-testid={testId}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        <span data-testid={testId ? `${testId}-value` : undefined}>{value}</span>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      {note && <div className="metric-note">{note}</div>}
    </div>
  );
}
