/** 主进程 ↔ 渲染进程共享的类型契约。这里是唯一的真相来源。 */

export type NodeKind = 'file' | 'directory'

export interface FileNode {
  name: string
  /** 相对于工作区根目录，始终使用 POSIX 分隔符 */
  relPath: string
  kind: NodeKind
  /** 目录才有 children；文件为 undefined */
  children?: FileNode[]
}

export interface Workspace {
  id: string
  name: string
  rootPath: string
}

export interface OpenWorkspaceResult {
  workspace: Workspace
  tree: FileNode[]
}

export interface DocumentData {
  relPath: string
  /** 统一换行符为 \n 之后的内容；BOM 已被剥离 */
  content: string
  /** 磁盘原始字节的 sha1，用作版本基准 */
  hash: string
  mtimeMs: number
  size: number
  /** 原文件的换行风格，保存时按原样还原 */
  eol: Eol
  hasBom: boolean
}

export type Eol = '\n' | '\r\n'

export interface SaveDocumentInput {
  relPath: string
  /** 内部统一使用 \n */
  content: string
  /**
   * 版本基准。
   * - 传入读取时拿到的 hash：保存前校验磁盘版本，不一致则返回 CONFLICT。
   * - 传入空字符串：跳过版本校验（仅用于用户在冲突提示中显式选择"覆盖"）。
   */
  baseHash: string
  eol: Eol
  hasBom: boolean
}

export type FailureReason =
  | 'NO_WORKSPACE'
  | 'OUTSIDE_WORKSPACE'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'INVALID_NAME'
  | 'DIR_NOT_EMPTY'
  | 'TOO_LARGE'
  | 'NOT_A_FILE'
  | 'CONFLICT'
  | 'PERMISSION_DENIED'
  | 'DISK_FULL'
  | 'IO_ERROR'
  | 'BLOCKED'

export type SaveDocumentResult =
  | { ok: true; hash: string; mtimeMs: number; savedAt: number; bytes: number }
  | { ok: false; reason: FailureReason; message: string; diskHash?: string; diskMtimeMs?: number }

export type FileOpResult = { ok: true } | { ok: false; reason: FailureReason; message: string }

export interface DraftInfo {
  id: string
  relPath: string
  workspaceRoot: string
  savedAt: number
  size: number
}

export interface DraftPayload {
  relPath: string
  content: string
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'
export type ViewMode = 'source' | 'split' | 'preview'

export interface Settings {
  theme: ThemeMode
  viewMode: ViewMode
  sidebarVisible: boolean
  outlineVisible: boolean
  sidebarWidth: number
  outlineWidth: number
  fontSize: number
  showLineNumbers: boolean
  wrapLines: boolean
  lastWorkspace: string | null
  recentWorkspaces: string[]
  windowBounds: { width: number; height: number; x?: number; y?: number } | null
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  userDataPath: string
}

/** 文件监听事件（已归一化为相对路径） */
export interface TreeChangedEvent {
  kind: 'add' | 'unlink' | 'addDir' | 'unlinkDir' | 'change'
  relPath: string
}

/** 打开中的文档被外部程序改动 */
export interface ExternalChangeEvent {
  relPath: string
  kind: 'change' | 'unlink'
  hash: string
  mtimeMs: number
}

/** 由主进程菜单/快捷键触发、需要渲染进程执行的命令 */
export type AppCommand =
  | 'file.newNote'
  | 'file.newFolder'
  | 'file.openFolder'
  | 'file.save'
  | 'file.saveAll'
  | 'file.closeTab'
  | 'file.revealActive'
  | 'file.reloadWorkspace'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.find'
  | 'edit.findReplace'
  | 'view.toggleSidebar'
  | 'view.toggleOutline'
  | 'view.modeSource'
  | 'view.modeSplit'
  | 'view.modePreview'
  | 'view.toggleTheme'
  | 'view.toggleFocus'
  | 'view.increaseFont'
  | 'view.decreaseFont'
  | 'help.shortcuts'

export interface CloseResponse {
  requestId: string
  allSaved: boolean
  drafts: DraftPayload[]
}

export interface PromptRequest {
  id: string
  title: string
  label?: string
  defaultValue?: string
  confirmText?: string
  /** 校验失败时返回错误文案，返回 null 表示通过 */
  validate?: (value: string) => string | null
}

export interface ContextMenuItem {
  id: string
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
}
