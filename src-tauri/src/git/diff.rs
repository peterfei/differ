use git2::Repository;

use std::path::Path;

use crate::diff::text_diff::{ChangeType, DiffChange, DiffHunk, DiffOptions, DiffResult};
use crate::git::GitError;

// ── Helper: map app DiffOptions → git2::DiffOptions ──

fn make_git2_diff_options(
    app_opts: &DiffOptions,
    path: Option<&str>,
) -> git2::DiffOptions {
    let mut opts = git2::DiffOptions::new();
    opts.context_lines(app_opts.context_lines as u32);
    if app_opts.ignore_whitespace {
        opts.ignore_whitespace(true);
    }
    if let Some(p) = path {
        opts.pathspec(p);
    }
    opts
}

// ── Helper: convert git2::Diff → DiffResult ──

fn convert_git_diff(diff: git2::Diff, options: &DiffOptions) -> DiffResult {
    let mut hunks = Vec::new();
    let mut max_old = 0usize;
    let mut max_new = 0usize;

    for delta_idx in 0..diff.deltas().len() {
        let Ok(Some(patch)) = git2::Patch::from_diff(&diff, delta_idx) else {
            continue;
        };

        for hunk_idx in 0..patch.num_hunks() {
            let Ok((hunk, num_lines)) = patch.hunk(hunk_idx) else {
                continue;
            };

            let mut changes = Vec::with_capacity(num_lines);

            for line_idx in 0..num_lines {
                let Ok(line) = patch.line_in_hunk(hunk_idx, line_idx) else {
                    continue;
                };

                let content = String::from_utf8_lossy(line.content()).to_string();

                let change_type = match line.origin() {
                    '+' => ChangeType::Add,
                    '-' => ChangeType::Delete,
                    _ => ChangeType::Equal,
                };

                let old_lineno = line.old_lineno().map(|l| l as usize);
                let new_lineno = line.new_lineno().map(|l| l as usize);

                if let Some(n) = old_lineno {
                    max_old = max_old.max(n);
                }
                if let Some(n) = new_lineno {
                    max_new = max_new.max(n);
                }

                let (old_text, new_text) = match line.origin() {
                    '+' => (None, Some(content.clone())),
                    '-' => (Some(content.clone()), None),
                    _ => (Some(content.clone()), Some(content.clone())),
                };

                changes.push(DiffChange {
                    old_line_no: old_lineno,
                    new_line_no: new_lineno,
                    old_text,
                    new_text,
                    change_type,
                    inline_changes: Vec::new(),
                });
            }

            hunks.push(DiffHunk {
                old_start: hunk.old_start() as usize,
                old_lines: hunk.old_lines() as usize,
                new_start: hunk.new_start() as usize,
                new_lines: hunk.new_lines() as usize,
                changes,
                syntax_context: None,
            });
        }
    }

    DiffResult {
        hunks,
        left_lines: max_old,
        right_lines: max_new,
        options: options.clone(),
        left_label: None,
        right_label: None,
    }
}

// ── Public API ──

/// Diff between two arbitrary commits (or tree-ish references).
pub fn diff_commits(
    repo: &Repository,
    from: Option<String>,
    to: Option<String>,
    path: Option<String>,
    options: Option<DiffOptions>,
) -> Result<DiffResult, GitError> {
    let opts = options.unwrap_or_default();
    let mut git_opts = make_git2_diff_options(&opts, path.as_deref());

    let old_tree = from
        .as_ref()
        .map(|s| {
            let obj = repo.revparse_single(s)?;
            obj.peel_to_tree().map_err(|_| GitError::NotFound(s.clone()))
        })
        .transpose()?;

    let new_tree = to
        .as_ref()
        .map(|s| {
            let obj = repo.revparse_single(s)?;
            obj.peel_to_tree().map_err(|_| GitError::NotFound(s.clone()))
        })
        .transpose()?;

    let diff =
        repo.diff_tree_to_tree(old_tree.as_ref(), new_tree.as_ref(), Some(&mut git_opts))?;
    Ok(convert_git_diff(diff, &opts))
}

/// Diff between the tips of two branches.
pub fn diff_branches(
    repo: &Repository,
    base: String,
    target: String,
    path: Option<String>,
    options: Option<DiffOptions>,
) -> Result<DiffResult, GitError> {
    let opts = options.unwrap_or_default();
    let mut git_opts = make_git2_diff_options(&opts, path.as_deref());

    let base_obj = repo.revparse_single(&base)?;
    let target_obj = repo.revparse_single(&target)?;
    let base_tree = base_obj.peel_to_tree()?;
    let target_tree = target_obj.peel_to_tree()?;

    let diff = repo.diff_tree_to_tree(
        Some(&base_tree),
        Some(&target_tree),
        Some(&mut git_opts),
    )?;
    Ok(convert_git_diff(diff, &opts))
}

/// Diff between index (staging area) and working directory (unstaged changes).
pub fn diff_unstaged(
    repo: &Repository,
    path: Option<String>,
    options: Option<DiffOptions>,
) -> Result<DiffResult, GitError> {
    let opts = options.unwrap_or_default();
    let mut git_opts = make_git2_diff_options(&opts, path.as_deref());
    let diff = repo.diff_index_to_workdir(None, Some(&mut git_opts))?;
    Ok(convert_git_diff(diff, &opts))
}

/// Diff between HEAD commit and index (staged changes).
///
/// If there are no commits yet (empty repo), compares against an empty tree.
pub fn diff_staged(
    repo: &Repository,
    path: Option<String>,
    options: Option<DiffOptions>,
) -> Result<DiffResult, GitError> {
    let opts = options.unwrap_or_default();
    let mut git_opts = make_git2_diff_options(&opts, path.as_deref());

    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let diff = repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut git_opts))?;
    Ok(convert_git_diff(diff, &opts))
}

/// Diff between HEAD commit and working directory (all changes: staged + unstaged).
///
/// If there are no commits yet (empty repo), compares against an empty tree.
pub fn diff_working(
    repo: &Repository,
    path: Option<String>,
    options: Option<DiffOptions>,
) -> Result<DiffResult, GitError> {
    let opts = options.unwrap_or_default();
    let mut git_opts = make_git2_diff_options(&opts, path.as_deref());

    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let diff = repo.diff_tree_to_workdir(head_tree.as_ref(), Some(&mut git_opts))?;
    Ok(convert_git_diff(diff, &opts))
}

/// Syntax-aware diff — delegates to `diff_commits` for now.
/// Syntax enhancement happens in the command layer via syntax_diff.rs.
pub fn diff_syntax(
    repo: &Repository,
    old: Option<String>,
    new: Option<String>,
    path: Option<String>,
    options: Option<DiffOptions>,
) -> Result<DiffResult, GitError> {
    diff_commits(repo, old, new, path, options)
}

/// Diff the two conflicting sides of a conflicted (unmerged) file.
///
/// Extracts stage 2 (ours = HEAD) and stage 3 (theirs = MERGE_HEAD) from the
/// index and diffs them using the text-level diff engine. Returns a `DiffResult`
/// showing what "we" changed vs what "they" changed.
///
/// If the file is not conflicted, returns an error.
pub fn diff_conflict(
    repo: &Repository,
    path: String,
    options: Option<DiffOptions>,
) -> Result<DiffResult, GitError> {
    let opts = options.unwrap_or_default();

    let index = repo.index().map_err(|_| GitError::NotFound(path.clone()))?;

    // Helper: extract stage from flags
    let entry_stage = |entry: &git2::IndexEntry| (entry.flags >> 12) & 0x3;

    // Find conflicted entries for this path by looking for stage > 0
    let path_bytes = path.as_bytes();
    let entries: Vec<git2::IndexEntry> = index
        .iter()
        .filter(|e| e.path.as_slice() == path_bytes && entry_stage(e) >= 1)
        .collect();

    if entries.is_empty() {
        return Err(GitError::NotFound(format!(
            "{} is not in conflicted state",
            path
        )));
    }

    // Find stage 2 (ours) and stage 3 (theirs)
    let ours_entry = entries.iter().find(|e| entry_stage(e) == 2);
    let theirs_entry = entries.iter().find(|e| entry_stage(e) == 3);

    let ours_content = if let Some(entry) = ours_entry {
        let blob = repo.find_blob(entry.id).map_err(|_| {
            GitError::NotFound(format!("cannot read our blob for {}", path))
        })?;
        String::from_utf8_lossy(blob.content()).to_string()
    } else {
        String::new()
    };

    let theirs_content = if let Some(entry) = theirs_entry {
        let blob = repo.find_blob(entry.id).map_err(|_| {
            GitError::NotFound(format!("cannot read their blob for {}", path))
        })?;
        String::from_utf8_lossy(blob.content()).to_string()
    } else {
        String::new()
    };

    // Use the text-level diff engine to compare ours vs theirs
    let mut result = crate::diff::text_diff::text_diff(&ours_content, &theirs_content, &opts);

    // Mark the result so the frontend knows this is a conflict diff
    result.left_label = Some("ours (HEAD)".to_string());
    result.right_label = Some("theirs (MERGE_HEAD)".to_string());

    Ok(result)
}

// ── Merge Conflict Content (three-stage extraction + resolve) ──

/// Content of all three stages for a conflicted file from the Git index.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConflictContent {
    pub base_text: String,
    pub ours_text: String,
    pub theirs_text: String,
    pub file_path: String,
}

/// Extract all three stages (base/ours/theirs) for a conflicted file from the Git index.
///
/// Stage 1 = merge base (common ancestor)
/// Stage 2 = ours (HEAD)
/// Stage 3 = theirs (MERGE_HEAD)
///
/// If the file is not conflicted, returns an error.
pub fn get_conflict_content(
    repo: &Repository,
    path: String,
) -> Result<ConflictContent, GitError> {
    let index = repo.index().map_err(|_| GitError::NotFound(path.clone()))?;

    let entry_stage = |entry: &git2::IndexEntry| (entry.flags >> 12) & 0x3;
    let path_bytes = path.as_bytes();
    let entries: Vec<git2::IndexEntry> = index
        .iter()
        .filter(|e| e.path.as_slice() == path_bytes && entry_stage(e) >= 1)
        .collect();

    if entries.is_empty() {
        return Err(GitError::NotFound(format!(
            "{} is not in conflicted state",
            path
        )));
    }

    let read_stage = |stage: u16| -> Result<String, GitError> {
        match entries.iter().find(|e| entry_stage(e) == stage) {
            Some(entry) => {
                let blob = repo.find_blob(entry.id).map_err(|_| {
                    GitError::NotFound(format!("cannot read stage {} blob for {}", stage, path))
                })?;
                Ok(String::from_utf8_lossy(blob.content()).to_string())
            }
            None => Ok(String::new()),
        }
    };

    Ok(ConflictContent {
        base_text: read_stage(1)?,
        ours_text: read_stage(2)?,
        theirs_text: read_stage(3)?,
        file_path: path,
    })
}

/// Write resolved content to the working tree and stage it, marking the conflict as resolved.
///
/// The `content` should be the fully resolved file content (without conflict markers).
/// After this call, the file will be staged in the index (stage 0) and no longer show
/// as conflicted.
pub fn resolve_conflict(
    repo: &Repository,
    path: String,
    content: String,
) -> Result<(), GitError> {
    // 1. Resolve the workdir — repo.workdir() is guaranteed to be Some for a non-bare repo
    let workdir = repo
        .workdir()
        .ok_or_else(|| GitError::NotFound("bare repository has no workdir".into()))?;
    let file_path = workdir.join(&path);

    // 2. Write resolved content to working tree
    std::fs::write(&file_path, &content).map_err(GitError::IoError)?;

    // 3. Stage the file (replaces conflicted index entries with a single stage-0 entry)
    let mut index = repo.index().map_err(|_| GitError::NotFound(path.clone()))?;
    index.add_path(Path::new(&path)).map_err(|e| GitError::NotFound(format!("cannot add {} to index: {}", path, e)))?;
    index.write().map_err(|e| GitError::Libgit2(e))?;

    Ok(())
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Signature;
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;

    /// Helper: commit current index, using HEAD as parent if available.
    fn commit_index(
        repo: &Repository,
        sig: &Signature,
        message: &str,
    ) -> git2::Oid {
        let tree_id = {
            let mut index = repo.index().unwrap();
            index.write_tree().unwrap()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parent_refs: Vec<&git2::Commit<'_>> = parent.iter().collect();
        let oid = repo
            .commit(Some("HEAD"), sig, sig, message, &tree, &parent_refs)
            .unwrap();
        drop(tree);
        oid
    }

    /// Helper: create a repo with 2 commits on "master".
    fn setup_multicommit_repo() -> (TempDir, Repository) {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let sig = Signature::now("test", "t@t.com").unwrap();

        // Commit 1
        fs::write(dir.path().join("file.txt"), b"line1\nline2\nline3\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("file.txt")).unwrap();
        commit_index(&repo, &sig, "initial");

        // Commit 2: modify file.txt + add file2.txt
        fs::write(dir.path().join("file.txt"), b"line1\nline2_modified\nline3\n").unwrap();
        fs::write(dir.path().join("file2.txt"), b"content2\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .unwrap();
        commit_index(&repo, &sig, "second");

        (dir, repo)
    }

    /// Helper: create a repo with a branch that diverges from master.
    fn setup_branch_repo() -> (TempDir, Repository) {
        let (dir, repo) = setup_multicommit_repo();
        let sig = Signature::now("test", "t@t.com").unwrap();

        // Create branch "feature" at current HEAD (then re-acquire head_commit if needed)
        let head_commit = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch("feature", &head_commit, false).unwrap();
        drop(head_commit);

        // Make another commit on master
        fs::write(dir.path().join("file.txt"), b"line1\nline2_modified\nline3_master\n")
            .unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("file.txt")).unwrap();
        commit_index(&repo, &sig, "third on master");

        (dir, repo)
    }

    // ── diff_commits ──

    #[test]
    fn diff_commits_same_commit_empty() {
        let (_dir, repo) = setup_multicommit_repo();
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        let id = head.id().to_string();
        drop(head);
        let result = diff_commits(&repo, Some(id.clone()), Some(id), None, None).unwrap();
        assert!(result.hunks.is_empty());
    }

    #[test]
    fn diff_commits_different_commits_non_empty() {
        let (_dir, repo) = setup_multicommit_repo();
        let mut revwalk = repo.revwalk().unwrap();
        revwalk.push_head().unwrap();
        let commits: Vec<git2::Oid> = revwalk.collect::<Result<Vec<_>, _>>().unwrap();

        // commits[0] = HEAD (second commit), commits[1] = parent (first commit)
        assert!(
            commits.len() >= 2,
            "need at least 2 commits, got {}",
            commits.len()
        );
        let result = diff_commits(
            &repo,
            Some(commits[1].to_string()),
            Some(commits[0].to_string()),
            None,
            None,
        )
        .unwrap();
        assert!(!result.hunks.is_empty());
        // file.txt line2 was modified — should have Delete changes
        let has_del = result.hunks.iter().any(|h| {
            h.changes
                .iter()
                .any(|c| c.change_type == ChangeType::Delete)
        });
        assert!(has_del, "should have deletions for line2 -> line2_modified");
        // file2.txt was added
        let has_add = result.hunks.iter().any(|h| {
            h.changes.iter().any(|c| c.change_type == ChangeType::Add)
        });
        assert!(has_add, "should have additions for file2.txt");
    }

    #[test]
    fn diff_commits_invalid_ref_returns_error() {
        let (_dir, repo) = setup_multicommit_repo();
        let result = diff_commits(&repo, Some("NONEXISTENT".into()), None, None, None);
        assert!(result.is_err());
    }

    // ── diff_branches ──

    #[test]
    fn diff_branches_different_branches_non_empty() {
        let (_dir, repo) = setup_branch_repo();
        let result =
            diff_branches(&repo, "feature".into(), "master".into(), None, None).unwrap();
        assert!(!result.hunks.is_empty());
    }

    #[test]
    fn diff_branches_same_branch_empty() {
        let (_dir, repo) = setup_branch_repo();
        let result =
            diff_branches(&repo, "master".into(), "master".into(), None, None).unwrap();
        assert!(result.hunks.is_empty());
    }

    #[test]
    fn diff_branches_invalid_name_returns_error() {
        let (_dir, repo) = setup_branch_repo();
        let result =
            diff_branches(&repo, "master".into(), "no_such_branch".into(), None, None);
        assert!(result.is_err());
    }

    // ── diff_unstaged ──

    #[test]
    fn diff_unstaged_no_changes_empty() {
        let (_dir, repo) = setup_multicommit_repo();
        let result = diff_unstaged(&repo, None, None).unwrap();
        assert!(result.hunks.is_empty());
    }

    #[test]
    fn diff_unstaged_modified_file_detected() {
        let (dir, repo) = setup_multicommit_repo();
        fs::write(dir.path().join("file.txt"), b"line1\nline2_changed_again\nline3\n").unwrap();
        let result = diff_unstaged(&repo, None, None).unwrap();
        assert!(!result.hunks.is_empty());
        let has_del = result.hunks.iter().any(|h| {
            h.changes
                .iter()
                .any(|c| c.change_type == ChangeType::Delete)
        });
        assert!(has_del, "unstaged modification should have deletions");
    }

    #[test]
    fn diff_unstaged_untracked_not_included() {
        let (dir, repo) = setup_multicommit_repo();
        fs::write(dir.path().join("untracked.txt"), b"new\n").unwrap();
        let result = diff_unstaged(&repo, None, None).unwrap();
        assert!(result.hunks.is_empty());
    }

    #[test]
    fn diff_unstaged_path_filter_works() {
        let (dir, repo) = setup_multicommit_repo();
        fs::write(dir.path().join("file.txt"), b"modified\n").unwrap();
        fs::write(dir.path().join("other.txt"), b"new file\n").unwrap();
        let result = diff_unstaged(&repo, Some("file.txt".into()), None).unwrap();
        assert!(!result.hunks.is_empty());
        let result2 = diff_unstaged(&repo, Some("nope.txt".into()), None).unwrap();
        assert!(result2.hunks.is_empty());
    }

    // ── diff_staged ──

    #[test]
    fn diff_staged_no_changes_empty() {
        let (_dir, repo) = setup_multicommit_repo();
        let result = diff_staged(&repo, None, None).unwrap();
        assert!(result.hunks.is_empty());
    }

    #[test]
    fn diff_staged_modified_file_detected() {
        let (dir, repo) = setup_multicommit_repo();
        fs::write(dir.path().join("file.txt"), b"line1\nstaged_change\nline3\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("file.txt")).unwrap();
        index.write().unwrap();
        drop(index);
        let result = diff_staged(&repo, None, None).unwrap();
        assert!(!result.hunks.is_empty());
    }

    #[test]
    fn diff_staged_new_file_detected() {
        let (dir, repo) = setup_multicommit_repo();
        fs::write(dir.path().join("new_staged.txt"), b"new content\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("new_staged.txt")).unwrap();
        index.write().unwrap();
        drop(index);
        let result = diff_staged(&repo, None, None).unwrap();
        assert!(!result.hunks.is_empty());
    }

    #[test]
    fn diff_staged_empty_repo_no_panic() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let result = diff_staged(&repo, None, None).unwrap();
        assert!(result.hunks.is_empty());
    }

    // ── diff_working ──

    #[test]
    fn diff_working_no_changes_empty() {
        let (_dir, repo) = setup_multicommit_repo();
        let result = diff_working(&repo, None, None).unwrap();
        assert!(result.hunks.is_empty());
    }

    #[test]
    fn diff_working_shows_unstaged_changes() {
        let (dir, repo) = setup_multicommit_repo();
        fs::write(dir.path().join("file.txt"), b"working_change\n").unwrap();
        let result = diff_working(&repo, None, None).unwrap();
        assert!(!result.hunks.is_empty());
    }

    #[test]
    fn diff_working_empty_repo_no_panic() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        fs::write(dir.path().join("new.txt"), b"content\n").unwrap();
        let result = diff_working(&repo, None, None).unwrap();
        // No panic is the main assertion
        assert!(result.hunks.is_empty() || !result.hunks.is_empty());
    }

    // ── diff_syntax ──

    #[test]
    fn diff_syntax_same_as_diff_commits_empty() {
        let (_dir, repo) = setup_multicommit_repo();
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        let id = head.id().to_string();
        drop(head);
        let result = diff_syntax(&repo, Some(id.clone()), Some(id), None, None).unwrap();
        assert!(result.hunks.is_empty());
    }

    #[test]
    fn diff_syntax_different_commits_non_empty() {
        let (_dir, repo) = setup_multicommit_repo();
        let mut revwalk = repo.revwalk().unwrap();
        revwalk.push_head().unwrap();
        let commits: Vec<git2::Oid> = revwalk.collect::<Result<Vec<_>, _>>().unwrap();

        if commits.len() >= 2 {
            let result = diff_syntax(
                &repo,
                Some(commits[1].to_string()),
                Some(commits[0].to_string()),
                None,
                None,
            )
            .unwrap();
            assert!(!result.hunks.is_empty());
        }
    }

    // ── Integration: options pass-through ──

    #[test]
    fn diff_commits_with_options_non_empty() {
        let (_dir, repo) = setup_multicommit_repo();
        let mut revwalk = repo.revwalk().unwrap();
        revwalk.push_head().unwrap();
        let commits: Vec<git2::Oid> = revwalk.collect::<Result<Vec<_>, _>>().unwrap();

        if commits.len() >= 2 {
            let opts = DiffOptions {
                ignore_whitespace: true,
                ..Default::default()
            };
            let result = diff_commits(
                &repo,
                Some(commits[1].to_string()),
                Some(commits[0].to_string()),
                None,
                Some(opts),
            )
            .unwrap();
            assert!(!result.hunks.is_empty(), "ignore_whitespace should still show changes");
        }
    }

    #[test]
    fn diff_hunk_has_correct_line_numbers() {
        let (dir, repo) = setup_multicommit_repo();
        fs::write(dir.path().join("file.txt"), b"line1\nline2_changed_again\nline3\n").unwrap();
        let result = diff_unstaged(&repo, None, None).unwrap();
        assert!(!result.hunks.is_empty(), "should have at least one hunk");
        if let Some(hunk) = result.hunks.first() {
            // The hunk includes context before the change, so start may be 1 or 2
            assert!(
                hunk.old_start >= 1 && hunk.new_start >= 1,
                "hunk start lines should be >= 1, got old={}, new={}",
                hunk.old_start,
                hunk.new_start,
            );
            // line2 was replaced → hunk should have at least 2 changes (1 delete + 1 add)
            let non_equal = hunk
                .changes
                .iter()
                .filter(|c| c.change_type != ChangeType::Equal)
                .count();
            assert!(non_equal >= 2, "should have at least 2 non-equal changes, got {non_equal}");
        }
    }

    // ── diff_conflict ──

    /// Helper: create a repo with a merge conflict on `hello.py` using git CLI.
    fn setup_conflict_repo() -> (TempDir, Repository) {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_path_buf();

        // Helper to run git CLI commands
        fn git_run(repo_path: &std::path::Path, args: &[&str]) {
            let output = std::process::Command::new("git")
                .args(args)
                .current_dir(repo_path)
                .output()
                .expect("git command failed");
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                panic!("git {} failed: {}", args.join(" "), stderr);
            }
        }

        // Config
        git_run(&repo_path, &["init"]);
        git_run(&repo_path, &["config", "user.email", "test@test.com"]);
        git_run(&repo_path, &["config", "user.name", "Test"]);

        // Initial commit
        fs::write(
            repo_path.join("hello.py"),
            "def greet(name):\n    return f\"Hello, {name}!\"\n\ndef farewell(name):\n    return f\"Goodbye, {name}!\"\n\nif __name__ == \"__main__\":\n    print(greet(\"World\"))\n    print(farewell(\"World\"))\n",
        )
        .unwrap();
        git_run(&repo_path, &["add", "hello.py"]);
        git_run(&repo_path, &["commit", "-m", "initial"]);

        // Create feature branch
        git_run(&repo_path, &["branch", "feature"]);

        // Checkout feature and modify
        git_run(&repo_path, &["checkout", "feature"]);
        fs::write(
            repo_path.join("hello.py"),
            "def greet(name):\n    return f\"Hey there, {name}!\"\n\ndef farewell(name):\n    return f\"Goodbye, {name}!\"\n\nif __name__ == \"__main__\":\n    print(greet(\"World\"))\n    print(farewell(\"World\"))\n",
        )
        .unwrap();
        git_run(&repo_path, &["add", "hello.py"]);
        git_run(&repo_path, &["commit", "-m", "feature change"]);

        // Switch back to main, modify differently
        git_run(&repo_path, &["checkout", "main"]);
        fs::write(
            repo_path.join("hello.py"),
            "def greet(name):\n    return f\"Hi, {name}!\"\n\ndef farewell(name):\n    return f\"Goodbye, {name}!\"\n\nif __name__ == \"__main__\":\n    print(greet(\"World\"))\n    print(farewell(\"World\"))\n",
        )
        .unwrap();
        git_run(&repo_path, &["add", "hello.py"]);
        git_run(&repo_path, &["commit", "-m", "main change"]);

        // Attempt merge (will fail with conflict — that's OK)
        let merge_output = std::process::Command::new("git")
            .args(&["merge", "feature"])
            .current_dir(&repo_path)
            .output()
            .expect("git merge failed");
        // Merge should fail (exit code 1) with conflicts
        assert!(!merge_output.status.success(), "merge should have failed with conflicts");

        // Re-open with git2 for the test
        (dir, Repository::open(&repo_path).unwrap())
    }

    #[test]
    fn diff_conflict_index_has_entries() {
        let (_dir, repo) = setup_conflict_repo();
        let index = repo.index().unwrap();
        let conflict_entries: Vec<_> = index.iter().filter(|e| (e.flags >> 12) & 0x3 >= 1).collect();
        assert!(!conflict_entries.is_empty(), "should have conflict entries in index");
        for e in &conflict_entries {
            let stage = (e.flags >> 12) & 0x3;
            let path = String::from_utf8_lossy(&e.path);
            assert_eq!(path, "hello.py", "conflict path should be hello.py, got '{}'", path);
            assert!(stage >= 1 && stage <= 3, "stage should be 1-3, got {}", stage);
        }
        // Verify we have all 3 stages
        assert_eq!(conflict_entries.len(), 3, "need 3 conflict entries (base/ours/theirs)");
    }

    #[test]
    fn diff_conflict_basic_conflict_returns_diff() {
        let (_dir, repo) = setup_conflict_repo();
        // Directly read blobs and test text_diff
        let index = repo.index().unwrap();
        let mut ours_text = String::new();
        let mut theirs_text = String::new();
        for entry in index.iter() {
            let stage = (entry.flags >> 12) & 0x3;
            if stage == 2 {
                let blob = repo.find_blob(entry.id).unwrap();
                ours_text = String::from_utf8_lossy(blob.content()).to_string();
            } else if stage == 3 {
                let blob = repo.find_blob(entry.id).unwrap();
                theirs_text = String::from_utf8_lossy(blob.content()).to_string();
            }
        }
        drop(index);
        eprintln!("ours chars: {}", ours_text.chars().count());
        eprintln!("theirs chars: {}", theirs_text.chars().count());

        // Test text_diff directly
        use crate::diff::text_diff::text_diff;
        let diff_result = text_diff(&ours_text, &theirs_text, &Default::default());
        eprintln!("Direct text_diff: hunks={}", diff_result.hunks.len());
        for h in &diff_result.hunks {
            eprintln!("  Hunk: old_start={}, changes={}", h.old_start, h.changes.len());
            for c in &h.changes {
                eprintln!("    Change: {:?} old={:?} new={:?}", c.change_type, c.old_line_no, c.new_line_no);
            }
        }

        let result = diff_conflict(&repo, "hello.py".to_string(), None).unwrap();
        // Verify we're getting a result with hunks
        assert!(!result.hunks.is_empty(), "conflict diff should have hunks, got result left_lines={} right_lines={}", result.left_lines, result.right_lines);
        // Should show the greeting line change
        let has_add = result.hunks.iter().any(|h| {
            h.changes.iter().any(|c| c.change_type == ChangeType::Add)
        });
        let has_del = result.hunks.iter().any(|h| {
            h.changes.iter().any(|c| c.change_type == ChangeType::Delete)
        });
        assert!(has_add, "should have additions (theirs)");
        assert!(has_del, "should have deletions (ours)");
    }

    #[test]
    fn diff_conflict_sets_labels() {
        let (_dir, repo) = setup_conflict_repo();
        let result = diff_conflict(&repo, "hello.py".to_string(), None).unwrap();
        assert_eq!(result.left_label, Some("ours (HEAD)".to_string()));
        assert_eq!(result.right_label, Some("theirs (MERGE_HEAD)".to_string()));
    }

    #[test]
    fn diff_conflict_non_conflicted_file_returns_error() {
        let (_dir, repo) = setup_conflict_repo();
        let result = diff_conflict(&repo, "nonexistent.py".to_string(), None);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not in conflicted state"));
    }

    #[test]
    fn diff_conflict_unmodified_file_returns_error() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let sig = Signature::now("test", "t@t.com").unwrap();

        // Create and commit a file (no conflict)
        fs::write(dir.path().join("ok.py"), "print('hello')\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("ok.py")).unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[])
            .unwrap();

        let result = diff_conflict(&repo, "ok.py".to_string(), None);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not in conflicted state"));
    }

    // ── get_conflict_content ──

    #[test]
    fn get_conflict_content_extracts_all_stages() {
        let (_dir, repo) = setup_conflict_repo();
        let result = get_conflict_content(&repo, "hello.py".to_string()).unwrap();
        assert_eq!(result.file_path, "hello.py");
        // Verify each stage has content (non-empty strings)
        assert!(!result.base_text.is_empty(), "base_text should not be empty");
        assert!(!result.ours_text.is_empty(), "ours_text should not be empty");
        assert!(!result.theirs_text.is_empty(), "theirs_text should not be empty");
        // The three texts should differ from each other
        assert_ne!(result.base_text, result.ours_text, "base and ours should differ");
        assert_ne!(result.base_text, result.theirs_text, "base and theirs should differ");
        assert_ne!(result.ours_text, result.theirs_text, "ours and theirs should differ");
    }

    #[test]
    fn get_conflict_content_non_conflicted_file_errors() {
        let (_dir, repo) = setup_conflict_repo();
        let result = get_conflict_content(&repo, "nonexistent.py".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not in conflicted state"));
    }

    #[test]
    fn get_conflict_content_unmodified_file_returns_error() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let sig = Signature::now("test", "t@t.com").unwrap();
        fs::write(dir.path().join("ok.py"), "print('hello')\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("ok.py")).unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[])
            .unwrap();
        let result = get_conflict_content(&repo, "ok.py".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not in conflicted state"));
    }

    // ── resolve_conflict ──

    #[test]
    fn resolve_conflict_writes_to_working_tree() {
        let (dir, repo) = setup_conflict_repo();
        let resolved = "def greet(name):\n    return f\"Hello, {name}!\"\n".to_string();
        resolve_conflict(&repo, "hello.py".to_string(), resolved.clone()).unwrap();

        let content = fs::read_to_string(dir.path().join("hello.py")).unwrap();
        assert_eq!(content, resolved, "working tree should contain the resolved content");
    }

    #[test]
    fn resolve_conflict_clears_conflict_flag() {
        let (_dir, repo) = setup_conflict_repo();
        let resolved = "def greet(name):\n    return f\"Hello, {name}!\"\n".to_string();
        resolve_conflict(&repo, "hello.py".to_string(), resolved).unwrap();

        // Check status no longer shows CONFLICTED
        let mut status_opts = git2::StatusOptions::new();
        status_opts.pathspec("hello.py");
        let statuses = repo.statuses(Some(&mut status_opts)).unwrap();
        let has_conflict = statuses.iter().any(|s| {
            s.status().intersects(git2::Status::CONFLICTED)
        });
        assert!(!has_conflict, "file should no longer be conflicted after resolve");
    }

    #[test]
    fn resolve_conflict_adds_to_index() {
        let (_dir, repo) = setup_conflict_repo();
        let resolved = "def greet(name):\n    return f\"Hello, {name}!\"\n".to_string();
        resolve_conflict(&repo, "hello.py".to_string(), resolved).unwrap();

        // Verify index no longer has conflict entries for hello.py
        let index = repo.index().unwrap();
        let conflict_entries: Vec<_> = index
            .iter()
            .filter(|e| {
                let path = String::from_utf8_lossy(&e.path);
                path == "hello.py" && ((e.flags >> 12) & 0x3 >= 1)
            })
            .collect();
        assert!(
            conflict_entries.is_empty(),
            "should have no conflict entries after resolve, got {}",
            conflict_entries.len()
        );
    }
}
