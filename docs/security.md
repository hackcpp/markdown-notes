# 安全模型

桌面应用的主要风险来自渲染进程：它要渲染用户随时可能粘贴进来的 Markdown，
其中可能包含内嵌 HTML、`javascript:` 链接、`file://` 图片，甚至恶意脚本。
本项目整体按"渲染进程不可信"来设计。

## 1. Electron 安全基线

`BrowserWindow` 的 `webPreferences`（`src/main/windows/mainWindow.ts`）：

| 选项 | 值 | 说明 |
| --- | --- | --- |
| `nodeIntegration` | `false` | 渲染进程拿不到 `require` |
| `contextIsolation` | `true` | 渲染世界与预加载世界隔离 |
| `sandbox` | `true` | 渲染进程运行在 Chromium 沙箱内 |
| `webSecurity` | `true` | 保留同源策略 |
| `devTools` | 仅开发环境 | 打包后禁用 |

**这三项不允许为了"方便"而放开。** 任何新增能力都应通过 Preload 显式暴露。

## 2. 导航与窗口限制

- `setWindowOpenHandler`：一律 `deny`，安全的 URL 交给系统浏览器打开
- `will-navigate`：除自身 URL 外全部 `preventDefault`，
  防止预览里的链接点击或外部拖放把主窗口导航走
- `will-attach-webview`：一律拦截，应用不需要 webview
- 外链协议白名单在 `shared/utils/asset.ts`，只放行 `http` / `https` / `mailto`

## 3. 内容安全策略（CSP）

CSP 由构建期注入：`electron.vite.config.ts` 定义开发/生产两套策略，
通过一个 Vite 插件替换 `src/renderer/index.html` 里的 `<!--CSP-->` 占位注释。

生产环境：

```
default-src 'none';
script-src 'self' file:;
style-src 'self' file: 'unsafe-inline';
img-src 'self' file: data: blob: notes-asset:;
font-src 'self' file: data:;
connect-src 'self';
media-src 'self' file: data: notes-asset:;
manifest-src 'self'; worker-src 'self' blob:;
object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'
```

红线是：**禁止远程脚本、禁止 object/iframe、禁止表单提交、禁止任意 connect**。

`file:` 被显式列出，是因为打包后页面经 `file://` 加载，
而 Chromium 对 `file://` 文档的 `'self'` 匹配行为在不同版本上不一致 ——
不写会导致"空白窗口"这类极难排查的故障。

开发环境额外放行内联脚本与 `ws:` 连接，因为 Vite 的 React Fast Refresh 需要它们。

## 4. IPC 入参校验

主进程**不因为调用经过 Preload 就信任输入**，所有 `invoke` 通道用 zod 重新校验
（`src/main/ipc/schemas.ts`）：

- 相对路径：长度 1–1024
- 绝对路径：长度 ≤ 4096
- 保存入参：`content` 为字符串、`baseHash` ≤ 64、`eol` 枚举 `\n` / `\r\n`、`hasBom` 为布尔
- 草稿批量保存：最多 500 条
- 设置补丁：字段级约束（如 `sidebarWidth` 限于 180–520），并 `.strip()` 丢弃未知字段

路径校验不只停留在格式层面。`WorkspaceService.resolveReal()` 会把路径解析到
**符号链接的真实目标**，再用 `isInside()` 确认它确实位于当前工作区内，
否则抛 `OUTSIDE_WORKSPACE`。因此 `../../etc/passwd` 之类的相对路径穿越、
以及指向工作区外的符号链接，都会在真正触碰磁盘前被拦下。

## 5. 本地资源：notes-asset:// 协议

预览里的本地图片**不使用 `file://`**：

- `file://` 会把整个磁盘暴露进渲染进程的 URL 空间；
- 一旦渲染层出现 XSS，攻击者就能读取任意本地文件。

改用自定义协议后，渲染进程只能发起形如
`notes-asset://asset/?p=<相对工作区路径>` 的请求，主进程逐项校验：

| 校验 | 不通过的结果 |
| --- | --- |
| 存在 `p` 参数且是合法的相对路径 | `400` |
| 当前有打开的工作区 | `403` |
| 解析后的真实路径位于工作区内 | `403` |
| 扩展名在白名单内（png / jpg / jpeg / gif / webp / svg / bmp / avif / ico） | `403` |
| 目标确实是文件 | `404` |
| 体积 ≤ 32 MB | `413` |

通过的响应带 `Cache-Control: no-cache` 与一段限制性 CSP
（`default-src 'none'; style-src 'unsafe-inline'; sandbox`）——
即使文件本身是可执行的 SVG，也无法自行加载外部资源。

## 6. 预览消毒

预览允许内嵌 HTML，但**展开后必须经过 `rehype-sanitize`**。
消毒策略与白名单见 [preview.md](./preview.md#消毒策略)。

## 7. 文件系统侧

- 删除笔记走系统回收站（`shell.trashItem`），不做物理删除
- 删除工作区根目录会被拒绝（返回 `BLOCKED`）
- 单篇笔记读取 / 保存上限 10 MB；目录扫描最大深度 12 层，
  并跳过 `.git` / `node_modules` / `release` 等目录与 `.DS_Store` 等文件
- 渲染进程拿不到 `fs` / `path`，所有文件操作必须由主进程代为执行并校验
