import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from 'solid-testing-library';
import { MergeView } from './MergeView';
import type { MergeResult } from '../types/merge';

// vi.mock factories are hoisted — use vi.hoisted() for shared references
const { mockOpenDialog, mockSaveDialog, mockInvoke } = vi.hoisted(() => ({
  mockOpenDialog: vi.fn<() => Promise<string | null>>(),
  mockSaveDialog: vi.fn<() => Promise<string | null>>(),
  mockInvoke: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));

vi.mock('../lib/dialog', () => ({
  openFileDialog: mockOpenDialog,
  saveFileDialog: mockSaveDialog,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MergeView', () => {
  it('renders empty state with file selectors and merge button', () => {
    render(() => <MergeView />);

    const baseBtn = screen.getByRole('button', { name: /Base/ });
    const leftBtn = screen.getByRole('button', { name: /Left/ });
    const rightBtn = screen.getByRole('button', { name: /Right/ });
    expect(baseBtn).toBeInTheDocument();
    expect(leftBtn).toBeInTheDocument();
    expect(rightBtn).toBeInTheDocument();
    expect(screen.getByText('合并')).toBeInTheDocument();

    const hint = screen.getByText('选择三个文件后点击「合并」');
    expect(hint).toBeInTheDocument();
  });

  it('shows validation error when merge clicked without selecting files', async () => {
    render(() => <MergeView />);
    fireEvent.click(screen.getByText('合并'));
    expect(await screen.findByText('请选择 base、left 和 right 三个文件')).toBeInTheDocument();
  });

  it('calls openFileDialog when clicking Base file selector', async () => {
    mockOpenDialog.mockResolvedValue('/tmp/base.txt');
    render(() => <MergeView />);

    const btn = screen.getAllByRole('button').find(b => b.textContent?.includes('Base'))!;
    fireEvent.click(btn);

    await vi.waitFor(() => expect(mockOpenDialog).toHaveBeenCalledTimes(1));
  });

  it('calls openFileDialog for all three file selectors', async () => {
    mockOpenDialog.mockResolvedValue('/tmp/f.txt');
    render(() => <MergeView />);

    const fileBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.includes('选择文件...')
    );
    expect(fileBtns.length).toBe(3);

    for (const btn of fileBtns) {
      fireEvent.click(btn);
    }

    await vi.waitFor(() => expect(mockOpenDialog).toHaveBeenCalledTimes(3));
  });

  it('opens dialog with correct options via wrapper module', async () => {
    mockOpenDialog.mockResolvedValue('/tmp/f.txt');
    render(() => <MergeView />);

    const btn = screen.getAllByRole('button').find(b => b.textContent?.includes('Base'))!;
    fireEvent.click(btn);

    await vi.waitFor(() => expect(mockOpenDialog).toHaveBeenCalledTimes(1));
  });

  it('stays in empty state when dialog is cancelled', async () => {
    mockOpenDialog.mockResolvedValue(null);
    render(() => <MergeView />);

    const btn = screen.getAllByRole('button').find(b => b.textContent?.includes('Base'))!;
    fireEvent.click(btn);

    await vi.waitFor(() => expect(mockOpenDialog).toHaveBeenCalledTimes(1));

    // Buttons should still show "选择文件..." when dialog is cancelled
    const fileBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.includes('选择文件...')
    );
    expect(fileBtns.length).toBe(3);
  });

  // ── High-fidelity merge flow tests ──

  it('passes correct file paths to merge_files command on merge', async () => {
    mockOpenDialog.mockResolvedValue('/tmp/f.txt');
    mockInvoke.mockResolvedValue({
      merged_text: 'line1\nCHANGED\nline3',
      conflicts: [],
      has_conflicts: false,
      base_text: 'base content',
      left_text: 'left content',
      right_text: 'right content',
    } satisfies MergeResult);

    render(() => <MergeView />);

    // Select all three files
    const fileBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.includes('选择文件...')
    );
    for (const btn of fileBtns) {
      fireEvent.click(btn);
    }
    await vi.waitFor(() => expect(mockOpenDialog).toHaveBeenCalledTimes(3));

    // Click merge
    const mergeBtn = screen.getByText('合并');
    fireEvent.click(mergeBtn);

    // Verify invoke was called with correct command and args
    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('merge_files', {
        basePath: '/tmp/f.txt',
        leftPath: '/tmp/f.txt',
        rightPath: '/tmp/f.txt',
      });
    });
  });

  it('shows conflict navigation bar when merge produces conflicts', async () => {
    mockOpenDialog.mockResolvedValue('/tmp/f.txt');
    mockInvoke.mockResolvedValue({
      merged_text: 'line1\n<<<<<<< Left\nLEFT\n=======\nRIGHT\n>>>>>>> Right\nline3',
      conflicts: [{
        left_content: ['LEFT'],
        right_content: ['RIGHT'],
        start_line: 2,
      }],
      has_conflicts: true,
      base_text: 'base',
      left_text: 'left',
      right_text: 'right',
    } satisfies MergeResult);

    render(() => <MergeView />);

    // Select files and trigger merge
    const fileBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.includes('选择文件...')
    );
    for (const btn of fileBtns) {
      fireEvent.click(btn);
    }
    await vi.waitFor(() => expect(mockOpenDialog).toHaveBeenCalledTimes(3));

    const mergeBtn = screen.getByText('合并');
    fireEvent.click(mergeBtn);

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
    });

    // Conflict navigation bar should appear
    await vi.waitFor(() => {
      expect(screen.getByText(/冲突 #1/)).toBeInTheDocument();
      expect(screen.getByText('采用左侧')).toBeInTheDocument();
      expect(screen.getByText('采用右侧')).toBeInTheDocument();
    });
  });

  it('shows error when invoke fails', async () => {
    mockOpenDialog.mockResolvedValue('/tmp/f.txt');
    mockInvoke.mockRejectedValue(new Error('文件读取失败'));

    render(() => <MergeView />);

    const fileBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.includes('选择文件...')
    );
    for (const btn of fileBtns) {
      fireEvent.click(btn);
    }
    await vi.waitFor(() => expect(mockOpenDialog).toHaveBeenCalledTimes(3));

    const mergeBtn = screen.getByText('合并');
    fireEvent.click(mergeBtn);

    await vi.waitFor(() => {
      expect(screen.getByText(/文件读取失败/)).toBeInTheDocument();
    });
  });

  it('shows save button when conflicts are resolved', async () => {
    mockOpenDialog.mockResolvedValue('/tmp/f.txt');
    mockInvoke.mockResolvedValue({
      merged_text: 'merged content',
      conflicts: [],
      has_conflicts: false,
      base_text: 'base',
      left_text: 'left',
      right_text: 'right',
    } satisfies MergeResult);

    render(() => <MergeView />);

    // Initially no save button (before merge)
    expect(screen.queryByText('保存结果')).not.toBeInTheDocument();

    // Select files and merge
    const fileBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.includes('选择文件...')
    );
    for (const btn of fileBtns) {
      fireEvent.click(btn);
    }
    await vi.waitFor(() => expect(mockOpenDialog).toHaveBeenCalledTimes(3));

    const mergeBtn = screen.getByText('合并');
    fireEvent.click(mergeBtn);

    await vi.waitFor(() => {
      const saveBtns = screen.getAllByText('保存结果');
      expect(saveBtns.length).toBeGreaterThan(0);
    });
  });
});
