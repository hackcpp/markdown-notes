import { Icon } from '../../components/Icons'
import { useAppStore } from '../../stores/appStore'
import { createFolder, createNote } from './fileOperations'
import { FileTree } from './FileTree'
import { NavRail } from './NavRail'

/**
 * 左侧区域：导航条 + 文件树。
 * 侧边栏宽度由外层拖拽控制，这里只负责内容与顶部操作区。
 */
export function Sidebar(): React.JSX.Element {
  const view = useAppStore((state) => state.sidebarView)
  const workspace = useAppStore((state) => state.workspace)
  const refreshTree = useAppStore((state) => state.refreshTree)
  const sidebarWidth = useAppStore((state) => state.settings.sidebarWidth)

  return (
    <div className="sidebar" style={{ width: sidebarWidth }}>
      <NavRail />

      <div className="sidebar-body">
        <header className="sidebar-header">
          <div className="sidebar-title" title={workspace?.rootPath ?? ''}>
            <Icon name="folderOpen" size={14} />
            <span>{workspace?.name ?? '未打开工作区'}</span>
          </div>
          <div className="sidebar-header-actions">
            <button
              type="button"
              className="icon-btn"
              title="新建笔记 (Ctrl+N)"
              onClick={() => void createNote('')}
            >
              <Icon name="filePlus" size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="新建文件夹 (Ctrl+Shift+N)"
              onClick={() => void createFolder('')}
            >
              <Icon name="folderPlus" size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="重新扫描工作区 (Ctrl+Shift+R)"
              onClick={() => void refreshTree()}
            >
              <Icon name="refresh" size={15} />
            </button>
          </div>
        </header>

        <div className="sidebar-content">
          {view === 'files' && <FileTree />}
          {view !== 'files' && (
            <div className="sidebar-empty">
              {view === 'search' ? '全文搜索' : '标签筛选'}将在 V1.0 里程碑提供
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
