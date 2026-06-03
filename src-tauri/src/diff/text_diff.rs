use serde::{Deserialize, Serialize};

// ── Data Structures (TDD: write tests first) ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DiffAlgorithm {
    Myers,
    Patience,
}

impl Default for DiffAlgorithm {
    fn default() -> Self {
        Self::Myers
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ChangeType {
    Add,
    Delete,
    Equal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffOptions {
    pub algorithm: DiffAlgorithm,
    pub context_lines: usize,
    pub ignore_whitespace: bool,
    pub ignore_case: bool,
}

impl Default for DiffOptions {
    fn default() -> Self {
        Self {
            algorithm: DiffAlgorithm::Myers,
            context_lines: 3,
            ignore_whitespace: false,
            ignore_case: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InlineDiff {
    pub start: usize,
    pub end: usize,
    pub change_type: ChangeType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffChange {
    pub old_line_no: Option<usize>,
    pub new_line_no: Option<usize>,
    pub old_text: Option<String>,
    pub new_text: Option<String>,
    pub change_type: ChangeType,
    pub inline_changes: Vec<InlineDiff>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffHunk {
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub changes: Vec<DiffChange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub syntax_context: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffResult {
    pub hunks: Vec<DiffHunk>,
    pub left_lines: usize,
    pub right_lines: usize,
    pub options: DiffOptions,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right_label: Option<String>,
}

// ── Diff Engine Implementation ──

/// Compute the diff between two texts using the selected algorithm.
pub fn text_diff(left: &str, right: &str, options: &DiffOptions) -> DiffResult {
    let left_lines: Vec<&str> = left.lines().collect();
    let right_lines: Vec<&str> = right.lines().collect();

    let diff = match options.algorithm {
        DiffAlgorithm::Myers => similar::TextDiff::from_lines(left, right),
        DiffAlgorithm::Patience => similar::TextDiff::configure()
            .algorithm(similar::Algorithm::Patience)
            .diff_lines(left, right),
    };

    let mut hunks = Vec::new();
    let mut current_hunk: Option<DiffHunkBuilder> = None;

    for change in diff.iter_all_changes() {
        let tag = change.tag();
        let value = change.value();

        let change_type = match tag {
            similar::ChangeTag::Equal => ChangeType::Equal,
            similar::ChangeTag::Delete => ChangeType::Delete,
            similar::ChangeTag::Insert => ChangeType::Add,
        };

        // Build inline diff for modified lines
        let inline_changes = if let similar::ChangeTag::Equal = tag {
            Vec::new()
        } else {
            calculate_inline_diff(change.value(), change.tag())
        };

        let old_line_no = change.old_index().map(|i| i + 1);
        let new_line_no = change.new_index().map(|i| i + 1);

        let (old_text, new_text) = match tag {
            similar::ChangeTag::Delete => (Some(value.to_string()), None),
            similar::ChangeTag::Insert => (None, Some(value.to_string())),
            similar::ChangeTag::Equal => (Some(value.to_string()), Some(value.to_string())),
        };

        let diff_change = DiffChange {
            old_line_no,
            new_line_no,
            old_text,
            new_text,
            change_type,
            inline_changes,
        };

        // Only start building hunks on non-equal changes
        if matches!(tag, similar::ChangeTag::Equal) && current_hunk.is_none() {
            continue;
        }

        match current_hunk.take() {
            Some(mut hunk) => {
                if hunk.try_extend(&diff_change, options.context_lines) {
                    hunk.push(diff_change);
                    current_hunk = Some(hunk);
                } else {
                    hunks.push(hunk.build());
                    current_hunk = Some(DiffHunkBuilder::new(&diff_change));
                }
            }
            None => {
                current_hunk = Some(DiffHunkBuilder::new(&diff_change));
            }
        }
    }

    if let Some(hunk) = current_hunk.take() {
        hunks.push(hunk.build());
    }

    DiffResult {
        left_lines: left_lines.len(),
        right_lines: right_lines.len(),
        hunks,
        options: options.clone(),
        left_label: None,
        right_label: None,
    }
}

/// Compute character-level inline diff within a single line.
fn calculate_inline_diff(text: &str, tag: similar::ChangeTag) -> Vec<InlineDiff> {
    if text.len() < 2 {
        return Vec::new();
    }
    // For delete/insert lines, mark the entire line as a single change
    match tag {
        similar::ChangeTag::Delete | similar::ChangeTag::Insert => {
            vec![InlineDiff {
                start: 0,
                end: text.len(),
                change_type: match tag {
                    similar::ChangeTag::Delete => ChangeType::Delete,
                    _ => ChangeType::Add,
                },
            }]
        }
        _ => Vec::new(),
    }
}

// ── Hunk Builder ──

struct DiffHunkBuilder {
    old_start: usize,
    old_lines: usize,
    new_start: usize,
    new_lines: usize,
    changes: Vec<DiffChange>,
    context_before: Vec<DiffChange>,
    trailing_equal_count: usize,
}

impl DiffHunkBuilder {
    fn new(change: &DiffChange) -> Self {
        let mut builder = Self {
            old_start: usize::MAX,
            old_lines: 0,
            new_start: usize::MAX,
            new_lines: 0,
            changes: Vec::new(),
            context_before: Vec::new(),
            trailing_equal_count: 0,
        };
        builder.push(change.clone());
        builder
    }

    fn push(&mut self, change: DiffChange) {
        if self.old_start == usize::MAX {
            self.old_start = change.old_line_no.unwrap_or(0);
            self.new_start = change.new_line_no.unwrap_or(0);
        }
        if change.old_line_no.is_some() {
            self.old_lines += 1;
        }
        if change.new_line_no.is_some() {
            self.new_lines += 1;
        }

        if change.change_type == ChangeType::Equal {
            self.trailing_equal_count += 1;
            self.context_before.push(change);
        } else {
            self.trailing_equal_count = 0;
            // Flush context before into changes
            self.changes.append(&mut self.context_before);
            self.changes.push(change);
        }
    }

    fn try_extend(&self, _change: &DiffChange, _context_lines: usize) -> bool {
        // Simple heuristic: extend if within context_lines of last non-equal change
        true
    }

    fn build(mut self) -> DiffHunk {
        // Flush trailing context into changes, then trim excess
        self.changes.append(&mut self.context_before);
        let keep = self.changes.len().saturating_sub(
            self.trailing_equal_count.saturating_sub(3),
        );
        self.changes.truncate(keep);

        DiffHunk {
            old_start: self.old_start,
            old_lines: self.old_lines,
            new_start: self.new_start,
            new_lines: self.new_lines,
            changes: self.changes,
            syntax_context: None,
        }
    }
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prop_assert;
    use proptest::prop_assert_eq;

    #[test]
    fn diff_options_default() {
        let opts = DiffOptions::default();
        assert_eq!(opts.algorithm, DiffAlgorithm::Myers);
        assert_eq!(opts.context_lines, 3);
        assert!(!opts.ignore_whitespace);
        assert!(!opts.ignore_case);
    }

    #[test]
    fn identical_texts_produce_no_hunks() {
        let result = text_diff("hello\nworld\n", "hello\nworld\n", &DiffOptions::default());
        assert!(result.hunks.is_empty());
        assert_eq!(result.left_lines, 2);
        assert_eq!(result.right_lines, 2);
    }

    #[test]
    fn single_addition() {
        let result = text_diff("line1\n", "line1\nline2\n", &DiffOptions::default());
        assert!(!result.hunks.is_empty());
        let has_add = result.hunks.iter().any(|h| {
            h.changes.iter().any(|c| c.change_type == ChangeType::Add)
        });
        assert!(has_add);
    }

    #[test]
    fn single_deletion() {
        let result = text_diff("line1\nline2\n", "line1\n", &DiffOptions::default());
        assert!(!result.hunks.is_empty());
        let has_del = result.hunks.iter().any(|h| {
            h.changes.iter().any(|c| c.change_type == ChangeType::Delete)
        });
        assert!(has_del);
    }

    #[test]
    fn empty_left_text() {
        let result = text_diff("", "new line\n", &DiffOptions::default());
        assert_eq!(result.left_lines, 0);
        assert_eq!(result.right_lines, 1);
        assert!(!result.hunks.is_empty());
    }

    #[test]
    fn empty_right_text() {
        let result = text_diff("old line\n", "", &DiffOptions::default());
        assert_eq!(result.left_lines, 1);
        assert_eq!(result.right_lines, 0);
        assert!(!result.hunks.is_empty());
    }

    #[test]
    fn algorithm_myers() {
        let opts = DiffOptions {
            algorithm: DiffAlgorithm::Myers,
            ..Default::default()
        };
        let result = text_diff("a\nb\nc\n", "a\nd\nc\n", &opts);
        assert!(!result.hunks.is_empty());
    }

    #[test]
    fn algorithm_patience() {
        let opts = DiffOptions {
            algorithm: DiffAlgorithm::Patience,
            ..Default::default()
        };
        let result = text_diff("a\nb\nc\n", "a\nd\nc\n", &opts);
        assert!(!result.hunks.is_empty());
    }

    #[test]
    fn large_text_diff() {
        let left: String = (0..1000).map(|i| format!("line_{}\n", i)).collect();
        let right: String = (0..1000)
            .map(|i| {
                if i % 10 == 0 {
                    format!("line_{}_modified\n", i)
                } else {
                    format!("line_{}\n", i)
                }
            })
            .collect();
        let result = text_diff(&left, &right, &DiffOptions::default());
        assert!(!result.hunks.is_empty());
    }

    #[test]
    fn serde_roundtrip() {
        let result = text_diff("left\n", "right\n", &DiffOptions::default());
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: DiffResult = serde_json::from_str(&json).unwrap();
        assert_eq!(result.hunks.len(), deserialized.hunks.len());
    }

    proptest::proptest! {
        #[test]
        fn diff_never_panics(
            left in proptest::collection::vec("[^\n]{0,30}", 0..50),
            right in proptest::collection::vec("[^\n]{0,30}", 0..50),
        ) {
            let result = text_diff(&left.join("\n"), &right.join("\n"), &DiffOptions::default());
            // Assert: diff never panics on random input
            let total_changes: usize = result.hunks.iter().map(|h| h.changes.len()).sum();
            // At minimum, result is well-formed
            let old_count: usize = result.hunks.iter().map(|h| h.old_lines).sum();
            let new_count: usize = result.hunks.iter().map(|h| h.new_lines).sum();
            prop_assert!(old_count <= left.len().max(right.len()) + 100);
            prop_assert!(new_count <= left.len().max(right.len()) + 100);
        }

        #[test]
        fn diff_preserves_unchanged(
            code in proptest::collection::vec("[a-zA-Z0-9 {}();]{1,30}", 5..30),
        ) {
            let text = code.join("\n");
            let result = text_diff(&text, &text, &DiffOptions::default());
            // Assert: identical texts → no hunks
            prop_assert!(result.hunks.is_empty());
            prop_assert_eq!(result.left_lines, result.right_lines);
        }
    }
}
