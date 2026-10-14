# Markdown Notes

[![CI](https://github.com/hackcpp/markdown-notes/actions/workflows/ci.yml/badge.svg)](https://github.com/hackcpp/markdown-notes/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/hackcpp/markdown-notes?label=release)](https://github.com/hackcpp/markdown-notes/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./package.json)

本地优先的 Markdown 桌面笔记软件。

**你的文件就是数据库。** 应用不移动、不重命名、不改写任何 Markdown 文件的格式，
也不引入私有存储格式 —— 用它写下的笔记，换任何编辑器打开、丢进 Git 仓库、
交给任何工具处理都不会出问题。

---

## 特性

### 编辑

- CodeMirror 6，Markdown 语法高亮，代码块按围栏语言动态加载
- 源码 / 分屏 / 预览三种视图，共用同一份编辑器状态
- 多标签页：每篇笔记独立保留**光标、选区、撤销历史与滚动位置**
- 查找与替换、代码折叠、括号匹配、自动补全
- 一键排版：加粗、标题、列表、引用、链接、图片、代码块

### 预览

- unified 流水线（remark-gfm、内嵌 HTML、消毒）
- 标题大纲，点击定位编辑器与预览
- 解析 YAML Frontmatter 标签
- 本地图片经 `notes-asset://` 自定义协议加载，渲染进程拿不到 `file://`

### 文件管理

- 打开文件夹作为工作区，目录树浏览
- 新建笔记 / 文件夹、重命名、移动、删除（进系统回收站）
- 在系统文件管理器中显示
- 外部程序改动文件时实时检测并提示冲突

### 数据可靠性

- 打字一停顿即自动保存（800ms 空闲 / 3s 最长间隔的双重节流）
- 落盘前校验磁盘版本，发现被外部改动就**拒绝写入**并提示，而不是静默覆盖
- 原文件的换行风格与 BOM 原样保留
- 保存失败退避重试并明确报错，绝不表现为"已保存"
- 退出前握手 + 崩溃恢复草稿

### 界面

- 明暗主题（含跟随系统）、侧栏与大纲面板宽度可拖拽
- 专注模式、状态栏、快捷键一览

## 快速开始

```bash
npm install
npm run dev
```

> `dev` / `start` / `build` 都经过 `scripts/run-electron-vite.mjs` 包装器，
> 它保证在预设了 `ELECTRON_RUN_AS_NODE` 的终端里也能正常启动。
> 细节见 [docs/build.md](./docs/build.md)。

### 常用命令

```bash
npm run typecheck      # 主进程 + 渲染进程类型检查
npm test               # 单元测试（vitest）
npm run build          # 类型检查 + 构建到 out/

npm run dist:win       # Windows 安装包 → release/*.exe
npm run dist:mac       # macOS dmg（必须在 macOS 上执行）→ release/*.dmg
```

## 下载

前往 [Releases](https://github.com/hackcpp/markdown-notes/releases) 获取安装包：

| 平台 | 文件 |
| --- | --- |
| Windows | `Markdown Notes-<版本>-setup.exe` |
| macOS（Apple Silicon） | `Markdown Notes-<版本>-arm64.dmg` |
| macOS（Intel） | `Markdown Notes-<版本>-x64.dmg` |

> 产物目前**未签名**：Windows 首次运行会有 SmartScreen "未知发布者"提示；
> macOS 的 dmg 双击可能报"已损坏"，需右键 → 打开。
> 消除方式见 [docs/ci.md](./docs/ci.md#代码签名可选)。

## 快捷键

`Ctrl` 在 macOS 上对应 `Cmd`。

| 操作 | 快捷键 | 操作 | 快捷键 |
| --- | --- | --- | --- |
| 保存 | `Ctrl+S` | 查找 | `Ctrl+F` |
| 全部保存 | `Ctrl+Alt+S` | 查找与替换 | `Ctrl+H` |
| 新建笔记 | `Ctrl+N` | 关闭标签页 | `Ctrl+W` |
| 打开文件夹 | `Ctrl+Shift+O` | 切换主题 | `Ctrl+Shift+L` |
| 源码 / 分屏 / 预览 | `Ctrl+Alt+1/2/3` | 专注模式 | `Ctrl+Shift+D` |
| 侧边栏 | `Ctrl+Shift+B` | 快捷键一览 | `Ctrl+/` |

排版命令与完整列表见 [docs/editor.md](./docs/editor.md#格式化命令)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [架构](./docs/architecture.md) | 进程模型、目录结构、IPC 契约、数据流、状态管理 |
| [编辑器与标签页](./docs/editor.md) | 编辑器状态模型、变更链路、排版命令、快捷键 |
| [数据可靠性](./docs/data-integrity.md) | 保存状态机、原子写入、冲突检测、格式保真、草稿恢复 |
| [安全模型](./docs/security.md) | Electron 安全基线、CSP、IPC 校验、自定义资源协议 |
| [Markdown 预览](./docs/preview.md) | 渲染流水线、资源重写、消毒策略 |
| [构建与打包](./docs/build.md) | 命令、产物、`--publish never`、生产依赖、图标 |
| [持续集成与发布](./docs/ci.md) | 两个工作流、缓存、已踩的坑、发版流程 |
| [路线图与取舍](./docs/roadmap.md) | 未实现项、跨平台风险、与原始方案的差异 |

## 项目结构

```
src/
├── main/        Electron 主进程（窗口、文件系统、IPC、自定义协议）
├── preload/     受控 API（contextBridge，不暴露 ipcRenderer）
├── renderer/    React 界面、编辑器、预览
└── shared/      三进程共用的类型、常量与纯函数
```

完整结构与各模块职责见 [docs/architecture.md](./docs/architecture.md#目录结构)。

## 状态

**V0.1「可用编辑器」** —— 覆盖产品方案中的 P0 与部分 P1。

尚未实现：全文搜索与索引、标签筛选视图、图片粘贴入库、Mermaid、数学公式、
`[[双向链接]]`、PDF 导出、自动更新。左侧导航栏的「搜索」「标签」入口已预留。
详见 [docs/roadmap.md](./docs/roadmap.md)。

## 许可证

MIT
