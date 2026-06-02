export type HistoryEntryType = "diff" | "merge" | "directory";

export interface HistoryEntry {
  id: string;
  type: HistoryEntryType;
  label: string;
  timestamp: number;
  /** Diff: left/right paths */
  left_path?: string;
  right_path?: string;
  /** Merge: base/left/right paths */
  base_path?: string;
  /** Directory diff: two directory paths */
  dirs?: [string, string];
  /** Summary stats */
  adds?: number;
  dels?: number;
  conflicts?: number;
}

export interface HistoryData {
  entries: HistoryEntry[];
}
