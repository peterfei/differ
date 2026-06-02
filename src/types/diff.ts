// Rust 后端 DiffResult 的 TypeScript 镜像类型

export type ChangeType = "Add" | "Delete" | "Equal";

export type DiffAlgorithm = "Myers" | "Patience";

export interface DiffOptions {
  algorithm: DiffAlgorithm;
  context_lines: number;
  ignore_whitespace: boolean;
  ignore_case: boolean;
}

export interface InlineDiff {
  start: number;
  end: number;
  change_type: ChangeType;
}

export interface DiffChange {
  old_line_no: number | null;
  new_line_no: number | null;
  old_text: string | null;
  new_text: string | null;
  change_type: ChangeType;
  inline_changes: InlineDiff[];
}

export interface DiffHunk {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  changes: DiffChange[];
}

export interface DiffResult {
  hunks: DiffHunk[];
  left_lines: number;
  right_lines: number;
  options: DiffOptions;
}
