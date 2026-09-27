import { formatPercent } from '../../calc/round';

interface Props {
  /** Fill relative to capacity at 98 %, in percent; null when capacity is unknown. */
  percent: number | null;
  color: string;
  testId?: string;
}

/** Scale to the 98 % limit: label turns warning at ≥ 75 %, danger at ≥ 95 %. */
export function FillBar({ percent, color, testId }: Props) {
  const level = percent === null ? '' : percent >= 95 ? ' over' : percent >= 75 ? ' warn' : '';
  const width = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className="fill-bar" data-testid={testId}>
      <div className="fill-bar-track">
        <div className="fill-bar-value" style={{ width: `${width}%`, background: color }} />
      </div>
      <span className={`fill-bar-label${level}`}>{percent === null ? '—' : formatPercent(percent)}</span>
    </div>
  );
}
