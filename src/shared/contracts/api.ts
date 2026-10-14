/**
 * 渲染进程可见的 API 契约（对应方案 6.1）。
 *
 * 这份接口是 Preload 暴露内容的唯一权威定义：
 * - Preload 必须逐项实现它（编译期即可发现遗漏）
 * - 渲染进程只认识它，不认识 ipcRenderer，也不认识任何 Node API
 */
import type {
  AppCommand,
  AppInfo,
  CloseResponse,
  DocumentData,
  DraftInfo,
  DraftPayload,
  ExternalChangeEvent,
  FileNode,
  FileOpResult,
  OpenWorkspaceResult,
  SaveDocumentInput,
  SaveDocumentResult,
  Settings,
  TreeChangedEvent,
  Workspace
} from '../types'

export type Unsubscribe = () => void

export interface WorkspaceStateSnapshot {
  workspace: Workspace | null
  recentWorkspaces: string[]
  lastWorkspace: string | null
}

export interface NotesAPI {
  /** 'win32' | 'darwin' | 'linux'，用于快捷键与界面差异 */
  readonly platform: string

  workspace: {
    /** 弹出系统目录选择框；用户取消时返回 null */
    open(): Promise<OpenWorkspaceResult | null>
    openPath(rootPath: string): Promise<OpenWorkspaceResult>
    getTree(): Promise<FileNode[]>
    refresh(): Promise<FileNode[]>
    close(): Promise<{ ok: boolean }>
    state(): Promise<WorkspaceStateSnapshot>
  }

  documents: {
    read(relPath: string): Promise<DocumentData>
    save(input: SaveDocumentInput): Promise<SaveDocumentResult>
    createFile(relPath: string, content?: string): Promise<FileOpResult>
    createFolder(relPath: string): Promise<FileOpResult>
    rename(from: string, to: string): Promise<FileOpResult>
    /** 移入系统回收站，不做物理删除 */
    remove(relPath: string): Promise<FileOpResult>
    reveal(relPath: string): Promise<{ ok: boolean }>
  }

  drafts: {
    save(workspaceRoot: string, drafts: DraftPayload[]): Promise<{ ok: boolean }>
    list(): Promise<DraftInfo[]>
    read(id: string): Promise<DraftPayload | null>
    clear(id: string): Promise<{ ok: boolean }>
  }

  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
  }

  shell: {
    /** 只允许 http / https / mailto */
    openExternal(url: string): Promise<{ ok: boolean }>
  }

  app: {
    info(): Promise<AppInfo>
    /** 关闭握手回执：告诉主进程是否已全部保存 */
    respondClose(response: CloseResponse): void
    onCommand(handler: (command: AppCommand) => void): Unsubscribe
    onTreeChanged(handler: (event: TreeChangedEvent) => void): Unsubscribe
    onExternalChange(handler: (event: ExternalChangeEvent) => void): Unsubscribe
    onRequestClose(handler: (payload: { requestId: string }) => void): Unsubscribe
  }
}
