import { formatTons } from '../../calc/round';
import { useT, type StringKey } from '../../i18n';
import type { VoyageCalcResult } from '../../services/CalculationService';
import type { WorkbookSheet } from './sheets';

interface Props {
  vessel_name: string;
  voyage_no: string;
  /** «Novorossiysk → Iskenderun»; empty when the voyage has no ports. */
  route: string;
  asOf: string;
  calc: VoyageCalcResult;
  /** Null while the cargo labels are still being read. */
  cargoByHold: Map<string, string> | null;
  sheets: WorkbookSheet[];
}

const tons = (x: number | null): string => (x === null ? '—' : formatTons(x));
const neg = (x: number): string | undefined => (x < 0 ? 'is-negative' : undefined);

const COLUMNS: { key: StringKey; num: boolean }[] = [
  { key: 'documents.print.col.hold', num: false },
  { key: 'documents.print.col.cargo', num: false },
  { key: 'documents.print.col.sf', num: true },
  { key: 'documents.print.col.volume', num: true },
  { key: 'documents.print.col.loaded', num: true },
  { key: 'documents.print.col.discharged', num: true },
  { key: 'documents.print.col.remain', num: true },
  { key: 'documents.print.col.empty_98', num: true },
];

/**
 * Print-like view of sheet 1 with the same CalculationService numbers DocumentEngine writes.
 * Eight columns as in the mockup: with the revision column, capacity 98 % and empty vol % do not fit at 1440 px.
 */
export function LoadPlanPreview({ vessel_name, voyage_no, route, asOf, calc, cargoByHold, sheets }: Props) {
  const t = useT();
  const { totals } = calc;
  const voyageLine = [t('documents.print.voyage', { voyage_no }), route, t('documents.print.as_of', { date: asOf })]
    .filter(Boolean)
    .join(' · ');
  const summary: [StringKey, number][] = [
    ['documents.print.on_board', totals.on_board],
    ['documents.print.discharged', totals.total_discharged],
    ['documents.print.empty_100', totals.total_empty_100],
    ['documents.print.empty_98', totals.total_empty_98],
  ];

  return (
    <section className="card doc-preview" data-testid="documents-preview">
      <div className="doc-preview-header">
        <h2 className="card-title">{t('documents.preview.title')}</h2>
        <span className="doc-values-badge">{t('documents.preview.values_only')}</span>
      </div>

      <div className="doc-preview-well">
        <div className="doc-sheet">
          <div className="doc-sheet-title" data-testid="documents-preview-heading">
            {t('documents.print.heading', { vessel: vessel_name })}
          </div>
          <div className="doc-sheet-subtitle">{voyageLine}</div>

          <table className="doc-print-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={c.num ? 'is-num' : undefined}>
                    {t(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calc.holds.map((h) => (
                <tr key={h.hold_id} data-testid="documents-preview-row">
                  <td className="mono">№{h.hold_no}</td>
                  <td>{cargoByHold ? (cargoByHold.get(h.hold_id) ?? '—') : ''}</td>
                  <td className="num">{tons(h.sf)}</td>
                  <td className="num">{formatTons(h.volume_m3)}</td>
                  <td className="num">{formatTons(h.loaded_tons)}</td>
                  <td className="num">{formatTons(h.discharged_tons)}</td>
                  <td className={`num ${neg(h.remain_tons) ?? ''}`}>{formatTons(h.remain_tons)}</td>
                  <td className="num">{tons(h.empty_space_98)}</td>
                </tr>
              ))}
              <tr className="doc-print-total" data-testid="documents-preview-total">
                <td colSpan={4}>{t('documents.print.total')}</td>
                <td className="num">{formatTons(totals.total_loaded)}</td>
                <td className="num">{formatTons(totals.total_discharged)}</td>
                <td className={`num ${neg(totals.on_board) ?? ''}`}>{formatTons(totals.on_board)}</td>
                <td className="num">{formatTons(totals.total_empty_98)}</td>
              </tr>
            </tbody>
          </table>

          <table className="doc-print-summary" data-testid="documents-preview-summary">
            <tbody>
              {summary.map(([key, value]) => (
                <tr key={key}>
                  <th scope="row">{t(key)}</th>
                  <td className={`num ${neg(value) ?? ''}`}>{formatTons(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="doc-sheet-tabs" aria-label={t('documents.preview.sheets')}>
        {sheets.map((s, i) => (
          <span key={s.key} className={i === 0 ? 'doc-sheet-tab is-active' : 'doc-sheet-tab'}>
            {s.name}
          </span>
        ))}
      </div>
    </section>
  );
}
