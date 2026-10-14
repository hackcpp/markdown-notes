import path from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import { IGNORED_DIRS, IGNORED_FILES, SCAN_MAX_DEPTH, TEMP_SUFFIX } from '@shared/constants'
import type { TreeChangedEvent } from '@shared/types'
import { toPosix } from '@shared/utils/path'
import { log } from '../../utils/logger'

const IGNORED_DIR_SET = new Set(IGNORED_DIRS)
const IGNORED_FILE_SET = new Set(IGNORED_FILES)

/**
 * 工作区文件监听。
 *
 * 必须记住的边界：文件监听 *不能* 代替版本检测。
 * 事件可能丢失、合并、乱序，也可能在我们没注意到的时刻发生；
 * 真正的防覆盖依据始终是保存前的 hash 比对（见 DocumentService.save）。
 * 这里的职责只是"告诉渲染进程该刷新了"。
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null
  private pending: Map<string, TreeChangedEvent> = new Map()
  private flushTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly root: string,
    private readonly onTreeChanged: (event: TreeChangedEvent) => void
  ) {}

  start(): void {
    if (this.watcher) return
    this.watcher = watch(this.root, {
      ignoreInitial: true,
      persistent: true,
      depth: SCAN_MAX_DEPTH,
      followSymlinks: false,
      // 自己写文件时会产生中间临时文件，直接忽略
      ignored: (target: string) => this.shouldIgnore(target),
      // 等写入稳定后再触发，避免读到写了一半的文件
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
    })

    this.watcher.on('all', (event, target) => {
      const relPath = this.toRel(target)
      if (!relPath) return
      if (!['add', 'unlink', 'addDir', 'unlinkDir', 'change'].includes(event)) return
      this.enqueue({ kind: event as TreeChangedEvent['kind'], relPath })
    })

    this.watcher.on('error', (err) => {
      log.warn('watcher error', err)
    })
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.pending.clear()
    const watcher = this.watcher
    this.watcher = null
    if (watcher) await watcher.close().catch(() => undefined)
  }

  /** 同一路径的连续事件合并，并按帧级节流批量上报 */
  private enqueue(event: TreeChangedEvent): void {
    this.pending.set(event.relPath, event)
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      const batch = [...this.pending.values()]
      this.pending.clear()
      for (const item of batch) {
        try {
          this.onTreeChanged(item)
        } catch (err) {
          log.warn('tree changed handler failed', err)
        }
      }
    }, 120)
  }

  private shouldIgnore(target: string): boolean {
    const rel = this.toRel(target)
    if (!rel) return false
    const segments = rel.split('/')
    for (let i = 0; i < segments.length - 1; i++) {
      if (IGNORED_DIR_SET.has(segments[i])) return true
      if (segments[i].startsWith('.')) return true
    }
    const last = segments[segments.length - 1]
    if (IGNORED_FILE_SET.has(last)) return true
    if (last.endsWith(TEMP_SUFFIX)) return true
    return false
  }

  /** 绝对路径 → 工作区相对路径；不在工作区内返回 null */
  private toRel(target: string): string | null {
    const abs = path.resolve(target)
    const rel = path.relative(this.root, abs)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
    return toPosix(rel)
  }
}
