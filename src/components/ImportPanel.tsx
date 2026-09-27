import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { getAutoBackup } from '../autoBackup';
import { getDb } from '../db';
import { useT } from '../i18n';
import type { ParsedLoadPlan } from '../services/ImportService';

const fmt = (n: number): string => n.toFixed(3);

export function ImportPanel() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedLoadPlan | null>(null);
  const [appliedVoyageId, setAppliedVoyageId] = useState<string | null>(null);

  function reset(): void {
    setParsed(null);
    setError(null);
    setAppliedVoyageId(null);
  }

  async function handlePick(): Promise<void> {
    setBusy(true);
    setError(null);
    setAppliedVoyageId(null);
    try {
      const picked = await open({
        title: t('import.pick_dialog_title'),
        multiple: false,
        directory: false,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (!picked || typeof picked !== 'string') {
        return;
      }
      const bytes = await readFile(picked);
      // Lazy-load ImportService (drags ExcelJS in) so it's not on the cold path.
      const [{ ImportService }, db] = await Promise.all([
        import('../services/ImportService'),
        getDb(),
      ]);
      const importer = new ImportService(db, await getAutoBackup());
      const result = await importer.parseLoadPlan(bytes);
      setParsed(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleApply(): Promise<void> {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      const [{ ImportService }, db] = await Promise.all([
        import('../services/ImportService'),
        getDb(),
      ]);
      const importer = new ImportService(db, await getAutoBackup());
      const { voyage_id } = await importer.applyImport(parsed);
      setAppliedVoyageId(voyage_id);
      setParsed(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="import-panel">
      <h3>{t('import.title')}</h3>
      <p>{t('import.intro')}</p>

      <div className="actions">
        <button
          type="button"
          onClick={() => void handlePick()}
          disabled={busy}
        >
          {busy && !parsed ? t('import.reading') : t('import.pick')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {appliedVoyageId && (
        <p className="success">
          {t('import.applied', { id: appliedVoyageId })}
        </p>
      )}

      {parsed && (
        <div className="import-preview">
          <h4>{t('import.preview.title')}</h4>
          <dl>
            <dt>{t('import.preview.vessel')}</dt>
            <dd>{parsed.vessel_name}</dd>
            <dt>{t('import.preview.voyage_no')}</dt>
            <dd>{parsed.voyage_no ?? t('import.preview.voyage_no_auto')}</dd>
            <dt>{t('import.preview.loading_port')}</dt>
            <dd>{parsed.loading_port ?? '—'}</dd>
            <dt>{t('import.preview.discharging_port')}</dt>
            <dd>{parsed.discharging_port ?? '—'}</dd>
          </dl>

          <table>
            <thead>
              <tr>
                <th>{t('import.preview.col.hold')}</th>
                <th>{t('import.preview.col.volume_m3')}</th>
                <th>{t('import.preview.col.sf')}</th>
                <th>{t('import.preview.col.cargo')}</th>
                <th>{t('import.preview.col.loaded')}</th>
                <th>{t('import.preview.col.discharged')}</th>
              </tr>
            </thead>
            <tbody>
              {parsed.holds.map((h) => (
                <tr key={h.hold_no}>
                  <td>{h.hold_no}</td>
                  <td>{fmt(h.volume_m3)}</td>
                  <td>{fmt(h.sf)}</td>
                  <td>{h.cargo_name || '—'}</td>
                  <td>{fmt(h.loaded_tons)}</td>
                  <td>{fmt(h.discharged_tons)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="actions">
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={busy}
            >
              {busy ? t('import.preview.applying') : t('import.preview.apply')}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="secondary"
            >
              {t('import.preview.cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
