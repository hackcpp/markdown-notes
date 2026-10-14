import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Settings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import { atomicWriteFile } from '../document/AtomicWriter'
import { log } from '../../utils/logger'

export { DEFAULT_SETTINGS }

const MAX_RECENT = 8

/**
 * 应用设置。写在 userData 下，与用户的笔记目录完全隔离，
 * 升级 / 卸载应用不会影响笔记，反之亦然。
 */
class SettingsStore {
  private file = ''
  private cache: Settings = { ...DEFAULT_SETTINGS }
  private flushTimer: NodeJS.Timeout | null = null
  private ready = false

  init(): void {
    if (this.ready) return
    this.file = path.join(app.getPath('userData'), 'settings.json')
    this.ready = true
    try {
      const raw = require('node:fs').readFileSync(this.file, 'utf-8') as string
      this.cache = this.merge(JSON.parse(raw) as Partial<Settings>)
    } catch {
      this.cache = { ...DEFAULT_SETTINGS }
    }
  }

  get(): Settings {
    return { ...this.cache }
  }

  update(patch: Partial<Settings>): Settings {
    this.cache = this.merge({ ...this.cache, ...patch })
    this.scheduleFlush()
    return this.get()
  }

  addRecentWorkspace(rootPath: string): void {
    const list = [rootPath, ...this.cache.recentWorkspaces.filter((p) => p !== rootPath)]
    this.update({ recentWorkspaces: list.slice(0, MAX_RECENT), lastWorkspace: rootPath })
  }

  private merge(input: Partial<Settings>): Settings {
    const merged: Settings = { ...DEFAULT_SETTINGS, ...input }
    merged.sidebarWidth = clamp(merged.sidebarWidth, 180, 520)
    merged.outlineWidth = clamp(merged.outlineWidth, 180, 480)
    merged.fontSize = clamp(merged.fontSize, 11, 24)
    merged.recentWorkspaces = Array.isArray(merged.recentWorkspaces)
      ? merged.recentWorkspaces.filter((p) => typeof p === 'string').slice(0, MAX_RECENT)
      : []
    if (!['light', 'dark', 'system'].includes(merged.theme)) merged.theme = 'system'
    if (!['source', 'split', 'preview'].includes(merged.viewMode)) merged.viewMode = 'split'
    return merged
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, 250)
  }

  /** 退出前强制落盘 */
  async flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    await this.flush()
  }

  private async flush(): Promise<void> {
    if (!this.file) return
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      await atomicWriteFile(this.file, new TextEncoder().encode(JSON.stringify(this.cache, null, 2)))
    } catch (err) {
      log.warn('settings flush failed', err)
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export const settingsStore = new SettingsStore()
