pub mod branch;
pub mod diff;
pub mod log;
pub mod repo;
pub mod status;

use std::fmt;

/// Unified Git error type — eliminates repetitive `map_err(|e| format!(...))`
#[derive(Debug)]
pub enum GitError {
    NotARepository(String),
    NotFound(String),
    PermissionDenied(String),
    Libgit2(git2::Error),
    IoError(std::io::Error),
}

impl fmt::Display for GitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GitError::NotARepository(p) => write!(f, "不是 Git 仓库: {}", p),
            GitError::NotFound(p) => write!(f, "路径不存在: {}", p),
            GitError::PermissionDenied(p) => write!(f, "权限不足: {}", p),
            GitError::Libgit2(e) => write!(f, "{}", e),
            GitError::IoError(e) => write!(f, "{}", e),
        }
    }
}

impl std::error::Error for GitError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            GitError::Libgit2(e) => Some(e),
            GitError::IoError(e) => Some(e),
            _ => None,
        }
    }
}

impl From<git2::Error> for GitError {
    fn from(e: git2::Error) -> Self {
        GitError::Libgit2(e)
    }
}

impl From<std::io::Error> for GitError {
    fn from(e: std::io::Error) -> Self {
        GitError::IoError(e)
    }
}

/// Serialization bridge: every Tauri command needs `From<GitError> for String`
impl From<GitError> for String {
    fn from(e: GitError) -> String {
        e.to_string()
    }
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn not_a_repository_display() {
        let err = GitError::NotARepository("/tmp/foo".into());
        let msg = err.to_string();
        assert!(msg.contains("不是 Git 仓库"));
        assert!(msg.contains("/tmp/foo"));
    }

    #[test]
    fn not_found_display() {
        let err = GitError::NotFound("/missing".into());
        let msg = err.to_string();
        assert!(msg.contains("路径不存在"));
    }

    #[test]
    fn permission_denied_display() {
        let err = GitError::PermissionDenied("/etc/shadow".into());
        let msg = err.to_string();
        assert!(msg.contains("权限不足"));
    }

    #[test]
    fn libgit2_error_display() {
        let git_err = git2::Error::from_str("test git error");
        let err = GitError::Libgit2(git_err);
        assert!(err.to_string().contains("test git error"));
    }

    #[test]
    fn io_error_conversion() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err: GitError = io_err.into();
        assert!(matches!(err, GitError::IoError(_)));
        assert!(err.to_string().contains("file not found"));
    }

    #[test]
    fn git_error_conversion() {
        let git_err = git2::Error::from_str("libgit2 error");
        let err: GitError = git_err.into();
        assert!(matches!(err, GitError::Libgit2(_)));
    }

    #[test]
    fn into_string_for_tauri() {
        let err = GitError::NotARepository("/x".into());
        let s: String = err.into();
        assert!(s.contains("不是 Git 仓库"));
    }

    #[test]
    fn error_trait_source() {
        use std::error::Error;
        let git_err = git2::Error::from_str("inner");
        let err = GitError::Libgit2(git_err);
        assert!(err.source().is_some());

        let not_found = GitError::NotFound("/x".into());
        assert!(not_found.source().is_none());
    }
}
