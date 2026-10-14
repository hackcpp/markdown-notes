# Markdown Notes

本地优先的 Markdown 桌面笔记软件。V0.1「可用编辑器」里程碑的实现。

原文件就是唯一权威数据：软件不移动、不重命名、不改写你的任何 Markdown 文件格式，
不引入任何私有数据库格式。

---

## 快速开始

```bash
npm install
npm run dev
```

其他命令：

```bash
npm run typecheck   # 主进程 + 渲染进程类型检查
npm test            # 单元测试（纯逻辑层）
npm run build       # 类型检查 + 打包到 out/
npm run dist:win    # 生成 Windows NSIS 安装包（输出到 release/）
```

> 关于启动脚本：`dev` / `start` / `build` 都经过 `scripts/run-electron-vite.mjs`
> 这个薄包装器，它会在调用 electron-vite 前删除环境变量 `ELECTRON_RUN_AS_NODE`。
> 某些集成终端（含本工作区的终端）会预设该变量，使 Electron 退化成普通 Node 进程，
> 于是主进程里 `require('electron')` 拿不到 `app` / `protocol`，启动即报
> `Cannot read properties of undefined`。用包装器可以保证 `npm run dev` 在任何终端都能起。

## V0.1 已实现范围（方案中 P0 + 部分 P1）

| 模块 | 状态 |
| --- | --- |
| 工程基础 | electron-vite + React + TypeScript，主/预加载/渲染三进程分离构建 |
| 安全模型 | `contextIsolation` + `sandbox` + 受控 Preload API + IPC 入参校验 + CSP + 自定义资源协议 |
| 文件管理 | 打开文件夹、目录扫描（跳过 `.git`/`node_modules`/隐藏项）、新建笔记与文件夹、重命名 / 移动、删除（进系统回收站）、在文件管理器中显示 |
| 编辑器 | CodeMirror 6、Markdown 语法高亮、代码块语言、撤销重做、折叠、括号匹配、自动补全、查找替换（Ctrl+F / Ctrl+H） |
| 视图模式 | 源码 / 分屏 / 预览，三者共用同一份编辑器状态 |
| 多标签页 | 每篇笔记独立保留光标、选区、撤销历史与滚动位置 |
| 预览 | unified 流水线（remark-parse → remark-gfm → remark-rehype → rehype-raw → 消毒 → HTML） |
| 自动保存 | 800ms 空闲 / 3s 最长间隔双节流；Ctrl+S 立即保存；串行写入；原子替换 |
| 数据可靠性 | 保存前版本校验、冲突提示、外部修改检测、保存失败退避重试、崩溃草稿恢复、关闭前握手 |
| 笔记管理 | 标题大纲（点击定位编辑器与预览）、YAML Frontmatter 标签、文档信息（编码 / 换行 / 字数） |
| 界面 | 明暗主题（含跟随系统）、可拖拽面板宽度、专注模式、状态栏、快捷键一览 |

### 明确尚未实现（对应方案 P1/P2）

全文搜索与 SQLite FTS5 索引、标签筛选视图、图片粘贴入库、Mermaid、数学公式、
`[[双向链接]]`、PDF 导出、自动更新。左侧导航栏的「搜索」「标签」入口已预留并给出提示。

---

## 目录结构

```
src/
├── main/                     # Electron 主进程
│   ├── index.ts              # 生命周期、单实例、协议登记、安全加固
│   ├── windows/mainWindow.ts # 窗口创建与关闭握手
│   ├── menu.ts               # 应用菜单（只发命令，不碰状态）
│   ├── protocol/             # notes-asset:// 自定义协议
│   ├── ipc/                  # 通道注册、zod 校验、关闭协调器
│   └── services/
│       ├── workspace/        # 工作区、目录扫描、文件监听
│       ├── document/         # 读写、原子写入、草稿恢复
│       └── settings/         # 应用设置持久化
├── preload/index.ts          # contextBridge 暴露受控 API
├── renderer/src/
│   ├── features/editor/      # CodeMirror 集成、格式化命令、编辑区
│   ├── features/preview/     # 预览流水线
│   ├── features/documents/   # 文档控制器（保存状态机、冲突处理）
│   └── features/workspace/   # 文件树、标签栏、大纲、状态栏等
└── shared/                   # 三进程共用的类型、常量、纯函数
```

## 几个关键设计决定

**编辑器状态如何保留。** 全部标签页共用**一个** `EditorView`，但每个文档各持有一份
`EditorState`。切换标签页时 `view.setState(...)`，撤销历史与光标天然随状态迁移；
唯一需要手工搬运的是滚动位置。这样既避免 React 重渲染反复重建编辑器，
也不需要为每个文件常驻一个 DOM 编辑器实例。

**保存为什么不是 `setTimeout + writeFile`。** 保存路径上有三条硬约束：
同一文件的写入必须串行（否则旧任务会覆盖新内容）、写前必须校验磁盘基准版本
（否则会静默覆盖别人的修改）、任何失败都不得对外表现为"已保存"。
实现见 `features/documents/documents.ts`，磁盘侧由 `AtomicWriter` 做
「同目录临时文件 → fsync → rename」的原子替换。

**原子替换不等于防冲突。** 它只能保证读到的是完整内容，无法阻止两个程序同时写同一文件。
真正的防线是保存前的 hash 比对：磁盘版本与读取时的基准不一致就拒绝写入并提示冲突。

**本地图片为什么不用 `file://`。** 预览中的相对图片路径会被重写成
`notes-asset://asset/?p=<相对路径>`，由主进程校验「位于当前工作区内 + 白名单图片类型」
后才返回字节。渲染进程因此拿不到任意磁盘读取能力。

**不改写文件格式。** 读取时记录原文件的换行风格（LF/CRLF）与 BOM，保存时按原样还原；
编辑器内部统一用 LF。预览不支持某种语法时，源文本一字不改。

## 与方案的差异

- **未使用 Tailwind CSS + Radix UI**，改为手写 CSS + CSS 变量。
  原因：编辑器主题色需要同时作用于 CodeMirror 与预览排版，用变量集中管理更直接，
  也少一层构建依赖。组件结构（`components/` 与 `features/` 分层）保持方案设计不变。
- **`better-sqlite3` 尚未引入**，属于 P1 的搜索索引部分，届时需要验证 Electron ABI 重建。
- **未使用 `@electron-toolkit/*` 辅助包**，窗口与工具函数手写，减少一层依赖。
