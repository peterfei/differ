use git2::Repository;

use crate::git::GitError;

/// A single branch entry exposed to the frontend.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub is_current: bool,
    pub is_remote: bool,
}

/// List branches in a repository.
///
/// * `include_remote` — if `true`, also include remote-tracking branches (default: `false`)
pub fn get_branches(
    repo: &Repository,
    include_remote: Option<bool>,
) -> Result<Vec<GitBranch>, GitError> {
    let show_remote = include_remote.unwrap_or(false);
    let mut branches = Vec::new();

    // Get HEAD shorthand for detecting current branch
    let head_shorthand = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from));

    // ── Local branches ──
    for branch_result in repo.branches(Some(git2::BranchType::Local))? {
        let (branch, _type) = branch_result?;
        let name = branch.name()?.map(String::from).unwrap_or_default();
        let branch_oid = branch.get().target();

        // Upstream info
        let (upstream_name, ahead, behind) =
            if let Ok(upstream_ref) = branch.upstream() {
                let up_name = upstream_ref.name().ok().flatten().map(String::from);
                let up_oid = upstream_ref.get().target();
                let (a, b) = match (branch_oid, up_oid) {
                    (Some(boid), Some(uoid)) => {
                        repo.graph_ahead_behind(boid, uoid).unwrap_or((0, 0))
                    }
                    _ => (0, 0),
                };
                (up_name, a, b)
            } else {
                (None, 0, 0)
            };

        let is_current = head_shorthand.as_deref() == Some(&name);

        branches.push(GitBranch {
            name,
            upstream: upstream_name,
            ahead,
            behind,
            is_current,
            is_remote: false,
        });
    }

    // ── Remote branches ──
    if show_remote {
        for branch_result in repo.branches(Some(git2::BranchType::Remote))? {
            let (branch, _type) = branch_result?;
            let name = branch.name()?.map(String::from).unwrap_or_default();

            // Skip synthetic remote HEAD references (e.g., "origin/HEAD")
            if name.ends_with("/HEAD") {
                continue;
            }

            branches.push(GitBranch {
                name,
                upstream: None,
                ahead: 0,
                behind: 0,
                is_current: false,
                is_remote: true,
            });
        }
    }

    Ok(branches)
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Signature;
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;

    /// Helper: add a file to index and commit.
    fn commit_file(repo: &Repository, sig: &Signature, path: &str, content: &str, msg: &str) {
        let workdir = repo.workdir().unwrap().to_path_buf();
        fs::write(workdir.join(path), content).unwrap();
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

    // ── Tests ──

    #[test]
    fn empty_repo_returns_no_branches() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let result = get_branches(&repo, None).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn single_local_branch_after_commit() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let sig = Signature::now("test", "t@t.com").unwrap();
        commit_file(&repo, &sig, "f.txt", "hello\n", "init");

        let result = get_branches(&repo, None).unwrap();
        assert_eq!(result.len(), 1);
        assert!(result[0].name == "master" || result[0].name == "main");
        assert!(result[0].is_current, "the only branch should be current");
        assert!(!result[0].is_remote);
    }

    #[test]
    fn multiple_local_branches_listed() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let sig = Signature::now("test", "t@t.com").unwrap();
        commit_file(&repo, &sig, "f.txt", "base\n", "first");

        // Create branch
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch("feature", &head, false).unwrap();
        drop(head);

        // Another commit on master so feature and master differ
        commit_file(&repo, &sig, "f.txt", "base\nmaster\n", "second");

        let result = get_branches(&repo, None).unwrap();
        // Should have "feature" and the default branch
        assert!(result.len() >= 2);
        let names: Vec<&str> = result.iter().map(|b| b.name.as_str()).collect();
        assert!(
            names.contains(&"feature"),
            "feature branch should be listed: {:?}",
            names
        );
    }

    #[test]
    fn current_branch_marked_correctly() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let sig = Signature::now("test", "t@t.com").unwrap();
        commit_file(&repo, &sig, "f.txt", "a\n", "init");

        let head = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch("feature", &head, false).unwrap();
        drop(head);

        // HEAD is still on the default branch
        let result = get_branches(&repo, None).unwrap();
        let current: Vec<&GitBranch> = result.iter().filter(|b| b.is_current).collect();
        assert_eq!(current.len(), 1, "exactly one branch should be current");
        assert!(
            current[0].name == "master" || current[0].name == "main",
            "current branch should be master or main, got: {}",
            current[0].name
        );
    }

    #[test]
    fn no_remote_branches_by_default() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let sig = Signature::now("test", "t@t.com").unwrap();
        commit_file(&repo, &sig, "f.txt", "a\n", "init");

        let result = get_branches(&repo, Some(false)).unwrap();
        assert!(result.iter().all(|b| !b.is_remote));
    }

    #[test]
    fn branch_names_are_stripped_of_ref_prefix() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let sig = Signature::now("test", "t@t.com").unwrap();
        commit_file(&repo, &sig, "f.txt", "a\n", "init");

        let result = get_branches(&repo, None).unwrap();
        // Names should NOT contain "refs/heads/" prefix
        for b in &result {
            assert!(
                !b.name.starts_with("refs/"),
                "branch name should not contain refs/ prefix: {}",
                b.name
            );
        }
    }
}
