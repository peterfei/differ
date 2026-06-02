use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// Holds an optional file watcher, guarded by a Mutex for thread safety.
#[derive(Default)]
pub struct WatcherState {
    pub inner: Mutex<Option<RecommendedWatcher>>,
}

/// Start watching a list of files. Emits `file-changed` events on modification.
pub fn start_watching(
    state: &WatcherState,
    app: AppHandle,
    paths: Vec<String>,
) -> Result<(), String> {
    // Drop any existing watcher first
    {
        let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                match event.kind {
                    EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_) => {
                        for path in &event.paths {
                            let path_str = path.to_string_lossy().to_string();
                            let _ = app.emit("file-changed", path_str);
                        }
                    }
                    _ => {}
                }
            }
        },
        notify::Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    for path in &paths {
        let p = Path::new(path);
        if p.exists() {
            watcher
                .watch(p, RecursiveMode::NonRecursive)
                .map_err(|e| format!("Failed to watch {}: {}", path, e))?;
        }
    }

    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = Some(watcher);

    Ok(())
}

/// Stop all file watching.
pub fn stop_watching(state: &WatcherState) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}
