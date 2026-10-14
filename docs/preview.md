# Markdown 预览

实现位于 `src/renderer/src/features/preview/pipeline.ts`。
预览不是"把 Markdown 变成 HTML"这么简单 —— 它同时是应用里最需要设防的入口。

## 流水线

```
Markdown 文本
  → remark-parse          解析为 mdast
  → remark-gfm            表格、任务列表、删除线、自动链接
  → remark-rehype         转为 hast（allowDangerousHtml: true）
  → rehype-raw            展开内嵌 HTML
  → rehypeHeadingIds      给 h1–h6 补锚点 id
  → rehypeRewriteAssets   相对资源/链接重写
  → rehype-sanitize       消毒（核心防线）
  → rehype-stringify      输出 HTML 字符串
```

三个安全要点：

1. 内嵌 HTML 经 `rehype-raw` 展开后**必须**过 `rehype-sanitize`；
2. 图片 `src` 全部重写成 `notes-asset://`，渲染进程拿不到 `file://`；
3. 相对链接不直接跳转，改由应用内部处理。

## 标题锚点

`rehypeHeadingIds` 给每个标题补 `id`，供右侧大纲点击跳转。

它的去重规则与 `shared/markdown` 里的 `extractHeadings()` **必须保持一致**，
否则大纲上的条目会与渲染结果的锚点对不上，点击跳不到位置。
两处都按 `slugify(stripInline(纯文本))` 生成，重复项依次追加 `-1`、`-2`。

## 资源重写

| 节点 | 处理 |
| --- | --- |
| `img` / `source` / `audio` / `video` 的相对 `src` | 重写为 `notes-asset://asset/?p=<相对路径>` |
| `a` 的相对 `href` | 写入 `data-note-link`，同时把 `href` 置为 `#` |

第二行意味着点击稿件内的相对链接**不会**让窗口导航走，而是留给应用做内部跳转。
绝对 URL（`http` / `https` / `mailto`）保持不变，点击时由主进程的
`setWindowOpenHandler` 交给系统浏览器。

> 注意：hast 里 `data-*` 属性使用驼峰命名（`dataNoteLink`），序列化后才变回 `data-note-link`。
> 消毒白名单里也必须按驼峰写，否则属性会被过滤掉。

## 消毒策略

基于 `rehype-sanitize` 的 `defaultSchema`，做三处调整：

**1. 关闭 `user-content-` 前缀**

```
clobberPrefix: ''
```

默认 schema 会给 `id` 加前缀防跨文档污染，但那会让大纲的 `#heading` 与渲染结果对不上。
应用是单文档预览，不存在该风险。

**2. 扩充标签与属性白名单**

- 追加标签：`details`、`summary`、`kbd`、`mark`、`figure`、`figcaption`
- 允许所有元素带 `id` 与 `className`
- `code` 只允许形如 `language-xxx` 的 class
- `input` 仅允许 `type="checkbox"`（GFM 任务列表）及 `checked` / `disabled`
- `td` / `th` 允许 `align` / `colSpan` / `rowSpan` / `scope`
- `img` 允许 `src` / `alt` / `title` / `width` / `height` / `loading`
- `a` 允许 `dataNoteLink` / `target` / `rel`

**3. 只给自定义协议开口子**

```
protocols: { src: [...默认, 'notes-asset'], href: [...默认, 'notes-asset'] }
```

`javascript:` 之类的协议不在名单内，会被直接剥掉。

最终 `rehype-stringify` 以 `allowDangerousHtml: false` 输出。

## Frontmatter 的处理

预览正文前会先剥离 YAML Frontmatter。

不剥的话，`---` 分隔线会被 remark 当成 setext 标题的装饰线，
整段元数据就以"大标题"的形式出现在预览顶部。
元数据本身已在文档信息面板展示，预览里直接隐藏最干净。

**只影响渲染输入，源文件不受影响。**

## 处理器缓存

unified 的处理器链构建成本不低，因此按**文档相对路径**缓存。
缓存键必须是相对路径而非绝对路径，因为资源重写依赖它。

切换工作区时调用 `resetPreviewCache()` 清空 —— 不同工作区可能存在同名相对路径。

## 节流

预览重解析由编辑器侧的镜像按 `PREVIEW_THROTTLE_MS`（140ms）节流触发，
而不是每次按键都跑一遍。长文档下这是必要的：
完整跑一次 unified 流水线的开销远高于一次文本变更。
