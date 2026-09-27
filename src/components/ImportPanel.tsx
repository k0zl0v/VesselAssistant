import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { formatTons } from '../calc/round';
import { getAutoBackup } from '../autoBackup';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import type { ImportRowError, ParsedHold, ParsedLoadPlan } from '../services/ImportService';
import { PROTEIN_ALLOWED } from '../services/types';
import { useNavigation } from '../shell/navigation';
import { useVoyage } from '../shell/VoyageContext';
import { fileName } from './tools/backupFile';
import { cargoColor } from './ui/cargo';
import { Icon } from './ui/Icon';
import { EmptyState, ErrorState } from './ui/states';
import '../styles/tools.css';

interface Failure {
  title: string;
  message: string;
  hint: string;
  details: string;
}

interface Applied {
  voyage_id: string;
  voyage_no: string;
  rejected: ImportRowError[];
}

/** Mirrors the FR-19 filter in `ImportService.applyImport`, so the preview warns before Apply. */
const willBeRejected = (h: ParsedHold): boolean =>
  h.protein_percent !== null && !PROTEIN_ALLOWED.includes(h.protein_percent);

const technical = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** ImportService drags ExcelJS in; loaded on demand so it stays off the cold path. */
async function importer() {
  const [{ ImportService }, db, auto] = await Promise.all([
    import('../services/ImportService'),
    getDb(),
    getAutoBackup(),
  ]);
  return new ImportService(db, auto);
}

function Tons({ value }: { value: number }) {
  return value === 0 ? <span className="zero">—</span> : <>{formatTons(value)}</>;
}

export function ImportPanel() {
  const t = useT();
  const { reload, voyages } = useVoyage();
  const { navigate } = useNavigation();
  const [busy, setBusy] = useState<'pick' | 'apply' | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [parsed, setParsed] = useState<ParsedLoadPlan | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);

  function reset(): void {
    setParsed(null);
    setSource(null);
    setFailure(null);
  }

  async function handlePick(): Promise<void> {
    setBusy('pick');
    setFailure(null);
    setApplied(null);
    try {
      const picked = await open({
        title: t('import.pick_dialog_title'),
        multiple: false,
        directory: false,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (!picked || typeof picked !== 'string') return;
      const bytes = await readFile(picked);
      const result = await (await importer()).parseLoadPlan(bytes);
      setParsed(result);
      setSource(picked);
    } catch (e) {
      setParsed(null);
      setFailure({
        title: t('tools.import.error.read'),
        message: describeError(e),
        hint: t('tools.import.error.read_hint'),
        details: technical(e),
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleApply(): Promise<void> {
    if (!parsed) return;
    setBusy('apply');
    setFailure(null);
    try {
      const { voyage_id, rejected } = await (await importer()).applyImport(parsed);
      setApplied({ voyage_id, voyage_no: parsed.voyage_no ?? '', rejected });
      reset();
      await reload(voyage_id);
    } catch (e) {
      setFailure({
        title: t('tools.import.error.apply'),
        message: describeError(e),
        hint: t('tools.import.error.apply_hint'),
        details: technical(e),
      });
      // Phase 2 failures leave an open voyage behind; the rail must list it.
      await reload();
    } finally {
      setBusy(null);
    }
  }

  const pickButton = (
    <button
      type="button"
      className={parsed ? 'btn' : 'btn btn-primary'}
      onClick={() => void handlePick()}
      disabled={busy !== null}
      data-testid="import-pick"
    >
      <Icon name="document" size={14} />
      {busy === 'pick' ? t('import.reading') : parsed ? t('tools.import.pick_other') : t('tools.import.pick')}
    </button>
  );

  const rejectedAhead = parsed ? parsed.holds.filter(willBeRejected) : [];
  const appliedNo = applied
    ? (voyages.find((v) => v.id === applied.voyage_id)?.voyage_no ?? applied.voyage_no)
    : '';

  return (
    <section className="card tools-card" data-testid="import-panel" aria-labelledby="import-title">
      <header className="card-header">
        <h2 className="card-title" id="import-title">
          {t('tools.import.title')}
        </h2>
        <span className="card-subtitle">{t('tools.import.subtitle')}</span>
      </header>
      <div className="card-body tools-card-body">
        <p className="tools-text">{t('tools.import.text')}</p>

        {applied && (
          <div className="tools-stack" data-testid="import-applied">
            <div className="banner banner-positive tools-banner" role="status">
              <Icon name="check" size={14} />
              <span>{t('tools.import.applied', { voyage_no: appliedNo })}</span>
              <span className="toolbar-spacer" />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => navigate('load-plan')}
                data-testid="import-open-voyage"
              >
                {t('tools.import.open_voyage')}
              </button>
            </div>
            {applied.rejected.map((r) => (
              <div className="banner banner-warning tools-banner" key={`${r.sheet}-${r.cell}-${r.hold_no}`} data-testid="import-rejected">
                <Icon name="warning" size={14} />
                <span>
                  {t('import.rejected_row', {
                    sheet: r.sheet,
                    cell: r.cell,
                    hold_no: r.hold_no,
                    reason: describeError(r.error),
                  })}
                </span>
              </div>
            ))}
          </div>
        )}

        {failure && (
          <ErrorState
            title={failure.title}
            message={failure.message}
            hint={failure.hint}
            details={failure.details}
            testId="import-error"
          />
        )}

        {parsed ? (
          <div className="tools-stack" data-testid="import-preview">
            <div className="tools-actions">
              {pickButton}
              {source && (
                <span className="mono tools-path" title={source}>
                  {fileName(source)}
                </span>
              )}
            </div>
            <dl className="tools-kv tools-kv-row">
              <div>
                <dt>{t('import.preview.vessel')}</dt>
                <dd>
                  <strong>{parsed.vessel_name}</strong>
                </dd>
              </div>
              <div>
                <dt>{t('import.preview.voyage_no')}</dt>
                <dd className="mono">{parsed.voyage_no ?? t('import.preview.voyage_no_auto')}</dd>
              </div>
              <div>
                <dt>{t('import.preview.loading_port')}</dt>
                <dd>{parsed.loading_port ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('import.preview.discharging_port')}</dt>
                <dd>{parsed.discharging_port ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('tools.import.sheet')}</dt>
                <dd className="mono">{parsed.sheet_name}</dd>
              </div>
            </dl>

            {parsed.holds.length === 0 ? (
              <div className="banner banner-warning tools-banner">
                <Icon name="warning" size={14} />
                <span>{t('tools.import.no_holds')}</span>
              </div>
            ) : (
              <div className="table-card">
                <table className="data-table tools-preview-table">
                  <thead>
                    <tr>
                      <th>{t('import.preview.col.hold')}</th>
                      <th>{t('import.preview.col.cargo')}</th>
                      <th className="num">{t('import.preview.col.sf')}</th>
                      <th className="num">{t('tools.import.col.protein')}</th>
                      <th className="num">{t('tools.import.col.volume')}</th>
                      <th className="num">{t('tools.import.col.loaded')}</th>
                      <th className="num">{t('tools.import.col.discharged')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.holds.map((h) => {
                      const rejected = willBeRejected(h);
                      return (
                        <tr
                          key={h.hold_no}
                          className={rejected ? 'tools-row-rejected' : undefined}
                          data-testid={`import-hold-${h.hold_no}`}
                        >
                          <td className="tools-hold-no">№{h.hold_no}</td>
                          <td>
                            {h.cargo_name ? (
                              <span className="cargo-tag">
                                <span className="cargo-swatch" style={{ background: cargoColor(h.cargo_name) }} />
                                {h.cargo_name}
                              </span>
                            ) : (
                              <span className="zero">—</span>
                            )}
                          </td>
                          <td className="num muted">{h.sf > 0 ? formatTons(h.sf) : <span className="zero">—</span>}</td>
                          <td className={rejected ? 'num tools-cell-rejected' : 'num muted'}>
                            {h.protein_percent === null ? <span className="zero">—</span> : h.protein_percent.toFixed(1)}
                          </td>
                          <td className="num muted">
                            <Tons value={h.volume_m3} />
                          </td>
                          <td className="num">
                            <Tons value={h.loaded_tons} />
                          </td>
                          <td className="num">
                            <Tons value={h.discharged_tons} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {rejectedAhead.map((h) => (
              <div className="banner banner-warning tools-banner" key={h.hold_no} data-testid="import-will-reject">
                <Icon name="warning" size={14} />
                <span>
                  {t('tools.import.will_reject', {
                    hold_no: h.hold_no,
                    value: h.protein_percent ?? '',
                    cell: h.protein_cell ?? '—',
                  })}
                </span>
              </div>
            ))}

            <div className="tools-actions tools-actions-end">
              <span className="tools-hint">{t('tools.import.apply_note')}</span>
              <span className="toolbar-spacer" />
              <button type="button" className="btn" onClick={reset} disabled={busy !== null} data-testid="import-cancel">
                {t('import.preview.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleApply()}
                disabled={busy !== null || parsed.holds.length === 0}
                data-testid="import-apply"
              >
                {busy === 'apply' ? t('import.preview.applying') : t('import.preview.apply')}
              </button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon="import"
            title={t('tools.import.empty.title')}
            text={t('tools.import.empty.text')}
            actions={pickButton}
            testId="import-empty"
          />
        )}
      </div>
    </section>
  );
}
