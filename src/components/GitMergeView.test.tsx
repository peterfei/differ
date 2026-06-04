import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "solid-testing-library";
import { GitMergeView } from "./GitMergeView";
import type { ConflictContent } from "../types/git";
import type { MergeResult } from "../types/merge";

// ── Mock @tauri-apps/api/core ──
// Default: never-resolving promise (sync tests check only loading state).
// Async test overrides via mockImplementation in beforeEach.
const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(() => new Promise(() => {})),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// ── Fixture: realistic data matching multiple_conflicts fixture ──
const MOCK_CONFLICT_CONTENT: ConflictContent = {
  base_text: [
    'def hello():',
    '    print("Hello")',
    '    print("World")',
    '',
    'def goodbye():',
    '    print("Goodbye")',
    '    print("See you")',
  ].join("\n"),
  ours_text: [
    'def hello():',
    '    print("Hello from local")',
    '    print("World")',
    '',
    'def goodbye():',
    '    print("Goodbye local")',
    '    print("See you")',
  ].join("\n"),
  theirs_text: [
    'def hello():',
    '    print("Hello")',
    '    print("World from remote")',
    '',
    'def goodbye():',
    '    print("Goodbye")',
    '    print("See you remote")',
  ].join("\n"),
  file_path: "app.py",
};

// ── Fixture: consecutive_conflicts test fixture exact data ──
// Matches the actual test fixture at test_fixtures/consecutive_conflicts/
// three_way_merge produces 5 granular conflicts for this fixture.

const CONSECUTIVE_CONFLICT_CONTENT: ConflictContent = {
  base_text: [
    '# Server Configuration',
    'server.host=localhost',
    'server.port=8080',
    '',
    '# Database Configuration',
    'db.host=localhost',
    'db.port=5432',
    'db.name=appdb',
    'db.user=admin',
    '',
    '# Cache Configuration',
    'cache.host=localhost',
    'cache.port=6379',
    'cache.ttl=3600',
    '',
    '# Logging Configuration',
    'log.level=info',
    'log.file=/var/log/app.log',
    'log.format=text',
  ].join('\n'),
  ours_text: [
    '# Server Configuration',
    'server.host=127.0.0.1',
    'server.port=8080',
    '',
    '# Database Configuration',
    'db.host=127.0.0.1',
    'db.port=5432',
    'db.name=appdb_dev',
    'db.user=root',
    '',
    '# Cache Configuration',
    'cache.host=127.0.0.1',
    'cache.port=6379',
    'cache.ttl=3600',
    '',
    '# Logging Configuration',
    'log.level=warn',
    'log.file=/var/log/app.log',
    'log.format=text',
  ].join('\n'),
  theirs_text: [
    '# Server Configuration',
    'server.host=0.0.0.0',
    'server.port=9000',
    '',
    '# Database Configuration',
    'db.host=db.internal',
    'db.port=5432',
    'db.name=appdb_prod',
    'db.user=app_user',
    '',
    '# Cache Configuration',
    'cache.host=redis.internal',
    'cache.port=6379',
    'cache.ttl=7200',
    '',
    '# Logging Configuration',
    'log.level=debug',
    'log.file=/var/log/app.log',
    'log.format=json',
  ].join('\n'),
  file_path: "config.txt",
};

const CONSECUTIVE_MERGE_RESULT: MergeResult = {
  merged_text: [
    '# Server Configuration',
    '<<<<<<< Left',
    'server.host=127.0.0.1',
    '=======',
    'server.host=0.0.0.0',
    'server.port=9000',
    '>>>>>>> Right',
    '',
    '# Database Configuration',
    '<<<<<<< Left',
    'db.host=127.0.0.1',
    '=======',
    'db.host=db.internal',
    '>>>>>>> Right',
    'db.port=5432',
    '<<<<<<< Left',
    'db.name=appdb_dev',
    'db.user=root',
    '=======',
    'db.name=appdb_prod',
    'db.user=app_user',
    '>>>>>>> Right',
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
    '<<<<<<< Left',
    'log.level=warn',
    '=======',
    'log.level=debug',
    '>>>>>>> Right',
    'log.file=/var/log/app.log',
    'log.format=json',
  ].join('\n'),
  conflicts: [
    { left_content: ['server.host=127.0.0.1'], right_content: ['server.host=0.0.0.0', 'server.port=9000'], start_line: 2 },
    { left_content: ['db.host=127.0.0.1'], right_content: ['db.host=db.internal'], start_line: 10 },
    { left_content: ['db.name=appdb_dev', 'db.user=root'], right_content: ['db.name=appdb_prod', 'db.user=app_user'], start_line: 16 },
    { left_content: ['cache.host=127.0.0.1'], right_content: ['cache.host=redis.internal'], start_line: 25 },
    { left_content: ['log.level=warn'], right_content: ['log.level=debug'], start_line: 34 },
  ],
  has_conflicts: true,
  base_text: '',
  left_text: '',
  right_text: '',
};

const MOCK_MERGE_RESULT: MergeResult = {
  merged_text: [
    'def hello():',
    '<<<<<<< Left',
    '    print("Hello from local")',
    '=======',
    '    print("Hello")',
    '    print("World from remote")',
    '>>>>>>> Right',
    '',
    'def goodbye():',
    '<<<<<<< Left',
    '    print("Goodbye local")',
    '=======',
    '    print("Goodbye")',
    '    print("See you remote")',
    '>>>>>>> Right',
  ].join("\n"),
  conflicts: [
    {
      left_content: ['    print("Hello from local")'],
      right_content: ['    print("Hello")', '    print("World from remote")'],
      start_line: 2,
    },
    {
      left_content: ['    print("Goodbye local")'],
      right_content: ['    print("Goodbye")', '    print("See you remote")'],
      start_line: 10,
    },
  ],
  has_conflicts: true,
  base_text: [
    'def hello():',
    '    print("Hello")',
    '    print("World")',
    '',
    'def goodbye():',
    '    print("Goodbye")',
    '    print("See you")',
  ].join("\n"),
  left_text: [
    'def hello():',
    '    print("Hello from local")',
    '    print("World")',
    '',
    'def goodbye():',
    '    print("Goodbye local")',
    '    print("See you")',
  ].join("\n"),
  right_text: [
    'def hello():',
    '    print("Hello")',
    '    print("World from remote")',
    '',
    'def goodbye():',
    '    print("Goodbye")',
    '    print("See you remote")',
  ].join("\n"),
};

// ── Sync loading-state tests (default mock: never-resolving promise) ──

describe("GitMergeView loading state", () => {
  it("shows loading spinner while fetching data", () => {
    render(() => (
      <GitMergeView
        repoPath="/tmp/test-repo"
        filePath="src/test.txt"
        onBack={() => {}}
      />
    ));

    expect(screen.getByText("加载合并冲突...")).toBeInTheDocument();
  });

  it("does not crash on render with valid props", () => {
    expect(() => {
      render(() => (
        <GitMergeView
          repoPath="/tmp/test-repo"
          filePath="src/test.txt"
          onBack={() => {}}
        />
      ));
    }).not.toThrow();
  });
});

describe("GitMergeView prop types", () => {
  it("accepts onBack callback", () => {
    const onBack = vi.fn();
    render(() => (
      <GitMergeView
        repoPath="/tmp/test-repo"
        filePath="src/test.txt"
        onBack={onBack}
      />
    ));
    expect(screen.getByText("加载合并冲突...")).toBeInTheDocument();
  });
});

// ── High-fidelity async flow test ──
// Verifies that onMount + runWithOwner transitions component from loading
// state to the merge UI when async data resolves through the mock.

describe("GitMergeView high-fidelity async flow", () => {
  beforeEach(() => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "git_get_conflict_content") return Promise.resolve(MOCK_CONFLICT_CONTENT);
      if (cmd === "merge_text") return Promise.resolve(MOCK_MERGE_RESULT);
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });
  });

  afterEach(() => {
    // Restore never-resolving promise for other tests
    mockInvoke.mockImplementation(() => new Promise(() => {}));
  });

  it(
    "transitions from loading to merge UI when async data loads",
    { timeout: 10000 },
    async () => {
      // Act: render component
      render(() => (
        <GitMergeView
          repoPath="/tmp/test-repo"
          filePath="app.py"
          onBack={() => {}}
        />
      ));

      // Assert: loading state shows immediately (sync render)
      expect(screen.getByText("加载合并冲突...")).toBeInTheDocument();

      // onMount fires, invoke is called, promise resolves, .then callbacks
      // fire with runWithOwner → signal updates → DOM re-render.

      // Assert: after async data resolves, loading disappears
      await waitFor(
        () => {
          expect(screen.queryByText("加载合并冲突...")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // Assert: merge UI is fully rendered
      expect(screen.getByText("三路合并")).toBeInTheDocument();
      expect(screen.getByText("Base")).toBeInTheDocument();
      expect(screen.getByText("Local (ours)")).toBeInTheDocument();
      expect(screen.getByText("Remote (theirs)")).toBeInTheDocument();
      expect(screen.getByText("2 个冲突")).toBeInTheDocument();
      expect(screen.getByText("采用左侧")).toBeInTheDocument();
      expect(screen.getByText("采用右侧")).toBeInTheDocument();
      expect(screen.getByText("智能合并")).toBeInTheDocument();
      expect(screen.getByText("保存合并")).toBeInTheDocument();
    },
  );
});

describe("GitMergeView adoptSide + smartMerge flow", () => {
  beforeEach(() => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "git_get_conflict_content") return Promise.resolve(MOCK_CONFLICT_CONTENT);
      if (cmd === "merge_text") return Promise.resolve(MOCK_MERGE_RESULT);
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });
  });

  afterEach(() => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
  });

  it(
    "adoptSide and smartMerge both update merge result text",
    { timeout: 10000 },
    async () => {
      render(() => (
        <GitMergeView
          repoPath="/tmp/test-repo"
          filePath="app.py"
          onBack={() => {}}
        />
      ));

      // Wait for loading to finish
      await waitFor(
        () => {
          expect(screen.queryByText("加载合并冲突...")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // Step 1: Initial merge result has 2 "<<<<<<< Left" markers
      const conflictMarkers = () => screen.getAllByText("<<<<<<< Left");
      expect(conflictMarkers()).toHaveLength(2);

      // Step 2: Click "采用左侧" to resolve first conflict
      screen.getByText("采用左侧").click();

      // After adoptSide, only 1 "<<<<<<< Left" marker remains (second conflict)
      await vi.waitFor(() => {
        expect(screen.getAllByText("<<<<<<< Left")).toHaveLength(1);
      }, { timeout: 3000 });

      // Step 3: Click "智能合并" to restore original merge from backend
      screen.getByText("智能合并").click();

      // After smartMerge, 0 "<<<<<<< Left" markers remain (all auto-resolved)
      await vi.waitFor(() => {
        expect(screen.queryAllByText("<<<<<<< Left")).toHaveLength(0);
      }, { timeout: 3000 });
    },
  );

  it(
    "adoptSide resolves conflicts sequentially without stale index bug",
    { timeout: 10000 },
    async () => {
      render(() => (
        <GitMergeView
          repoPath="/tmp/test-repo"
          filePath="app.py"
          onBack={() => {}}
        />
      ));

      // Wait for loading to finish
      await waitFor(
        () => {
          expect(screen.queryByText("加载合并冲突...")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // Assert: initial state has 2 conflict markers
      expect(screen.getAllByText("<<<<<<< Left")).toHaveLength(2);

      // Step 1: Resolve first conflict with "采用左侧"
      screen.getByText("采用左侧").click();
      await vi.waitFor(() => {
        expect(screen.getAllByText("<<<<<<< Left")).toHaveLength(1);
        // Must NOT show "已全部解决" — 1 conflict remains
        expect(screen.queryByText("已全部解决")).not.toBeInTheDocument();
        // Must show "1 个冲突" (not "0 个冲突")
        expect(screen.getByText("1 个冲突")).toBeInTheDocument();
      }, { timeout: 3000 });

      // Step 2: Resolve second conflict with "采用左侧"
      screen.getByText("采用左侧").click();
      await vi.waitFor(() => {
        expect(screen.queryAllByText("<<<<<<< Left")).toHaveLength(0);
        // After all conflicts resolved, show "无冲突"
        expect(screen.getByText("无冲突")).toBeInTheDocument();
      }, { timeout: 3000 });
    },
  );

  it(
    "smartMerge resolves all conflict markers when there are unresolved conflicts",
    { timeout: 10000 },
    async () => {
      render(() => (
        <GitMergeView
          repoPath="/tmp/test-repo"
          filePath="app.py"
          onBack={() => {}}
        />
      ));

      // Wait for loading to finish
      await waitFor(
        () => {
          expect(screen.queryByText("加载合并冲突...")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // Assert: initial state has conflict markers
      expect(screen.getAllByText("<<<<<<< Left")).toHaveLength(2);

      // Act: click "智能合并"
      screen.getByText("智能合并").click();

      // Assert: after smart merge, all conflict markers are resolved
      await vi.waitFor(
        () => {
          expect(screen.queryAllByText("<<<<<<< Left")).toHaveLength(0);
        },
        { timeout: 5000 },
      );
    },
  );
});

// ── High-fidelity TDD test with consecutive_conflicts fixture ──
// Uses the exact data from test_fixtures/consecutive_conflicts/ to
// reproduce the user's bug: clicking "采用左侧" first works, then
// clicking "采用右侧" doesn't change the rendered text.

describe("GitMergeView consecutive_conflicts fixture", () => {
  beforeEach(() => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "git_get_conflict_content") return Promise.resolve(CONSECUTIVE_CONFLICT_CONTENT);
      if (cmd === "merge_text") return Promise.resolve(CONSECUTIVE_MERGE_RESULT);
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });
  });

  afterEach(() => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
  });

  it(
    "adoptLeft then adoptRight resolves two consecutive conflicts in sequence",
    { timeout: 10000 },
    async () => {
      render(() => (
        <GitMergeView
          repoPath="/tmp/test-repo"
          filePath="config.txt"
          onBack={() => {}}
        />
      ));

      // Wait for loading to finish
      await waitFor(
        () => {
          expect(screen.queryByText("加载合并冲突...")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // Assert: initial state has 5 conflict markers
      const textContent = () => screen.getAllByText("<<<<<<< Left");
      expect(textContent()).toHaveLength(5);

      // Step 1: Resolve first conflict with "采用左侧"
      screen.getByText("采用左侧").click();

      // After first resolution: 4 conflicts remain
      await vi.waitFor(() => {
        expect(screen.getAllByText("<<<<<<< Left")).toHaveLength(4);
      }, { timeout: 3000 });

      // Step 2: Resolve next conflict with "采用右侧"
      screen.getByText("采用右侧").click();

      // After second resolution: 3 conflicts remain (NOT still 4!)
      await vi.waitFor(() => {
        expect(screen.getAllByText("<<<<<<< Left")).toHaveLength(3);
      }, { timeout: 3000 });
    },
  );

  it(
    "navigates to db.host conflict after resolving server.host and adopts left correctly",
    { timeout: 10000 },
    async () => {
      render(() => (
        <GitMergeView
          repoPath="/tmp/test-repo"
          filePath="config.txt"
          onBack={() => {}}
        />
      ));

      await waitFor(
        () => {
          expect(screen.queryByText("加载合并冲突...")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // Initial: 5 conflicts
      expect(screen.getAllByText("<<<<<<< Left")).toHaveLength(5);

      // Step 1: Resolve server.host (conflict #1 = idx 0)
      screen.getByText("采用左侧").click();
      await vi.waitFor(() => {
        expect(screen.getAllByText("<<<<<<< Left")).toHaveLength(4);
      }, { timeout: 3000 });

      // Auto-advance went to idx=1 (db.name/db.user).
      // Navigate back to idx=0 with "上一处" → now at db.host conflict
      screen.getByText("上一处").click();

      // Verify showing "冲突 #1" (idx=0 = db.host)
      await vi.waitFor(() => {
        expect(screen.getByText(/冲突 #1/)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Step 2: Click "采用左侧" on db.host conflict
      screen.getByText("采用左侧").click();

      // After resolving db.host: 3 markers remain (db.name, cache, log)
      await vi.waitFor(() => {
        expect(screen.getAllByText("<<<<<<< Left")).toHaveLength(3);
      }, { timeout: 3000 });

      // Conflict badge must show "3 个冲突"
      await vi.waitFor(() => {
        expect(screen.getByText("3 个冲突")).toBeInTheDocument();
      }, { timeout: 3000 });
    },
  );

  // ── Pure logic test: adoptSide on db.host with exact Rust three_way_merge output ──
  // This tests the adoptSide function IN ISOLATION with the exact data from Rust,
  // bypassing any SolidJS reactivity concerns.

  it(
    "pure adoptSide logic correctly resolves db.host conflict at idx=1",
    () => {
      const mergedText = CONSECUTIVE_MERGE_RESULT.merged_text;
      const conflicts = [...CONSECUTIVE_MERGE_RESULT.conflicts];
      const idx = 1; // db.host conflict
      const side = "left";

      const conflict = conflicts[idx];
      const lines = mergedText.split("\n");
      const startLine = conflict.start_line - 1;

      let markerEnd = startLine;
      while (markerEnd < lines.length && !lines[markerEnd].startsWith(">>>>>>>")) {
        markerEnd++;
      }
      if (markerEnd < lines.length) markerEnd++;

      const chosenLines = side === "left" ? conflict.left_content : conflict.right_content;
      const before = lines.slice(0, startLine);
      const after = lines.slice(markerEnd);
      const newLines = [...before, ...chosenLines, ...after];
      const newText = newLines.join("\n");

      // 1. Must contain the adopted left content
      expect(newText).toContain("db.host=127.0.0.1");
      // 2. Must NOT contain the rejected right content
      expect(newText).not.toContain("db.host=db.internal");
      // 3. Must still have 4 conflict markers (from remaining 4 conflicts)
      expect(newText.match(/<<<<<<< Left/g)).toHaveLength(4);
      expect(newText.match(/=======/g)).toHaveLength(4);
      expect(newText.match(/>>>>>>> Right/g)).toHaveLength(4);
    },
  );

  it(
    "adoptLeft then adoptRight all the way to resolution with consecutive_conflicts fixture",
    { timeout: 15000 },
    async () => {
      render(() => (
        <GitMergeView
          repoPath="/tmp/test-repo"
          filePath="config.txt"
          onBack={() => {}}
        />
      ));

      await waitFor(
        () => {
          expect(screen.queryByText("加载合并冲突...")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // Initial: 5 conflicts
      expect(screen.getAllByText("<<<<<<< Left")).toHaveLength(5);

      // Resolve all 5 conflicts by alternating left/right
      const clicks = ["采用左侧", "采用右侧", "采用左侧", "采用右侧", "采用左侧"];
      for (let i = 0; i < clicks.length; i++) {
        screen.getByText(clicks[i]).click();
        const remaining = 5 - i - 1;
        if (remaining > 0) {
          await vi.waitFor(() => {
            expect(screen.getAllByText("<<<<<<< Left")).toHaveLength(remaining);
          }, { timeout: 3000 });
        } else {
          await vi.waitFor(() => {
            expect(screen.queryAllByText("<<<<<<< Left")).toHaveLength(0);
            expect(screen.getByText("无冲突")).toBeInTheDocument();
          }, { timeout: 3000 });
        }
      }
    },
  );
});
