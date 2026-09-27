import { useT } from '../../i18n';
import type { AuditEntry } from '../../services/AuditLogService';
import { auditChanges } from './auditFormat';

const MAX_FIELDS = 5;

/** Before → after per field; inserts show only the new value, deletes only the struck-out old one. */
export function AuditDiff({ entry }: { entry: AuditEntry }) {
  const t = useT();
  const changes = auditChanges(entry);
  if (changes.length === 0) return <span className="zero">{t('audit.diff.unchanged')}</span>;
  const shown = changes.slice(0, MAX_FIELDS);
  const hidden = changes.slice(MAX_FIELDS);
  return (
    <ul className="audit-diff" title={hidden.length > 0 ? changes.map((c) => `${c.field}: ${c.before ?? '∅'} → ${c.after ?? '∅'}`).join('\n') : undefined}>
      {shown.map((c) => (
        <li key={c.field}>
          <span className="audit-diff-field">{c.field}</span>
          {entry.action === 'update' ? (
            <>
              <span className="audit-diff-before">{c.before ?? '∅'}</span>
              <span className="audit-diff-arrow" aria-hidden="true">
                →
              </span>
              <span className="audit-diff-after">{c.after ?? '∅'}</span>
            </>
          ) : entry.action === 'delete' ? (
            <span className="audit-diff-before audit-diff-removed">{c.before}</span>
          ) : (
            <span className="audit-diff-after">{c.after}</span>
          )}
        </li>
      ))}
      {hidden.length > 0 && <li className="audit-diff-more">{t('audit.diff.more', { count: hidden.length })}</li>}
    </ul>
  );
}
