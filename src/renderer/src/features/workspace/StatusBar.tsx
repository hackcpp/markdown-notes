import { formatClock } from '@shared/utils/text'
import { Icon } from '../../components/Icons'
import { useAppStore } from '../../stores/appStore'
import { useCaretStore } from '../../stores/caretStore'
import { useDocsStore } from '../../stores/docsStore'
import { saveController } from '../documents/documents'

/**
 * 底部状态栏。
 *
 * 方案里明确要求"用状态信息代替频繁弹窗"：保存状态、行列、编码、换行
 * 这些信息常驻在状态栏，用户不需要被打断。
 */
export function StatusBar(): React.JSX.Element {
  const active = useDocsStore((state) => state.active)
  const meta = useDocsStore((state) => (state.active ? state.docs[state.active] : undefined))
  const caret = useCaretStore((state) => state.info)
  const settings = useAppStore((state) => state.settings)
  const setFontSize = useAppStore((state) => state.setFontSize)
  const toast = useAppStore((state) => state.toast)

  const workspace = useAppStore((state) => state.workspace)
  const docCount = useDocsStore((state) => state.order.length)

  const saveText = ((): { text: string; className: string } => {
    if (!meta) return { text: '本地工作区', className: '' }
    switch (meta.status) {
      case 'saving':
        return { text: '正在保存…', className: 'is-warn' }
      case 'dirty':
        return { text: '有未保存的修改', className: 'is-warn' }
      case 'error':
        return { text: meta.errorText ?? '保存失败', className: 'is-error' }
      case 'conflict':
        return { text: '文件已被外部修改', className: 'is-error' }
      case 'missing':
        return { text: '文件已被外部删除或移动', className: 'is-error' }
      default:
        return {
          text: meta.lastSavedAt ? `已保存 · ${formatClock(meta.lastSavedAt)}` : '已保存',
          className: 'is-ok'
        }
    }
  })()

  return (
    <footer className="status-bar">
      <div className="status-group">
        <span className={`status-item ${saveText.className}`} title={meta?.errorText ?? ''}>
          <Icon
            name={saveText.className === 'is-error' ? 'alert' : saveText.className === 'is-warn' ? 'edit' : 'check'}
            size={12}
          />
          {saveText.text}
        </span>
        <button
          type="button"
          className="status-item status-button"
          title="立即保存当前笔记 (Ctrl+S)"
          onClick={() => {
            if (!active) return
            void saveController.flush(active)
          }}
          disabled={!active}
        >
          <Icon name="save" size={12} />
          保存
        </button>
      </div>

      <div className="status-group status-group-center">
        {workspace && (
          <span className="status-item" title={workspace.rootPath}>
            <Icon name="folder" size={12} />
            {workspace.name}
            {docCount > 0 && <span className="status-dim">· {docCount} 个标签页</span>}
          </span>
        )}
        {meta && (
          <span className="status-item status-dim" title={meta.relPath}>
            {meta.relPath}
          </span>
        )}
      </div>

      <div className="status-group">
        <span className="status-item" title="光标位置">
          行 {caret?.line ?? 1}，列 {caret?.column ?? 1}
        </span>
        {caret && caret.selectedChars > 0 && (
          <span className="status-item status-dim">选中 {caret.selectedChars} 字符</span>
        )}
        {caret && <span className="status-item status-dim">共 {caret.totalLines} 行</span>}
        <span className="status-item status-dim" title="编码">
          UTF-8
        </span>
        <span className="status-item status-dim" title="换行符">
          {meta?.eol === '\r\n' ? 'CRLF' : 'LF'}
        </span>
        <span className="status-item status-dim" title="Markdown 方言：CommonMark + GFM">
          Markdown
        </span>

        <div className="status-font">
          <button
            type="button"
            className="status-button"
            title="缩小字号"
            onClick={() => setFontSize(settings.fontSize - 1)}
          >
            A-
          </button>
          <span className="status-dim">{settings.fontSize}px</span>
          <button
            type="button"
            className="status-button"
            title="放大字号"
            onClick={() => setFontSize(settings.fontSize + 1)}
          >
            A+
          </button>
        </div>

        <button
          type="button"
          className="status-button"
          title="显示 / 隐藏行号"
          onClick={() => {
            const next = !settings.showLineNumbers
            useAppStore.getState().updateSettings({ showLineNumbers: next })
            toast(`行号已${next ? '显示' : '隐藏'}`, 'info')
          }}
        >
          #
        </button>
      </div>
    </footer>
  )
}
