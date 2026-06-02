use serde::{Deserialize, Serialize};
use similar::{DiffOp, TextDiff};

// ── Data Structures (TDD) ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MergeConflict {
    /// Left branch content (conflicting lines from "ours")
    pub left_content: Vec<String>,
    /// Right branch content (conflicting lines from "theirs")
    pub right_content: Vec<String>,
    /// Starting line number in the merged result (1-based)
    pub start_line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MergeResult {
    /// Merged text (with conflict markers if conflicts exist)
    pub merged_text: String,
    /// List of conflicts
    pub conflicts: Vec<MergeConflict>,
    /// Whether there are unresolved conflicts
    pub has_conflicts: bool,
    /// Original base text for display in panels
    pub base_text: String,
    /// Original left text for display in panels
    pub left_text: String,
    /// Original right text for display in panels
    pub right_text: String,
}

// ── Three-Way Merge Implementation ──

/// Perform a three-way merge of base, left, and right texts.
///
/// Returns a `MergeResult` containing the merged text and any conflicts.
pub fn three_way_merge(base: &str, left: &str, right: &str) -> MergeResult {
    let base_lines: Vec<&str> = base.lines().collect();

    let diff_l = TextDiff::from_lines(base, left);
    let diff_r = TextDiff::from_lines(base, right);

    // Filter to only non-Equal ops — Equal means "unchanged" and is handled implicitly
    let change_ops_l: Vec<&DiffOp> = diff_l.ops().iter().filter(|o| o.as_tag_tuple().0 != similar::DiffTag::Equal).collect();
    let change_ops_r: Vec<&DiffOp> = diff_r.ops().iter().filter(|o| o.as_tag_tuple().0 != similar::DiffTag::Equal).collect();

    let mut result: Vec<String> = Vec::new();
    let mut conflicts: Vec<MergeConflict> = Vec::new();

    let mut i = 0; // index in change_ops_l
    let mut j = 0; // index in change_ops_r
    let mut base_pos: usize = 0; // current position in base[0..n]

    loop {
        let op_l = if i < change_ops_l.len() { Some(change_ops_l[i]) } else { None };
        let op_r = if j < change_ops_r.len() { Some(change_ops_r[j]) } else { None };

        if op_l.is_none() && op_r.is_none() {
            // Copy remaining base lines
            while base_pos < base_lines.len() {
                result.push(base_lines[base_pos].to_string());
                base_pos += 1;
            }
            break;
        }

        // Find the next base position any op touches
        let next_l = op_l.map(|o| o.old_range().start).unwrap_or(usize::MAX);
        let next_r = op_r.map(|o| o.old_range().start).unwrap_or(usize::MAX);
        let next_base = next_l.min(next_r);

        // Copy unchanged base lines up to next_base
        while base_pos < next_base && base_pos < base_lines.len() {
            result.push(base_lines[base_pos].to_string());
            base_pos += 1;
        }

        if base_pos >= base_lines.len() {
            // Append remaining new lines from insertions at end of base
            for idx in i..change_ops_l.len() {
                let op = change_ops_l[idx];
                if op.old_range().is_empty() && !op.new_range().is_empty() {
                    for line in get_new_lines(op, &diff_l) {
                        result.push(line);
                    }
                }
            }
            for idx in j..change_ops_r.len() {
                let op = change_ops_r[idx];
                if op.old_range().is_empty() && !op.new_range().is_empty() {
                    for line in get_new_lines(op, &diff_r) {
                        result.push(line);
                    }
                }
            }
            break;
        }

        // Determine which ops affect the current base position
        let affects_l =
            op_l.is_some() && op_l.unwrap().old_range().start <= base_pos && base_pos < op_l.unwrap().old_range().end;
        let affects_r =
            op_r.is_some() && op_r.unwrap().old_range().start <= base_pos && base_pos < op_r.unwrap().old_range().end;

        match (affects_l, affects_r) {
            // Both sides change the same base region
            (true, true) => {
                let ol = op_l.unwrap();
                let or = op_r.unwrap();
                let left_new = get_new_lines(ol, &diff_l);
                let right_new = get_new_lines(or, &diff_r);

                let left_is_delete = left_new.is_empty();
                let right_is_delete = right_new.is_empty();

                if left_new == right_new {
                    // Both made the same change
                    for line in &left_new {
                        result.push(line.clone());
                    }
                } else if left_is_delete && right_is_delete {
                    // Both deleted the same lines, skip them
                } else if left_is_delete {
                    // Left deleted, right changed → conflict
                    let start_line = result.len() + 1;
                    conflicts.push(MergeConflict {
                        left_content: Vec::new(),
                        right_content: right_new.clone(),
                        start_line,
                    });
                    push_conflict_markers(&mut result, &[], &right_new, start_line);
                } else if right_is_delete {
                    // Right deleted, left changed → conflict
                    let start_line = result.len() + 1;
                    conflicts.push(MergeConflict {
                        left_content: left_new.clone(),
                        right_content: Vec::new(),
                        start_line,
                    });
                    push_conflict_markers(&mut result, &left_new, &[], start_line);
                } else {
                    // Both changed differently → real conflict
                    let start_line = result.len() + 1;
                    conflicts.push(MergeConflict {
                        left_content: left_new.clone(),
                        right_content: right_new.clone(),
                        start_line,
                    });
                    push_conflict_markers(&mut result, &left_new, &right_new, start_line);
                }

                advance(ol, &mut base_pos, &mut i);
                advance(or, &mut base_pos, &mut j);
            }

            // Left changes this region
            (true, false) => {
                let ol = op_l.unwrap();
                let left_new = get_new_lines(ol, &diff_l);
                for line in &left_new {
                    result.push(line.clone());
                }
                // If right's current op is subsumed by left's range, advance j too
                if let Some(or) = op_r {
                    if or.old_range().end <= ol.old_range().end {
                        j += 1;
                    }
                }
                advance(ol, &mut base_pos, &mut i);
            }

            // Right changes this region
            (false, true) => {
                let or = op_r.unwrap();
                let right_new = get_new_lines(or, &diff_r);
                for line in &right_new {
                    result.push(line.clone());
                }
                // If left's current op is subsumed by right's range, advance i too
                if let Some(ol) = op_l {
                    if ol.old_range().end <= or.old_range().end {
                        i += 1;
                    }
                }
                advance(or, &mut base_pos, &mut j);
            }

            (false, false) => {
                // Neither touches this line — should not happen
                result.push(base_lines[base_pos].to_string());
                base_pos += 1;
            }
        }
    }

    let has_conflicts = !conflicts.is_empty();
    let merged_text = result.join("\n");

    MergeResult {
        merged_text,
        conflicts,
        has_conflicts,
        base_text: base.to_string(),
        left_text: left.to_string(),
        right_text: right.to_string(),
    }
}

fn get_new_lines(
    op: &DiffOp,
    diff: &TextDiff<'_, '_, '_, str>,
) -> Vec<String> {
    let new_range = op.new_range();
    if new_range.is_empty() {
        return Vec::new();
    }
    diff.iter_changes(op)
        .filter(|c| {
            let idx = c.new_index();
            idx.is_some() && new_range.contains(&idx.unwrap())
        })
        .map(|c| c.value().trim_end_matches('\n').to_string())
        .collect()
}

fn advance(op: &DiffOp, base_pos: &mut usize, idx: &mut usize) {
    let old_end = op.old_range().end;
    if old_end > *base_pos {
        *base_pos = old_end;
    }
    *idx += 1;
}

fn push_conflict_markers(
    result: &mut Vec<String>,
    left_lines: &[String],
    right_lines: &[String],
    _start_line: usize,
) {
    result.push("<<<<<<< Left".to_string());
    for line in left_lines {
        result.push(line.clone());
    }
    result.push("=======".to_string());
    for line in right_lines {
        result.push(line.clone());
    }
    result.push(">>>>>>> Right".to_string());
}

// ── Tests (TDD: written before implementation) ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_identical_texts() {
        let base = "line1\nline2\nline3\n";
        let left = "line1\nline2\nline3\n";
        let right = "line1\nline2\nline3\n";

        let result = three_way_merge(base, left, right);
        assert!(!result.has_conflicts);
        assert!(result.conflicts.is_empty());
        assert_eq!(result.merged_text, "line1\nline2\nline3");
    }

    #[test]
    fn merge_left_only_change() {
        let base = "a\nb\nc\n";
        let left = "a\nCHANGED\nc\n";
        let right = "a\nb\nc\n";

        let result = three_way_merge(base, left, right);
        assert!(!result.has_conflicts);
        assert!(result.merged_text.contains("CHANGED"));
    }

    #[test]
    fn merge_right_only_change() {
        let base = "a\nb\nc\n";
        let left = "a\nb\nc\n";
        let right = "a\nMODIFIED\nc\n";

        let result = three_way_merge(base, left, right);
        assert!(!result.has_conflicts);
        assert!(result.merged_text.contains("MODIFIED"));
    }

    #[test]
    fn merge_both_same_change() {
        let base = "a\nb\nc\n";
        let left = "a\nX\nc\n";
        let right = "a\nX\nc\n";

        let result = three_way_merge(base, left, right);
        assert!(!result.has_conflicts);
        assert_eq!(result.merged_text, "a\nX\nc");
    }

    #[test]
    fn merge_detects_conflict() {
        let base = "a\nb\nc\n";
        let left = "a\nLEFT_CHANGE\nc\n";
        let right = "a\nRIGHT_CHANGE\nc\n";

        let result = three_way_merge(base, left, right);
        assert!(result.has_conflicts);
        assert_eq!(result.conflicts.len(), 1);
        assert!(result.merged_text.contains("<<<<<<< Left"));
        assert!(result.merged_text.contains("LEFT_CHANGE"));
        assert!(result.merged_text.contains("RIGHT_CHANGE"));
        assert!(result.merged_text.contains(">>>>>>> Right"));
    }

    #[test]
    fn merge_independent_changes_no_conflict() {
        let base = "a\nb\nc\nd\ne\n";
        let left = "LEFT_CHANGE\nb\nc\nd\ne\n";
        let right = "a\nb\nc\nRIGHT_CHANGE\ne\n";

        let result = three_way_merge(base, left, right);
        assert!(!result.has_conflicts);
        assert!(result.merged_text.contains("LEFT_CHANGE"));
        assert!(result.merged_text.contains("RIGHT_CHANGE"));
    }

    #[test]
    fn merge_left_deletes_right_changes_conflict() {
        let base = "a\nb\nc\n";
        let left = "a\nc\n"; // deletes "b"
        let right = "a\nMODIFIED\nc\n"; // changes "b" to "MODIFIED"

        let result = three_way_merge(base, left, right);
        assert!(result.has_conflicts);
    }

    #[test]
    fn merge_add_same_new_line() {
        let base = "a\nb\n";
        let left = "a\nNEW\nb\n";
        let right = "a\nNEW\nb\n";

        let result = three_way_merge(base, left, right);
        assert!(!result.has_conflicts);
        assert!(result.merged_text.contains("NEW"));
    }

    #[test]
    fn merge_multiple_independent_adds() {
        let base = "a\nd\n";
        let left = "LEFT\na\nd\n";
        let right = "a\nd\nRIGHT\n";

        let result = three_way_merge(base, left, right);
        assert!(!result.has_conflicts);
        assert!(result.merged_text.contains("LEFT"));
        assert!(result.merged_text.contains("RIGHT"));
    }

    #[test]
    fn merge_with_trailing_newline() {
        let base = "a\nb\nc\n";
        let left = "a\nb\nc\n";
        let right = "a\nb\nc\n";

        let result = three_way_merge(base, left, right);
        assert!(!result.has_conflicts);
        assert_eq!(result.merged_text, "a\nb\nc");
    }

    #[test]
    fn merge_both_delete_same_line() {
        let base = "a\nb\nc\n";
        let left = "a\nc\n";
        let right = "a\nc\n";

        let result = three_way_merge(base, left, right);
        assert!(!result.has_conflicts);
        assert_eq!(result.merged_text, "a\nc");
    }

    #[test]
    fn merge_complex_scenario() {
        let base = "fn hello() {\n    let x = 1;\n    let y = 2;\n    println!(\"sum: {}\", x + y);\n}\n";
        let left = "fn hello() {\n    let x = 10;\n    let y = 2;\n    println!(\"sum: {}\", x + y);\n}\n";
        let right = "fn hello() {\n    let x = 1;\n    let y = 2;\n    println!(\"product: {}\", x * y);\n}\n";

        let result = three_way_merge(base, left, right);
        // Independent changes (different lines) → no conflict
        assert!(!result.has_conflicts);
        assert!(result.merged_text.contains("let x = 10;"));
        assert!(result.merged_text.contains("product:"));
    }

    #[test]
    fn merge_serde_roundtrip() {
        let result = three_way_merge("a\nb\n", "a\nX\n", "a\nY\n");
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: MergeResult = serde_json::from_str(&json).unwrap();
        assert_eq!(result.has_conflicts, deserialized.has_conflicts);
        assert_eq!(result.conflicts.len(), deserialized.conflicts.len());
    }

    // ── High-fidelity integration tests (real file I/O) ──

    #[test]
    fn merge_from_real_files_no_conflict() {
        let dir = tempfile::tempdir().unwrap();
        let base_path = dir.path().join("base.txt");
        let left_path = dir.path().join("left.txt");
        let right_path = dir.path().join("right.txt");

        std::fs::write(&base_path, "a\nb\nc\n").unwrap();
        std::fs::write(&left_path, "a\nCHANGED\nc\n").unwrap();
        std::fs::write(&right_path, "a\nCHANGED\nc\n").unwrap();

        let base = std::fs::read_to_string(&base_path).unwrap();
        let left = std::fs::read_to_string(&left_path).unwrap();
        let right = std::fs::read_to_string(&right_path).unwrap();

        let result = three_way_merge(&base, &left, &right);
        assert!(!result.has_conflicts);
        assert!(result.merged_text.contains("CHANGED"));
    }

    #[test]
    fn merge_from_real_files_with_conflict() {
        let dir = tempfile::tempdir().unwrap();
        let base_path = dir.path().join("base.txt");
        let left_path = dir.path().join("left.txt");
        let right_path = dir.path().join("right.txt");

        std::fs::write(&base_path, "a\nb\nc\n").unwrap();
        std::fs::write(&left_path, "a\nLEFT\nc\n").unwrap();
        std::fs::write(&right_path, "a\nRIGHT\nc\n").unwrap();

        let base = std::fs::read_to_string(&base_path).unwrap();
        let left = std::fs::read_to_string(&left_path).unwrap();
        let right = std::fs::read_to_string(&right_path).unwrap();

        let result = three_way_merge(&base, &left, &right);
        assert!(result.has_conflicts);
        assert!(result.merged_text.contains("<<<<<<< Left"));
        assert!(result.merged_text.contains("LEFT"));
        assert!(result.merged_text.contains("RIGHT"));
        assert!(result.merged_text.contains(">>>>>>> Right"));
    }

    #[test]
    fn merge_from_real_files_large() {
        let dir = tempfile::tempdir().unwrap();
        let base_path = dir.path().join("base.txt");
        let left_path = dir.path().join("left.txt");
        let right_path = dir.path().join("right.txt");

        // Simulate real code-like content
        let base = "fn hello() {\n    let x = 1;\n    let y = 2;\n    println!(\"sum: {}\", x + y);\n}\n";
        let left = "fn hello() {\n    let x = 10;\n    let y = 2;\n    println!(\"sum: {}\", x + y);\n}\n";
        let right = "fn hello() {\n    let x = 1;\n    let y = 2;\n    println!(\"product: {}\", x * y);\n}\n";

        std::fs::write(&base_path, base).unwrap();
        std::fs::write(&left_path, left).unwrap();
        std::fs::write(&right_path, right).unwrap();

        // Read back exactly as Tauri's merge_files command would
        let base_content = std::fs::read_to_string(&base_path).unwrap();
        let left_content = std::fs::read_to_string(&left_path).unwrap();
        let right_content = std::fs::read_to_string(&right_path).unwrap();

        let result = three_way_merge(&base_content, &left_content, &right_content);

        // Independent changes on different lines → no conflict
        assert!(!result.has_conflicts);
        assert!(result.merged_text.contains("let x = 10;"));
        assert!(result.merged_text.contains("product:"));

        // Verify serde roundtrip on the result
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: MergeResult = serde_json::from_str(&json).unwrap();
        assert_eq!(result.merged_text, deserialized.merged_text);
    }
}
