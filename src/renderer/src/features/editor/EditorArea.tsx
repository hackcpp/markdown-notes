import { useAppStore } from '../../stores/appStore'
import { useDocsStore } from '../../stores/docsStore'
import { EditorPane } from './EditorPane'
import { PreviewPane } from '../preview/PreviewPane'

/**
 * 编辑 / 预览区域。
 *
 * 三种模式共用同一个编辑器 DOM：切到"仅预览"时编辑器只是被隐藏，
 * 而不是卸载 —— 否则会丢失 CodeMirror 的测量状态与滚动位置。
 */
export function EditorArea(): React.JSX.Element {
  const viewMode = useAppStore((state) => state.settings.viewMode)
  const active = useDocsStore((state) => state.active)

  return (
    <div className={`editor-area mode-${viewMode}`}>
      <div className={`pane pane-editor${viewMode === 'preview' ? ' is-hidden' : ''}`}>
        <EditorPane />
      </div>

      {viewMode !== 'source' && <div className="pane-divider" />}

      {viewMode !== 'source' && (
        <div className="pane pane-preview">
          <PreviewPane />
        </div>
      )}

      {!active && (
        <div className="editor-placeholder">
          <p>没有打开的笔记</p>
          <p className="editor-placeholder-hint">
            在左侧文件树中选择一篇，或按 <kbd>Ctrl</kbd> + <kbd>N</kbd> 新建
          </p>
        </div>
      )}
    </div>
  )
}
