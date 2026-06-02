use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

// ── Data Structures ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EntryStatus {
    Added,
    Removed,
    Modified,
    Same,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DirectoryEntry {
    pub path: String,
    pub status: EntryStatus,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<DirectoryEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DirectoryDiffResult {
    pub entries: Vec<DirectoryEntry>,
    pub left_total: usize,
    pub right_total: usize,
    pub added: usize,
    pub removed: usize,
    pub modified: usize,
}

// ── Core Logic ──

/// Walk a directory recursively and collect all files with their relative paths.
fn walk_dir(dir: &Path, prefix: &str) -> Vec<(String, bool)> {
    let mut results = Vec::new();
    let dir_entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return results,
    };

    let mut entries: Vec<_> = dir_entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            // Skip hidden files/dirs
            e.file_name()
                .to_str()
                .map(|n| !n.starts_with('.'))
                .unwrap_or(false)
        })
        .collect();

    // Sort for deterministic order
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let rel_path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", prefix, name)
        };

        if path.is_dir() {
            results.push((rel_path.clone(), true));
            results.extend(walk_dir(&path, &rel_path));
        } else {
            results.push((rel_path, false));
        }
    }

    results
}

/// Compute a fast content hash for a file.
fn file_hash(path: &Path) -> Option<u64> {
    use std::hash::Hasher;
    use std::io::Read;

    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.write(&buf[..n]);
    }
    Some(hasher.finish())
}

/// Compare two directories and produce a diff result.
pub fn diff_directories(left_path: &str, right_path: &str) -> DirectoryDiffResult {
    let left_dir = Path::new(left_path);
    let right_dir = Path::new(right_path);

    let left_files = if left_dir.is_dir() {
        walk_dir(left_dir, "")
    } else {
        Vec::new()
    };

    let right_files = if right_dir.is_dir() {
        walk_dir(right_dir, "")
    } else {
        Vec::new()
    };

    // Build maps: relative_path → (is_dir)
    let left_map: HashMap<&str, bool> = left_files.iter().map(|(p, d)| (p.as_str(), *d)).collect();
    let right_map: HashMap<&str, bool> = right_files.iter().map(|(p, d)| (p.as_str(), *d)).collect();

    // Collect all unique paths
    let mut all_paths: Vec<&str> = left_map
        .keys()
        .chain(right_map.keys())
        .copied()
        .collect();
    all_paths.sort();
    all_paths.dedup();

    let mut entries: Vec<DirectoryEntry> = Vec::new();
    let mut added = 0usize;
    let mut removed = 0usize;
    let mut modified = 0usize;

    for rel_path in &all_paths {
        let in_left = left_map.contains_key(rel_path);
        let in_right = right_map.contains_key(rel_path);
        let is_dir = *left_map.get(rel_path).or_else(|| right_map.get(rel_path)).unwrap_or(&false);

        let status = if in_left && !in_right {
            removed += 1;
            EntryStatus::Removed
        } else if !in_left && in_right {
            added += 1;
            EntryStatus::Added
        } else if in_left && in_right && !is_dir {
            // Compare content
            let left_file = left_dir.join(rel_path);
            let right_file = right_dir.join(rel_path);
            let same = file_hash(&left_file) == file_hash(&right_file);
            if same {
                EntryStatus::Same
            } else {
                modified += 1;
                EntryStatus::Modified
            }
        } else {
            EntryStatus::Same
        };

        // Only include non-Same entries in the flat result (or all for tree building)
        entries.push(DirectoryEntry {
            path: rel_path.to_string(),
            status,
            is_dir,
            children: None,
        });
    }

    // Build tree structure from flat list
    let tree = build_tree(&entries);

    DirectoryDiffResult {
        entries: tree,
        left_total: left_files.len(),
        right_total: right_files.len(),
        added,
        removed,
        modified,
    }
}

/// Convert a flat list of entries into a nested tree structure.
fn build_tree(flat: &[DirectoryEntry]) -> Vec<DirectoryEntry> {
    let mut roots: Vec<DirectoryEntry> = Vec::new();
    let mut map: HashMap<String, &DirectoryEntry> = HashMap::new();

    for entry in flat {
        map.insert(entry.path.clone(), entry);
    }

    for entry in flat {
        // Check if parent should be included
        if let Some(parent_path) = parent_dir(&entry.path) {
            // If parent is in the map, this entry will be handled as a child
            if map.contains_key(&parent_path) {
                continue;
            }
        }

        // This is a root-level entry or orphan
        let status = entry.status.clone();
        roots.push(DirectoryEntry {
            path: entry.path.clone(),
            status,
            is_dir: entry.is_dir,
            children: if entry.is_dir {
                Some(gather_children(flat, &entry.path))
            } else {
                None
            },
        });
    }

    roots
}

fn parent_dir(path: &str) -> Option<String> {
    path.rfind('/').map(|idx| path[..idx].to_string())
}

fn gather_children(flat: &[DirectoryEntry], parent: &str) -> Vec<DirectoryEntry> {
    let prefix = format!("{}/", parent);
    let mut children: Vec<DirectoryEntry> = flat
        .iter()
        .filter(|e| e.path.starts_with(&prefix) && !e.path[prefix.len()..].contains('/'))
        .cloned()
        .collect();

    // Sort: directories first, then files
    children.sort_by_key(|e| (!e.is_dir, e.path.clone()));

    // Recursively populate children for sub-directories
    for child in &mut children {
        if child.is_dir {
            child.children = Some(gather_children(flat, &child.path));
        }
    }

    children
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    fn setup_dirs() -> (TempDir, TempDir) {
        let left = TempDir::new().unwrap();
        let right = TempDir::new().unwrap();
        (left, right)
    }

    fn write_file(dir: &TempDir, path: &str, content: &str) {
        let full_path = dir.path().join(path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut f = fs::File::create(&full_path).unwrap();
        write!(f, "{}", content).unwrap();
    }

    #[test]
    fn test_identical_directories() {
        let (left, right) = setup_dirs();
        write_file(&left, "a.txt", "hello");
        write_file(&right, "a.txt", "hello");

        let result = diff_directories(
            left.path().to_str().unwrap(),
            right.path().to_str().unwrap(),
        );
        assert_eq!(result.added, 0);
        assert_eq!(result.removed, 0);
        assert_eq!(result.modified, 0);
        assert_eq!(result.left_total, 1);
        assert_eq!(result.right_total, 1);
    }

    #[test]
    fn test_file_added() {
        let (left, right) = setup_dirs();
        write_file(&left, "a.txt", "hello");
        write_file(&right, "a.txt", "hello");
        write_file(&right, "b.txt", "new");

        let result = diff_directories(
            left.path().to_str().unwrap(),
            right.path().to_str().unwrap(),
        );
        assert_eq!(result.added, 1);
        assert_eq!(result.removed, 0);
        assert_eq!(result.modified, 0);
    }

    #[test]
    fn test_file_removed() {
        let (left, right) = setup_dirs();
        write_file(&left, "a.txt", "hello");
        write_file(&left, "b.txt", "old");
        write_file(&right, "a.txt", "hello");

        let result = diff_directories(
            left.path().to_str().unwrap(),
            right.path().to_str().unwrap(),
        );
        assert_eq!(result.added, 0);
        assert_eq!(result.removed, 1);
        assert_eq!(result.modified, 0);
    }

    #[test]
    fn test_file_modified() {
        let (left, right) = setup_dirs();
        write_file(&left, "a.txt", "hello");
        write_file(&right, "a.txt", "world");

        let result = diff_directories(
            left.path().to_str().unwrap(),
            right.path().to_str().unwrap(),
        );
        assert_eq!(result.added, 0);
        assert_eq!(result.removed, 0);
        assert_eq!(result.modified, 1);
    }

    #[test]
    fn test_subdirectory() {
        let (left, right) = setup_dirs();
        write_file(&left, "src/main.rs", "fn main() {}");
        write_file(&right, "src/main.rs", "fn main() { println!(\"hi\"); }");

        let result = diff_directories(
            left.path().to_str().unwrap(),
            right.path().to_str().unwrap(),
        );
        assert_eq!(result.modified, 1);
        // Check tree structure
        assert!(!result.entries.is_empty());
    }

    #[test]
    fn test_hidden_files_ignored() {
        let (left, right) = setup_dirs();
        write_file(&left, ".gitkeep", "");
        write_file(&right, ".gitkeep", "");

        let result = diff_directories(
            left.path().to_str().unwrap(),
            right.path().to_str().unwrap(),
        );
        assert_eq!(result.left_total, 0);
        assert_eq!(result.right_total, 0);
    }

    #[test]
    fn test_empty_directories() {
        let left = TempDir::new().unwrap();
        let right = TempDir::new().unwrap();

        let result = diff_directories(
            left.path().to_str().unwrap(),
            right.path().to_str().unwrap(),
        );
        assert_eq!(result.added, 0);
        assert_eq!(result.removed, 0);
        assert_eq!(result.modified, 0);
        assert!(result.entries.is_empty());
    }

    #[test]
    fn test_nonexistent_directory() {
        let result = diff_directories("/nonexistent/path", "/nonexistent/path2");
        assert_eq!(result.left_total, 0);
        assert_eq!(result.right_total, 0);
        // Should not panic
    }
}
