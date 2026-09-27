import { useEffect, useMemo, useState } from 'react';
import { getDb } from '../db';
import { formatTons } from '../calc/round';
import { useT } from '../i18n';
import {
  AuditLogService,
  type AuditEntry,
} from '../services/AuditLogService';

/** Compact rendering of a single value from a JSON snapshot. */
function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'number') return formatTons(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

const MAX_DIFF_CHARS = 160;

function truncate(s: string): string {
  return s.length <= MAX_DIFF_CHARS ? s : s.slice(0, MAX_DIFF_CHARS - 1) + '…';
}

function safeParse(json: string | null): Record<string, unknown> | null {
  if (json === null) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function summarizeInsert(json: string | null): string {
  const obj = safeParse(json);
  if (!obj) return '—';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'id') continue;
    if (v === null || v === undefined) continue;
    parts.push(`${k}: ${fmtValue(v)}`);
  }
  return truncate(parts.join(', ')) || '(empty)';
}

function summarizeUpdate(oldJson: string | null, newJson: string | null): string {
  const oldObj = safeParse(oldJson) ?? {};
  const newObj = safeParse(newJson) ?? {};
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const diffs: string[] = [];
  for (const k of keys) {
    if (k === 'id') continue;
    const before = oldObj[k] ?? null;
    const after = newObj[k] ?? null;
    if (before === after) continue;
    // For numbers, also treat near-equal as equal after formatting.
    if (
      typeof before === 'number' &&
      typeof after === 'number' &&
      formatTons(before) === formatTons(after)
    ) {
      continue;
    }
    diffs.push(`${k}: ${fmtValue(before)} → ${fmtValue(after)}`);
  }
  return truncate(diffs.join(', ')) || '(no changes)';
}

function summarize(entry: AuditEntry): string {
  if (entry.action === 'insert') return summarizeInsert(entry.new_value);
  if (entry.action === 'delete') return '(deleted)';
  return summarizeUpdate(entry.old_value, entry.new_value);
}

export function AuditLogPanel() {
  const t = useT();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        const db = await getDb();
        const svc = new AuditLogService(db);
        const [rows, types] = await Promise.all([
          svc.list({ limit: 200 }),
          svc.listEntityTypes(),
        ]);
        if (cancelled) return;
        setEntries(rows);
        setEntityTypes(types);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (!filter) return entries;
    return entries.filter((e) => e.entity_type === filter);
  }, [entries, filter]);

  return (
    <section className="audit-log-panel">
      <h3>{t('audit.title')}</h3>
      <p className="hint">{t('audit.intro')}</p>
      <div className="actions">
        <label>
          {t('audit.entity_label')}{' '}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={loading}
          >
            <option value="">{t('audit.entity_all')}</option>
            {entityTypes.map((typeName) => (
              <option key={typeName} value={typeName}>
                {typeName}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="hint">{t('audit.loading')}</p>
      ) : visible.length === 0 ? (
        <p className="hint">{t('audit.empty')}</p>
      ) : (
        <table className="audit-log-table">
          <thead>
            <tr>
              <th>{t('audit.col.time')}</th>
              <th>{t('audit.col.entity')}</th>
              <th>{t('audit.col.id')}</th>
              <th>{t('audit.col.action')}</th>
              <th>{t('audit.col.user')}</th>
              <th>{t('audit.col.role')}</th>
              <th>{t('audit.col.reason')}</th>
              <th>{t('audit.col.diff')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id}>
                <td>{e.created_at}</td>
                <td>{e.entity_type}</td>
                <td className="mono">{e.entity_id}</td>
                <td>{e.action}</td>
                <td>{e.user_id ?? '—'}</td>
                <td>{e.user_role ?? '—'}</td>
                <td>{e.reason ?? '—'}</td>
                <td className="diff">{summarize(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
