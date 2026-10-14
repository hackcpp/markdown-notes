# 架构

## 进程模型

三个进程严格分工，渲染进程不具备任何直接的文件系统或 Node 能力。

| 进程 | 源目录 | 职责 | 不做的事 |
| --- | --- | --- | --- |
| 主进程 | `src/main/` | 窗口与生命周期、文件读写、目录扫描与监听、设置与草稿持久化、自定义协议 | 不持有 UI 状态，不判断"该不该保存" |
| 预加载 | `src/preload/` | 用 `contextBridge` 暴露一组白名单方法 | 不暴露 `ipcRenderer` 本体，不做业务判断 |
| 渲染进程 | `src/renderer/` | React 界面、CodeMirror 编辑器、Markdown 预览、保存调度 | 不碰 `fs` / `path`，不直接接触 `ipcRenderer` |

三者共用的类型、常量与纯函数放在 `src/shared/`。该目录不依赖任何 Node / DOM API，
因此可以被三个构建目标同时引用。

## 构建产物

electron-vite 分别构建三个目标，输出到 `out/`：

```
out/
├── main/index.js       # CJS，Node 环境
├── preload/index.js    # CJS
└── renderer/           # 浏览器环境（index.html + assets/）
```

`main` 与 `preload` 通过 `externalizeDepsPlugin()` 把第三方依赖**外置**，
产物里保留 `require("chokidar")` 这类语句，由 `node_modules` 在运行时解析。
渲染进程相反 —— React / CodeMirror / unified 全部被打进 `out/renderer`。

> 这在打包时会变成硬约束：`chokidar` 与 `zod` 必须作为**生产依赖**随包发布，
> 否则安装后主进程启动即崩。详见 [build.md](./build.md#生产依赖)。

## 目录结构

```
src/
├── main/
│   ├── index.ts                   生命周期、单实例锁、协议登记、安全加固
│   ├── windows/mainWindow.ts      窗口创建、导航拦截、关闭握手
│   ├── menu.ts                    应用菜单（只发命令，不碰状态）
│   ├── protocol/assetProtocol.ts  notes-asset:// 自定义协议
│   ├── ipc/
│   │   ├── index.ts               通道注册与处理器
│   │   ├── schemas.ts             zod 入参校验
│   │   └── closeCoordinator.ts    关闭询问的请求/响应配对
│   ├── services/
│   │   ├── workspace/             工作区、目录扫描、文件监听
│   │   ├── document/              读写、原子写入、草稿恢复
│   │   └── settings/              设置持久化
│   └── utils/                     日志与错误映射
├── preload/
│   └── index.ts                   contextBridge 暴露的受控 API
├── renderer/src/
│   ├── features/editor/           CodeMirror 集成、格式化命令、编辑区
│   ├── features/preview/          预览流水线
│   ├── features/documents/        文档控制器（保存状态机、冲突处理）
│   ├── features/workspace/        文件树、标签栏、大纲、状态栏等
│   ├── components/                通用对话框、菜单、图标
│   ├── stores/                    zustand 状态
│   ├── hooks/                     面板拖拽、应用命令
│   ├── lib/                       IPC 封装与对话框封装
│   └── styles/global.css
└── shared/
    ├── constants/                 全局常量（三进程共用）
    ├── types/                     共享类型
    ├── contracts/api.ts           Preload API 的接口契约
    ├── ipc/channels.ts            通道名常量
    ├── markdown/                  标题提取、Frontmatter 解析等纯函数
    └── utils/                     路径、文本、资源、错误工具
```

## 模块别名

| 别名 | 指向 | 可用范围 |
| --- | --- | --- |
| `@shared` | `src/shared` | main / preload / renderer |
| `@main` | `src/main` | main |
| `@renderer` | `src/renderer/src` | renderer |

TypeScript 7 移除了 `baseUrl`，因此 tsconfig 里的 `paths` 使用相对写法。

## IPC 契约

通道名集中在 `src/shared/ipc/channels.ts`，命名规则 `领域:动作`。

### 渲染进程 → 主进程（`invoke`，有返回值）

| 通道 | 用途 |
| --- | --- |
| `workspace:open` | 弹目录选择框并打开工作区 |
| `workspace:openPath` | 按路径打开（用于最近工作区） |
| `workspace:close` | 关闭当前工作区 |
| `workspace:getTree` | 取目录树 |
| `workspace:refresh` | 重新扫描 |
| `workspace:state` | 查询当前工作区状态 |
| `document:read` | 读取笔记（返回内容、hash、换行、BOM、mtime） |
| `document:save` | 保存（带 `baseHash` 做版本校验） |
| `document:createFile` | 新建笔记 |
| `document:createFolder` | 新建文件夹 |
| `document:rename` | 重命名 / 移动 |
| `document:remove` | 删除（进系统回收站） |
| `document:reveal` | 在系统文件管理器中显示 |
| `draft:save` / `list` / `read` / `clear` | 崩溃恢复草稿 |
| `settings:get` / `settings:update` | 设置读写 |
| `shell:openExternal` | 打开外部链接（协议白名单） |
| `app:getInfo` | 取应用信息 |
| `app:closeResponse` | 回应主进程的关闭询问 |

### 主进程 → 渲染进程（`send`，单向通知）

| 通道 | 用途 |
| --- | --- |
| `app:command` | 菜单命令下发（新建、保存、切换视图…） |
| `workspace:treeChanged` | 目录树发生变化 |
| `document:externalChange` | 磁盘上的文件被外部改动 |
| `app:requestClose` | 请求渲染进程确认可以关闭 |
| `draft:available` | 发现可恢复的草稿 |

所有 `invoke` 通道的入参在主进程侧再次用 zod 校验，见 [security.md](./security.md#4-ipc-入参校验)。

## 数据流

```
磁盘
 │  fs
 ▼
WorkspaceService / DocumentService / FileWatcher          （主进程）
 │  IPC（invoke / send）
 ▼
preload 白名单 API
 │
 ▼
lib/api.ts ──► features/documents/documents.ts            （渲染进程）
 │                    │
 │                    ├──► appStore / docsStore / caretStore
 │                    └──► saveController（保存调度）
 ▼
editorHost（CodeMirror）──► PreviewPane / OutlinePanel
 │
 ├── 内容变更 ──► 镜像（节流 140ms）──► 预览重解析
 └── 内容变更 ──► 置脏 + 排定自动保存
```

## 状态管理

渲染进程用 zustand，拆成三个互不耦合的 store：

| Store | 内容 |
| --- | --- |
| `appStore` | 工作区、目录树、主题、面板可见性、提示消息 |
| `docsStore` | 打开的标签页、每个文档的元信息（hash / 换行 / BOM / 保存状态） |
| `caretStore` | 光标位置、选区统计（高频更新，单独隔离避免整树重渲染） |

`docsStore` 中每个文档的 `status` 是保存状态机的权威状态，
取值只可能是：`clean`、`dirty`、`saving`、`error`、`conflict`、`missing`。

## 贯穿全局的几条不变量

1. **原文件是唯一权威数据。** 不移动、不重命名、不改写用户的 Markdown 格式，
   不引入任何私有数据库格式。
2. **落盘失败绝不对外表现为"已保存"。** 状态机在收到明确的成功回执前不会回到 `clean`。
3. **同一文件的写入串行。** 任何时刻最多一个保存在飞，旧任务不会覆盖新内容。
4. **主进程不信任渲染进程。** 所有入参重新校验；路径必须落在当前工作区内。
5. **渲染进程没有任意磁盘读取能力。** 本地资源只能经 `notes-asset://` 取用。
