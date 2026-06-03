import { For, Show } from "solid-js";
import type { GitCommit } from "../types/git";

interface GitHistoryViewProps {
  commits: GitCommit[];
  onSelectCommit: (commit: GitCommit, mode: "single" | "compare") => void;
  onCompareCommits: (a: GitCommit, b: GitCommit) => void;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  selectedCommitId?: string;
  compareMode?: boolean;
  compareFromId?: string;
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    const month = d.toLocaleDateString("zh-CN", { month: "short" });
    const day = d.getDate();
    const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    return `${month} ${day}, ${time}`;
  } catch {
    return "";
  }
}

export function GitHistoryView(props: GitHistoryViewProps) {
  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div class="flex-shrink-0 px-3 py-2 border-b border-slate-800/30">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">提交历史</span>
            <span class="text-[10px] text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded-full">{props.commits.length}</span>
          </div>
          <Show when={props.compareMode}>
            <span class="text-[10px] text-indigo-400 font-medium bg-indigo-500/10 px-1.5 py-0.5 rounded">对比模式</span>
          </Show>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto no-scrollbar">
        <Show
          when={props.commits.length > 0}
          fallback={
            <div class="flex items-center justify-center py-8">
              <Show when={props.loading} fallback={
                <div class="text-center">
                  <svg class="w-8 h-8 mx-auto mb-2 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p class="text-xs text-slate-500">暂无提交记录</p>
                </div>
              }>
                <div class="flex items-center gap-2 text-slate-400 text-sm">
                  <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  加载中...
                </div>
              </Show>
            </div>
          }
        >
          <div class="divide-y divide-slate-800/20">
            <For each={props.commits}>
              {(commit) => {
                const isSelected = props.selectedCommitId === commit.id;
                const isCompareFrom = props.compareFromId === commit.id;
                return (
                  <button
                    onClick={() => props.onSelectCommit(commit, props.compareMode ? "compare" : "single")}
                    class={`w-full text-left px-3 py-2.5 transition-colors ${
                      isSelected
                        ? "bg-indigo-500/10 border-l-2 border-indigo-500"
                        : isCompareFrom
                        ? "bg-violet-500/10 border-l-2 border-violet-500"
                        : "hover:bg-slate-800/40 border-l-2 border-transparent"
                    }`}
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-0.5">
                          <span class="text-[11px] font-mono font-medium text-slate-500">{commit.short_id}</span>
                          <Show when={isCompareFrom}>
                            <span class="text-[9px] text-violet-400 bg-violet-500/10 px-1 rounded">基准</span>
                          </Show>
                        </div>
                        <p class="text-[12px] text-slate-200 truncate">{commit.summary}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="text-[10px] text-slate-500">{commit.author}</span>
                      <span class="text-[9px] text-slate-600">•</span>
                      <span class="text-[10px] text-slate-600">{formatTime(commit.timestamp)}</span>
                    </div>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>

        {/* Load more */}
        <Show when={props.hasMore && !props.loading}>
          <div class="py-3 flex justify-center">
            <button
              onClick={props.onLoadMore}
              class="px-4 py-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 bg-slate-800/40 hover:bg-slate-800/60 rounded-lg transition-colors"
            >
              加载更多
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
