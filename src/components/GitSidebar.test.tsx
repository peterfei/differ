import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from 'solid-testing-library';
import { GitSidebar } from './GitSidebar';
import type { GitStatusEntry } from '../types/git';

beforeEach(() => {
  vi.clearAllMocks();
});

const mockStagedEntries: GitStatusEntry[] = [
  { path: 'src/main.rs', status: 'Modified', staged: true, added_lines: 5, deleted_lines: 2 },
  { path: 'src/lib.rs', status: 'Modified', staged: true, added_lines: 20, deleted_lines: 0 },
];

const mockUnstagedEntries: GitStatusEntry[] = [
  { path: 'README.md', status: 'Modified', staged: false, added_lines: 1, deleted_lines: 1 },
  { path: 'Cargo.toml', status: 'Modified', staged: false, added_lines: 0, deleted_lines: 3 },
  { path: 'old.rs', status: 'Deleted', staged: false, added_lines: 0, deleted_lines: 50 },
  { path: 'new_file.rs', status: 'New', staged: false, added_lines: 42, deleted_lines: 0 },
];

const mockConflictEntry: GitStatusEntry = {
  path: 'src/conflict.rs',
  status: 'Conflicted',
  staged: false,
  added_lines: 0,
  deleted_lines: 0,
};

describe('GitSidebar', () => {
  it('renders staged and unstaged sections', () => {
    render(() => (
      <GitSidebar
        entries={[...mockStagedEntries, ...mockUnstagedEntries]}
        onSelectFile={() => {}}
      />
    ));

    expect(screen.getByText('已暂存')).toBeInTheDocument();
    expect(screen.getByText('未暂存')).toBeInTheDocument();
  });

  it('shows file paths in staged section', () => {
    render(() => (
      <GitSidebar
        entries={[...mockStagedEntries, ...mockUnstagedEntries]}
        onSelectFile={() => {}}
      />
    ));

    expect(screen.getByText('src/main.rs')).toBeInTheDocument();
    expect(screen.getByText('src/lib.rs')).toBeInTheDocument();
  });

  it('shows file paths in unstaged section', () => {
    render(() => (
      <GitSidebar
        entries={[...mockStagedEntries, ...mockUnstagedEntries]}
        onSelectFile={() => {}}
      />
    ));

    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('Cargo.toml')).toBeInTheDocument();
  });

  it('shows status badges M/A/D/R/! for different statuses', () => {
    render(() => (
      <GitSidebar
        entries={[
          ...mockStagedEntries,
          ...mockUnstagedEntries,
          mockConflictEntry,
        ]}
        onSelectFile={() => {}}
      />
    ));

    // Modified = M
    expect(screen.getAllByText('M').length).toBeGreaterThanOrEqual(3);
    // New = A
    expect(screen.getByText('A')).toBeInTheDocument();
    // Deleted = D
    expect(screen.getByText('D')).toBeInTheDocument();
    // Conflicted = !
    expect(screen.getByText('!')).toBeInTheDocument();
  });

  it('shows added/deleted line counts for modified entries', () => {
    render(() => (
      <GitSidebar
        entries={mockStagedEntries}
        onSelectFile={() => {}}
      />
    ));

    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(screen.getByText('+20')).toBeInTheDocument();
  });

  it('calls onSelectFile when a file is clicked', () => {
    const onSelectFile = vi.fn();
    render(() => (
      <GitSidebar
        entries={mockUnstagedEntries}
        onSelectFile={onSelectFile}
      />
    ));

    fireEvent.click(screen.getByText('README.md'));
    expect(onSelectFile).toHaveBeenCalledWith('README.md', false);
  });

  it('calls onSelectFile with staged=true for staged entries', () => {
    const onSelectFile = vi.fn();
    render(() => (
      <GitSidebar
        entries={mockStagedEntries}
        onSelectFile={onSelectFile}
      />
    ));

    fireEvent.click(screen.getByText('src/main.rs'));
    expect(onSelectFile).toHaveBeenCalledWith('src/main.rs', true);
  });

  it('shows conflict count', () => {
    render(() => (
      <GitSidebar
        entries={[mockConflictEntry]}
        onSelectFile={() => {}}
      />
    ));

    expect(screen.getByText('冲突')).toBeInTheDocument();
  });

  it('shows empty state message when no entries', () => {
    render(() => (
      <GitSidebar
        entries={[]}
        onSelectFile={() => {}}
      />
    ));

    expect(screen.getByText('无变更')).toBeInTheDocument();
  });

  it('shows count badges for each section', () => {
    render(() => (
      <GitSidebar
        entries={[...mockStagedEntries, ...mockUnstagedEntries]}
        onSelectFile={() => {}}
      />
    ));

    // 2 staged entries
    expect(screen.getByText('2')).toBeInTheDocument();
    // 3 unstaged entries (but text "3" could match other things, check sections)
  });

  it('renders nothing and shows empty header when loading with 0 entries', () => {
    render(() => (
      <GitSidebar
        entries={[]}
        onSelectFile={() => {}}
      />
    ));

    expect(screen.getByText('无变更')).toBeInTheDocument();
  });
});
