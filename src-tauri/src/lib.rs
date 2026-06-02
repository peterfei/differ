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
            commands::diff::diff_files_syntax,
            commands::diff::diff_text_syntax,
            commands::directory::diff_directories_command,
            commands::merge::merge_files,
            commands::merge::merge_text,
            commands::merge::save_text_to_file,
            commands::watcher::watch_files,
            commands::watcher::unwatch_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
