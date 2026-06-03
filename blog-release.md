# VS Code 插件做不了的事：我用 Rust + Tauri 造了个原生 Diff 工具，tree-sitter 让它真正理解代码结构

## 写在前面

写代码十年，有一件事我一直不太满意：**没有一款真正好用的桌面 Diff 工具。**

Beyond Compare 太老，Meld 太丑，Kaleidoscope 太贵。VS Code 内置的 Diff 勉强能用，但它本质上是 Web 技术栈，开个编辑器先吃掉 500MB 内存——就为了看两段代码的区别。

更重要的是，**它们都不理解代码。**

纯文本 diff 只关心行，不关心函数边界、类结构、作用域。两个相邻函数同时被修改，它们就糊在一起变成一个 hunk。面对三路合并的冲突标记，你也只能对着 `<<<<<<<` 和 `>>>>>>>` 手动撸。

所以我决定自己做一个。

---

## 不是又一个 Electron 应用

先聊技术选型。桌面端的选择其实不多：

| 方案 | 运行时体积 | 内存 | 性能 | 原生体验 |
|------|-----------|------|------|---------|
| Electron | ~200MB | 高 | 中 | 差 |
| .NET MAUI | ~100MB | 中 | 中 | 好 |
| Qt/PySide | ~50MB | 中 | 好 | 好 |
| **Tauri v2** | **~5MB** | **极低** | **极好** | **原生** |

Tauri v2 用系统 WebView 渲染前端，后端用 Rust。最终安装包不到 10MB，运行时内存 30-50MB。

这套组合的化学反应很有意思：

```rust
// 前端调用后端的 diff 命令
// 从前端 TypeScript 调用 Rust — 就像调用本地函数

// 前端（SolidJS）
const result = await invoke('diff_files', {
  file1: '/path/to/old.rs',
  file2: '/path/to/new.rs',
  algorithm: 'patience'
});

// 后端（Rust）— 真正的计算在这里
#[tauri::command]
fn diff_files(file1: PathBuf, file2: PathBuf, algorithm: String) -> Result<DiffResult, String> {
    let old = std::fs::read_to_string(&file1).map_err(|e| e.to_string())?;
    let new = std::fs::read_to_string(&file2).map_err(|e| e.to_string())?;

    let diff_algo: DiffAlgorithm = match algorithm.as_str() {
        "myers" => DiffAlgorithm::Myers,
        "patience" => DiffAlgorithm::Patience,
        _ => return Err("Unknown algorithm".into()),
    };

    compute_diff(&old, &new, diff_algo)
}
```

数据不经过 HTTP、不序列化 JSON 网络传输、不需要 Node.js 层——内存里直接调用，零开销。

### 那为什么不做 VS Code 插件？

这是被问得最多的问题，值得认真回答。

VS Code 插件有三个根本性约束：

**第一，只能活在 VS Code 进程里。** 插件本质上是跑在 Electron 渲染进程中的 JavaScript。VS Code 的扩展 API 不开放原生进程通信到你自己的 Rust 代码。你要么用 WebAssembly 编译 Rust（可行，但 tree-sitter 的 C API + WASM 绑定是另一条折腾路），要么把所有 diff/merge 逻辑再写一遍 TypeScript。那 Rust 的优势就全丢了。

**第二，性能天花板。** VS Code 的 diff 引擎（`diff-match-patch` 库）对于中等以上文件已经很吃力了。碰上几千行的合并冲突，整个编辑器会卡住。我的 Rust 引擎用 `proptest` 做过压力测试，10 万行文件的 diff 在三毫秒内完成——这在 JS 的 event loop 里不可能实现。

**第三，也是最重要的——架构主权。** VS Code 插件不能自定义原生窗口、不能控制系统菜单、不能脱离 Electron 的内存约束。三路合并的场景下，我希望用户能同时看到三栏对比 + 结果编辑器 + 文件树导航。在 VS Code 的 WebView 面板里堆这个 UI，体验受限于浏览器的布局引擎和插件 API 的边界。作为原生应用，我可以自由决定每一个像素的渲染。

说到底，**VS Code 是编辑器，不是 diff/merge 工具的平台。** 你要在它上面盖一个复杂的 diff/merge 工具，就像在浏览器里跑 Figma——能做到，但为什么不直接用原生方案？

当然，VS Code 的生态整合不可忽视。所以项目的长期规划里包含一个**独立的 VS Code 扩展协议桥**，Differ 作为外部 diff/merge 工具被 VS Code 调用，类似 Git 的外部合并工具配置。这样两边的优势都能拿到：VS Code 做编辑，Differ 做 diff。

---

## 最难的部分：让 Diff 理解代码结构

这是我认为最有意思的技术点。

### 传统的行级 Diff 有什么问题？

```
// 修改前
fn foo() {
    println!("hello");
}

fn bar() {
    println!("world");
}

// 修改后
fn foo() {
    println!("hello");
    do_something_else();
}

fn bar() {
    println!("world");
    do_another_thing();
}
```

纯文本 diff 的输出很可能会这样：

```
@@ -1,11 +1,13 @@
 fn foo() {
     println!("hello");
+    do_something_else();
 }

 fn bar() {
     println!("world");
+    do_another_thing();
 }
```

看起来还行？但如果上下文行数设高了，或者两个函数靠得更近，差别行会被合并成一个 hunk，完全丢失函数边界信息。

### tree-sitter 带来的转机

tree-sitter 给了每个字符一个位置——它在 AST 中的深度、父节点、子节点。我不想仅仅用 AST 做语法高亮，我想用它**重新组织 diff 的输出结构**。

思路是这样的：

```rust
// 伪代码：语法感知的 hunk 重组

fn regroup_hunks_with_ast(old_code: &str, new_code: &str) -> Vec<SyntaxHunk> {
    // 1. 先用 tree-sitter 解析两段代码
    let old_tree = parser.parse(old_code);
    let new_tree = parser.parse(new_code);

    // 2. 计算行级 diff
    let line_diffs = compute_myers_diff(old_code, new_code);

    // 3. 遍历每个变更行，用 AST 找到它所属的顶层节点
    let mut syntax_hunks: Vec<SyntaxHunk> = vec![];
    for change in line_diffs {
        let old_node = find_enclosing_function(&old_tree, change.old_line);
        let new_node = find_enclosing_function(&new_tree, change.new_line);

        // 4. 如果相邻变更属于不同的顶层节点 → 拆分成独立 hunk
        let parent = get_top_level_node(old_node, new_node);
        if parent != current_parent {
            syntax_hunks.push(new_hunk(parent));
            current_parent = parent;
        }
        syntax_hunks.last_mut().lines.push(change);
    }

    // 5. 从 AST 提取上下文信息
    for hunk in &mut syntax_hunks {
        hunk.header = format!("@@ {} {}",
            hunk.old_range,
            hunk.ast_node_name  // ← 关键：这里显示 fn foo()
        );
    }

    syntax_hunks
}
```

**核心创新在于第 3-4 步**：不是按行号聚集变更，而是按 AST 节点的归属关系来拆分。两个变更行在文本上可能只隔 3 行，但如果 tree-sitter 告诉你它们属于不同的函数，那它们就应该进不同的 hunk。

最终效果：

```
# 传统 diff：
@@ -1,14 +1,18 @@
 fn foo() {
     println!("hello");
+    do_something_else();
 }

 fn bar() {
     println!("world");
+    do_another_thing();
 }

# 语法感知 diff：
@@ fn foo() -1,3 +1,4 @@
 fn foo() {
     println!("hello");
+    do_something_else();
 }

@@ fn bar() -6,3 +7,4 @@
 fn bar() {
     println!("world");
+    do_another_thing();
 }
```

hunk header 里的 `@@ fn foo()` 和 `@@ fn bar()` 是 tree-sitter 从 AST 里提取的函数名。一眼就知道改了什么。

目前支持 Rust、JavaScript/JSX、TypeScript/TSX、Python。每种语言的顶层节点定义在 `langs!` 宏里：

```rust
macro_rules! langs {
    (Rust) => {
        [ // 告诉 tree-sitter 哪些节点算是"顶层函数边界"
            "function_item", "impl_item", "struct_item",
            "trait_item", "enum_item", "module_item"
        ]
    };
    (JavaScript) => {
        [ "function_declaration", "class_declaration",
          "method_definition", "arrow_function" ]
    };
    (Python) => {
        [ "function_definition", "class_definition" ]
    };
}
```

扩展新语言只需要加一个宏分支 + 对应的 tree-sitter grammar crate。验证过，Golang 的 grammar 加上只需要十几行配置。

### 为什么是 tree-sitter，而不是正则或 GPT？

做代码结构分析，有三条路可选：

**正则匹配。** 快，但脆弱。一个多行注释、一个缩进差异就能让匹配断裂。面对 JavaScript 里 `=>` 和 `function` 混用的代码，正则会彻底迷失。它不是为理解嵌套结构而生的。

**LLM/GPT。** 趋势是对的，但在这个场景下有几个硬伤：
- Token 窗口有限，大文件根本塞不进去
- 每次 diff 请求都要经过网络，延迟不可控
- 输出没有确定性保证——同一个文件 diff 三次，可能得到三种结果
- 成本问题：用户每点一次"重新 diff"都在消耗 API 费用

**tree-sitter。** 它用 GLR 解析算法，核心优势是容错性。代码写到一半、有未闭合括号、语法有错误——tree-sitter 仍然能生成一棵可用的语法树，不会崩溃。这就是它最初被设计为 IDE 语法高亮引擎的原因。

从更大的视角看，代码分析工具正在经历一条清晰的技术演进路径：

```
纯文本 diff   →   结构化语法树分析   →   语义级 AI 理解
    │                      │                      │
    │                    tree-sitter              LLM
    │                      │                      │
    git diff         这是本项目的定位      未来的脚手架
```

我选 tree-sitter 不是因为 AI 不好，而是因为**该用结构化分析解决的问题，不应该用黑盒模型来解决。** 函数边界在哪里、变量作用域从哪到哪——这些是确定的、可穷举的。用 tree-sitter 做结构层面的精确分析，把语义理解的广阔空间留给 AI，这才是务实的工程策略。未来计划中还包含通过 embedding 做相似代码匹配，但那是在结构化分析基础上的增强，而不是替代。

---

## 三路合并引擎：另一种思路

Git 的 merge 基于三路合并算法：找 base、ours、theirs，计算差异，标记冲突。

我的实现参考了同样的思想，但有一个差异点：**合并结果优先考虑可读性。**

```rust
// 伪代码：简化版三路合并

fn three_way_merge(base: &[Line], left: &[Line], right: &[Line]) -> MergeResult {
    // 计算 base→left 和 base→right 的 diff
    let left_diff = diff(base, left);
    let right_diff = diff(base, right);

    // 逐行对齐，检测冲突
    let mut result = vec![];
    for (left_hunk, right_hunk) in align_hunks(left_diff, right_diff) {
        match conflict_type(left_hunk, right_hunk) {
            // 两边都没改 → 保留原内容
            NoConflict => result.push(keep_base()),
            // 只有一边改了 → 自动接受
            OnlyLeftChanged => result.push(apply(left_hunk)),
            OnlyRightChanged => result.push(apply(right_hunk)),
            // 两边都改了 → 标记冲突让用户手动解决
            BothChanged => result.push(mark_conflict(left_hunk, right_hunk)),
        }
    }

    MergeResult {
        content: result,
        conflicts: count_conflicts(&result),
    }
}
```

合并引擎加上语法感知 diff 之后，一个额外的收益是：**冲突标记可以被精确地定位到函数内部**，而不是在文件级别的某个模糊位置。这对代码审查体验的提升是质的。

---

## Tauri 生态现状

说点大实话。

Tauri v2 比 v1 成熟了很多，插件系统正式化了，权限模型也清晰了。但还是有一些坑：

1. **文件对话框插件**（`tauri-plugin-dialog`）在 macOS 上偶尔会触发 sandbox 路径问题——文件被选中后路径却在沙箱外，需要手动 grant permission。

2. **文件监视**（`notify` crate + Tauri event 回传）的方案性能很好，但文件变更事件的去抖逻辑得自己写。VS Code 用的是 150ms 延迟，我抄的同一个值，效果不错。

3. **构建跨平台二进制**需要 Github Actions + matrix target，每个平台都有各自的签名/证书问题。macOS 的 codesign 和 Windows 的 `.ico` 文件都是血泪教训。

但总体来说，**Tauri 是桌面端 Rust 项目当前最好的发布方式**，没有之一。

---

## 一些数据和开源

项目目前 v0.1.0，MIT 协议开源。

- GitHub: https://github.com/peterfei/differ
- macOS: `brew tap peterfei/homebrew-differ && brew install --cask differ`
- 跨平台：dmg / msi / deb / AppImage 俱全

**测试覆盖率**是我比较自豪的部分：Rust 后端大量使用了 `proptest` 做属性测试——不是手写几个 case 就完事，而是生成随机的 diff/merge 输入来验证输出的一致性。前端 SolidJS 组件也有对应的单元测试。

---

## 后续想做的事

- **词级内联 diff**：语法模式下，既然有 AST，理论上可以做 token 级别的细粒度对比
- **Git 集成**：直接对比 Git 历史、分支、commit
- **更多语言支持**：Go、Java、Kotlin、Swift——只要 tree-sitter 有的 grammar，加进来成本都不高
- **语义化代码匹配**：用 embedding 做相似的代码片段搜索，找到不同项目中功能相同的函数差异
- **插件系统**：还在想怎么做，Tauri v2 的 plugin 模型或许是一个方向

---

## 最后

我做这个项目最深的体会是：**在 2026 年，原生桌面应用的开发体验已经不比 Web 差了。**

Rust + Tauri + SolidJS 的组合，后端性能拉满，前端响应迅速，打包体积以 MB 计而不是 GB 计。对于工具类应用来说，这可能是最优解。

从技术趋势来看，"AI 辅助"正在所有开发工具中普及，但我也想提醒一件事：**AI 是增量，不是替代。** 代码分析的最底层——行在哪、函数从哪到哪、哪些行发生了变化——这些应该由确定性的算法完成，并且应该在本地、离线、毫秒级响应。AI 在更高层发挥价值：解释变更意图、推荐修复、搜索相似模式。两者之间不是二选一的关系。

如果你也做开发工具，或者在纠结 Electron 以外的方案，或者对 tree-sitter 的某个语言扩展感兴趣，欢迎来看看源码，提 issue 或者 PR。

代码改变世界。或者说，至少让改代码这件事，变得不那么痛苦一点。

---

*项目地址：[github.com/peterfei/differ](https://github.com/peterfei/differ)*

*安装：`brew tap peterfei/homebrew-differ && brew install --cask differ`*
