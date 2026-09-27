use crate::batch::{run_batch, BatchResult, BatchStatement};

/// Runs `batch` on a connection from `tauri-plugin-sql`'s own pool, so the
/// plugin stays the only writer. `db` is the URL passed to `Database.load`.
#[tauri::command]
pub async fn execute_batch(
    db_instances: tauri::State<'_, tauri_plugin_sql::DbInstances>,
    db: String,
    batch: Vec<BatchStatement>,
) -> Result<BatchResult, String> {
    let instances = db_instances.0.read().await;
    let pool = match instances.get(&db) {
        Some(tauri_plugin_sql::DbPool::Sqlite(p)) => p,
        _ => return Err(format!("database {db} is not loaded")),
    };
    let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;
    run_batch(&mut conn, &batch)
        .await
        .map_err(|e| serde_json::to_string(&e).unwrap_or_else(|_| e.to_string()))
}
