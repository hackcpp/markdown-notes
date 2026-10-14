import { useEffect, useRef, useState } from 'react'
import { ASSET_SCHEME } from '@shared/constants'
import { normalizeRelPath, dirnameRel, joinRel } from '@shared/utils/path'
import { api } from '../../lib/api'
import { useDocsStore } from '../../stores/docsStore'
import { openDocument } from '../documents/documents'
import { renderMarkdown } from './pipeline'

/** 预览滚动容器的 id：大纲跳转时需要定位到具体标题 */
export const PREVIEW_SCROLL_ID = 'preview-scroll'

/**
 * Markdown 预览。
 *
 * 渲染结果来自 sanitize 之后的 HTML 字符串，因此这里只做两件事：
 * 1. 拦截链接点击（外链交给系统浏览器，站内链接走应用内打开）
 * 2. 保证"最新一次渲染结果"胜出，避免快速输入时旧结果覆盖新结果
 */
export function PreviewPane(): React.JSX.Element {
  const active = useDocsStore((state) => state.active)
  const content = useDocsStore((state) =>
    state.active ? (state.content[state.active] ?? '') : ''
  )
  const [html, setHtml] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    if (!active) {
      setHtml('')
      return
    }
    const id = ++requestId.current
    let cancelled = false

    void renderMarkdown(content, active)
      .then((result) => {
        if (cancelled || id !== requestId.current) return
        setHtml(result.html)
      })
      .catch(() => {
        if (cancelled || id !== requestId.current) return
        setHtml('<p class="preview-error">预览渲染失败</p>')
      })

    return () => {
      cancelled = true
    }
  }, [content, active])

  const onClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return

    event.preventDefault()

    const noteLink = anchor.getAttribute('data-note-link')
    if (noteLink && active) {
      void followNoteLink(noteLink, active)
      return
    }

    const href = anchor.getAttribute('href') ?? ''
    if (/^(https?|mailto):/i.test(href)) {
      void api.shell.openExternal(href)
    }
  }

  return (
    <div className="preview-scroll" id={PREVIEW_SCROLL_ID}>
      <article
        className="markdown-body"
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

/**
 * 站内相对链接跳转。
 *
 * 编辑器不会因为链接解析失败而改动原文，找不到目标时只提示、不修改内容 ——
 * 这与"编辑器不得擅自改写源文件"的整体原则一致。
 */
async function followNoteLink(link: string, fromDoc: string): Promise<void> {
  const cleaned = link.split('#')[0]
  if (!cleaned) return

  const docDir = dirnameRel(fromDoc)
  const candidates: string[] = []

  const pushCandidate = (value: string): void => {
    const normalized = normalizeRelPath(value)
    if (normalized) candidates.push(normalized)
  }

  const base = cleaned.startsWith('/') ? cleaned.slice(1) : joinRel(docDir, cleaned)
  pushCandidate(base)
  if (!/\.[a-z0-9]+$/i.test(base)) pushCandidate(`${base}.md`)

  for (const candidate of candidates) {
    const exists = await api.documents
      .read(candidate)
      .then(() => true)
      .catch(() => false)
    if (exists) {
      await openDocument(candidate)
      return
    }
  }
}

export { ASSET_SCHEME }
