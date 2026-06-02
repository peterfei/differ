import { createMemo, createSignal, createEffect, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import type { MergeResult, MergeConflict } from '../types/merge';
import { openFileDialog, saveFileDialog } from '../lib/dialog';
import { mergePaths, setMergePaths } from '../lib/navStore';
import { addHistoryEntry } from '../lib/historyStore';

type ViewMode = 'source' | 'merged';

export function MergeView() {
  const [basePath, setBasePath] = createSignal('');
  const [leftPath, setLeftPath] = createSignal('');
  const [rightPath, setRightPath] = createSignal('');
  const [result, setResult] = createSignal<MergeResult | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [saved, setSaved] = createSignal(false);
  const [viewMode, setViewMode] = createSignal<ViewMode>('source');
  const [editing, setEditing] = createSignal(false);
  const [editText, setEditText] = createSignal('');

  // 监听外部传入的合并路径（从文件对比导航过来时触发）
  createEffect(() => {
    const paths = mergePaths();
    if (paths) {
      setBasePath(paths.base);
      setLeftPath(paths.left);
      setRightPath(paths.right);
      setMergePaths(null);
      // 在下一个 tick 执行合并，确保信号已更新
      setTimeout(() => runMerge(), 0);
    }
  });

  // Track which conflict is currently selected
  const [selectedConflictIndex, setSelectedConflictIndex] = createSignal<number>(0);

  // ── Undo history ──
  const [undoStack, setUndoStack] = createSignal<MergeResult[]>([]);

  function pushUndo(res: MergeResult) {
    setUndoStack(stack => [...stack, res]);
  }

  function undo() {
    const stack = undoStack();
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    setUndoStack(stack.slice(0, -1));
    setResult(prev);
    setSelectedConflictIndex(0);
  }

  async function selectFile(side: 'base' | 'left' | 'right') {
    try {
      const selected = await openFileDialog();
      if (!selected) return;
      if (side === 'base') setBasePath(selected);
      else if (side === 'left') setLeftPath(selected);
      else setRightPath(selected);
    } catch (e) {
      setError(`选择文件失败: ${e}`);
    }
  }

  async function runMerge() {
    const b = basePath(), l = leftPath(), r = rightPath();
    if (!b || !l || !r) {
      setError('请选择 base、left 和 right 三个文件');
      return;
    }
    // 如果已有结果，先保存到撤销栈
    if (result()) {
      pushUndo(result()!);
    }
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await invoke<MergeResult>('merge_files', {
        basePath: b,
        leftPath: l,
        rightPath: r,
      });
      setResult(res);
      setUndoStack([]);
      setSelectedConflictIndex(0);
      setViewMode('merged');
      // 写入历史记录
      addHistoryEntry({
        id: `merge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "merge",
        label: `${leftPath().split(/[/\\]/).pop() ?? "?"} + ${rightPath().split(/[/\\]/).pop() ?? "?"}`,
        timestamp: Date.now(),
        left_path: leftPath(),
        right_path: rightPath(),
        base_path: basePath(),
        conflicts: res.conflicts.length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveResult() {
    if (!result()) return;
    const path = await saveFileDialog();
    if (!path) return;
    try {
      await invoke('save_text_to_file', { path, text: result()!.merged_text });
      setSaved(true);
    } catch (e) {
      setError(String(e));
    }
  }

  function finishEditing() {
    const text = editText();
    const currResult = result();
    if (!currResult) return;

    const newConflicts = parseConflictsFromText(text);
    pushUndo(currResult);
    setResult({
      ...currResult,
      merged_text: text,
      conflicts: newConflicts,
      has_conflicts: newConflicts.length > 0,
    });
    setEditing(false);
    setSelectedConflictIndex(0);
  }

  function cancelEditing() {
    setEditing(false);
  }

  // Navigate conflicts
  const conflicts = createMemo(() => result()?.conflicts ?? []);
  const totalConflicts = createMemo(() => conflicts().length);
  const currentConflict = createMemo(() => {
    const idx = selectedConflictIndex();
    const cs = conflicts();
    if (idx < cs.length) {
      return cs[idx];
    }
    return null;
  });

  function goToPrevConflict() {
    setSelectedConflictIndex(i => Math.max(0, i - 1));
  }

  function goToNextConflict() {
    setSelectedConflictIndex(i => Math.min(totalConflicts() - 1, i + 1));
  }

  // Conflict resolution: adopt left/right for current conflict
  function adoptLeft() {
    const res = result();
    const curr = currentConflict();
    const idx = selectedConflictIndex();
    if (!res || !curr) return;

    const newRes = adoptSide(res, curr, idx, 'left');
    pushUndo(res);
    setResult(newRes.result);
    setSelectedConflictIndex(Math.min(idx, newRes.conflictCount > 0 ? idx : Math.max(0, newRes.conflictCount - 1)));
  }

  function adoptRight() {
    const res = result();
    const curr = currentConflict();
    const idx = selectedConflictIndex();
    if (!res || !curr) return;

    const newRes = adoptSide(res, curr, idx, 'right');
    pushUndo(res);
    setResult(newRes.result);
    setSelectedConflictIndex(Math.min(idx, newRes.conflictCount > 0 ? idx : Math.max(0, newRes.conflictCount - 1)));
  }

  // Get conflict description
  const conflictDescription = createMemo(() => {
    const curr = currentConflict();
    if (!curr) return '';
    const sample = curr.left_content[0] || curr.right_content[0] || '';
    if (sample.length > 50) {
      return sample.substring(0, 50) + '...';
    }
    return sample || '内容冲突';
  });

  return (
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-950">
      {/* Toolbar */}
      <div class="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-slate-900/80 border-b border-slate-800/60">
        <button onClick={() => selectFile('base')} class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-left transition-colors max-w-[220px]">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex-shrink-0">Base</span>
          <span class="text-xs text-slate-300 truncate">{basePath() || '选择文件...'}</span>
        </button>
        <span class="text-slate-600 text-lg">⟷</span>
        <button onClick={() => selectFile('left')} class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-left transition-colors max-w-[220px]">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex-shrink-0">Left</span>
          <span class="text-xs text-slate-300 truncate">{leftPath() || '选择文件...'}</span>
        </button>
        <span class="text-slate-600 text-lg">⟷</span>
        <button onClick={() => selectFile('right')} class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-left transition-colors max-w-[220px]">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex-shrink-0">Right</span>
          <span class="text-xs text-slate-300 truncate">{rightPath() || '选择文件...'}</span>
        </button>

        <div class="flex-1" />

        {/* View mode toggle */}
        <Show when={result()}>
          <div class="flex items-center gap-1 mr-2">
            <button
              onClick={() => setViewMode('source')}
              classList={{ 'bg-slate-700 text-white': viewMode() === 'source', 'text-slate-400 hover:text-slate-200': viewMode() !== 'source' }}
              class="px-2 py-1 text-xs rounded transition-colors"
            >
              源文件
            </button>
            <button
              onClick={() => setViewMode('merged')}
              classList={{ 'bg-slate-700 text-white': viewMode() === 'merged', 'text-slate-400 hover:text-slate-200': viewMode() !== 'merged' }}
              class="px-2 py-1 text-xs rounded transition-colors"
            >
              合并结果
            </button>
          </div>
        </Show>

        <button
          onClick={runMerge}
          disabled={loading()}
          class="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >
          {loading() ? '合并中...' : result() ? '重新合并' : '合并'}
        </button>

        <Show when={result() && !result()!.has_conflicts}>
          <button
            onClick={saveResult}
            class="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
          >
            保存结果
          </button>
        </Show>

        <Show when={saved()}>
          <span class="text-[11px] text-emerald-400">已保存</span>
        </Show>
      </div>

      {/* Error */}
      <Show when={error()}>
        <div class="flex-shrink-0 px-4 py-2 text-xs text-red-400 bg-red-950/50 border-b border-red-900/40">
          {error()}
        </div>
      </Show>

      {/* Main content area */}
      <Show when={result()}>
        {(res) => (
          <>
            <Show when={viewMode() === 'source'}>
              <div class="flex-1 grid grid-cols-3 gap-0 overflow-hidden">
                <MergePanel title="Base" text={res().base_text} emptyHint="Base 文件内容" />
                <MergePanel title="Left" text={res().left_text} emptyHint="Left 分支内容" />
                <MergePanel title="Right" text={res().right_text} emptyHint="Right 分支内容" />
              </div>
            </Show>

            <Show when={viewMode() === 'merged'}>
              <Show when={editing()} fallback={
                <div class="flex-1 overflow-hidden">
                  <MergeResultPanel
                    mergedText={res().merged_text}
                    conflicts={res().conflicts}
                    selectedConflictIndex={selectedConflictIndex()}
                  />
                </div>
              }>
                <div class="flex-1 overflow-hidden">
                  <textarea
                    value={editText()}
                    onInput={(e) => setEditText(e.currentTarget.value)}
                    spellcheck={false}
                    class="w-full h-full bg-slate-950 text-slate-300 font-mono text-xs leading-relaxed p-4 resize-none outline-none border-none"
                  />
                </div>
              </Show>
            </Show>
          </>
        )}
      </Show>

      {/* Empty state */}
      <Show when={!result()}>
        <div class="flex-1 flex items-center justify-center text-slate-600">
          选择三个文件后点击「合并」
        </div>
      </Show>

      {/* Edit mode bar (takes priority over conflict/success bars) */}
      <Show when={editing() && viewMode() === 'merged'}>
        <div class="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-slate-900/90 border-t border-slate-800/60">
          <span class="text-xs text-slate-400">正在手动编辑合并结果... 冲突标记会显示为文本，完成后自动重新识别</span>
          <div class="flex items-center gap-2">
            <button
              onClick={cancelEditing}
              class="px-3 py-1 text-xs font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={finishEditing}
              class="px-3 py-1 text-xs font-medium rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              完成编辑
            </button>
          </div>
        </div>
      </Show>

      {/* Bottom conflict resolution bar */}
      <Show when={!editing() && result() && result()!.has_conflicts && viewMode() === 'merged'}>
        <div class="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-slate-900/90 border-t border-slate-800/60">
          {/* Left side: conflict status */}
          <div class="flex items-center gap-3 text-xs">
            {/* Undo button */}
            <Show when={undoStack().length > 0}>
              <button
                onClick={undo}
                class="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                撤回
              </button>
            </Show>

            <div class="flex items-center gap-2">
              <span class="text-amber-400 font-semibold">冲突 #{selectedConflictIndex() + 1}</span>
              <span class="text-slate-500">/ {totalConflicts()}</span>
            </div>
            <span class="text-slate-400">·</span>
            <span class="text-slate-400">{conflictDescription()}</span>

            <div class="flex items-center gap-1 ml-2">
              <button
                onClick={goToPrevConflict}
                disabled={selectedConflictIndex() === 0}
                class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 text-[10px]"
              >
                ← 上一个
              </button>
              <button
                onClick={goToNextConflict}
                disabled={selectedConflictIndex() >= totalConflicts() - 1}
                class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 text-[10px]"
              >
                下一个 →
              </button>
            </div>
          </div>

          {/* Right side: action buttons */}
          <div class="flex items-center gap-2">
            <button
              onClick={() => { setEditText(result()!.merged_text); setEditing(true); }}
              class="px-3 py-1 text-xs font-medium rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors"
            >
              手动编辑
            </button>
            <button
              onClick={adoptLeft}
              class="px-3 py-1 text-xs font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
            >
              采用左侧
            </button>
            <button
              onClick={adoptRight}
              class="px-3 py-1 text-xs font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
            >
              采用右侧
            </button>
          </div>
        </div>
      </Show>

      {/* Success message when all conflicts resolved */}
      <Show when={!editing() && result() && !result()!.has_conflicts}>
        <div class="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-emerald-950/40 border-t border-emerald-900/40">
          <div class="flex items-center gap-2 text-xs text-emerald-400">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>所有冲突已解决</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              onClick={() => { setEditText(result()!.merged_text); setEditing(true); }}
              class="px-3 py-1 text-xs font-medium rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors"
            >
              手动编辑
            </button>
            <button
              onClick={saveResult}
              class="px-3 py-1 text-xs font-medium rounded bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
            >
              保存结果
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

// ── Pure helper: adopt one side of a conflict ──

function adoptSide(
  res: MergeResult,
  curr: MergeConflict,
  conflictIdx: number,
  side: 'left' | 'right',
): { result: MergeResult; conflictCount: number } {
  const lines = res.merged_text.split('\n');
  const startLine = curr.start_line - 1;
  const chosenContent = side === 'left' ? curr.left_content : curr.right_content;
  const markerLines = curr.left_content.length + curr.right_content.length + 3;

  lines.splice(startLine, markerLines, ...chosenContent);
  const newMergedText = lines.join('\n');

  const newConflicts = res.conflicts.filter((_, i) => i !== conflictIdx);

  return {
    result: {
      ...res,
      merged_text: newMergedText,
      conflicts: newConflicts,
      has_conflicts: newConflicts.length > 0,
    },
    conflictCount: newConflicts.length,
  };
}

function parseConflictsFromText(text: string): MergeConflict[] {
  const lines = text.split('\n');
  const conflicts: MergeConflict[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<< Left')) {
      const start_line = i + 1; // 1-based
      const left_content: string[] = [];
      const right_content: string[] = [];

      i++;
      while (i < lines.length && lines[i] !== '=======') {
        left_content.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i] === '=======') {
        i++;
      }
      while (i < lines.length && !lines[i].startsWith('>>>>>>> Right')) {
        right_content.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].startsWith('>>>>>>> Right')) {
        i++;
      }

      conflicts.push({ left_content, right_content, start_line });
    } else {
      i++;
    }
  }

  return conflicts;
}

// ── Source File Panel ──

function MergePanel(props: { title: string; text: string; emptyHint: string }) {
  const lines = createMemo(() => props.text.split('\n'));

  return (
    <div class="flex flex-col overflow-hidden border-r border-slate-800/50">
      <div class="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800/60">
        <span class="text-xs font-semibold text-slate-300">{props.title}</span>
        <span class="text-[10px] text-slate-600">{lines().length} 行</span>
      </div>
      <div class="flex-1 overflow-auto bg-slate-950 font-mono text-xs leading-relaxed">
        <Show when={!props.text}>
          <div class="flex items-center justify-center h-full text-slate-600">{props.emptyHint}</div>
        </Show>
        <Show when={props.text}>
          <table class="w-full border-collapse">
            <tbody>
              <For each={lines()}>
                {(line, i) => (
                  <tr>
                    <td class="select-none text-right px-3 py-0 text-slate-600 w-12 border-r border-slate-800/30 align-top">{i() + 1}</td>
                    <td class="px-3 py-0 text-slate-300 whitespace-pre-wrap break-all align-top">{line}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
    </div>
  );
}

// ── Merge Result Panel (with reactive conflict highlighting) ──

function MergeResultPanel(props: {
  mergedText: string;
  conflicts: MergeConflict[];
  selectedConflictIndex: number;
}) {
  const lines = createMemo(() => props.mergedText.split('\n'));

  // Build set of ALL conflict line indices
  const allConflictLines = createMemo(() => {
    const set = new Set<number>();
    for (const c of props.conflicts) {
      const count = c.left_content.length + c.right_content.length + 3;
      for (let i = c.start_line - 1; i < c.start_line - 1 + count; i++) set.add(i);
    }
    return set;
  });

  // Build set of line indices for the CURRENTLY SELECTED conflict
  const selectedConflictLines = createMemo(() => {
    const set = new Set<number>();
    const idx = props.selectedConflictIndex;
    if (idx < props.conflicts.length) {
      const c = props.conflicts[idx];
      const count = c.left_content.length + c.right_content.length + 3;
      for (let i = c.start_line - 1; i < c.start_line - 1 + count; i++) set.add(i);
    }
    return set;
  });

  return (
    <div class="flex flex-col overflow-hidden h-full">
      <div class="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800/60">
        <span class="text-xs font-semibold text-slate-300">合并结果</span>
        <span class="text-[10px] text-slate-600">{lines().length} 行</span>
      </div>
      <div class="flex-1 overflow-auto bg-slate-950 font-mono text-xs leading-relaxed">
        <table class="w-full border-collapse">
          <tbody>
            <For each={lines()}>
              {(line, i) => (
                // classList is reactive — re-evaluates when memos change
                <tr classList={{
                  'bg-amber-950/30': allConflictLines().has(i()),
                  'bg-amber-950/60': selectedConflictLines().has(i()),
                }}>
                  <td class="select-none text-right px-3 py-0 text-slate-600 w-12 border-r border-slate-800/30 align-top">
                    {i() + 1}
                  </td>
                  <td class="px-3 py-0 whitespace-pre-wrap break-all align-top">
                    <span classList={{
                      'text-amber-300': selectedConflictLines().has(i()),
                      'text-amber-200': !selectedConflictLines().has(i()) && allConflictLines().has(i()),
                      'text-slate-300': !allConflictLines().has(i()),
                    }}>
                      {renderConflictLine(line)}
                    </span>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderConflictLine(line: string) {
  if (line.startsWith('<<<<<<< Left')) return <span class="font-bold text-red-400">{line}</span>;
  if (line === '=======') return <span class="font-bold text-amber-400">{line}</span>;
  if (line.startsWith('>>>>>>> Right')) return <span class="font-bold text-orange-400">{line}</span>;
  return line;
}
