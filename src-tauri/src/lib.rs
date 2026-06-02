pub mod commands;
pub mod diff;
pub mod fs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::diff::diff_files,
            commands::diff::diff_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
