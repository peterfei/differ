import { load } from "@tauri-apps/plugin-store";

export interface AppSettings {
  theme: "light" | "dark" | "system";
  font_size: number;
  font_family: string;
  watch_files: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  font_size: 13,
  font_family: "JetBrains Mono",
  watch_files: false,
};

let storePromise: ReturnType<typeof load> | null = null;
let cached: AppSettings | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = load("settings.json", { autoSave: true });
  }
  return storePromise;
}

export async function getSettings(): Promise<AppSettings> {
  if (cached) return cached;
  const store = await getStore();
  const saved = await store.get<Partial<AppSettings>>("settings");
  cached = { ...DEFAULT_SETTINGS, ...saved };
  return cached;
}

export async function updateSettings(
  partial: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  const store = await getStore();
  await store.set("settings", updated);
  await store.save();
  cached = updated;
  return updated;
}
