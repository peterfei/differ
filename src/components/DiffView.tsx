import { createSignal, For, Show, createMemo } from "solid-js";
import type { DiffResult, DiffHunk, DiffChange, ChangeType } from "../types/diff";

// ── DiffView: 主管口组件 ──

export function DiffView() {
  const [result, setResult] = createSignal<DiffResult | null>(null);
  const [activeHunk, setActiveHunk] = createSignal(0);
  const [algorithm, setAlgorithm] = createSignal<"Myers" | "Patience">("Myers");
  const [leftPath, setLeftPath] = createSignal("");
  const [rightPath, setRightPath] = createSignal("");
  const [loading, setLoading] = createSignal(false);

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
    } catch (e) {
      console.error("Diff failed:", e);
    } finally {
      setLoading(false);
    }
  }

  function prevHunk() {
    setActiveHunk((i) => Math.max(0, i - 1));
  }

  function nextHunk() {
    setActiveHunk((i) => Math.min(totalHunks() - 1, i + 1));
  }

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
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

      {/* Diff Content */}
      <div class="flex-1 overflow-hidden relative">
        <Show
          when={result()}
          fallback={
            <DropZone onDrop={(l, r) => { setLeftPath(l); setRightPath(r); }} onRun={() => { if (leftPath() && rightPath()) runDiff(); }} />
          }
        >
          {(r) => <SideBySideDiff result={r()} activeHunk={activeHunk()} />}
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
      </div>

      {/* Bottom status bar */}
      <Show when={result()}>
        <div class="flex-shrink-0 h-9 bg-slate-900/60 border-t border-slate-800/50 flex items-center justify-between px-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-2">
              <button onClick={prevHunk} class="p-1 text-slate-500 hover:text-slate-300 transition-colors" disabled={activeHunk() === 0}>
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <span class="text-[11px] text-slate-400 font-medium">{activeHunk() + 1} / {totalHunks()}</span>
              <button onClick={nextHunk} class="p-1 text-slate-500 hover:text-slate-300 transition-colors" disabled={activeHunk() >= totalHunks() - 1}>
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
          <span class="text-[10px] text-slate-600">算法: {algorithm()}</span>
        </div>
      </Show>
    </div>
  );
}

// ── SideBySideDiff: 并排对比渲染 ──

function SideBySideDiff(props: { result: DiffResult; activeHunk: number }) {
  return (
    <div class="flex h-full overflow-hidden">
      <DiffPanel hunks={props.result.hunks} side="left" activeHunk={props.activeHunk} />
      <div class="w-px bg-slate-800/60 flex-shrink-0" />
      <DiffPanel hunks={props.result.hunks} side="right" activeHunk={props.activeHunk} />
    </div>
  );
}

// ── DiffPanel: 单侧面板 ──

function DiffPanel(props: { hunks: DiffHunk[]; side: "left" | "right"; activeHunk: number }) {
  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <div class="flex-shrink-0 px-4 py-1.5 bg-slate-900/40 border-b border-slate-800/30">
        <span class="text-[11px] font-medium text-slate-400">
          {props.side === "left" ? "原始文件" : "修改后文件"}
        </span>
      </div>
      <div class="flex-1 overflow-y-auto no-scrollbar" id={`diff-panel-${props.side}`}>
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
                {(change) => <DiffRow change={change} side={props.side} />}
              </For>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

// ── DiffRow: 单行渲染 ──

function DiffRow(props: { change: DiffChange; side: "left" | "right" }) {
  const change = props.change;

  // 是否显示在这一侧
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

  return (
    <Show when={visible()}>
      <div class={`flex diff-line ${bgClass()} min-h-[22px]`}>
        <div class={`w-10 flex-shrink-0 text-right pr-2 ${lineNoColor()} line-numbers text-[11px] select-none`}>
          {lineNo()}
        </div>
        <div class="flex-1 pl-2 font-mono text-[12px] leading-[22px] overflow-x-auto whitespace-pre">
          <Show when={change.inline_changes.length > 0 && text()} fallback={text()}>
            <InlineDiffRenderer text={text()!} inlines={change.inline_changes} changeType={change.change_type} />
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
        <span class={part.highlight ? hlClass() : "text-slate-400"}>{part.text}</span>
      )}
    </For>
  );
}

// ── DropZone: 拖放区域 ──

function DropZone(props: { onDrop: (left: string, right: string) => void; onRun: () => void }) {
  let ref: HTMLDivElement | undefined;

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
      ref={ref}
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
