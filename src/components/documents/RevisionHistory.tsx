import { useT, type StringKey } from '../../i18n';
import type { DocumentRevision } from '../../services/DocumentRevisionService';
import { EmptyState, ErrorState, Skeleton } from '../ui/states';

interface Props {
  /** Null while loading. */
  revisions: DocumentRevision[] | null;
  error: string | null;
  /** The revision recorded by this screen a moment ago — highlighted as the save confirmation. */
  freshId?: string | null;
  revealError: string | null;
  onReveal: (path: string) => void;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `2026-09-27 09:04:11` (SQLite UTC) → `27.09.2026 12:04` in local time. */
export function formatRevisionTime(generated_at: string): string {
  const d = new Date(`${generated_at.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return generated_at;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Directory part of a saved path, without the trailing separator. */
function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i > 0 ? path.slice(0, i) : '';
}

const KIND_LABEL: Record<string, StringKey> = {
  load_plan: 'documents.revisions.kind.load_plan',
  audit_log: 'documents.revisions.kind.audit_log',
};

/** «История ревизий»: every saved export of the voyage, newest first; the newest of each kind is «текущая». */
export function RevisionHistory({ revisions, error, freshId, revealError, onReveal }: Props) {
  const t = useT();

  const size = (bytes: number | null): string | null => {
    if (bytes === null) return null;
    if (bytes < 1024) return t('documents.revisions.size_b', { n: bytes });
    return t('documents.revisions.size_kb', { n: Math.round(bytes / 1024) });
  };

  const seenKinds = new Set<string>();
  const rows = (revisions ?? []).map((r) => {
    const current = !seenKinds.has(r.document_type);
    seenKinds.add(r.document_type);
    return { r, current };
  });
  const latestPath = rows.find((x) => x.r.local_file_path)?.r.local_file_path ?? null;

  return (
    <section className="card doc-revisions" data-testid="documents-revisions">
      <h2 className="card-title">{t('documents.revisions.title')}</h2>
      <p className="doc-book-subtitle">{t('documents.revisions.subtitle')}</p>

      {error ? (
        <ErrorState title={t('shell.action_failed')} message={error} testId="documents-revisions-error" />
      ) : revisions === null ? (
        <Skeleton rows={4} />
      ) : revisions.length === 0 ? (
        <EmptyState icon="document" title={t('documents.revisions.empty.title')} text={t('documents.revisions.empty.text')} />
      ) : (
        <ol className="doc-rev-list" aria-live="polite">
          {rows.map(({ r, current }, i) => {
            const meta = [
              t('documents.revisions.format'),
              size(r.byte_size),
              r.created_by ? t('documents.revisions.by', { name: r.created_by }) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            const kind = KIND_LABEL[r.document_type];
            return (
              <li
                key={r.id}
                className={`doc-rev${i === 0 ? ' is-newest' : ''}${i === rows.length - 1 ? ' is-last' : ''}${r.id === freshId ? ' is-fresh' : ''}`}
                data-testid="documents-revision"
              >
                <span className={current ? 'doc-rev-dot is-current' : 'doc-rev-dot'} aria-hidden="true" />
                <div className="doc-rev-head">
                  <span className="doc-rev-no" data-testid="documents-revision-no">
                    {t('documents.revisions.rev', { n: r.revision })}
                  </span>
                  <span className={current ? 'doc-rev-tag is-current' : 'doc-rev-tag'}>
                    {current ? t('documents.revisions.current') : t('documents.revisions.format')}
                  </span>
                </div>
                <div className="doc-rev-date">{formatRevisionTime(r.generated_at)}</div>
                <div className="doc-rev-note">{[kind ? t(kind) : r.document_type, r.note].filter(Boolean).join(' · ')}</div>
                {r.local_file_path && (
                  <div className="doc-rev-file" title={r.local_file_path} data-testid="documents-revision-file">
                    <span className="doc-rev-file-name">{r.file_name ?? r.local_file_path}</span>
                    {dirOf(r.local_file_path) && <span className="doc-rev-file-dir">{dirOf(r.local_file_path)}</span>}
                  </div>
                )}
                <div className="doc-rev-meta">{meta}</div>
              </li>
            );
          })}
        </ol>
      )}

      <span className="doc-rev-spacer" />

      {revealError && (
        <p className="field-error" role="alert" data-testid="documents-reveal-error">
          {revealError}
        </p>
      )}
      <button
        type="button"
        className="btn doc-rev-open"
        disabled={!latestPath}
        onClick={() => latestPath && onReveal(latestPath)}
        title={latestPath ?? undefined}
        data-testid="documents-reveal"
      >
        {t('documents.revisions.reveal')}
      </button>
    </section>
  );
}
