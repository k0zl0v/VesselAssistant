import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { getDb } from '../db';
import type { ParsedLoadPlan } from '../services/ImportService';

const fmt = (n: number): string => n.toFixed(3);

export function ImportPanel() {
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
        title: 'Select Load Stowage Plan + SOF (.xlsx)',
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
      const importer = new ImportService(db);
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
      const importer = new ImportService(db);
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
      <h3>Import</h3>
      <p>
        Read a Load Stowage Plan + SOF workbook and stage the per-hold
        values for review before applying.
      </p>

      <div className="actions">
        <button
          type="button"
          onClick={() => void handlePick()}
          disabled={busy}
        >
          {busy && !parsed ? 'Reading…' : 'Import KAVKAZ IV-style xlsx'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {appliedVoyageId && (
        <p className="success">
          Imported. Voyage id: <code>{appliedVoyageId}</code>. Switch to the
          Voyages tab to review it.
        </p>
      )}

      {parsed && (
        <div className="import-preview">
          <h4>Preview</h4>
          <dl>
            <dt>Vessel</dt>
            <dd>{parsed.vessel_name}</dd>
            <dt>Voyage No</dt>
            <dd>{parsed.voyage_no ?? '(auto)'}</dd>
            <dt>Loading port</dt>
            <dd>{parsed.loading_port ?? '—'}</dd>
            <dt>Discharging port</dt>
            <dd>{parsed.discharging_port ?? '—'}</dd>
          </dl>

          <table>
            <thead>
              <tr>
                <th>Hold</th>
                <th>Volume m³</th>
                <th>SF</th>
                <th>Cargo</th>
                <th>Loaded</th>
                <th>Discharged</th>
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
              {busy ? 'Applying…' : 'Apply'}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
