import { unified, type Plugin, type Processor } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { ASSET_SCHEME } from '@shared/constants'
import { extractHeadings, parseFrontmatter, slugify, stripInline, type Heading } from '@shared/markdown'
import { isRelativeAsset, toAssetUrl } from '@shared/utils/asset'

/**
 * Markdown 预览流水线（方案 5.5）。
 *
 *   Markdown → remark-parse → remark-gfm → AST → remark-rehype
 *            → rehype-raw → [标题锚点/资源重写] → rehype-sanitize → HTML
 *
 * 三个安全要点：
 * 1. 内嵌 HTML 走 rehype-raw 展开后 **必须** 过 rehype-sanitize；
 * 2. 图片 src 全部重写成 notes-asset:// 自定义协议，渲染进程拿不到 file://；
 * 3. 相对链接不直接跳转，改为交给应用内部处理。
 */

// ---------------------------------------------------------------- hast 最小类型

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  value?: string
}

type HastRoot = HastNode & { type: 'root'; children: HastNode[] }

function walk(node: HastNode, visit: (node: HastNode) => void): void {
  visit(node)
  if (node.children) for (const child of node.children) walk(child, visit)
}

function textContent(node: HastNode): string {
  if (node.type === 'text') return node.value ?? ''
  if (!node.children) return ''
  return node.children.map(textContent).join('')
}

// ---------------------------------------------------------------- 自定义插件

/**
 * 给 h1–h6 补 id，供右侧大纲跳转。
 * 去重规则与 shared/markdown 的 extractHeadings 保持一致，
 * 否则大纲点击会跳不到位置。
 */
const rehypeHeadingIds: Plugin = () => (tree) => {
  const seen = new Map<string, number>()
  walk(tree as HastRoot, (node) => {
    if (node.type !== 'element') return
    const tag = node.tagName ?? ''
    if (!/^h[1-6]$/.test(tag)) return
    const base = slugify(stripInline(textContent(node)))
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    node.properties = { ...(node.properties ?? {}), id: count === 0 ? base : `${base}-${count}` }
  })
}

interface AssetOptions {
  docRelPath: string
}

/** 相对资源 → notes-asset://；相对链接 → 交给应用内部导航 */
function rehypeRewriteAssets(options: AssetOptions): Plugin {
  return () => (tree) => {
    walk(tree as HastRoot, (node) => {
      if (node.type !== 'element') return
      const props = { ...(node.properties ?? {}) }

      if (['img', 'source', 'audio', 'video'].includes(node.tagName ?? '')) {
        const src = props.src
        if (typeof src === 'string' && isRelativeAsset(src)) {
          props.src = toAssetUrl(src, options.docRelPath)
        }
      }

      if (node.tagName === 'a') {
        const href = props.href
        if (typeof href === 'string' && isRelativeAsset(href)) {
          // hast 中 data-* 属性使用驼峰命名，序列化时才是 data-note-link
          props.dataNoteLink = href
          props.href = '#'
        }
      }

      node.properties = props
    })
  }
}

// ---------------------------------------------------------------- 消毒 schema

const schema = {
  ...defaultSchema,
  // 允许我们自己的锚点 id，因此关闭默认的 user-content- 前缀，
  // 否则大纲的 #heading 会与渲染结果对不上
  clobberPrefix: '',
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'details',
    'summary',
    'kbd',
    'mark',
    'figure',
    'figcaption'
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'id', 'className'],
    a: [...(defaultSchema.attributes?.a ?? []), 'dataNoteLink', 'target', 'rel'],
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-/]],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      'src',
      'alt',
      'title',
      'width',
      'height',
      'loading'
    ],
    input: [...(defaultSchema.attributes?.input ?? []), ['type', 'checkbox'], 'checked', 'disabled'],
    td: [...(defaultSchema.attributes?.td ?? []), 'align', 'colSpan', 'rowSpan'],
    th: [...(defaultSchema.attributes?.th ?? []), 'align', 'colSpan', 'rowSpan', 'scope']
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), ASSET_SCHEME],
    href: [...(defaultSchema.protocols?.href ?? []), ASSET_SCHEME]
  }
}

// ---------------------------------------------------------------- 处理器缓存

/** unified 的 Processor 泛型链条较长，这里统一收敛成一个别名 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MarkdownProcessor = Processor<any, any, any, any, string>

const processors = new Map<string, MarkdownProcessor>()

function getProcessor(docRelPath: string): MarkdownProcessor {
  const cached = processors.get(docRelPath)
  if (cached) return cached

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeHeadingIds)
    .use(rehypeRewriteAssets({ docRelPath }))
    .use(rehypeSanitize, schema as typeof defaultSchema)
    .use(rehypeStringify, { allowDangerousHtml: false })

  processors.set(docRelPath, processor)
  return processor
}

export interface PreviewResult {
  html: string
  headings: Heading[]
}

/**
 * 预览正文剥离 YAML Frontmatter。
 *
 * 不剥的话，`---` 分隔线会被 remark 当成 setext 标题的装饰线，
 * 整段元数据就会以「大标题」的形式出现在预览顶部。
 * 元数据本身已在文档信息面板展示，预览里直接隐藏最干净。
 * 源文件不受影响 —— 只影响渲染输入。
 */
function stripFrontmatter(markdown: string): string {
  const fm = parseFrontmatter(markdown)
  if (!fm) return markdown
  return markdown.split('\n').slice(fm.bodyStartLine).join('\n')
}

export async function renderMarkdown(markdown: string, docRelPath: string): Promise<PreviewResult> {
  const headings = extractHeadings(markdown)
  const processor = getProcessor(docRelPath)
  const file = await processor.process(stripFrontmatter(markdown))
  return { html: String(file), headings }
}

/** 工作区切换时清掉按文档缓存的处理器的引用（相对路径可能重名） */
export function resetPreviewCache(): void {
  processors.clear()
}
