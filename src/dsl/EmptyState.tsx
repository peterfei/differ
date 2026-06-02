import type { JSX } from "solid-js";

interface EmptyStateProps {
  icon: JSX.Element;
  title: string;
  description?: string;
  action?: JSX.Element;
}

export function EmptyState(props: EmptyStateProps) {
  return (
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center mb-4 text-slate-500">
        {props.icon}
      </div>
      <h3 class="text-sm font-medium text-slate-400 mb-1">{props.title}</h3>
      {props.description && (
        <p class="text-[12px] text-slate-600 max-w-xs">{props.description}</p>
      )}
      {props.action && <div class="mt-4">{props.action}</div>}
    </div>
  );
}
