import type { JSX } from "solid-js";

interface ActionCardProps {
  icon: JSX.Element;
  title: string;
  description: string;
  onClick: () => void;
  accent?: "indigo" | "violet" | "emerald";
}

const accentMap: Record<string, { bg: string; hover: string; text: string }> = {
  indigo: { bg: "bg-indigo-500/10", hover: "hover:bg-indigo-500/15", text: "text-indigo-300" },
  violet: { bg: "bg-violet-500/10", hover: "hover:bg-violet-500/15", text: "text-violet-300" },
  emerald: { bg: "bg-emerald-500/10", hover: "hover:bg-emerald-500/15", text: "text-emerald-300" },
};

export function ActionCard(props: ActionCardProps) {
  const a = accentMap[props.accent ?? "indigo"];
  return (
    <button
      onClick={props.onClick}
      class={`flex items-center gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/50 ${a.hover} transition-colors text-left w-full group`}
    >
      <div class={`w-11 h-11 rounded-xl ${a.bg} flex items-center justify-center flex-shrink-0 ${a.text} group-hover:scale-105 transition-transform`}>
        {props.icon}
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium text-slate-200">{props.title}</div>
        <div class="text-[11px] text-slate-500 mt-0.5">{props.description}</div>
      </div>
      <svg class="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  );
}
