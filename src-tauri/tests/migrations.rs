mod common;

use common::{exec, fresh_db, select_json};
use serde_json::json;

const AUDITED_TABLES: [&str; 8] = [
    "voyages",
    "cargo_lots",
    "cargo_layers",
    "discharge_allocations",
    "operations",
    "sof_events",
    "crane_coefficients",
    "hold_cargo_parameters",
];

const GUARD_TRIGGERS: [&str; 8] = [
    "audit_log_dedupe_explicit_id",
    "audit_log_no_update",
    "audit_log_no_delete",
    "voyages_no_reopen",
    "cargo_lots_protein_insert",
    "cargo_lots_protein_update",
    "hold_cargo_parameters_protein_insert",
    "hold_cargo_parameters_protein_update",
];

const SEED: &str = "
    INSERT INTO vessels (id, name) VALUES ('v-1', 'NORD STAR');
    INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES ('h-1', 'v-1', 1, 100000);
    INSERT INTO cargoes (id, name) VALUES ('c-1', 'Wheat');
    INSERT INTO voyages (id, vessel_id, voyage_no) VALUES ('voy-1', 'v-1', 'B-1');
";

fn lot_insert(id: &str, sequence: i64, protein: &str) -> String {
    format!(
        "INSERT INTO cargo_lots (id, voyage_id, source_vessel, cargo_id, hold_id, protein_percent, sf, planned_tons, loaded_tons, load_sequence, loaded_at)
         VALUES ('{id}', 'voy-1', 'DIANA MARIA', 'c-1', 'h-1', {protein}, 1.25, 100, 100, {sequence}, '2026-05-01T00:00:00Z')"
    )
}

#[test]
fn every_migration_file_is_registered_in_order() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/migrations");
    let files = std::fs::read_dir(dir)
        .expect("migrations dir")
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter(|name| name.ends_with(".sql"))
        .count();
    let versions: Vec<i64> = vessel_assistant_lib::migrations().iter().map(|m| m.version).collect();
    assert_eq!(versions.len(), files, "files in src-tauri/migrations vs migrations()");
    assert_eq!(versions, (1..=files as i64).collect::<Vec<_>>());
}

#[tokio::test]
async fn migrator_records_versions_one_to_five() {
    let mut conn = fresh_db().await;
    let rows = select_json(&mut conn, "SELECT version FROM _sqlx_migrations ORDER BY version").await;
    let versions: Vec<i64> = rows.iter().map(|r| r["version"].as_i64().unwrap()).collect();
    assert_eq!(versions, [1, 2, 3, 4, 5]);
}

#[tokio::test]
async fn all_named_triggers_exist() {
    let mut conn = fresh_db().await;
    let rows = select_json(&mut conn, "SELECT name FROM sqlite_master WHERE type = 'trigger'").await;
    let present: std::collections::HashSet<String> =
        rows.iter().map(|r| r["name"].as_str().unwrap().to_string()).collect();

    let audit: Vec<String> = AUDITED_TABLES
        .iter()
        .flat_map(|t| ["insert", "update", "delete"].map(|a| format!("audit_{t}_{a}")))
        .collect();
    assert_eq!(audit.len(), 24);
    let expected: Vec<String> = audit
        .into_iter()
        .chain(GUARD_TRIGGERS.iter().map(|s| s.to_string()))
        .collect();
    let missing: Vec<&String> = expected.iter().filter(|n| !present.contains(*n)).collect();
    assert!(missing.is_empty(), "missing triggers: {missing:?}");
    assert_eq!(present.len(), expected.len(), "unexpected extra triggers: {present:?}");
}

#[tokio::test]
async fn audit_log_rejects_update_and_delete() {
    let mut conn = fresh_db().await;
    exec(&mut conn, SEED).await.unwrap();

    let update = exec(&mut conn, "UPDATE audit_log SET action = 'forged'").await;
    assert!(update.unwrap_err().to_string().contains("audit_log is immutable"));
    let delete = exec(&mut conn, "DELETE FROM audit_log").await;
    assert!(delete.unwrap_err().to_string().contains("audit_log is immutable"));
}

#[tokio::test]
async fn closed_voyage_cannot_be_reopened() {
    let mut conn = fresh_db().await;
    exec(&mut conn, SEED).await.unwrap();
    exec(&mut conn, "UPDATE voyages SET status = 'closed' WHERE id = 'voy-1'").await.unwrap();

    let reopen = exec(&mut conn, "UPDATE voyages SET status = 'open' WHERE id = 'voy-1'").await;
    assert!(reopen.unwrap_err().to_string().contains("closed voyage cannot be reopened"));
}

#[tokio::test]
async fn protein_guard_accepts_the_allowed_set_and_null_only() {
    let mut conn = fresh_db().await;
    exec(&mut conn, SEED).await.unwrap();

    for (seq, protein) in ["10.5", "11.5", "12.5", "13.5", "NULL"].iter().enumerate() {
        exec(&mut conn, &lot_insert(&format!("lot-{seq}"), seq as i64 + 1, protein))
            .await
            .unwrap_or_else(|e| panic!("protein {protein} rejected: {e}"));
    }
    let rejected = exec(&mut conn, &lot_insert("lot-bad", 99, "14.0")).await;
    assert!(rejected.unwrap_err().to_string().contains("protein_percent not in allowed set"));

    let update = exec(&mut conn, "UPDATE cargo_lots SET protein_percent = 12.0 WHERE id = 'lot-0'").await;
    assert!(update.unwrap_err().to_string().contains("protein_percent not in allowed set"));

    let hcp = exec(
        &mut conn,
        "INSERT INTO hold_cargo_parameters (id, voyage_id, vessel_id, hold_id, cargo_id, protein_percent, sf)
         VALUES ('hcp-1', 'voy-1', 'v-1', 'h-1', 'c-1', 14.0, 1.25)",
    )
    .await;
    assert!(hcp.unwrap_err().to_string().contains("protein_percent not in allowed set"));
}

#[tokio::test]
async fn app_session_stamps_the_audit_row() {
    let mut conn = fresh_db().await;
    exec(
        &mut conn,
        "INSERT INTO app_session (id, operator_name, operator_role, override_reason)
         VALUES (1, 'Ivanov', 'supervisor', 'fix SOF typo')",
    )
    .await
    .unwrap();
    exec(&mut conn, SEED).await.unwrap();

    let rows = select_json(
        &mut conn,
        "SELECT user_id, user_role, reason FROM audit_log WHERE entity_type = 'voyages' AND entity_id = 'voy-1'",
    )
    .await;
    assert_eq!(rows, [json!({ "user_id": "Ivanov", "user_role": "supervisor", "reason": "fix SOF typo" })]);
}
