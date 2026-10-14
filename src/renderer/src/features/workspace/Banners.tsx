import { Icon } from '../../components/Icons'
import { openDialog } from '../../lib/dialog'
import { api, describeIpcError } from '../../lib/api'
import { useAppStore } from '../../stores/appStore'
import { useDocsStore } from '../../stores/docsStore'
import { editorHost } from '../editor/editorHost'
import {
  openDocument,
  overwriteDisk,
  reloadFromDisk,
  saveController
} from '../documents/documents'

/**
 * 顶部横幅区。
 *
 * 这里集中展示三类"必须让用户知道"的状态：
 * - 当前文档与磁盘不一致（冲突 / 已被删除 / 保存失败）
 * - 上次异常退出留下的恢复草稿
 */
export function Banners(): React.JSX.Element | null {
  const active = useDocsStore((state) => state.active)
  const meta = useDocsStore((state) => (state.active ? state.docs[state.active] : undefined))
  const drafts = useAppStore((state) => state.drafts)

  const showDocBanner =
    meta && (meta.status === 'conflict' || meta.status === 'missing' || meta.status === 'error')

  if (!showDocBanner && drafts.length === 0) return null

  return (
    <div className="banners">
      {showDocBanner && meta && active && <DocBanner relPath={active} />}
      {drafts.length > 0 && <DraftBanner />}
    </div>
  )
}

function DocBanner({ relPath }: { relPath: string }): React.JSX.Element | null {
  const meta = useDocsStore((state) => state.docs[relPath])
  if (!meta) return null

  if (meta.status === 'conflict') {
    return (
      <div className="banner banner-error">
        <Icon name="alert" size={15} />
        <div className="banner-body">
          <strong>文件已被其他程序修改</strong>
          <span>
            为避免覆盖别人（或另一个编辑器）的改动，自动保存已经暂停。请选择下一步操作。
          </span>
        </div>
        <div className="banner-actions">
          <button type="button" className="btn btn-sm" onClick={() => void reloadFromDisk(relPath)}>
            <Icon name="restore" size={13} />
            放弃我的修改
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={async () => {
              const choice = await openDialog({
                title: '用编辑器内容覆盖磁盘文件？',
                message: '磁盘上的版本会被替换，且无法撤销。',
                items: [
                  { id: 'overwrite', label: '确认覆盖', danger: true },
                  { id: 'cancel', label: '取消' }
                ],
                cancelId: 'cancel'
              })
              if (choice === 'overwrite') await overwriteDisk(relPath)
            }}
          >
            用我的版本覆盖
          </button>
        </div>
      </div>
    )
  }

  if (meta.status === 'missing') {
    return (
      <div className="banner banner-error">
        <Icon name="alert" size={15} />
        <div className="banner-body">
          <strong>文件已被外部删除或移动</strong>
          <span>编辑器里还保留着内容，可以重新写回磁盘，或关闭这个标签页。</span>
        </div>
        <div className="banner-actions">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={async () => {
              await saveController.flush(relPath, { force: true })
              await useAppStore.getState().refreshTree()
            }}
          >
            重新创建文件
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="banner banner-warn">
      <Icon name="alert" size={15} />
      <div className="banner-body">
        <strong>保存失败</strong>
        <span>{meta.errorText ?? '未知错误'}。内容仍保留在编辑器与内存中。</span>
      </div>
      <div className="banner-actions">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => void saveController.flush(relPath, { force: true })}
        >
          重试保存
        </button>
      </div>
    </div>
  )
}

/**
 * 恢复草稿横幅。
 *
 * 草稿来自"上次关闭时没能成功保存"的内容，存放在应用数据目录，
 * 不会污染用户的工作区。
 */
function DraftBanner(): React.JSX.Element {
  const drafts = useAppStore((state) => state.drafts)
  const loadDrafts = useAppStore((state) => state.loadDrafts)

  const handleReview = async (): Promise<void> => {
    const choice = await openDialog({
      title: `发现 ${drafts.length} 篇未保存的草稿`,
      message: drafts
        .slice(0, 10)
        .map((draft) => `· ${draft.relPath}`)
        .join('\n'),
      items: [
        { id: 'restore', label: '全部恢复' },
        { id: 'discard', label: '全部丢弃', danger: true },
        { id: 'later', label: '稍后处理' }
      ],
      cancelId: 'later'
    })

    if (!choice || choice === 'later') return

    if (choice === 'discard') {
      for (const draft of drafts) await api.drafts.clear(draft.id)
      await loadDrafts()
      useAppStore.getState().toast('草稿已清除', 'success')
      return
    }

    let restored = 0
    for (const draft of drafts) {
      try {
        const payload = await api.drafts.read(draft.id)
        if (!payload) continue

        const exists = await api.documents
          .read(draft.relPath)
          .then(() => true)
          .catch(() => false)

        if (!exists) {
          const created = await api.documents.createFile(draft.relPath, payload.content)
          if (!created.ok) throw new Error(created.message)
          await useAppStore.getState().refreshTree()
          await openDocument(draft.relPath)
        } else {
          await openDocument(draft.relPath)
          editorHost.replaceText(draft.relPath, payload.content)
          useDocsStore.getState().patch(draft.relPath, { status: 'dirty' })
          await saveController.flush(draft.relPath)
        }

        await api.drafts.clear(draft.id)
        restored++
      } catch (err) {
        useAppStore.getState().toast(`恢复 ${draft.relPath} 失败：${describeIpcError(err)}`, 'error')
      }
    }

    await loadDrafts()
    useAppStore.getState().toast(`已恢复 ${restored} 篇草稿`, restored > 0 ? 'success' : 'info')
  }

  return (
    <div className="banner banner-info">
      <Icon name="restore" size={15} />
      <div className="banner-body">
        <strong>有 {drafts.length} 篇异常退出时留下的草稿</strong>
        <span>这些内容还没写回磁盘，可以现在恢复或丢弃。</span>
      </div>
      <div className="banner-actions">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void handleReview()}>
          查看并处理
        </button>
      </div>
    </div>
  )
}
