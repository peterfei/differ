import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from 'solid-testing-library';
import { GitHistoryView } from './GitHistoryView';
import type { GitCommit, GitBranch } from '../types/git';

beforeEach(() => {
  vi.clearAllMocks();
});

const mockCommits: GitCommit[] = [
  {
    id: 'abc123def456',
    short_id: 'abc123d',
    message: 'Fix critical bug in parser\n\nThis commit fixes a critical issue...',
    summary: 'Fix critical bug in parser',
    author: 'Alice',
    time: 1717000000,
    timestamp: '2024-05-29T12:00:00Z',
  },
  {
    id: 'def789abc012',
    short_id: 'def789a',
    message: 'Add new feature for syntax highlighting',
    summary: 'Add new feature for syntax highlighting',
    author: 'Bob',
    time: 1716900000,
    timestamp: '2024-05-28T10:00:00Z',
  },
  {
    id: 'ghi345jkl678',
    short_id: 'ghi345j',
    message: 'Refactor module structure',
    summary: 'Refactor module structure',
    author: 'Alice',
    time: 1716800000,
    timestamp: '2024-05-27T08:00:00Z',
  },
];

const mockBranches: GitBranch[] = [
  { name: 'main', upstream: 'origin/main', ahead: 2, behind: 0, is_current: true, is_remote: false },
  { name: 'feature/x', upstream: null, ahead: 3, behind: 5, is_current: false, is_remote: false },
];

describe('GitHistoryView', () => {
  it('renders commit list with short SHA and summary', () => {
    render(() => (
      <GitHistoryView
        commits={mockCommits}
        onSelectCommit={() => {}}
        onCompareCommits={() => {}}
        loading={false}
        hasMore={false}
        onLoadMore={() => {}}
      />
    ));

    expect(screen.getByText('abc123d')).toBeInTheDocument();
    expect(screen.getByText('def789a')).toBeInTheDocument();
    expect(screen.getByText('ghi345j')).toBeInTheDocument();
  });

  it('shows commit summaries', () => {
    render(() => (
      <GitHistoryView
        commits={mockCommits}
        onSelectCommit={() => {}}
        onCompareCommits={() => {}}
        loading={false}
        hasMore={false}
        onLoadMore={() => {}}
      />
    ));

    expect(screen.getByText('Fix critical bug in parser')).toBeInTheDocument();
    expect(screen.getByText('Add new feature for syntax highlighting')).toBeInTheDocument();
  });

  it('shows author names', () => {
    render(() => (
      <GitHistoryView
        commits={mockCommits}
        onSelectCommit={() => {}}
        onCompareCommits={() => {}}
        loading={false}
        hasMore={false}
        onLoadMore={() => {}}
      />
    ));

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('calls onSelectCommit on click with single mode', () => {
    const onSelectCommit = vi.fn();
    render(() => (
      <GitHistoryView
        commits={mockCommits}
        onSelectCommit={onSelectCommit}
        onCompareCommits={() => {}}
        loading={false}
        hasMore={false}
        onLoadMore={() => {}}
      />
    ));

    fireEvent.click(screen.getByText('Fix critical bug in parser'));
    expect(onSelectCommit).toHaveBeenCalledWith(mockCommits[0], 'single');
  });

  it('highlights the selected commit', () => {
    render(() => (
      <GitHistoryView
        commits={mockCommits}
        onSelectCommit={() => {}}
        onCompareCommits={() => {}}
        loading={false}
        hasMore={false}
        onLoadMore={() => {}}
        selectedCommitId="def789a"
      />
    ));

    const selected = screen.getByText('def789a');
    expect(selected).toBeInTheDocument();
  });

  it('shows loading indicator when loading is true', () => {
    render(() => (
      <GitHistoryView
        commits={[]}
        onSelectCommit={() => {}}
        onCompareCommits={() => {}}
        loading={true}
        hasMore={false}
        onLoadMore={() => {}}
      />
    ));

    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows load more button when hasMore is true', () => {
    render(() => (
      <GitHistoryView
        commits={mockCommits}
        onSelectCommit={() => {}}
        onCompareCommits={() => {}}
        loading={false}
        hasMore={true}
        onLoadMore={() => {}}
      />
    ));

    expect(screen.getByText('加载更多')).toBeInTheDocument();
  });

  it('calls onLoadMore when load more button is clicked', () => {
    const onLoadMore = vi.fn();
    render(() => (
      <GitHistoryView
        commits={mockCommits}
        onSelectCommit={() => {}}
        onCompareCommits={() => {}}
        loading={false}
        hasMore={true}
        onLoadMore={onLoadMore}
      />
    ));

    fireEvent.click(screen.getByText('加载更多'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no commits', () => {
    render(() => (
      <GitHistoryView
        commits={[]}
        onSelectCommit={() => {}}
        onCompareCommits={() => {}}
        loading={false}
        hasMore={false}
        onLoadMore={() => {}}
      />
    ));

    expect(screen.getByText('暂无提交记录')).toBeInTheDocument();
  });

  it('shows comparison mode hint when compareMode is active', () => {
    render(() => (
      <GitHistoryView
        commits={mockCommits}
        onSelectCommit={() => {}}
        onCompareCommits={() => {}}
        loading={false}
        hasMore={false}
        onLoadMore={() => {}}
        compareMode={true}
      />
    ));

    expect(screen.getByText(/对比模式/)).toBeInTheDocument();
  });
});
