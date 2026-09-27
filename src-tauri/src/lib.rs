pub mod batch;
mod commands;

use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![
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
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::LogDir {
                        file_name: Some("vessel-assistant".into()),
                    }),
                    Target::new(TargetKind::Stdout),
                ])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:vessel_assistant.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![commands::execute_batch]);

    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("panic: {info}");
        default_hook(info);
    }));

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
