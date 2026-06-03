import { For, Show } from "solid-js";
import type { GitBranch } from "../types/git";

interface GitBranchSelectorProps {
  branches: GitBranch[];
  onSelectBranch: (branch: GitBranch) => void;
  onCompareBranches: (base: string, target: string) => void;
  selectedBase?: string;
  selectedTarget?: string;
}

export function GitBranchSelector(props: GitBranchSelectorProps) {
  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div class="flex-shrink-0 px-3 py-2 border-b border-slate-800/30">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">分支</span>
          <span class="text-[10px] text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded-full">{props.branches.length}</span>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto no-scrollbar">
        <Show
          when={props.branches.length > 0}
          fallback={
            <div class="flex items-center justify-center py-8">
              <div class="text-center">
                <svg class="w-8 h-8 mx-auto mb-2 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <p class="text-xs text-slate-500">无分支</p>
              </div>
            </div>
          }
        >
          <div class="divide-y divide-slate-800/20">
            <For each={props.branches}>
              {(branch) => {
                const isSelected = props.selectedBase === branch.name || props.selectedTarget === branch.name;
                const isBase = props.selectedBase === branch.name;
                const isTarget = props.selectedTarget === branch.name;
                return (
                  <button
                    onClick={() => props.onSelectBranch(branch)}
                    class={`w-full text-left px-3 py-2 transition-colors ${
                      isSelected
                        ? "bg-indigo-500/10 border-l-2 border-indigo-500"
                        : "hover:bg-slate-800/40 border-l-2 border-transparent"
                    }`}
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2 min-w-0">
                        <svg class="w-3.5 h-3.5 flex-shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                        <span class="text-[12px] text-slate-200 truncate">{branch.name}</span>
                      </div>
                      <div class="flex items-center gap-1 flex-shrink-0">
                        <Show when={branch.is_current}>
                          <span class="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">当前</span>
                        </Show>
                        <Show when={branch.ahead > 0}>
                          <span class="text-[10px] text-indigo-400 font-medium">↑{branch.ahead}</span>
                        </Show>
                        <Show when={branch.behind > 0}>
                          <span class="text-[10px] text-amber-400 font-medium">↓{branch.behind}</span>
                        </Show>
                        <Show when={isBase}>
                          <span class="text-[9px] text-violet-400 bg-violet-500/10 px-1 rounded">基准</span>
                        </Show>
                        <Show when={isTarget}>
                          <span class="text-[9px] text-amber-400 bg-amber-500/10 px-1 rounded">目标</span>
                        </Show>
                      </div>
                    </div>
                  </button>
                );
              }}
            </For>
          </div>

          {/* Compare button */}
          <Show when={props.selectedBase && props.selectedTarget}>
            <div class="px-3 py-3 border-t border-slate-800/30">
              <button
                onClick={() => props.onCompareBranches(props.selectedBase!, props.selectedTarget!)}
                class="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium rounded-lg transition-colors"
              >
                对比分支
              </button>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
