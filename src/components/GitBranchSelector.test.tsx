import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from 'solid-testing-library';
import { GitBranchSelector } from './GitBranchSelector';
import type { GitBranch } from '../types/git';

beforeEach(() => {
  vi.clearAllMocks();
});

const mockBranches: GitBranch[] = [
  { name: 'main', upstream: 'origin/main', ahead: 2, behind: 0, is_current: true, is_remote: false },
  { name: 'develop', upstream: 'origin/develop', ahead: 5, behind: 3, is_current: false, is_remote: false },
  { name: 'feature/x', upstream: null, ahead: 10, behind: 0, is_current: false, is_remote: false },
];

describe('GitBranchSelector', () => {
  it('renders branch list', () => {
    render(() => (
      <GitBranchSelector
        branches={mockBranches}
        onSelectBranch={() => {}}
        onCompareBranches={() => {}}
      />
    ));

    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('develop')).toBeInTheDocument();
    expect(screen.getByText('feature/x')).toBeInTheDocument();
  });

  it('marks current branch', () => {
    render(() => (
      <GitBranchSelector
        branches={mockBranches}
        onSelectBranch={() => {}}
        onCompareBranches={() => {}}
      />
    ));

    expect(screen.getByText('当前')).toBeInTheDocument();
  });

  it('shows ahead/behind badges', () => {
    render(() => (
      <GitBranchSelector
        branches={mockBranches}
        onSelectBranch={() => {}}
        onCompareBranches={() => {}}
      />
    ));

    expect(screen.getByText('↑2')).toBeInTheDocument();
    expect(screen.getByText('↑5')).toBeInTheDocument();
    expect(screen.getByText('↓3')).toBeInTheDocument();
    expect(screen.getByText('↑10')).toBeInTheDocument();
  });

  it('shows compare button when two branches are selected', () => {
    render(() => (
      <GitBranchSelector
        branches={mockBranches}
        onSelectBranch={() => {}}
        onCompareBranches={() => {}}
        selectedBase="main"
        selectedTarget="develop"
      />
    ));

    expect(screen.getByText('对比分支')).toBeInTheDocument();
  });

  it('calls onCompareBranches when compare button is clicked', () => {
    const onCompareBranches = vi.fn();
    render(() => (
      <GitBranchSelector
        branches={mockBranches}
        onSelectBranch={() => {}}
        onCompareBranches={onCompareBranches}
        selectedBase="main"
        selectedTarget="develop"
      />
    ));

    fireEvent.click(screen.getByText('对比分支'));
    expect(onCompareBranches).toHaveBeenCalledWith('main', 'develop');
  });

  it('shows section title', () => {
    render(() => (
      <GitBranchSelector
        branches={mockBranches}
        onSelectBranch={() => {}}
        onCompareBranches={() => {}}
      />
    ));

    expect(screen.getByText('分支')).toBeInTheDocument();
  });

  it('does not show compare button when only one branch selected', () => {
    render(() => (
      <GitBranchSelector
        branches={mockBranches}
        onSelectBranch={() => {}}
        onCompareBranches={() => {}}
        selectedBase="main"
      />
    ));

    expect(screen.queryByText('对比分支')).not.toBeInTheDocument();
  });

  it('shows empty state when no branches', () => {
    render(() => (
      <GitBranchSelector
        branches={[]}
        onSelectBranch={() => {}}
        onCompareBranches={() => {}}
      />
    ));

    expect(screen.getByText('无分支')).toBeInTheDocument();
  });
});
