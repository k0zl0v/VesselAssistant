import { formatTons } from '../../calc/round';
import type { AuditEntry } from '../../services/AuditLogService';

/** One field of an audit row: `before` is null on insert, `after` is null on delete. */
export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

/** Technical columns that say nothing about the business change. */
const SKIP_FIELDS = new Set(['id', 'created_at', 'updated_at']);

function isTonsField(key: string): boolean {
  return key === 'tons' || key.endsWith('_tons') || key.endsWith('_m3');
}

export function formatAuditValue(key: string, v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    // Counters (hold_no, load_sequence, revision) stay integers; everything else is a measure.
    return Number.isInteger(v) && !isTonsField(key) ? String(v) : formatTons(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  // References (hold_id, source_hold, …) are UUIDs; 8 characters identify the row.
  if (typeof v === 'string' && UUID.test(v)) return shortId(v);
  return String(v);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRef = (field: string) => field.endsWith('_id') || field.endsWith('_hold');

function parseSnapshot(json: string | null): Record<string, unknown> {
  if (json === null) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Field-level view of an audit row. Insert lists the non-empty new values, delete the old ones,
 * update only the fields whose displayed value changed (float noise below 0.001 is not a change).
 */
export function auditChanges(entry: Pick<AuditEntry, 'action' | 'old_value' | 'new_value'>): FieldChange[] {
  const before = parseSnapshot(entry.old_value);
  const after = parseSnapshot(entry.new_value);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !SKIP_FIELDS.has(k));
  const out: FieldChange[] = [];
  for (const field of keys) {
    const b = entry.action === 'insert' ? null : formatAuditValue(field, before[field]);
    const a = entry.action === 'delete' ? null : formatAuditValue(field, after[field]);
    if (entry.action === 'update' ? a === b : a === null && b === null) continue;
    out.push({ field, before: b, after: a });
  }
  // Business values first, references after them: the reader looks for tons and statuses.
  return [...out.filter((c) => !isRef(c.field)), ...out.filter((c) => isRef(c.field))];
}

/** First 8 characters of a UUID; short ids pass through. */
export function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) : id;
}

/** SQLite `datetime('now')` is UTC `YYYY-MM-DD HH:MM:SS`; shown in local time as `DD.MM.YYYY HH:MM:SS`. */
export function formatAuditTime(createdAt: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(createdAt);
  if (!m) return createdAt;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(createdAt);
  const d = new Date(hasZone ? createdAt : `${m[1]}T${m[2]}Z`);
  if (Number.isNaN(d.getTime())) return createdAt;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
