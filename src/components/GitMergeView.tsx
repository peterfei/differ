import { createSignal, Show, createResource, createRenderEffect } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { ConflictContent } from "../types/git";
import type { MergeResult, MergeConflict } from "../types/merge";

interface GitMergeViewProps {
  repoPath: string;
  filePath: string;
  onBack: () => void;
}

interface MergeViewData {
  conflictContent: ConflictContent;
  mergeResult: MergeResult;
}

export function GitMergeView(props: GitMergeViewProps) {
  const [saving, setSaving] = createSignal(false);
  const [selectedConflictIdx, setSelectedConflictIdx] = createSignal(0);
  const [editing, setEditing] = createSignal(false);
  const [editText, setEditText] = createSignal("");
  const [resolvedConflicts, setResolvedConflicts] = createSignal<Set<number>>(new Set());
  const [localMergeResult, setLocalMergeResult] = createSignal<MergeResult | null>(null);

  // ── Data loading via createResource ──
  // SolidJS's official async data primitive: signal updates from the fetcher
  // always trigger DOM re-renders correctly (unlike onMount + .then/finally).

  const [data] = createResource(
    () => `${props.repoPath}:${props.filePath}`,
    async (key): Promise<MergeViewData> => {
      const [repoPath, filePath] = key.split(":");
      const content = await invoke<ConflictContent>("git_get_conflict_content", {
        repoPath,
        path: filePath,
      });
      const result = await invoke<MergeResult>("merge_text", {
        baseText: content.base_text,
        leftText: content.ours_text,
        rightText: content.theirs_text,
      });
      return { conflictContent: content, mergeResult: result };
    },
  );

  // Sync local merge result from resource when data loads
  createRenderEffect(() => {
    const d = data();
    if (d) {
      setLocalMergeResult(d.mergeResult);
      setEditText(d.mergeResult.merged_text);
    }
  });

  // ── Conflict resolution helpers ──
  // These operate on localMergeResult signal (not the resource), so they
  // work correctly for local-only modifications (adoptSide) and async
  // re-merges (smartMerge).

  function adoptSide(side: "left" | "right") {
    const res = localMergeResult();
    if (!res) return;
    const idx = selectedConflictIdx();
    if (idx < 0 || idx >= res.conflicts.length) return;

    const conflict = res.conflicts[idx];
    const lines = res.merged_text.split("\n");
    const startLine = conflict.start_line - 1; // 0-based

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

    const newConflicts = parseConflictsFromText(newText);
    const newResolved = new Set<number>(resolvedConflicts());
    newResolved.add(idx);

    setLocalMergeResult({ ...res, merged_text: newText, conflicts: newConflicts });
    setResolvedConflicts(newResolved);
    setEditText(newText);

    if (idx < newConflicts.length - 1 && !newResolved.has(idx + 1)) {
      setSelectedConflictIdx(idx + 1);
    }
  }

  function smartMerge() {
    const d = data();
    if (!d) return;
    setSelectedConflictIdx(0);
    setResolvedConflicts(new Set<number>());
    setEditing(false);
    invoke<MergeResult>("merge_text", {
      baseText: d.conflictContent.base_text,
      leftText: d.conflictContent.ours_text,
      rightText: d.conflictContent.theirs_text,
    })
      .then((result) => {
        setLocalMergeResult(result);
        setEditText(result.merged_text);
      })
      .catch((e) => {
        console.error("smartMerge failed:", e);
      });
  }

  function startEditing() {
    setEditing(true);
    setEditText(localMergeResult()?.merged_text ?? "");
  }

  function finishEditing() {
    const text = editText();
    const conflicts = parseConflictsFromText(text);
    const res = localMergeResult();
    if (res) {
      setLocalMergeResult({ ...res, merged_text: text, conflicts });
    }
    setEditing(false);
  }

  async function saveResolved() {
    const res = localMergeResult();
    if (!res) return;
    if (editing()) {
      finishEditing();
    }
    setSaving(true);
    try {
      await invoke("git_resolve_conflict", {
        repoPath: props.repoPath,
        path: props.filePath,
        content: res.merged_text,
      });
      props.onBack();
    } catch (e) {
      console.error("saveResolved failed:", e);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──
  //
  // CRITICAL: Do NOT use `if (data.loading) return ...` at the component
  // function top level — SolidJS's compiler does NOT properly track the
  // `resource.loading` getter in component-level if-statements. Always use
  // <Show> or JSX ternary expressions for resource property checks.
  //
  // Also, do NOT cache signal values in local variables like `const d = data()`
  // at the component top level — those won't update when signals change.
  // Always access signals directly inside JSX template expressions.

  const isSaving = saving;
  const mergeText = editText;
  const editing_ = editing;

  return (
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-950">
      {/* Loading state */}
      <Show
        when={!data.loading}
        fallback={
          <div class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p class="text-xs text-slate-500">加载合并冲突...</p>
            </div>
          </div>
        }
      >
        {/* Error state */}
        <Show
          when={!data.error}
          fallback={
            <div class="flex-1 flex items-center justify-center">
              <div class="text-center max-w-md">
                <svg
                  class="w-10 h-10 mx-auto mb-3 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                <p class="text-sm text-red-400 mb-2">加载失败</p>
                <p class="text-xs text-slate-500">{String(data.error)}</p>
                <button
                  onClick={props.onBack}
                  class="mt-4 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  返回 Git 视图
                </button>
              </div>
            </div>
          }
        >
          {/* Merge UI — rendered only when data and localMergeResult are ready */}
          <Show when={data() && localMergeResult()}>
            {renderMergeUI(
              data()!.conflictContent,
              localMergeResult()!,
              selectedConflictIdx,
              resolvedConflicts,
              isSaving,
              mergeText,
              editing_,
              props,
              setSelectedConflictIdx,
              setResolvedConflicts,
              setLocalMergeResult,
              setEditing,
              setEditText,
              setSaving,
              adoptSide,
              smartMerge,
              startEditing,
              finishEditing,
              saveResolved,
            )}
          </Show>
        </Show>
      </Show>
    </div>
  );
}

// ── Merge UI render function ──
// Extracted as a separate function so that all signal reads happen inside
// a JSX template expression (guaranteeing proper reactive tracking).

function renderMergeUI(
  content: ConflictContent,
  res: MergeResult,
  selectedConflictIdx: () => number,
  resolvedConflicts: () => Set<number>,
  isSaving: () => boolean,
  mergeText: () => string,
  editing: () => boolean,
  props: GitMergeViewProps,
  setSelectedConflictIdx: (v: number | ((prev: number) => number)) => void,
  setResolvedConflicts: (v: Set<number> | ((prev: Set<number>) => Set<number>)) => void,
  setLocalMergeResult: (v: MergeResult | null | ((prev: MergeResult | null) => MergeResult | null)) => void,
  setEditing: (v: boolean | ((prev: boolean) => boolean)) => void,
  setEditText: (v: string | ((prev: string) => string)) => void,
  setSaving: (v: boolean | ((prev: boolean) => boolean)) => void,
  adoptSide: (side: "left" | "right") => void,
  smartMerge: () => void,
  startEditing: () => void,
  finishEditing: () => void,
  saveResolved: () => Promise<void>,
) {
  const totalConflicts = res.conflicts.length;
  const currentIdx = selectedConflictIdx();
  const currentConflict = totalConflicts > 0 ? res.conflicts[currentIdx] ?? null : null;
  const allResolved =
    totalConflicts === 0 || resolvedConflicts().size >= totalConflicts;

  return (
    <>
      {/* ── Header ── */}
      <div class="flex-shrink-0 bg-slate-900/60 border-b border-slate-800/50 px-4 py-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button
              onClick={props.onBack}
              class="px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-slate-300 bg-slate-800/60 rounded-md border border-slate-700/40 hover:border-slate-600/50 transition-colors flex items-center gap-1"
            >
              <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Git 视图
            </button>
            <h2 class="text-xs font-semibold text-slate-200">三路合并</h2>
            <div class="flex items-center gap-1.5 text-[10px]">
              <span class="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/50 text-slate-400 flex items-center gap-1">
                <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                {props.filePath.split("/").pop()}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md ${
              totalConflicts === 0 || allResolved
                ? "text-emerald-400 bg-emerald-500/10"
                : "text-amber-400 bg-amber-500/10"
            }`}>
              <span class={`w-1.5 h-1.5 rounded-full ${
                totalConflicts === 0 || allResolved ? "bg-emerald-500" : "bg-amber-500"
              }`} />
              {totalConflicts === 0 ? "无冲突" : allResolved ? "已全部解决" : `${totalConflicts - resolvedConflicts().size} 个冲突`}
            </span>
            <button
              onClick={saveResolved}
              disabled={isSaving()}
              class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-slate-500 text-white text-[10px] font-medium rounded-lg transition-colors flex items-center gap-1"
            >
              {isSaving() ? (
                <div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              )}
              {isSaving() ? "保存中..." : "保存合并"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Three-panel source view ── */}
      <div class="flex-1 flex overflow-hidden">
        {/* Base Panel */}
        <div class="flex-1 flex flex-col overflow-hidden border-r border-slate-800/50">
          <div class="flex-shrink-0 px-3 py-1 bg-slate-900/60 border-b border-slate-800/30 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-slate-500" />
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Base</span>
          </div>
          <div class="flex-1 overflow-y-auto no-scrollbar p-3 font-mono text-[11px] leading-[20px] text-slate-400">
            {content.base_text.split("\n").map((line, i) => (
              <div class="flex">
                <span class="w-7 flex-shrink-0 text-right text-slate-700 mr-2 select-none">{i + 1}</span>
                <span class="text-slate-400">{line}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ours Panel */}
        <div class="flex-1 flex flex-col overflow-hidden border-r border-slate-800/50">
          <div class="flex-shrink-0 px-3 py-1 bg-slate-900/60 border-b border-slate-800/30 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Local (ours)</span>
          </div>
          <div class="flex-1 overflow-y-auto no-scrollbar p-3 font-mono text-[11px] leading-[20px]">
            {content.ours_text.split("\n").map((line, i) => {
              const isDiff = content.base_text.split("\n")[i] !== line;
              return (
                <div class="flex" classList={{ "bg-emerald-950/20": isDiff }}>
                  <span class="w-7 flex-shrink-0 text-right text-slate-700 mr-2 select-none">{i + 1}</span>
                  <span classList={{ "text-emerald-300": isDiff, "text-slate-400": !isDiff }}>{line}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Theirs Panel */}
        <div class="flex-1 flex flex-col overflow-hidden">
          <div class="flex-shrink-0 px-3 py-1 bg-slate-900/60 border-b border-slate-800/30 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Remote (theirs)</span>
          </div>
          <div class="flex-1 overflow-y-auto no-scrollbar p-3 font-mono text-[11px] leading-[20px]">
            {content.theirs_text.split("\n").map((line, i) => {
              const isDiff = content.base_text.split("\n")[i] !== line;
              return (
                <div class="flex" classList={{ "bg-red-950/20": isDiff }}>
                  <span class="w-7 flex-shrink-0 text-right text-slate-700 mr-2 select-none">{i + 1}</span>
                  <span classList={{ "text-red-300": isDiff, "text-slate-400": !isDiff }}>{line}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Conflict resolution bar ── */}
      <Show when={totalConflicts > 0}>
        <div class="flex-shrink-0 border-t border-amber-500/25 bg-amber-500/[0.03]">
          <div class="flex items-center gap-3 px-4 py-2">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-semibold text-amber-400">冲突 #{currentIdx + 1}</span>
              <span class="text-[10px] text-slate-600">/ {totalConflicts}</span>
              <div class="flex items-center gap-0.5 ml-1">
                {Array.from({ length: totalConflicts }, (_, i) => (
                  <span
                    class={`w-1.5 h-1.5 rounded-full cursor-pointer transition-colors ${
                      resolvedConflicts().has(i)
                        ? "bg-emerald-500"
                        : i === currentIdx
                          ? "bg-amber-400"
                          : "bg-slate-700 hover:bg-slate-600"
                    }`}
                    onClick={() => setSelectedConflictIdx(i)}
                    title={`冲突 ${i + 1}`}
                  />
                ))}
              </div>
            </div>
            <span class="text-[10px] text-slate-600 flex-1">
              {currentConflict ? describeConflict(currentConflict) : ""}
            </span>
            <div class="flex items-center gap-1">
              <button onClick={() => setSelectedConflictIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx <= 0} class="px-2 py-0.5 text-[10px] text-slate-400 bg-slate-800/60 rounded-md hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">上一处</button>
              <button onClick={() => setSelectedConflictIdx(Math.min(totalConflicts - 1, currentIdx + 1))} disabled={currentIdx >= totalConflicts - 1} class="px-2 py-0.5 text-[10px] text-slate-400 bg-slate-800/60 rounded-md hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">下一处</button>
              <div class="w-px h-4 bg-slate-700/40 mx-0.5" />
              <button onClick={() => adoptSide("left")} disabled={resolvedConflicts().has(currentIdx)} class="px-2 py-0.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 rounded-md hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">采用左侧</button>
              <button onClick={() => adoptSide("right")} disabled={resolvedConflicts().has(currentIdx)} class="px-2 py-0.5 text-[10px] font-medium text-red-400 bg-red-500/10 rounded-md hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">采用右侧</button>
              <button onClick={smartMerge} class="px-2 py-0.5 text-[10px] font-medium text-indigo-400 bg-indigo-500/10 rounded-md hover:bg-indigo-500/20 transition-colors">智能合并</button>
              <button onClick={editing() ? finishEditing : startEditing} class="px-2 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-800/60 rounded-md hover:bg-slate-700/60 transition-colors">{editing() ? "完成编辑" : "手动编辑"}</button>
            </div>
          </div>

          <div class="px-4 pb-2">
            <div class="rounded-lg border border-amber-500/20 bg-slate-950/50 overflow-hidden">
              <div class="flex items-center justify-between px-3 py-1 bg-amber-500/5 border-b border-amber-500/10">
                <span class="text-[9px] text-slate-500 font-mono">合并结果</span>
                <button onClick={() => navigator.clipboard.writeText(editing() ? mergeText() : (res.merged_text))} class="text-amber-400 hover:text-amber-300 text-[9px] transition-colors">复制</button>
              </div>
              <Show
                when={editing()}
                fallback={
                  <div class="p-3 font-mono text-[11px] leading-[20px] max-h-60 overflow-y-auto">
                    {renderMergeText(res.merged_text, currentConflict, currentIdx, resolvedConflicts())}
                  </div>
                }
              >
                <textarea
                  value={mergeText()}
                  onInput={(e) => setEditText(e.currentTarget.value)}
                  class="w-full p-3 font-mono text-[11px] leading-[20px] bg-transparent text-slate-300 resize-none focus:outline-none"
                  rows={10}
                />
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Show merged result when no conflicts */}
      <Show when={totalConflicts === 0}>
        <div class="flex-shrink-0 border-t border-emerald-500/25 bg-emerald-500/[0.03] px-4 py-3 flex items-center justify-between">
          <span class="text-xs text-emerald-400 font-medium flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            无冲突，可以保存合并结果
          </span>
          <button onClick={saveResolved} disabled={isSaving()} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium rounded-lg transition-colors">{isSaving() ? "保存中..." : "保存合并"}</button>
        </div>
      </Show>
    </>
  );
}

// ── Helpers ──

function describeConflict(conflict: MergeConflict): string {
  const left = conflict.left_content.length;
  const right = conflict.right_content.length;
  return `第 ${conflict.start_line} 行 · 左侧 ${left} 行 vs 右侧 ${right} 行`;
}

function parseConflictsFromText(text: string): MergeConflict[] {
  const lines = text.split("\n");
  const conflicts: MergeConflict[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith("<<<<<<<")) {
      const startLine = i + 1; // 1-based
      const leftContent: string[] = [];
      const rightContent: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("=======")) {
        leftContent.push(lines[i]);
        i++;
      }
      i++; // skip =======
      while (i < lines.length && !lines[i].startsWith(">>>>>>>")) {
        rightContent.push(lines[i]);
        i++;
      }
      i++; // skip >>>>>>>
      conflicts.push({ left_content: leftContent, right_content: rightContent, start_line: startLine });
    } else {
      i++;
    }
  }
  return conflicts;
}

function renderMergeText(
  text: string,
  currentConflict: MergeConflict | null,
  currentIdx: number,
  resolvedConflicts: Set<number>,
) {
  const lines = text.split("\n");
  const conflictStart = currentConflict?.start_line ?? -1;
  const conflictEnd = conflictStart + (currentConflict?.left_content.length ?? 0) + (currentConflict?.right_content.length ?? 0) + 2;

  return lines.map((line, i) => {
    const lineNum = i + 1;
    const isConflictMarker = line.startsWith("<<<<<<<") || line.startsWith("=======") || line.startsWith(">>>>>>>");

    let bgClass = "";
    let textClass = "text-slate-300";
    if (isConflictMarker) {
      if (line.startsWith("<<<<<<<")) textClass = "text-red-400 font-medium";
      else if (line.startsWith("=======")) textClass = "text-amber-400 font-medium";
      else textClass = "text-orange-400 font-medium";
    } else if (conflictStart > 0 && lineNum >= conflictStart && lineNum <= conflictEnd) {
      bgClass = resolvedConflicts.has(currentIdx) ? "bg-emerald-950/20" : "bg-amber-950/30";
      if (lineNum === conflictStart) bgClass = resolvedConflicts.has(currentIdx) ? "bg-emerald-950/30" : "bg-amber-950/60";
    }

    return (
      <div class="flex" classList={{ [bgClass]: !!bgClass }}>
        <span class="w-7 flex-shrink-0 text-right text-slate-700 mr-2 select-none">{lineNum}</span>
        <span class={textClass}>{line || " "}</span>
      </div>
    );
  });
}
