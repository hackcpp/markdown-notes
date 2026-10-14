import { basenameRel } from '@shared/utils/path'
import { Icon } from '../../components/Icons'
import { useDocsStore } from '../../stores/docsStore'
import { editorHost } from '../editor/editorHost'
import { closeDocument } from '../documents/documents'

function Tab({ relPath }: { relPath: string }): React.JSX.Element {
  const meta = useDocsStore((state) => state.docs[relPath])
  const isActive = useDocsStore((state) => state.active === relPath)
  const setActive = useDocsStore((state) => state.setActive)

  if (!meta) return <span />

  const activate = (): void => {
    setActive(relPath)
    editorHost.activate(relPath)
    editorHost.focus()
  }

  return (
    <div
      className={`tab${isActive ? ' is-active' : ''}`}
      role="tab"
      aria-selected={isActive}
      title={`${meta.relPath}\n${meta.status === 'clean' ? '已保存' : '有未保存的修改'}`}
      onClick={activate}
      onAuxClick={(event) => {
        // 中键关闭，符合主流编辑器习惯
        if (event.button === 1) {
          event.preventDefault()
          void closeDocument(relPath)
        }
      }}
    >
      {meta.status === 'error' || meta.status === 'conflict' || meta.status === 'missing' ? (
        <span className="tab-status is-error">
          <Icon name="alert" size={12} />
        </span>
      ) : meta.status === 'dirty' || meta.status === 'saving' ? (
        <span className="tab-status is-dirty" />
      ) : (
        <span className="tab-status" />
      )}

      <span className="tab-label">{meta.title || basenameRel(relPath)}</span>

      <button
        type="button"
        className="tab-close"
        title="关闭标签页 (Ctrl+W)"
        onClick={(event) => {
          event.stopPropagation()
          void closeDocument(relPath)
        }}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  )
}

export function TabBar(): React.JSX.Element | null {
  const order = useDocsStore((state) => state.order)
  if (order.length === 0) return null

  return (
    <div className="tab-bar" role="tablist">
      {order.map((relPath) => (
        <Tab key={relPath} relPath={relPath} />
      ))}
    </div>
  )
}
