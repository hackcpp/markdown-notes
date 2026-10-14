import { extnameRel, isValidSegment, basenameRel, dirnameRel, joinRel } from '@shared/utils/path'
import { api, describeIpcError } from '../../lib/api'
import { openDialog } from '../../lib/dialog'
import { useAppStore } from '../../stores/appStore'
import { useDocsStore } from '../../stores/docsStore'
import { editorHost } from '../editor/editorHost'
import { closeDocument, openDocument } from '../documents/documents'

/**
 * 工作区文件操作。
 *
 * 所有写操作都经过主进程的路径边界校验（见 WorkspaceService.resolveReal），
 * 这里只负责交互：取名字、确认、同步已打开的标签页与文件树。
 */

function validateName(value: string): string | null {
  const segments = value.split(/[\\/]/)
  for (const segment of segments) {
    if (!segment) return '名称不能为空'
    if (!isValidSegment(segment)) return '名称不能包含 \\ / : * ? " < > | 或以点、空格结尾'
  }
  return null
}

/** 新建笔记 */
export async function createNote(dirRel: string): Promise<void> {
  const name = await useAppStore.getState().ask({
    title: '新建笔记',
    label: dirRel ? `位置：${dirRel}/` : '位置：工作区根目录',
    defaultValue: '未命名笔记.md',
    confirmText: '创建',
    validate: validateName
  })
  if (!name) return

  const target = dirRel ? joinRel(dirRel, name) : name
  const result = await api.documents.createFile(target)
  if (!result.ok) {
    useAppStore.getState().toast(result.message, 'error')
    return
  }

  await useAppStore.getState().refreshTree()
  if (dirRel) useAppStore.getState().setExpanded(dirRel, true)
  await openDocument(target)
  useAppStore.getState().toast('已创建笔记', 'success')
}

/** 新建文件夹 */
export async function createFolder(dirRel: string): Promise<void> {
  const name = await useAppStore.getState().ask({
    title: '新建文件夹',
    label: dirRel ? `位置：${dirRel}/` : '位置：工作区根目录',
    defaultValue: '新文件夹',
    confirmText: '创建',
    validate: validateName
  })
  if (!name) return

  const target = dirRel ? joinRel(dirRel, name) : name
  const result = await api.documents.createFolder(target)
  if (!result.ok) {
    useAppStore.getState().toast(result.message, 'error')
    return
  }

  await useAppStore.getState().refreshTree()
  if (dirRel) useAppStore.getState().setExpanded(dirRel, true)
  useAppStore.getState().setExpanded(target, true)
}

/** 重命名 / 移动（支持输入相对路径实现移动） */
export async function renameEntry(relPath: string, isDirectory: boolean): Promise<void> {
  const current = basenameRel(relPath)
  const name = await useAppStore.getState().ask({
    title: isDirectory ? '重命名文件夹' : '重命名笔记',
    label: '可以输入相对路径把条目移动到其他目录，例如 Docs/新名字.md',
    defaultValue: current,
    confirmText: '重命名',
    validate: validateName
  })
  if (!name || name === current) return

  const target = name.includes('/') ? name : joinRel(dirnameRel(relPath), name)

  const result = await api.documents.rename(relPath, target)
  if (!result.ok) {
    useAppStore.getState().toast(result.message, 'error')
    return
  }

  syncOpenTabsAfterRename(relPath, target, isDirectory)
  await useAppStore.getState().refreshTree()
  useAppStore.getState().toast('已重命名', 'success')
}

/** 把已打开的标签页路径同步到新路径 */
function syncOpenTabsAfterRename(from: string, to: string, isDirectory: boolean): void {
  const store = useDocsStore.getState()
  const affected = Object.keys(store.docs).filter((path) =>
    isDirectory ? path === from || path.startsWith(`${from}/`) : path === from
  )
  for (const oldPath of affected) {
    const newPath = isDirectory ? `${to}${oldPath.slice(from.length)}` : to
    editorHost.rename(oldPath, newPath)
    store.rename(oldPath, newPath)
  }
}

/** 删除（移入系统回收站） */
export async function deleteEntry(relPath: string, isDirectory: boolean): Promise<void> {
  const choice = await openDialog({
    title: `删除「${basenameRel(relPath)}」？`,
    message: isDirectory
      ? '文件夹及其全部内容都会被移入系统回收站。'
      : '文件会被移入系统回收站，可以从回收站恢复。',
    items: [
      { id: 'delete', label: '移入回收站', danger: true },
      { id: 'cancel', label: '取消' }
    ],
    cancelId: 'cancel'
  })
  if (choice !== 'delete') return

  const result = await api.documents.remove(relPath)
  if (!result.ok) {
    useAppStore.getState().toast(result.message, 'error')
    return
  }

  // 关闭受影响的标签页（文件已经不在磁盘上，无需再询问保存）
  const store = useDocsStore.getState()
  const affected = Object.keys(store.docs).filter((path) =>
    isDirectory ? path.startsWith(`${relPath}/`) : path === relPath
  )
  for (const path of affected) {
    editorHost.close(path)
    useDocsStore.getState().remove(path)
  }
  const next = useDocsStore.getState().active
  if (next) editorHost.activate(next)

  await useAppStore.getState().refreshTree()
  useAppStore.getState().toast('已移入回收站', 'success')
}

/** 在系统文件管理器中定位 */
export async function revealEntry(relPath: string): Promise<void> {
  try {
    await api.documents.reveal(relPath)
  } catch (err) {
    useAppStore.getState().toast(describeIpcError(err), 'error')
  }
}

/** 关闭标签页（带未保存确认） */
export async function requestCloseDocument(relPath: string): Promise<void> {
  await closeDocument(relPath)
}

export { extnameRel }
