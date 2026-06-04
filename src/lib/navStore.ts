import { createSignal } from 'solid-js';

/** 跨组件导航：从目录对比→文件对比 */
export const [diffPaths, setDiffPaths] = createSignal<{ left: string; right: string; base?: string } | null>(null);

/** 跨组件导航：从文件对比→三路合并 */
export const [mergePaths, setMergePaths] = createSignal<{ base: string; left: string; right: string } | null>(null);

/** 跨组件导航：从 Git 视图 → Git 冲突合并视图 */
export const [gitConflictContext, setGitConflictContext] = createSignal<{
  repoPath: string;
  filePath: string;
} | null>(null);

/** 跨组件导航：自动发现仓库后跳转到 Git 视图 */
export const [pendingRepoPath, setPendingRepoPath] = createSignal<string | null>(null);

/** 全局快捷键触发的 DiffView 动作（Ctrl+S 语法切换等） */
export const [diffAction, setDiffAction] = createSignal<{ type: string; payload?: unknown } | null>(null);

/** DiffView 的跳转到行对话框状态（供 App.tsx 的 Escape 处理判断） */
export const [goToLineActive, setGoToLineActive] = createSignal(false);
