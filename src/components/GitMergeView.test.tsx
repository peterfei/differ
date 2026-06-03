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
