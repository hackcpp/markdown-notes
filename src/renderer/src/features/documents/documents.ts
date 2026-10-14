import { AUTOSAVE_IDLE_MS, AUTOSAVE_MAX_MS, AUTOSAVE_MAX_RETRY_DELAY_MS } from '@shared/constants'
import { displayTitle } from '@shared/markdown'
import type { CloseResponse, DocumentData, ExternalChangeEvent, SaveDocumentResult } from '@shared/types'
import { basenameRel } from '@shared/utils/path'
import { api, describeIpcError } from '../../lib/api'
import { openDialog } from '../../lib/dialog'
import { useAppStore } from '../../stores/appStore'
import { useCaretStore } from '../../stores/caretStore'
import { unsavedDocs, useDocsStore, type DocMeta } from '../../stores/docsStore'
import { editorHost } from '../editor/editorHost'

/**
 * 文档控制器。
 *
 * 对应方案 5.1 的 Document Controller 层与 5.2 的保存状态机。
 * 这里是"编辑器里的文本"与"磁盘上的文件"之间的唯一桥梁，
 * 所有保存、冲突、外部变更的判断都收拢在本模块，组件不直接调 API 保存。
 */

type SaveOutcome = 'saved' | 'stale' | 'failed' | 'skipped'

/** 自己刚刚写入后的一小段时间内，忽略自身触发的文件事件 */
const EXTERNAL_SUPPRESS_MS = 1500
/** 保存失败的重试次数上限；耗尽后转为等待用户手动保存 */
const MAX_SAVE_RETRIES = 4

const lastSaveAt = new Map<string, number>()

class SaveController {
  private idleTimers = new Map<string, number>()
  private retryTimers = new Map<string, number>()
  private firstDirtyAt = new Map<string, number>()
  private retries = new Map<string, number>()
  private inFlight = new Map<string, Promise<void>>()

  /**
   * 标记文档为"脏"，并据此安排一次自动保存。
   * 双重节流：停止输入 800ms 触发；连续输入不超过 3 秒必须落盘一次。
   */
  markDirty(relPath: string): void {
    const now = Date.now()
    if (!this.firstDirtyAt.has(relPath)) this.firstDirtyAt.set(relPath, now)

    const elapsed = now - (this.firstDirtyAt.get(relPath) ?? now)
    const delay = Math.max(0, Math.min(AUTOSAVE_IDLE_MS, AUTOSAVE_MAX_MS - elapsed))

    const existing = this.idleTimers.get(relPath)
    if (existing !== undefined) window.clearTimeout(existing)
    this.idleTimers.set(
      relPath,
      window.setTimeout(() => {
        this.idleTimers.delete(relPath)
        void this.flush(relPath)
      }, delay)
    )
  }

  /** 立即保存指定文档（Ctrl+S、切换文件、关闭前都走这里） */
  async flush(relPath: string, options: { force?: boolean } = {}): Promise<void> {
    this.clearTimer(relPath)

    const running = this.inFlight.get(relPath)
    if (running) {
      // 已有保存在进行中：等它结束后再判断是否还要写一次
      await running
      const meta = useDocsStore.getState().docs[relPath]
      if (meta && meta.status === 'dirty') await this.flush(relPath, options)
      return
    }

    const task = this.runLoop(relPath, options).finally(() => {
      this.inFlight.delete(relPath)
    })
    this.inFlight.set(relPath, task)
    await task
  }

  /** 串行执行：保存期间又产生的新内容不会被旧任务覆盖，而是紧接着再写一次 */
  private async runLoop(relPath: string, options: { force?: boolean }): Promise<void> {
    for (let round = 0; round < 20; round++) {
      const outcome = await performSave(relPath, options.force === true)
      if (outcome !== 'stale') return
    }
  }

  clearTimer(relPath: string): void {
    const idle = this.idleTimers.get(relPath)
    if (idle !== undefined) {
      window.clearTimeout(idle)
      this.idleTimers.delete(relPath)
    }
    const retry = this.retryTimers.get(relPath)
    if (retry !== undefined) {
      window.clearTimeout(retry)
      this.retryTimers.delete(relPath)
    }
  }

  /** 放弃某个文档的所有待办保存（例如关闭时选择丢弃修改） */
  discard(relPath: string): void {
    this.clearTimer(relPath)
    this.firstDirtyAt.delete(relPath)
    this.retries.delete(relPath)
    this.inFlight.delete(relPath)
  }

  onSaveSucceeded(relPath: string): void {
    this.firstDirtyAt.delete(relPath)
    this.retries.delete(relPath)
    lastSaveAt.set(relPath, Date.now())
  }

  /** 保存失败后的退避重试：只对可恢复的错误调度 */
  scheduleRetry(relPath: string): void {
    const attempt = (this.retries.get(relPath) ?? 0) + 1
    if (attempt > MAX_SAVE_RETRIES) return
    this.retries.set(relPath, attempt)

    const delay = Math.min(1000 * 2 ** (attempt - 1), AUTOSAVE_MAX_RETRY_DELAY_MS)
    const existing = this.retryTimers.get(relPath)
    if (existing !== undefined) window.clearTimeout(existing)
    this.retryTimers.set(
      relPath,
      window.setTimeout(() => {
        this.retryTimers.delete(relPath)
        void this.flush(relPath)
      }, delay)
    )
  }

  /** 关闭前的最后冲刺：把所有脏文档立刻写一遍 */
  async flushAll(): Promise<void> {
    const dirty = Object.values(useDocsStore.getState().docs).filter(
      (doc) => doc.status === 'dirty' || doc.status === 'error'
    )
    await Promise.all(dirty.map((doc) => this.flush(doc.relPath)))
  }

  hasInFlight(): boolean {
    return this.inFlight.size > 0
  }
}

export const saveController = new SaveController()

// ------------------------------------------------------------------ 保存

async function performSave(relPath: string, force: boolean): Promise<SaveOutcome> {
  const store = useDocsStore.getState()
  const meta = store.docs[relPath]
  if (!meta) return 'skipped'

  // 冲突状态下不再自动写入，必须由用户显式选择"覆盖"或"重新加载"
  if (meta.status === 'conflict' && !force) return 'failed'
  if (meta.status === 'clean' && !force) return 'skipped'

  const text = editorHost.getText(relPath)
  if (text === null) return 'skipped'

  store.patch(relPath, { status: 'saving', errorText: undefined })

  let result: SaveDocumentResult
  try {
    result = await api.documents.save({
      relPath,
      content: text,
      baseHash: force ? '' : meta.baseHash,
      eol: meta.eol,
      hasBom: meta.hasBom
    })
  } catch (err) {
    useDocsStore.getState().patch(relPath, {
      status: 'error',
      errorText: describeIpcError(err)
    })
    saveController.scheduleRetry(relPath)
    return 'failed'
  }

  if (!result.ok) {
    applyFailure(relPath, result)
    return 'failed'
  }

  const after = editorHost.getText(relPath)
  const stale = after !== null && after !== text

  useDocsStore.getState().patch(relPath, {
    baseHash: result.hash,
    mtimeMs: result.mtimeMs,
    size: result.bytes,
    status: stale ? 'dirty' : 'clean',
    errorText: undefined,
    diskHash: undefined,
    diskMtimeMs: undefined,
    lastSavedAt: result.savedAt
  })

  saveController.onSaveSucceeded(relPath)
  return stale ? 'stale' : 'saved'
}

function applyFailure(relPath: string, result: Extract<SaveDocumentResult, { ok: false }>): void {
  const patch: Partial<DocMeta> = { errorText: result.message }

  switch (result.reason) {
    case 'CONFLICT':
      patch.status = 'conflict'
      patch.diskHash = result.diskHash
      patch.diskMtimeMs = result.diskMtimeMs
      break
    case 'NOT_FOUND':
      patch.status = 'missing'
      break
    case 'PERMISSION_DENIED':
    case 'DISK_FULL':
    case 'IO_ERROR':
      patch.status = 'error'
      saveController.scheduleRetry(relPath)
      break
    default:
      // TOO_LARGE / OUTSIDE_WORKSPACE / INVALID_NAME 等属于不可重试
      patch.status = 'error'
      break
  }

  const next = useDocsStore.getState().docs[relPath]
  useDocsStore.getState().patch(relPath, { ...patch, status: patch.status ?? next?.status ?? 'error' })
}

// ------------------------------------------------------------------ 打开 / 关闭

export async function openDocument(relPath: string): Promise<void> {
  const store = useDocsStore.getState()

  const existing = store.docs[relPath]
  if (existing) {
    store.setActive(relPath)
    editorHost.activate(relPath)
    editorHost.focus()
    return
  }

  store.setLoading(relPath, true)
  try {
    const data = await api.documents.read(relPath)
    const meta: DocMeta = {
      relPath,
      title: displayTitle(data.content, relPath),
      baseHash: data.hash,
      eol: data.eol,
      hasBom: data.hasBom,
      mtimeMs: data.mtimeMs,
      size: data.size,
      status: 'clean',
      lastSavedAt: null,
      everDirty: false
    }
    useDocsStore.getState().upsert(meta)
    useDocsStore.getState().setContent(relPath, data.content)
    editorHost.open(relPath, data.content)
    useDocsStore.getState().setActive(relPath)
    useAppStore.getState().expandTo(relPath)
    useAppStore.getState().setSelected(relPath)
  } catch (err) {
    useAppStore.getState().toast(`打开失败：${describeIpcError(err)}`, 'error')
  } finally {
    useDocsStore.getState().setLoading(relPath, false)
  }
}

/**
 * 关闭标签页。
 * 有未保存内容时一定先问用户，不静默丢弃 —— 这是笔记软件最基本的信任底线。
 */
export async function closeDocument(relPath: string): Promise<void> {
  const meta = useDocsStore.getState().docs[relPath]
  if (!meta) return

  const needsAsk =
    meta.status === 'dirty' ||
    meta.status === 'error' ||
    meta.status === 'saving' ||
    meta.status === 'missing' ||
    meta.status === 'conflict'

  if (needsAsk) {
    const choice = await openDialog({
      title: `「${meta.title}」尚未保存`,
      message:
        meta.errorText ??
        (meta.status === 'conflict' ? '文件已被其他程序修改。' : '关闭前需要决定如何处理这些修改。'),
      items: [
        { id: 'save', label: '保存并关闭' },
        { id: 'discard', label: '放弃更改', danger: true },
        { id: 'cancel', label: '取消' }
      ],
      cancelId: 'cancel'
    })

    if (!choice || choice === 'cancel') return

    if (choice === 'save') {
      if (meta.status === 'conflict') {
        // 冲突状态下"保存"等价于用编辑器内容覆盖磁盘
        await saveController.flush(relPath, { force: true })
      } else {
        await saveController.flush(relPath)
      }
      const updated = useDocsStore.getState().docs[relPath]
      if (updated && updated.status !== 'clean') {
        useAppStore.getState().toast('保存未成功，标签页保持打开', 'error')
        return
      }
    } else {
      saveController.discard(relPath)
    }
  }

  editorHost.close(relPath)
  useDocsStore.getState().remove(relPath)
  useDocsStore.getState().setContent(relPath, '')

  // 关闭后把编辑器切到新的当前文档
  const next = useDocsStore.getState().active
  if (next) {
    editorHost.activate(next)
    editorHost.focus()
  }
}

/** 从磁盘重新加载（外部改动后"放弃本地修改"） */
export async function reloadFromDisk(relPath: string): Promise<boolean> {
  try {
    const data = await api.documents.read(relPath)
    applyDiskContent(relPath, data)
    saveController.discard(relPath)
    useAppStore.getState().toast('已重新加载磁盘版本', 'success')
    return true
  } catch (err) {
    useAppStore.getState().toast(`重新加载失败：${describeIpcError(err)}`, 'error')
    return false
  }
}

/** 用编辑器内容强制覆盖磁盘（用户显式确认后） */
export async function overwriteDisk(relPath: string): Promise<void> {
  await saveController.flush(relPath, { force: true })
  const meta = useDocsStore.getState().docs[relPath]
  if (meta?.status === 'clean') {
    useAppStore.getState().toast('已用编辑器内容覆盖磁盘文件', 'success')
  } else if (meta) {
    useAppStore.getState().toast(meta.errorText ?? '覆盖失败', 'error')
  }
}

/** 把磁盘内容写回编辑器与镜像 */
function applyDiskContent(relPath: string, data: DocumentData): void {
  editorHost.replaceText(relPath, data.content)
  useDocsStore.getState().setContent(relPath, data.content)
  useDocsStore.getState().patch(relPath, {
    baseHash: data.hash,
    mtimeMs: data.mtimeMs,
    size: data.size,
    eol: data.eol,
    hasBom: data.hasBom,
    status: 'clean',
    errorText: undefined,
    diskHash: undefined,
    diskMtimeMs: undefined,
    title: displayTitle(data.content, relPath)
  })
}

// ------------------------------------------------------------------ 外部变更

export async function handleExternalChange(event: ExternalChangeEvent): Promise<void> {
  const meta = useDocsStore.getState().docs[event.relPath]
  if (!meta) return

  // 忽略自己刚写入产生的回声事件
  const savedAt = lastSaveAt.get(event.relPath) ?? 0
  if (Date.now() - savedAt < EXTERNAL_SUPPRESS_MS) return

  if (event.kind === 'unlink') {
    if (meta.status === 'dirty' || meta.status === 'saving' || meta.status === 'conflict') {
      useDocsStore.getState().patch(event.relPath, {
        status: 'missing',
        errorText: '文件已被外部删除或移动'
      })
    } else {
      await closeDocument(event.relPath)
      useAppStore.getState().toast(`${basenameRel(event.relPath)} 已被外部删除`, 'info')
    }
    return
  }

  try {
    const data = await api.documents.read(event.relPath)
    // 磁盘版本与我们记录的基准一致 → 只是自己的写入回声
    if (data.hash === meta.baseHash) return

    const current = useDocsStore.getState().docs[event.relPath]
    if (!current) return

    if (current.status === 'dirty' || current.status === 'saving') {
      useDocsStore.getState().patch(event.relPath, {
        status: 'conflict',
        diskHash: data.hash,
        diskMtimeMs: data.mtimeMs,
        errorText: '文件已被其他程序修改'
      })
      return
    }

    applyDiskContent(event.relPath, data)
    useAppStore.getState().toast(`${basenameRel(event.relPath)} 已从磁盘更新`, 'info')
  } catch {
    // 读到一半又被改掉之类的情况，忽略本次事件，等待下一次
  }
}

// ------------------------------------------------------------------ 关闭握手

/** 响应主进程的关闭询问：尽力保存，剩下的一律转成恢复草稿 */
export async function prepareForClose(requestId: string): Promise<CloseResponse> {
  try {
    await Promise.race([
      saveController.flushAll(),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ])
  } catch {
    /* 忽略：下面会按实际状态判断 */
  }

  const state = useDocsStore.getState()
  const remaining = unsavedDocs(state.docs)
  if (remaining.length === 0) {
    return { requestId, allSaved: true, drafts: [] }
  }

  const drafts = remaining.map((doc) => ({
    relPath: doc.relPath,
    content: editorHost.getText(doc.relPath) ?? ''
  }))

  return { requestId, allSaved: false, drafts }
}

// ------------------------------------------------------------------ 编辑器桥

let bridgeReady = false

/** 把编辑器事件接到文档状态与保存调度上（只在应用启动时调用一次） */
export function initDocumentBridge(): void {
  if (bridgeReady) return
  bridgeReady = true

  editorHost.setListener({
    onDocChanged(relPath) {
      const meta = useDocsStore.getState().docs[relPath]
      if (!meta) return
      if (meta.status !== 'dirty') {
        useDocsStore.getState().patch(relPath, {
          status: 'dirty',
          everDirty: true,
          // 之前保存失败过的话，重新编辑时清掉报错，让下次尝试重新走一遍
          errorText: meta.status === 'error' ? undefined : meta.errorText
        })
      }
      saveController.markDirty(relPath)
    },

    onSelectionChanged(relPath, info) {
      useCaretStore.getState().setInfo(relPath, info)
    },

    onContentMirror(relPath, text) {
      useDocsStore.getState().setContent(relPath, text)
    }
  })
}

/** 保存全部（Ctrl+Alt+S） */
export async function saveAllDocuments(): Promise<void> {
  const docs = Object.values(useDocsStore.getState().docs)
  await Promise.all(
    docs
      .filter((doc) => doc.status !== 'conflict')
      .map((doc) => saveController.flush(doc.relPath))
  )
  const failed = unsavedDocs(useDocsStore.getState().docs)
  if (failed.length === 0) {
    useAppStore.getState().toast('全部笔记已保存', 'success')
  } else {
    useAppStore.getState().toast(`${failed.length} 篇笔记未能保存`, 'error')
  }
}
