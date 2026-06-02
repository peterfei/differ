import { createSignal, createMemo, Show, For } from "solid-js";
import type { DirectoryDiffResult, DirectoryEntry, EntryStatus } from "../types/diff";
import { addHistoryEntry } from "../lib/historyStore";

interface Props {
  onOpenFileDiff: (leftPath: string, rightPath: string, basePath?: string) => void;
  onOpenMergeView: (base: string, left: string, right: string) => void;
  leftPath: string;
  rightPath: string;
}

export function DirectoryDiffView(props: Props) {
  const [result, setResult] = createSignal<DirectoryDiffResult | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [leftDir, setLeftDir] = createSignal(props.leftPath);
  const [rightDir, setRightDir] = createSignal(props.rightPath);
  const [baseDir, setBaseDir] = createSignal('');
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const [filter, setFilter] = createSignal<EntryStatus | "all">("all");

  const filteredEntries = createMemo(() => {
    const r = result();
    if (!r) return [];
    if (filter() === "all") return r.entries;
    return filterTree(r.entries, filter());
  });

  async function selectDir(side: "left" | "right" | "base") {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const titles: Record<string, string> = { left: "原始目录", right: "修改后目录", base: "Base 目录（共同祖先）" };
    const dir = await open({ multiple: false, title: `选择${titles[side]}`, directory: true });
    if (!dir) return;
    if (side === "left") setLeftDir(dir as string);
    else if (side === "right") setRightDir(dir as string);
    else setBaseDir(dir as string);
  }

  async function runDiff() {
    if (!leftDir() || !rightDir()) return;
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const r = await invoke<DirectoryDiffResult>("diff_directories_command", {
        leftPath: leftDir(),
        rightPath: rightDir(),
      });
      setResult(r);
      // 写入历史记录
      addHistoryEntry({
        id: `dir_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "directory",
        label: `${leftDir().split(/[/\\]/).pop() ?? "?"} ↔ ${rightDir().split(/[/\\]/).pop() ?? "?"}`,
        timestamp: Date.now(),
        dirs: [leftDir(), rightDir()],
        adds: r.added,
        dels: r.removed,
      });
      // Auto-expand all on result
      const all = new Set<string>();
      collectPaths(r.entries, all);
      setExpanded(all);
    } catch (e) {
      console.error("Directory diff failed:", e);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div class="flex-shrink-0 bg-slate-900/60 border-b border-slate-800/50 px-4 py-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button
              onClick={selectDir.bind(null, "left")}
              class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
            >
              <span class="text-emerald-400 font-mono text-[10px]">L:</span>
              <span class="max-w-[200px] truncate">{leftDir() || "选择原始目录..."}</span>
            </button>
            <span class="text-slate-600 text-xs">vs</span>
            <button
              onClick={selectDir.bind(null, "right")}
              class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
            >
              <span class="text-red-400 font-mono text-[10px]">R:</span>
              <span class="max-w-[200px] truncate">{rightDir() || "选择修改后目录..."}</span>
            </button>
            <button
              onClick={selectDir.bind(null, "base")}
              class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
              title="可选：提供 base 目录后可从此处直接进入三路合并"
            >
              <span class="text-violet-400 font-mono text-[10px]">B:</span>
              <span class="max-w-[200px] truncate">{baseDir() || "Base(可选)..."}</span>
            </button>
            <button
              onClick={runDiff}
              disabled={!leftDir() || !rightDir()}
              class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40"
            >
              对比目录
            </button>
          </div>

          <Show when={result()}>
            {(r) => (
              <div class="flex items-center gap-3">
                <select
                  value={filter()}
                  onChange={(e) => setFilter(e.currentTarget.value as EntryStatus | "all")}
                  class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-slate-300 focus:outline-none"
                >
                  <option value="all">全部 ({r().left_total + r().right_total})</option>
                  <option value="Added">新增 ({r().added})</option>
                  <option value="Removed">删除 ({r().removed})</option>
                  <option value="Modified">修改 ({r().modified})</option>
                </select>
                <div class="flex items-center gap-2 text-[10px]">
                  <StatusBadge status="Added" count={r().added} />
                  <StatusBadge status="Removed" count={r().removed} />
                  <StatusBadge status="Modified" count={r().modified} />
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>

      {/* Tree Content */}
      <div class="flex-1 overflow-y-auto no-scrollbar">
        <Show
          when={result()}
          fallback={
            <div class="flex-1 flex items-center justify-center">
              <div class="text-center">
                <svg class="w-10 h-10 text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                <p class="text-sm text-slate-500">选择左右目录并点击「对比目录」</p>
                <p class="text-xs text-slate-600 mt-1">目录对比会递归分析所有文件的增删改</p>
              </div>
            </div>
          }
        >
          <div class="p-4">
            <For each={filteredEntries()}>
              {(entry) => <FileTreeNode entry={entry} depth={0} expanded={expanded()} onToggle={toggleExpand} onOpenDiff={openFileDiff} hasBase={!!baseDir()} />}
            </For>
          </div>
        </Show>
        <Show when={loading()}>
          <div class="absolute inset-0 bg-slate-950/60 flex items-center justify-center z-20">
            <div class="flex items-center gap-2 text-slate-300 text-sm">
              <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              对比目录中...
            </div>
          </div>
        </Show>
      </div>
    </div>
  );

  function openFileDiff(entry: DirectoryEntry) {
    if (entry.is_dir || entry.status === "Same" || entry.status === "Added" || entry.status === "Removed") return;
    const fullLeft = joinPath(leftDir(), entry.path);
    const fullRight = joinPath(rightDir(), entry.path);
    const fullBase = baseDir() ? joinPath(baseDir(), entry.path) : '';
    if (fullBase) {
      props.onOpenFileDiff(fullLeft, fullRight, fullBase);
    } else {
      props.onOpenFileDiff(fullLeft, fullRight);
    }
  }
}

// ── FileTree 节点 ──

function FileTreeNode(props: {
  entry: DirectoryEntry;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpenDiff: (entry: DirectoryEntry) => void;
  hasBase?: boolean;
}) {
  const e = () => props.entry;
  const hasChildren = () => e().is_dir && e().children && e().children!.length > 0;
  const isExpanded = () => props.expanded.has(e().path);
  const name = () => e().path.split("/").pop() ?? e().path;

  const colorMap: Record<EntryStatus, string> = {
    Added: "text-emerald-400",
    Removed: "text-red-400",
    Modified: "text-amber-400",
    Same: "text-slate-500",
  };

  const iconMap: Record<EntryStatus, string> = {
    Added: "+",
    Removed: "-",
    Modified: "~",
    Same: " ",
  };

  function handleClick() {
    if (e().is_dir) {
      props.onToggle(e().path);
    } else if (e().status === "Modified") {
      props.onOpenDiff(e());
    }
  }

  return (
    <div>
      <div
        class={`flex items-center gap-1.5 py-0.5 px-1 rounded cursor-pointer hover:bg-slate-800/50 transition-colors ${e().status === "Modified" ? "hover:bg-indigo-900/20" : ""}`}
        style={{ "padding-left": `${props.depth * 16 + 4}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse arrow */}
        <span class="w-4 flex-shrink-0 text-center text-[10px] text-slate-600 select-none">
          {hasChildren() ? (isExpanded() ? "▼" : "▶") : ""}
        </span>
        {/* Status indicator */}
        <span class={`w-3 text-center font-mono text-[10px] font-bold ${colorMap[e().status]} flex-shrink-0`}>
          {iconMap[e().status]}
        </span>
        {/* File/folder icon */}
        <span class="flex-shrink-0 text-slate-500 text-[11px]">
          {e().is_dir ? "📁" : "📄"}
        </span>
        {/* Name */}
        <span class={`text-xs truncate ${e().status === "Same" ? "text-slate-500" : "text-slate-200"}`}>
          {name()}
        </span>
        {/* Click hint for modified files */}
        <Show when={e().status === "Modified"}>
          <span class="text-[9px] text-indigo-500/60 ml-1">{props.hasBase ? "点击 diff / 三路合并" : "点击查看 diff"}</span>
        </Show>
      </div>

      <Show when={hasChildren() && isExpanded()}>
        <For each={e().children!}>
          {(child) => (
            <FileTreeNode entry={child} depth={props.depth + 1} expanded={props.expanded} onToggle={props.onToggle} onOpenDiff={props.onOpenDiff} />
          )}
        </For>
      </Show>
    </div>
  );
}

// ── 辅助 ──

function StatusBadge(props: { status: EntryStatus; count: number }) {
  const colors: Record<EntryStatus, string> = {
    Added: "bg-emerald-500/20 text-emerald-400",
    Removed: "bg-red-500/20 text-red-400",
    Modified: "bg-amber-500/20 text-amber-400",
    Same: "bg-slate-500/20 text-slate-400",
  };
  return (
    <span class={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[props.status]}`}>
      {props.status === "Added" ? "+" : props.status === "Removed" ? "-" : props.status === "Modified" ? "~" : "="}{props.count}
    </span>
  );
}

function collectPaths(entries: DirectoryEntry[], out: Set<string>) {
  for (const e of entries) {
    if (e.is_dir) {
      out.add(e.path);
      if (e.children) collectPaths(e.children, out);
    }
  }
}

function filterTree(entries: DirectoryEntry[], filter: EntryStatus | "all"): DirectoryEntry[] {
  if (filter === "all") return entries;
  const result: DirectoryEntry[] = [];
  for (const e of entries) {
    const children = e.children ? filterTree(e.children, filter) : undefined;
    if (e.status === filter || (children && children.length > 0)) {
      result.push({ ...e, children });
    }
  }
  return result;
}

function joinPath(left: string, right: string): string {
  if (left.endsWith("/") || left.endsWith("\\")) return left + right;
  return left + "/" + right;
}
