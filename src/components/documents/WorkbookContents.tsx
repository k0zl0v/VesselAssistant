import { useT } from '../../i18n';
import type { WorkbookSheet } from './sheets';

interface Props {
  sheets: WorkbookSheet[];
  sofEventCount: number;
  sofOverlapCount: number;
  dischargeOperationCount: number;
  /** Null when the voyage has no vessel, so no file name can be built. */
  fileName: string | null;
}

/** «Состав книги»: the four sheets in their fixed order plus the default file name. */
export function WorkbookContents({ sheets, sofEventCount, sofOverlapCount, dischargeOperationCount, fileName }: Props) {
  const t = useT();
  const notes: Record<WorkbookSheet['key'], string> = {
    load_plan: t('documents.book.note.load_plan'),
    sof:
      t('documents.book.note.sof', { count: sofEventCount }) +
      (sofOverlapCount > 0 ? t('documents.book.note.sof_overlaps', { count: sofOverlapCount }) : ''),
    ogv: t('documents.book.note.ogv', { count: dischargeOperationCount }),
    crane: t('documents.book.note.crane'),
  };

  return (
    <section className="card doc-book" data-testid="documents-book">
      <h2 className="card-title">{t('documents.book.title')}</h2>
      <p className="doc-book-subtitle">{t('documents.book.fixed')}</p>

      <ol className="doc-sheet-list">
        {sheets.map((s, i) => (
          <li
            key={s.key}
            className={i === 0 ? 'doc-sheet-item is-first' : 'doc-sheet-item'}
            data-testid={`documents-sheet-${s.key}`}
          >
            <span className="doc-sheet-item-head">
              <span className="doc-sheet-pos">{t('documents.book.position', { n: i + 1 })}</span>
              <span className="doc-sheet-name">{s.name}</span>
            </span>
            <span className="doc-sheet-note">{notes[s.key]}</span>
          </li>
        ))}
      </ol>

      <div className="doc-filename">
        <div className="doc-filename-label">{t('documents.file.label')}</div>
        {fileName ? (
          <div className="doc-filename-value" data-testid="documents-file-name">
            {fileName}
          </div>
        ) : (
          <div className="doc-filename-note">{t('documents.no_vessel')}</div>
        )}
        <div className="doc-filename-note">{t('documents.file.note')}</div>
      </div>
    </section>
  );
}
