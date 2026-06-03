import { createSignal, Show, For, onMount, onCleanup } from "solid-js";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import type { GitRepoInfo, GitStatusEntry, GitCommit, GitBranch } from "../types/git";
import type { DiffResult, DiffChange } from "../types/diff";
import { GitSidebar } from "./GitSidebar";
import { GitHistoryView } from "./GitHistoryView";
import { GitBranchSelector } from "./GitBranchSelector";
import { pendingRepoPath as navPendingRepoPath, setPendingRepoPath } from "../lib/navStore";

interface GitViewProps {
  onOpenDiffView?: (left: string, right: string, base?: string) => void;
  onOpenMergeView?: (base: string, left: string, right: string) => void;
  onOpenGitMergeView?: (repoPath: string, filePath: string) => void;
}

type ActivePanel = "status" | "history" | "branches";

export function GitView(props: GitViewProps) {
  // Repo selection state
  const [repoPath, setRepoPath] = createSignal("");
  const [repoInfo, setRepoInfo] = createSignal<GitRepoInfo | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Data loading errors
  const [dataError, setDataError] = createSignal<string | null>(null);

  // Data state
  const [statusEntries, setStatusEntries] = createSignal<GitStatusEntry[]>([]);
  const [commits, setCommits] = createSignal<GitCommit[]>([]);
  const [branches, setBranches] = createSignal<GitBranch[]>([]);
  const [commitPage, setCommitPage] = createSignal(0);
  const [hasMoreCommits, setHasMoreCommits] = createSignal(false);
  const [loadingCommits, setLoadingCommits] = createSignal(false);

  // Diff state
  const [selectedDiff, setSelectedDiff] = createSignal<DiffResult | null>(null);
  const [selectedFilePath, setSelectedFilePath] = createSignal("");
  const [selectedFileStaged, setSelectedFileStaged] = createSignal(false);
  const [diffLoading, setDiffLoading] = createSignal(false);

  // Comparison state
  const [compareMode, setCompareMode] = createSignal(false);
  const [compareFrom, setCompareFrom] = createSignal<GitCommit | null>(null);
  const [selectedCommit, setSelectedCommit] = createSignal<string | undefined>();

  // Branch comparison state
  const [branchBase, setBranchBase] = createSignal<string | undefined>();
  const [branchTarget, setBranchTarget] = createSignal<string | undefined>();

  // Active panel
  const [activePanel, setActivePanel] = createSignal<ActivePanel>("status");

  const PAGE_SIZE = 50;
  const RECENT_REPOS_KEY = 'differ_recent_repos';
  const MAX_RECENT = 10;

  // 最近仓库列表
  const [recentRepos, setRecentRepos] = createSignal<string[]>(
    (() => {
      try {
        const raw = localStorage.getItem(RECENT_REPOS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    })()
  );

  function saveRecentRepo(path: string) {
    let repos = recentRepos();
    if (!Array.isArray(repos)) {
      repos = [];
      setRecentRepos([]);
    }
    repos = repos.filter(r => r !== path);
    repos.unshift(path);
    const trimmed = repos.slice(0, MAX_RECENT);
    setRecentRepos(trimmed);
    localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(trimmed));
  }

  // 自动打开从外部传入的仓库路径
  onMount(() => {
    const pending = navPendingRepoPath();
    if (pending) {
      setRepoPath(pending);
      setPendingRepoPath(null);
      // 延迟一帧执行 openRepo，确保信号已更新
      setTimeout(() => openRepo(), 0);
    }
  });

  async function openRepo() {
    await doOpenRepo(repoPath().trim());
  }

  async function doOpenRepo(path: string) {
    if (!path) {
      setError("请输入仓库路径");
      return;
    }

    // 展开 ~ 为家目录
    if (path.startsWith("~/") || path === "~") {
      try {
        const { homeDir } = await import("@tauri-apps/api/path");
        let home = await homeDir();
        if (!home.endsWith("/")) home += "/";
        path = path === "~" ? home.replace(/\/$/, "") : home + path.slice(2);
      } catch {
        // fallback: 保持原路径（Rust 端也会做 ~ 展开）
      }
    }

    setLoading(true);
    setError(null);
    setDataError(null);
    try {
      console.warn("[GitView] git_open path:", path);
      const info = await invoke<GitRepoInfo>("git_open", { path });
      console.warn("[GitView] git_open OK, work_dir:", info.work_dir, "typeof:", typeof info.work_dir);
      setRepoInfo(info);
      saveRecentRepo(info.work_dir);

      // Load initial data in parallel
      console.warn("[GitView] loading data with work_dir:", info.work_dir);
      await Promise.all([
        loadStatus(info.work_dir),
        loadCommits(info.work_dir, 0),
        loadBranches(info.work_dir),
      ]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadStatus(repoPathVal: string) {
    try {
      console.warn("[GitView] calling git_status with repoPath:", repoPathVal);
      const entries = await invoke<GitStatusEntry[]>("git_status", { repoPath: repoPathVal });
      console.warn("[GitView] git_status returned", entries.length, "entries");
      setStatusEntries(entries);
    } catch (e) {
      console.error("Failed to load status:", e);
      setDataError(`状态加载失败: ${e}`);
    }
  }

  async function loadCommits(repoPathVal: string, page: number) {
    setLoadingCommits(true);
    try {
      console.warn("[GitView] calling git_log with repoPath:", repoPathVal, "page:", page);
      const results = await invoke<GitCommit[]>("git_log", {
        repoPath: repoPathVal,
        maxCount: PAGE_SIZE,
        skip: page * PAGE_SIZE,
      });
      console.warn("[GitView] git_log returned", results.length, "commits");
      if (page === 0) {
        setCommits(results);
      } else {
        setCommits((prev) => [...prev, ...results]);
      }
      setHasMoreCommits(results.length === PAGE_SIZE);
      setCommitPage(page);
    } catch (e) {
      console.error("Failed to load commits:", e);
      setDataError(`提交记录加载失败: ${e}`);
    } finally {
      setLoadingCommits(false);
    }
  }

  async function loadBranches(repoPathVal: string) {
    try {
      console.warn("[GitView] calling git_branches with repoPath:", repoPathVal);
      const results = await invoke<GitBranch[]>("git_branches", {
        repoPath: repoPathVal,
        includeRemote: false,
      });
      console.warn("[GitView] git_branches returned", results.length, "branches");
      setBranches(results);
    } catch (e) {
      console.error("Failed to load branches:", e);
      setDataError(`分支加载失败: ${e}`);
    }
  }

  async function handleSelectFile(path: string, staged: boolean) {
    const repo = repoInfo();
    if (!repo) return;

    setSelectedFilePath(path);
    setSelectedFileStaged(staged);
    setDiffLoading(true);

    try {
      // Check if this file is in conflicted state
      const entry = statusEntries().find(e => e.path === path);
      const isConflicted = entry?.status === "Conflicted";

      // For conflicted files, navigate to the merge view instead of showing diff
      if (isConflicted) {
        props.onOpenGitMergeView?.(repo.work_dir, path);
        setDiffLoading(false);
        return;
      }

      const cmd = staged ? "git_diff_staged" : "git_diff_unstaged";
      const result = await invoke<DiffResult>(cmd, {
        repoPath: repo.work_dir,
        path: path,
        options: { algorithm: "Myers", context_lines: 3, ignore_whitespace: false, ignore_case: false },
      });
      setSelectedDiff(result);
    } catch (e) {
      console.error("Failed to load diff:", e);
      setSelectedDiff(null);
    } finally {
      setDiffLoading(false);
    }
  }

  async function handleSelectCommit(commit: GitCommit, mode: "single" | "compare") {
    setSelectedCommit(commit.id);

    if (mode === "compare" && compareFrom()) {
      // Compare two commits
      const from = compareFrom()!;
      const repo = repoInfo();
      if (!repo) return;

      setDiffLoading(true);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<DiffResult>("git_diff_commits", {
          repoPath: repo.work_dir,
          fromCommit: from.id,
          toCommit: commit.id,
          options: { algorithm: "Myers", context_lines: 3, ignore_whitespace: false, ignore_case: false },
        });
        setSelectedDiff(result);
        setSelectedFilePath(`commits: ${from.short_id}..${commit.short_id}`);
      } catch (e) {
        console.error("Failed to compare commits:", e);
      } finally {
        setDiffLoading(false);
      }
      setCompareMode(false);
      setCompareFrom(null);
    } else if (compareMode()) {
      // Entered compare mode: this is the "from" commit
      setCompareFrom(commit);
    } else {
      // Single commit: diff with parent
      const repo = repoInfo();
      if (!repo) return;

      setDiffLoading(true);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<DiffResult>("git_diff_commits", {
          repoPath: repo.work_dir,
          fromCommit: commit.id,
          options: { algorithm: "Myers", context_lines: 3, ignore_whitespace: false, ignore_case: false },
        });
        setSelectedDiff(result);
        setSelectedFilePath(`commit: ${commit.short_id}`);
      } catch (e) {
        console.error("Failed to load commit diff:", e);
      } finally {
        setDiffLoading(false);
      }
    }
  }

  function handleCompareCommits(a: GitCommit, b: GitCommit) {
    setCompareMode(true);
    setCompareFrom(a);
    setSelectedCommit(b.id);
  }

  async function handleCompareBranches(base: string, target: string) {
    const repo = repoInfo();
    if (!repo) return;

    setDiffLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<DiffResult>("git_diff_branches", {
        repoPath: repo.work_dir,
        baseBranch: base,
        targetBranch: target,
        options: { algorithm: "Myers", context_lines: 3, ignore_whitespace: false, ignore_case: false },
      });
      setSelectedDiff(result);
      setSelectedFilePath(`branches: ${base}..${target}`);
    } catch (e) {
      console.error("Failed to compare branches:", e);
    } finally {
      setDiffLoading(false);
    }
  }

  async function handleSelectBranch(branch: GitBranch) {
    if (branchBase() && !branchTarget()) {
      setBranchTarget(branch.name);
    } else {
      setBranchBase(branch.name);
      setBranchTarget(undefined);
    }
  }

  function handleLoadMoreCommits() {
    const repo = repoInfo();
    if (!repo || loadingCommits()) return;
    loadCommits(repo.work_dir, commitPage() + 1);
  }

  function closeRepo() {
    setRepoInfo(null);
    setStatusEntries([]);
    setCommits([]);
    setBranches([]);
    setSelectedDiff(null);
    setSelectedFilePath("");
    setError(null);
    setCommitPage(0);
    setHasMoreCommits(false);
    setCompareMode(false);
    setCompareFrom(null);
    setSelectedCommit(undefined);
    setBranchBase(undefined);
    setBranchTarget(undefined);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && repoInfo()) {
      // Esc: collapse diff panel
      setSelectedDiff(null);
      setSelectedFilePath("");
    }
  }

  // ── Repo Selection Screen ──

  return (
    <div
      class="flex-1 flex flex-col overflow-hidden"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{ outline: "none" }}
    >
      <Show
        when={repoInfo()}
        fallback={
          <RepoSelectionView
            repoPath={repoPath()}
            onRepoPathChange={setRepoPath}
            onOpen={openRepo}
            loading={loading()}
            error={error()}
            recentRepos={recentRepos()}
            onOpenRecent={(path) => { setRepoPath(path); openRepo(); }}
            onOpenPath={(path) => { doOpenRepo(path); }}
          />
        }
      >
        {/* Repository loaded — three-panel layout */}
        <RepoView
          repoInfo={repoInfo()!}
          statusEntries={statusEntries()}
          commits={commits()}
          branches={branches()}
          activePanel={activePanel()}
          onActivePanelChange={setActivePanel}
          onSelectFile={handleSelectFile}
          onSelectCommit={handleSelectCommit}
          onCompareCommits={handleCompareCommits}
          onCompareBranches={handleCompareBranches}
          onSelectBranch={handleSelectBranch}
          onLoadMoreCommits={handleLoadMoreCommits}
          hasMoreCommits={hasMoreCommits()}
          loadingCommits={loadingCommits()}
          selectedCommitId={selectedCommit()}
          compareMode={compareMode()}
          compareFrom={compareFrom()}
          branchBase={branchBase()}
          branchTarget={branchTarget()}
          selectedDiff={selectedDiff()}
          selectedFilePath={selectedFilePath()}
          diffLoading={diffLoading()}
          dataError={dataError()}
          onClose={closeRepo}
        />
      </Show>
    </div>
  );
}

// ── Repo Selection View ──

function RepoSelectionView(props: {
  repoPath: string;
  onRepoPathChange: (path: string) => void;
  onOpen: () => void;
  loading: boolean;
  error: string | null;
  recentRepos: string[];
  onOpenRecent: (path: string) => void;
  onOpenPath: (path: string) => void;
}) {
  const [dragOver, setDragOver] = createSignal(false);

  // 使用 Tauri 原生拖放事件（HTML5 DragEvent 在 Tauri v2 webview 中不工作）
  onMount(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'over') {
        setDragOver(true);
      } else if (event.payload.type === 'leave') {
        setDragOver(false);
      } else if (event.payload.type === 'drop') {
        setDragOver(false);
        const paths = event.payload.paths;
        if (paths.length > 0) {
          handleFileDrop(paths[0]);
        }
      }
    }).then((fn) => { unlisten = fn; });
    onCleanup(() => unlisten?.());
  });

  async function handleFileDrop(p: string) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      console.warn("[GitView] git_discover path:", p);
      const repoWorkDir = await invoke<string>("git_discover", { path: p });
      console.warn("[GitView] git_discover OK, work_dir:", repoWorkDir);
      // 直接打开，不依赖信号传播
      props.onOpenPath(repoWorkDir);
    } catch {
      // 不是 git 仓库，直接尝试打开父目录
      props.onRepoPathChange(p);
      props.onOpen();
    }
  }

  return (
    <div
      class="flex-1 flex items-center justify-center relative"
    >
      {/* 拖放高亮遮罩 */}
      <Show when={dragOver()}>
        <div class="absolute inset-0 z-30 bg-indigo-500/10 border-2 border-dashed border-indigo-500/40 rounded-2xl flex items-center justify-center pointer-events-none">
          <div class="text-center">
            <svg class="w-10 h-10 mx-auto mb-2 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p class="text-sm text-indigo-300 font-medium">拖放文件/文件夹以查找 Git 仓库</p>
          </div>
        </div>
      </Show>

      <div class="w-full max-w-md px-6">
        <div class="text-center mb-8">
          <div class="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
            <svg class="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-slate-200 mb-1">打开 Git 仓库</h2>
          <p class="text-xs text-slate-500">输入路径、从最近仓库选择，或拖放文件/文件夹到此处</p>
        </div>

        <div class="flex items-center gap-2">
          <input
            type="text"
            value={props.repoPath}
            onInput={(e) => props.onRepoPathChange(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") props.onOpen(); }}
            placeholder="输入仓库路径..."
            class="flex-1 px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
          />
          <button
            onClick={props.onOpen}
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Show when={props.loading} fallback={<>打开仓库</>}>
              <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              打开中...
            </Show>
          </button>
        </div>

        <Show when={props.error}>
          <div class="mt-3 flex items-center gap-2 px-3 py-2 bg-red-950/50 border border-red-900/40 rounded-lg">
            <svg class="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span class="text-xs text-red-400">{props.error}</span>
          </div>
        </Show>

        {/* 最近仓库 */}
        <Show when={props.recentRepos.length > 0}>
          <div class="mt-6">
            <div class="flex items-center gap-2 mb-2">
              <svg class="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">最近仓库</span>
            </div>
            <div class="space-y-1">
              <For each={props.recentRepos}>
                {(repo) => (
                  <button
                    onClick={() => props.onOpenRecent(repo)}
                    class="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/30 hover:bg-slate-800/60 transition-colors text-left"
                  >
                    <svg class="w-4 h-4 flex-shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    <span class="flex-1 text-xs text-slate-300 truncate min-w-0">{repo}</span>
                    <svg class="w-3.5 h-3.5 flex-shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="mt-4 text-center">
          <p class="text-[10px] text-slate-600">快捷键: Cmd+Shift+G 打开 Git 视图 • Esc 返回</p>
        </div>
      </div>
    </div>
  );
}

// ── Repo View (three-panel layout) ──

function RepoView(props: {
  repoInfo: GitRepoInfo;
  statusEntries: GitStatusEntry[];
  commits: GitCommit[];
  branches: GitBranch[];
  activePanel: ActivePanel;
  onActivePanelChange: (panel: ActivePanel) => void;
  onSelectFile: (path: string, staged: boolean) => void;
  onSelectCommit: (commit: GitCommit, mode: "single" | "compare") => void;
  onCompareCommits: (a: GitCommit, b: GitCommit) => void;
  onCompareBranches: (base: string, target: string) => void;
  onSelectBranch: (branch: GitBranch) => void;
  onLoadMoreCommits: () => void;
  hasMoreCommits: boolean;
  loadingCommits: boolean;
  selectedCommitId?: string;
  compareMode: boolean;
  compareFrom: GitCommit | null;
  branchBase?: string;
  branchTarget?: string;
  selectedDiff: DiffResult | null;
  selectedFilePath: string;
  diffLoading: boolean;
  dataError?: string | null;
  onClose: () => void;
}) {
  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      {/* Repo header */}
      <div class="flex-shrink-0 h-10 bg-slate-900/60 border-b border-slate-800/50 flex items-center justify-between px-3">
        <div class="flex items-center gap-2 min-w-0">
          <button
            onClick={props.onClose}
            title="返回"
            class="p-1 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <svg class="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <span class="text-xs font-medium text-slate-300 truncate">{props.repoInfo.work_dir}</span>
          <span class="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded font-mono">{props.repoInfo.current_branch ?? "detached"}</span>
          <Show when={props.repoInfo.head_short}>
            <span class="text-[10px] text-slate-500 font-mono">{props.repoInfo.head_short}</span>
          </Show>
        </div>
      </div>

      {/* 数据加载错误提示 */}
      <Show when={props.dataError}>
        <div class="flex-shrink-0 px-3 py-1.5 bg-red-950/60 border-b border-red-900/40 flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span class="text-xs text-red-400">{props.dataError}</span>
        </div>
      </Show>

      {/* Three panel layout */}
      <div class="flex-1 flex overflow-hidden">
        {/* Left: File status sidebar */}
        <div class="w-60 flex-shrink-0 border-r border-slate-800/30 flex flex-col overflow-hidden">
          <PanelTabs
            active={props.activePanel}
            onChange={props.onActivePanelChange}
          />
          <div class="flex-1 overflow-hidden">
            <Show when={props.activePanel === "status"}>
              <GitSidebar
                entries={props.statusEntries}
                onSelectFile={props.onSelectFile}
              />
            </Show>
            <Show when={props.activePanel === "history"}>
              <GitHistoryView
                commits={props.commits}
                onSelectCommit={props.onSelectCommit}
                onCompareCommits={props.onCompareCommits}
                loading={props.loadingCommits}
                hasMore={props.hasMoreCommits}
                onLoadMore={props.onLoadMoreCommits}
                selectedCommitId={props.selectedCommitId}
                compareMode={props.compareMode}
                compareFromId={props.compareFrom?.id}
              />
            </Show>
            <Show when={props.activePanel === "branches"}>
              <GitBranchSelector
                branches={props.branches}
                onSelectBranch={props.onSelectBranch}
                onCompareBranches={props.onCompareBranches}
                selectedBase={props.branchBase}
                selectedTarget={props.branchTarget}
              />
            </Show>
          </div>
        </div>

        {/* Right: Diff content */}
        <div class="flex-1 flex flex-col overflow-hidden">
          <Show
            when={props.selectedDiff}
            fallback={
              <div class="flex-1 flex items-center justify-center">
                <div class="text-center">
                  <svg class="w-10 h-10 mx-auto mb-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <p class="text-xs text-slate-500">选择一个文件或 commit 查看差异</p>
                </div>
              </div>
            }
          >
            {(diff) => (
              <DiffViewer
                diff={diff()}
                filePath={props.selectedFilePath}
                loading={props.diffLoading}
              />
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}

// ── Panel tabs ──

function PanelTabs(props: { active: ActivePanel; onChange: (panel: ActivePanel) => void }) {
  const tabs: { key: ActivePanel; label: string }[] = [
    { key: "status", label: "变更" },
    { key: "history", label: "历史" },
    { key: "branches", label: "分支" },
  ];

  return (
    <div class="flex-shrink-0 flex border-b border-slate-800/30">
      <For each={tabs}>
        {(tab) => (
          <button
            onClick={() => props.onChange(tab.key)}
            class={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${
              props.active === tab.key
                ? "text-indigo-300 border-b-2 border-indigo-500"
                : "text-slate-500 hover:text-slate-300 border-b-2 border-transparent"
            }`}
          >
            {tab.label}
          </button>
        )}
      </For>
    </div>
  );
}

// ── Simple Diff Viewer ──

function DiffViewer(props: { diff: DiffResult; filePath: string; loading: boolean }) {
  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      {/* Diff header */}
      <div class="flex-shrink-0 px-4 py-1.5 bg-slate-900/40 border-b border-slate-800/30 flex items-center gap-2">
        <span class="text-[11px] font-medium text-slate-400">{props.filePath}</span>
        <Show when={props.diff.left_label && props.diff.right_label}>
          <span class="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
            冲突: {props.diff.left_label} vs {props.diff.right_label}
          </span>
        </Show>
        <div class="flex items-center gap-1 ml-auto">
          <span class="flex items-center gap-1 text-[10px] text-emerald-400">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            +{props.diff.hunks.flatMap((h) => h.changes).filter((c) => c.change_type === "Add").length}
          </span>
          <span class="flex items-center gap-1 text-[10px] text-red-400">
            <span class="w-1.5 h-1.5 rounded-full bg-red-500" />
            -{props.diff.hunks.flatMap((h) => h.changes).filter((c) => c.change_type === "Delete").length}
          </span>
        </div>
      </div>

      {/* Diff content */}
      <div class="flex-1 overflow-y-auto no-scrollbar">
        <Show when={!props.loading} fallback={
          <div class="flex items-center justify-center py-8">
            <div class="flex items-center gap-2 text-slate-400 text-sm">
              <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              加载差异中...
            </div>
          </div>
        }>
          <Show when={props.diff.hunks.length > 0} fallback={
            <div class="flex items-center justify-center py-8">
              <p class="text-xs text-slate-500">无差异</p>
            </div>
          }>
            <For each={props.diff.hunks}>
              {(hunk, idx) => (
                <div class="diff-hunk-section" data-hunk-index={idx()}>
                  <div class="px-2 py-0.5 bg-slate-800/40 border-y border-slate-700/30">
                    <span class="text-[9px] text-slate-500 font-mono">
                      @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
                      <Show when={hunk.syntax_context}>
                        <span class="ml-2 text-indigo-400/70"> {hunk.syntax_context}</span>
                      </Show>
                    </span>
                  </div>
                  <For each={hunk.changes}>
                    {(change) => <DiffLine change={change} />}
                  </For>
                </div>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </div>
  );
}

function DiffLine(props: { change: DiffChange }) {
  const change = props.change;

  const bgClass = () => {
    if (change.change_type === "Add") return "bg-diff-add-bg";
    if (change.change_type === "Delete") return "bg-diff-del-bg";
    return "";
  };

  const prefix = () => {
    if (change.change_type === "Add") return "+";
    if (change.change_type === "Delete") return "-";
    return " ";
  };

  const prefixColor = () => {
    if (change.change_type === "Add") return "text-emerald-400";
    if (change.change_type === "Delete") return "text-red-400";
    return "text-slate-600";
  };

  const text = () => change.old_text ?? change.new_text ?? "";

  const lineNos = () => {
    const left = change.old_line_no ?? "";
    const right = change.new_line_no ?? "";
    return `${left}  ${right}`;
  };

  return (
    <div class={`flex diff-line min-h-[22px] ${bgClass()}`}>
      <div class={`w-5 flex-shrink-0 text-center ${prefixColor()} font-mono text-[12px] leading-[22px] select-none`}>
        {prefix()}
      </div>
      <div class="w-14 flex-shrink-0 text-right pr-2 text-slate-600 font-mono text-[11px] leading-[22px] select-none">
        {lineNos()}
      </div>
      <div class="flex-1 pl-2 font-mono text-[12px] leading-[22px] overflow-x-auto whitespace-pre text-slate-300">
        {text()}
      </div>
    </div>
  );
}
