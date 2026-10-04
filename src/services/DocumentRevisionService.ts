import type { Db } from './db';

export type DocumentKind = 'load_plan' | 'audit_log';

/** A row of `documents` (0001 + 0008): one successful export. The file itself stays where it was saved. */
export interface DocumentRevision {
  id: string;
  voyage_id: string;
  document_type: string;
  revision: number;
  /** SQLite `datetime('now')`, UTC: `2026-09-27 09:04:11`. */
  generated_at: string;
  local_file_path: string | null;
  status: string;
  file_name: string | null;
  byte_size: number | null;
  created_by: string | null;
  note: string | null;
}

export interface RecordRevisionInput {
  voyage_id: string;
  document_type: DocumentKind;
  file_path: string;
  byte_size: number;
  note?: string | null;
}

/** Last segment of a POSIX or Windows path. */
export function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

const COLUMNS = `id, voyage_id, document_type, revision, generated_at, local_file_path, status,
                 file_name, byte_size, created_by, note`;

export class DocumentRevisionService {
  constructor(private readonly db: Db) {}

  /**
   * One INSERT … SELECT, so the next revision number and the operator are read in the same
   * statement that writes the row; the UNIQUE index from 0008 backs it up.
   * No voyage guard: exporting a closed voyage is allowed (ui-kit § Состояния экрана).
   */
  async record(input: RecordRevisionInput): Promise<DocumentRevision> {
    const id = crypto.randomUUID();
    const note = input.note?.trim() || null;
    await this.db.execute(
      `INSERT INTO documents (id, voyage_id, document_type, revision, local_file_path, status,
                              file_name, byte_size, created_by, note)
       SELECT ?, ?, ?, COALESCE(MAX(revision), 0) + 1, ?, 'final', ?, ?,
              (SELECT operator_name FROM app_session WHERE id = 1), ?
         FROM documents
        WHERE voyage_id = ? AND document_type = ?`,
      [
        id,
        input.voyage_id,
        input.document_type,
        input.file_path,
        fileNameOf(input.file_path),
        input.byte_size,
        note,
        input.voyage_id,
        input.document_type,
      ],
    );
    const [row] = await this.db.select<DocumentRevision>(`SELECT ${COLUMNS} FROM documents WHERE id = ?`, [id]);
    return row;
  }

  /** Newest first, every document type of the voyage. */
  async list(voyage_id: string): Promise<DocumentRevision[]> {
    return this.db.select<DocumentRevision>(
      `SELECT ${COLUMNS} FROM documents WHERE voyage_id = ? ORDER BY generated_at DESC, rowid DESC`,
      [voyage_id],
    );
  }
}

export interface RecordedExportSteps {
  /** Save dialog; null = cancelled. */
  pickPath: () => Promise<string | null>;
  generate: () => Promise<Uint8Array>;
  write: (path: string, bytes: Uint8Array) => Promise<void>;
}

/**
 * Dialog → generate → write → record. A cancelled dialog or a failed generate/write records nothing:
 * the row is written only after the file is on disk.
 */
export async function exportAndRecord(
  db: Db,
  target: Omit<RecordRevisionInput, 'file_path' | 'byte_size'>,
  steps: RecordedExportSteps,
): Promise<DocumentRevision | null> {
  const path = await steps.pickPath();
  if (!path) return null;
  const bytes = await steps.generate();
  await steps.write(path, bytes);
  return new DocumentRevisionService(db).record({ ...target, file_path: path, byte_size: bytes.byteLength });
}
