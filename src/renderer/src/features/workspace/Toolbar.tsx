import { Icon } from '../../components/Icons'
import { useAppStore } from '../../stores/appStore'
import { useDocsStore } from '../../stores/docsStore'
import { openDocument } from '../documents/documents'
import { editorHost } from '../editor/editorHost'
import { FORMAT_COMMANDS } from '../editor/format'

/** 顶部工具区：只放全局动作，保持简洁 */
export function Toolbar(): React.JSX.Element {
  const workspace = useAppStore((state) => state.workspace)
  const settings = useAppStore((state) => state.settings)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const toggleOutline = useAppStore((state) => state.toggleOutline)
  const cycleTheme = useAppStore((state) => state.cycleTheme)
  const toggleFocus = useAppStore((state) => state.toggleFocusMode)
  const focusMode = useAppStore((state) => state.focusMode)
  const openWorkspaceDialog = useAppStore((state) => state.openWorkspaceDialog)
  const setShortcutsOpen = useAppStore((state) => state.setShortcutsOpen)

  const themeIcon = settings.theme === 'system' ? 'monitor' : settings.theme === 'dark' ? 'moon' : 'sun'
  const themeLabel = { light: '浅色', dark: '深色', system: '跟随系统' }[settings.theme]

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button
          type="button"
          className={`icon-btn${settings.sidebarVisible ? ' is-on' : ''}`}
          title="文件侧边栏 (Ctrl+Shift+B)"
          onClick={toggleSidebar}
        >
          <Icon name="listTree" size={16} />
        </button>
        <button
          type="button"
          className="toolbar-workspace"
          title={workspace?.rootPath ?? '打开工作区'}
          onClick={() => void openWorkspaceDialog()}
        >
          <Icon name="folderOpen" size={14} />
          <span>{workspace?.name ?? '打开工作区'}</span>
          <Icon name="chevronDown" size={13} />
        </button>
      </div>

      <div className="toolbar-group toolbar-group-center">
        <ViewModeSwitch />
      </div>

      <div className="toolbar-group">
        <button
          type="button"
          className="icon-btn"
          title={`主题：${themeLabel}（Ctrl+Shift+L 切换）`}
          onClick={cycleTheme}
        >
          <Icon name={themeIcon} size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn${focusMode ? ' is-on' : ''}`}
          title="专注模式 (Ctrl+Shift+D)"
          onClick={toggleFocus}
        >
          <Icon name="focus" size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn${settings.outlineVisible ? ' is-on' : ''}`}
          title="大纲面板 (Ctrl+Shift+U)"
          onClick={toggleOutline}
        >
          <Icon name="columns" size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="快捷键一览 (Ctrl+/)"
          onClick={() => setShortcutsOpen(true)}
        >
          <Icon name="keyboard" size={16} />
        </button>
        <SaveIndicator />
      </div>
    </header>
  )
}

function ViewModeSwitch(): React.JSX.Element {
  const viewMode = useAppStore((state) => state.settings.viewMode)
  const setViewMode = useAppStore((state) => state.setViewMode)
  const options: Array<{ id: 'source' | 'split' | 'preview'; icon: string; label: string; hint: string }> = [
    { id: 'source', icon: 'code', label: '源码', hint: '只显示编辑器 (Ctrl+Alt+1)' },
    { id: 'split', icon: 'columns', label: '分屏', hint: '编辑 + 预览 (Ctrl+Alt+2)' },
    { id: 'preview', icon: 'eye', label: '预览', hint: '只显示预览 (Ctrl+Alt+3)' }
  ]

  return (
    <div className="segmented" role="group" aria-label="视图模式">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`segmented-item${viewMode === option.id ? ' is-active' : ''}`}
          title={option.hint}
          aria-pressed={viewMode === option.id}
          onClick={() => setViewMode(option.id)}
        >
          <Icon name={option.icon} size={14} />
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}

/** 保存状态指示：用状态信息代替频繁弹窗 */
function SaveIndicator(): React.JSX.Element | null {
  const active = useDocsStore((state) => state.active)
  const meta = useDocsStore((state) => (state.active ? state.docs[state.active] : undefined))

  if (!active || !meta) return null

  const map: Record<string, { icon: string; text: string; className: string }> = {
    clean: { icon: 'check', text: '已保存', className: 'is-ok' },
    dirty: { icon: 'edit', text: '未保存', className: 'is-warn' },
    saving: { icon: 'save', text: '保存中', className: 'is-warn' },
    error: { icon: 'alert', text: '保存失败', className: 'is-error' },
    conflict: { icon: 'alert', text: '存在冲突', className: 'is-error' },
    missing: { icon: 'alert', text: '文件已丢失', className: 'is-error' }
  }

  const info = map[meta.status] ?? map.clean

  return (
    <span className={`save-indicator ${info.className}`} title={meta.errorText ?? meta.relPath}>
      <Icon name={info.icon} size={13} />
      <span>{info.text}</span>
    </span>
  )
}

/**
 * 格式工具栏。
 *
 * 命令本身在 features/editor/format.ts 里实现，工具栏只负责派发，
 * 保证"按钮"和"快捷键"走的是同一条代码路径。
 */
export function FormatBar(): React.JSX.Element | null {
  const active = useDocsStore((state) => state.active)
  if (!active) return null

  return (
    <div className="format-bar">
      {FORMAT_COMMANDS.map((command) => (
        <button
          key={command.id}
          type="button"
          className="format-btn"
          title={command.shortcut ? `${command.hint}（${command.shortcut}）` : command.hint}
          onClick={() => editorHost.format(command.id)}
        >
          {command.label}
        </button>
      ))}
      <span className="format-bar-spacer" />
      <button
        type="button"
        className="format-btn"
        title="在当前文档中查找与替换 (Ctrl+H)"
        onClick={() => editorHost.openFind(true)}
      >
        查找
      </button>
    </div>
  )
}

/** 供文件树"最近文件"使用：打开第一个笔记，作为空工作区的快捷入口 */
export async function openFirstNote(): Promise<void> {
  const tree = useAppStore.getState().tree
  const first = findFirstFile(tree)
  if (first) await openDocument(first)
}

function findFirstFile(nodes: ReturnType<typeof useAppStore.getState>['tree']): string | null {
  for (const node of nodes) {
    if (node.kind === 'file') return node.relPath
    if (node.children) {
      const nested = findFirstFile(node.children)
      if (nested) return nested
    }
  }
  return null
}
