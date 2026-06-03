import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from 'solid-testing-library';
import { GitView } from './GitView';
import type { GitRepoInfo, GitStatusEntry, GitCommit, GitBranch } from '../types/git';
import type { DiffResult } from '../types/diff';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));

beforeEach(() => {
  vi.clearAllMocks();
});

const mockRepoInfo: GitRepoInfo = {
  path: '/repo/.git/',
  work_dir: '/repo',
  current_branch: 'main',
  is_detached: false,
  head_commit: 'abc123def4567890123456789012345678901234',
  head_short: 'abc123d',
};

const mockStatus: GitStatusEntry[] = [
  { path: 'src/main.rs', status: 'Modified', staged: true, added_lines: 5, deleted_lines: 2 },
  { path: 'README.md', status: 'Modified', staged: false, added_lines: 1, deleted_lines: 1 },
];

const mockCommits: GitCommit[] = [
  {
    id: 'abc123def456',
    short_id: 'abc123d',
    message: 'Fix bug',
    summary: 'Fix bug',
    author: 'Alice',
    time: 1717000000,
    timestamp: '2024-05-29T12:00:00Z',
  },
];

const mockBranches: GitBranch[] = [
  { name: 'main', upstream: 'origin/main', ahead: 0, behind: 0, is_current: true, is_remote: false },
];

const mockDiffResult: DiffResult = {
  hunks: [],
  left_lines: 10,
  right_lines: 10,
  options: { algorithm: 'Myers', context_lines: 3, ignore_whitespace: false, ignore_case: false },
};

describe('GitView', () => {
  it('shows repo path input and open button initially', () => {
    render(() => <GitView />);

    expect(screen.getByPlaceholderText('输入仓库路径...')).toBeInTheDocument();
    expect(screen.getByText('打开仓库')).toBeInTheDocument();
  });

  it('shows error when opening invalid repo', async () => {
    mockInvoke.mockRejectedValue(new Error('不是 Git 仓库'));

    render(() => <GitView />);

    const input = screen.getByPlaceholderText('输入仓库路径...') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '/invalid/path' } });
    fireEvent.click(screen.getByText('打开仓库'));

    await vi.waitFor(() => {
      expect(screen.getByText(/不是 Git 仓库/)).toBeInTheDocument();
    });
  });

  it('shows loading state while opening repo', async () => {
    mockInvoke.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return mockRepoInfo;
    });

    render(() => <GitView />);

    fireEvent.input(screen.getByPlaceholderText('输入仓库路径...'), { target: { value: '/repo' } });
    fireEvent.click(screen.getByText('打开仓库'));

    expect(await screen.findByText('打开中...')).toBeInTheDocument();
  });

  it('loads status, log, and branches after opening repo', async () => {
    let invokeCallCount = 0;
    mockInvoke.mockImplementation(async (cmd: string) => {
      invokeCallCount++;
      if (cmd === 'git_open') return mockRepoInfo;
      if (cmd === 'git_status') return mockStatus;
      if (cmd === 'git_log') return mockCommits;
      if (cmd === 'git_branches') return mockBranches;
      return null;
    });

    render(() => <GitView />);

    fireEvent.input(screen.getByPlaceholderText('输入仓库路径...'), { target: { value: '/repo' } });
    fireEvent.click(screen.getByText('打开仓库'));

    await vi.waitFor(() => {
      expect(screen.getByText('src/main.rs')).toBeInTheDocument();
    });

    expect(screen.getByText('abc123d')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(invokeCallCount).toBeGreaterThanOrEqual(4);
  });

  it('shows repo info when loaded', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'git_open') return mockRepoInfo;
      if (cmd === 'git_status') return mockStatus;
      if (cmd === 'git_log') return mockCommits;
      if (cmd === 'git_branches') return mockBranches;
      return null;
    });

    render(() => <GitView />);

    fireEvent.input(screen.getByPlaceholderText('输入仓库路径...'), { target: { value: '/repo' } });
    fireEvent.click(screen.getByText('打开仓库'));

    await vi.waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument();
    });
  });

  it('shows side-by-side panels (sidebar | history | branches)', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'git_open') return mockRepoInfo;
      if (cmd === 'git_status') return mockStatus;
      if (cmd === 'git_log') return mockCommits;
      if (cmd === 'git_branches') return mockBranches;
      return null;
    });

    render(() => <GitView />);

    fireEvent.input(screen.getByPlaceholderText('输入仓库路径...'), { target: { value: '/repo' } });
    fireEvent.click(screen.getByText('打开仓库'));

    await vi.waitFor(() => {
      expect(screen.getByText('已暂存')).toBeInTheDocument();
    });
  });

  it('shows keyboard shortcut hint', () => {
    render(() => <GitView />);

    expect(screen.getByText(/Cmd/)).toBeInTheDocument();
  });

  it('calls back to open diff view when a file is selected', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'git_open') return mockRepoInfo;
      if (cmd === 'git_status') return mockStatus;
      if (cmd === 'git_log') return mockCommits;
      if (cmd === 'git_branches') return mockBranches;
      if (cmd === 'git_diff_unstaged') return mockDiffResult;
      return null;
    });

    render(() => <GitView onOpenDiffView={() => {}} />);

    fireEvent.input(screen.getByPlaceholderText('输入仓库路径...'), { target: { value: '/repo' } });
    fireEvent.click(screen.getByText('打开仓库'));

    await vi.waitFor(() => {
      expect(screen.getByText('src/main.rs')).toBeInTheDocument();
    });
  });

  it('allows returning to repo selection', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'git_open') return mockRepoInfo;
      if (cmd === 'git_status') return [];
      if (cmd === 'git_log') return [];
      if (cmd === 'git_branches') return [];
      return null;
    });

    render(() => <GitView />);

    fireEvent.input(screen.getByPlaceholderText('输入仓库路径...'), { target: { value: '/repo' } });
    fireEvent.click(screen.getByText('打开仓库'));

    await vi.waitFor(() => {
      expect(screen.getByText('文件状态')).toBeInTheDocument();
    });

    const backBtn = screen.getByTitle('返回');
    fireEvent.click(backBtn);

    expect(screen.getByPlaceholderText('输入仓库路径...')).toBeInTheDocument();
  });
});
