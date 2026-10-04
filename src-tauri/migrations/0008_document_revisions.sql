-- Every successful export is recorded in the existing `documents` table (0001),
-- so the Documents screen can list revisions. The file stays where the operator
-- saved it; `revision` counts per (voyage, document_type).

ALTER TABLE documents ADD COLUMN file_name TEXT;
ALTER TABLE documents ADD COLUMN byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0);
ALTER TABLE documents ADD COLUMN created_by TEXT;
ALTER TABLE documents ADD COLUMN note TEXT;
CREATE UNIQUE INDEX idx_documents_revision ON documents(voyage_id, document_type, revision);

CREATE TRIGGER audit_documents_insert
AFTER INSERT ON documents
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'documents', NEW.id, 'insert',
        NULL,
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'document_type', NEW.document_type,
            'revision', NEW.revision,
            'generated_at', NEW.generated_at,
            'local_file_path', NEW.local_file_path,
            'status', NEW.status,
            'file_name', NEW.file_name,
            'byte_size', NEW.byte_size,
            'created_by', NEW.created_by,
            'note', NEW.note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_documents_update
AFTER UPDATE ON documents
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'documents', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'document_type', OLD.document_type,
            'revision', OLD.revision,
            'generated_at', OLD.generated_at,
            'local_file_path', OLD.local_file_path,
            'status', OLD.status,
            'file_name', OLD.file_name,
            'byte_size', OLD.byte_size,
            'created_by', OLD.created_by,
            'note', OLD.note
        ),
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'document_type', NEW.document_type,
            'revision', NEW.revision,
            'generated_at', NEW.generated_at,
            'local_file_path', NEW.local_file_path,
            'status', NEW.status,
            'file_name', NEW.file_name,
            'byte_size', NEW.byte_size,
            'created_by', NEW.created_by,
            'note', NEW.note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_documents_delete
AFTER DELETE ON documents
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'documents', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'document_type', OLD.document_type,
            'revision', OLD.revision,
            'generated_at', OLD.generated_at,
            'local_file_path', OLD.local_file_path,
            'status', OLD.status,
            'file_name', OLD.file_name,
            'byte_size', OLD.byte_size,
            'created_by', OLD.created_by,
            'note', OLD.note
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;
