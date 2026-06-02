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
    let change_ops_l: Vec<&DiffOp> =
        diff_l.ops().iter().filter(|o| o.as_tag_tuple().0 != similar::DiffTag::Equal).collect();
    let change_ops_r: Vec<&DiffOp> =
        diff_r.ops().iter().filter(|o| o.as_tag_tuple().0 != similar::DiffTag::Equal).collect();

    let mut result: Vec<String> = Vec::new();
    let mut conflicts: Vec<MergeConflict> = Vec::new();

    let mut i = 0; // index in change_ops_l
    let mut j = 0; // index in change_ops_r
    let mut base_pos = 0; // current position in base[0..n]

    loop {
        let op_l = change_ops_l.get(i).copied();
        let op_r = change_ops_r.get(j).copied();

        if op_l.is_none() && op_r.is_none() {
            while base_pos < base_lines.len() {
                result.push(base_lines[base_pos].to_string());
                base_pos += 1;
            }
            break;
        }

        // ── 1. Handle ALL insertions at current base_pos ──
        let mut had_insertions = false;
        loop {
            let ol = change_ops_l.get(i).copied();
            let or = change_ops_r.get(j).copied();

            let ins_l = ol.filter(|o| o.old_range().is_empty() && o.old_range().start == base_pos);
            let ins_r = or.filter(|o| o.old_range().is_empty() && o.old_range().start == base_pos);

            if ins_l.is_some() && ins_r.is_some() {
                let left_new = get_new_lines(ins_l.unwrap(), &diff_l);
                let right_new = get_new_lines(ins_r.unwrap(), &diff_r);
                if left_new == right_new {
                    for line in &left_new {
                        result.push(line.clone());
                    }
                } else {
                    let start_line = result.len() + 1;
                    conflicts.push(MergeConflict {
                        left_content: left_new.clone(),
                        right_content: right_new.clone(),
                        start_line,
                    });
                    push_conflict_markers(&mut result, &left_new, &right_new, start_line);
                }
                i += 1;
                j += 1;
                had_insertions = true;
                continue;
            }
            if ins_l.is_some() {
                for line in get_new_lines(ins_l.unwrap(), &diff_l) {
                    result.push(line.clone());
                }
                i += 1;
                had_insertions = true;
                continue;
            }
            if ins_r.is_some() {
                for line in get_new_lines(ins_r.unwrap(), &diff_r) {
                    result.push(line.clone());
                }
                j += 1;
                had_insertions = true;
                continue;
            }
            break;
        }

        // Re-fetch after insertion processing
        let op_l = change_ops_l.get(i).copied();
        let op_r = change_ops_r.get(j).copied();

        if op_l.is_none() && op_r.is_none() {
            if had_insertions {
                continue; // More base lines may need copying
            }
            while base_pos < base_lines.len() {
                result.push(base_lines[base_pos].to_string());
                base_pos += 1;
            }
            break;
        }

        if base_pos >= base_lines.len() {
            // Past EOF — flush remaining insertions
            for k in i..change_ops_l.len() {
                if change_ops_l[k].old_range().is_empty() && !change_ops_l[k].new_range().is_empty() {
                    for line in get_new_lines(change_ops_l[k], &diff_l) {
                        result.push(line);
                    }
                }
            }
            for k in j..change_ops_r.len() {
                if change_ops_r[k].old_range().is_empty() && !change_ops_r[k].new_range().is_empty() {
                    for line in get_new_lines(change_ops_r[k], &diff_r) {
                        result.push(line);
                    }
                }
            }
            break;
        }

        // ── 2. Handle modifications at current base_pos ──
        let mod_l = op_l.filter(|o| {
            let r = o.old_range();
            !r.is_empty() && r.start <= base_pos && base_pos < r.end
        });
        let mod_r = op_r.filter(|o| {
            let r = o.old_range();
            !r.is_empty() && r.start <= base_pos && base_pos < r.end
        });

        match (mod_l, mod_r) {
            (Some(ol), Some(or)) => {
                let left_new = get_new_lines(ol, &diff_l);
                let right_new = get_new_lines(or, &diff_r);

                let left_is_delete = left_new.is_empty();
                let right_is_delete = right_new.is_empty();

                if left_new == right_new {
                    for line in &left_new {
                        result.push(line.clone());
                    }
                } else if left_is_delete && right_is_delete {
                    // Both deleted same lines
                } else if left_is_delete {
                    let start_line = result.len() + 1;
                    conflicts.push(MergeConflict {
                        left_content: Vec::new(),
                        right_content: right_new.clone(),
                        start_line,
                    });
                    push_conflict_markers(&mut result, &[], &right_new, start_line);
                } else if right_is_delete {
                    let start_line = result.len() + 1;
                    conflicts.push(MergeConflict {
                        left_content: left_new.clone(),
                        right_content: Vec::new(),
                        start_line,
                    });
                    push_conflict_markers(&mut result, &left_new, &[], start_line);
                } else {
                    let start_line = result.len() + 1;
                    conflicts.push(MergeConflict {
                        left_content: left_new.clone(),
                        right_content: right_new.clone(),
                        start_line,
                    });
                    push_conflict_markers(&mut result, &left_new, &right_new, start_line);
                }

                let end = ol.old_range().end.max(or.old_range().end);
                if end > base_pos {
                    base_pos = end;
                }
                i += 1;
                j += 1;
            }

            (Some(ol), None) => {
                // Check for right insertions WITHIN left's modification range → emit before
                // AND right insertions AT the boundary (if left added content) → conflict
                let left_new_all = get_new_lines(ol, &diff_l);
                let left_old_len = ol.old_range().len();
                let left_has_extra = left_new_all.len() > left_old_len;

                // Check for right insertion at boundary (start == end == left's end)
                if left_has_extra {
                    if let Some(or) = change_ops_r.get(j) {
                        if or.old_range().is_empty()
                            && or.old_range().start == ol.old_range().end
                        {
                            let right_inserted = get_new_lines(or, &diff_r);
                            // Emit replacement part of left's change
                            for line in left_new_all.iter().take(left_old_len) {
                                result.push(line.clone());
                            }
                            // Conflict: left's extra vs right's insertion
                            let left_extra: Vec<String> =
                                left_new_all.iter().skip(left_old_len).cloned().collect();
                            let start_line = result.len() + 1;
                            conflicts.push(MergeConflict {
                                left_content: left_extra.clone(),
                                right_content: right_inserted.clone(),
                                start_line,
                            });
                            push_conflict_markers(
                                &mut result, &left_extra, &right_inserted, start_line,
                            );
                            if ol.old_range().end > base_pos {
                                base_pos = ol.old_range().end;
                            }
                            i += 1;
                            j += 1;
                            continue;
                        }
                    }
                }
                // Also check for strict within-range insertions (no boundary collision)
                while let Some(or) = change_ops_r.get(j) {
                    if or.old_range().is_empty()
                        && or.old_range().start >= ol.old_range().start
                        && or.old_range().start < ol.old_range().end
                    {
                        for line in get_new_lines(or, &diff_r) {
                            result.push(line.clone());
                        }
                        j += 1;
                    } else {
                        break;
                    }
                }
                for line in &left_new_all {
                    result.push(line.clone());
                }
                if let Some(or) = change_ops_r.get(j) {
                    if !or.old_range().is_empty() && or.old_range().end <= ol.old_range().end {
                        j += 1;
                    }
                }
                if ol.old_range().end > base_pos {
                    base_pos = ol.old_range().end;
                }
                i += 1;
            }

            (None, Some(or)) => {
                // Check for left insertions WITHIN right's modification range → emit before
                // AND left insertions AT the boundary (if right added content) → conflict
                let right_new_all = get_new_lines(or, &diff_r);
                let right_old_len = or.old_range().len();
                let right_has_extra = right_new_all.len() > right_old_len;

                // Check for left insertion at boundary
                if right_has_extra {
                    if let Some(ol) = change_ops_l.get(i) {
                        if ol.old_range().is_empty()
                            && ol.old_range().start == or.old_range().end
                        {
                            let left_inserted = get_new_lines(ol, &diff_l);
                            // Emit replacement part of right's change
                            for line in right_new_all.iter().take(right_old_len) {
                                result.push(line.clone());
                            }
                            // Conflict: left's insertion vs right's extra
                            let right_extra: Vec<String> =
                                right_new_all.iter().skip(right_old_len).cloned().collect();
                            let start_line = result.len() + 1;
                            conflicts.push(MergeConflict {
                                left_content: left_inserted.clone(),
                                right_content: right_extra.clone(),
                                start_line,
                            });
                            push_conflict_markers(
                                &mut result, &left_inserted, &right_extra, start_line,
                            );
                            if or.old_range().end > base_pos {
                                base_pos = or.old_range().end;
                            }
                            i += 1;
                            j += 1;
                            continue;
                        }
                    }
                }
                // Also check for strict within-range insertions
                while let Some(ol) = change_ops_l.get(i) {
                    if ol.old_range().is_empty()
                        && ol.old_range().start >= or.old_range().start
                        && ol.old_range().start < or.old_range().end
                    {
                        for line in get_new_lines(ol, &diff_l) {
                            result.push(line.clone());
                        }
                        i += 1;
                    } else {
                        break;
                    }
                }
                for line in &right_new_all {
                    result.push(line.clone());
                }
                if let Some(ol) = change_ops_l.get(i) {
                    if !ol.old_range().is_empty() && ol.old_range().end <= or.old_range().end {
                        i += 1;
                    }
                }
                if or.old_range().end > base_pos {
                    base_pos = or.old_range().end;
                }
                j += 1;
            }

            (None, None) => {
                // No modifications at this position. Copy base line and advance.
                // (If there were insertions, they were handled in step 1.)
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

    // ── Insertion handling tests (regression) ──

    #[test]
    fn insertion_in_middle_placed_correctly() {
        // Left inserts "X" between "b" and "c"; right unchanged
        let result = three_way_merge("a\nb\nc\n", "a\nb\nX\nc\n", "a\nb\nc\n");
        assert!(!result.has_conflicts);
        assert_eq!(result.merged_text, "a\nb\nX\nc");
    }

    #[test]
    fn insertion_at_beginning_placed_correctly() {
        let result = three_way_merge("first\nsecond\n", "HEADER\nfirst\nsecond\n", "first\nsecond\n");
        assert!(!result.has_conflicts);
        assert_eq!(result.merged_text, "HEADER\nfirst\nsecond");
    }

    #[test]
    fn both_insert_same_content_at_same_position() {
        let result = three_way_merge("a\nb\n", "a\nSAME\nb\n", "a\nSAME\nb\n");
        assert!(!result.has_conflicts);
        assert_eq!(result.merged_text, "a\nSAME\nb");
    }

    #[test]
    fn both_insert_different_content_at_same_position_conflict() {
        let result = three_way_merge("a\nb\nc\n", "a\nb\nLEFT_ADD\nc\n", "a\nb\nRIGHT_ADD\nc\n");
        assert!(result.has_conflicts);
        assert_eq!(result.conflicts.len(), 1);
        assert!(result.merged_text.contains("<<<<<<< Left"));
        assert!(result.merged_text.contains("LEFT_ADD"));
        assert!(result.merged_text.contains("RIGHT_ADD"));
        assert!(result.merged_text.contains(">>>>>>> Right"));
    }

    #[test]
    fn append_both_same_content_no_conflict() {
        let result = three_way_merge("keep\n", "keep\nEND\n", "keep\nEND\n");
        assert!(!result.has_conflicts);
        assert!(result.merged_text.contains("END"));
    }

    #[test]
    fn append_conflicting_content_conflict() {
        let result = three_way_merge("keep\n", "keep\nleft_add\n", "keep\nright_add\n");
        assert!(result.has_conflicts);
        assert_eq!(result.conflicts.len(), 1);
    }

    #[test]
    fn insertion_not_lost_when_other_side_modifies_before() {
        // Left inserts after "b"; right modifies "b" to "MODIFIED_B"
        let result = three_way_merge("a\nb\nc\n", "a\nb\nINSERTED\nc\n", "a\nMODIFIED_B\nc\n");
        assert!(!result.has_conflicts);
        assert!(result.merged_text.contains("INSERTED"));
        assert!(result.merged_text.contains("MODIFIED_B"));
    }

    #[test]
    fn insertion_not_lost_when_other_side_modifies_range() {
        // Left inserts at position 2; right modifies lines 1..3
        let result = three_way_merge("a\nb\nc\n", "a\nb\nINSERTED\nc\n", "X\nY\nZ\n");
        // These are different changes at overlapping positions
        // Left inserts 'INSERTED' between b and c, right changes all 3 lines
        // The insertion should be preserved
        assert!(result.has_conflicts || result.merged_text.contains("INSERTED"));
    }

    #[test]
    fn independent_insertions_at_different_positions() {
        // Left inserts at beginning, right inserts at end
        let result = three_way_merge("a\nb\n", "LEFT\na\nb\n", "a\nb\nRIGHT\n");
        assert!(!result.has_conflicts);
        assert_eq!(result.merged_text, "LEFT\na\nb\nRIGHT");
    }

    #[test]
    fn three_completely_different_files_detects_conflict() {
        let result = three_way_merge("a\nb\nc\n", "X\nY\nZ\n", "1\n2\n3\n");
        // Each side replaces all lines differently → conflict expected
        assert!(result.has_conflicts);
        assert!(result.merged_text.contains("<<<<<<< Left"));
        assert!(result.merged_text.contains("X"));
        assert!(result.merged_text.contains("Y"));
        assert!(result.merged_text.contains("Z"));
        assert!(result.merged_text.contains("1"));
        assert!(result.merged_text.contains(">>>>>>> Right"));
    }

    #[test]
    fn merge_user_differ_test_main_rs() {
        let base = std::fs::read_to_string("/Users/mac/Downloads/differ-test/base/src/main.rs").unwrap();
        let left = std::fs::read_to_string("/Users/mac/Downloads/differ-test/old/src/main.rs").unwrap();
        let right = std::fs::read_to_string("/Users/mac/Downloads/differ-test/new/src/main.rs").unwrap();

        eprintln!("=== base ({} bytes, {} lines) ===", base.len(), base.lines().count());
        eprintln!("=== left/old ({} bytes, {} lines) ===", left.len(), left.lines().count());
        eprintln!("=== right/new ({} bytes, {} lines) ===", right.len(), right.lines().count());

        let result = three_way_merge(&base, &left, &right);

        eprintln!("=== merge result ===");
        eprintln!("has_conflicts: {}", result.has_conflicts);
        eprintln!("conflict count: {}", result.conflicts.len());
        eprintln!("merged_text ({} bytes):", result.merged_text.len());
        eprintln!("{}", result.merged_text);
        for (i, c) in result.conflicts.iter().enumerate() {
            eprintln!("conflict #{}: start_line={}, left={:?}, right={:?}",
                i, c.start_line, c.left_content, c.right_content);
        }

        // Both sides made changes at overlapping positions — conflict expected
        assert!(result.has_conflicts, "Expected conflicts but got none! Merged text:\n{}", result.merged_text);
    }
}
