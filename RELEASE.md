# Differ Release Notes

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
- **Build**: macOS .app bundle + .dmg installer
