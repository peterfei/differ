import { createSignal, For, onMount } from "solid-js";
import { getSettings, updateSettings, type AppSettings } from "../lib/settings";

export function SettingsView() {
  const [settings, setSettings] = createSignal<AppSettings | null>(null);
  const [saving, setSaving] = createSignal(false);

  onMount(async () => {
    const s = await getSettings();
    setSettings(s);
    applyTheme(s.theme);
    applyFont(s);
  });

  async function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const current = settings();
    if (!current) return;
    setSaving(true);
    try {
      const updated = await updateSettings({ [key]: value });
      setSettings(updated);
      if (key === "theme") applyTheme(value as AppSettings["theme"]);
      if (key === "font_family" || key === "font_size") applyFont(updated);
    } finally {
      setSaving(false);
    }
  }

  function applyTheme(theme: AppSettings["theme"]) {
    const html = document.documentElement;
    if (theme === "light") {
      html.classList.remove("dark");
    } else if (theme === "dark") {
      html.classList.add("dark");
    } else {
      // system
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      html.classList.toggle("dark", prefersDark);
    }
  }

  function applyFont(settings: AppSettings) {
    const html = document.documentElement;
    html.style.setProperty("--font-mono", `"${settings.font_family}", monospace`);
    html.style.setProperty("--font-size-base", `${settings.font_size}px`);

    // Inject/update a style tag to override font-mono classes
    let styleEl = document.getElementById("differ-font-override");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "differ-font-override";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      .font-mono, code, pre, .line-numbers {
        font-family: var(--font-mono, "JetBrains Mono", monospace) !important;
      }
    `;
  }

  const fontFamilies = [
    { value: "JetBrains Mono", label: "JetBrains Mono" },
    { value: "Fira Code", label: "Fira Code" },
    { value: "Cascadia Code", label: "Cascadia Code" },
    { value: "Source Code Pro", label: "Source Code Pro" },
    { value: "monospace", label: "Monospace" },
  ];

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <div class="flex-1 overflow-y-auto">
        <div class="max-w-2xl mx-auto p-6 space-y-6 animate-fade-in">
          <div>
            <h2 class="text-lg font-semibold text-slate-100">设置</h2>
            <p class="text-xs text-slate-500 mt-0.5">自定义 Differ 的外观和行为</p>
          </div>

          {/* ── 主题 ── */}
          <Section title="主题">
            <div class="grid grid-cols-3 gap-3">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  onClick={() => set("theme", t)}
                  class={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                    settings()?.theme === t
                      ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30"
                      : "border-slate-700/50 bg-slate-800/40 hover:border-slate-600"
                  }`}
                >
                  <div class={`w-full h-12 rounded-lg ${t === "dark" ? "bg-slate-900 border border-slate-700" : t === "light" ? "bg-white border border-slate-200" : "bg-gradient-to-r from-white to-slate-900 border border-slate-500"}`} />
                  <span class="text-xs font-medium text-slate-300 capitalize">{t === "system" ? "跟随系统" : t === "dark" ? "深色" : "浅色"}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* ── 字体 ── */}
          <Section title="字体">
            <div class="space-y-4">
              <div>
                <label class="text-xs text-slate-400 mb-1.5 block">字体大小</label>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="20"
                    step="1"
                    value={settings()?.font_size ?? 13}
                    onInput={(e) => set("font_size", parseInt(e.currentTarget.value))}
                    class="flex-1 h-1.5 appearance-none bg-slate-700 rounded-full cursor-pointer accent-indigo-500"
                  />
                  <span class="text-xs text-slate-300 w-8 text-right font-mono">{settings()?.font_size ?? 13}</span>
                </div>
              </div>
              <div>
                <label class="text-xs text-slate-400 mb-1.5 block">字体系列</label>
                <select
                  value={settings()?.font_family ?? "JetBrains Mono"}
                  onChange={(e) => set("font_family", e.currentTarget.value)}
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <For each={fontFamilies}>
                    {(f) => <option value={f.value}>{f.label}</option>}
                  </For>
                </select>
              </div>
              <div class="p-3 rounded-lg bg-slate-800/60 border border-slate-700/30">
                <p class="text-xs text-slate-500 mb-1">预览</p>
                <p
                  class="text-sm"
                  style={{
                    "font-family": settings()?.font_family ?? "JetBrains Mono",
                    "font-size": `${settings()?.font_size ?? 13}px`,
                  }}
                >
                  <span class="text-emerald-400">fn</span> <span class="text-indigo-300">quick_sort</span>
                  <span class="text-slate-400">(</span><span class="text-amber-300">arr</span>: <span class="text-cyan-300">&amp;mut [i32]</span>
                  <span class="text-slate-400">) </span>
                </p>
              </div>
            </div>
          </Section>

          {/* ── 文件监视 ── */}
          <Section title="文件监视">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-slate-200">自动检测文件变更</p>
                <p class="text-xs text-slate-500 mt-0.5">文件修改后自动刷新 diff</p>
              </div>
              <button
                onClick={() => set("watch_files", !settings()?.watch_files)}
                class={`relative w-10 h-5 rounded-full transition-colors ${
                  settings()?.watch_files ? "bg-indigo-500" : "bg-slate-700"
                }`}
              >
                <span
                  class={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    settings()?.watch_files ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            <p class="text-[10px] text-slate-600 mt-2">
              此功能需要在 Rust 端集成 notify crate 后才生效
            </p>
          </Section>

          {/* ── 键盘快捷键 ── */}
          <Section title="键盘快捷键">
            <div class="space-y-1">
              <Shortcut keys={["J", "K"]} desc="导航到上一个/下一个差异块" />
              <Shortcut keys={["Ctrl/Cmd", "G"]} desc="跳转到指定行" />
              <Shortcut keys={["Ctrl/Cmd", "D"]} desc="切换并排/统一视图" />
            </div>
          </Section>

          {/* ── 关于 ── */}
          <Section title="关于">
            <div class="text-xs text-slate-400 space-y-1">
              <p><span class="text-slate-500">应用:</span> Differ</p>
              <p><span class="text-slate-500">版本:</span> 0.1.0</p>
              <p><span class="text-slate-500">技术栈:</span> Tauri v2 + SolidJS + Rust</p>
            </div>
          </Section>

          <div class="h-8" />
        </div>
      </div>
    </div>
  );
}

// ── 子组件 ──

function Section(props: { title: string; children: any }) {
  return (
    <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/50 space-y-3">
      <h3 class="text-sm font-medium text-slate-300">{props.title}</h3>
      {props.children}
    </div>
  );
}

function Shortcut(props: { keys: string[]; desc: string }) {
  return (
    <div class="flex items-center justify-between py-1">
      <span class="text-xs text-slate-400">{props.desc}</span>
      <div class="flex items-center gap-1">
        <For each={props.keys}>
          {(k) => (
            <span class="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-300">
              {k}
            </span>
          )}
        </For>
      </div>
    </div>
  );
}
