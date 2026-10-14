# 持续集成与发布

两个工作流，职责不重叠：

| 工作流 | 文件 | 触发 | 产出 |
| --- | --- | --- | --- |
| CI | `.github/workflows/ci.yml` | push 到 `main`、PR、手动 | 类型检查 + 单测 + 构建，**不打包** |
| Release | `.github/workflows/release.yml` | push `v*` 标签、手动 | Windows exe + macOS dmg，并创建 GitHub Release |

**推分支只跑 CI，不会出安装包** —— 这是最常见的困惑来源，出包必须打 `v*` 标签。

## CI 工作流

矩阵 `[windows-latest, macos-latest]`，`fail-fast: false`。

选这两个平台而非只跑 Linux，是因为本项目存在真实的跨平台差异
（符号链接 / `realpath`、`fsevents`、换行风格），只在单平台跑会漏掉。
每个平台依次执行：

```
npm ci → npm run typecheck → npm test → npm run build
```

配了 `concurrency` 按 ref 分组、`cancel-in-progress: true`，
连续推送时自动取消旧运行，不浪费额度。

## Release 工作流

三个 job：

```
guard   ── 版本一致性校验（提前失败，避免白拉起 macOS runner）
  │
package ── 矩阵：Windows（dist:win）/ macOS（dist:mac）
  │         并行打包 → 上传 workflow artifact
  │
publish ── 仅 tag 触发：下载全部 artifact → 创建 Release 并附带安装包
```

### guard：标签与版本必须一致

打 `v*` 标签时校验标签名与 `package.json` 的 `version` 相同。

动机是一类"流水线全绿、产物却是错的"的情况：electron-builder 用
`package.json` 的 `version` 命名产物，若打了 `v0.2.0` 标签却忘了改 `version`，
Release 会挂着 v0.2.0 的标题、里面却是 `…-0.1.0-setup.exe`。

这个 job 有个刻意为之的细节：**不使用 job 级 `if`，只把检查步骤条件化**
（`if: github.ref_type == 'tag'`）。因为 GitHub Actions 里 job 被跳过会导致
`needs` 它的下游 job **一并被跳过** —— 那样 `workflow_dispatch` 的手动验证路径就废了。
让 job 始终运行、检查步骤条件化，两个目的都能满足。

### package：打包

每个平台执行 `npm ci → npm test → npm run dist:*`，
然后用 `actions/upload-artifact` 上传 `release/*.exe` 与 `release/*.dmg`
（`if-no-files-found: error`，产物没出来就直接判失败）。

打包步骤必须是 `shell: bash` 并显式 unset 证书变量（原因见下文"坑 2"）。

### publish：发布

`needs: package` 且 `if: startsWith(github.ref, 'refs/tags/v')`，
在 `ubuntu-latest` 上用 runner 自带的 `gh` CLI 执行 ——
这里用 Ubuntu 只是挑最省额度的 runner，**不产出任何 Linux 产物**。

写成幂等的：Release 已存在则 `gh release upload --clobber`，
否则 `gh release create`。这样失败后重跑不会撞上 "already exists"。

## 缓存

两个工作流都缓存 Electron 二进制与 electron-builder 工具链：

```yaml
path: |
  ~/.cache/electron
  ~/.cache/electron-builder
  ~/Library/Caches/electron
  ~/Library/Caches/electron-builder
  ~/AppData/Local/electron/Cache
  ~/AppData/Local/electron-builder/Cache
key: electron-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
```

key 绑在 lockfile 的哈希上：依赖变了才重下。这部分约 580 MB，缓存命中能省掉整轮下载。
`setup-node` 的 `cache: npm` 另外缓存 npm 依赖。

## 已踩过的三个坑

### 坑 1：electron-builder 的隐式发布

**现象**：Windows 与 macOS 打包步骤都失败，但日志里安装包明明已经生成：

```
• Implicit publishing triggered by git tag ... tag=v0.1.0
• building  target=nsis file=release\Markdown Notes-0.1.0-setup.exe   ← 包已经好了
⨯ GitHub Personal Access Token is not set ... using env "GH_TOKEN"    ← 卡在这里
```

**原因**：electron-builder 检测到处于 git tag 上下文时会**自动发布到 GitHub Release**
（v27 起才移除该行为），而本项目的发布由独立的 `publish` job 负责。
矩阵任务没给 `GH_TOKEN`，于是在最后一步报错、整个 job 判失败。

**处置**：四条 `dist:*` 脚本全部加 `--publish never`。

### 坑 2：空字符串不是"未定义"

**现象**：仅 macOS 失败，`⨯ /Users/runner/work/markdown-notes/markdown-notes not a file`。

**原因**：GitHub Actions 对**未定义的 secret 注入的是空字符串**，而不是不注入；
而 electron-builder 的 `getCscLink()` 只判 `null` 不判空（`macPackager.js:26`），
`""` 经 `resolveCscLinkPath("", 项目目录)` 会被 `path.resolve` 解析成**项目目录本身**，
撞上 `codeSign/codesign.js` 的 `!stat.isFile()` 校验。
Windows 之所以没事，是因为它用 `isEmptyOrSpaces` 判断签名，空串等同于跳过。

**处置**：打包步骤改用 `shell: bash`，证书相关变量为空时**真正 `unset`**，
并按有无证书显式设置 `CSC_IDENTITY_AUTO_DISCOVERY`。

### 坑 3：lockfile 与 `--os`

本机当初曾用 `npm install --os=win32 --cpu=x64` 装过依赖。
若该参数把 lockfile 里的平台可选依赖过滤成只剩 Windows，
`npm ci` 在 macOS runner 上会直接崩 —— CI 跑了才发现就晚了。

启动 CI 前应先确认 lockfile 完整：

```bash
grep -oE '"node_modules/@(rollup|esbuild)/[a-z0-9-]+"' package-lock.json | sort -u
```

当前 lockfile 记录完整（含 `darwin-arm64`、`linux-x64-gnu`、`win32-x64-msvc` 与 `fsevents`），
因此工作流里**不要**加那三个参数（`ci.yml` 里也留了注释说明）。

## 实测记录

用于确认整条链路可靠，而非只跑通一次：

| 场景 | 结果 |
| --- | --- |
| 热缓存打包（首次成功后重跑） | Windows / macOS 全绿，三个产物约 2 分钟 |
| **冷启动打包**（清空全部 Actions 缓存后重跑） | 全绿，约 3.5 分钟。日志确认 `Cache not found`，且 `nsis-3.0.4.1.7z`、`nsis-resources-3.4.1.7z` 下载进度 100% —— 即工具链下载这一最容易卡住的环节在 CI 环境里确实可用 |
| 产物有效性 | 对远端产物做区间下载校验：exe 头部为 `4d 5a`（`MZ`），两个 dmg 结尾为 `koly`（UDIF），均为结构完整的真实安装包 |

冷启动这一步值得单独验证：热缓存跑通只说明"本地有缓存时能出包"，
而新 runner 或依赖变更后的首次构建才是真正会暴露工具链下载问题的场景。

## 手动验证

`release.yml` 支持 `workflow_dispatch`。因为 `publish` job 的 `if` 要求 ref 是 tag，
手动触发的 ref 是分支，所以该 job 会跳过 ——
**只会打包并作为 workflow artifact 留存，不会创建 Release**，适合用来验证流水线本身。

```bash
gh workflow run release.yml --ref main
```

## 发版流程

```bash
# 1. 先改版本号并提交（否则 guard 会拦下）
#    编辑 package.json 的 version，例如 0.2.0
git commit -am "chore: 发布 0.2.0"

# 2. 打标签并推送
git tag v0.2.0
git push origin main --tags
```

标签推送后自动并行打包两个平台，完成后创建 Release 并附带安装包。
跑完的 Release 页面会多出：

- `Markdown Notes-<版本>-setup.exe`
- `Markdown Notes-<版本>-arm64.dmg`、`Markdown Notes-<版本>-x64.dmg`

## 代码签名（可选）

不配置也能出包，只是产物未签名。在仓库
`Settings → Secrets and variables → Actions` 添加：

| Secret | 用途 |
| --- | --- |
| `CSC_LINK` | 证书文件路径或 base64（Windows + macOS 共用） |
| `CSC_KEY_PASSWORD` | 证书密码 |
| `APPLE_ID` | macOS 公证用的 Apple ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | App 专用密码 |
| `APPLE_TEAM_ID` | 团队 ID |

工作流会在没有 `CSC_LINK` 时自动关闭签名身份探测，省掉无谓的钥匙串搜索与告警噪音。
macOS 公证还需在 `electron-builder.yml` 的 `mac` 段加 `notarize: true`
（`hardenedRuntime` 默认已开启，这是公证的前提）。
