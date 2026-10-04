-- Header fields of the Standard Time Sheet that cannot be derived from the SOF
-- journal or the reference data (docs/ui/excel-reference.md §5). One row per voyage.

CREATE TABLE sof_time_sheets (
    id                        TEXT PRIMARY KEY,
    voyage_id                 TEXT NOT NULL UNIQUE REFERENCES voyages(id) ON DELETE RESTRICT,
    shipping_company          TEXT,
    cargo_description         TEXT,
    cargo_documents_on_board  TEXT,
    charter_party             TEXT,
    bill_weight_tons          REAL CHECK (bill_weight_tons IS NULL OR bill_weight_tons >= 0),
    nor_accepted_note         TEXT,
    updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER audit_sof_time_sheets_insert
AFTER INSERT ON sof_time_sheets
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'sof_time_sheets', NEW.id, 'insert',
        NULL,
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'shipping_company', NEW.shipping_company,
            'cargo_description', NEW.cargo_description,
            'cargo_documents_on_board', NEW.cargo_documents_on_board,
            'charter_party', NEW.charter_party,
            'bill_weight_tons', NEW.bill_weight_tons,
            'nor_accepted_note', NEW.nor_accepted_note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_sof_time_sheets_update
AFTER UPDATE ON sof_time_sheets
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'sof_time_sheets', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'shipping_company', OLD.shipping_company,
            'cargo_description', OLD.cargo_description,
            'cargo_documents_on_board', OLD.cargo_documents_on_board,
            'charter_party', OLD.charter_party,
            'bill_weight_tons', OLD.bill_weight_tons,
            'nor_accepted_note', OLD.nor_accepted_note
        ),
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'shipping_company', NEW.shipping_company,
            'cargo_description', NEW.cargo_description,
            'cargo_documents_on_board', NEW.cargo_documents_on_board,
            'charter_party', NEW.charter_party,
            'bill_weight_tons', NEW.bill_weight_tons,
            'nor_accepted_note', NEW.nor_accepted_note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_sof_time_sheets_delete
AFTER DELETE ON sof_time_sheets
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'sof_time_sheets', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'shipping_company', OLD.shipping_company,
            'cargo_description', OLD.cargo_description,
            'cargo_documents_on_board', OLD.cargo_documents_on_board,
            'charter_party', OLD.charter_party,
            'bill_weight_tons', OLD.bill_weight_tons,
            'nor_accepted_note', OLD.nor_accepted_note
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;
