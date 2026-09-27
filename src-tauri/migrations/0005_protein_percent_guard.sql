-- FR-19: protein_percent is NULL or one of 10.5 / 11.5 / 12.5 / 13.5.
-- Triggers, not CHECK: adding a CHECK means rebuilding cargo_lots under its
-- FKs and audit triggers inside the migration transaction.

CREATE TRIGGER cargo_lots_protein_insert BEFORE INSERT ON cargo_lots
WHEN NEW.protein_percent IS NOT NULL
 AND NEW.protein_percent NOT IN (10.5, 11.5, 12.5, 13.5)
BEGIN SELECT RAISE(ABORT, 'protein_percent not in allowed set'); END;

CREATE TRIGGER cargo_lots_protein_update BEFORE UPDATE OF protein_percent ON cargo_lots
WHEN NEW.protein_percent IS NOT NULL
 AND NEW.protein_percent NOT IN (10.5, 11.5, 12.5, 13.5)
BEGIN SELECT RAISE(ABORT, 'protein_percent not in allowed set'); END;

CREATE TRIGGER hold_cargo_parameters_protein_insert BEFORE INSERT ON hold_cargo_parameters
WHEN NEW.protein_percent IS NOT NULL
 AND NEW.protein_percent NOT IN (10.5, 11.5, 12.5, 13.5)
BEGIN SELECT RAISE(ABORT, 'protein_percent not in allowed set'); END;

CREATE TRIGGER hold_cargo_parameters_protein_update BEFORE UPDATE OF protein_percent ON hold_cargo_parameters
WHEN NEW.protein_percent IS NOT NULL
 AND NEW.protein_percent NOT IN (10.5, 11.5, 12.5, 13.5)
BEGIN SELECT RAISE(ABORT, 'protein_percent not in allowed set'); END;
