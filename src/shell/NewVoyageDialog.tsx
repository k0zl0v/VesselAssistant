import { useState } from 'react';
import { getAutoBackup } from '../autoBackup';
import { Dialog } from '../components/ui/Dialog';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import { seedKavkazDemo } from '../seedDemo';
import { VoyageService } from '../services/VoyageService';
import { useNavigation } from './navigation';
import { useVoyage } from './VoyageContext';

export function NewVoyageDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { vessels, ports, reload } = useVoyage();
  const { navigate } = useNavigation();
  const [vesselId, setVesselId] = useState(vessels[0]?.id ?? '');
  const [voyageNo, setVoyageNo] = useState('');
  const [loadingPort, setLoadingPort] = useState('');
  const [dischargingPort, setDischargingPort] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<string>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const id = await fn();
      await reload(id);
      navigate('load-plan');
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const seedButton = (
    <button
      type="button"
      className="btn"
      disabled={busy}
      onClick={() => void run(async () => (await seedKavkazDemo(await getDb())).voyage_id)}
      data-testid="voyage-seed-demo"
    >
      {t('voyage.seed_demo')}
    </button>
  );

  return (
    <Dialog title={t('voyage.form.title')} onClose={onClose} testId="voyage-new-dialog">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const no = voyageNo.trim();
          if (!no || !vesselId) return;
          void run(async () => {
            const service = new VoyageService(await getDb(), await getAutoBackup());
            const v = await service.create({
              vessel_id: vesselId,
              voyage_no: no,
              loading_port_id: loadingPort || null,
              discharging_port_id: dischargingPort || null,
            });
            return v.id;
          });
        }}
      >
        <div className="dialog-body">
          {vessels.length === 0 ? (
            <p className="state-text">{t('shell.new_voyage.no_vessels')}</p>
          ) : (
            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="nv-vessel">
                  {t('voyage.form.vessel')}
                </label>
                <select
                  id="nv-vessel"
                  className="input"
                  value={vesselId}
                  onChange={(e) => setVesselId(e.target.value)}
                  required
                >
                  {vessels.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="nv-no">
                  {t('voyage.form.voyage_no')}
                </label>
                <input
                  id="nv-no"
                  className="input mono"
                  value={voyageNo}
                  onChange={(e) => setVoyageNo(e.target.value)}
                  placeholder={t('voyage.form.voyage_no_placeholder')}
                  required
                  autoFocus
                  data-testid="voyage-new-no"
                />
              </div>
              {ports.length > 0 && (
                <>
                  <div className="field">
                    <label className="field-label" htmlFor="nv-lp">
                      {t('shell.new_voyage.loading_port')}
                    </label>
                    <select id="nv-lp" className="input" value={loadingPort} onChange={(e) => setLoadingPort(e.target.value)}>
                      <option value="">—</option>
                      {ports.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="nv-dp">
                      {t('shell.new_voyage.discharging_port')}
                    </label>
                    <select id="nv-dp" className="input" value={dischargingPort} onChange={(e) => setDischargingPort(e.target.value)}>
                      <option value="">—</option>
                      {ports.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}
          {error && (
            <p className="field-error" role="alert" data-testid="voyage-new-error">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <span className="dialog-footer-note">{seedButton}</span>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t('voyage.form.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || vessels.length === 0 || !voyageNo.trim()}
            data-testid="voyage-new-submit"
          >
            {t('voyage.form.create')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
