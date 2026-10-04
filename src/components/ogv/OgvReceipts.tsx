import type { CSSProperties } from 'react';
import { formatTons } from '../../calc/round';
import { useT } from '../../i18n';
import type { OgvSummary } from '../../services/OgvVesselService';
import { cargoColor } from '../ui/cargo';
import { formatStamp, splitSlot } from './format';

/** «Поступления на борт»: barges first, then transshipments from the main vessel's holds. */
export function OgvReceipts({ summary, mainVessel }: { summary: OgvSummary; mainVessel: string }) {
  const t = useT();
  const { receipts, totals } = summary;
  const [head, tail] = splitSlot(t('ogv.receipts.total', {}), '{tons}');

  return (
    <section className="card ogv-receipts" data-testid="ogv-receipts">
      <div className="ogv-receipts-head">
        <h2 className="ogv-section-title">{t('ogv.receipts.title')}</h2>
        <span className="ogv-spacer" />
        <span className="ogv-section-sub">
          {head}
          <span className="mono ogv-strong" data-testid="ogv-receipts-total">
            {formatTons(totals.loaded_tons)}
          </span>
          {tail}
        </span>
      </div>
      {receipts.length === 0 ? (
        <p className="ogv-receipts-empty" data-testid="ogv-receipts-empty">
          {t('ogv.receipts.empty')}
        </p>
      ) : (
        <div className="ogv-receipts-scroll">
          <table className="data-table ogv-receipts-table">
            <thead>
              <tr>
                <th>{t('ogv.receipts.col.source')}</th>
                <th className="col-cargo">{t('ogv.receipts.col.cargo')}</th>
                <th className="col-ogv-hold">{t('ogv.receipts.col.ogv_hold')}</th>
                <th className="num col-tons">{t('ogv.receipts.col.tons')}</th>
                <th className="col-started">{t('ogv.receipts.col.started')}</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => {
                const main = r.source_kind === 'main_hold';
                const source = main
                  ? t('ogv.receipts.main_source', { vessel: mainVessel, no: r.source_hold_no ?? '?' })
                  : r.source_name;
                const scale = formatTons(r.tons);
                const note = main
                  ? r.crane_name
                    ? t('ogv.receipts.main_note', { crane: r.crane_name, tons: scale })
                    : t('ogv.receipts.main_note_no_crane', { tons: scale })
                  : t('ogv.receipts.barge_note');
                return (
                  <tr key={r.id} className={main ? 'ogv-receipt-main' : undefined} data-testid={`ogv-receipt-${r.source_kind}`}>
                    <td>
                      <span className="ogv-receipt-source">
                        <span
                          className="ogv-dot"
                          style={{ '--dot': cargoColor(r.cargo_name) } as CSSProperties}
                          aria-hidden="true"
                        />
                        {source}
                      </span>
                      <span className="ogv-receipt-note">{note}</span>
                    </td>
                    <td className={r.cargo_name ? 'ogv-muted' : 'zero'}>{r.cargo_name ?? '—'}</td>
                    <td className="mono">№{r.ogv_hold_no}</td>
                    <td className="num ogv-receipt-tons">{scale}</td>
                    <td className="mono ogv-faint">{formatStamp(r.started_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="ogv-receipts-note">{t('ogv.receipts.note', { vessel: mainVessel })}</div>
    </section>
  );
}
