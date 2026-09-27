use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::sqlite::{Sqlite, SqliteArguments};
use sqlx::query::Query;
use sqlx::Connection;

#[derive(Debug, Deserialize)]
pub struct BatchStatement {
    pub sql: String,
    pub params: Vec<serde_json::Value>,
    pub expect_rows_affected: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct BatchResult {
    pub rows_affected: Vec<u64>,
}

#[derive(Debug, Serialize, thiserror::Error)]
pub enum BatchError {
    #[error("statement {index}: {message}")]
    Sql { index: usize, message: String },
    #[error("statement {index}: expected {expected} rows, got {actual}")]
    RowsAffectedMismatch { index: usize, expected: u64, actual: u64 },
}

/// Runs every statement on `conn` inside one `BEGIN IMMEDIATE` transaction.
/// Any SQL failure or `expect_rows_affected` mismatch rolls the whole batch back.
pub async fn run_batch(
    conn: &mut sqlx::SqliteConnection,
    batch: &[BatchStatement],
) -> Result<BatchResult, BatchError> {
    let mut tx = conn
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| sql_error(0, e))?;
    let mut rows_affected = Vec::with_capacity(batch.len());
    for (index, statement) in batch.iter().enumerate() {
        let query = statement
            .params
            .iter()
            .fold(sqlx::query(&statement.sql), bind);
        let actual = query
            .execute(&mut *tx)
            .await
            .map_err(|e| sql_error(index, e))?
            .rows_affected();
        if let Some(expected) = statement.expect_rows_affected {
            if actual != expected {
                return Err(BatchError::RowsAffectedMismatch { index, expected, actual });
            }
        }
        rows_affected.push(actual);
    }
    // index = batch.len() attributes a COMMIT failure to no single statement.
    tx.commit().await.map_err(|e| sql_error(batch.len(), e))?;
    Ok(BatchResult { rows_affected })
}

fn sql_error(index: usize, e: sqlx::Error) -> BatchError {
    BatchError::Sql { index, message: e.to_string() }
}

/// Same coercion as `NodeDb.coerce` (booleans → 0/1); integral numbers bind as INTEGER.
fn bind<'q>(
    query: Query<'q, Sqlite, SqliteArguments<'q>>,
    value: &'q Value,
) -> Query<'q, Sqlite, SqliteArguments<'q>> {
    match value {
        Value::Null => query.bind(None::<i64>),
        Value::Bool(b) => query.bind(i64::from(*b)),
        Value::Number(n) => match n.as_i64() {
            Some(i) => query.bind(i),
            None => query.bind(n.as_f64()),
        },
        Value::String(s) => query.bind(s.as_str()),
        other => query.bind(other.to_string()),
    }
}
