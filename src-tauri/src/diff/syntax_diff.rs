// ── langs! 宏：声明式定义语言支持，自动生成 Language 枚举和全部胶水代码 ──
//
// 用法: langs! { ["rs","rust"] => Rust [tree_sitter_rust::language()] [function_item, impl_item] }

macro_rules! langs {
    (
        $(
            [$($ext:expr),+] => $name:ident [ $($grammar:tt)+ ] [ $($kind:ident),* $(,)? ]
        ),+
        $(,)?
    ) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum Language {
            $($name,)*
        }

        impl Language {
            pub fn grammar(self) -> tree_sitter::Language {
                match self {
                    $(Language::$name => { $($grammar)+ },)*
                }
            }

            pub fn significant_kinds(self) -> &'static [&'static str] {
                match self {
                    $(Language::$name => &[$(stringify!($kind)),*],)*
                }
            }

            pub fn extensions(self) -> &'static [&'static str] {
                match self {
                    $(Language::$name => &[$($ext),+],)*
                }
            }

            pub fn all() -> &'static [Language] {
                &[$(Language::$name),*]
            }
        }

        impl std::str::FromStr for Language {
            type Err = ();
            fn from_str(s: &str) -> Result<Self, Self::Err> {
                Ok(match s {
                    $(stringify!($name) => Language::$name,)*
                    _ => return Err(()),
                })
            }
        }

        impl std::fmt::Display for Language {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                match self {
                    $(Language::$name => write!(f, stringify!($name)),)*
                }
            }
        }

        /// Detect language from file path by extension.
        pub fn detect_language(path: &str) -> Option<Language> {
            if let Some(ext) = path.rsplit('.').next() {
                match ext {
                    $($($ext => Some(Language::$name),)+)*
                    _ => None,
                }
            } else {
                None
            }
        }
    };
}

// ── Language definitions ──
// Format: ([extensions], EnumName, grammar_fn(), [significant_kinds])
//
// significant_kinds: AST node types that represent "containers" for hunk grouping.
// These are the named node types from each grammar that we treat as grouping boundaries.
langs! {
    ["rs", "rust"] => Rust [tree_sitter_rust::LANGUAGE.into()] [
        function_item, impl_item, struct_item, trait_item, enum_item,
        mod_item, macro_definition, static_item, const_item, type_item,
    ],
    ["js", "mjs", "cjs"] => JavaScript [tree_sitter_javascript::LANGUAGE.into()] [
        function_declaration, class_declaration, method_definition,
        arrow_function, generator_function_declaration,
        export_statement,
    ],
    ["ts", "mts", "cts"] => TypeScript [tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()] [
        function_declaration, class_declaration, method_definition,
        interface_declaration, type_alias_declaration, enum_declaration,
        arrow_function, module_declaration, abstract_class_declaration,
    ],
    ["py"] => Python [tree_sitter_python::LANGUAGE.into()] [
        function_definition, class_definition,
        decorated_definition, async_function_definition,
    ],
}

// ── Line-to-AST mapping type ──

/// For each line (1-based), the list of significant AST nodes containing it.
/// Inner vec is ordered outermost → innermost.
type LineMapping = Vec<Vec</* kind */ String>>;

/// Record of a significant AST node for hunk anchor tracking.
#[derive(Debug, Clone)]
struct NodeAnchor {
    /// AST node kind (e.g. "function_item")
    kind: String,
    /// Start line (1-based)
    start_line: usize,
    /// End line (1-based, inclusive)
    end_line: usize,
    /// Optional name extracted via `child_by_field_name("name")`
    name: Option<String>,
}

// ── Parser cache ──
// Language is Send+Sync; Parser is not.
// So we cache Language (cheap clone, just a pointer) and create Parser fresh each time.

use std::sync::{LazyLock, Mutex};
use std::collections::HashMap;
use tree_sitter::{Parser, Tree};

static LANGUAGES: LazyLock<Mutex<HashMap<&'static str, tree_sitter::Language>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Parse text with tree-sitter for a given language.
/// Returns a Tree on success. Caller gets root via tree.root_node().
fn parse_text(text: &str, lang: Language) -> Option<Tree> {
    let lang_name: &'static str = match lang {
        Language::Rust => "Rust",
        Language::JavaScript => "JavaScript",
        Language::TypeScript => "TypeScript",
        Language::Python => "Python",
    };

    // Try to get cached Language, or insert it
    let cached_lang = {
        let mut cache = LANGUAGES.lock().ok()?;
        if let Some(l) = cache.get(lang_name) {
            l.clone()
        } else {
            let l = lang.grammar();
            cache.insert(lang_name, l.clone());
            l
        }
    };

    let mut parser = Parser::new();
    parser.set_language(&cached_lang).ok()?;
    parser.parse(text, None)
}

/// Build anchors list from an AST root node.
fn build_anchors(root: tree_sitter::Node, source: &[u8], sig_kinds: &[&str]) -> Vec<NodeAnchor> {
    let mut anchors: Vec<NodeAnchor> = Vec::new();
    collect_anchors(root, sig_kinds, &mut anchors, source);
    anchors
}

/// Build a mapping from source lines to containing significant AST nodes.
/// only scans node kinds in `sig_kinds`.
fn build_line_mapping(
    root: tree_sitter::Node,
    line_count: usize,
    sig_kinds: &[&str],
) -> LineMapping {
    let mut anchors: Vec<NodeAnchor> = Vec::new();
    collect_anchors(root, sig_kinds, &mut anchors, b"");

    // One entry per line (1-based), plus index 0 unused
    let mut result: LineMapping = vec![Vec::new(); line_count + 1];

    for anchor in &anchors {
        for line in anchor.start_line..=anchor.end_line.min(line_count) {
            result[line].push(anchor.kind.clone());
        }
    }

    result
}

/// Recursively walk tree-sitter AST and collect NodeAnchors for significant kinds.
fn collect_anchors<'a>(
    node: tree_sitter::Node<'a>,
    sig_kinds: &[&str],
    anchors: &mut Vec<NodeAnchor>,
    source: &'a [u8],
) {
    let kind = node.kind();

    if node.is_named() && sig_kinds.contains(&kind) {
        let start_line = node.start_position().row + 1; // 1-based
        let end_line = node.end_position().row + 1;
        let name = node.child_by_field_name("name")
            .and_then(|n| n.utf8_text(source).ok())
            .map(|s| s.to_string());

        anchors.push(NodeAnchor {
            kind: kind.to_string(),
            start_line,
            end_line,
            name,
        });
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.is_named() {
            collect_anchors(child, sig_kinds, anchors, source);
        }
    }
}

/// Find the narrowest significant node (by end_line offset) that contains all given lines.
fn find_containing_anchor(
    anchors: &[NodeAnchor],
    lines: &[usize],
) -> Option<NodeAnchor> {
    if lines.is_empty() || anchors.is_empty() {
        return None;
    }

    let min_line = *lines.iter().min().unwrap();
    let max_line = *lines.iter().max().unwrap();

    anchors
        .iter()
        .filter(|a| a.start_line <= min_line && a.end_line >= max_line)
        .min_by_key(|a| a.end_line - a.start_line)
        .cloned()
}

/// Regroup hunks using AST anchor information.
///
/// Strategy:
/// 1. Flatten all changes from all hunks into one ordered list
/// 2. Assign each change to an anchor by (kind, name) identity
/// 3. Split into groups when anchor identity changes
/// 4. Merge context-only (all Equal) groups with neighbors
/// 5. Rebuild DiffHunks from groups
///
/// This handles the case where `similar` merges changes across function
/// boundaries into a single hunk — we split it back apart by AST anchors.
fn regroup_hunks(
    hunks: Vec<DiffHunk>,
    left_anchors: &[NodeAnchor],
    right_anchors: &[NodeAnchor],
    _lang: Language,
) -> Vec<DiffHunk> {
    use crate::diff::text_diff::DiffHunk;

    if hunks.is_empty() || (left_anchors.is_empty() && right_anchors.is_empty()) {
        return hunks;
    }

    // ── Step 1: Flatten all changes ──

    let all_changes: Vec<DiffChange> = hunks
        .into_iter()
        .flat_map(|h| h.changes)
        .collect();

    if all_changes.is_empty() {
        return vec![];
    }

    // ── Helper: find containing anchor by line number ──

    fn find_anchor_by_line<'a>(line: usize, anchors: &'a [NodeAnchor]) -> Option<&'a NodeAnchor> {
        anchors
            .iter()
            .filter(|a| a.start_line <= line && a.end_line >= line)
            .min_by_key(|a| a.end_line - a.start_line)
    }

    // Build an identity key for an anchor: (kind, name_or_empty)
    fn anchor_identity(a: &NodeAnchor) -> (String, String) {
        (a.kind.clone(), a.name.clone().unwrap_or_default())
    }

    // ── Step 2: Assign each change to an anchor identity ──

    let mut grouped: Vec<(Vec<DiffChange>, Option<(String, String)>)> = Vec::new();

    for change in all_changes {
        // Determine anchor from the relevant side
        let anchor = if change.old_line_no.is_some() {
            change.old_line_no
                .and_then(|l| find_anchor_by_line(l, left_anchors))
                .or_else(|| change.new_line_no.and_then(|l| find_anchor_by_line(l, right_anchors)))
        } else {
            change.new_line_no
                .and_then(|l| find_anchor_by_line(l, right_anchors))
                .or_else(|| change.old_line_no.and_then(|l| find_anchor_by_line(l, left_anchors)))
        };

        let key: Option<(String, String)> = anchor.map(|a| anchor_identity(a));

        // Start new group if anchor identity differs from last group
        let same_group = grouped.last()
            .map(|(_, last_key)| *last_key == key)
            .unwrap_or(false);

        if same_group {
            grouped.last_mut().unwrap().0.push(change);
        } else {
            grouped.push((vec![change], key));
        }
    }

    // ── Step 3: Merge context-only groups (all Equal) with neighbors ──

    let mut merged_groups: Vec<(Vec<DiffChange>, Option<(String, String)>)> = Vec::new();

    for (changes, key) in grouped {
        let is_context = changes.iter().all(|c| c.change_type == ChangeType::Equal);
        if is_context && !merged_groups.is_empty() {
            // Merge with previous group — it's just context between changes
            merged_groups.last_mut().unwrap().0.extend(changes);
        } else if is_context && merged_groups.is_empty() {
            // Leading context only — skip
            continue;
        } else {
            merged_groups.push((changes, key));
        }
    }

    // ── Step 3b: Merge groups that share the same non-None anchor ──
    // This handles the case where `similar` outputs Delete(old=1), Delete(old=2),
    // Insert(new=1), Insert(new=2) — splitting the same conceptual "line edit"
    // across multiple groups. We merge groups with the same anchor identity.

    let mut anchor_merged: Vec<(Vec<DiffChange>, Option<(String, String)>)> = Vec::new();

    for (changes, key) in merged_groups {
        if key.is_some() {
            // Check if we have an existing group with the same key
            if let Some(pos) = anchor_merged.iter().position(|(_, k)| *k == key) {
                anchor_merged[pos].0.extend(changes);
                continue;
            }
        }
        anchor_merged.push((changes, key));
    }

    // ── Step 4: Build DiffHunks from groups ──

    let mut result: Vec<DiffHunk> = Vec::new();

    for (changes, key) in anchor_merged {
        // Find the full anchor to extract name for syntax_context
        let syntax_context = key.and_then(|(ref kind, ref name)| {
            // Only produce context if we have a real name
            if name.is_empty() { None } else { Some(format!("{} {}", kind, name)) }
        });

        let old_start = changes.iter()
            .filter_map(|c| c.old_line_no)
            .min()
            .unwrap_or(1);
        let old_end = changes.iter()
            .filter_map(|c| c.old_line_no)
            .max()
            .unwrap_or(old_start);
        let new_start = changes.iter()
            .filter_map(|c| c.new_line_no)
            .min()
            .unwrap_or(1);
        let new_end = changes.iter()
            .filter_map(|c| c.new_line_no)
            .max()
            .unwrap_or(new_start);

        result.push(DiffHunk {
            old_start,
            old_lines: old_end - old_start + 1,
            new_start,
            new_lines: new_end - new_start + 1,
            changes,
            syntax_context,
        });
    }

    result
}

// ── Public API ──

use crate::diff::text_diff::{ChangeType, DiffChange, DiffHunk, DiffResult};

/// Enhance an existing DiffResult with syntax-aware hunk regrouping.
///
/// This is a post-processing step: it takes the line-based diff result,
/// parses both sides with tree-sitter, and re-groups hunks by AST boundaries.
/// If parsing fails or language is not supported, returns the original result unchanged.
pub fn enhance_with_syntax(
    result: DiffResult,
    left_text: &str,
    right_text: &str,
    lang: Option<Language>,
) -> DiffResult {
    let lang = match lang {
        Some(l) => l,
        None => return result,
    };

    let sig_kinds = lang.significant_kinds();

    // Parse both sides
    let left_tree = match parse_text(left_text, lang) {
        Some(v) => v,
        None => return result,
    };
    let right_tree = match parse_text(right_text, lang) {
        Some(v) => v,
        None => return result,
    };

    let left_source = left_text.as_bytes();
    let right_source = right_text.as_bytes();
    let left_root = left_tree.root_node();
    let right_root = right_tree.root_node();

    // Build anchors
    let left_anchors = build_anchors(left_root, left_source, sig_kinds);
    let right_anchors = build_anchors(right_root, right_source, sig_kinds);

    if left_anchors.is_empty() && right_anchors.is_empty() {
        return result;
    }

    // Regroup hunks
    let enhanced_hunks = regroup_hunks(result.hunks, &left_anchors, &right_anchors, lang);

    DiffResult {
        hunks: enhanced_hunks,
        left_lines: result.left_lines,
        right_lines: result.right_lines,
        options: result.options,
    }
}

// ── Tests (TDD: written before implementation) ──

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diff::text_diff::{text_diff, DiffOptions, DiffHunk, DiffChange, ChangeType, DiffResult};

    // ── detect_language tests ──

    #[test]
    fn detect_rust_from_rs() {
        assert_eq!(detect_language("main.rs"), Some(Language::Rust));
    }

    #[test]
    fn detect_rust_from_full_path() {
        assert_eq!(detect_language("/home/user/project/src/lib.rs"), Some(Language::Rust));
    }

    #[test]
    fn detect_javascript_from_js() {
        assert_eq!(detect_language("app.js"), Some(Language::JavaScript));
    }

    #[test]
    fn detect_javascript_from_mjs() {
        assert_eq!(detect_language("server.mjs"), Some(Language::JavaScript));
    }

    #[test]
    fn detect_typescript_from_ts() {
        assert_eq!(detect_language("component.ts"), Some(Language::TypeScript));
    }

    #[test]
    fn detect_typescript_mts() {
        assert_eq!(detect_language("server.mts"), Some(Language::TypeScript));
    }

    #[test]
    fn detect_python() {
        assert_eq!(detect_language("script.py"), Some(Language::Python));
    }

    #[test]
    fn detect_unknown_returns_none() {
        assert_eq!(detect_language("readme.md"), None);
        assert_eq!(detect_language("Makefile"), None);
        assert_eq!(detect_language(""), None);
    }

    // ── AST parsing tests ──

    #[test]
    fn parse_valid_rust() {
        let tree = parse_text("fn foo() {}", Language::Rust).expect("should parse");
        let root = tree.root_node();
        assert_eq!(root.kind(), "source_file");
        let mut cursor = root.walk();
        let children: Vec<tree_sitter::Node> = root.children(&mut cursor).collect();
        assert!(children.iter().any(|n| n.kind() == "function_item"));
    }

    #[test]
    fn parse_valid_javascript() {
        let tree = parse_text("function foo() {}", Language::JavaScript).expect("should parse");
        assert_eq!(tree.root_node().kind(), "program");
    }

    #[test]
    fn parse_valid_python() {
        let tree = parse_text("def foo():\n    pass\n", Language::Python).expect("should parse");
        assert_eq!(tree.root_node().kind(), "module");
    }

    #[test]
    fn parse_invalid_syntax_does_not_panic() {
        let result = parse_text("{{{ !@#$ broken syntax }}", Language::Rust);
        assert!(result.is_some(), "tree-sitter should produce an error tree, not fail");
    }

    #[test]
    fn parse_empty_string() {
        let result = parse_text("", Language::Rust);
        assert!(result.is_some());
    }

    // ── collect_anchors tests ──

    #[test]
    fn anchors_rust_functions() {
        let code = "fn foo() {}\nfn bar() {}\n";
        let tree = parse_text(code, Language::Rust).unwrap();
        let root = tree.root_node();
        let kinds = Language::Rust.significant_kinds();
        let mut anchors: Vec<NodeAnchor> = Vec::new();
        collect_anchors(root, kinds, &mut anchors, code.as_bytes());
        assert_eq!(anchors.len(), 2);
        assert_eq!(anchors[0].name.as_deref(), Some("foo"));
        assert_eq!(anchors[1].name.as_deref(), Some("bar"));
    }

    #[test]
    fn anchors_rust_struct() {
        let code = "struct Point {\n    x: i32,\n    y: i32,\n}\n";
        let tree = parse_text(code, Language::Rust).unwrap();
        let root = tree.root_node();
        let kinds = Language::Rust.significant_kinds();
        let mut anchors: Vec<NodeAnchor> = Vec::new();
        collect_anchors(root, kinds, &mut anchors, code.as_bytes());
        assert!(anchors.iter().any(|a| a.name.as_deref() == Some("Point")));
    }

    #[test]
    fn anchors_python_function() {
        let code = "def hello():\n    pass\n";
        let tree = parse_text(code, Language::Python).unwrap();
        let root = tree.root_node();
        let kinds = Language::Python.significant_kinds();
        let mut anchors: Vec<NodeAnchor> = Vec::new();
        collect_anchors(root, kinds, &mut anchors, code.as_bytes());
        assert_eq!(anchors.len(), 1);
        assert_eq!(anchors[0].name.as_deref(), Some("hello"));
    }

    #[test]
    fn anchors_javascript_function() {
        let code = "function greet(name) {\n    return name;\n}\n";
        let tree = parse_text(code, Language::JavaScript).unwrap();
        let root = tree.root_node();
        let kinds = Language::JavaScript.significant_kinds();
        let mut anchors: Vec<NodeAnchor> = Vec::new();
        collect_anchors(root, kinds, &mut anchors, code.as_bytes());
        assert_eq!(anchors.len(), 1);
        assert_eq!(anchors[0].name.as_deref(), Some("greet"));
    }

    // ── find_containing_anchor tests ──

    #[test]
    fn find_anchor_for_lines() {
        let anchors = vec![
            NodeAnchor { kind: "function_item".into(), start_line: 1, end_line: 5, name: Some("foo".into()) },
            NodeAnchor { kind: "function_item".into(), start_line: 7, end_line: 10, name: Some("bar".into()) },
        ];
        let found = find_containing_anchor(&anchors, &[2, 3]);
        assert!(found.is_some());
        assert_eq!(found.unwrap().name.as_deref(), Some("foo"));
    }

    #[test]
    fn find_anchor_crossing_boundary() {
        let anchors = vec![
            NodeAnchor { kind: "function_item".into(), start_line: 1, end_line: 5, name: Some("foo".into()) },
            NodeAnchor { kind: "function_item".into(), start_line: 7, end_line: 10, name: Some("bar".into()) },
        ];
        // Lines span across both functions — no single anchor contains all
        let found = find_containing_anchor(&anchors, &[4, 8]);
        assert!(found.is_none());
    }

    #[test]
    fn find_anchor_empty_lines() {
        let anchors = vec![
            NodeAnchor { kind: "function_item".into(), start_line: 1, end_line: 5, name: Some("foo".into()) },
        ];
        assert!(find_containing_anchor(&anchors, &[]).is_none());
    }

    // ── Hunk regrouping tests ──

    /// Helper: create a simple DiffChange
    fn make_change(line: usize, ct: ChangeType) -> DiffChange {
        let (old, new) = match ct {
            ChangeType::Add => (None, Some(line)),
            ChangeType::Delete => (Some(line), None),
            ChangeType::Equal => (Some(line), Some(line)),
        };
        DiffChange {
            old_line_no: old,
            new_line_no: new,
            old_text: if ct != ChangeType::Add { Some("line".into()) } else { None },
            new_text: if ct != ChangeType::Delete { Some("line".into()) } else { None },
            change_type: ct,
            inline_changes: vec![],
        }
    }

    /// Helper: create a hunk from changes
    fn make_hunk(old_start: usize, new_start: usize, changes: Vec<DiffChange>) -> DiffHunk {
        let old_lines = changes.iter()
            .filter_map(|c| c.old_line_no)
            .fold(0usize, |_, l| l);
        let new_lines = changes.iter()
            .filter_map(|c| c.new_line_no)
            .fold(0usize, |_, l| l);
        DiffHunk {
            old_start,
            old_lines: if old_lines >= old_start { old_lines - old_start + 1 } else { 1 },
            new_start,
            new_lines: if new_lines >= new_start { new_lines - new_start + 1 } else { 1 },
            changes,
            syntax_context: None,
        }
    }

    #[test]
    fn hunks_in_same_function_are_merged() {
        // Two changes inside the same function "foo", lines 2 and 3
        let left = "fn foo() {\n    let x = 1;\n    let y = 2;\n    println!(\"{}\", x + y);\n}\n";
        let right = "fn foo() {\n    let x = 10;\n    let y = 20;\n    println!(\"{}\", x + y);\n}\n";

        let result = text_diff(left, right, &DiffOptions::default());
        let enhanced = enhance_with_syntax(result, left, right, Some(Language::Rust));

        // Two changes in same function → should be merged into 1 hunk
        assert_eq!(
            enhanced.hunks.len(),
            1,
            "Expected 1 merged hunk, got {}: {:?}",
            enhanced.hunks.len(),
            enhanced.hunks.iter().map(|h| format!("ctx={:?}", h.syntax_context)).collect::<Vec<_>>()
        );
    }

    #[test]
    fn hunks_in_different_functions_are_not_merged() {
        let left = "fn foo() {\n    1\n}\n\nfn bar() {\n    2\n}\n";
        let right = "fn foo() {\n    10\n}\n\nfn bar() {\n    20\n}\n";

        let result = text_diff(left, right, &DiffOptions::default());
        let enhanced = enhance_with_syntax(result, left, right, Some(Language::Rust));

        // Two separate functions changed → 2 hunks expected
        assert_eq!(
            enhanced.hunks.len(),
            2,
            "Expected 2 separate hunks, got {}",
            enhanced.hunks.len()
        );
    }

    #[test]
    fn unchanged_function_produces_no_extra_hunk() {
        let left = "fn foo() {\n    1\n}\n\nfn bar() {\n    2\n}\n";
        let right = "fn foo() {\n    1\n}\n\nfn bar() {\n    999\n}\n";

        let result = text_diff(left, right, &DiffOptions::default());
        let enhanced = enhance_with_syntax(result, left, right, Some(Language::Rust));

        // Only bar changed → 1 hunk
        assert_eq!(enhanced.hunks.len(), 1);
        // The hunk context should mention "bar"
        assert!(enhanced.hunks[0].syntax_context.is_some());
        let ctx = enhanced.hunks[0].syntax_context.as_deref().unwrap_or("");
        assert!(ctx.contains("bar"), "Hunk context should mention 'bar', got: {}", ctx);
    }

    #[test]
    fn unsupported_language_returns_unchanged() {
        let left = "fn foo() {}\nfn bar() {}\n";
        let right = "fn foo() { let x = 1; }\nfn bar() {}\n";

        let result = text_diff(left, right, &DiffOptions::default());
        let original_count = result.hunks.len();
        let enhanced = enhance_with_syntax(result, left, right, None);

        assert_eq!(enhanced.hunks.len(), original_count);
    }

    #[test]
    fn rust_no_changes_unchanged() {
        let text = "fn foo() {\n    1\n}\n\nfn bar() {\n    2\n}\n";
        let result = text_diff(text, text, &DiffOptions::default());
        let enhanced = enhance_with_syntax(result, text, text, Some(Language::Rust));
        assert_eq!(enhanced.hunks.len(), 0);
    }

    #[test]
    fn syntax_context_shows_function_name() {
        let left = "fn calculate() -> i32 {\n    42\n}\n";
        let right = "fn calculate() -> i32 {\n    99\n}\n";

        let result = text_diff(left, right, &DiffOptions::default());
        let enhanced = enhance_with_syntax(result, left, right, Some(Language::Rust));

        assert_eq!(enhanced.hunks.len(), 1);
        let ctx = enhanced.hunks[0].syntax_context.as_deref().unwrap_or("");
        assert!(ctx.contains("calculate"), "Expected context to mention 'calculate', got: {}", ctx);
    }

    #[test]
    fn serde_roundtrip_enhanced() {
        let left = "fn foo() {\n    1\n}\nfn bar() {\n    2\n}\n";
        let right = "fn foo() {\n    10\n}\nfn bar() {\n    20\n}\n";
        let result = text_diff(left, right, &DiffOptions::default());
        let enhanced = enhance_with_syntax(result, left, right, Some(Language::Rust));
        let json = serde_json::to_string(&enhanced).unwrap();
        let deserialized: DiffResult = serde_json::from_str(&json).unwrap();
        assert_eq!(enhanced.hunks.len(), deserialized.hunks.len());
        for (a, b) in enhanced.hunks.iter().zip(deserialized.hunks.iter()) {
            assert_eq!(a.old_start, b.old_start);
            assert_eq!(a.syntax_context, b.syntax_context);
        }
    }

    #[test]
    fn python_hunk_grouping() {
        let left = "def foo():\n    pass\n\ndef bar():\n    pass\n";
        let right = "def foo():\n    return 1\n\ndef bar():\n    return 2\n";

        let result = text_diff(left, right, &DiffOptions::default());
        let enhanced = enhance_with_syntax(result, left, right, Some(Language::Python));

        // Two functions changed → 2 hunks
        assert_eq!(enhanced.hunks.len(), 2);
    }

    #[test]
    fn javascript_hunk_grouping() {
        let left = "function foo() { return 1; }\nfunction bar() { return 2; }\n";
        let right = "function foo() { return 10; }\nfunction bar() { return 20; }\n";

        let result = text_diff(left, right, &DiffOptions::default());
        let enhanced = enhance_with_syntax(result, left, right, Some(Language::JavaScript));

        assert_eq!(enhanced.hunks.len(), 2);
    }

}
