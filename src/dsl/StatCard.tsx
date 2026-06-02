import type { JSX } from "solid-js";
import { Card } from "./Card";

interface StatCardProps {
  icon: JSX.Element;
  value: string | number;
  label: string;
  accent?: "indigo" | "emerald" | "amber" | "red" | "violet";
}

const accentMap: Record<string, { bg: string; text: string; glow: string }> = {
  indigo: { bg: "bg-indigo-500/15", text: "text-indigo-300", glow: "shadow-indigo-500/10" },
  emerald: { bg: "bg-emerald-500/15", text: "text-emerald-300", glow: "shadow-emerald-500/10" },
  amber: { bg: "bg-amber-500/15", text: "text-amber-300", glow: "shadow-amber-500/10" },
  red: { bg: "bg-red-500/15", text: "text-red-300", glow: "shadow-red-500/10" },
  violet: { bg: "bg-violet-500/15", text: "text-violet-300", glow: "shadow-violet-500/10" },
};

export function StatCard(props: StatCardProps) {
  const a = accentMap[props.accent ?? "indigo"];
  return (
    <Card class="flex items-center gap-3">
      <div class={`w-10 h-10 rounded-xl ${a.bg} flex items-center justify-center flex-shrink-0 ${a.text} shadow-sm ${a.glow}`}>
        {props.icon}
      </div>
      <div class="min-w-0">
        <div class={`text-lg font-bold ${a.text} leading-none`}>{props.value}</div>
        <div class="text-[11px] text-slate-500 mt-1">{props.label}</div>
      </div>
    </Card>
  );
}
