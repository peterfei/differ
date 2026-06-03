import { For, Show } from "solid-js";
import type { GitStatusEntry, FileStatus } from "../types/git";

interface GitSidebarProps {
  entries: GitStatusEntry[];
  onSelectFile: (path: string, staged: boolean) => void;
}

function statusBadge(status: FileStatus): { label: string; color: string } {
  switch (status) {
    case "Modified": return { label: "M", color: "text-yellow-400 bg-yellow-500/10" };
    case "New": return { label: "A", color: "text-emerald-400 bg-emerald-500/10" };
    case "Deleted": return { label: "D", color: "text-red-400 bg-red-500/10" };
    case "Renamed": return { label: "R", color: "text-blue-400 bg-blue-500/10" };
    case "Conflicted": return { label: "!", color: "text-red-400 bg-red-500/20" };
  }
}

export function GitSidebar(props: GitSidebarProps) {
  const staged = () => props.entries.filter((e) => e.staged);
  const unstaged = () => props.entries.filter((e) => !e.staged);

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <Show when={props.entries.length === 0}>
        <div class="flex-1 flex items-center justify-center">
          <div class="text-center py-8">
            <svg class="w-8 h-8 mx-auto mb-2 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-xs text-slate-500">无变更</p>
          </div>
        </div>
      </Show>

      <Show when={staged().length > 0}>
        <div class="flex-shrink-0 px-3 py-2 border-b border-slate-800/30">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">已暂存</span>
            <span class="text-[10px] text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded-full">{staged().length}</span>
          </div>
        </div>
        <div class="overflow-y-auto no-scrollbar flex-shrink-0 max-h-[40%]">
          <FileList entries={staged()} onSelectFile={props.onSelectFile} />
        </div>
      </Show>

      <Show when={unstaged().length > 0}>
        <div class="flex-shrink-0 px-3 py-2 border-b border-slate-800/30">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">未暂存</span>
            <span class="text-[10px] text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded-full">{unstaged().length}</span>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto no-scrollbar">
          <FileList entries={unstaged()} onSelectFile={props.onSelectFile} />
        </div>
      </Show>
    </div>
  );
}

function FileList(props: { entries: GitStatusEntry[]; onSelectFile: (path: string, staged: boolean) => void }) {
  return (
    <div class="divide-y divide-slate-800/20">
      <For each={props.entries}>
        {(entry) => {
          const badge = statusBadge(entry.status);
          return (
            <button
              onClick={() => props.onSelectFile(entry.path, entry.staged)}
              class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/40 transition-colors text-left"
            >
              <span class={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${badge.color}`}>
                {badge.label}
              </span>
              <span class="flex-1 text-[12px] text-slate-300 truncate min-w-0">{entry.path}</span>
              <Show when={entry.status === "Conflicted"}>
                <span class="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded font-medium">冲突</span>
              </Show>
              <Show when={entry.status !== "Conflicted" && entry.status !== "New" && (entry.added_lines > 0 || entry.deleted_lines > 0)}>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <Show when={entry.added_lines > 0}>
                    <span class="text-[10px] text-emerald-400 font-medium">+{entry.added_lines}</span>
                  </Show>
                  <Show when={entry.deleted_lines > 0}>
                    <span class="text-[10px] text-red-400 font-medium">-{entry.deleted_lines}</span>
                  </Show>
                </div>
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );
}
