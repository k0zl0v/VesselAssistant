import type { CSSProperties } from 'react';
import { formatTons } from '../../calc/round';
import { useT } from '../../i18n';
import type { VoyageHoldCalc } from '../../services/CalculationService';
import type { OgvStepView } from '../../services/OgvVesselService';
import { cargoColor } from '../ui/cargo';
import { stepLabel, stepStateText } from './format';

export interface AvailableHold {
  hold: VoyageHoldCalc;
  cargo_names: string[];
  /** Source vessel of the top active layer — the one LIFO takes next. */
  top_vessel: string | null;
}

interface Props {
  mainVessel: string;
  available: AvailableHold[];
  onBoard: number;
  steps: OgvStepView[];
  /** Null when the voyage is closed: the holds are listed but not clickable. */
  onPickHold: ((hold_id: string) => void) | null;
  onEditSequence: (() => void) | null;
}

/** Right column: what the main vessel still has (the source of a transshipment) and the sequence plan. */
export function OgvSidebar({ mainVessel, available, onBoard, steps, onPickHold, onEditSequence }: Props) {
  const t = useT();
  return (
    <aside className="card ogv-sidebar" data-testid="ogv-sidebar">
      <h2 className="ogv-section-title">{t('ogv.available.title', { vessel: mainVessel })}</h2>
      <p className="ogv-sidebar-sub">{t('ogv.available.subtitle')}</p>
      {available.length === 0 && <p className="ogv-sidebar-empty">{t('ogv.available.empty')}</p>}
      {available.map(({ hold, cargo_names, top_vessel }) => {
        const cargo = cargo_names.join(' · ');
        const content = (
          <>
            <span className="ogv-dot" style={{ '--dot': cargoColor(cargo_names[0]) } as CSSProperties} aria-hidden="true" />
            <span className="ogv-avail-text">
              <span className="ogv-avail-hold">{t('ogv.available.hold', { no: hold.hold_no })}</span>
              <span className="ogv-avail-sub">
                {top_vessel ? t('ogv.available.top', { cargo, vessel: top_vessel }) : cargo}
              </span>
            </span>
            <span className="ogv-avail-tons mono">{formatTons(hold.remain_tons)}</span>
          </>
        );
        return onPickHold ? (
          <button
            key={hold.hold_id}
            type="button"
            className="ogv-avail"
            onClick={() => onPickHold(hold.hold_id)}
            data-testid={`ogv-available-${hold.hold_no}`}
          >
            {content}
          </button>
        ) : (
          <div key={hold.hold_id} className="ogv-avail" data-testid={`ogv-available-${hold.hold_no}`}>
            {content}
          </div>
        );
      })}
      <div className="ogv-onboard">
        <span>{t('ogv.available.on_board')}</span>
        <span className="mono" data-testid="ogv-on-board">
          {formatTons(onBoard)} {t('ogv.unit.t')}
        </span>
      </div>

      <span className="ogv-spacer" />

      <div className="ogv-steps-head">
        <span className="ogv-steps-title">{t('ogv.steps.title')}</span>
        {onEditSequence && (
          <button type="button" className="btn btn-sm btn-quiet" onClick={onEditSequence} data-testid="ogv-steps-edit">
            {t('ogv.action.sequence')}
          </button>
        )}
      </div>
      {steps.length === 0 ? (
        <p className="ogv-sidebar-empty" data-testid="ogv-steps-empty">
          {t('ogv.steps.empty')}
        </p>
      ) : (
        <ol className="ogv-steps" data-testid="ogv-steps">
          {steps.map((s, i) => (
            <li key={s.id} className={`ogv-step ${s.state}`} data-testid={`ogv-step-${i + 1}`}>
              <span className="ogv-step-no mono">{i + 1}</span>
              <span className="ogv-step-label">{stepLabel(t, s)}</span>
              <span className="ogv-step-state">{stepStateText(t, s)}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
