**English** · [中文](RELEASE.md)

# Differ Release Notes

## v0.2.0 — Git Integration & Interactive Merge

### New Features

#### Git Repository Integration
- Open local Git repositories (path input, recent repos list, directory picker, drag & drop)
- File changes panel — view working tree changes (added/modified/deleted/conflicted/renamed)
- Commit history — paginated commit log with per-commit diff view
- Branch management — view local branches, compare branches side-by-side
- Interactive 3-way merge for conflicted files — click on conflicted file to enter merge view

#### Interactive Merge Conflict Resolution
- Three-pane panel showing Base / Ours / Theirs
- Per-conflict navigation (previous/next)
- "Adopt left" / "Adopt right" one-click resolution
- Editable merge result area
- Write to working tree and stage (git add) on save

### Fixes
- Fixed release build losing all styles (migrated Tailwind from CDN to local bundling)
- Fixed stale line offset causing incomplete conflict resolution in multi-conflict merges
- Fixed UI not updating after adoptSide due to SolidJS reactivity issue

### Supported Languages (Syntax-Aware Diff)
Same as v0.1.0: Rust, JavaScript/JSX, TypeScript/TSX, Python

### Known Limitations
- Same as v0.1.0; additionally: no git push/pull remote operations yet
- Interactive merge does not support re-parsing manually edited conflict text yet

### System Requirements
- macOS 12.0+ (Tauri v2 minimum requirement)
- 500MB disk space
- 4GB RAM recommended for large file diffs

---

## v0.1.0 (Initial Release)

### Features

#### File Diff
- Side-by-side line-level diff with syntax highlighting
- Scroll synchronization between left and right panels
- Inline change details with added/deleted line counts
- File dialog integration for file selection

#### 3-Way Merge
- Three-pane merge view (base, left, right) with result editor
- Automatic conflict detection and highlighting
- Manual conflict resolution with inline editing
- Side selection to apply changes from either version

#### Directory Comparison
- Recursive directory diff with tree view
- Added/Removed/Modified file status filtering
- One-click navigation from directory diff to file diff
- Optional base directory for merge integration

#### Syntax-Aware Diff (tree-sitter)
- AST-based hunk regrouping by function/class boundaries
- Context headers showing function names (`@@ fn foo()`)
- Graceful fallback to line-level diff for unsupported languages

#### History & Dashboard
- Dashboard with statistics and quick actions
- Recent activity list for quick access
- Full history view with type filtering (diff/merge/directory)
- History persistence via Tauri Store (50 entries max)

#### Live File Watching
- Monitor files for changes and auto-re-diff on save
- Visual indicator when file is being watched

#### Keyboard Navigation
- `Ctrl+N` — New diff
- `Ctrl+S` — Toggle syntax mode
- `Ctrl+W` — Close tab
- `Ctrl+Tab` — Next tab
- `Escape` — Close dialogs

#### UI & Experience
- Dark theme with carefully crafted color palette
- Responsive layout with sticky headers
- DSL component library for consistent design
- Chinese UI localization

### Supported Languages (Syntax-Aware Diff)
- Rust
- JavaScript / JSX
- TypeScript / TSX
- Python

### Known Limitations
- Inline word-level diff within syntax mode not yet implemented
- No plugin/extensions system
- No remote repository integration (GitHub/GitLab)
- Large file diff performance may be impacted by syntax analysis

### System Requirements
- macOS 10.15+ (Catalina)
- 500MB disk space
- 4GB RAM recommended for large file diffs

### Technical Details
- **Frontend**: SolidJS + TypeScript + Tailwind CSS + Vite
- **Backend**: Rust + Tauri v2
- **Diff Engine**: `similar` crate (line-level), tree-sitter 0.24 (syntax)
- **Install**:
  - macOS: `brew tap peterfei/homebrew-differ && brew install --cask differ`
  - Windows: `winget install peterfei.Differ` (pending merge)
  - Direct download: macOS .dmg / Windows .msi & .exe / Linux .deb & .AppImage
