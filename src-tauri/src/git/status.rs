use git2::Repository;

use crate::git::GitError;

/// File status as seen by the frontend.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum FileStatus {
    Unmodified,
    New,
    Modified,
    Deleted,
    Renamed,
    Conflicted,
}

/// A single status entry for one file.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitStatusEntry {
    pub path: String,
    pub status: FileStatus,
    pub staged: bool,
    pub added_lines: i32,
    pub deleted_lines: i32,
}

/// Convert git2 status flags to our FileStatus enum.
///
/// Uses `intersects()` since `git2::Status` is a bitflags type
/// where multiple flags can be set simultaneously.
pub fn convert_status(s: git2::Status) -> FileStatus {
    if s.intersects(git2::Status::CONFLICTED) {
        FileStatus::Conflicted
    } else if s.intersects(git2::Status::WT_NEW | git2::Status::INDEX_NEW) {
        FileStatus::New
    } else if s.intersects(git2::Status::WT_DELETED | git2::Status::INDEX_DELETED) {
        FileStatus::Deleted
    } else if s.intersects(git2::Status::WT_RENAMED | git2::Status::INDEX_RENAMED) {
        FileStatus::Renamed
    } else if s.intersects(
        git2::Status::WT_MODIFIED
            | git2::Status::INDEX_MODIFIED
            | git2::Status::WT_TYPECHANGE
            | git2::Status::INDEX_TYPECHANGE,
    ) {
        FileStatus::Modified
    } else {
        FileStatus::Unmodified
    }
}

/// Check if a status has staged changes.
pub fn is_staged(s: git2::Status) -> bool {
    s.intersects(
        git2::Status::INDEX_NEW
            | git2::Status::INDEX_MODIFIED
            | git2::Status::INDEX_DELETED
            | git2::Status::INDEX_RENAMED
            | git2::Status::INDEX_TYPECHANGE,
    )
}

/// Get status entries for a repository.
pub fn get_status(repo: &Repository) -> Result<Vec<GitStatusEntry>, GitError> {
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true);

    let statuses = repo.statuses(Some(&mut opts))?;
    let mut entries = Vec::new();

    for entry in statuses.iter() {
        let status = entry.status();
        let path = entry.path().unwrap_or("").to_string();
        entries.push(GitStatusEntry {
            path,
            status: convert_status(status),
            staged: is_staged(status),
            added_lines: 0,
            deleted_lines: 0,
        });
    }
    Ok(entries)
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn convert_conflicted() {
        let s = git2::Status::CONFLICTED;
        assert_eq!(convert_status(s), FileStatus::Conflicted);
    }

    #[test]
    fn convert_new() {
        let s = git2::Status::WT_NEW;
        assert_eq!(convert_status(s), FileStatus::New);
        let s = git2::Status::INDEX_NEW;
        assert_eq!(convert_status(s), FileStatus::New);
    }

    #[test]
    fn convert_deleted() {
        let s = git2::Status::WT_DELETED;
        assert_eq!(convert_status(s), FileStatus::Deleted);
        let s = git2::Status::INDEX_DELETED;
        assert_eq!(convert_status(s), FileStatus::Deleted);
    }

    #[test]
    fn convert_renamed() {
        let s = git2::Status::INDEX_RENAMED;
        assert_eq!(convert_status(s), FileStatus::Renamed);
    }

    #[test]
    fn convert_modified() {
        let s = git2::Status::WT_MODIFIED;
        assert_eq!(convert_status(s), FileStatus::Modified);
    }

    #[test]
    fn convert_unmodified() {
        let s = git2::Status::CURRENT;
        assert_eq!(convert_status(s), FileStatus::Unmodified);
    }

    #[test]
    fn convert_conflicted_takes_priority() {
        let s = git2::Status::CONFLICTED | git2::Status::WT_MODIFIED;
        assert_eq!(convert_status(s), FileStatus::Conflicted);
    }

    #[test]
    fn is_staged_new() {
        assert!(is_staged(git2::Status::INDEX_NEW));
    }

    #[test]
    fn is_staged_modified() {
        assert!(is_staged(git2::Status::INDEX_MODIFIED));
    }

    #[test]
    fn is_not_staged_for_wt_only() {
        assert!(!is_staged(git2::Status::WT_MODIFIED));
        assert!(!is_staged(git2::Status::WT_NEW));
    }

    #[test]
    fn empty_repo_returns_empty_status() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let entries = get_status(&repo).unwrap();
        // A bare-init repo has no files
        assert!(entries.is_empty());
    }

    #[test]
    fn untracked_file_appears_as_new() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let workdir = dir.path();

        // Create an untracked file
        std::fs::write(workdir.join("new_file.txt"), b"hello").unwrap();

        let entries = get_status(&repo).unwrap();
        let untracked: Vec<_> = entries
            .iter()
            .filter(|e| e.status == FileStatus::New && !e.staged)
            .collect();
        assert_eq!(untracked.len(), 1);
        assert_eq!(untracked[0].path, "new_file.txt");
    }

    #[test]
    fn staged_new_file_appears_as_staged() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let workdir = dir.path();

        std::fs::write(workdir.join("staged.txt"), b"content").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("staged.txt")).unwrap();
        index.write().unwrap();

        let entries = get_status(&repo).unwrap();
        let staged: Vec<_> = entries.iter().filter(|e| e.staged).collect();
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].status, FileStatus::New);
    }

    #[test]
    fn modified_file_appears_as_modified() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let workdir = dir.path();

        // Create and commit a file
        std::fs::write(workdir.join("tracked.txt"), b"original").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("tracked.txt")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = git2::Signature::now("test", "test@test.com").unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[])
            .unwrap();

        // Now modify it
        std::fs::write(workdir.join("tracked.txt"), b"modified").unwrap();

        let entries = get_status(&repo).unwrap();
        let modified: Vec<_> = entries
            .iter()
            .filter(|e| e.status == FileStatus::Modified && !e.staged)
            .collect();
        assert_eq!(modified.len(), 1);
        assert_eq!(modified[0].path, "tracked.txt");
    }
}
