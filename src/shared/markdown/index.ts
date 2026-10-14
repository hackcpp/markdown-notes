/**
 * 轻量 Markdown 结构解析：标题大纲、YAML Frontmatter、标签。
 * 这里刻意不引入 unified —— 这些信息需要在输入时高频重算，
 * 用一个单次线性扫描的实现比走完整 AST 便宜得多。
 * 预览渲染仍然走 unified 流水线（见 features/preview/pipeline.ts）。
 */

export interface Heading {
  level: number
  /** 去掉行内标记后的纯文本 */
  text: string
  /** 从 0 开始的行号，用于编辑器定位 */
  line: number
  slug: string
  /** 在当前文档内的序号（同 slug 重复时用于生成唯一 id） */
  index: number
}

export interface Frontmatter {
  /** 原始文本（不含首尾 ---），用于判断是否需要回写 */
  raw: string
  attrs: Record<string, string | string[]>
  /** 正文起始行号 */
  bodyStartLine: number
}

const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/
const ATX_RE = /^ {0,3}(#{1,6})(\s+.*?)?\s*$/

/**
 * 提取标题大纲。会跳过围栏代码块内部的 "# 注释" 这类伪标题。
 */
export function extractHeadings(markdown: string): Heading[] {
  const lines = markdown.split('\n')
  const headings: Heading[] = []
  const slugCount = new Map<string, number>()
  let fence: { char: string; size: number } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[2]
      if (fence === null) {
        fence = { char: marker[0], size: marker.length }
      } else if (marker[0] === fence.char && marker.length >= fence.size) {
        fence = null
      }
      continue
    }
    if (fence) continue

    const m = ATX_RE.exec(line)
    if (!m) continue
    // 形如 "#标签" 不是标题
    if (!m[2] && m[1].length > 0) {
      const rest = line.slice(m[1].length)
      if (rest.trim() && !rest.startsWith(' ')) continue
    }
    const text = stripInline(m[2]?.trim() ?? '')
    if (text.length === 0) continue
    const base = slugify(text)
    const n = slugCount.get(base) ?? 0
    slugCount.set(base, n + 1)
    headings.push({
      level: m[1].length,
      text,
      line: i,
      slug: n === 0 ? base : `${base}-${n}`,
      index: headings.length
    })
  }
  return headings
}

/** 去掉标题里的行内 Markdown 标记，得到用于显示与生成锚点的纯文本 */
export function stripInline(text: string): string {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
}

/** 生成锚点 id：保留中文，其余转小写、空白转连字符 */
export function slugify(text: string): string {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/[`"'“”‘’]/g, '')
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return s || 'section'
}

/**
 * 解析 YAML Frontmatter。
 * 只做"够用"的解析：键值对 + 内联数组 + 简单的 - 列表，不引入完整 YAML 依赖。
 * 解析失败时返回 null，调用方应保留原文。
 */
export function parseFrontmatter(markdown: string): Frontmatter | null {
  if (!markdown.startsWith('---')) return null
  const lines = markdown.split('\n')
  if (lines[0].trim() !== '---') return null
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t === '---' || t === '...') {
      end = i
      break
    }
  }
  if (end < 0) return null

  const raw = lines.slice(1, end).join('\n')
  const attrs: Record<string, string | string[]> = {}
  let currentKey: string | null = null

  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const listItem = /^\s*-\s+(.*)$/.exec(line)
    if (listItem && currentKey) {
      const existing = attrs[currentKey]
      const value = unquote(listItem[1].trim())
      if (Array.isArray(existing)) existing.push(value)
      else attrs[currentKey] = [value]
      continue
    }
    const kv = /^([A-Za-z0-9_\-.]+)\s*:\s*(.*)$/.exec(line)
    if (!kv) {
      currentKey = null
      continue
    }
    currentKey = kv[1]
    const rawValue = kv[2].trim()
    if (rawValue === '') {
      // 可能是下一行的 - 列表
      attrs[currentKey] = []
      continue
    }
    attrs[currentKey] = parseScalar(rawValue)
  }

  // 指向 Frontmatter 之后的正文首行：跳过紧随其后的空行，便于光标定位
  let bodyStart = end + 1
  while (bodyStart < lines.length && lines[bodyStart].trim() === '') bodyStart++
  return { raw, attrs, bodyStartLine: bodyStart }
}

function parseScalar(value: string): string | string[] {
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((v) => unquote(v.trim()))
      .filter((v) => v.length > 0)
  }
  return unquote(value)
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1)
    }
  }
  return value
}

/** 读取 Frontmatter 中的标签（兼容 tags / tag，字符串或数组） */
export function extractTags(markdown: string): string[] {
  const fm = parseFrontmatter(markdown)
  if (!fm) return []
  const raw = fm.attrs['tags'] ?? fm.attrs['tag'] ?? fm.attrs['Tags']
  const list = Array.isArray(raw) ? raw : raw ? String(raw).split(/[,，\s]+/) : []
  const out = new Set<string>()
  for (const item of list) {
    const tag = item.replace(/^#/, '').trim()
    if (tag) out.add(tag)
  }
  return [...out]
}

/** 取文档标题：优先第一个 H1，其次 Frontmatter.title，最后回退到文件名 */
export function extractTitle(markdown: string, fallback: string): string {
  const h1 = extractHeadings(markdown).find((h) => h.level === 1)
  if (h1) return h1.text
  const fm = parseFrontmatter(markdown)
  const title = fm?.attrs['title']
  if (typeof title === 'string' && title.trim()) return title.trim()
  return fallback
}

/** 用于左侧文件树/标签页的显示名 */
export function displayTitle(markdown: string, relPath: string): string {
  const h1 = extractHeadings(markdown).find((h) => h.level === 1)
  if (h1) return h1.text
  const base = relPath.split('/').pop() ?? relPath
  return base.replace(/\.[^.]+$/, '') || relPath
}

/** 生成新笔记的初始内容骨架 */
export function newNoteTemplate(title: string, now = new Date()): string {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`
  return `---
created: ${date}
tags: []
---

# ${title}

`
}
