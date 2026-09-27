mod common;

use serde::Deserialize;
use vessel_assistant_lib::batch::{run_batch, BatchError, BatchStatement};

/// Shared with src/services/__tests__/db-batch.test.ts (NodeDb) — one fixture, two implementations.
const CASES: &str = include_str!("../../src/services/__tests__/fixtures/batch-cases.json");

#[derive(Deserialize)]
struct ExpectedError {
    kind: String,
    index: usize,
}

#[derive(Deserialize)]
struct BatchCase {
    name: String,
    setup_sql: Vec<String>,
    batch: Vec<BatchStatement>,
    expect: String,
    rows_affected: Option<Vec<u64>>,
    error: Option<ExpectedError>,
    assert_sql: String,
    assert_rows: Vec<serde_json::Value>,
}

fn cases() -> Vec<BatchCase> {
    serde_json::from_str(CASES).expect("batch-cases.json parses")
}

async fn check(c: &BatchCase) {
    let mut conn = common::fresh_db().await;
    for sql in &c.setup_sql {
        common::exec(&mut conn, sql).await.expect(sql);
    }

    let outcome = run_batch(&mut conn, &c.batch).await;
    match c.expect.as_str() {
        "ok" => {
            let result = outcome.unwrap_or_else(|e| panic!("{}: unexpected error {e}", c.name));
            assert_eq!(Some(&result.rows_affected), c.rows_affected.as_ref(), "{}", c.name);
        }
        "error" => {
            let expected = c.error.as_ref().expect("error case names its error");
            let (kind, index) = match outcome {
                Ok(r) => panic!("{}: expected {} error, got Ok({:?})", c.name, expected.kind, r),
                Err(BatchError::Sql { index, message }) => {
                    assert!(message.contains("FOREIGN KEY constraint failed"), "{}: {message}", c.name);
                    ("Sql", index)
                }
                Err(BatchError::RowsAffectedMismatch { index, .. }) => ("RowsAffectedMismatch", index),
            };
            assert_eq!((kind, index), (expected.kind.as_str(), expected.index), "{}", c.name);
        }
        other => panic!("{}: unknown expect {other}", c.name),
    }

    assert_eq!(common::select_json(&mut conn, &c.assert_sql).await, c.assert_rows, "{}", c.name);
}

#[tokio::test]
async fn fixture_has_one_commit_and_two_rollback_cases() {
    let kinds: Vec<String> = cases().into_iter().map(|c| c.expect).collect();
    assert_eq!(kinds, ["ok", "error", "error"]);
}

#[tokio::test]
async fn ogv_discharge_commits_every_statement() {
    check(&cases()[0]).await;
}

#[tokio::test]
async fn fk_failure_rolls_back_whole_batch() {
    let c = &cases()[1];
    assert_eq!(c.name, "fk_failure_rolls_back_whole_batch");
    check(c).await;
}

#[tokio::test]
async fn stale_remaining_tons_rolls_back() {
    check(&cases()[2]).await;
}
