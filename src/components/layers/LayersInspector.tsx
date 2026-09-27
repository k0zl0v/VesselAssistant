import type { CSSProperties } from 'react';
import { MINUS, formatTons } from '../../calc/round';
import { useT } from '../../i18n';
import { formatDate } from '../../shell/format';
import { Icon } from '../ui/Icon';
import type { HistoryEntry, SourceRemain } from './model';

interface Props {
  sources: SourceRemain[];
  onBoard: number;
  history: HistoryEntry[];
}

const holdList = (nos: number[]): string => nos.map((n) => `№${n}`).join(', ');

/** Right column: FR-18 remains by source vessel and what each discharge wrote off. */
export function LayersInspector({ sources, onBoard, history }: Props) {
  const t = useT();
  const unit = t('voyage.totals.unit_t');

  return (
    <aside className="layers-inspector">
      <section className="card layers-panel" data-testid="layers-sources">
        <h2 className="layers-panel-title">{t('layers.sources.title')}</h2>
        <p className="layers-panel-subtitle">{t('layers.sources.subtitle')}</p>
        {sources.map((s) => {
          const detail = [
            s.hold_nos.length > 0 ? t('layers.sources.holds', { holds: holdList(s.hold_nos) }) : null,
            s.written_off_hold_nos.length > 0
              ? t('layers.sources.written_off', { holds: holdList(s.written_off_hold_nos) })
              : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <div className="layers-source" key={s.source_vessel} data-testid={`layers-source-${s.source_vessel}`}>
              <div className="layers-source-row">
                <span className="layers-source-name">{s.source_vessel}</span>
                <span className="num">
                  {formatTons(s.remaining_tons)} {unit}
                </span>
              </div>
              <div className="layers-source-track">
                <div className="layers-source-bar" style={{ '--bar': `${s.barPct}%` } as CSSProperties} />
              </div>
              {detail && <div className="layers-source-detail">{detail}</div>}
            </div>
          );
        })}
        <div className="layers-onboard">
          <span>{t('layers.sources.on_board')}</span>
          <span className="num" data-testid="layers-on-board">
            {formatTons(onBoard)} {unit}
          </span>
        </div>
      </section>

      <section className="card layers-panel layers-history" data-testid="layers-history">
        <h2 className="layers-panel-title">{t('layers.history.title')}</h2>
        <p className="layers-panel-subtitle">{t('layers.history.subtitle')}</p>
        <div className="layers-history-list">
          {history.length === 0 && <p className="layers-history-empty">{t('layers.history.empty')}</p>}
          {history.map((op) => (
            <div className="layers-op" key={op.operation_id} data-testid={`layers-op-${op.seq}`}>
              <div className="layers-op-head">
                <span className="layers-op-id mono">
                  {t('layers.history.op', { n: String(op.seq).padStart(4, '0') })}
                </span>
                <span className="layers-op-date mono">{formatDate(op.event_date)}</span>
              </div>
              <div className="layers-op-meta">
                {t('layers.history.hold', { no: op.hold_no })} ·{' '}
                <span className="num layers-op-tons">
                  {formatTons(op.tons)} {unit}
                </span>
              </div>
              {op.allocations.map((a) => (
                <div className="layers-alloc" key={a.cargo_layer_id}>
                  <span className="layers-alloc-seq mono">{t('layers.layer', { n: a.load_sequence })}</span>
                  <span className="layers-alloc-vessel">{a.source_vessel}</span>
                  <span className="layers-alloc-tons num">{MINUS}{formatTons(a.discharged_tons)}</span>
                  <span className={`layers-alloc-state${a.closed ? ' closed' : ''}`}>
                    {a.closed
                      ? t('layers.layer_closed')
                      : t('layers.history.remain', { tons: formatTons(a.remaining_after) })}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="layers-footnote">
          <Icon name="info" size={14} />
          <span>{t('layers.footnote')}</span>
        </div>
      </section>
    </aside>
  );
}
