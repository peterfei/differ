import { createSignal, For, Show, onMount } from "solid-js";
import { Card, CardHeader, EmptyState, Timeline } from "../dsl";
import type { TimelineItem } from "../dsl/Timeline";
import { getHistory, clearHistory, deleteHistoryEntry } from "../lib/historyStore";
import { setDiffPaths, setMergePaths } from "../lib/navStore";
import type { HistoryEntry, HistoryEntryType } from "../types/history";

interface HistoryViewProps {
  onNavigate: (view: "diff" | "merge" | "directory") => void;
}

type FilterType = "all" | HistoryEntryType;

export function HistoryView(props: HistoryViewProps) {
  const [entries, setEntries] = createSignal<HistoryEntry[]>([]);
  const [filter, setFilter] = createSignal<FilterType>("all");
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    await loadHistory();
    setLoading(false);
  });

  async function loadHistory() {
    try {
      const all = await getHistory();
      setEntries(all);
    } catch {
      setEntries([]);
    }
  }

  async function handleClear() {
    await clearHistory();
    setEntries([]);
  }

  async function handleDelete(id: string) {
    const updated = await deleteHistoryEntry(id);
    setEntries(updated);
  }

  function handleClick(entry: HistoryEntry) {
    if (entry.type === "diff" && entry.left_path && entry.right_path) {
      setDiffPaths({ left: entry.left_path, right: entry.right_path, base: entry.base_path });
      props.onNavigate("diff");
    } else if (entry.type === "merge" && entry.left_path && entry.right_path && entry.base_path) {
      setMergePaths({ base: entry.base_path, left: entry.left_path, right: entry.right_path });
      props.onNavigate("merge");
    } else if (entry.type === "directory" && entry.dirs) {
      // Navigate to directory diff with paths
      props.onNavigate("directory");
    }
  }

  function formatTimestamp(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();

    const time = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    if (isToday) return `今天 ${time}`;
    if (isYesterday) return `昨天 ${time}`;
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
  }

  function relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return `${Math.floor(diff / 86400000)} 天前`;
  }

  const filteredEntries = () => {
    const f = filter();
    if (f === "all") return entries();
    return entries().filter((e) => e.type === f);
  };

  const timelineItems = (): TimelineItem[] => {
    return filteredEntries().map((e) => ({
      id: e.id,
      icon: <></>,
      title: e.type === "diff"
        ? `${e.left_path?.split("/").pop() ?? "?"} ↔ ${e.right_path?.split("/").pop() ?? "?"}`
        : e.type === "merge"
        ? `${e.left_path?.split("/").pop() ?? "?"} + ${e.right_path?.split("/").pop() ?? "?"}`
        : `${e.dirs?.[0]?.split("/").pop() ?? "?"} ↔ ${e.dirs?.[1]?.split("/").pop() ?? "?"}`,
      subtitle: e.type === "diff" ? `文件对比 · ${e.left_path}` :
               e.type === "merge" ? `三路合并 · base: ${e.base_path}` :
               `目录对比 · ${e.dirs?.[0]}`,
      timestamp: relativeTime(e.timestamp),
      accent: e.type === "diff" ? "indigo" : e.type === "merge" ? "violet" : "emerald" as const,
      onClick: () => handleClick(e),
      onDelete: () => handleDelete(e.id),
    }));
  };

  const filterCount = (type: FilterType) => {
    if (type === "all") return entries().length;
    return entries().filter((e) => e.type === type).length;
  };

  return (
    <div class="flex-1 overflow-y-auto no-scrollbar">
      <div class="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-xl font-bold text-slate-100 tracking-tight">历史记录</h1>
            <p class="text-[13px] text-slate-500 mt-1">查看之前的对比和合并操作</p>
          </div>
          <Show when={entries().length > 0}>
            <button
              onClick={handleClear}
              class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 rounded-lg transition-colors"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              清除全部
            </button>
          </Show>
        </div>

        {/* Filter tabs */}
        <div class="flex items-center gap-1 mb-6 bg-slate-900/40 border border-slate-800/40 rounded-lg p-0.5 w-fit">
          {(["all", "diff", "merge", "directory"] as const).map((type) => (
            <button
              onClick={() => setFilter(type)}
              class={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                filter() === type
                  ? "text-indigo-300 bg-indigo-500/15"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {type === "all" ? "全部" : type === "diff" ? "文件对比" : type === "merge" ? "三路合并" : "目录对比"}
              <span class="ml-1.5 text-[10px] opacity-60">({filterCount(type)})</span>
            </button>
          ))}
        </div>

        {/* Timeline list */}
        <Show
          when={!loading()}
          fallback={
            <div class="flex items-center justify-center py-16">
              <svg class="w-5 h-5 text-slate-500 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          }
        >
          <Show
            when={filteredEntries().length > 0}
            fallback={
              <Card>
                <EmptyState
                  icon={
                    <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                  title={filter() === "all" ? "暂无历史记录" : "没有匹配的记录"}
                  description={filter() === "all" ? "开始一次文件对比或合并，记录将显示在此处" : "尝试切换筛选条件查看其他类型的记录"}
                />
              </Card>
            }
          >
            <Timeline items={timelineItems()} />
          </Show>
        </Show>
      </div>
    </div>
  );
}
