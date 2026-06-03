use std::path::Path;

use git2::Repository;

use crate::git::GitError;

/// A single commit entry exposed to the frontend.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitCommit {
    pub id: String,
    pub short_id: String,
    pub message: String,
    pub summary: String,
    pub author: String,
    pub time: i64,
}

/// Helper: check whether a commit touches a given file path.
fn commit_touches_path(repo: &Repository, commit: &git2::Commit<'_>, path: &str) -> bool {
    // Root commit: check if file exists in tree
    if commit.parent_count() == 0 {
        return commit
            .tree()
            .ok()
            .and_then(|t| t.get_path(Path::new(path)).ok())
            .is_some();
    }

    // Non-root: diff commit tree with parent tree on the given path
    if let (Ok(parent), Ok(commit_tree)) = (commit.parent(0), commit.tree()) {
        if let Ok(parent_tree) = parent.tree() {
            let mut opts = git2::DiffOptions::new();
            opts.pathspec(path);
            if let Ok(diff) =
                repo.diff_tree_to_tree(Some(&parent_tree), Some(&commit_tree), Some(&mut opts))
            {
                return diff.deltas().len() > 0;
            }
        }
    }
    false
}

/// Build a `GitCommit` from a git2 commit.
fn convert_commit(commit: &git2::Commit<'_>) -> GitCommit {
    let id = commit.id().to_string();
    let short_id = id[..7.min(id.len())].to_string();
    let message = commit.message().unwrap_or("").to_string();
    let summary = message.lines().next().unwrap_or("").to_string();
    let author = commit.author().name().unwrap_or("unknown").to_string();
    let time = commit.time().seconds();
    GitCommit {
        id,
        short_id,
        message,
        summary,
        author,
        time,
    }
}

/// Get log (commit history) for a repository.
///
/// * `path` — if set, only show commits that touch this file
/// * `max_count` — max number of commits to return
/// * `skip` — number of matching commits to skip before returning
/// * `branch` — branch or ref to walk (None = HEAD)
pub fn get_log(
    repo: &Repository,
    path: Option<String>,
    max_count: Option<u32>,
    skip: Option<u32>,
    branch: Option<String>,
) -> Result<Vec<GitCommit>, GitError> {
    // Resolve starting point
    let target = if let Some(ref b) = branch {
        repo.revparse_single(b)?.id()
    } else {
        match repo.head() {
            Ok(head) => head
                .target()
                .ok_or_else(|| GitError::NotFound("HEAD has no target".into()))?,
            Err(_) => return Ok(Vec::new()), // No commits yet
        }
    };

    // Walk commits
    let mut revwalk = repo.revwalk()?;
    revwalk.push(target)?;
    revwalk.set_sorting(git2::Sort::TOPOLOGICAL)?;

    let skip_count = skip.unwrap_or(0) as usize;
    let limit = max_count.unwrap_or(u32::MAX) as usize;
    let mut results = Vec::new();
    let mut skipped = 0usize;

    for oid_result in revwalk {
        let oid = oid_result?;
        let commit = repo.find_commit(oid)?;

        // Path filter
        if let Some(ref p) = path {
            if !commit_touches_path(repo, &commit, p) {
                continue;
            }
        }

        // Skip filter (separate counter to avoid type inference issues)
        if skipped < skip_count {
            skipped += 1;
            continue;
        }

        // Limit
        if results.len() >= limit {
            break;
        }

        results.push(convert_commit(&commit));
    }

    Ok(results)
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Signature;
    use std::fs;
    use tempfile::TempDir;

    /// Helper: write a file, add to index, commit, drop tree handles.
    fn commit_file(
        repo: &Repository,
        sig: &Signature,
        path: &str,
        content: &str,
        msg: &str,
    ) {
        fs::write(repo.workdir().unwrap().join(path), content).unwrap();
        let tree_id = {
            let mut index = repo.index().unwrap();
            index.add_path(Path::new(path)).unwrap();
            index.write_tree().unwrap()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parent_refs: Vec<&git2::Commit<'_>> = parent.iter().collect();
        repo.commit(Some("HEAD"), sig, sig, msg, &tree, &parent_refs)
            .unwrap();
        drop(tree);
    }

    /// Helper: create a repo with N sequential commits on a single file.
    fn setup_commit_repo(n: usize) -> (TempDir, Repository) {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let sig = Signature::now("test", "t@t.com").unwrap();

        for i in 0..n {
            let content = format!("content_{}\nline2\nline3\n", i);
            commit_file(&repo, &sig, "file.txt", &content, &format!("commit {}", i));
        }
        (dir, repo)
    }

    // ── Tests ──

    #[test]
    fn empty_repo_returns_empty_log() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let result = get_log(&repo, None, None, None, None).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn log_returns_commits_in_reverse_order() {
        let (_dir, repo) = setup_commit_repo(3);
        let result = get_log(&repo, None, None, None, None).unwrap();
        assert_eq!(result.len(), 3);
        // Newest first: "commit 2", "commit 1", "commit 0"
        assert!(result[0].summary.contains("commit 2"));
        assert!(result[1].summary.contains("commit 1"));
        assert!(result[2].summary.contains("commit 0"));
    }

    #[test]
    fn log_max_count_limits_results() {
        let (_dir, repo) = setup_commit_repo(5);
        let result = get_log(&repo, None, Some(2), None, None).unwrap();
        assert_eq!(result.len(), 2);
        assert!(result[0].summary.contains("commit 4"));
        assert!(result[1].summary.contains("commit 3"));
    }

    #[test]
    fn log_skip_skips_newest_commits() {
        let (_dir, repo) = setup_commit_repo(5);
        let result = get_log(&repo, None, None, Some(2), None).unwrap();
        assert_eq!(result.len(), 3);
        assert!(result[0].summary.contains("commit 2"));
    }

    #[test]
    fn log_skip_with_max_count() {
        let (_dir, repo) = setup_commit_repo(5);
        let result = get_log(&repo, None, Some(2), Some(2), None).unwrap();
        assert_eq!(result.len(), 2);
        assert!(result[0].summary.contains("commit 2"));
        assert!(result[1].summary.contains("commit 1"));
    }

    #[test]
    fn log_branch_filter_shows_branch_commits() {
        let (_dir, repo) = setup_commit_repo(2);
        let sig = Signature::now("test", "t@t.com").unwrap();

        // Create feature branch at current tip
        let head_commit = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch("feature", &head_commit, false).unwrap();
        drop(head_commit);

        // Make another commit on master
        commit_file(&repo, &sig, "file.txt", "master content\n", "master commit");

        // Log from "feature" should show only the 2 base commits
        let result = get_log(&repo, None, None, None, Some("feature".into())).unwrap();
        assert_eq!(result.len(), 2, "feature should have 2 base commits");
        // Log from "master" should show all 3
        let result_master = get_log(&repo, None, None, None, Some("master".into())).unwrap();
        assert_eq!(result_master.len(), 3, "master should have all 3 commits");
    }

    #[test]
    fn log_path_filter_shows_only_touching_commits() {
        let (_dir, repo) = setup_commit_repo(2);
        let sig = Signature::now("test", "t@t.com").unwrap();

        // Create another file and commit it
        commit_file(&repo, &sig, "other.txt", "other\n", "other file change");

        // Now filter by other.txt — should only see the "other file change" commit
        let result = get_log(&repo, Some("other.txt".into()), None, None, None).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].summary, "other file change");
    }

    #[test]
    fn log_commit_has_correct_fields() {
        let (_dir, repo) = setup_commit_repo(1);
        let result = get_log(&repo, None, None, None, None).unwrap();
        assert_eq!(result.len(), 1);
        let c = &result[0];
        assert_eq!(c.short_id.len(), 7);
        assert_eq!(c.summary, "commit 0");
        assert_eq!(c.author, "test");
        assert!(c.time > 0);
        assert!(!c.id.is_empty());
    }

    #[test]
    fn log_invalid_branch_returns_error() {
        let (_dir, repo) = setup_commit_repo(1);
        let result = get_log(&repo, None, None, None, Some("no_such_branch".into()));
        assert!(result.is_err());
    }
}
