use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use git2::Repository;

use crate::git::GitError;

/// Cache of discovered repository paths.
/// Maps input path → actual .git directory path.
/// Avoids redundant `Repository::discover()` filesystem walks.
///
/// Note: we do NOT cache `Repository` objects directly because
/// `git2::Repository` is not `Sync` (wraps a raw C pointer).
/// Opening a fresh `Repository` from a cached path is fast.
static DISCOVERY_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Open a repository by path.
///
/// Tries `Repository::open()` first (exact path), falls back to
/// `Repository::discover()` (walks up directories looking for `.git`).
/// Discovery results are cached to avoid repeated filesystem walks.
pub fn open_repo(path: &str) -> Result<Repository, GitError> {
    // Try exact path first
    if let Ok(repo) = Repository::open(path) {
        return Ok(repo);
    }

    // Check discovery cache
    if let Ok(cache) = DISCOVERY_CACHE.lock() {
        if let Some(git_dir) = cache.get(path) {
            if let Ok(repo) = Repository::open(git_dir) {
                return Ok(repo);
            }
        }
    }

    // Discover from scratch
    let repo =
        Repository::discover(path).map_err(|_| GitError::NotARepository(path.to_string()))?;

    // Cache the discovered path
    let git_dir = repo.path().to_string_lossy().to_string();
    if let Ok(mut cache) = DISCOVERY_CACHE.lock() {
        cache.insert(path.to_string(), git_dir);
    }

    Ok(repo)
}

/// Remove a repository from the discovery cache.
pub fn close_repo(path: &str) {
    if let Ok(mut cache) = DISCOVERY_CACHE.lock() {
        cache.remove(path);
    }
}

/// Get the number of cached entries (for testing).
pub fn cache_size() -> usize {
    DISCOVERY_CACHE.lock().map(|c| c.len()).unwrap_or(0)
}

/// Clear the entire cache.
pub fn clear_cache() {
    if let Ok(mut cache) = DISCOVERY_CACHE.lock() {
        cache.clear();
    }
}

/// Repository metadata exposed to the frontend.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitRepoInfo {
    pub path: String,
    pub work_dir: String,
    pub current_branch: Option<String>,
    pub is_detached: bool,
    pub head_commit: Option<String>,
    pub head_short: Option<String>,
}

/// Extract basic repository info.
pub fn get_repo_info(repo: &Repository) -> Result<GitRepoInfo, GitError> {
    let head = repo.head().ok();
    let head_commit = head.as_ref().and_then(|h| h.peel_to_commit().ok());
    Ok(GitRepoInfo {
        path: repo.path().to_string_lossy().to_string(),
        work_dir: repo
            .workdir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        current_branch: head
            .as_ref()
            .and_then(|h| h.shorthand())
            .map(String::from),
        is_detached: head.map(|h| !h.is_branch()).unwrap_or(true),
        head_commit: head_commit.as_ref().map(|c| c.id().to_string()),
        head_short: head_commit
            .as_ref()
            .map(|c| c.id().to_string()[..7].to_string()),
    })
}

/// Discover a git repository starting from `path`, walking upward.
pub fn discover_repo(from_path: &str) -> Result<String, GitError> {
    let repo = Repository::discover(from_path)
        .map_err(|_| GitError::NotARepository(from_path.to_string()))?;
    repo.path()
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| GitError::NotFound(from_path.to_string()))
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_open_valid_repo_succeeds() {
        let dir = TempDir::new().unwrap();
        Repository::init(dir.path()).unwrap();
        let result = open_repo(dir.path().to_str().unwrap());
        assert!(result.is_ok());
        clear_cache();
    }

    #[test]
    fn test_open_nonexistent_path_returns_not_a_repository() {
        let result = open_repo("/tmp/__differ_test_nonexistent_repo__");
        assert!(matches!(result, Err(GitError::NotARepository(_))));
    }

    #[test]
    fn test_close_repo_removes_from_cache() {
        let dir = TempDir::new().unwrap();
        Repository::init(dir.path()).unwrap();

        // Open from a subdirectory to force discovery caching
        let subdir = dir.path().join("sub");
        std::fs::create_dir_all(&subdir).unwrap();
        let sub_path = subdir.to_str().unwrap().to_string();

        open_repo(&sub_path).unwrap();
        assert_eq!(cache_size(), 1);
        close_repo(&sub_path);
        assert_eq!(cache_size(), 0);
        clear_cache();
    }

    #[test]
    fn test_discover_repo_from_subdirectory() {
        let dir = TempDir::new().unwrap();
        Repository::init(dir.path()).unwrap();

        let subdir = dir.path().join("src").join("components");
        std::fs::create_dir_all(&subdir).unwrap();

        let discovered = discover_repo(subdir.to_str().unwrap()).unwrap();
        // The discovered path should be the repo's workdir parent
        assert!(std::path::Path::new(&discovered).exists());
        clear_cache();
    }

    #[test]
    fn test_discover_repo_nonexistent() {
        let result = discover_repo("/tmp/__differ_test_no_repo_here__");
        assert!(matches!(result, Err(GitError::NotARepository(_))));
    }

    #[test]
    fn test_get_repo_info_with_commit() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        let sig = git2::Signature::now("test", "test@test.com").unwrap();
        let tree_id = {
            let mut index = repo.index().unwrap();
            let oid = index.write_tree().unwrap();
            repo.find_tree(oid).unwrap().id()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[])
            .unwrap();

        let info = get_repo_info(&repo).unwrap();
        assert!(matches!(info.current_branch.as_deref(), Some("main") | Some("master")));
        assert!(info.head_commit.is_some());
        assert!(!info.is_detached);
        clear_cache();
    }

    #[test]
    fn test_get_repo_info_detached_head() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        // With no commits, HEAD doesn't exist → detached
        let info = get_repo_info(&repo).unwrap();
        assert!(info.is_detached);
        assert!(info.current_branch.is_none());
        clear_cache();
    }

    #[test]
    fn test_open_discovery_is_cached() {
        let dir = TempDir::new().unwrap();
        Repository::init(dir.path()).unwrap();

        let subdir = dir.path().join("a").join("b").join("c");
        std::fs::create_dir_all(&subdir).unwrap();

        // First call discovers and caches
        open_repo(subdir.to_str().unwrap()).unwrap();
        assert_eq!(cache_size(), 1);

        // Cache should persist
        assert_eq!(cache_size(), 1);
        clear_cache();
    }

    #[test]
    fn test_close_nonexistent_does_not_panic() {
        close_repo("/tmp/__does_not_exist__");
        // Should not panic
    }
}
