use crate::diff::text_diff::{DiffOptions, DiffResult};
use crate::git;
use crate::git::diff::ConflictContent;

// ═══════════════════════════════════════════════════════════════════════
// git_cmd! — Declarative Tauri command generator
// ═══════════════════════════════════════════════════════════════════════
//
// Eliminates the repetitive `open_repo + map_err + call module` pattern.
//
// Syntax:
//   git_cmd!(git_status => git::status::get_status => Vec<GitStatusEntry>);
//   git_cmd!(git_log(path: Option<String>) => git::log::get_log => Vec<GitCommit>);
//
// Rules:
//   - First ident is the FULL function name (Tauri derives command name from it)
//   - => separates name/params from module function path
//   - => separates module function path from return type
//   - $func receives &Repository as first arg, then all params in order

macro_rules! git_cmd {
    // No additional params
    ($name:ident => $func:path => $ret:ty) => {
        #[tauri::command]
        pub async fn $name(repo_path: String) -> Result<$ret, String> {
            let repo = $crate::git::repo::open_repo(&repo_path)
                .map_err(|e| e.to_string())?;
            $func(&repo).map_err(|e| e.to_string())
        }
    };

    // One or more params
    ($name:ident ($($param:ident: $pty:ty),+ $(,)?) => $func:path => $ret:ty) => {
        #[tauri::command]
        pub async fn $name(
            repo_path: String,
            $($param: $pty),+
        ) -> Result<$ret, String> {
            let repo = $crate::git::repo::open_repo(&repo_path)
                .map_err(|e| e.to_string())?;
            $func(&repo, $($param),+).map_err(|e| e.to_string())
        }
    };
}

// ── Special commands (manual — don't fit open_repo + call_module pattern) ──

#[tauri::command]
pub async fn git_open(path: String) -> Result<git::repo::GitRepoInfo, String> {
    let repo = git::repo::open_repo(&path).map_err(|e| e.to_string())?;
    git::repo::get_repo_info(&repo).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_close(repo_path: String) -> Result<(), String> {
    git::repo::close_repo(&repo_path);
    Ok(())
}

#[tauri::command]
pub async fn git_discover(path: String) -> Result<String, String> {
    git::repo::discover_repo(&path).map_err(|e| e.to_string())
}

// ── Macro-generated commands ──
// 9 commands ≡ 9 lines. The macro generates the remaining ~54 lines.

git_cmd!(git_status => git::status::get_status => Vec<git::status::GitStatusEntry>);

git_cmd!(
    git_log(path: Option<String>, max_count: Option<u32>, skip: Option<u32>, branch: Option<String>)
    => git::log::get_log => Vec<git::log::GitCommit>
);

git_cmd!(
    git_branches(include_remote: Option<bool>)
    => git::branch::get_branches => Vec<git::branch::GitBranch>
);

git_cmd!(
    git_diff_commits(from: Option<String>, to: Option<String>, path: Option<String>, options: Option<DiffOptions>)
    => git::diff::diff_commits => DiffResult
);

git_cmd!(
    git_diff_branches(base: String, target: String, path: Option<String>, options: Option<DiffOptions>)
    => git::diff::diff_branches => DiffResult
);

git_cmd!(
    git_diff_unstaged(path: Option<String>, options: Option<DiffOptions>)
    => git::diff::diff_unstaged => DiffResult
);

git_cmd!(
    git_diff_staged(path: Option<String>, options: Option<DiffOptions>)
    => git::diff::diff_staged => DiffResult
);

git_cmd!(
    git_diff_working(path: Option<String>, options: Option<DiffOptions>)
    => git::diff::diff_working => DiffResult
);

git_cmd!(
    git_diff_syntax(old: Option<String>, new: Option<String>, path: Option<String>, options: Option<DiffOptions>)
    => git::diff::diff_syntax => DiffResult
);

git_cmd!(
    git_diff_conflict(path: String, options: Option<DiffOptions>)
    => git::diff::diff_conflict => DiffResult
);

git_cmd!(
    git_get_conflict_content(path: String)
    => git::diff::get_conflict_content => ConflictContent
);

git_cmd!(
    git_resolve_conflict(path: String, content: String)
    => git::diff::resolve_conflict => ()
);

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify generated command returns NotARepository for invalid paths.
    #[tokio::test]
    async fn test_generated_status_command_rejects_invalid_repo() {
        let result = git_status("/tmp/__differ_test_no_such_repo__".into()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("不是 Git 仓库") || err.contains("仓库"));
    }

    #[tokio::test]
    async fn test_generated_log_command_rejects_invalid_repo() {
        let result = git_log(
            "/tmp/__differ_test_no_such_repo__".into(),
            None, None, None, None,
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_generated_branches_command_rejects_invalid_repo() {
        let result = git_branches("/tmp/__differ_test_no_such_repo__".into(), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_generated_diff_commands_reject_invalid_repo() {
        let fake_path: String = "/tmp/__differ_test_no_such_repo__".into();

        let r1 = git_diff_commits(fake_path.clone(), None, None, None, None).await;
        assert!(r1.is_err());

        let r2 = git_diff_branches(fake_path.clone(), "main".into(), "feature".into(), None, None).await;
        assert!(r2.is_err());

        let r3 = git_diff_unstaged(fake_path.clone(), None, None).await;
        assert!(r3.is_err());

        let r4 = git_diff_staged(fake_path.clone(), None, None).await;
        assert!(r4.is_err());

        let r5 = git_diff_working(fake_path.clone(), None, None).await;
        assert!(r5.is_err());

        let r6 = git_diff_syntax(fake_path.clone(), None, None, None, None).await;
        assert!(r6.is_err());
    }

    #[tokio::test]
    async fn test_open_returns_not_a_repository() {
        let result = git_open("/tmp/__differ_test_no_such_repo__".into()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("不是 Git 仓库"));
    }

    #[tokio::test]
    async fn test_close_succeeds_without_panic() {
        let result = git_close("/tmp/__differ_test_no_such_repo__".into()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_open_valid_repo_succeeds() {
        let dir = tempfile::TempDir::new().unwrap();
        git2::Repository::init(dir.path()).unwrap();
        let sig = git2::Signature::now("test", "t@t.com").unwrap();
        let repo = git2::Repository::open(dir.path()).unwrap();
        let tree_id = {
            let mut index = repo.index().unwrap();
            let oid = index.write_tree().unwrap();
            repo.find_tree(oid).unwrap().id()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .unwrap();

        let result = git_open(dir.path().to_str().unwrap().to_string()).await;
        assert!(result.is_ok());
        let info = result.unwrap();
        assert!(matches!(info.current_branch.as_deref(), Some("main") | Some("master")));
    }

    #[tokio::test]
    async fn test_close_is_idempotent() {
        let r1 = git_close("/tmp/__does_not_exist__".into()).await;
        let r2 = git_close("/tmp/__does_not_exist__".into()).await;
        assert!(r1.is_ok());
        assert!(r2.is_ok());
    }
}
