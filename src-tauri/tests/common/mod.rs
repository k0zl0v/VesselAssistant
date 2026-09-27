use sqlx::migrate::{Migration as SqlxMigration, MigrationType, Migrator};
use sqlx::{Column, Connection, Row, SqliteConnection, TypeInfo, ValueRef};
use tauri_plugin_sql::MigrationKind;

/// In-memory SQLite with the production `migrations()` applied the way
/// `tauri-plugin-sql` applies them: one sqlx `Migrator`, one transaction per migration.
pub async fn fresh_db() -> SqliteConnection {
    let mut conn = SqliteConnection::connect("sqlite::memory:")
        .await
        .expect("open in-memory sqlite");
    let list = vessel_assistant_lib::migrations()
        .into_iter()
        .filter(|m| matches!(m.kind, MigrationKind::Up))
        .map(|m| {
            SqlxMigration::new(
                m.version,
                m.description.into(),
                MigrationType::ReversibleUp,
                m.sql.into(),
                false,
            )
        })
        .collect::<Vec<_>>();
    let migrator = Migrator {
        migrations: list.into(),
        ..Migrator::DEFAULT
    };
    migrator.run(&mut conn).await.expect("apply migrations");
    conn
}

pub async fn exec(conn: &mut SqliteConnection, sql: &str) -> Result<u64, sqlx::Error> {
    sqlx::raw_sql(sql).execute(&mut *conn).await.map(|r| r.rows_affected())
}

/// Rows of `sql` as JSON objects keyed by column name (INTEGER / REAL / TEXT / NULL).
pub async fn select_json(conn: &mut SqliteConnection, sql: &str) -> Vec<serde_json::Value> {
    let rows = sqlx::query(sql).fetch_all(&mut *conn).await.expect(sql);
    rows.iter()
        .map(|row| {
            let mut obj = serde_json::Map::new();
            for (i, col) in row.columns().iter().enumerate() {
                let raw = row.try_get_raw(i).expect("raw value");
                let value = if raw.is_null() {
                    serde_json::Value::Null
                } else {
                    match raw.type_info().name() {
                        "INTEGER" => row.get::<i64, _>(i).into(),
                        "REAL" => row.get::<f64, _>(i).into(),
                        _ => row.get::<String, _>(i).into(),
                    }
                };
                obj.insert(col.name().to_string(), value);
            }
            serde_json::Value::Object(obj)
        })
        .collect()
}
