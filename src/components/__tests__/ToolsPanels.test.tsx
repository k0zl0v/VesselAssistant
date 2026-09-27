/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { __resetForTests, setLang } from '../../i18n';
import { ru } from '../../i18n/ru';
import { THIN_NBSP } from '../../calc/round';
import { AppError } from '../../services/errors';
import type { ParsedLoadPlan } from '../../services/ImportService';
import { MemoryBackupStore } from '../../services/BackupStore';
import { dumpAllTables } from '../../services/BackupService';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from '../../services/__tests__/helpers';
import type { NodeDb } from '../../services/db-node';

const h = vi.hoisted(() => ({
  db: null as unknown,
  store: null as unknown,
  reload: vi.fn(async (_id?: string | null) => {}),
  navigate: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
  confirm: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  readFile: vi.fn(),
  parse: vi.fn(),
  apply: vi.fn(),
}));

vi.mock('../../db', () => ({ getDb: async () => h.db }));
vi.mock('../../autoBackup', () => ({ getAutoBackup: async () => NOOP_AUTO_BACKUP }));
vi.mock('../../backupStore', () => ({
  TauriBackupStore: class {
    list = () => (h.store as MemoryBackupStore).list();
  },
}));
vi.mock('../../shell/VoyageContext', () => ({ useVoyage: () => ({ reload: h.reload, voyages: [] }) }));
vi.mock('../../shell/navigation', () => ({ useNavigation: () => ({ screen: 'tools', navigate: h.navigate }) }));
// ExcelJS inside jsdom trips over cross-realm ArrayBuffers; the parser has its own tests in services/.
vi.mock('../../services/ImportService', () => ({
  ImportService: class {
    parseLoadPlan = h.parse;
    applyImport = h.apply;
  },
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: h.open, save: h.save, confirm: h.confirm, ask: h.confirm, message: h.confirm }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: h.readTextFile,
  writeTextFile: h.writeTextFile,
  readFile: h.readFile,
}));

const { BackupPanel } = await import('../BackupPanel');
const { ImportPanel } = await import('../ImportPanel');
const { AuditLogPanel } = await import('../AuditLogPanel');

let db: NodeDb;

beforeEach(async () => {
  db = await openTestDb();
  h.db = db;
  h.store = new MemoryBackupStore();
  setLang('ru');
});

afterEach(() => {
  vi.clearAllMocks();
  __resetForTests();
  db.close();
});

describe('BackupPanel', () => {
  it('asks inline, with the numbers of the file, and restores without a native dialog or app reload', async () => {
    await seedReferenceData(db, { vesselName: 'SOURCE', holdNos: [1] });
    const json = await dumpAllTables(db, new Date('2026-09-24T12:00:00Z'));
    await (h.store as MemoryBackupStore).write('auto-2026-09-27T10-00-00-000Z-timer.json', '{}');
    h.open.mockResolvedValue('/backups/b.json');
    h.readTextFile.mockResolvedValue(json);
    const user = userEvent.setup();
    render(<BackupPanel />);

    expect(await screen.findByTestId('auto-backup-count')).toHaveTextContent('1 из 10');
    await user.click(screen.getByTestId('backup-restore'));
    const panel = await screen.findByTestId('backup-confirm');
    expect(panel).toHaveTextContent('«b.json»');
    expect(panel).toHaveTextContent('рейсов 0, партий 0, операций 0');
    expect(panel).toHaveTextContent(ru['tools.backup.confirm.safety']);

    await user.click(screen.getByTestId('backup-confirm-confirm'));
    expect(await screen.findByTestId('backup-restored')).toBeInTheDocument();
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.confirm).not.toHaveBeenCalled();
    const vessels = await db.select<{ name: string }>(`SELECT name FROM vessels`);
    expect(vessels.map((v) => v.name)).toEqual(['SOURCE']);
  });

  it('cancelling the confirmation changes nothing', async () => {
    h.open.mockResolvedValue('/b.json');
    h.readTextFile.mockResolvedValue(await dumpAllTables(db));
    const user = userEvent.setup();
    render(<BackupPanel />);
    await user.click(screen.getByTestId('backup-restore'));
    await user.click(await screen.findByTestId('backup-confirm-cancel'));
    expect(screen.queryByTestId('backup-confirm')).toBeNull();
    expect(h.reload).not.toHaveBeenCalled();
  });

  it('a non-backup file is refused before any confirmation, in words, not String(e)', async () => {
    h.open.mockResolvedValue('/x.json');
    h.readTextFile.mockResolvedValue('{"hello": 1}');
    const user = userEvent.setup();
    render(<BackupPanel />);
    await user.click(screen.getByTestId('backup-restore'));
    const err = await screen.findByTestId('backup-error');
    expect(err).toHaveTextContent(ru['tools.backup.error.not_backup']);
    expect(screen.queryByTestId('backup-confirm')).toBeNull();
  });

  it('export writes the envelope to the picked path', async () => {
    h.save.mockResolvedValue('/out/b.json');
    const user = userEvent.setup();
    render(<BackupPanel />);
    await user.click(screen.getByTestId('backup-export'));
    expect(await screen.findByTestId('backup-saved')).toHaveTextContent('/out/b.json');
    expect(h.writeTextFile).toHaveBeenCalledWith('/out/b.json', expect.stringContaining('"schema_version"'));
  });
});

describe('ImportPanel', () => {
  const parsed: ParsedLoadPlan = {
    sheet_name: 'PLAN',
    vessel_name: 'TEST VESSEL',
    voyage_no: 'IMP-1',
    loading_port: 'NOVO',
    discharging_port: null,
    holds: [
      { hold_no: 1, volume_m3: 10340.5, sf: 1.44, cargo_name: 'SFM', loaded_tons: 4082, discharged_tons: 0, protein_percent: null, protein_cell: 'N4' },
      { hold_no: 2, volume_m3: 11187.3, sf: 1.226, cargo_name: 'WHEAT', loaded_tons: 7073, discharged_tons: 0, protein_percent: 12.0, protein_cell: 'N5' },
    ],
  };

  it('previews the holds, warns about the row FR-19 rejects, applies and points the shell at the new voyage', async () => {
    h.open.mockResolvedValue('/in/plan.xlsx');
    h.readFile.mockResolvedValue(new Uint8Array([1]));
    h.parse.mockResolvedValue(parsed);
    h.apply.mockResolvedValue({
      voyage_id: 'v-1',
      rejected: [{ sheet: 'PLAN', cell: 'N5', hold_no: 2, error: new AppError('protein.invalid', { value: 12 }) }],
    });
    const user = userEvent.setup();
    render(<ImportPanel />);

    await user.click(screen.getByTestId('import-pick'));
    expect(await screen.findByTestId('import-preview')).toBeInTheDocument();
    expect(screen.getByTestId('import-hold-1').textContent).toContain(`4${THIN_NBSP}082.000`);
    expect(screen.getByTestId('import-hold-2')).toHaveClass('tools-row-rejected');
    expect(screen.getByTestId('import-will-reject')).toHaveTextContent('N5');
    expect(screen.getByText('plan.xlsx')).toBeInTheDocument();

    await user.click(screen.getByTestId('import-apply'));
    await waitFor(() => expect(h.reload).toHaveBeenCalledWith('v-1'));
    expect(await screen.findByTestId('import-applied')).toHaveTextContent('IMP-1');
    expect(screen.getByTestId('import-rejected')).toHaveTextContent('12');
    await user.click(screen.getByTestId('import-open-voyage'));
    expect(h.navigate).toHaveBeenCalledWith('load-plan');
  });

  it('an unreadable file shows an error card with collapsed details', async () => {
    h.open.mockResolvedValue('/in/broken.xlsx');
    h.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    h.parse.mockRejectedValue(new Error('Corrupted zip'));
    const user = userEvent.setup();
    render(<ImportPanel />);
    await user.click(screen.getByTestId('import-pick'));
    const err = await screen.findByTestId('import-error');
    expect(err).toHaveTextContent(ru['tools.import.error.read']);
    expect(err).toHaveTextContent(ru['error.unexpected']);
    expect(err.querySelector('details pre')).toHaveTextContent('Corrupted zip');
  });
});

describe('AuditLogPanel', () => {
  it('renders rows with action chips and filters by entity', async () => {
    await seedReferenceData(db, { vesselName: 'AUDITED', holdNos: [1] });
    await db.execute(
      `INSERT INTO voyages (id, vessel_id, voyage_no, status, created_at, updated_at)
       SELECT '11111111-2222-3333-4444-555555555555', id, 'AU-1', 'open', '2026-09-27', '2026-09-27' FROM vessels`,
    );
    await db.execute(`UPDATE voyages SET voyage_no = 'AU-2'`);
    const user = userEvent.setup();
    render(<AuditLogPanel />);

    const rows = await screen.findAllByTestId('audit-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(ru['audit.action.update']);
    expect(rows[0]).toHaveTextContent('AU-1→AU-2');
    expect(rows[0]).toHaveTextContent('11111111');
    expect(rows[0]).toHaveTextContent('test-operator');

    await user.selectOptions(screen.getByTestId('audit-entity-filter'), 'voyages');
    expect(await screen.findAllByTestId('audit-row')).toHaveLength(2);
  });

  it('shows the empty state on a fresh database', async () => {
    render(<AuditLogPanel />);
    expect(await screen.findByTestId('audit-empty')).toHaveTextContent(ru['audit.empty.title']);
  });
});
