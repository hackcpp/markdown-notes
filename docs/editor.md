# 编辑器与标签页

实现位于 `src/renderer/src/features/editor/`，核心是 `editorHost.ts`。

## 一个 EditorView，每个文档一份 EditorState

这是编辑器的核心设计。

```
EditorView（全局仅一个，挂载在 EditorArea 的容器上）
  ├── EditorState(文档 A)   正文 + 光标 + 选区 + 撤销历史
  ├── EditorState(文档 B)
  └── EditorState(文档 C)
```

- 不为每个标签页创建独立 `EditorView`，避免 React 重渲染时反复重建编辑器实例；
- 每个 `EditorState` 自带正文、光标、选区与**撤销历史**，切换标签页只需 `view.setState(...)`，
  撤销记录与光标天然随状态迁移；
- 唯一无法随 state 迁移的是**滚动位置**，因此单独用 `scrollTops` 按文档记录并恢复 ——
  经 `view.requestMeasure` 在布局完成后写回，避免被 CodeMirror 自身的重新测量覆盖。

切换文档时 `activate()` 先把当前文档的状态与滚动位置存回 Map，再装上目标状态。
`suppress` 标志在 `setState` 期间抑制变更回调，避免程序性切换被误判为用户编辑。

## 变更监听：全应用最关键的一条链路

```
CodeMirror 内容变更
  └─ updateListener ──► handleUpdate
        ├─ states.set(当前文档, 新状态)
        ├─ listener.onDocChanged  ──► 文档置 dirty + 排定自动保存
        └─ scheduleMirror（140ms 节流）──► 预览 / 大纲镜像
```

`updateListener` 扩展实例本身不可变，可在所有 `EditorState` 之间安全共享，因此只创建一次。

**所有 `EditorState` 都经由 `createState()` 这一个入口创建**，以保证监听一定被挂上。
这不是洁癖：早期版本存在多个创建点，其中一处漏挂了 `updateListener`，
结果是打字有反应、但文档永不置脏 —— 保存与预览整条链路静默失效，UI 上完全看不出异常。
收拢成单一工厂后，这类缺陷在结构上被消除。

`onDocChanged` 只通知"变了"，不传文本，避免每次按键都做一次 O(n) 的字符串拷贝；
需要全文的地方走 `getText()`。

## 文本的权威来源

`getText(relPath)` 对**当前文档**一律以 `view.state` 为准，而不是 Map 里的缓存状态。
视图里的内容才是最实时的；`states` 只是非当前文档的状态缓存，
绝不能让它成为保存的内容来源。

## 文档生命周期

| 方法 | 行为 |
| --- | --- |
| `open` | 首次打开创建 `EditorState`；已打开则直接切换 |
| `activate` | 存回旧文档的状态与滚动位置，装上目标状态 |
| `close` | 删除状态与滚动记录；若关的是当前文档，先清空视图避免闪现旧文档 |
| `rename` | 文件重命名 / 移动后搬迁状态，**保留撤销历史与光标** |
| `replaceText` | 用磁盘内容替换（外部改动后重新加载）；抑制回调，再主动刷新镜像 |

## 偏好与主题：Compartment

行号、自动换行、暗色主题都通过 `Compartment` 动态重配置。

因为每个文档各持一份 `EditorState`，改设置时必须把所有状态的对应 Compartment 一起重配置：
当前文档走 `view.dispatch`，其余文档直接 `state.update` 生成新状态。
漏掉任一边就会出现"两份不一致的状态" —— 切换标签页时设置又变回去。

## 格式化命令

`format.ts` 集中定义所有排版命令，工具栏按钮与键盘快捷键共用同一批实现。

| 命令 | 快捷键 | 命令 | 快捷键 |
| --- | --- | --- | --- |
| 加粗 | `Ctrl+B` | 链接 | `Ctrl+K` |
| 斜体 | `Ctrl+I` | 图片 | `Ctrl+Shift+I` |
| 删除线 | `Ctrl+Shift+X` | 代码块 | `Ctrl+Shift+K` |
| 行内代码 | `Ctrl+E` | 一级标题 | `Ctrl+1` |
| 引用 | `Ctrl+Shift+Q` | 二级标题 | `Ctrl+2` |
| 无序列表 | `Ctrl+Shift+8` | 三级标题 | `Ctrl+3` |
| 有序列表 | `Ctrl+Shift+7` | 任务列表 | `Ctrl+Shift+9` |

macOS 上 `Ctrl` 对应 `Cmd`（CodeMirror 的 `Mod-` 前缀）。

编辑器内的 keymap **刻意不含** `Ctrl+S` / `Ctrl+F` / `Ctrl+W` ——
这些由主进程菜单加速器统一处理，避免编辑器与菜单两处各实现一套、行为不一致。

## 编辑能力

- Markdown 语法高亮；代码块按围栏语言动态载入对应语言包（`@codemirror/language-data`）
- 撤销 / 重做（`@codemirror/commands`，快捷键同样由菜单加速器转发）
- 查找与替换：`Ctrl+F` 打开搜索面板，`Ctrl+H` 额外展开替换区
- 括号匹配、代码折叠、自动补全
- 大纲跳转：`scrollToLine()` 把目标行滚到视口上方并聚焦（行号越界自动夹取）

## 光标与选区

`handleUpdate` 在 `selectionSet` 或 `docChanged` 时上报 `SelectionInfo`
（行、列、选中字数、总行数、总字数）。这类信息更新频率最高，
因此单独放进 `caretStore`，避免牵动整个组件树。

## 预览镜像

内容镜像按 `PREVIEW_THROTTLE_MS`（140ms）节流触发。
每次按键都重解析 Markdown 会让长文档明显掉帧。
`flushMirror()` 用于保存前或需要立刻取到最新文本的场合。

## 视图模式

源码 / 分屏 / 预览三种模式共用同一份编辑器状态，切换模式不重建编辑器、
不丢失光标与撤销历史（`CmdOrCtrl+Alt+1/2/3`）。
