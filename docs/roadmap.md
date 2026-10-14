# 路线图与设计取舍

## 尚未实现

对应原始方案的 P1 / P2：

| 功能 | 备注 |
| --- | --- |
| 全文搜索 + 索引 | 计划用 SQLite FTS5，届时需验证 `better-sqlite3` 的 Electron ABI 重建 |
| 标签筛选视图 | 标签已能从 YAML Frontmatter 解析，缺的是筛选界面 |
| 图片粘贴入库 | 粘贴时写入工作区并改写为相对路径 |
| Mermaid、数学公式 | 需要额外的预览插件与渲染依赖 |
| `[[双向链接]]` | 需要反向索引 |
| PDF 导出 | — |
| 自动更新 | 需要发布渠道与签名配合 |

左侧导航栏的「搜索」「标签」入口已预留并给出提示，不是漏做。

## 跨平台风险（尚未在 macOS 上实测）

### `fs.realpath` 与 `/tmp` 符号链接

`WorkspaceService`（4 处）与 `assetProtocol`（1 处）用 `fs.realpath` 做工作区越界校验。

macOS 上 `/tmp` 实际是 `/private/tmp` 的符号链接、`/var` → `/private/var`，
realpath 结果会带上 `/private` 前缀。**若用户把工作区放在这些路径下，
前缀比较可能误判为"越界"而拒绝访问。**

Windows 上完全不会暴露这个问题，因此本机测不出来，需要真机验证。
修法方向是：比较前对「根」与「目标」统一做 realpath（当前实现里 `realRoot` 与
`realTarget` 看似已各自 realpath，但需要实测确认）。

### chokidar 在 macOS 上的可选依赖

chokidar 3 在 macOS 上会启用可选的 `fsevents` 原生模块（Windows 下不安装）。
lockfile 里已记录 `fsevents`，macOS 上 `npm install` 会自动带上。

### 用户数据目录

统一走 `app.getPath('userData')`，跨平台自动适配
（macOS → `~/Library/Application Support/markdown-notes`），无需分支处理。
设置与恢复草稿都在该目录下。

## 与原始产品方案的差异

| 方案 | 实际实现 | 原因 |
| --- | --- | --- |
| Tailwind CSS + Radix UI | 手写 CSS + CSS 变量 | 编辑器主题色需要同时作用于 CodeMirror 与预览排版，用变量集中管理更直接，也少一层构建依赖。组件结构（`components/` 与 `features/` 分层）保持方案设计不变 |
| `better-sqlite3` 搜索索引 | 暂未引入 | 属于 P1，引入时需验证 Electron ABI 重建 |
| `@electron-toolkit/*` 辅助包 | 窗口与工具函数手写 | 减少一层依赖 |

## 可选的后续优化

- **给安装包瘦身**：把已被 Vite 打进 renderer 的依赖（React、CodeMirror、remark/rehype 全家桶）
  从 `dependencies` 移到 `devDependencies`，只保留 `chokidar` 与 `zod`。
  能去掉 asar 里约 20–30 MB 的重复副本。需要重跑 `npm install` 更新 lockfile。
- **补应用图标**：放 `build/icon.ico`（Windows）与 `build/icon.icns` / `icon.png`（macOS）
  即可替换 Electron 默认图标，无需改配置。
- **配置代码签名**：消除 Windows 的 SmartScreen 提示与 macOS 的"已损坏"拦截，
  详见 [ci.md](./ci.md#代码签名可选)。
- **恢复 Linux 支持**：`electron-builder.yml` 与 `package.json` 里的 Linux 配置仍在，
  只需把 CI 矩阵项与产物上传路径加回去。
  注意 `deb` 目标需要 `package.json` 补齐 `homepage` / `repository` / `author.email`
  —— electron-builder 的 `FpmTarget` 会硬校验这几项，缺失时直接报错退出。

## 版本现状

V0.1「可用编辑器」里程碑，覆盖方案中的 P0 与部分 P1。功能范围见 [README](../README.md#特性)。
