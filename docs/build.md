# 构建与打包

## 环境要求

- Node.js 22（CI 与开发环境一致）
- npm（项目内含 `package-lock.json`）

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装依赖 |
| `npm run dev` | 启动开发环境（Vite 热更新 + Electron） |
| `npm start` | 以预览模式启动已构建产物 |
| `npm run typecheck` | 主进程 + 渲染进程类型检查 |
| `npm test` | 单元测试（vitest，纯逻辑层） |
| `npm run build` | 类型检查 + 构建到 `out/` |
| `npm run dist:win` | 构建并打包 Windows 安装包 |
| `npm run dist:mac` | 构建并打包 macOS dmg（**必须在 macOS 上执行**） |
| `npm run dist:linux` | 构建并打包 Linux AppImage + deb |
| `npm run dist:linux:appimage` | 同上，但只出 AppImage |

> `dev` / `start` / `build` 都经过 `scripts/run-electron-vite.mjs` 这个薄包装器，
> 它会在调用 electron-vite 前删除环境变量 `ELECTRON_RUN_AS_NODE`。
> 某些集成终端会预设该变量，使 Electron 退化成普通 Node 进程，
> 于是主进程里 `require('electron')` 拿不到 `app` / `protocol`，启动即报
> `Cannot read properties of undefined`。用包装器可保证任何终端都能起。

## 打包产物

| 平台 | 产物 | 说明 |
| --- | --- | --- |
| Windows | `release/Markdown Notes-0.1.0-setup.exe` | NSIS 安装向导，可选安装目录、建桌面/开始菜单快捷方式 |
| macOS | `release/Markdown Notes-0.1.0-arm64.dmg` | Apple Silicon |
| macOS | `release/Markdown Notes-0.1.0-x64.dmg` | Intel |
| Linux | `release/Markdown Notes-0.1.0-*.AppImage` | 免安装 |
| Linux | `release/Markdown Notes-0.1.0-*.deb` | 需要包元数据，见下 |

只想要"解压即用的目录版"、跳过安装向导工具链：

```bash
npx electron-builder --win --dir     # → release/win-unpacked/
```

这条会快很多，也不联网下载 NSIS，适合先确认应用本身能否正常打出来。

## `--publish never` 是必须的

四条 `dist:*` 脚本都带这个参数，不是随手加的：

electron-builder 在 git tag 上下文里**会隐式触发发布**到 GitHub Release，
而本项目把发布交给 CI 里独立的 `publish` job。
矩阵任务若不带 `--publish never`，会在**安装包已经成功生成之后**
因为缺 `GH_TOKEN` 而报错退出，整个 job 判失败 —— 看起来像打包挂了，其实包是好的。

## 生产依赖

`main` / `preload` 走 `externalizeDepsPlugin()`，第三方依赖不被打进产物，
因此 `dependencies` 里的包**必须随安装包一起发布**：
electron-builder 会把根 `node_modules` 里的生产依赖复制进 asar
（`files` 虽然只写了 `out/**`，但 `node_modules` 走独立拷贝流程）。

当前必留的生产依赖：

- `chokidar` —— 主进程的文件监听
- `zod` —— 主进程的 IPC 入参校验

其余依赖（React、CodeMirror、remark/rehype 全家桶）都已被 Vite 打进 `out/renderer`，
若留在 `dependencies` 会被**再复制一份**进 asar，形成 20–30 MB 的纯冗余。
把它们移到 `devDependencies` 可以明显瘦身（`externalizeDepsPlugin` 只作用于 main / preload，这么搬是安全的）。

## 图标

`electron-builder.yml` 里 `directories.buildResources: build`，但 `build/` 目录默认不存在。
找不到图标时 electron-builder 只告警不报错，最终应用与安装程序使用 Electron 默认图标。

要换成自己的，放一个 `build/icon.ico`（Windows，建议 ≥ 256×256）即可，无需改配置。
macOS 用 `build/icon.icns`，或放 ≥ 512×512 的 `build/icon.png` 由 electron-builder 自动转换。

## 代码签名

产物**默认未签名**：

- Windows：首次运行会看到 SmartScreen"未知发布者"，点"仍要运行"可继续
- macOS：未签名未公证的 dmg 双击大概率报"已损坏"，需右键 → 打开，或去系统设置单独放行

macOS 侧要彻底消除，需要 Apple Developer Program 账号 → Developer ID 证书 → 签名 + 公证。
electron-builder 内置支持，配好 `CSC_LINK` / `CSC_KEY_PASSWORD` 与
`APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 即可，代码无需改动。
详见 [ci.md](./ci.md#代码签名可选)。

> electron-builder 找不到证书时只在 `mac/MacTargetHelper` 打一条
> `skipped macOS application code signing` 警告就继续出包 ——
> 构建不会失败，产物却是未签名的，容易误以为一切正常。

## 依赖安装的两个坑

**1. Electron 二进制走镜像下载。** `.npmrc` 里已配好 npmmirror 的
`electron_mirror` 与 `electron_builder_binaries_mirror`，直连 GitHub 容易超时。

**2. 不要用 `--os` / `--cpu` / `--ignore-scripts` 装依赖。**
这些参数会把 lockfile 之外的平台可选依赖过滤掉；而 lockfile 本身已完整记录了
所有平台的可选依赖（`@rollup/rollup-darwin-arm64`、`linux-x64-gnu`、`win32-x64-msvc`、`fsevents` 等），
原生平台直接 `npm ci` 即可。

## 首次打包会联网

`electron-builder` 自身不做安装向导，它依赖两个外部工具链：

- **NSIS** —— 生成 Windows 安装向导（`nsis` + `nsis-resources`）
- **winCodeSign** —— 代码签名工具链（不签名也会用到）

它们不是 npm 包，只在首次真正执行打包时下载，解压到
`%LOCALAPPDATA%\electron-builder\Cache` 后长期复用。下载源已在 `.npmrc` 里换成国内镜像。

**务必通过 `npm run dist:*` 调用**，不要直接跑 `npx electron-builder` ——
`.npmrc` 里的镜像是靠 npm 转成 `npm_config_*` 环境变量传进去的，
直接调用拿不到，会退化成直连 GitHub 然后长时间静默等待。

## 脚本与配置

| 文件 | 作用 |
| --- | --- |
| `electron.vite.config.ts` | 三进程构建配置、模块别名、CSP 注入插件 |
| `electron-builder.yml` | 打包配置（NSIS 选项、mac/Linux 目标、产物命名） |
| `tsconfig.json` / `.node.json` / `.web.json` | 主进程与渲染进程的分离类型检查 |
| `vitest.config.ts` | 单元测试配置 |
| `scripts/run-electron-vite.mjs` | 清理 `ELECTRON_RUN_AS_NODE` 的包装器 |
| `tools/capture-ui.mjs` | 通过 CDP 驱动真实应用截图，用于界面验证 |
