import { createSignal, onMount } from 'solid-js';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { DiffView } from './components/DiffView';
import { Dashboard } from './components/Dashboard';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { DirectoryDiffView } from './components/DirectoryDiffView';
import { MergeView } from './components/MergeView';
import { GitMergeView } from './components/GitMergeView';
import { GitView } from './components/GitView';
import { getSettings } from './lib/settings';
import { gitConflictContext, setDiffPaths, setMergePaths, setGitConflictContext, setPendingRepoPath } from './lib/navStore';

type View = 'dashboard' | 'diff' | 'merge' | 'history' | 'git' | 'settings' | 'git-merge';
type DiffMode = 'file' | 'directory';

function App() {
  const [currentView, setCurrentView] = createSignal<View>('diff');
  const [diffMode, setDiffMode] = createSignal<DiffMode>('file');

  onMount(async () => {
    // 应用保存的主题设置
    const settings = await getSettings();
    const html = document.documentElement;
    if (settings.theme === 'light') {
      html.classList.remove('dark');
    } else if (settings.theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      html.classList.toggle('dark', mq.matches);
      mq.addEventListener('change', (e) => html.classList.toggle('dark', e.matches));
    }

    // 设置 Tauri 原生拖放事件（HTML5 DragEvent 在 Tauri v2 webview 中不工作）
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        const paths = event.payload.paths;
        if (paths.length === 0) return;
        // 如果已经在 Git 视图，让 GitView 自己处理拖放
        if (currentView() === 'git') return;
        discoverAndOpenRepo(paths[0]);
      }
    });
  });

  function openFileDiff(left: string, right: string, base?: string) {
    setDiffPaths({ left, right, base });
    setDiffMode('file');
    setCurrentView('diff');
  }

  function openMergeView(base: string, left: string, right: string) {
    setMergePaths({ base, left, right });
    setCurrentView('merge');
  }

  function openGitMergeView(repoPath: string, filePath: string) {
    setGitConflictContext({ repoPath, filePath });
    setCurrentView('git-merge');
  }

  function openDirectoryDiff() {
    setDiffMode('directory');
    setCurrentView('diff');
  }

  async function discoverAndOpenRepo(path: string) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const repoWorkDir = await invoke<string>("git_discover", { path });
      setPendingRepoPath(repoWorkDir);
      setCurrentView('git');
    } catch {
      // 不是 git 仓库，忽略拖放
    }
  }

  return (
    <div class="flex h-screen overflow-hidden">
      <aside class="w-16 flex-shrink-0 bg-slate-900/80 border-r border-slate-800/60 flex flex-col items-center py-3 gap-1 z-10">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-2 shadow-lg shadow-indigo-500/20">
          <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
        </div>
        <div class="flex-1 flex flex-col items-center gap-1 w-full px-2">
          <NavButton icon="grid" label="仪表盘" active={currentView() === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
          <NavButton icon="columns" label="文件对比" active={currentView() === 'diff'} onClick={() => { setDiffMode('file'); setCurrentView('diff'); }} />
          <NavButton icon="merge" label="三路合并" active={currentView() === 'merge'} onClick={() => setCurrentView('merge')} />
          <div class="w-6 h-px bg-slate-800/60 my-1" />
          <NavButton icon="git" label="Git" active={currentView() === 'git'} onClick={() => setCurrentView('git')} />
          <NavButton icon="clock" label="操作历史" active={currentView() === 'history'} onClick={() => setCurrentView('history')} />
        </div>
        <NavButton icon="gear" label="设置" active={currentView() === 'settings'} onClick={() => setCurrentView('settings')} />
      </aside>

      <main class="flex-1 flex flex-col overflow-hidden">
        <header class="flex-shrink-0 h-12 bg-slate-900/80 border-b border-slate-800/60 flex items-center justify-between px-4">
          <div class="flex items-center gap-3">
            <span class="text-sm font-semibold text-slate-100 tracking-tight">Differ</span>
            <span class="text-[10px] font-medium text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">v0.1.0</span>
          </div>
        </header>

        {currentView() === 'dashboard' && <Dashboard onNavigate={(view) => {
            if (view === 'diff') { setDiffMode('file'); setCurrentView('diff'); }
            else if (view === 'directory') { setDiffMode('directory'); setCurrentView('diff'); }
            else if (view === 'merge') setCurrentView('merge');
            else if (view === 'history') setCurrentView('history');
            else if (view === 'git') setCurrentView('git');
          }} />}

        {/* 保持两个 diff 视图常挂载，避免切换时状态丢失 */}
        <div class="flex-1 flex flex-col overflow-hidden" style={{ display: currentView() === 'diff' && diffMode() === 'file' ? 'flex' : 'none' }}>
          <DiffView onOpenMergeView={openMergeView} />
        </div>
        <div class="flex-1 flex flex-col overflow-hidden" style={{ display: currentView() === 'diff' && diffMode() === 'directory' ? 'flex' : 'none' }}>
          <DirectoryDiffView onOpenFileDiff={openFileDiff} onOpenMergeView={openMergeView} leftPath="" rightPath="" />
        </div>

        {currentView() === 'merge' && <MergeView />}
        {currentView() === 'git-merge' && (
          <GitMergeView
            repoPath={gitConflictContext()!.repoPath}
            filePath={gitConflictContext()!.filePath}
            onBack={() => { setGitConflictContext(null); setCurrentView('git'); }}
          />
        )}
        {currentView() === 'history' && <HistoryView onNavigate={(view) => {
            if (view === 'diff') { setDiffMode('file'); setCurrentView('diff'); }
            else if (view === 'directory') { setDiffMode('directory'); setCurrentView('diff'); }
            else if (view === 'merge') setCurrentView('merge');
          }} />}
        {currentView() === 'settings' && <SettingsView />}
        {currentView() === 'git' && <GitView onOpenGitMergeView={openGitMergeView} />}
      </main>
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  const icons: Record<string, JSX.Element> = {
    grid: <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg>,
    columns: <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>,
    folder: <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>,
    merge: <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>,
    clock: <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
    git: <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>,
    gear: <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  };

  return (
    <button
      onClick={onClick}
      title={label}
      class={`nav-item w-full h-10 rounded-lg flex items-center justify-center transition-all ${
        active
          ? 'text-indigo-300 bg-indigo-500/10'
          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
      }`}
    >
      {icons[icon]}
    </button>
  );
}

export default App;
