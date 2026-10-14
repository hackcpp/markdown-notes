import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dialog, type BrowserWindow } from 'electron'
import type {
  ExternalChangeEvent,
  FileNode,
  OpenWorkspaceResult,
  TreeChangedEvent,
  Workspace
} from '@shared/types'
import { isInside, normalizeRelPath, platformCaseInsensitive, toPosix } from '@shared/utils/path'
import { AppError } from '../../utils/errors'
import { log } from '../../utils/logger'
import { settingsStore } from '../settings/SettingsStore'
import { FileWatcher } from './FileWatcher'
import { countNotes, scanWorkspace } from './scanner'

type TreeListener = (event: TreeChangedEvent) => void
type ExternalListener = (event: ExternalChangeEvent) => void

/**
 * 工作区服务。
 *
 * 职责：持有当前活动工作区，负责目录扫描、路径边界校验、文件监听。
 * V0.1 只支持一个活动工作区；多工作区同时搜索留到后续版本。
 */
class WorkspaceService {
  private workspace: Workspace | null = null
  private realRoot: string | null = null
  private watcher: FileWatcher | null = null
  private treeListeners = new Set<TreeListener>()
  private externalListeners = new Set<ExternalListener>()

  onTreeChanged(listener: TreeListener): void {
    this.treeListeners.add(listener)
  }

  onExternalChange(listener: ExternalListener): void {
    this.externalListeners.add(listener)
  }

  get(): Workspace | null {
    return this.workspace
  }

  getRoot(): string | null {
    return this.workspace?.rootPath ?? null
  }

  requireRoot(): string {
    if (!this.workspace) throw new AppError('NO_WORKSPACE')
    return this.workspace.rootPath
  }

  /** 弹出系统目录选择框并打开 */
  async openViaDialog(window: BrowserWindow | null): Promise<OpenWorkspaceResult | null> {
    const options: Electron.OpenDialogOptions = {
      title: '选择 Markdown 笔记文件夹',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '打开为工作区'
    }
    // 有父窗口时用模态形式，保证对话框不会被主窗口盖住
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return this.open(result.filePaths[0])
  }

  /** 直接打开指定目录（用于恢复上次工作区 / 最近列表） */
  async open(rootPath: string): Promise<OpenWorkspaceResult> {
    const absRoot = path.resolve(rootPath)
    const stat = await fs.stat(absRoot).catch(() => null)
    if (!stat || !stat.isDirectory()) throw new AppError('NOT_FOUND', '目录不存在或不可访问')

    await this.close()

    const realRoot = await fs.realpath(absRoot)
    const tree = await scanWorkspace(realRoot)

    this.workspace = {
      id: toPosix(realRoot),
      name: path.basename(realRoot) || realRoot,
      rootPath: realRoot
    }
    this.realRoot = realRoot

    settingsStore.addRecentWorkspace(realRoot)

    this.watcher = new FileWatcher(realRoot, (event) => {
      this.emitTree(event)
      // 说明：外部对某文件的修改/删除，渲染进程需要据此判断已打开文档是否过期。
      // 真实 hash 由渲染进程按需拉取（避免每次事件都读盘）。
      if (event.kind === 'change' || event.kind === 'unlink') {
        this.emitExternal({
          relPath: event.relPath,
          kind: event.kind,
          hash: '',
          mtimeMs: 0
        })
      }
    })
    this.watcher.start()

    log.info(`workspace opened: ${realRoot} (${countNotes(tree)} notes)`)
    return { workspace: this.workspace, tree }
  }

  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.stop()
      this.watcher = null
    }
    this.workspace = null
    this.realRoot = null
  }

  async getTree(): Promise<FileNode[]> {
    const root = this.requireRoot()
    return scanWorkspace(root)
  }

  /**
   * 相对路径 → 绝对路径，并做两层校验：
   * 1. 字符串层面：禁止绝对路径、盘符、越界（normalizeRelPath）
   * 2. 文件系统层面：解析父目录与目标本身的符号链接，确认真实路径仍在工作区内
   */
  async resolveReal(relPath: string, options: { allowRoot?: boolean } = {}): Promise<string> {
    const root = this.requireRoot()
    const normalized = normalizeRelPath(relPath)
    if (!normalized) {
      if (options.allowRoot) return root
      throw new AppError('INVALID_NAME')
    }

    const abs = path.join(root, ...normalized.split('/'))
    const realRoot = await this.getRealRoot()
    const ci = platformCaseInsensitive(process.platform)

    // 父目录必须存在（我们不隐式创建多级目录）
    let realDir: string
    try {
      realDir = await fs.realpath(path.dirname(abs))
    } catch {
      throw new AppError('NOT_FOUND', `目录不存在：${path.dirname(abs)}`)
    }
    if (!isInside(realRoot, realDir, ci)) throw new AppError('OUTSIDE_WORKSPACE')

    const target = path.join(realDir, path.basename(abs))
    if (!isInside(realRoot, target, ci)) throw new AppError('OUTSIDE_WORKSPACE')

    // 目标本身可能是指向工作区外的符号链接
    try {
      const realTarget = await fs.realpath(target)
      if (!isInside(realRoot, realTarget, ci)) throw new AppError('OUTSIDE_WORKSPACE')
      return realTarget
    } catch (err) {
      if (err instanceof AppError) throw err
      // ENOENT：目标还不存在，父目录已校验通过，安全
      return target
    }
  }

  /** 判断相对路径是否落在工作区内（不触盘，用于快速过滤） */
  isInsideWorkspace(relPath: string): boolean {
    return normalizeRelPath(relPath) !== null
  }

  private async getRealRoot(): Promise<string> {
    if (this.realRoot) return this.realRoot
    const root = this.requireRoot()
    this.realRoot = await fs.realpath(root)
    return this.realRoot
  }

  private emitTree(event: TreeChangedEvent): void {
    for (const listener of this.treeListeners) {
      try {
        listener(event)
      } catch (err) {
        log.warn('tree listener failed', err)
      }
    }
  }

  private emitExternal(event: ExternalChangeEvent): void {
    for (const listener of this.externalListeners) {
      try {
        listener(event)
      } catch (err) {
        log.warn('external listener failed', err)
      }
    }
  }
}

export const workspaceService = new WorkspaceService()
