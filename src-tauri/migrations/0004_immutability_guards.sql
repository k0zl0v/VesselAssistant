-- Irreversible states: audit_log is append-only (D3) and a closed voyage
-- cannot return to 'open' (S-13). BackupService.importFromJson skips the
-- audit_log wipe because of audit_log_no_delete.

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is immutable'); END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is immutable'); END;

CREATE TRIGGER voyages_no_reopen BEFORE UPDATE OF status ON voyages
WHEN OLD.status = 'closed' AND NEW.status = 'open'
BEGIN SELECT RAISE(ABORT, 'closed voyage cannot be reopened'); END;
