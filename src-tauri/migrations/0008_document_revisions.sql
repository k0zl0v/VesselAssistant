-- Every successful export is recorded, so the Documents screen can list revisions
-- (the file itself stays where the operator saved it).

CREATE TABLE document_revisions (
    id           TEXT PRIMARY KEY,
    voyage_id    TEXT NOT NULL REFERENCES voyages(id) ON DELETE RESTRICT,
    kind         TEXT NOT NULL CHECK (kind IN ('load_plan', 'audit_log')),
    revision_no  INTEGER NOT NULL CHECK (revision_no > 0),
    file_name    TEXT NOT NULL,
    file_path    TEXT NOT NULL,
    byte_size    INTEGER NOT NULL CHECK (byte_size >= 0),
    note         TEXT,
    created_by   TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (voyage_id, kind, revision_no)
);

CREATE TRIGGER audit_document_revisions_insert
AFTER INSERT ON document_revisions
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'document_revisions', NEW.id, 'insert',
        NULL,
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'kind', NEW.kind,
            'revision_no', NEW.revision_no,
            'file_name', NEW.file_name,
            'file_path', NEW.file_path,
            'byte_size', NEW.byte_size,
            'note', NEW.note,
            'created_by', NEW.created_by
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_document_revisions_update
AFTER UPDATE ON document_revisions
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'document_revisions', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'kind', OLD.kind,
            'revision_no', OLD.revision_no,
            'file_name', OLD.file_name,
            'file_path', OLD.file_path,
            'byte_size', OLD.byte_size,
            'note', OLD.note,
            'created_by', OLD.created_by
        ),
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'kind', NEW.kind,
            'revision_no', NEW.revision_no,
            'file_name', NEW.file_name,
            'file_path', NEW.file_path,
            'byte_size', NEW.byte_size,
            'note', NEW.note,
            'created_by', NEW.created_by
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_document_revisions_delete
AFTER DELETE ON document_revisions
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'document_revisions', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'kind', OLD.kind,
            'revision_no', OLD.revision_no,
            'file_name', OLD.file_name,
            'file_path', OLD.file_path,
            'byte_size', OLD.byte_size,
            'note', OLD.note,
            'created_by', OLD.created_by
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;
