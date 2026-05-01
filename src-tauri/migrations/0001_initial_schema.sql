-- VesselAssistant initial schema (TZ §9)
-- All tonnages, volumes and SF stored as REAL (double precision).
-- Rounding to 3 decimals is presentation-only.

PRAGMA foreign_keys = ON;

-- Reference data ----------------------------------------------------------

CREATE TABLE vessels (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    flag                  TEXT,
    owner                 TEXT,
    imo                   TEXT UNIQUE,
    default_fill_percent  REAL NOT NULL DEFAULT 0.98
        CHECK (default_fill_percent BETWEEN 0 AND 1),
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE holds (
    id           TEXT PRIMARY KEY,
    vessel_id    TEXT NOT NULL REFERENCES vessels(id) ON DELETE RESTRICT,
    hold_no      INTEGER NOT NULL,
    volume_m3    REAL NOT NULL CHECK (volume_m3 > 0),
    notes        TEXT,
    UNIQUE (vessel_id, hold_no)
);

CREATE TABLE cargoes (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    default_protein  REAL,
    unit             TEXT NOT NULL DEFAULT 'tons',
    density          REAL,
    active           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE ports (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL,
    code  TEXT
);

CREATE TABLE cranes (
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    notes  TEXT
);

-- Voyage and per-voyage data ---------------------------------------------

CREATE TABLE voyages (
    id                     TEXT PRIMARY KEY,
    vessel_id              TEXT NOT NULL REFERENCES vessels(id) ON DELETE RESTRICT,
    voyage_no              TEXT NOT NULL,
    loading_port_id        TEXT REFERENCES ports(id),
    discharging_port_id    TEXT REFERENCES ports(id),
    status                 TEXT NOT NULL DEFAULT 'open',
    arrived_at             TEXT,
    nor_at                 TEXT,
    berthed_at             TEXT,
    operations_started_at  TEXT,
    operations_ended_at    TEXT,
    departed_at            TEXT,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (vessel_id, voyage_no)
);

CREATE TABLE hold_cargo_parameters (
    id               TEXT PRIMARY KEY,
    voyage_id        TEXT NOT NULL REFERENCES voyages(id) ON DELETE CASCADE,
    vessel_id        TEXT NOT NULL REFERENCES vessels(id) ON DELETE RESTRICT,
    hold_id          TEXT NOT NULL REFERENCES holds(id) ON DELETE RESTRICT,
    cargo_id         TEXT NOT NULL REFERENCES cargoes(id) ON DELETE RESTRICT,
    protein_percent  REAL,
    sf               REAL NOT NULL CHECK (sf > 0),
    fill_percent     REAL NOT NULL DEFAULT 0.98
        CHECK (fill_percent BETWEEN 0 AND 1),
    UNIQUE (voyage_id, hold_id, cargo_id)
);

-- Lots and layers (LIFO discharge core) ----------------------------------

CREATE TABLE cargo_lots (
    id               TEXT PRIMARY KEY,
    voyage_id        TEXT NOT NULL REFERENCES voyages(id) ON DELETE RESTRICT,
    source_vessel    TEXT NOT NULL,
    cargo_id         TEXT NOT NULL REFERENCES cargoes(id) ON DELETE RESTRICT,
    hold_id          TEXT NOT NULL REFERENCES holds(id) ON DELETE RESTRICT,
    protein_percent  REAL,
    sf               REAL NOT NULL CHECK (sf > 0),
    planned_tons     REAL NOT NULL CHECK (planned_tons >= 0),
    loaded_tons      REAL NOT NULL CHECK (loaded_tons >= 0),
    bl_no            TEXT,
    load_sequence    INTEGER NOT NULL,
    loaded_at        TEXT NOT NULL,
    UNIQUE (voyage_id, hold_id, load_sequence)
);

CREATE TABLE cargo_layers (
    id              TEXT PRIMARY KEY,
    cargo_lot_id    TEXT NOT NULL REFERENCES cargo_lots(id) ON DELETE CASCADE,
    voyage_id       TEXT NOT NULL REFERENCES voyages(id) ON DELETE CASCADE,
    hold_id         TEXT NOT NULL REFERENCES holds(id) ON DELETE RESTRICT,
    source_vessel   TEXT NOT NULL,
    loaded_tons     REAL NOT NULL CHECK (loaded_tons >= 0),
    remaining_tons  REAL NOT NULL CHECK (remaining_tons >= 0),
    load_sequence   INTEGER NOT NULL,
    layer_status    TEXT NOT NULL DEFAULT 'active',
    CHECK (remaining_tons <= loaded_tons)
);

CREATE TABLE operations (
    id              TEXT PRIMARY KEY,
    voyage_id       TEXT NOT NULL REFERENCES voyages(id) ON DELETE RESTRICT,
    type            TEXT NOT NULL,
    event_date      TEXT NOT NULL,
    time_from       TEXT,
    time_to         TEXT,
    source_hold     TEXT REFERENCES holds(id),
    target_hold     TEXT REFERENCES holds(id),
    crane_id        TEXT REFERENCES cranes(id),
    tons            REAL,
    description     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE discharge_allocations (
    id                TEXT PRIMARY KEY,
    operation_id      TEXT NOT NULL REFERENCES operations(id) ON DELETE RESTRICT,
    cargo_layer_id    TEXT NOT NULL REFERENCES cargo_layers(id) ON DELETE RESTRICT,
    cargo_lot_id      TEXT NOT NULL REFERENCES cargo_lots(id) ON DELETE RESTRICT,
    hold_id           TEXT NOT NULL REFERENCES holds(id) ON DELETE RESTRICT,
    source_vessel     TEXT NOT NULL,
    discharged_tons   REAL NOT NULL CHECK (discharged_tons > 0),
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Crane corrections ------------------------------------------------------

CREATE TABLE crane_coefficients (
    id              TEXT PRIMARY KEY,
    crane_id        TEXT NOT NULL REFERENCES cranes(id) ON DELETE RESTRICT,
    operation_type  TEXT NOT NULL,
    side            TEXT,
    vessel_name     TEXT,
    valid_from      TEXT NOT NULL,
    valid_to        TEXT,
    coefficient     REAL NOT NULL CHECK (coefficient > 0)
);

-- Statement of Facts -----------------------------------------------------

CREATE TABLE sof_events (
    id           TEXT PRIMARY KEY,
    voyage_id    TEXT NOT NULL REFERENCES voyages(id) ON DELETE CASCADE,
    event_date   TEXT NOT NULL,
    time_from    TEXT,
    time_to      TEXT,
    category     TEXT,
    description  TEXT,
    daily_qty    REAL,
    total_qty    REAL
);

-- Documents and audit ----------------------------------------------------

CREATE TABLE documents (
    id                TEXT PRIMARY KEY,
    voyage_id         TEXT NOT NULL REFERENCES voyages(id) ON DELETE CASCADE,
    document_type     TEXT NOT NULL,
    revision          INTEGER NOT NULL DEFAULT 1,
    generated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    local_file_path   TEXT,
    status            TEXT NOT NULL DEFAULT 'draft'
);

CREATE TABLE audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    action        TEXT NOT NULL,
    old_value     TEXT,
    new_value     TEXT,
    user_id       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indices ----------------------------------------------------------------

CREATE INDEX idx_holds_vessel              ON holds(vessel_id);
CREATE INDEX idx_cargo_lots_voyage         ON cargo_lots(voyage_id);
CREATE INDEX idx_cargo_lots_hold           ON cargo_lots(hold_id);
CREATE INDEX idx_cargo_layers_hold_seq     ON cargo_layers(hold_id, load_sequence DESC);
CREATE INDEX idx_cargo_layers_lot          ON cargo_layers(cargo_lot_id);
CREATE INDEX idx_dalloc_operation          ON discharge_allocations(operation_id);
CREATE INDEX idx_dalloc_layer              ON discharge_allocations(cargo_layer_id);
CREATE INDEX idx_operations_voyage_date    ON operations(voyage_id, event_date);
CREATE INDEX idx_sof_voyage_date           ON sof_events(voyage_id, event_date, time_from);
CREATE INDEX idx_audit_entity              ON audit_log(entity_type, entity_id, created_at);
