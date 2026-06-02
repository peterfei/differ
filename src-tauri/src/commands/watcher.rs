use crate::fs::watcher::{start_watching, stop_watching, WatcherState};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn watch_files(
    app: AppHandle,
    state: State<'_, WatcherState>,
    paths: Vec<String>,
) -> Result<(), String> {
    start_watching(&state, app, paths)
}

#[tauri::command]
pub async fn unwatch_files(state: State<'_, WatcherState>) -> Result<(), String> {
    stop_watching(&state)
}
