import type { BrowserWindow } from 'electron'
import type { CloseResponse } from '@shared/types'
import { IPC } from '@shared/ipc/channels'
import { log } from '../utils/logger'

interface PendingClose {
  requestId: string
  resolve: (response: CloseResponse) => void
  timer: NodeJS.Timeout
}

let pending: PendingClose | null = null
let counter = 0

/**
 * 关闭握手：主进程在窗口关闭前询问渲染进程"是否还有未保存内容"。
 *
 * 为什么需要握手：保存逻辑在渲染进程（它才持有编辑器内容），
 * 而窗口关闭由主进程控制。超时不代表"可以关"，而是"无法确认"，
 * 此时由调用方弹原生对话框交给用户决定，绝不静默丢弃。
 */
export function requestRendererClose(
  win: BrowserWindow | null,
  timeoutMs = 5000
): Promise<CloseResponse> {
  const requestId = `close-${++counter}-${Date.now()}`
  const empty: CloseResponse = { requestId, allSaved: false, drafts: [] }

  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return Promise.resolve({ ...empty, allSaved: true })
  }

  return new Promise<CloseResponse>((resolve) => {
    if (pending) {
      // 上一次握手还没结束，直接让它超时收尾
      clearTimeout(pending.timer)
      pending.resolve({ ...empty, requestId: pending.requestId })
      pending = null
    }

    const timer = setTimeout(() => {
      log.warn('close handshake timed out')
      pending = null
      resolve(empty)
    }, timeoutMs)

    pending = { requestId, resolve, timer }
    win.webContents.send(IPC.evtRequestClose, { requestId })
  })
}

/** 渲染进程回传结果时调用；返回 false 表示这次响应已过期（例如已超时） */
export function resolveCloseResponse(response: CloseResponse): boolean {
  if (!pending || pending.requestId !== response.requestId) return false
  const current = pending
  pending = null
  clearTimeout(current.timer)
  current.resolve(response)
  return true
}
