import type { JSX } from "solid-js";

interface CardProps {
  children: JSX.Element;
  class?: string;
  padding?: boolean;
}

export function Card(props: CardProps) {
  return (
    <div
      class={`bg-slate-900/60 border border-slate-800/50 rounded-xl ${
        props.padding !== false ? "p-4" : ""
      } ${props.class ?? ""}`}
    >
      {props.children}
    </div>
  );
}

export function CardHeader(props: { title: string; description?: string; action?: JSX.Element }) {
  return (
    <div class="flex items-center justify-between mb-3">
      <div>
        <h3 class="text-sm font-semibold text-slate-200">{props.title}</h3>
        {props.description && (
          <p class="text-[11px] text-slate-500 mt-0.5">{props.description}</p>
        )}
      </div>
      {props.action && <div>{props.action}</div>}
    </div>
  );
}
