# Differ 发布说明

[English](RELEASE.en.md) · **中文**

## v0.2.0 — Git 集成与交互式合并

### 新增功能

#### Git 仓库集成
- 打开本地 Git 仓库（支持输入路径、最近仓库列表、目录选择器、拖放）
- 文件变更面板 — 显示工作区变更（新增/修改/删除/冲突/重命名）
- 提交历史 — 分页浏览提交记录，查看每次提交的差异
- 分支管理 — 查看本地分支，支持分支间差异比较
- 冲突文件交互式三路合并 — 点击冲突文件进入三路合并视图

#### 交互式合并冲突解决
- 三栏面板分别显示 Base / Ours（本地）/ Theirs（远程）
- 逐冲突导航（上一处/下一处）
- "采用左侧" / "采用右侧" 一键解决
- 可编辑合并结果区域
- 冲突解决后写入工作区并暂存（git add）

#### 修复
- 修复 release 构建样式完全丢失的问题（Tailwind CDN → 本地打包）
- 修复三路合并多冲突场景下行号偏移导致解决不完整
- 修复三路合并 adoptSide 后界面不更新的响应式 bug

### 支持的语言（语法感知 Diff）
与 v0.1.0 相同：Rust, JavaScript/JSX, TypeScript/TSX, Python

### 已知限制
- 与 v0.1.0 相同，新增：暂不支持 git push/pull 远程操作
- 交互式合并暂不支持手动编辑冲突文本后重新解析

### 系统要求
- macOS 12.0+（Tauri v2 最低要求）
- 500MB 磁盘空间
- 大文件 diff 建议 4GB 内存

---

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
