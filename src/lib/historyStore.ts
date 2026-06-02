import { load } from "@tauri-apps/plugin-store";
import type { HistoryEntry, HistoryData } from "../types/history";

const MAX_ENTRIES = 50;

let storePromise: ReturnType<typeof load> | null = null;
let cached: HistoryEntry[] | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = load("history.json", { autoSave: true });
  }
  return storePromise;
}

export async function getHistory(): Promise<HistoryEntry[]> {
  if (cached) return cached;
  try {
    const store = await getStore();
    const data = await store.get<HistoryData>("history");
    cached = data?.entries ?? [];
  } catch {
    cached = [];
  }
  return cached;
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<HistoryEntry[]> {
  try {
    const entries = await getHistory();
    entries.unshift(entry);
    // Trim to max
    if (entries.length > MAX_ENTRIES) {
      entries.length = MAX_ENTRIES;
    }
    const store = await getStore();
    await store.set("history", { entries });
    await store.save();
    cached = entries;
    return entries;
  } catch {
    // Tauri store unavailable (e.g. test environment)
    return [];
  }
}

export async function clearHistory(): Promise<void> {
  try {
    const store = await getStore();
    await store.set("history", { entries: [] });
    await store.save();
    cached = [];
  } catch {
    // Silent
  }
}

export async function deleteHistoryEntry(id: string): Promise<HistoryEntry[]> {
  try {
    const entries = await getHistory();
    const filtered = entries.filter((e) => e.id !== id);
    const store = await getStore();
    await store.set("history", { entries: filtered });
    await store.save();
    cached = filtered;
    return filtered;
  } catch {
    return [];
  }
}
