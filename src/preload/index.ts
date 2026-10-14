import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc/channels'
import type { NotesAPI, Unsubscribe } from '@shared/contracts/api'
import type {
  AppCommand,
  CloseResponse,
  DraftPayload,
  ExternalChangeEvent,
  SaveDocumentInput,
  Settings,
  TreeChangedEvent
} from '@shared/types'

/**
 * Preload。
 *
 * 这里只做一件事：把经过约束的业务接口挂到 window.notesAPI。
 * 严格不做的事：
 * - 不暴露 ipcRenderer / require / fs / process 本体
 * - 不暴露任意通道名的通用 invoke（否则等于把整个 IPC 面开放给渲染进程）
 */

/** 事件订阅：返回取消订阅函数，避免 React 严格模式下重复注册 */
function subscribe<T>(channel: string, handler: (payload: T) => void): Unsubscribe {
  const listener = (_event: unknown, payload: T): void => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const platform = ((): string => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/Macintosh|Mac OS X/i.test(ua)) return 'darwin'
  if (/Windows/i.test(ua)) return 'win32'
  return 'linux'
})()

const api: NotesAPI = {
  platform,

  workspace: {
    open: () => ipcRenderer.invoke(IPC.workspaceOpen),
    openPath: (rootPath: string) => ipcRenderer.invoke(IPC.workspaceOpenPath, { rootPath }),
    getTree: () => ipcRenderer.invoke(IPC.workspaceGetTree),
    refresh: () => ipcRenderer.invoke(IPC.workspaceRefresh),
    close: () => ipcRenderer.invoke(IPC.workspaceClose),
    state: () => ipcRenderer.invoke(IPC.workspaceState)
  },

  documents: {
    read: (relPath: string) => ipcRenderer.invoke(IPC.docRead, { relPath }),
    save: (input: SaveDocumentInput) => ipcRenderer.invoke(IPC.docSave, input),
    createFile: (relPath: string, content?: string) =>
      ipcRenderer.invoke(IPC.docCreateFile, { relPath, content }),
    createFolder: (relPath: string) => ipcRenderer.invoke(IPC.docCreateFolder, { relPath }),
    rename: (from: string, to: string) => ipcRenderer.invoke(IPC.docRename, { from, to }),
    remove: (relPath: string) => ipcRenderer.invoke(IPC.docRemove, relPath),
    reveal: (relPath: string) => ipcRenderer.invoke(IPC.docReveal, { relPath })
  },

  drafts: {
    save: (workspaceRoot: string, drafts: DraftPayload[]) =>
      ipcRenderer.invoke(IPC.draftSave, { workspaceRoot, drafts }),
    list: () => ipcRenderer.invoke(IPC.draftList),
    read: (id: string) => ipcRenderer.invoke(IPC.draftRead, { id }),
    clear: (id: string) => ipcRenderer.invoke(IPC.draftClear, { id })
  },

  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.settingsUpdate, patch)
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(IPC.shellOpenExternal, { url })
  },

  app: {
    info: () => ipcRenderer.invoke(IPC.appGetInfo),
    respondClose: (response: CloseResponse) => ipcRenderer.send(IPC.closeRespond, response),
    onCommand: (handler: (command: AppCommand) => void) => subscribe(IPC.evtCommand, handler),
    onTreeChanged: (handler: (event: TreeChangedEvent) => void) =>
      subscribe(IPC.evtTreeChanged, handler),
    onExternalChange: (handler: (event: ExternalChangeEvent) => void) =>
      subscribe(IPC.evtExternalChange, handler),
    onRequestClose: (handler: (payload: { requestId: string }) => void) =>
      subscribe(IPC.evtRequestClose, handler)
  }
}

contextBridge.exposeInMainWorld('notesAPI', api)
