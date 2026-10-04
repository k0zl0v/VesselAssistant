-- The ocean-going vessel (OGV) loaded at the roads (docs/ui/excel-reference.md §1):
-- one per voyage, its own holds with a cargo plan, a sequence plan, and receipts
-- from barges or from the main vessel's holds (those link to the discharge operation).

CREATE TABLE ogv_vessels (
    id          TEXT PRIMARY KEY,
    voyage_id   TEXT NOT NULL UNIQUE REFERENCES voyages(id) ON DELETE RESTRICT,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'loading' CHECK (status IN ('planned', 'loading', 'completed')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ogv_holds (
    id            TEXT PRIMARY KEY,
    ogv_id        TEXT NOT NULL REFERENCES ogv_vessels(id) ON DELETE RESTRICT,
    hold_no       INTEGER NOT NULL CHECK (hold_no > 0),
    planned_tons  REAL NOT NULL CHECK (planned_tons >= 0),
    UNIQUE (ogv_id, hold_no)
);

CREATE TABLE ogv_receipts (
    id            TEXT PRIMARY KEY,
    ogv_id        TEXT NOT NULL REFERENCES ogv_vessels(id) ON DELETE RESTRICT,
    ogv_hold_id   TEXT NOT NULL REFERENCES ogv_holds(id) ON DELETE RESTRICT,
    source_kind   TEXT NOT NULL CHECK (source_kind IN ('barge', 'main_hold')),
    source_name   TEXT NOT NULL,
    cargo_id      TEXT REFERENCES cargoes(id) ON DELETE RESTRICT,
    tons          REAL NOT NULL CHECK (tons > 0),
    started_at    TEXT,
    completed_at  TEXT,
    operation_id  TEXT UNIQUE REFERENCES operations(id) ON DELETE RESTRICT,
    note          TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ogv_receipts ON ogv_receipts(ogv_id, ogv_hold_id);

CREATE TABLE ogv_sequence_steps (
    id            TEXT PRIMARY KEY,
    ogv_id        TEXT NOT NULL REFERENCES ogv_vessels(id) ON DELETE RESTRICT,
    step_no       INTEGER NOT NULL CHECK (step_no > 0),
    ogv_hold_id   TEXT NOT NULL REFERENCES ogv_holds(id) ON DELETE RESTRICT,
    planned_tons  REAL NOT NULL CHECK (planned_tons > 0),
    label         TEXT,
    UNIQUE (ogv_id, step_no)
);

CREATE TRIGGER audit_ogv_vessels_insert
AFTER INSERT ON ogv_vessels
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_vessels', NEW.id, 'insert',
        NULL,
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'name', NEW.name,
            'status', NEW.status
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_ogv_vessels_update
AFTER UPDATE ON ogv_vessels
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_vessels', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'name', OLD.name,
            'status', OLD.status
        ),
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'name', NEW.name,
            'status', NEW.status
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_ogv_vessels_delete
AFTER DELETE ON ogv_vessels
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_vessels', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'name', OLD.name,
            'status', OLD.status
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_ogv_holds_insert
AFTER INSERT ON ogv_holds
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_holds', NEW.id, 'insert',
        NULL,
        json_object(
            'id', NEW.id,
            'ogv_id', NEW.ogv_id,
            'hold_no', NEW.hold_no,
            'planned_tons', NEW.planned_tons
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_ogv_holds_update
AFTER UPDATE ON ogv_holds
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_holds', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'ogv_id', OLD.ogv_id,
            'hold_no', OLD.hold_no,
            'planned_tons', OLD.planned_tons
        ),
        json_object(
            'id', NEW.id,
            'ogv_id', NEW.ogv_id,
            'hold_no', NEW.hold_no,
            'planned_tons', NEW.planned_tons
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_ogv_holds_delete
AFTER DELETE ON ogv_holds
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_holds', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'ogv_id', OLD.ogv_id,
            'hold_no', OLD.hold_no,
            'planned_tons', OLD.planned_tons
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_ogv_receipts_insert
AFTER INSERT ON ogv_receipts
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_receipts', NEW.id, 'insert',
        NULL,
        json_object(
            'id', NEW.id,
            'ogv_id', NEW.ogv_id,
            'ogv_hold_id', NEW.ogv_hold_id,
            'source_kind', NEW.source_kind,
            'source_name', NEW.source_name,
            'cargo_id', NEW.cargo_id,
            'tons', NEW.tons,
            'started_at', NEW.started_at,
            'completed_at', NEW.completed_at,
            'operation_id', NEW.operation_id,
            'note', NEW.note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_ogv_receipts_update
AFTER UPDATE ON ogv_receipts
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_receipts', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'ogv_id', OLD.ogv_id,
            'ogv_hold_id', OLD.ogv_hold_id,
            'source_kind', OLD.source_kind,
            'source_name', OLD.source_name,
            'cargo_id', OLD.cargo_id,
            'tons', OLD.tons,
            'started_at', OLD.started_at,
            'completed_at', OLD.completed_at,
            'operation_id', OLD.operation_id,
            'note', OLD.note
        ),
        json_object(
            'id', NEW.id,
            'ogv_id', NEW.ogv_id,
            'ogv_hold_id', NEW.ogv_hold_id,
            'source_kind', NEW.source_kind,
            'source_name', NEW.source_name,
            'cargo_id', NEW.cargo_id,
            'tons', NEW.tons,
            'started_at', NEW.started_at,
            'completed_at', NEW.completed_at,
            'operation_id', NEW.operation_id,
            'note', NEW.note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_ogv_receipts_delete
AFTER DELETE ON ogv_receipts
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_receipts', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'ogv_id', OLD.ogv_id,
            'ogv_hold_id', OLD.ogv_hold_id,
            'source_kind', OLD.source_kind,
            'source_name', OLD.source_name,
            'cargo_id', OLD.cargo_id,
            'tons', OLD.tons,
            'started_at', OLD.started_at,
            'completed_at', OLD.completed_at,
            'operation_id', OLD.operation_id,
            'note', OLD.note
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_ogv_sequence_steps_insert
AFTER INSERT ON ogv_sequence_steps
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_sequence_steps', NEW.id, 'insert',
        NULL,
        json_object(
            'id', NEW.id,
            'ogv_id', NEW.ogv_id,
            'step_no', NEW.step_no,
            'ogv_hold_id', NEW.ogv_hold_id,
            'planned_tons', NEW.planned_tons,
            'label', NEW.label
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_ogv_sequence_steps_update
AFTER UPDATE ON ogv_sequence_steps
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_sequence_steps', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'ogv_id', OLD.ogv_id,
            'step_no', OLD.step_no,
            'ogv_hold_id', OLD.ogv_hold_id,
            'planned_tons', OLD.planned_tons,
            'label', OLD.label
        ),
        json_object(
            'id', NEW.id,
            'ogv_id', NEW.ogv_id,
            'step_no', NEW.step_no,
            'ogv_hold_id', NEW.ogv_hold_id,
            'planned_tons', NEW.planned_tons,
            'label', NEW.label
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_ogv_sequence_steps_delete
AFTER DELETE ON ogv_sequence_steps
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'ogv_sequence_steps', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'ogv_id', OLD.ogv_id,
            'step_no', OLD.step_no,
            'ogv_hold_id', OLD.ogv_hold_id,
            'planned_tons', OLD.planned_tons,
            'label', OLD.label
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;
