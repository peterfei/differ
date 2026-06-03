pub mod commands;
pub mod diff;
pub mod fs;
pub mod git;

use fs::watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(WatcherState::default())
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
            // Git commands (Phase 1: read-only)
            commands::git::git_open,
            commands::git::git_close,
            commands::git::git_status,
            commands::git::git_log,
            commands::git::git_branches,
            commands::git::git_diff_commits,
            commands::git::git_diff_branches,
            commands::git::git_diff_unstaged,
            commands::git::git_diff_staged,
            commands::git::git_diff_working,
            commands::git::git_diff_syntax,
            commands::git::git_discover,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
