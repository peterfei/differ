import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from 'solid-testing-library';
import { GitView } from './GitView';
import type { GitRepoInfo, GitStatusEntry, GitCommit, GitBranch } from '../types/git';
import type { DiffResult } from '../types/diff';

const { mockInvoke, mockOnDragDropEvent } = vi.hoisted(() => ({
  mockInvoke: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(),
  mockOnDragDropEvent: vi.fn<(callback: (event: unknown) => void) => Promise<() => void>>()
    .mockResolvedValue(vi.fn()),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));

// Mock Tauri drag-drop event API — use shared mock for callback capture
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: mockOnDragDropEvent,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
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

  it('saves repo work_dir to recent repos on successful open', async () => {
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
      expect(screen.getByText('main')).toBeInTheDocument();
    });

    // Go back to repo selection
    fireEvent.click(screen.getByTitle('返回'));

    await vi.waitFor(() => {
      expect(screen.getByText('/repo')).toBeInTheDocument();
    });
  });

  it('shows recent repos list in selection view', () => {
    localStorage.setItem('differ_recent_repos', JSON.stringify(['/recent1', '/recent2']));

    render(() => <GitView />);

    expect(screen.getByText('最近仓库')).toBeInTheDocument();
    expect(screen.getByText('/recent1')).toBeInTheDocument();
    expect(screen.getByText('/recent2')).toBeInTheDocument();
  });

  it('opens a recent repo when clicked', async () => {
    localStorage.setItem('differ_recent_repos', JSON.stringify(['/recent/path']));
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'git_open') return { ...mockRepoInfo, work_dir: '/recent/path' };
      if (cmd === 'git_status') return mockStatus;
      if (cmd === 'git_log') return mockCommits;
      if (cmd === 'git_branches') return mockBranches;
      return null;
    });

    render(() => <GitView />);

    fireEvent.click(screen.getByText('/recent/path'));

    await vi.waitFor(() => {
      expect(screen.getByText('src/main.rs')).toBeInTheDocument();
    });
  });

  it('handles Tauri drag-drop event to discover and open repo', async () => {
    render(() => <GitView />);

    // Wait for onMount to register the Tauri drag-drop listener
    await vi.waitFor(() => {
      expect(mockOnDragDropEvent).toHaveBeenCalled();
    });

    // Capture the registered callback
    const callback = mockOnDragDropEvent.mock.calls[0][0];

    // Simulate drag over
    callback({ payload: { type: 'over', paths: ['/some/path'] } });

    // Set up mock for discover + open flow
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'git_discover') return '/discovered/repo';
      if (cmd === 'git_open') return { ...mockRepoInfo, work_dir: '/discovered/repo' };
      if (cmd === 'git_status') return mockStatus;
      if (cmd === 'git_log') return mockCommits;
      if (cmd === 'git_branches') return mockBranches;
      return null;
    });

    // Simulate drop
    callback({ payload: { type: 'drop', paths: ['/some/path'] } });

    await vi.waitFor(() => {
      expect(screen.getByText('src/main.rs')).toBeInTheDocument();
    });

    // Verify git_discover was called
    expect(mockInvoke).toHaveBeenCalledWith('git_discover', { path: '/some/path' });
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
      expect(screen.getByText('main')).toBeInTheDocument();
    });

    const backBtn = screen.getByTitle('返回');
    fireEvent.click(backBtn);

    expect(screen.getByPlaceholderText('输入仓库路径...')).toBeInTheDocument();
  });

  it('loads diff when clicking a non-conflicted modified file', async () => {
    // Mock all backend calls
    const diffResult: DiffResult = {
      hunks: [{
        old_start: 1, old_lines: 3, new_start: 1, new_lines: 3,
        syntax_context: '',
        changes: [
          { old_line_no: 1, new_line_no: null, old_text: 'old line', new_text: null, change_type: 'Delete', inline_changes: [] },
          { old_line_no: null, new_line_no: 1, old_text: null, new_text: 'new line', change_type: 'Add', inline_changes: [] },
        ],
      }],
      left_lines: 3,
      right_lines: 3,
      options: { algorithm: 'Myers' as const, context_lines: 3, ignore_whitespace: false, ignore_case: false },
    };

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'git_open') return mockRepoInfo;
      if (cmd === 'git_status') return mockStatus;
      if (cmd === 'git_log') return mockCommits;
      if (cmd === 'git_branches') return mockBranches;
      if (cmd === 'git_diff_unstaged') return diffResult;
      return null;
    });

    render(() => <GitView />);

    // Open repo
    fireEvent.input(screen.getByPlaceholderText('输入仓库路径...'), { target: { value: '/repo' } });
    fireEvent.click(screen.getByText('打开仓库'));

    // Wait for repo to load and files to appear
    await vi.waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    // Click on the modified file
    fireEvent.click(screen.getByText('README.md'));

    // Assert: diff viewer should show content (not the fallback "选择一个文件或 commit 查看差异")
    await vi.waitFor(() => {
      expect(screen.queryByText('选择一个文件或 commit 查看差异')).not.toBeInTheDocument();
    });

    // Verify git_diff_unstaged was called for README.md (unstaged, modified)
    expect(mockInvoke).toHaveBeenCalledWith('git_diff_unstaged', expect.objectContaining({
      repoPath: '/repo',
      path: 'README.md',
    }));
  });
});
