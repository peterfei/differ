import { createSignal, For, Show, onMount } from "solid-js";
import { Card, CardHeader, StatCard, ActionCard, EmptyState } from "../dsl";
import { getHistory } from "../lib/historyStore";
import { setDiffPaths } from "../lib/navStore";
import type { HistoryEntry } from "../types/history";

interface DashboardProps {
  onNavigate: (view: "diff" | "merge" | "directory" | "history" | "git") => void;
}

export function Dashboard(props: DashboardProps) {
  const [recentEntries, setRecentEntries] = createSignal<HistoryEntry[]>([]);
  const [stats, setStats] = createSignal({ diffs: 0, merges: 0, directories: 0 });

  onMount(async () => {
    await loadHistory();
  });

  async function loadHistory() {
    try {
      const entries = await getHistory();
      setRecentEntries(entries.slice(0, 5));
      setStats({
        diffs: entries.filter((e) => e.type === "diff").length,
        merges: entries.filter((e) => e.type === "merge").length,
        directories: entries.filter((e) => e.type === "directory").length,
      });
    } catch {
      // History store may not be available in all environments
    }
  }

  async function openFileDiff() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const left = await open({ multiple: false, title: "选择原始文件" });
    if (!left) return;
    const right = await open({ multiple: false, title: "选择修改后文件" });
    if (!right) return;
    setDiffPaths({ left: left as string, right: right as string });
    props.onNavigate("diff");
  }

  function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function entryLabel(e: HistoryEntry): string {
    if (e.type === "diff") return `对比: ${e.left_path?.split("/").pop()} ↔ ${e.right_path?.split("/").pop()}`;
    if (e.type === "merge") return `合并: ${e.left_path?.split("/").pop()} + ${e.right_path?.split("/").pop()}`;
    return `目录对比: ${e.dirs?.[0]?.split("/").pop()} ↔ ${e.dirs?.[1]?.split("/").pop()}`;
  }

  function entrySubtitle(e: HistoryEntry): string {
    const parts: string[] = [];
    if (e.adds !== undefined) parts.push(`+${e.adds}`);
    if (e.dels !== undefined) parts.push(`-${e.dels}`);
    if (e.conflicts !== undefined) parts.push(`${e.conflicts} 冲突`);
    return parts.length > 0 ? parts.join(" · ") : "";
  }

  return (
    <div class="flex-1 overflow-y-auto no-scrollbar">
      <div class="max-w-4xl mx-auto px-6 py-8">
        {/* Welcome header */}
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-xl font-bold text-slate-100 tracking-tight">仪表盘</h1>
            <p class="text-[13px] text-slate-500 mt-1">快速开始文件对比、目录对比或三路合并</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              onClick={() => props.onNavigate("git")}
              class="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium rounded-lg transition-colors shadow-lg shadow-cyan-600/20"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
              打开仓库
            </button>
            <button
              onClick={() => props.onNavigate("diff")}
              class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium rounded-lg transition-colors shadow-lg shadow-indigo-600/20"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              新对比
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div class="grid grid-cols-3 gap-4 mb-8">
          <StatCard
            icon={
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            }
            value={stats().diffs}
            label="文件对比"
            accent="indigo"
          />
          <StatCard
            icon={
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            }
            value={stats().merges}
            label="三路合并"
            accent="violet"
          />
          <StatCard
            icon={
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            }
            value={stats().directories}
            label="目录对比"
            accent="emerald"
          />
        </div>

        {/* Quick Actions */}
        <Card class="mb-8">
          <CardHeader title="快速操作" description="选择一种对比模式开始工作" />
          <div class="grid grid-cols-3 gap-3">
            <ActionCard
              icon={
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              }
              title="文件对比"
              description="比较两个文件的差异"
              accent="indigo"
              onClick={openFileDiff}
            />
            <ActionCard
              icon={
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              }
              title="目录对比"
              description="递归比较两个目录"
              accent="emerald"
              onClick={() => props.onNavigate("directory")}
            />
            <ActionCard
              icon={
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              }
              title="三路合并"
              description="合并文件并解决冲突"
              accent="violet"
              onClick={() => props.onNavigate("merge")}
            />
          </div>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader
            title="最近活动"
            description="最近的对比和合并记录"
            action={
              <Show when={recentEntries().length > 0}>
                <button
                  onClick={() => props.onNavigate("history")}
                  class="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  查看全部
                </button>
              </Show>
            }
          />
          <Show
            when={recentEntries().length > 0}
            fallback={
              <EmptyState
                icon={
                  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                title="暂无活动记录"
                description="开始一次文件对比或合并，历史记录将显示在此处"
              />
            }
          >
            <div class="space-y-1">
              <For each={recentEntries()}>
                {(entry) => (
                  <div class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/40 transition-colors cursor-pointer">
                    <div class={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      entry.type === "diff" ? "bg-indigo-500/10 text-indigo-300" :
                      entry.type === "merge" ? "bg-violet-500/10 text-violet-300" :
                      "bg-emerald-500/10 text-emerald-300"
                    }`}>
                      {entry.type === "diff" ? (
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      ) : entry.type === "merge" ? (
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75" />
                        </svg>
                      ) : (
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75" />
                        </svg>
                      )}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[12px] font-medium text-slate-300 truncate">{entryLabel(entry)}</div>
                      <div class="text-[10px] text-slate-600">{entrySubtitle(entry)}</div>
                    </div>
                    <span class="text-[10px] text-slate-600 flex-shrink-0">{formatTime(entry.timestamp)}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Card>
      </div>
    </div>
  );
}
