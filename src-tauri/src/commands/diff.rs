use crate::diff::{text_diff, DiffOptions, DiffResult};

#[tauri::command]
pub async fn diff_files(
    left_path: String,
    right_path: String,
    options: Option<DiffOptions>,
) -> Result<DiffResult, String> {
    let opts = options.unwrap_or_default();
    let left = tokio::fs::read_to_string(&left_path)
        .await
        .map_err(|e| format!("读取文件失败: {}", e))?;
    let right = tokio::fs::read_to_string(&right_path)
        .await
        .map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(text_diff(&left, &right, &opts))
}

#[tauri::command]
pub async fn diff_text(
    left_text: String,
    right_text: String,
    options: Option<DiffOptions>,
) -> DiffResult {
    let opts = options.unwrap_or_default();
    text_diff(&left_text, &right_text, &opts)
}
