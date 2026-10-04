import { formatTons } from '../../calc/round';
import { useT } from '../../i18n';
import type { CraneMode, CraneShiftRecord, ShiftTotals } from '../../services/CraneShiftService';
import type { Crane } from '../../services/ReferenceService';
import { formatK, formatSigned, MODE_META } from './modes';

export interface CraneRow {
  crane: Crane;
  totals: ShiftTotals | undefined;
  lines: CraneShiftRecord[];
  /** Working value on the reference date, shown when the period has no lines. */
  working: number | null;
  /** «трюм №3 · 01.05 12:05» / barge names of the lines. */
  link: string;
}

interface Props {
  mode: CraneMode;
  totals: ShiftTotals;
  rows: CraneRow[];
  selected: { mode: CraneMode; crane_id: string } | null;
  onSelect: (mode: CraneMode, crane_id: string) => void;
}

const sign = (x: number): string => (x < 0 ? 'neg' : 'pos');

/** One operation mode: the cranes' scale weight ÷ coefficient = corrected, with the delta. */
export function CraneModeCard({ mode, totals, rows, selected, onSelect }: Props) {
  const t = useT();
  const meta = MODE_META[mode];
  const isSelectedMode = selected?.mode === mode;
  const hasLines = totals.count > 0;

  return (
    <section className={`cranes-mode${isSelectedMode ? ' is-selected' : ''}`} data-testid={`cranes-mode-${mode}`}>
      <div className="cranes-mode-head">
        <span className={`cranes-mode-badge cranes-badge-${mode}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={meta.icon} />
          </svg>
        </span>
        <h2 className="cranes-mode-title">{t(meta.label)}</h2>
        <span className="cranes-mode-sub">{t(meta.subtitle)}</span>
        <span className="toolbar-spacer" />
        {hasLines && (
          <>
            <span className="cranes-mode-scale">
              {t('cranes.by_scales')} <span className="mono">{formatTons(totals.scale_tons)}</span>
            </span>
            <span className="cranes-mode-corr">
              → <span className="mono" data-testid={`cranes-mode-${mode}-corrected`}>{formatTons(totals.corrected_tons)}</span> {t('cranes.unit_t')}
            </span>
            <span className={`cranes-delta-chip mono ${sign(totals.delta_tons)}`}>{formatSigned(totals.delta_tons)}</span>
          </>
        )}
      </div>

      {rows.map((r) => {
        const active = isSelectedMode && selected?.crane_id === r.crane.id;
        const ks = [...new Set(r.lines.map((l) => l.coefficient))];
        const mixed = ks.length > 1;
        const k = r.totals && r.totals.corrected_tons > 0 ? (mixed ? r.totals.scale_tons / r.totals.corrected_tons : ks[0]!) : r.working;
        const inputId = `cranes-${mode}-${r.crane.id}`;
        return (
          <div key={r.crane.id} className={`cranes-row${active ? ' is-active' : ''}`} data-testid={`cranes-row-${mode}-${r.crane.name}`}>
            <span className="cranes-row-name">{r.crane.name}</span>
            <span className="cranes-row-label" id={`${inputId}-l`}>
              {t('cranes.scale_label')}
            </span>
            <output className="cranes-scale mono" aria-labelledby={`${inputId}-l`}>
              {r.totals ? formatTons(r.totals.scale_tons) : '—'}
            </output>
            <span className="cranes-op" aria-hidden="true">÷</span>
            <button
              type="button"
              className={`cranes-k mono${active ? ' is-active' : ''}${k === null ? ' is-missing' : ''}`}
              aria-pressed={active}
              aria-label={t('cranes.k_select', { mode: t(meta.label), crane: r.crane.name })}
              title={mixed ? t('cranes.k_mixed') : undefined}
              onClick={() => onSelect(mode, r.crane.id)}
              data-testid={`cranes-k-${mode}-${r.crane.name}`}
            >
              {k === null ? t('cranes.k_missing') : `${mixed ? '≈' : ''}${formatK(k)}`}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 9l5 5 5-5" />
              </svg>
            </button>
            <span className="cranes-op" aria-hidden="true">=</span>
            <span className="cranes-corrected mono">{r.totals ? formatTons(r.totals.corrected_tons) : '—'}</span>
            <span className={`cranes-row-delta mono ${r.totals ? sign(r.totals.delta_tons) : ''}`}>
              {r.totals ? formatSigned(r.totals.delta_tons) : ''}
            </span>
            <span className="cranes-row-link" title={r.link || undefined}>
              {r.totals ? r.link : t('cranes.no_lines')}
            </span>
          </div>
        );
      })}
    </section>
  );
}
