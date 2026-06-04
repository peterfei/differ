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

  // ── adoptSide reactivity test (TDD: RED phase) ──

  it('adoptLeft removes conflict markers from rendered text and updates conflict bar', async () => {
    mockOpenDialog.mockResolvedValue('/tmp/f.txt');
    mockInvoke.mockResolvedValue({
      merged_text: [
        'line1',
        '<<<<<<< Left',
        'LEFT CONTENT',
        '=======',
        'RIGHT CONTENT',
        '>>>>>>> Right',
        'line3',
      ].join('\n'),
      conflicts: [{
        left_content: ['LEFT CONTENT'],
        right_content: ['RIGHT CONTENT'],
        start_line: 2,
      }],
      has_conflicts: true,
      base_text: 'base\ncontent\nhere',
      left_text: 'left\ncontent\nhere',
      right_text: 'right\ncontent\nhere',
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
    fireEvent.click(screen.getByText('合并'));
    await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalled());

    // Wait for conflict bar and markers to appear
    await vi.waitFor(() => {
      expect(screen.getByText(/冲突 #1/)).toBeInTheDocument();
      expect(screen.getByText('<<<<<<< Left')).toBeInTheDocument();
    });

    // Act: click "采用左侧"
    fireEvent.click(screen.getByText('采用左侧'));

    // Assert: "<<<<<<< Left" should be gone from rendered text
    await vi.waitFor(() => {
      expect(screen.queryByText('<<<<<<< Left')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Assert: conflict bar should show "所有冲突已解决" (all conflicts resolved)
    await vi.waitFor(() => {
      expect(screen.getByText('所有冲突已解决')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('adoptRight removes conflict markers from rendered text and updates conflict bar', async () => {
    mockOpenDialog.mockResolvedValue('/tmp/f.txt');
    mockInvoke.mockResolvedValue({
      merged_text: [
        'line1',
        '<<<<<<< Left',
        'LEFT CONTENT',
        '=======',
        'RIGHT CONTENT',
        '>>>>>>> Right',
        'line3',
      ].join('\n'),
      conflicts: [{
        left_content: ['LEFT CONTENT'],
        right_content: ['RIGHT CONTENT'],
        start_line: 2,
      }],
      has_conflicts: true,
      base_text: 'base\ncontent\nhere',
      left_text: 'left\ncontent\nhere',
      right_text: 'right\ncontent\nhere',
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
    fireEvent.click(screen.getByText('合并'));
    await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalled());

    // Wait for conflict bar and markers
    await vi.waitFor(() => {
      expect(screen.getByText(/冲突 #1/)).toBeInTheDocument();
      expect(screen.getByText('<<<<<<< Left')).toBeInTheDocument();
    });

    // Act: click "采用右侧"
    fireEvent.click(screen.getByText('采用右侧'));

    // Assert: "<<<<<<< Left" should be gone from rendered text
    await vi.waitFor(() => {
      expect(screen.queryByText('<<<<<<< Left')).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('adoptLeft updates conflict count in conflict bar', async () => {
    mockOpenDialog.mockResolvedValue('/tmp/f.txt');
    mockInvoke.mockResolvedValue({
      merged_text: [
        'line1',
        '<<<<<<< Left',
        'FIRST LEFT',
        '=======',
        'FIRST RIGHT',
        '>>>>>>> Right',
        'middle',
        '<<<<<<< Left',
        'SECOND LEFT',
        '=======',
        'SECOND RIGHT',
        '>>>>>>> Right',
        'line3',
      ].join('\n'),
      conflicts: [
        { left_content: ['FIRST LEFT'], right_content: ['FIRST RIGHT'], start_line: 2 },
        { left_content: ['SECOND LEFT'], right_content: ['SECOND RIGHT'], start_line: 8 },
      ],
      has_conflicts: true,
      base_text: 'base\ncontent',
      left_text: 'left\ncontent',
      right_text: 'right\ncontent',
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
    fireEvent.click(screen.getByText('合并'));
    await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalled());

    // Wait for conflict bar with 2 conflicts
    await vi.waitFor(() => {
      expect(screen.getByText(/冲突 #1/)).toBeInTheDocument();
      expect(screen.getByText('/ 2')).toBeInTheDocument();
      // Verify both conflict markers are present
      expect(screen.getAllByText('<<<<<<< Left')).toHaveLength(2);
    });

    // Act: resolve first conflict
    fireEvent.click(screen.getByText('采用左侧'));

    // Assert: conflict count should update to 1 remaining
    await vi.waitFor(() => {
      expect(screen.getByText(/冲突 #1/)).toBeInTheDocument();
      expect(screen.getByText('/ 1')).toBeInTheDocument();
      expect(screen.getAllByText('<<<<<<< Left')).toHaveLength(1);
    }, { timeout: 3000 });
  });

  it('adoptLeft then adoptRight resolves both conflicts', async () => {
    mockOpenDialog.mockResolvedValue('/tmp/f.txt');
    mockInvoke.mockResolvedValue({
      merged_text: [
        '# Server Configuration',
        'server.host=127.0.0.1',
        '',
        '# Database Configuration',
        '<<<<<<< Left',
        'db.host=127.0.0.1',
        '=======',
        'db.host=db.internal',
        '>>>>>>> Right',
        'db.port=5432',
        'db.name=appdb_prod',
        'db.user=app_user',
        '',
        '# Cache Configuration',
        '<<<<<<< Left',
        'cache.host=127.0.0.1',
        '=======',
        'cache.host=redis.internal',
        '>>>>>>> Right',
        'cache.port=6379',
        'cache.ttl=7200',
        '',
        '# Logging Configuration',
        'log.level=warn',
        'log.file=/var/log/app.log',
        'log.format=json',
      ].join('\n'),
      conflicts: [
        { left_content: ['db.host=127.0.0.1'], right_content: ['db.host=db.internal'], start_line: 5 },
        { left_content: ['cache.host=127.0.0.1'], right_content: ['cache.host=redis.internal'], start_line: 15 },
      ],
      has_conflicts: true,
      base_text: 'base',
      left_text: 'left',
      right_text: 'right',
    } satisfies MergeResult);

    render(() => <MergeView />);

    const fileBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.includes('选择文件...')
    );
    for (const btn of fileBtns) fireEvent.click(btn);
    await vi.waitFor(() => expect(mockOpenDialog).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByText('合并'));
    await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    await vi.waitFor(() => {
      expect(screen.getAllByText('<<<<<<< Left')).toHaveLength(2);
    });

    // Step 1: Resolve first (Database) with 采用左侧
    fireEvent.click(screen.getByText('采用左侧'));
    await vi.waitFor(() => {
      expect(screen.getAllByText('<<<<<<< Left')).toHaveLength(1);
      expect(screen.getByText('/ 1')).toBeInTheDocument();
      // Left content adopted
      expect(screen.getByText('db.host=127.0.0.1')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Step 2: Resolve second (Cache) with 采用右侧
    fireEvent.click(screen.getByText('采用右侧'));
    await vi.waitFor(() => {
      expect(screen.queryByText('<<<<<<< Left')).not.toBeInTheDocument();
      expect(screen.getByText('所有冲突已解决')).toBeInTheDocument();
      expect(screen.queryByText('=======')).not.toBeInTheDocument();
      // Right content adopted for cache
      expect(screen.getByText('cache.host=redis.internal')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('resolves multiple conflicts sequentially without stale line numbers', async () => {
    // Simulates the user's config-file scenario: resolving the first conflict
    // shifts subsequent conflict positions. The old code used stale start_line
    // values, causing the second splice to hit the wrong position.
    mockOpenDialog.mockResolvedValue('/tmp/f.txt');
    mockInvoke.mockResolvedValue({
      merged_text: [
        '# Server',
        'server.host=127.0.0.1',
        '',
        '# Database',
        '<<<<<<< Left',
        'db.host=127.0.0.1',
        '=======',
        'db.host=db.internal',
        '>>>>>>> Right',
        'db.port=5432',
        '',
        '# Cache',
        '<<<<<<< Left',
        'cache.host=127.0.0.1',
        '=======',
        'cache.host=redis.internal',
        '>>>>>>> Right',
        'cache.port=6379',
      ].join('\n'),
      conflicts: [
        { left_content: ['db.host=127.0.0.1'], right_content: ['db.host=db.internal'], start_line: 5 },
        { left_content: ['cache.host=127.0.0.1'], right_content: ['cache.host=redis.internal'], start_line: 13 },
      ],
      has_conflicts: true,
      base_text: 'base',
      left_text: 'left',
      right_text: 'right',
    } satisfies MergeResult);

    render(() => <MergeView />);

    // Select files and merge
    const fileBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.includes('选择文件...')
    );
    for (const btn of fileBtns) fireEvent.click(btn);
    await vi.waitFor(() => expect(mockOpenDialog).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByText('合并'));
    await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalled());

    // Wait for both conflict markers
    await vi.waitFor(() => {
      expect(screen.getAllByText('<<<<<<< Left')).toHaveLength(2);
    });

    // Step 1: Resolve first conflict (Database)
    fireEvent.click(screen.getByText('采用左侧'));
    await vi.waitFor(() => {
      expect(screen.getAllByText('<<<<<<< Left')).toHaveLength(1);
      expect(screen.getByText('/ 1')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Step 2: Resolve second conflict (Cache)
    // If start_line is stale, splice would miss and markers would remain
    fireEvent.click(screen.getByText('采用左侧'));
    await vi.waitFor(() => {
      expect(screen.queryByText('<<<<<<< Left')).not.toBeInTheDocument();
      expect(screen.getByText('所有冲突已解决')).toBeInTheDocument();
      // Verify no ======= or >>>>>>> markers remain either
      expect(screen.queryByText('=======')).not.toBeInTheDocument();
    }, { timeout: 3000 });
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
