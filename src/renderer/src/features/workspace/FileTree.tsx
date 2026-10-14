import { useState } from 'react'
import type { FileNode } from '@shared/types'
import { basenameRel, dirnameRel, extnameRel } from '@shared/utils/path'
import { Icon } from '../../components/Icons'
import { useAppStore } from '../../stores/appStore'
import { useDocsStore } from '../../stores/docsStore'
import { openDocument } from '../documents/documents'
import { createFolder, createNote, deleteEntry, renameEntry, revealEntry } from './fileOperations'

interface TreeNodeProps {
  node: FileNode
  depth: number
}

/** 单个文件 / 文件夹行 */
function TreeNode({ node, depth }: TreeNodeProps): React.JSX.Element {
  const expanded = useAppStore((state) => Boolean(state.expanded[node.relPath]))
  const selected = useAppStore((state) => state.selected === node.relPath)
  const isActive = useDocsStore((state) => state.active === node.relPath)
  const status = useDocsStore((state) =>
    node.kind === 'file' ? state.docs[node.relPath]?.status : undefined
  )
  const toggleExpanded = useAppStore((state) => state.toggleExpanded)
  const setSelected = useAppStore((state) => state.setSelected)
  const openContextMenu = useAppStore((state) => state.openContextMenu)
  const [hovered, setHovered] = useState(false)

  const isDirectory = node.kind === 'directory'
  const dirty = status === 'dirty' || status === 'saving'
  const failed = status === 'error' || status === 'conflict' || status === 'missing'

  const handleClick = (): void => {
    setSelected(node.relPath)
    if (isDirectory) toggleExpanded(node.relPath)
    else void openDocument(node.relPath)
  }

  const handleContextMenu = async (event: React.MouseEvent): Promise<void> => {
    event.preventDefault()
    event.stopPropagation()
    setSelected(node.relPath)

    const items = isDirectory
      ? [
          { id: 'newNote', label: '在此新建笔记' },
          { id: 'newFolder', label: '在此新建文件夹' },
          { id: 'reveal', label: '在文件管理器中显示', separatorBefore: true },
          { id: 'rename', label: '重命名 / 移动…' },
          { id: 'remove', label: '删除', danger: true }
        ]
      : [
          { id: 'open', label: '打开' },
          { id: 'newNote', label: '在同目录新建笔记' },
          { id: 'reveal', label: '在文件管理器中显示', separatorBefore: true },
          { id: 'copyPath', label: '复制相对路径' },
          { id: 'rename', label: '重命名 / 移动…' },
          { id: 'remove', label: '删除', danger: true }
        ]

    const action = await openContextMenu(event.clientX, event.clientY, items)
    if (!action) return

    switch (action) {
      case 'open':
        await openDocument(node.relPath)
        break
      case 'newNote':
        await createNote(isDirectory ? node.relPath : dirnameRel(node.relPath))
        break
      case 'newFolder':
        await createFolder(isDirectory ? node.relPath : dirnameRel(node.relPath))
        break
      case 'reveal':
        await revealEntry(node.relPath)
        break
      case 'copyPath':
        await navigator.clipboard.writeText(node.relPath)
        useAppStore.getState().toast('已复制相对路径', 'success')
        break
      case 'rename':
        await renameEntry(node.relPath, isDirectory)
        break
      case 'remove':
        await deleteEntry(node.relPath, isDirectory)
        break
      default:
        break
    }
  }

  return (
    <>
      <div
        className={`tree-row${selected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleClick}
        onContextMenu={(event) => void handleContextMenu(event)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        role="treeitem"
        aria-expanded={isDirectory ? expanded : undefined}
        aria-selected={selected}
        title={node.relPath}
      >
        <span className="tree-chevron">
          {isDirectory && <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} />}
        </span>

        <span className={`tree-icon kind-${node.kind}`}>
          <Icon
            name={
              isDirectory
                ? expanded
                  ? 'folderOpen'
                  : 'folder'
                : extnameRel(node.name) === '.md'
                  ? 'fileCode'
                  : 'file'
            }
            size={15}
          />
        </span>

        <span className="tree-label">{node.name}</span>

        {failed && (
          <span className="tree-badge is-error" title="保存失败">
            <Icon name="alert" size={12} />
          </span>
        )}
        {dirty && <span className="tree-dot" title="有未保存的修改" />}
        {hovered && isDirectory && (
          <button
            type="button"
            className="tree-action"
            title="在此新建笔记"
            onClick={(event) => {
              event.stopPropagation()
              void createNote(node.relPath)
            }}
          >
            <Icon name="plus" size={13} />
          </button>
        )}
      </div>

      {isDirectory &&
        expanded &&
        node.children?.map((child) => (
          <TreeNode key={child.relPath} node={child} depth={depth + 1} />
        ))}
    </>
  )
}

export function FileTree(): React.JSX.Element {
  const tree = useAppStore((state) => state.tree)
  const workspace = useAppStore((state) => state.workspace)
  const loading = useAppStore((state) => state.treeLoading)

  if (!workspace) {
    return <div className="sidebar-empty">未打开工作区</div>
  }

  if (tree.length === 0) {
    return (
      <div className="sidebar-empty">
        {loading ? '正在扫描目录…' : '这个目录里还没有 Markdown 笔记'}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void createNote('')}
        >
          新建第一篇笔记
        </button>
      </div>
    )
  }

  return (
    <div className="file-tree" role="tree" aria-label="工作区文件">
      {tree.map((node) => (
        <TreeNode key={node.relPath} node={node} depth={0} />
      ))}
    </div>
  )
}

export { basenameRel }
