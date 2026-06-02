use crate::diff::{
    syntax_diff::{detect_language, enhance_with_syntax, Language},
    text_diff, DiffOptions, DiffResult,
};

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

/// Diff two files with syntax-aware hunk regrouping.
/// Language is auto-detected from file extension.
#[tauri::command]
pub async fn diff_files_syntax(
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

    // Auto-detect language from the right file path (or left as fallback)
    let lang = detect_language(&right_path)
        .or_else(|| detect_language(&left_path));

    let result = text_diff(&left, &right, &opts);
    Ok(enhance_with_syntax(result, &left, &right, lang))
}

/// Diff two text strings with syntax-aware hunk regrouping.
/// `language` is an optional language name (e.g. "Rust", "JavaScript", "Python").
/// If omitted or unrecognized, falls back to line-level diff.
#[tauri::command]
pub async fn diff_text_syntax(
    left_text: String,
    right_text: String,
    language: Option<String>,
    options: Option<DiffOptions>,
) -> DiffResult {
    let opts = options.unwrap_or_default();

    let lang = language.as_deref().and_then(|s| s.parse::<Language>().ok());

    let result = text_diff(&left_text, &right_text, &opts);
    enhance_with_syntax(result, &left_text, &right_text, lang)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diff::DiffAlgorithm;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn diff_text_command_basic() {
        let result = diff_text("hello\n".into(), "world\n".into(), None).await;
        assert!(!result.hunks.is_empty());
        assert_eq!(result.left_lines, 1);
        assert_eq!(result.right_lines, 1);
    }

    #[tokio::test]
    async fn diff_text_command_identical() {
        let result = diff_text("same\ncontent\n".into(), "same\ncontent\n".into(), None).await;
        assert!(result.hunks.is_empty());
    }

    #[tokio::test]
    async fn diff_text_command_with_options() {
        let opts = Some(DiffOptions {
            algorithm: DiffAlgorithm::Patience,
            context_lines: 5,
            ignore_whitespace: false,
            ignore_case: false,
        });
        let result = diff_text("a\nb\n".into(), "a\nc\n".into(), opts).await;
        assert!(!result.hunks.is_empty());
    }

    #[tokio::test]
    async fn diff_files_command_success() {
        let mut left_file = NamedTempFile::new().unwrap();
        let mut right_file = NamedTempFile::new().unwrap();
        write!(left_file, "line1\nline2\nline3\n").unwrap();
        write!(right_file, "line1\nmodified\nline3\n").unwrap();

        let result = diff_files(
            left_file.path().to_str().unwrap().into(),
            right_file.path().to_str().unwrap().into(),
            None,
        )
        .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert!(!result.hunks.is_empty());
    }

    #[tokio::test]
    async fn diff_files_command_not_found() {
        let result = diff_files(
            "/nonexistent/left.txt".into(),
            "/nonexistent/right.txt".into(),
            None,
        )
        .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("读取文件失败"));
    }

    #[tokio::test]
    async fn diff_files_command_empty_files() {
        let left_file = NamedTempFile::new().unwrap();
        let right_file = NamedTempFile::new().unwrap();

        let result = diff_files(
            left_file.path().to_str().unwrap().into(),
            right_file.path().to_str().unwrap().into(),
            None,
        )
        .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert!(result.hunks.is_empty());
    }

    #[tokio::test]
    async fn diff_files_command_large_files() {
        let mut left_file = NamedTempFile::new().unwrap();
        let mut right_file = NamedTempFile::new().unwrap();
        let left_content: String = (0..500).map(|i| format!("line_{}\n", i)).collect();
        let right_content: String = (0..500)
            .map(|i| {
                if i % 5 == 0 {
                    format!("line_{}_changed\n", i)
                } else {
                    format!("line_{}\n", i)
                }
            })
            .collect();
        write!(left_file, "{}", left_content).unwrap();
        write!(right_file, "{}", right_content).unwrap();

        let result = diff_files(
            left_file.path().to_str().unwrap().into(),
            right_file.path().to_str().unwrap().into(),
            None,
        )
        .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result.left_lines, 500);
        assert_eq!(result.right_lines, 500);
    }
}
