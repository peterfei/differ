use crate::diff::merge_engine::{three_way_merge, MergeResult};

#[tauri::command]
pub async fn merge_files(
    base_path: String,
    left_path: String,
    right_path: String,
) -> Result<MergeResult, String> {
    eprintln!("[merge_files] base_path={}", base_path);
    eprintln!("[merge_files] left_path={}", left_path);
    eprintln!("[merge_files] right_path={}", right_path);

    let base = tokio::fs::read_to_string(&base_path)
        .await
        .map_err(|e| {
            eprintln!("[merge_files] ERROR reading base: {}", e);
            format!("读取 base 文件失败: {}", e)
        })?;
    let left = tokio::fs::read_to_string(&left_path)
        .await
        .map_err(|e| {
            eprintln!("[merge_files] ERROR reading left: {}", e);
            format!("读取 left 文件失败: {}", e)
        })?;
    let right = tokio::fs::read_to_string(&right_path)
        .await
        .map_err(|e| {
            eprintln!("[merge_files] ERROR reading right: {}", e);
            format!("读取 right 文件失败: {}", e)
        })?;

    eprintln!("[merge_files] base={}bytes, left={}bytes, right={}bytes",
        base.len(), left.len(), right.len());

    let result = three_way_merge(&base, &left, &right);

    eprintln!("[merge_files] merged_text={}bytes, has_conflicts={}, conflicts={}",
        result.merged_text.len(), result.has_conflicts, result.conflicts.len());

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
