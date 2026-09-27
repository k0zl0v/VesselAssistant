-- Operator context for the audit trail (FR-10). The single app_session row
-- names who is at the console; the 24 audit triggers from 0002 are recreated
-- to stamp user_id / user_role / reason from it instead of a literal NULL.

CREATE TABLE app_session (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    operator_name   TEXT NOT NULL CHECK (length(trim(operator_name)) > 0),
    operator_role   TEXT NOT NULL
                    CHECK (operator_role IN ('operator', 'supervisor', 'admin', 'viewer')),
    override_reason TEXT,
    started_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE audit_log ADD COLUMN user_role TEXT;
ALTER TABLE audit_log ADD COLUMN reason    TEXT;

-- voyages -----------------------------------------------------------------

DROP TRIGGER audit_voyages_insert;
CREATE TRIGGER audit_voyages_insert
AFTER INSERT ON voyages
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'voyages', NEW.id, 'insert', NULL,
        json_object(
            'id', NEW.id,
            'vessel_id', NEW.vessel_id,
            'voyage_no', NEW.voyage_no,
            'loading_port_id', NEW.loading_port_id,
            'discharging_port_id', NEW.discharging_port_id,
            'status', NEW.status,
            'arrived_at', NEW.arrived_at,
            'nor_at', NEW.nor_at,
            'berthed_at', NEW.berthed_at,
            'operations_started_at', NEW.operations_started_at,
            'operations_ended_at', NEW.operations_ended_at,
            'departed_at', NEW.departed_at
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_voyages_update;
CREATE TRIGGER audit_voyages_update
AFTER UPDATE ON voyages
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'voyages', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'vessel_id', OLD.vessel_id,
            'voyage_no', OLD.voyage_no,
            'loading_port_id', OLD.loading_port_id,
            'discharging_port_id', OLD.discharging_port_id,
            'status', OLD.status,
            'arrived_at', OLD.arrived_at,
            'nor_at', OLD.nor_at,
            'berthed_at', OLD.berthed_at,
            'operations_started_at', OLD.operations_started_at,
            'operations_ended_at', OLD.operations_ended_at,
            'departed_at', OLD.departed_at
        ),
        json_object(
            'id', NEW.id,
            'vessel_id', NEW.vessel_id,
            'voyage_no', NEW.voyage_no,
            'loading_port_id', NEW.loading_port_id,
            'discharging_port_id', NEW.discharging_port_id,
            'status', NEW.status,
            'arrived_at', NEW.arrived_at,
            'nor_at', NEW.nor_at,
            'berthed_at', NEW.berthed_at,
            'operations_started_at', NEW.operations_started_at,
            'operations_ended_at', NEW.operations_ended_at,
            'departed_at', NEW.departed_at
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_voyages_delete;
CREATE TRIGGER audit_voyages_delete
AFTER DELETE ON voyages
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'voyages', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'vessel_id', OLD.vessel_id,
            'voyage_no', OLD.voyage_no,
            'loading_port_id', OLD.loading_port_id,
            'discharging_port_id', OLD.discharging_port_id,
            'status', OLD.status,
            'arrived_at', OLD.arrived_at,
            'nor_at', OLD.nor_at,
            'berthed_at', OLD.berthed_at,
            'operations_started_at', OLD.operations_started_at,
            'operations_ended_at', OLD.operations_ended_at,
            'departed_at', OLD.departed_at
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

-- cargo_lots --------------------------------------------------------------

DROP TRIGGER audit_cargo_lots_insert;
CREATE TRIGGER audit_cargo_lots_insert
AFTER INSERT ON cargo_lots
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'cargo_lots', NEW.id, 'insert', NULL,
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'source_vessel', NEW.source_vessel,
            'cargo_id', NEW.cargo_id,
            'hold_id', NEW.hold_id,
            'protein_percent', NEW.protein_percent,
            'sf', NEW.sf,
            'planned_tons', NEW.planned_tons,
            'loaded_tons', NEW.loaded_tons,
            'bl_no', NEW.bl_no,
            'load_sequence', NEW.load_sequence,
            'loaded_at', NEW.loaded_at
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_cargo_lots_update;
CREATE TRIGGER audit_cargo_lots_update
AFTER UPDATE ON cargo_lots
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'cargo_lots', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'source_vessel', OLD.source_vessel,
            'cargo_id', OLD.cargo_id,
            'hold_id', OLD.hold_id,
            'protein_percent', OLD.protein_percent,
            'sf', OLD.sf,
            'planned_tons', OLD.planned_tons,
            'loaded_tons', OLD.loaded_tons,
            'bl_no', OLD.bl_no,
            'load_sequence', OLD.load_sequence,
            'loaded_at', OLD.loaded_at
        ),
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'source_vessel', NEW.source_vessel,
            'cargo_id', NEW.cargo_id,
            'hold_id', NEW.hold_id,
            'protein_percent', NEW.protein_percent,
            'sf', NEW.sf,
            'planned_tons', NEW.planned_tons,
            'loaded_tons', NEW.loaded_tons,
            'bl_no', NEW.bl_no,
            'load_sequence', NEW.load_sequence,
            'loaded_at', NEW.loaded_at
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_cargo_lots_delete;
CREATE TRIGGER audit_cargo_lots_delete
AFTER DELETE ON cargo_lots
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'cargo_lots', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'source_vessel', OLD.source_vessel,
            'cargo_id', OLD.cargo_id,
            'hold_id', OLD.hold_id,
            'protein_percent', OLD.protein_percent,
            'sf', OLD.sf,
            'planned_tons', OLD.planned_tons,
            'loaded_tons', OLD.loaded_tons,
            'bl_no', OLD.bl_no,
            'load_sequence', OLD.load_sequence,
            'loaded_at', OLD.loaded_at
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

-- cargo_layers ------------------------------------------------------------

DROP TRIGGER audit_cargo_layers_insert;
CREATE TRIGGER audit_cargo_layers_insert
AFTER INSERT ON cargo_layers
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'cargo_layers', NEW.id, 'insert', NULL,
        json_object(
            'id', NEW.id,
            'cargo_lot_id', NEW.cargo_lot_id,
            'voyage_id', NEW.voyage_id,
            'hold_id', NEW.hold_id,
            'source_vessel', NEW.source_vessel,
            'loaded_tons', NEW.loaded_tons,
            'remaining_tons', NEW.remaining_tons,
            'load_sequence', NEW.load_sequence,
            'layer_status', NEW.layer_status
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_cargo_layers_update;
CREATE TRIGGER audit_cargo_layers_update
AFTER UPDATE ON cargo_layers
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'cargo_layers', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'cargo_lot_id', OLD.cargo_lot_id,
            'voyage_id', OLD.voyage_id,
            'hold_id', OLD.hold_id,
            'source_vessel', OLD.source_vessel,
            'loaded_tons', OLD.loaded_tons,
            'remaining_tons', OLD.remaining_tons,
            'load_sequence', OLD.load_sequence,
            'layer_status', OLD.layer_status
        ),
        json_object(
            'id', NEW.id,
            'cargo_lot_id', NEW.cargo_lot_id,
            'voyage_id', NEW.voyage_id,
            'hold_id', NEW.hold_id,
            'source_vessel', NEW.source_vessel,
            'loaded_tons', NEW.loaded_tons,
            'remaining_tons', NEW.remaining_tons,
            'load_sequence', NEW.load_sequence,
            'layer_status', NEW.layer_status
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_cargo_layers_delete;
CREATE TRIGGER audit_cargo_layers_delete
AFTER DELETE ON cargo_layers
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'cargo_layers', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'cargo_lot_id', OLD.cargo_lot_id,
            'voyage_id', OLD.voyage_id,
            'hold_id', OLD.hold_id,
            'source_vessel', OLD.source_vessel,
            'loaded_tons', OLD.loaded_tons,
            'remaining_tons', OLD.remaining_tons,
            'load_sequence', OLD.load_sequence,
            'layer_status', OLD.layer_status
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

-- discharge_allocations ---------------------------------------------------

DROP TRIGGER audit_discharge_allocations_insert;
CREATE TRIGGER audit_discharge_allocations_insert
AFTER INSERT ON discharge_allocations
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'discharge_allocations', NEW.id, 'insert', NULL,
        json_object(
            'id', NEW.id,
            'operation_id', NEW.operation_id,
            'cargo_layer_id', NEW.cargo_layer_id,
            'cargo_lot_id', NEW.cargo_lot_id,
            'hold_id', NEW.hold_id,
            'source_vessel', NEW.source_vessel,
            'discharged_tons', NEW.discharged_tons
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_discharge_allocations_update;
CREATE TRIGGER audit_discharge_allocations_update
AFTER UPDATE ON discharge_allocations
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'discharge_allocations', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'operation_id', OLD.operation_id,
            'cargo_layer_id', OLD.cargo_layer_id,
            'cargo_lot_id', OLD.cargo_lot_id,
            'hold_id', OLD.hold_id,
            'source_vessel', OLD.source_vessel,
            'discharged_tons', OLD.discharged_tons
        ),
        json_object(
            'id', NEW.id,
            'operation_id', NEW.operation_id,
            'cargo_layer_id', NEW.cargo_layer_id,
            'cargo_lot_id', NEW.cargo_lot_id,
            'hold_id', NEW.hold_id,
            'source_vessel', NEW.source_vessel,
            'discharged_tons', NEW.discharged_tons
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_discharge_allocations_delete;
CREATE TRIGGER audit_discharge_allocations_delete
AFTER DELETE ON discharge_allocations
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'discharge_allocations', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'operation_id', OLD.operation_id,
            'cargo_layer_id', OLD.cargo_layer_id,
            'cargo_lot_id', OLD.cargo_lot_id,
            'hold_id', OLD.hold_id,
            'source_vessel', OLD.source_vessel,
            'discharged_tons', OLD.discharged_tons
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

-- operations --------------------------------------------------------------

DROP TRIGGER audit_operations_insert;
CREATE TRIGGER audit_operations_insert
AFTER INSERT ON operations
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'operations', NEW.id, 'insert', NULL,
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'type', NEW.type,
            'event_date', NEW.event_date,
            'time_from', NEW.time_from,
            'time_to', NEW.time_to,
            'source_hold', NEW.source_hold,
            'target_hold', NEW.target_hold,
            'crane_id', NEW.crane_id,
            'tons', NEW.tons,
            'description', NEW.description
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_operations_update;
CREATE TRIGGER audit_operations_update
AFTER UPDATE ON operations
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'operations', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'type', OLD.type,
            'event_date', OLD.event_date,
            'time_from', OLD.time_from,
            'time_to', OLD.time_to,
            'source_hold', OLD.source_hold,
            'target_hold', OLD.target_hold,
            'crane_id', OLD.crane_id,
            'tons', OLD.tons,
            'description', OLD.description
        ),
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'type', NEW.type,
            'event_date', NEW.event_date,
            'time_from', NEW.time_from,
            'time_to', NEW.time_to,
            'source_hold', NEW.source_hold,
            'target_hold', NEW.target_hold,
            'crane_id', NEW.crane_id,
            'tons', NEW.tons,
            'description', NEW.description
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_operations_delete;
CREATE TRIGGER audit_operations_delete
AFTER DELETE ON operations
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'operations', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'type', OLD.type,
            'event_date', OLD.event_date,
            'time_from', OLD.time_from,
            'time_to', OLD.time_to,
            'source_hold', OLD.source_hold,
            'target_hold', OLD.target_hold,
            'crane_id', OLD.crane_id,
            'tons', OLD.tons,
            'description', OLD.description
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

-- sof_events --------------------------------------------------------------

DROP TRIGGER audit_sof_events_insert;
CREATE TRIGGER audit_sof_events_insert
AFTER INSERT ON sof_events
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'sof_events', NEW.id, 'insert', NULL,
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'event_date', NEW.event_date,
            'time_from', NEW.time_from,
            'time_to', NEW.time_to,
            'category', NEW.category,
            'description', NEW.description,
            'daily_qty', NEW.daily_qty,
            'total_qty', NEW.total_qty
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_sof_events_update;
CREATE TRIGGER audit_sof_events_update
AFTER UPDATE ON sof_events
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'sof_events', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'event_date', OLD.event_date,
            'time_from', OLD.time_from,
            'time_to', OLD.time_to,
            'category', OLD.category,
            'description', OLD.description,
            'daily_qty', OLD.daily_qty,
            'total_qty', OLD.total_qty
        ),
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'event_date', NEW.event_date,
            'time_from', NEW.time_from,
            'time_to', NEW.time_to,
            'category', NEW.category,
            'description', NEW.description,
            'daily_qty', NEW.daily_qty,
            'total_qty', NEW.total_qty
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_sof_events_delete;
CREATE TRIGGER audit_sof_events_delete
AFTER DELETE ON sof_events
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'sof_events', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'event_date', OLD.event_date,
            'time_from', OLD.time_from,
            'time_to', OLD.time_to,
            'category', OLD.category,
            'description', OLD.description,
            'daily_qty', OLD.daily_qty,
            'total_qty', OLD.total_qty
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

-- crane_coefficients ------------------------------------------------------

DROP TRIGGER audit_crane_coefficients_insert;
CREATE TRIGGER audit_crane_coefficients_insert
AFTER INSERT ON crane_coefficients
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_coefficients', NEW.id, 'insert', NULL,
        json_object(
            'id', NEW.id,
            'crane_id', NEW.crane_id,
            'operation_type', NEW.operation_type,
            'side', NEW.side,
            'vessel_name', NEW.vessel_name,
            'valid_from', NEW.valid_from,
            'valid_to', NEW.valid_to,
            'coefficient', NEW.coefficient
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_crane_coefficients_update;
CREATE TRIGGER audit_crane_coefficients_update
AFTER UPDATE ON crane_coefficients
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_coefficients', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'crane_id', OLD.crane_id,
            'operation_type', OLD.operation_type,
            'side', OLD.side,
            'vessel_name', OLD.vessel_name,
            'valid_from', OLD.valid_from,
            'valid_to', OLD.valid_to,
            'coefficient', OLD.coefficient
        ),
        json_object(
            'id', NEW.id,
            'crane_id', NEW.crane_id,
            'operation_type', NEW.operation_type,
            'side', NEW.side,
            'vessel_name', NEW.vessel_name,
            'valid_from', NEW.valid_from,
            'valid_to', NEW.valid_to,
            'coefficient', NEW.coefficient
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_crane_coefficients_delete;
CREATE TRIGGER audit_crane_coefficients_delete
AFTER DELETE ON crane_coefficients
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'crane_coefficients', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'crane_id', OLD.crane_id,
            'operation_type', OLD.operation_type,
            'side', OLD.side,
            'vessel_name', OLD.vessel_name,
            'valid_from', OLD.valid_from,
            'valid_to', OLD.valid_to,
            'coefficient', OLD.coefficient
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

-- hold_cargo_parameters ---------------------------------------------------

DROP TRIGGER audit_hold_cargo_parameters_insert;
CREATE TRIGGER audit_hold_cargo_parameters_insert
AFTER INSERT ON hold_cargo_parameters
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'hold_cargo_parameters', NEW.id, 'insert', NULL,
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'vessel_id', NEW.vessel_id,
            'hold_id', NEW.hold_id,
            'cargo_id', NEW.cargo_id,
            'protein_percent', NEW.protein_percent,
            'sf', NEW.sf,
            'fill_percent', NEW.fill_percent
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_hold_cargo_parameters_update;
CREATE TRIGGER audit_hold_cargo_parameters_update
AFTER UPDATE ON hold_cargo_parameters
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'hold_cargo_parameters', NEW.id, 'update',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'vessel_id', OLD.vessel_id,
            'hold_id', OLD.hold_id,
            'cargo_id', OLD.cargo_id,
            'protein_percent', OLD.protein_percent,
            'sf', OLD.sf,
            'fill_percent', OLD.fill_percent
        ),
        json_object(
            'id', NEW.id,
            'voyage_id', NEW.voyage_id,
            'vessel_id', NEW.vessel_id,
            'hold_id', NEW.hold_id,
            'cargo_id', NEW.cargo_id,
            'protein_percent', NEW.protein_percent,
            'sf', NEW.sf,
            'fill_percent', NEW.fill_percent
        ),
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;

DROP TRIGGER audit_hold_cargo_parameters_delete;
CREATE TRIGGER audit_hold_cargo_parameters_delete
AFTER DELETE ON hold_cargo_parameters
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id, user_role, reason)
    VALUES (
        'hold_cargo_parameters', OLD.id, 'delete',
        json_object(
            'id', OLD.id,
            'voyage_id', OLD.voyage_id,
            'vessel_id', OLD.vessel_id,
            'hold_id', OLD.hold_id,
            'cargo_id', OLD.cargo_id,
            'protein_percent', OLD.protein_percent,
            'sf', OLD.sf,
            'fill_percent', OLD.fill_percent
        ),
        NULL,
        (SELECT operator_name   FROM app_session WHERE id = 1),
        (SELECT operator_role   FROM app_session WHERE id = 1),
        (SELECT override_reason FROM app_session WHERE id = 1)
    );
END;
