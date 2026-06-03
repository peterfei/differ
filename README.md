# Differ

[English](README.en.md) · **中文**

一款现代化的文件对比与合并桌面应用，基于 Tauri v2 和 SolidJS 构建。

![screenshot](screenshot.png)

## 功能特性

- **并排对比** — 逐行对比两个文件，支持语法高亮、滚动同步和内联变更详情。
- **三路合并** — 基于共同祖先合并两个文件版本，支持冲突检测与解决。
- **目录对比** — 递归对比两个目录，以树形结构展示新增、删除和修改的文件。
- **语法感知 Diff** — 基于 tree-sitter AST 分析，智能按函数/类边界重组 hunk 并显示上下文头。
- **文件监视** — 监控文件变更，保存后自动重新对比。
- **历史记录** — 所有对比和合并操作本地持久化存储，方便快速回溯。
- **键盘导航** — 完整的键盘快捷键支持，提升操作效率。
- **深色主题** — 精心设计的深色 UI，减少眼部疲劳。

### 支持语法感知 Diff 的语言

- Rust
- JavaScript / JSX
- TypeScript / TSX
- Python

## 安装

### macOS

**Homebrew（推荐）：**

```bash
brew tap peterfei/homebrew-differ
brew install --cask differ
```

或从 [Releases](https://github.com/peterfei/differ/releases) 页面下载最新的 `.dmg` 安装包。

### Windows & Linux

从 [Releases](https://github.com/peterfei/differ/releases) 页面下载对应平台的安装包（`.msi` / `.deb` / `.AppImage`）。

### Windows & Linux

从 [Releases](https://github.com/peterfei/differ/releases) 页面下载对应平台的安装包（`.msi` / `.deb` / `.AppImage`）。

### 从源码构建

**前置依赖：**

- [Rust](https://rustup.rs/) (1.80+)
- [Node.js](https://nodejs.org/) (20+)
- [Tauri CLI 系统依赖](https://v2.tauri.app/start/prerequisites/)

```bash
# 克隆仓库
git clone https://github.com/peterfei/differ.git
cd differ

# 安装前端依赖
npm install

# 开发模式运行
npm run tauri dev

# 生产构建
npm run tauri build
```

## 使用指南

1. **文件对比** — 在仪表盘打开两个文件，查看并排差异。
2. **目录对比** — 选择两个目录，查看递归对比树。
3. **三路合并** — 提供基础文件和两个修改版本，进行合并和冲突解决。
4. **语法模式** — 支持的语言可在行级和语法感知分组间切换。

### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+N` | 新建对比 |
| `Ctrl+S` | 切换语法模式 |
| `Ctrl+W` | 关闭标签页 |
| `Ctrl+Tab` | 下一个标签页 |
| `Escape` | 关闭对话框 |

## 技术栈

- **前端**：SolidJS, TypeScript, Tailwind CSS, Vite
- **后端**：Rust, Tauri v2
- **Diff 引擎**：`similar` crate（行级 diff）
- **语法分析**：tree-sitter（Rust, JavaScript, TypeScript, Python）
- **存储**：Tauri Plugin Store（历史记录持久化）

## 项目结构

```
src/
├── components/       # UI 组件 (DiffView, MergeView, Dashboard 等)
├── dsl/              # 设计系统组件库
├── lib/              # 工具和状态管理 (historyStore, navStore 等)
├── types/            # TypeScript 类型定义
└── App.tsx           # 根应用组件

src-tauri/
├── src/
│   ├── commands/     # Tauri 命令 (diff, merge 等)
│   ├── diff/         # Diff 引擎 (text_diff, syntax_diff, merge 等)
│   └── lib.rs        # Tauri 应用入口
└── Cargo.toml
```

## 开发

```bash
# 运行测试
npm test                     # 前端测试 (Vitest)
cd src-tauri && cargo test   # 后端测试 (Rust)

# 热重载开发
npm run tauri dev
```

## 许可证

MIT
