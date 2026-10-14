import { ipcMain, shell, app, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type { FileOpResult, Settings } from '@shared/types'
import { IPC } from '@shared/ipc/channels'
import { isSafeExternalUrl } from '@shared/utils/asset'
import { AppError, describeError, mapNodeError, toFileOpFailure } from '../utils/errors'
import { log } from '../utils/logger'
import { settingsStore } from '../services/settings/SettingsStore'
import { documentRecovery } from '../services/document/DocumentRecovery'
import { documentService, defaultNoteContent } from '../services/document/DocumentService'
import { workspaceService } from '../services/workspace/WorkspaceService'
import { scanWorkspace } from '../services/workspace/scanner'
import { resolveCloseResponse } from './closeCoordinator'
import {
  closeResponseSchema,
  createFileSchema,
  createFolderSchema,
  draftIdSchema,
  draftSaveSchema,
  openExternalSchema,
  openPathSchema,
  readDocumentSchema,
  relPathSchema,
  renameSchema,
  revealSchema,
  saveDocumentSchema,
  settingsPatchSchema
} from './schemas'

/**
 * 校验 IPC 请求来源。
 * 只接受应用自身的渲染进程：开发期是 dev server，打包后是 file://。
 */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  let senderUrl = ''
  try {
    senderUrl = event.senderFrame?.url ?? event.sender.getURL()
  } catch {
    return false
  }
  if (!senderUrl) return false
  if (senderUrl.startsWith('file://')) return true
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl && senderUrl.startsWith(devUrl)) return true
  return false
}

/** 统一的失败返回，保证渲染进程拿到的永远是结构化结果而不是异常 */
function failure(err: unknown): FileOpResult {
  return toFileOpFailure(err)
}

interface IpcContext {
  getWindow: () => BrowserWindow | null
}

export function registerIpcHandlers(ctx: IpcContext): void {
  // 每个 handler 都先过来源校验
  const handle = <T>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, payload: T) => unknown | Promise<unknown>
  ): void => {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      if (!isTrustedSender(event)) {
        log.warn(`blocked IPC from untrusted sender: ${channel}`)
        throw new AppError('BLOCKED', 'IPC 请求来源不可信')
      }
      return handler(event, payload as T)
    })
  }

  // ---------------------------------------------------------- 工作区

  handle(IPC.workspaceOpen, async () => {
    return workspaceService.openViaDialog(ctx.getWindow())
  })

  handle(IPC.workspaceOpenPath, async (_event, payload: unknown) => {
    const { rootPath } = openPathSchema.parse(payload)
    return workspaceService.open(rootPath)
  })

  handle(IPC.workspaceGetTree, async () => workspaceService.getTree())

  handle(IPC.workspaceRefresh, async () => {
    const root = workspaceService.getRoot()
    if (!root) return []
    return scanWorkspace(root)
  })

  handle(IPC.workspaceClose, async () => {
    await workspaceService.close()
    return { ok: true }
  })

  handle(IPC.workspaceState, async () => {
    const settings = settingsStore.get()
    return {
      workspace: workspaceService.get(),
      recentWorkspaces: settings.recentWorkspaces,
      lastWorkspace: settings.lastWorkspace
    }
  })

  // ---------------------------------------------------------- 文档

  handle(IPC.docRead, async (_event, payload: unknown) => {
    const { relPath } = readDocumentSchema.parse(payload)
    return documentService.read(relPath)
  })

  handle(IPC.docSave, async (_event, payload: unknown) => {
    const input = saveDocumentSchema.parse(payload)
    const result = await documentService.save(input)
    if (result.ok) {
      // 保存成功即清除对应的恢复草稿
      const root = workspaceService.getRoot()
      if (root) await documentRecovery.clearByRelPath(root, input.relPath)
    }
    return result
  })

  handle(IPC.docCreateFile, async (_event, payload: unknown) => {
    const { relPath, content } = createFileSchema.parse(payload)
    const body = content ?? defaultNoteContent(relPath)
    return documentService.createFile(relPath, body)
  })

  handle(IPC.docCreateFolder, async (_event, payload: unknown) => {
    const { relPath } = createFolderSchema.parse(payload)
    return documentService.createFolder(relPath)
  })

  handle(IPC.docRename, async (_event, payload: unknown) => {
    const { from, to } = renameSchema.parse(payload)
    return documentService.rename(from, to)
  })

  handle(IPC.docRemove, async (_event, payload: unknown) => {
    const { relPath } = relPathSchema.transform((p) => ({ relPath: p })).parse(payload)
    return documentService.remove(relPath)
  })

  handle(IPC.docReveal, async (_event, payload: unknown) => {
    const { relPath } = revealSchema.parse(payload)
    await documentService.reveal(relPath)
    return { ok: true }
  })

  // ---------------------------------------------------------- 草稿恢复

  handle(IPC.draftSave, async (_event, payload: unknown) => {
    const { workspaceRoot, drafts } = draftSaveSchema.parse(payload)
    await documentRecovery.saveDrafts(workspaceRoot, drafts)
    return { ok: true }
  })

  handle(IPC.draftList, async () => {
    const root = workspaceService.getRoot()
    return documentRecovery.list(root)
  })

  handle(IPC.draftRead, async (_event, payload: unknown) => {
    const { id } = draftIdSchema.parse(payload)
    return documentRecovery.read(id)
  })

  handle(IPC.draftClear, async (_event, payload: unknown) => {
    const { id } = draftIdSchema.parse(payload)
    await documentRecovery.clear(id)
    return { ok: true }
  })

  // ---------------------------------------------------------- 设置

  handle(IPC.settingsGet, async () => settingsStore.get())

  handle(IPC.settingsUpdate, async (_event, payload: unknown) => {
    const patch = settingsPatchSchema.parse(payload) as Partial<Settings>
    return settingsStore.update(patch)
  })

  // ---------------------------------------------------------- 系统

  handle(IPC.shellOpenExternal, async (_event, payload: unknown) => {
    const { url } = openExternalSchema.parse(payload)
    if (!isSafeExternalUrl(url)) {
      throw new AppError('BLOCKED', '只允许打开 http/https/mailto 链接')
    }
    await shell.openExternal(url)
    return { ok: true }
  })

  handle(IPC.appGetInfo, async () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    userDataPath: app.getPath('userData')
  }))

  ipcMain.on(IPC.closeRespond, (event, payload: unknown) => {
    if (!isTrustedSender(event as unknown as IpcMainInvokeEvent)) return
    const parsed = closeResponseSchema.safeParse(payload)
    if (!parsed.success) {
      log.warn('invalid close response', parsed.error.issues)
      return
    }
    resolveCloseResponse(parsed.data)
  })

  // 兜底：把未捕获的 handler 异常记下来，避免静默失败
  process.on('unhandledRejection', (reason) => {
    log.error('unhandled rejection in main process:', describeError(reason))
  })
}

export { failure, mapNodeError }
