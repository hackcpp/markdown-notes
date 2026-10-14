import { basenameRel } from '@shared/utils/path'
import { Icon } from '../../components/Icons'
import { useAppStore } from '../../stores/appStore'

/** 未打开工作区时的欢迎页（方案 3.4 场景 A） */
export function Welcome(): React.JSX.Element {
  const openWorkspaceDialog = useAppStore((state) => state.openWorkspaceDialog)
  const openWorkspacePath = useAppStore((state) => state.openWorkspacePath)
  const recents = useAppStore((state) => state.recentWorkspaces)
  const busy = useAppStore((state) => state.treeLoading)
  const bootError = useAppStore((state) => state.bootError)

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-logo">
          <Icon name="fileCode" size={34} />
        </div>
        <h1>Markdown Notes</h1>
        <p className="welcome-sub">
          本地优先的 Markdown 笔记软件 · 原文件就是你的数据，没有任何私有格式
        </p>

        {bootError && (
          <div className="welcome-error">
            <Icon name="alert" size={14} />
            <span>启动时遇到问题：{bootError}</span>
          </div>
        )}

        <div className="welcome-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={busy}
            onClick={() => void openWorkspaceDialog()}
          >
            <Icon name="folderOpen" size={16} />
            打开 Markdown 文件夹
          </button>
          <span className="welcome-hint">
            选择一个已有笔记目录，或新建一个空目录作为工作区。软件不会移动、重命名或改写你的任何文件。
          </span>
        </div>

        {recents.length > 0 && (
          <div className="welcome-recents">
            <h2>最近打开</h2>
            <ul>
              {recents.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    className="recent-item"
                    title={path}
                    onClick={() => void openWorkspacePath(path)}
                  >
                    <Icon name="folder" size={15} />
                    <span className="recent-name">{basenameRel(path) || path}</span>
                    <span className="recent-path">{path}</span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="welcome-features">
          <li>
            <Icon name="check" size={13} /> CodeMirror 6 源码编辑 + 实时预览
          </li>
          <li>
            <Icon name="check" size={13} /> 自动保存、冲突检测与崩溃恢复
          </li>
          <li>
            <Icon name="check" size={13} /> 多标签页、大纲、Frontmatter 标签
          </li>
        </ul>
      </div>
    </div>
  )
}
