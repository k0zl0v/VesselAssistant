import { useCallback, useEffect, useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { getAutoBackup } from '../autoBackup';
import { TauriBackupStore } from '../backupStore';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';
import { BackupService } from '../services/BackupService';
import { AUTO_BACKUP_INTERVAL_MS, AUTO_BACKUP_KEEP } from '../services/AutoBackupService';
import { useVoyage } from '../shell/VoyageContext';
import { fileName, summarizeBackupFile, type BackupFileSummary } from './tools/backupFile';
import { formatLocalDateTime, summarizeAutoBackups, type AutoBackupSummary } from './tools/autoBackupInfo';
import { ConfirmPanel } from './ui/ConfirmPanel';
import { Icon } from './ui/Icon';
import { ErrorState } from './ui/states';
import '../styles/tools.css';

const todayIso = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

type Busy = 'export' | 'pick' | 'restore' | null;

interface Picked {
  path: string;
  json: string;
  summary: BackupFileSummary;
}

interface Failure {
  title: string;
  message: string;
  hint?: string;
  details?: string;
}

type Outcome = { kind: 'saved'; path: string } | { kind: 'restored'; file: string };

const technical = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function BackupPanel() {
  const t = useT();
  const { reload } = useVoyage();
  const [busy, setBusy] = useState<Busy>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [auto, setAuto] = useState<AutoBackupSummary | null>(null);
  const [autoFailed, setAutoFailed] = useState(false);

  const loadAuto = useCallback(async () => {
    try {
      setAuto(await summarizeAutoBackups(new TauriBackupStore()));
      setAutoFailed(false);
    } catch {
      setAutoFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadAuto();
  }, [loadAuto]);

  function start(next: Busy): void {
    setBusy(next);
    setFailure(null);
    setOutcome(null);
  }

  async function handleExport(): Promise<void> {
    start('export');
    setPicked(null);
    try {
      const path = await save({
        title: t('backup.dialog.save_title'),
        defaultPath: `vessel-assistant-backup-${todayIso()}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      const json = await new BackupService(await getDb(), await getAutoBackup()).exportToJson();
      await writeTextFile(path, json);
      setOutcome({ kind: 'saved', path });
    } catch (e) {
      setFailure({
        title: t('tools.backup.error.export'),
        message: describeError(e),
        hint: t('tools.backup.error.export_hint'),
        details: technical(e),
      });
    } finally {
      setBusy(null);
    }
  }

  async function handlePick(): Promise<void> {
    start('pick');
    setPicked(null);
    try {
      const path = await open({
        title: t('backup.dialog.open_title'),
        multiple: false,
        directory: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path || typeof path !== 'string') return;
      let json: string;
      try {
        json = await readTextFile(path);
      } catch (e) {
        setFailure({ title: t('tools.backup.error.restore'), message: t('tools.backup.error.read'), details: technical(e) });
        return;
      }
      const summary = summarizeBackupFile(json);
      if (!summary) {
        setFailure({
          title: t('tools.backup.error.restore'),
          message: t('tools.backup.error.not_backup'),
          hint: t('tools.backup.error.restore_hint'),
        });
        return;
      }
      setPicked({ path, json, summary });
    } catch (e) {
      setFailure({ title: t('tools.backup.error.restore'), message: describeError(e), details: technical(e) });
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore(): Promise<void> {
    if (!picked) return;
    start('restore');
    try {
      await new BackupService(await getDb(), await getAutoBackup()).importFromJson(picked.json, { wipeFirst: true });
      setPicked(null);
      setOutcome({ kind: 'restored', file: fileName(picked.path) });
      // The shell re-reads voyages and reference data; no app reload is needed.
      await reload();
    } catch (e) {
      setFailure({
        title: t('tools.backup.error.restore'),
        message: describeError(e),
        hint: t('tools.backup.error.restore_hint'),
        details: technical(e),
      });
    } finally {
      setBusy(null);
      void loadAuto();
    }
  }

  const summaryText = picked
    ? picked.summary.exportedAt
      ? t('tools.backup.confirm.summary', {
          date: formatLocalDateTime(picked.summary.exportedAt),
          voyages: picked.summary.voyages,
          lots: picked.summary.lots,
          operations: picked.summary.operations,
        })
      : t('tools.backup.confirm.summary_undated', {
          voyages: picked.summary.voyages,
          lots: picked.summary.lots,
          operations: picked.summary.operations,
        })
    : '';

  return (
    <section className="card tools-card" data-testid="backup-panel" aria-labelledby="backup-title">
      <header className="card-header">
        <h2 className="card-title" id="backup-title">
          {t('tools.backup.title')}
        </h2>
        <span className="card-subtitle">{t('tools.backup.subtitle')}</span>
      </header>
      <div className="card-body tools-card-body">
        <p className="tools-text">{t('tools.backup.text')}</p>

        <div className="tools-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleExport()}
            disabled={busy !== null}
            data-testid="backup-export"
          >
            <Icon name="export" size={14} />
            {busy === 'export' ? t('tools.backup.exporting') : t('tools.backup.export')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void handlePick()}
            disabled={busy !== null || picked !== null}
            data-testid="backup-restore"
          >
            <Icon name="import" size={14} />
            {busy === 'pick' ? t('tools.backup.reading') : t('tools.backup.restore')}
          </button>
        </div>

        {picked && (
          <ConfirmPanel
            tone="danger"
            confirmLabel={busy === 'restore' ? t('tools.backup.restoring') : t('tools.backup.confirm.submit')}
            cancelLabel={t('tools.backup.confirm.cancel')}
            onConfirm={() => void handleRestore()}
            onCancel={() => setPicked(null)}
            busy={busy === 'restore'}
            testId="backup-confirm"
          >
            <strong className="tools-confirm-title" title={picked.path}>
              {t('tools.backup.confirm.title', { file: fileName(picked.path) })}
            </strong>
            <span className="tools-confirm-line">{summaryText}</span>
            <span className="tools-confirm-line">
              {t('tools.backup.confirm.consequence')} {t('tools.backup.confirm.safety')}
            </span>
          </ConfirmPanel>
        )}

        {outcome?.kind === 'saved' && (
          <div className="banner banner-positive tools-banner" role="status" data-testid="backup-saved">
            <Icon name="check" size={14} />
            <span>{t('tools.backup.saved')}</span>
            <span className="mono tools-path">{outcome.path}</span>
          </div>
        )}
        {outcome?.kind === 'restored' && (
          <div className="banner banner-positive tools-banner" role="status" data-testid="backup-restored">
            <Icon name="check" size={14} />
            <span>{t('tools.backup.restored', { file: outcome.file })}</span>
          </div>
        )}
        {failure && (
          <ErrorState
            title={failure.title}
            message={failure.message}
            hint={failure.hint}
            details={failure.details}
            testId="backup-error"
          />
        )}

        <div className="tools-auto" data-testid="auto-backup-info">
          <h3 className="tools-subtitle">{t('tools.auto.title')}</h3>
          <p className="tools-hint">
            {t('tools.auto.rule', { minutes: AUTO_BACKUP_INTERVAL_MS / 60_000, keep: AUTO_BACKUP_KEEP })}
          </p>
          {autoFailed ? (
            <p className="tools-hint">{t('tools.auto.unavailable')}</p>
          ) : (
            <dl className="tools-kv">
              <div>
                <dt>{t('tools.auto.count')}</dt>
                <dd className="mono" data-testid="auto-backup-count">
                  {auto ? t('tools.auto.count_value', { count: auto.count, keep: AUTO_BACKUP_KEEP }) : '—'}
                </dd>
              </div>
              <div>
                <dt>{t('tools.auto.last')}</dt>
                <dd>
                  {auto?.latest ? (
                    <>
                      <span className="mono">{formatLocalDateTime(auto.latest.at)}</span>
                      {auto.latest.trigger && (
                        <span className="tools-muted"> · {t(`tools.auto.trigger.${auto.latest.trigger}`)}</span>
                      )}
                    </>
                  ) : (
                    <span className="tools-muted">{t('tools.auto.none')}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t('tools.auto.folder')}</dt>
                <dd className="tools-muted">{t('tools.auto.folder_value')}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}
