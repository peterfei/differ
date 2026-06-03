# Differ 发布说明

[English](RELEASE.en.md) · **中文**

## v0.1.0（初始版本）

### 功能特性

#### 文件对比
- 并排行级 diff，支持语法高亮
- 左右面板滚动同步
- 内联变更详情，显示新增/删除行数
- 文件对话框选择文件

#### 三路合并
- 三栏合并视图（基础版、左版、右版）+ 结果编辑器
- 自动冲突检测和高亮
- 手动冲突解决与内联编辑
- 选择侧版接受变更

#### 目录对比
- 递归目录 diff，树形视图
- 新增/删除/修改状态筛选
- 从目录 diff 一键跳转到文件 diff
- 可选的基准目录用于合并集成

#### 语法感知 Diff（tree-sitter）
- 基于 AST 按函数/类边界重组 hunk
- 上下文头显示函数名（`@@ fn foo()`）
- 不支持的语言优雅回退到行级 diff

#### 历史记录与仪表盘
- 仪表盘显示统计信息和快捷操作
- 最近活动列表快速访问
- 完整历史视图，支持类型筛选（diff/merge/directory）
- 通过 Tauri Store 持久化历史（最多 50 条）

#### 文件监视
- 监控文件变更，保存后自动重新 diff
- 监视中的文件有视觉指示器

#### 键盘导航
- `Ctrl+N` — 新建对比
- `Ctrl+S` — 切换语法模式
- `Ctrl+W` — 关闭标签页
- `Ctrl+Tab` — 下一个标签页
- `Escape` — 关闭对话框

#### UI 与体验
- 深色主题，精心调配的色彩方案
- 响应式布局，固定表头
- DSL 组件库，一致的设计语言
- 中文界面

### 支持语法感知 Diff 的语言
- Rust
- JavaScript / JSX
- TypeScript / TSX
- Python

### 已知限制
- 语法模式下尚未实现词级内联 diff
- 无插件/扩展系统
- 无远程仓库集成（GitHub/GitLab）
- 大文件 diff 性能可能受语法分析影响

### 系统要求
- macOS 10.15+
- 500MB 磁盘空间
- 大文件 diff 建议 4GB 内存

### 技术细节
- **前端**：SolidJS + TypeScript + Tailwind CSS + Vite
- **后端**：Rust + Tauri v2
- **Diff 引擎**：`similar` crate（行级），tree-sitter 0.24（语法）
- **安装**：
  - macOS: `brew tap peterfei/homebrew-differ && brew install --cask differ`
  - Windows: `winget install peterfei.Differ`（待合并）
  - 直接下载：macOS .dmg / Windows .msi & .exe / Linux .deb & .AppImage
