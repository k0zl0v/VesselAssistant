import { useCallback, useEffect, useRef, useState } from 'react';
import { getDb } from '../db';
import { useT, type StringKey } from '../i18n';
import { describeError } from '../i18n/errors';
import { AuditLogService, type AuditEntry } from '../services/AuditLogService';
import { AuditDiff } from './tools/AuditDiff';
import { formatAuditTime, shortId } from './tools/auditFormat';
import { EmptyState, ErrorState, Skeleton } from './ui/states';
import '../styles/tools.css';

export const AUDIT_LIMIT = 200;

const ENTITY_LABELS: Record<string, StringKey> = {
  voyages: 'audit.entity.voyages',
  cargo_lots: 'audit.entity.cargo_lots',
  cargo_layers: 'audit.entity.cargo_layers',
  operations: 'audit.entity.operations',
  discharge_allocations: 'audit.entity.discharge_allocations',
  hold_cargo_parameters: 'audit.entity.hold_cargo_parameters',
  crane_coefficients: 'audit.entity.crane_coefficients',
  sof_events: 'audit.entity.sof_events',
  crane_measurements: 'audit.entity.crane_measurements',
  crane_working_coefficients: 'audit.entity.crane_working_coefficients',
  crane_shift_records: 'audit.entity.crane_shift_records',
  ogv_vessels: 'audit.entity.ogv_vessels',
  ogv_holds: 'audit.entity.ogv_holds',
  ogv_receipts: 'audit.entity.ogv_receipts',
  ogv_sequence_steps: 'audit.entity.ogv_sequence_steps',
  documents: 'audit.entity.documents',
  sof_time_sheets: 'audit.entity.sof_time_sheets',
};

const ACTION_CHIP: Record<AuditEntry['action'], string> = {
  insert: 'chip chip-positive',
  update: 'chip chip-accent',
  delete: 'chip chip-danger',
};

const ROLE_LABELS: Record<string, StringKey> = {
  operator: 'session.role.operator',
  supervisor: 'session.role.supervisor',
  admin: 'session.role.admin',
  viewer: 'session.role.viewer',
};

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; details: string }
  | { kind: 'ready'; entries: AuditEntry[] };

export function AuditLogPanel() {
  const t = useT();
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const seq = useRef(0);

  const entityLabel = (type: string): string => {
    const key = ENTITY_LABELS[type];
    return key ? t(key) : type;
  };
  const roleLabel = (role: string): string => {
    const key = ROLE_LABELS[role];
    return key ? t(key) : role;
  };

  const fetchEntries = useCallback(async (entity: string) => {
    const mine = ++seq.current;
    setLoad({ kind: 'loading' });
    try {
      const svc = new AuditLogService(await getDb());
      const [rows, types] = await Promise.all([
        svc.list({ limit: AUDIT_LIMIT, entity_type: entity || undefined }),
        svc.listEntityTypes(),
      ]);
      if (mine !== seq.current) return;
      setEntityTypes(types);
      setLoad({ kind: 'ready', entries: rows });
    } catch (e) {
      if (mine !== seq.current) return;
      setLoad({ kind: 'error', message: describeError(e), details: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void fetchEntries(filter);
  }, [fetchEntries, filter]);

  return (
    <div className="audit-panel" data-testid="audit-panel">
      <div className="toolbar">
        <div className="audit-filter">
          <label className="field-label" htmlFor="audit-entity">
            {t('audit.filter.label')}
          </label>
          <select
            id="audit-entity"
            className="input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            data-testid="audit-entity-filter"
          >
            <option value="">{t('audit.entity_all')}</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {entityLabel(type)}
              </option>
            ))}
          </select>
        </div>
        <span className="toolbar-spacer" />
        {load.kind === 'ready' && (
          <span className="page-stamp" data-testid="audit-count">
            {t('audit.count', { count: load.entries.length })}
          </span>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => void fetchEntries(filter)}
          disabled={load.kind === 'loading'}
          data-testid="audit-refresh"
        >
          {t('audit.refresh')}
        </button>
      </div>

      {load.kind === 'loading' && <Skeleton rows={8} />}

      {load.kind === 'error' && (
        <ErrorState
          title={t('audit.error.title')}
          message={load.message}
          hint={t('audit.error.hint')}
          details={load.details}
          testId="audit-error"
          actions={
            <button type="button" className="btn btn-sm" onClick={() => void fetchEntries(filter)}>
              {t('audit.retry')}
            </button>
          }
        />
      )}

      {load.kind === 'ready' && load.entries.length === 0 && (
        <EmptyState
          icon="list"
          title={t('audit.empty.title')}
          text={filter ? t('audit.empty.filtered', { entity: entityLabel(filter) }) : t('audit.empty.text')}
          testId="audit-empty"
          actions={
            filter ? (
              <button type="button" className="btn btn-sm" onClick={() => setFilter('')}>
                {t('audit.entity_all')}
              </button>
            ) : undefined
          }
        />
      )}

      {load.kind === 'ready' && load.entries.length > 0 && (
        <div className="table-card">
          <table className="data-table audit-table" data-testid="audit-table">
            <thead>
              <tr>
                <th className="col-time">{t('audit.col.time')}</th>
                <th>{t('audit.col.entity')}</th>
                <th className="col-id">{t('audit.col.id')}</th>
                <th>{t('audit.col.action')}</th>
                <th>{t('audit.col.user')}</th>
                <th>{t('audit.col.role')}</th>
                <th>{t('audit.col.reason')}</th>
                <th className="col-diff">{t('audit.col.diff')}</th>
              </tr>
            </thead>
            <tbody>
              {load.entries.map((e) => (
                <tr key={e.id} data-testid="audit-row">
                  <td className="mono audit-time" title={e.created_at}>
                    {formatAuditTime(e.created_at)}
                  </td>
                  <td>{entityLabel(e.entity_type)}</td>
                  <td className="mono audit-id" title={e.entity_id}>
                    {shortId(e.entity_id)}
                  </td>
                  <td>
                    <span className={ACTION_CHIP[e.action] ?? 'chip'}>
                      {t(`audit.action.${e.action}`)}
                    </span>
                  </td>
                  <td>{e.user_id ?? <span className="zero">—</span>}</td>
                  <td className="muted">
                    {e.user_role ? roleLabel(e.user_role) : <span className="zero">—</span>}
                  </td>
                  <td className="audit-reason">{e.reason ?? <span className="zero">—</span>}</td>
                  <td>
                    <AuditDiff entry={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
