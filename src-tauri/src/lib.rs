use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../migrations/0001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "audit_triggers",
            sql: include_str!("../migrations/0002_audit_triggers.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "operator_context",
            sql: include_str!("../migrations/0003_operator_context.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "immutability_guards",
            sql: include_str!("../migrations/0004_immutability_guards.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "protein_percent_guard",
            sql: include_str!("../migrations/0005_protein_percent_guard.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:vessel_assistant.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
