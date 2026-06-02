export interface MergeConflict {
  left_content: string[];
  right_content: string[];
  start_line: number;
}

export interface MergeResult {
  merged_text: string;
  conflicts: MergeConflict[];
  has_conflicts: boolean;
  // Original file contents for display in panels
  base_text: string;
  left_text: string;
  right_text: string;
}
