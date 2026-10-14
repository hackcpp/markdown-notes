import type { NotesAPI } from '@shared/contracts/api'

/**
 * Preload 注入的 API 入口。
 * 渲染进程只通过它访问系统能力，无法触达 ipcRenderer / Node。
 */
function resolveApi(): NotesAPI {
  const api = (globalThis as unknown as { notesAPI?: NotesAPI }).notesAPI
  if (!api) {
    throw new Error(
      'notesAPI 未注入：请确认窗口创建时配置了 preload，且 contextIsolation 处于开启状态。'
    )
  }
  return api
}

export const api: NotesAPI = resolveApi()

/** 把 IPC 抛出的异常统一转成可展示文案 */
export function describeIpcError(err: unknown): string {
  if (err instanceof Error) {
    // Electron 会把主进程错误包成 "Error invoking remote method 'xxx': ..."
    const match = /Error invoking remote method '[^']+':\s*(?:Error:\s*)?(.*)$/s.exec(err.message)
    return (match?.[1] ?? err.message).trim()
  }
  return String(err)
}
