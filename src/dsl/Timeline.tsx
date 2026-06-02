import { For, Show } from "solid-js";
import type { JSX } from "solid-js";

export interface TimelineItem {
  id: string;
  icon: JSX.Element;
  title: string;
  subtitle: string;
  timestamp: string;
  accent: "indigo" | "emerald" | "violet" | "amber" | "red";
  onClick?: () => void;
  onDelete?: () => void;
}

interface TimelineProps {
  items: TimelineItem[];
}

const accentColors: Record<string, { dot: string; line: string; ring: string }> = {
  indigo: { dot: "bg-indigo-500", line: "bg-indigo-500/20", ring: "ring-indigo-500/30" },
  emerald: { dot: "bg-emerald-500", line: "bg-emerald-500/20", ring: "ring-emerald-500/30" },
  violet: { dot: "bg-violet-500", line: "bg-violet-500/20", ring: "ring-violet-500/30" },
  amber: { dot: "bg-amber-500", line: "bg-amber-500/20", ring: "ring-amber-500/30" },
  red: { dot: "bg-red-500", line: "bg-red-500/20", ring: "ring-red-500/30" },
};

export function Timeline(props: TimelineProps) {
  return (
    <div class="relative">
      <For each={props.items}>
        {(item, idx) => {
          const ac = accentColors[item.accent];
          const isLast = idx() === props.items.length - 1;
          return (
            <div class="relative flex gap-4 pb-1">
              {/* Vertical line */}
              {!isLast && (
                <div class={`absolute left-[15px] top-7 bottom-0 w-px ${ac.line}`} />
              )}
              {/* Dot */}
              <div class="relative flex-shrink-0 mt-1">
                <div class={`w-[30px] h-[30px] rounded-full ${ac.dot}/10 border border-slate-700/50 flex items-center justify-center ${ac.dot}/20`}>
                  <div class={`w-3 h-3 rounded-full ${ac.dot} ring-2 ring-slate-900`} />
                </div>
              </div>
              {/* Content */}
              <div class="flex-1 min-w-0 pb-4">
                <div
                  class="bg-slate-900/40 border border-slate-800/40 rounded-lg px-3 py-2.5 hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  onClick={item.onClick}
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="text-[13px] font-medium text-slate-200 truncate">
                        {item.title}
                      </div>
                      <div class="text-[11px] text-slate-500 truncate mt-0.5">
                        {item.subtitle}
                      </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span class="text-[10px] text-slate-600 whitespace-nowrap">{item.timestamp}</span>
                      <Show when={item.onDelete}>
                        <button
                          onClick={(e) => { e.stopPropagation(); item.onDelete?.(); }}
                          class="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-0.5"
                          title="删除"
                        >
                          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </Show>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}
