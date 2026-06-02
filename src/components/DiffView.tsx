import { createSignal, For, Show, createMemo, createEffect, onMount, onCleanup } from "solid-js";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { DiffResult, DiffHunk, DiffChange, ChangeType } from "../types/diff";
import { detectLanguage, highlightFile, type HighlightedLines } from "../lib/highlight";
import { diffPaths as navDiffPaths } from "../lib/navStore";

// ── 文本重建：从 hunks 中提取完整文件内容 ──

function reconstructText(hunks: DiffHunk[], side: "left" | "right"): string {
  const lines: string[] = [];
  for (const hunk of hunks) {
    for (const change of hunk.changes) {
      const text = side === "left" ? change.old_text : change.new_text;
      if (text !== null) {
        lines.push(text);
      }
    }
  }
  return lines.join("\n");
}

// ── DiffView: 主管口组件 ──

export function DiffView() {
  const [result, setResult] = createSignal<DiffResult | null>(null);
  const [activeHunk, setActiveHunk] = createSignal(0);
  const [algorithm, setAlgorithm] = createSignal<"Myers" | "Patience">("Myers");
  const [leftPath, setLeftPath] = createSignal("");
  const [rightPath, setRightPath] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [viewMode, setViewMode] = createSignal<"side-by-side" | "unified">("side-by-side");
  const [goToLine, setGoToLine] = createSignal(false);
  const [targetLine, setTargetLine] = createSignal("");
  const [highlightedLeft, setHighlightedLeft] = createSignal<HighlightedLines | null>(null);
  const [highlightedRight, setHighlightedRight] = createSignal<HighlightedLines | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const [fileChanged, setFileChanged] = createSignal(false);

  let unlisten: UnlistenFn | undefined;

  // 监听外部传入的路径变化（从目录对比导航过来时触发）
  createEffect(() => {
    const paths = navDiffPaths();
    if (paths) {
      setLeftPath(paths.left);
      setRightPath(paths.right);
      setError(null);
      runDiff();
    }
  });

  onMount(async () => {
    // Listen for file change events from the Rust backend
    const { listen } = await import("@tauri-apps/api/event");
    const un = await listen<string>("file-changed", (event) => {
      // Only notify if we're currently showing a diff for these files
      if (result() && event.payload) {
        setFileChanged(true);
      }
    });
    unlisten = un;
  });

  onCleanup(() => {
    unlisten?.();
    // Stop file watching when component unmounts
    unwatch();
  });

  async function watch(paths: string[]) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("watch_files", { paths });
    } catch (e) {
      // File watching is optional, silently fail
    }
  }

  async function unwatch() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("unwatch_files");
    } catch {
      // Silent
    }
  }

  async function reRunDiff() {
    setFileChanged(false);
    await runDiff();
  }

  const totalHunks = createMemo(() => result()?.hunks.length ?? 0);

  const totalAdds = createMemo(
    () =>
      result()
        ?.hunks.flatMap((h) => h.changes)
        .filter((c) => c.change_type === "Add").length ?? 0
  );

  const totalDels = createMemo(
    () =>
      result()
        ?.hunks.flatMap((h) => h.changes)
        .filter((c) => c.change_type === "Delete").length ?? 0
  );

  function onKeyDown(e: KeyboardEvent) {
    // J / K: 下一个/上一个 hunk
    if (e.key === "j" || e.key === "J") {
      nextHunk();
      e.preventDefault();
    }
    if (e.key === "k" || e.key === "K") {
      prevHunk();
      e.preventDefault();
    }
    // Ctrl+G or Cmd+G: 跳转到行
    if ((e.ctrlKey || e.metaKey) && e.key === "g") {
      setGoToLine(true);
      setTargetLine("");
      e.preventDefault();
    }
    // Escape: 关闭跳转输入
    if (e.key === "Escape") {
      setGoToLine(false);
      setTargetLine("");
    }
    // Enter in go-to-line: 跳转
    if (e.key === "Enter" && goToLine()) {
      const line = parseInt(targetLine());
      if (!isNaN(line) && line > 0 && result()) {
        jumpToLine(line);
      }
      setGoToLine(false);
      setTargetLine("");
      e.preventDefault();
    }
    // Ctrl+D or Cmd+D: 切换视图
    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
      setViewMode((m) => (m === "side-by-side" ? "unified" : "side-by-side"));
      e.preventDefault();
    }
  }

  function jumpToLine(line: number) {
    const r = result();
    if (!r) return;
    for (let i = 0; i < r.hunks.length; i++) {
      const hunk = r.hunks[i];
      for (const change of hunk.changes) {
        if (change.old_line_no === line || change.new_line_no === line) {
          setActiveHunk(i);
          setTimeout(() => {
            const el = document.querySelector(`[data-hunk-index="${i}"]`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 50);
          return;
        }
      }
    }
  }

  async function openFiles() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const left = await open({ multiple: false, title: "选择原始文件" });
    if (!left) return;
    const right = await open({ multiple: false, title: "选择修改后文件" });
    if (!right) return;
    setLeftPath(left as string);
    setRightPath(right as string);
    await runDiff();
  }

  async function runDiff() {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const r = await invoke<DiffResult>("diff_files", {
        leftPath: leftPath(),
        rightPath: rightPath(),
        options: { algorithm: algorithm(), context_lines: 3, ignore_whitespace: false, ignore_case: false },
      });
      setResult(r);
      setActiveHunk(0);
      setFileChanged(false);
      // 异步触发语法高亮
      highlightDiffContent(r, leftPath(), rightPath());
      // 自动监视文件变更
      watch([leftPath(), rightPath()]);
    } catch (e) {
      console.error("Diff failed:", e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function highlightDiffContent(r: DiffResult, leftP: string, rightP: string) {
    try {
      const leftLang = detectLanguage(leftP);
      const rightLang = detectLanguage(rightP);
      const [leftHl, rightHl] = await Promise.all([
        leftLang !== "text" ? highlightFile(reconstructText(r.hunks, "left"), leftLang) : Promise.resolve(null),
        rightLang !== "text" ? highlightFile(reconstructText(r.hunks, "right"), rightLang) : Promise.resolve(null),
      ]);
      if (leftHl) setHighlightedLeft(leftHl);
      if (rightHl) setHighlightedRight(rightHl);
    } catch {
      // 高亮失败时降级到纯文本
    }
  }

  function prevHunk() {
    const i = Math.max(0, activeHunk() - 1);
    setActiveHunk(i);
    scrollToHunk(i);
  }

  function nextHunk() {
    const i = Math.min(totalHunks() - 1, activeHunk() + 1);
    setActiveHunk(i);
    scrollToHunk(i);
  }

  function scrollToHunk(index: number) {
    setTimeout(() => {
      const el = document.querySelector(`[data-hunk-index="${index}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  return (
    <div class="flex-1 flex flex-col overflow-hidden" tabIndex={-1} onKeyDown={onKeyDown} style={{ "outline": "none" }}>
      {/* Toolbar */}
      <div class="flex-shrink-0 bg-slate-900/60 border-b border-slate-800/50 px-4 py-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button
              onClick={openFiles}
              class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors shadow-lg shadow-indigo-600/20"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              打开文件
            </button>
            <Show when={leftPath()}>
              <div class="flex items-center gap-1.5 text-xs">
                <FileBadge path={leftPath()} />
                <span class="text-slate-600">vs</span>
                <FileBadge path={rightPath()} />
              </div>
            </Show>
          </div>
          <Show when={result()}>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1">
                <span class="flex items-center gap-1 text-[10px] text-emerald-400">
                  <span class="badge-dot bg-emerald-500" />+{totalAdds()}
                </span>
                <span class="flex items-center gap-1 text-[10px] text-red-400">
                  <span class="badge-dot bg-red-500" />-{totalDels()}
                </span>
              </div>
              {/* View toggle */}
              <div class="flex items-center bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/30">
                <button
                  class={`p-1.5 rounded-md transition-colors ${viewMode() === "side-by-side" ? "text-indigo-300 bg-indigo-500/15" : "text-slate-500 hover:text-slate-300"}`}
                  onClick={() => setViewMode("side-by-side")}
                  title="并排视图 (Ctrl+D)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </button>
                <button
                  class={`p-1.5 rounded-md transition-colors ${viewMode() === "unified" ? "text-indigo-300 bg-indigo-500/15" : "text-slate-500 hover:text-slate-300"}`}
                  onClick={() => setViewMode("unified")}
                  title="统一视图 (Ctrl+D)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>
              </div>
              {/* Algorithm selector */}
              <div class="flex items-center gap-1 bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/30">
                <button
                  class={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${algorithm() === "Myers" ? "text-indigo-300 bg-indigo-500/15" : "text-slate-500 hover:text-slate-300"}`}
                  onClick={() => { setAlgorithm("Myers"); if (leftPath()) runDiff(); }}
                >
                  Myers
                </button>
                <button
                  class={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${algorithm() === "Patience" ? "text-indigo-300 bg-indigo-500/15" : "text-slate-500 hover:text-slate-300"}`}
                  onClick={() => { setAlgorithm("Patience"); if (leftPath()) runDiff(); }}
                >
                  Patience
                </button>
              </div>
            </div>
          </Show>
        </div>
      </div>

      {/* Error display */}
      <Show when={error()}>
        <div class="flex-shrink-0 bg-red-950/50 border-b border-red-900/40 px-4 py-2 flex items-center gap-2">
          <svg class="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span class="text-xs text-red-400">{error()}</span>
        </div>
      </Show>

      {/* File change notification */}
      <Show when={fileChanged()}>
        <div class="flex-shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-xs text-amber-300">文件已变更</span>
          </div>
          <button
            onClick={reRunDiff}
            class="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-medium rounded-lg transition-colors"
          >
            重新对比
          </button>
        </div>
      </Show>

      {/* Diff Content */}
      <div class="flex-1 overflow-hidden relative" onClick={() => !goToLine() && document.querySelector('[tabIndex="-1"]')?.focus()}>
        <Show
          when={result()}
          fallback={
            <DropZone onDrop={(l, r) => { setLeftPath(l); setRightPath(r); }} onRun={() => { if (leftPath() && rightPath()) runDiff(); }} />
          }
        >
          {(r) =>
            viewMode() === "side-by-side"
              ? <SideBySideDiff result={r()} activeHunk={activeHunk()} highlightedLeft={highlightedLeft()} highlightedRight={highlightedRight()} />
              : <UnifiedDiff result={r()} activeHunk={activeHunk()} highlightedLeft={highlightedLeft()} highlightedRight={highlightedRight()} />
          }
        </Show>
        <Show when={loading()}>
          <div class="absolute inset-0 bg-slate-950/60 flex items-center justify-center z-20">
            <div class="flex items-center gap-2 text-slate-300 text-sm">
              <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              计算差异中...
            </div>
          </div>
        </Show>
        {/* Go-to-line overlay */}
        <Show when={goToLine()}>
          <div class="absolute top-4 left-1/2 -translate-x-1/2 z-30">
            <div class="flex items-center gap-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 shadow-xl">
              <span class="text-xs text-slate-400">跳转到行:</span>
              <input
                type="text"
                value={targetLine()}
                onInput={(e) => setTargetLine(e.currentTarget.value)}
                class="w-16 bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-0.5 border border-slate-600 focus:outline-none focus:border-indigo-500"
                autofocus
              />
              <span class="text-[10px] text-slate-500">Enter ↵</span>
            </div>
          </div>
        </Show>
      </div>

      {/* Bottom status bar */}
      <Show when={result()}>
        <div class="flex-shrink-0 h-9 bg-slate-900/60 border-t border-slate-800/50 flex items-center justify-between px-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-2">
              <button onClick={prevHunk} class="p-1 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30" disabled={activeHunk() === 0}>
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <span class="text-[11px] text-slate-400 font-medium">{activeHunk() + 1} / {totalHunks()}</span>
              <button onClick={nextHunk} class="p-1 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30" disabled={activeHunk() >= totalHunks() - 1}>
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
            <div class="w-px h-3 bg-slate-700/50" />
            <div class="flex items-center gap-2 text-[10px] text-slate-500">
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-emerald-500/60" /> +{totalAdds()}</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-red-500/60" /> -{totalDels()}</span>
            </div>
          </div>
          <div class="flex items-center gap-3 text-[10px] text-slate-600">
            <span>J/K: 导航</span>
            <span>Ctrl+G: 跳转</span>
            <span>Ctrl+D: 切换视图</span>
            <span>算法: {algorithm()}</span>
          </div>
        </div>
      </Show>
    </div>
  );
}

// ── SideBySideDiff: 并排对比渲染 ──

function SideBySideDiff(props: { result: DiffResult; activeHunk: number; highlightedLeft: HighlightedLines | null; highlightedRight: HighlightedLines | null }) {
  return (
    <div class="flex h-full overflow-hidden">
      <DiffPanel hunks={props.result.hunks} side="left" activeHunk={props.activeHunk} highlighted={props.highlightedLeft} />
      <div class="w-px bg-slate-800/60 flex-shrink-0" />
      <DiffPanel hunks={props.result.hunks} side="right" activeHunk={props.activeHunk} highlighted={props.highlightedRight} />
    </div>
  );
}

// ── UnifiedDiff: 统一视图 ──

function UnifiedDiff(props: { result: DiffResult; activeHunk: number; highlightedLeft: HighlightedLines | null; highlightedRight: HighlightedLines | null }) {
  return (
    <div class="h-full overflow-y-auto no-scrollbar">
      <For each={props.result.hunks}>
        {(hunk, hunkIdx) => (
          <div
            class={`diff-hunk-section ${hunkIdx() === props.activeHunk ? "ring-1 ring-inset ring-indigo-500/30" : ""}`}
            data-hunk-index={hunkIdx()}
          >
            <div class="px-2 py-0.5 bg-slate-800/40 border-y border-slate-700/30">
              <span class="text-[9px] text-slate-500 font-mono">
                @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
              </span>
            </div>
            <For each={hunk.changes}>
              {(change) => <UnifiedRow change={change} highlightedLeft={props.highlightedLeft} highlightedRight={props.highlightedRight} />}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}

function UnifiedRow(props: { change: DiffChange; highlightedLeft: HighlightedLines | null; highlightedRight: HighlightedLines | null }) {
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

  const highlightedHtml = createMemo(() => {
    if (change.change_type === "Add") {
      if (!props.highlightedRight || change.new_line_no === null) return null;
      return props.highlightedRight[change.new_line_no] ?? null;
    }
    if (change.change_type === "Delete") {
      if (!props.highlightedLeft || change.old_line_no === null) return null;
      return props.highlightedLeft[change.old_line_no] ?? null;
    }
    // Equal: priotitize old side
    if (props.highlightedLeft && change.old_line_no !== null) {
      return props.highlightedLeft[change.old_line_no] ?? null;
    }
    if (props.highlightedRight && change.new_line_no !== null) {
      return props.highlightedRight[change.new_line_no] ?? null;
    }
    return null;
  });

  return (
    <div class={`flex diff-line ${bgClass()} min-h-[22px]`}>
      <div class={`w-5 flex-shrink-0 text-center ${prefixColor()} font-mono text-[12px] leading-[22px] select-none`}>
        {prefix()}
      </div>
      <div class="w-14 flex-shrink-0 text-right pr-2 text-slate-600 font-mono text-[11px] leading-[22px] select-none">
        {lineNos()}
      </div>
      <div class="flex-1 pl-2 font-mono text-[12px] leading-[22px] overflow-x-auto whitespace-pre text-slate-300">
        <Show when={highlightedHtml()} fallback={
          <Show when={change.inline_changes.length > 0} fallback={<>{text()}</>}>
            <InlineDiffRenderer text={text()} inlines={change.inline_changes} changeType={change.change_type} />
          </Show>
        }>
          <span innerHTML={highlightedHtml()!} />
        </Show>
      </div>
    </div>
  );
}

// ── DiffPanel: 单侧面板 ──

function DiffPanel(props: { hunks: DiffHunk[]; side: "left" | "right"; activeHunk: number; highlighted: HighlightedLines | null }) {
  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <div class="flex-shrink-0 px-4 py-1.5 bg-slate-900/40 border-b border-slate-800/30">
        <div class="flex items-center gap-2">
          <span class={`w-2 h-2 rounded-full ${props.side === "left" ? "bg-emerald-500" : "bg-red-500"}`} />
          <span class="text-[11px] font-medium text-slate-400">
            {props.side === "left" ? "原始文件" : "修改后文件"}
          </span>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto no-scrollbar">
        <For each={props.hunks}>
          {(hunk, hunkIdx) => (
            <div
              class={`diff-hunk-section ${hunkIdx() === props.activeHunk ? "ring-1 ring-inset ring-indigo-500/30" : ""}`}
              data-hunk-index={hunkIdx()}
            >
              <div class="px-2 py-0.5 bg-slate-800/40 border-y border-slate-700/30">
                <span class="text-[9px] text-slate-500 font-mono">
                  @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
                </span>
              </div>
              <For each={hunk.changes}>
                {(change) => <DiffRow change={change} side={props.side} highlighted={props.highlighted} />}
              </For>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

// ── DiffRow: 单行渲染（side-by-side） ──

function DiffRow(props: { change: DiffChange; side: "left" | "right"; highlighted: HighlightedLines | null }) {
  const change = props.change;

  const visible = createMemo(() => {
    if (change.change_type === "Equal") return true;
    if (props.side === "left" && change.change_type === "Delete") return true;
    if (props.side === "right" && change.change_type === "Add") return true;
    return false;
  });

  const bgClass = createMemo(() => {
    if (change.change_type === "Add") return "bg-diff-add-bg";
    if (change.change_type === "Delete") return "bg-diff-del-bg";
    return "";
  });

  const lineNo = createMemo(() =>
    props.side === "left" ? change.old_line_no : change.new_line_no
  );

  const lineNoColor = createMemo(() => {
    if (change.change_type === "Add") return "text-emerald-400";
    if (change.change_type === "Delete") return "text-red-400";
    return "text-slate-600";
  });

  const text = createMemo(() =>
    props.side === "left" ? change.old_text : change.new_text
  );

  const highlightedHtml = createMemo(() => {
    if (!props.highlighted) return null;
    const ln = lineNo();
    if (ln === null) return null;
    return props.highlighted[ln] ?? null;
  });

  return (
    <Show when={visible()}>
      <div class={`flex diff-line ${bgClass()} min-h-[22px]`}>
        <div class={`w-10 flex-shrink-0 text-right pr-2 ${lineNoColor()} line-numbers text-[11px] select-none`}>
          {lineNo()}
        </div>
        <div class="flex-1 pl-2 font-mono text-[12px] leading-[22px] overflow-x-auto whitespace-pre text-slate-300">
          <Show when={highlightedHtml()} fallback={
            <Show when={change.inline_changes.length > 0 && text()} fallback={<>{text()}</>}>
              <InlineDiffRenderer text={text()!} inlines={change.inline_changes} changeType={change.change_type} />
            </Show>
          }>
            <span innerHTML={highlightedHtml()!} />
          </Show>
        </div>
      </div>
    </Show>
  );
}

// ── InlineDiffRenderer: 行内差异高亮 ──

function InlineDiffRenderer(props: { text: string; inlines: { start: number; end: number; change_type: ChangeType }[]; changeType: ChangeType }) {
  const parts = createMemo(() => {
    const result: { text: string; highlight: boolean }[] = [];
    let last = 0;
    for (const inline of props.inlines) {
      if (inline.start > last) {
        result.push({ text: props.text.slice(last, inline.start), highlight: false });
      }
      result.push({ text: props.text.slice(inline.start, inline.end), highlight: true });
      last = inline.end;
    }
    if (last < props.text.length) {
      result.push({ text: props.text.slice(last), highlight: false });
    }
    return result;
  });

  const hlClass = () =>
    props.changeType === "Add" ? "text-emerald-200 bg-diff-wordAdd/40 rounded-sm" : "text-red-200 bg-diff-wordDel/40 rounded-sm";

  return (
    <For each={parts()}>
      {(part) => (
        <span class={part.highlight ? hlClass() : "text-inherit"}>{part.text}</span>
      )}
    </For>
  );
}

// ── DropZone: 拖放区域 ──

function DropZone(props: { onDrop: (left: string, right: string) => void; onRun: () => void }) {
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length >= 2) {
      props.onDrop(files[0].path, files[1].path);
      props.onRun();
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
  }

  return (
    <div
      class="flex-1 flex items-center justify-center"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center">
          <svg class="w-7 h-7 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <div>
          <p class="text-sm text-slate-400 mb-1">拖放两个文件到此处</p>
          <p class="text-xs text-slate-600">或点击上方「打开文件」按钮选择</p>
        </div>
      </div>
    </div>
  );
}

// ── FileBadge: 文件名显示 ──

function FileBadge(props: { path: string }) {
  const name = () => props.path.split(/[/\\]/).pop() ?? props.path;
  return (
    <div class="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700/40">
      <span class="text-slate-300 text-xs">{name()}</span>
    </div>
  );
}
