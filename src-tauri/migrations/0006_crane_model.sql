-- Crane correction as the operators keep it (docs/ui/excel-reference.md §2):
-- four operation modes instead of operation_type + side, a measurement history
-- per (vessel, date) with manual exclusion of outliers, a separately accepted
-- working coefficient, and the shift sheet of scale vs corrected weights.
-- crane_coefficients stays in place, read by nothing new; its rows are carried
-- over below (vessel-specific → measurement, vessel-agnostic → working value).

CREATE TABLE crane_measurements (
    id           TEXT PRIMARY KEY,
    crane_id     TEXT NOT NULL REFERENCES cranes(id) ON DELETE RESTRICT,
    mode         TEXT NOT NULL CHECK (mode IN ('from_own', 'direct', 'into_own_port', 'into_own_starboard')),
    vessel_name  TEXT,
    measured_on  TEXT NOT NULL,
    coefficient  REAL NOT NULL CHECK (coefficient > 0),
    excluded     INTEGER NOT NULL DEFAULT 0 CHECK (excluded IN (0, 1)),
    note         TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_crane_measurements ON crane_measurements(crane_id, mode, measured_on);

CREATE TABLE crane_working_coefficients (
    id           TEXT PRIMARY KEY,
    crane_id     TEXT NOT NULL REFERENCES cranes(id) ON DELETE RESTRICT,
    mode         TEXT NOT NULL CHECK (mode IN ('from_own', 'direct', 'into_own_port', 'into_own_starboard')),
    coefficient  REAL NOT NULL CHECK (coefficient > 0),
    valid_from   TEXT NOT NULL,
    note         TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (crane_id, mode, valid_from)
);

CREATE TABLE crane_shift_records (
    id              TEXT PRIMARY KEY,
    voyage_id       TEXT NOT NULL REFERENCES voyages(id) ON DELETE RESTRICT,
    shift_date      TEXT NOT NULL,
    crane_id        TEXT NOT NULL REFERENCES cranes(id) ON DELETE RESTRICT,
    mode            TEXT NOT NULL CHECK (mode IN ('from_own', 'direct', 'into_own_port', 'into_own_starboard')),
    scale_tons      REAL NOT NULL CHECK (scale_tons > 0),
    coefficient     REAL NOT NULL CHECK (coefficient > 0),
    corrected_tons  REAL NOT NULL,
    operation_id    TEXT REFERENCES operations(id) ON DELETE RESTRICT,
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_crane_shift_records ON crane_shift_records(voyage_id, shift_date);

INSERT INTO crane_measurements (id, crane_id, mode, vessel_name, measured_on, coefficient)
SELECT id, crane_id,
       CASE WHEN operation_type = 'discharging' THEN 'from_own'
            WHEN operation_type = 'loading' AND side = 'STARBOARD' THEN 'into_own_starboard'
            ELSE 'into_own_port' END,
       vessel_name, valid_from, coefficient
  FROM crane_coefficients
 WHERE vessel_name IS NOT NULL AND operation_type IN ('discharging', 'loading');

INSERT OR IGNORE INTO crane_working_coefficients (id, crane_id, mode, coefficient, valid_from)
SELECT id, crane_id,
       CASE WHEN operation_type = 'discharging' THEN 'from_own'
            WHEN operation_type = 'loading' AND side = 'STARBOARD' THEN 'into_own_starboard'
            ELSE 'into_own_port' END,
       coefficient, valid_from
  FROM crane_coefficients
 WHERE vessel_name IS NULL AND operation_type IN ('discharging', 'loading');

CREATE TRIGGER audit_crane_measurements_insert
AFTER INSERT ON crane_measurements
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_measurements', NEW.id, 'insert',
        NULL,
        json_object(
            'id', NEW.id,
            'crane_id', NEW.crane_id,
            'mode', NEW.mode,
            'vessel_name', NEW.vessel_name,
            'measured_on', NEW.measured_on,
            'coefficient', NEW.coefficient,
            'excluded', NEW.excluded,
            'note', NEW.note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_crane_measurements_update
AFTER UPDATE ON crane_measurements
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_measurements', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'crane_id', OLD.crane_id,
            'mode', OLD.mode,
            'vessel_name', OLD.vessel_name,
            'measured_on', OLD.measured_on,
            'coefficient', OLD.coefficient,
            'excluded', OLD.excluded,
            'note', OLD.note
        ),
        json_object(
            'id', NEW.id,
            'crane_id', NEW.crane_id,
            'mode', NEW.mode,
            'vessel_name', NEW.vessel_name,
            'measured_on', NEW.measured_on,
            'coefficient', NEW.coefficient,
            'excluded', NEW.excluded,
            'note', NEW.note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_crane_measurements_delete
AFTER DELETE ON crane_measurements
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_measurements', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'crane_id', OLD.crane_id,
            'mode', OLD.mode,
            'vessel_name', OLD.vessel_name,
            'measured_on', OLD.measured_on,
            'coefficient', OLD.coefficient,
            'excluded', OLD.excluded,
            'note', OLD.note
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_crane_working_coefficients_insert
AFTER INSERT ON crane_working_coefficients
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_working_coefficients', NEW.id, 'insert',
        NULL,
        json_object(
            'id', NEW.id,
            'crane_id', NEW.crane_id,
            'mode', NEW.mode,
            'coefficient', NEW.coefficient,
            'valid_from', NEW.valid_from,
            'note', NEW.note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_crane_working_coefficients_update
AFTER UPDATE ON crane_working_coefficients
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_working_coefficients', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'crane_id', OLD.crane_id,
            'mode', OLD.mode,
            'coefficient', OLD.coefficient,
            'valid_from', OLD.valid_from,
            'note', OLD.note
        ),
        json_object(
            'id', NEW.id,
            'crane_id', NEW.crane_id,
            'mode', NEW.mode,
            'coefficient', NEW.coefficient,
            'valid_from', NEW.valid_from,
            'note', NEW.note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_crane_working_coefficients_delete
AFTER DELETE ON crane_working_coefficients
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_working_coefficients', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'crane_id', OLD.crane_id,
            'mode', OLD.mode,
            'coefficient', OLD.coefficient,
            'valid_from', OLD.valid_from,
            'note', OLD.note
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_crane_shift_records_insert
AFTER INSERT ON crane_shift_records
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_shift_records', NEW.id, 'insert',
        NULL,
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'shift_date', NEW.shift_date,
            'crane_id', NEW.crane_id,
            'mode', NEW.mode,
            'scale_tons', NEW.scale_tons,
            'coefficient', NEW.coefficient,
            'corrected_tons', NEW.corrected_tons,
            'operation_id', NEW.operation_id,
            'note', NEW.note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_crane_shift_records_update
AFTER UPDATE ON crane_shift_records
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_shift_records', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'shift_date', OLD.shift_date,
            'crane_id', OLD.crane_id,
            'mode', OLD.mode,
            'scale_tons', OLD.scale_tons,
            'coefficient', OLD.coefficient,
            'corrected_tons', OLD.corrected_tons,
            'operation_id', OLD.operation_id,
            'note', OLD.note
        ),
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'shift_date', NEW.shift_date,
            'crane_id', NEW.crane_id,
            'mode', NEW.mode,
            'scale_tons', NEW.scale_tons,
            'coefficient', NEW.coefficient,
            'corrected_tons', NEW.corrected_tons,
            'operation_id', NEW.operation_id,
            'note', NEW.note
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

CREATE TRIGGER audit_crane_shift_records_delete
AFTER DELETE ON crane_shift_records
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_shift_records', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'shift_date', OLD.shift_date,
            'crane_id', OLD.crane_id,
            'mode', OLD.mode,
            'scale_tons', OLD.scale_tons,
            'coefficient', OLD.coefficient,
            'corrected_tons', OLD.corrected_tons,
            'operation_id', OLD.operation_id,
            'note', OLD.note
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;
