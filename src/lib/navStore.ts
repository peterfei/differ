import { createSignal } from 'solid-js';

/** 跨组件导航：从目录对比→文件对比 */
export const [diffPaths, setDiffPaths] = createSignal<{ left: string; right: string } | null>(null);
