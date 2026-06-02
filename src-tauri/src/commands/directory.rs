use crate::diff::directory::{diff_directories, DirectoryDiffResult};

#[tauri::command]
pub async fn diff_directories_command(
    left_path: String,
    right_path: String,
) -> Result<DirectoryDiffResult, String> {
    Ok(diff_directories(&left_path, &right_path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    fn write_file(dir: &TempDir, path: &str, content: &str) {
        let full_path = dir.path().join(path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut f = fs::File::create(&full_path).unwrap();
        write!(f, "{}", content).unwrap();
    }

    #[tokio::test]
    async fn test_directory_command_identical() {
        let left = TempDir::new().unwrap();
        let right = TempDir::new().unwrap();
        write_file(&left, "a.txt", "hello");
        write_file(&right, "a.txt", "hello");

        let result = diff_directories_command(
            left.path().to_str().unwrap().into(),
            right.path().to_str().unwrap().into(),
        )
        .await
        .unwrap();

        assert_eq!(result.added, 0);
        assert_eq!(result.removed, 0);
        assert_eq!(result.modified, 0);
    }

    #[tokio::test]
    async fn test_directory_command_with_changes() {
        let left = TempDir::new().unwrap();
        let right = TempDir::new().unwrap();
        write_file(&left, "a.txt", "hello");
        write_file(&right, "a.txt", "world");
        write_file(&right, "b.txt", "new");

        let result = diff_directories_command(
            left.path().to_str().unwrap().into(),
            right.path().to_str().unwrap().into(),
        )
        .await
        .unwrap();

        assert_eq!(result.added, 1);
        assert_eq!(result.modified, 1);
        assert_eq!(result.removed, 0);
    }

    #[tokio::test]
    async fn test_directory_command_nonexistent() {
        let result = diff_directories_command(
            "/nonexistent/left".into(),
            "/nonexistent/right".into(),
        )
        .await
        .unwrap();

        assert_eq!(result.left_total, 0);
    }
}
