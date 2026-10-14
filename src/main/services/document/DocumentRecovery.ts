import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { app } from 'electron'
import { MAX_NOTE_SIZE, RECOVERY_DIR } from '@shared/constants'
import type { DraftInfo, DraftPayload } from '@shared/types'
import { atomicWriteFile } from './AtomicWriter'
import { log } from '../../utils/logger'

interface DraftFile {
  version: 1
  relPath: string
  workspaceRoot: string
  savedAt: number
  content: string
}

function idFor(workspaceRoot: string, relPath: string): string {
  return createHash('sha1').update(`${workspaceRoot}\n${relPath}`).digest('hex').slice(0, 20)
}

/**
 * 崩溃 / 异常退出时的草稿恢复。
 *
 * 设计要点：草稿写在 userData 目录，绝不写进用户的工作区
 * （否则会污染笔记目录，也可能被当成笔记扫进文件树）。
 */
class DocumentRecovery {
  private dir = ''

  init(): void {
    this.dir = path.join(app.getPath('userData'), RECOVERY_DIR)
  }

  private async ensureDir(): Promise<void> {
    if (!this.dir) this.init()
    await fs.mkdir(this.dir, { recursive: true })
  }

  async saveDrafts(workspaceRoot: string, drafts: DraftPayload[]): Promise<void> {
    if (drafts.length === 0) return
    await this.ensureDir()
    const savedAt = Date.now()
    for (const draft of drafts) {
      if (draft.content.length > MAX_NOTE_SIZE) continue
      const payload: DraftFile = {
        version: 1,
        relPath: draft.relPath,
        workspaceRoot,
        savedAt,
        content: draft.content
      }
      try {
        const file = path.join(this.dir, `${idFor(workspaceRoot, draft.relPath)}.json`)
        await atomicWriteFile(file, new TextEncoder().encode(JSON.stringify(payload)))
      } catch (err) {
        log.warn('draft write failed', draft.relPath, err)
      }
    }
  }

  async list(workspaceRoot?: string | null): Promise<DraftInfo[]> {
    await this.ensureDir()
    let names: string[] = []
    try {
      names = await fs.readdir(this.dir)
    } catch {
      return []
    }

    const out: DraftInfo[] = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const id = name.slice(0, -'.json'.length)
      const file = path.join(this.dir, name)
      try {
        const raw = await fs.readFile(file, 'utf-8')
        const parsed = JSON.parse(raw) as DraftFile
        if (parsed.version !== 1) continue
        if (workspaceRoot && parsed.workspaceRoot !== workspaceRoot) continue
        out.push({
          id,
          relPath: parsed.relPath,
          workspaceRoot: parsed.workspaceRoot,
          savedAt: parsed.savedAt,
          size: parsed.content.length
        })
      } catch {
        /* 损坏的草稿直接跳过 */
      }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt)
  }

  async read(id: string): Promise<DraftPayload | null> {
    await this.ensureDir()
    if (!/^[a-f0-9]{8,40}$/.test(id)) return null
    try {
      const raw = await fs.readFile(path.join(this.dir, `${id}.json`), 'utf-8')
      const parsed = JSON.parse(raw) as DraftFile
      return { relPath: parsed.relPath, content: parsed.content }
    } catch {
      return null
    }
  }

  async clear(id: string): Promise<void> {
    await this.ensureDir()
    if (!/^[a-f0-9]{8,40}$/.test(id)) return
    await fs.unlink(path.join(this.dir, `${id}.json`)).catch(() => undefined)
  }

  async clearByRelPath(workspaceRoot: string, relPath: string): Promise<void> {
    await this.clear(idFor(workspaceRoot, relPath))
  }
}

export const documentRecovery = new DocumentRecovery()
