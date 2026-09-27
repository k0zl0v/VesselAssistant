import type { CSSProperties } from 'react';
import { formatTons } from '../../calc/round';
import { useT } from '../../i18n';
import { cargoColor } from '../ui/cargo';
import type { HoldStack, StackLayer } from './model';

interface Props {
  stacks: HoldStack[];
  cargoNames: string[];
  selectedHoldId: string | null;
  onSelectHold: (hold_id: string) => void;
}

/** One column per hold, top layer first; LIFO order is the only order shown (TZ §8.11). */
export function LayerStacks({ stacks, cargoNames, selectedHoldId, onSelectHold }: Props) {
  const t = useT();
  return (
    <div className="layers-main">
      <div className="layers-legend">
        {cargoNames.map((c) => (
          <span key={c} className="layers-legend-item">
            <span className="layers-swatch" style={{ background: cargoColor(c) }} />
            {c}
          </span>
        ))}
        <span className="layers-legend-item">
          <span className="layers-swatch layers-swatch-discharged" />
          {t('layers.legend.discharged')}
        </span>
        <span className="layers-legend-item">
          <span className="layers-swatch-cap" />
          {t('layers.legend.capacity')}
        </span>
        <span className="layers-legend-spacer" />
        <span className="layers-legend-scale">{t('layers.legend.scale')}</span>
      </div>

      <div className="layers-board card" role="list" aria-label={t('layers.stacks_label')}>
        {stacks.map((h) => (
          <HoldColumn
            key={h.hold_id}
            hold={h}
            selected={h.hold_id === selectedHoldId}
            onSelect={() => onSelectHold(h.hold_id)}
          />
        ))}
      </div>
    </div>
  );
}

function HoldColumn({ hold, selected, onSelect }: { hold: HoldStack; selected: boolean; onSelect: () => void }) {
  const t = useT();
  return (
    <div
      className={`layers-hold${selected ? ' selected' : ''}`}
      role="listitem"
      data-testid={`layers-hold-${hold.hold_no}`}
    >
      <div className="layers-stack">
        {hold.capPct !== null && hold.capacity_tons_98 !== null && (
          <div className="layers-cap" style={{ bottom: `${hold.capPct}%` }} data-testid={`layers-cap-${hold.hold_no}`}>
            <span className="layers-cap-label num">{formatTons(hold.capacity_tons_98)}</span>
          </div>
        )}
        {hold.layers.map((l) => (
          <LayerBlock key={l.id} holdNo={hold.hold_no} layer={l} />
        ))}
      </div>

      <button
        type="button"
        className="btn layers-caption"
        aria-pressed={selected}
        aria-label={t('layers.hold.select', { no: hold.hold_no })}
        onClick={onSelect}
        data-testid={`layers-hold-select-${hold.hold_no}`}
      >
        <span className="layers-caption-row">
          <span className="layers-hold-no">{t('layers.hold', { no: hold.hold_no })}</span>
          <span className="layers-hold-sf mono">
            {hold.sf !== null ? t('layers.hold.sf', { sf: formatTons(hold.sf) }) : t('layers.hold.no_sf')}
          </span>
        </span>
        <span className="layers-caption-line">
          <span>{t('layers.hold.remain')}</span>
          <span className={`num layers-hold-remain${hold.remain_tons < 0 ? ' negative' : ''}`}>
            {formatTons(hold.remain_tons)}
          </span>
        </span>
        <span className="layers-caption-line">
          <span>{t('layers.hold.free_98')}</span>
          <span className="num">{hold.empty_space_98 !== null ? formatTons(hold.empty_space_98) : '—'}</span>
        </span>
      </button>
    </div>
  );
}

function LayerBlock({ holdNo, layer }: { holdNo: number; layer: StackLayer }) {
  const t = useT();
  const unit = t('voyage.totals.unit_t');
  const style = {
    '--layer-h': `${layer.heightPct}%`,
    '--layer-solid': `${layer.solidPct}%`,
    '--layer-color': cargoColor(layer.cargo_name),
  } as CSSProperties;
  // The sequence label sits on the fill when almost nothing was discharged — it needs light ink there.
  const labelOnFill = !layer.depleted && layer.solidPct > 88;
  return (
    <div
      className={`layers-block${layer.depleted ? ' depleted' : ''}${layer.isTop ? ' top' : ''}${labelOnFill ? ' label-on-fill' : ''}`}
      style={style}
      title={layer.depleted ? `${layer.source_vessel} · ${t('layers.layer_closed')}` : undefined}
      data-testid={`layer-${holdNo}-${layer.load_sequence}`}
    >
      {!layer.depleted && (
        <div className="layers-solid">
          <span className="layers-vessel">{layer.source_vessel}</span>
          <span className="layers-remain mono">
            {formatTons(layer.remaining_tons)} {unit}
          </span>
        </div>
      )}
      {layer.depleted && (
        <>
          <span className="visually-hidden">{layer.source_vessel}</span>
          <span className="layers-closed">{t('layers.layer_closed')}</span>
        </>
      )}
      <span className="visually-hidden">{layer.cargo_name}</span>
      <span className="layers-seq mono">
        {layer.isTop ? t('layers.layer_top', { n: layer.load_sequence }) : t('layers.layer', { n: layer.load_sequence })}
      </span>
    </div>
  );
}
