pub mod commands;
pub mod diff;
pub mod fs;

use fs::watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(WatcherState::new())
        .invoke_handler(tauri::generate_handler![
            commands::diff::diff_files,
            commands::diff::diff_text,
            commands::directory::diff_directories_command,
            commands::watcher::watch_files,
            commands::watcher::unwatch_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
