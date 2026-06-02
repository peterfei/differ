import { createSignal } from 'solid-js';

/** 跨组件导航：从目录对比→文件对比 */
export const [diffPaths, setDiffPaths] = createSignal<{ left: string; right: string; base?: string } | null>(null);

/** 跨组件导航：从文件对比→三路合并 */
export const [mergePaths, setMergePaths] = createSignal<{ base: string; left: string; right: string } | null>(null);
