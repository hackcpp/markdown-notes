import { useMemo } from 'react'
import { extractHeadings, extractTags } from '@shared/markdown'
import { countStats, formatRelativeTime } from '@shared/utils/text'
import { Icon } from '../../components/Icons'
import { useDocsStore } from '../../stores/docsStore'
import { useAppStore } from '../../stores/appStore'
import { editorHost } from '../editor/editorHost'
import { PREVIEW_SCROLL_ID } from '../preview/PreviewPane'

/**
 * 右侧面板：文档大纲 + 文档信息。
 *
 * 大纲直接复用 shared/markdown 的标题提取（与预览的锚点生成规则一致），
 * 因此点击大纲既能定位编辑器行，也能滚动预览到对应标题。
 */
export function OutlinePanel(): React.JSX.Element {
  const active = useDocsStore((state) => state.active)
  const content = useDocsStore((state) => (state.active ? (state.content[state.active] ?? '') : ''))
  const meta = useDocsStore((state) => (state.active ? state.docs[state.active] : undefined))
  const outlineWidth = useAppStore((state) => state.settings.outlineWidth)

  const headings = useMemo(() => extractHeadings(content), [content])
  const tags = useMemo(() => extractTags(content), [content])
  const stats = useMemo(() => countStats(content), [content])

  if (!active || !meta) {
    return (
      <aside className="outline-panel" style={{ width: outlineWidth }} aria-label="文档面板">
        <div className="panel-section">
          <h3 className="panel-title">文档</h3>
          <p className="panel-empty">没有打开的笔记</p>
        </div>
      </aside>
    )
  }

  const goToHeading = (line: number, slug: string): void => {
    editorHost.scrollToLine(active, line)
    const container = document.getElementById(PREVIEW_SCROLL_ID)
    if (!container) return
    const target = container.querySelector(`#${CSS.escape(slug)}`)
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <aside className="outline-panel" style={{ width: outlineWidth }} aria-label="文档面板">
      <div className="panel-section">
        <h3 className="panel-title">大纲</h3>
        {headings.length === 0 ? (
          <p className="panel-empty">用 # 标题即可生成大纲</p>
        ) : (
          <ul className="outline-list">
            {headings.map((heading) => (
              <li key={`${heading.line}-${heading.slug}`}>
                <button
                  type="button"
                  className={`outline-item level-${heading.level}`}
                  style={{ paddingLeft: 8 + (heading.level - 1) * 12 }}
                  onClick={() => goToHeading(heading.line, heading.slug)}
                  title={`第 ${heading.line + 1} 行`}
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel-section">
        <h3 className="panel-title">文档信息</h3>
        <dl className="info-list">
          <div>
            <dt>路径</dt>
            <dd title={meta.relPath}>{meta.relPath}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd className="info-status">
              <StatusLabel status={meta.status} />
            </dd>
          </div>
          <div>
            <dt>换行</dt>
            <dd>{meta.eol === '\r\n' ? 'CRLF' : 'LF'}</dd>
          </div>
          <div>
            <dt>编码</dt>
            <dd>UTF-8{meta.hasBom ? '（BOM）' : ''}</dd>
          </div>
          <div>
            <dt>字符</dt>
            <dd>{stats.chars.toLocaleString()}</dd>
          </div>
          <div>
            <dt>行数</dt>
            <dd>{stats.lines.toLocaleString()}</dd>
          </div>
          <div>
            <dt>磁盘修改</dt>
            <dd>{formatRelativeTime(meta.mtimeMs)}</dd>
          </div>
        </dl>

        <h3 className="panel-title panel-title-sub">标签</h3>
        {tags.length === 0 ? (
          <p className="panel-empty">
            在 Frontmatter 中写 <code>tags: [AI, 笔记]</code> 即可
          </p>
        ) : (
          <div className="tag-cloud">
            {tags.map((tag) => (
              <span key={tag} className="tag-chip">
                <Icon name="tag" size={11} />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function StatusLabel({ status }: { status: string }): React.JSX.Element {
  const map: Record<string, [string, string]> = {
    clean: ['已保存', 'is-ok'],
    dirty: ['未保存', 'is-warn'],
    saving: ['保存中', 'is-warn'],
    error: ['保存失败', 'is-error'],
    conflict: ['存在冲突', 'is-error'],
    missing: ['文件已丢失', 'is-error']
  }
  const [label, className] = map[status] ?? ['未知', '']
  return <span className={`status-chip ${className}`}>{label}</span>
}
