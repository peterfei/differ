use crate::diff::merge_engine::{three_way_merge, MergeResult};

#[tauri::command]
pub async fn merge_files(
    base_path: String,
    left_path: String,
    right_path: String,
) -> Result<MergeResult, String> {
    let base = tokio::fs::read_to_string(&base_path)
        .await
        .map_err(|e| format!("读取 base 文件失败: {}", e))?;
    let left = tokio::fs::read_to_string(&left_path)
        .await
        .map_err(|e| format!("读取 left 文件失败: {}", e))?;
    let right = tokio::fs::read_to_string(&right_path)
        .await
        .map_err(|e| format!("读取 right 文件失败: {}", e))?;

    let result = three_way_merge(&base, &left, &right);

    Ok(result)
}

#[tauri::command]
pub fn merge_text(
    base_text: String,
    left_text: String,
    right_text: String,
) -> MergeResult {
    three_way_merge(&base_text, &left_text, &right_text)
}

#[tauri::command]
pub async fn save_text_to_file(
    path: String,
    text: String,
) -> Result<(), String> {
    tokio::fs::write(&path, &text)
        .await
        .map_err(|e| format!("保存文件失败: {}", e))
}
