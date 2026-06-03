/** 仓库信息（镜像 Rust GitRepoInfo） */
export interface GitRepoInfo {
  path: string;
  work_dir: string;
  current_branch: string | null;
  is_detached: boolean;
  head_commit: string | null;
  head_short: string | null;
}

/** 文件状态枚举 */
export type FileStatus = "New" | "Modified" | "Deleted" | "Renamed" | "Conflicted";

/** 状态条目 */
export interface GitStatusEntry {
  path: string;
  status: FileStatus;
  staged: boolean;
  added_lines: number;
  deleted_lines: number;
}

/** 提交记录 */
export interface GitCommit {
  id: string;
  short_id: string;
  message: string;
  summary: string;
  author: string;
  time: number;
  timestamp: string;
}

/** 分支信息 */
export interface GitBranch {
  name: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  is_current: boolean;
  is_remote: boolean;
}

/** Blame 条目 */
export interface GitBlameEntry {
  line_no: number;
  commit_id: string;
  author: string;
  time: number;
}

/** 合并冲突内容 */
export interface MergeConflictContent {
  base: string;
  local: string;
  remote: string;
}

/** 冲突文件的三个 stage 内容（镜像 Rust ConflictContent） */
export interface ConflictContent {
  base_text: string;
  ours_text: string;
  theirs_text: string;
  file_path: string;
}

/** Diff 类型（决定如何获取 diff） */
export type GitDiffKind =
  | { type: "unstaged"; path: string }
  | { type: "staged"; path: string }
  | { type: "working"; path: string }
  | { type: "commits"; from: string; to: string; path?: string }
  | { type: "branches"; base: string; target: string; path?: string };
