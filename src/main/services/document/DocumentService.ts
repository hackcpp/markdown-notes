import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { shell } from 'electron'
import { MAX_NOTE_SIZE, NOTE_EXTENSIONS } from '@shared/constants'
import type { DocumentData, FailureReason, FileOpResult, SaveDocumentInput, SaveDocumentResult } from '@shared/types'
import { decodeText, encodeText } from '@shared/utils/text'
import { extnameRel, isValidSegment, normalizeRelPath, dirnameRel, basenameRel, stemRel } from '@shared/utils/path'
import { AppError, mapNodeError, toFileOpFailure } from '../../utils/errors'
import { log } from '../../utils/logger'
import { workspaceService } from '../workspace/WorkspaceService'
import { atomicWriteFile } from './AtomicWriter'

const NOTE_EXT_SET = new Set<string>(NOTE_EXTENSIONS)

function sha1(data: Uint8Array): string {
  return createHash('sha1').update(data).digest('hex')
}

export interface DiskVersion {
  exists: boolean
  hash?: string
  mtimeMs?: number
  size?: number
}

function fail(reason: FailureReason, message: string, extra: Partial<SaveDocumentResult> = {}): SaveDocumentResult {
  return { ok: false, reason, message, ...extra } as SaveDocumentResult
}

/**
 * 文档服务：磁盘读写、原子保存、版本校验、串行写入。
 *
 * 这里是整个软件最不能出错的地方，因此把三条不变量写在最前面：
 * 1. 同一个文件的写入任务串行执行，旧任务永远不会覆盖新内容。
 * 2. 保存前校验磁盘基准版本，外部改动过就拒绝写入并回报冲突。
 * 3. 任何失败都不返回"已保存"。
 */
class DocumentService {
  /** 每个绝对路径一条串行队列 */
  private locks = new Map<string, Promise<unknown>>()

  private withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve()
    // 不论上一个任务成功还是失败，都继续执行下一个
    const run = previous.then(task, task)
    // 队列本身永远不 reject，否则会中断后续任务
    const guard = run.then(
      () => undefined,
      () => undefined
    )
    this.locks.set(key, guard)
    void guard.then(() => {
      // 队尾已空闲时回收，避免 Map 无限增长
      if (this.locks.get(key) === guard) this.locks.delete(key)
    })
    return run
  }

  // ---------------------------------------------------------------- 读

  async read(relPath: string): Promise<DocumentData> {
    const normalized = normalizeRelPath(relPath)
    if (!normalized) throw new AppError('INVALID_NAME')

    const abs = await workspaceService.resolveReal(normalized)
    let stat: import('node:fs').Stats
    try {
      stat = await fs.stat(abs)
    } catch (err) {
      throw mapNodeError(err)
    }
    if (!stat.isFile()) throw new AppError('NOT_A_FILE')
    if (stat.size > MAX_NOTE_SIZE) {
      throw new AppError('TOO_LARGE', `文件体积 ${(stat.size / 1024 / 1024).toFixed(1)} MB，超出 10 MB 上限`)
    }

    const buffer = await fs.readFile(abs).catch((err) => {
      throw mapNodeError(err)
    })
    const bytes = new Uint8Array(buffer)
    const { content, eol, hasBom } = decodeText(bytes)

    return {
      relPath: normalized,
      content,
      hash: sha1(bytes),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      eol,
      hasBom
    }
  }

  /** 读取磁盘当前版本信息，不读内容（用于冲突处理与外部变更判断） */
  async version(relPath: string): Promise<DiskVersion> {
    const abs = await workspaceService.resolveReal(relPath)
    try {
      const stat = await fs.stat(abs)
      if (!stat.isFile()) return { exists: false }
      const buffer = await fs.readFile(abs)
      return {
        exists: true,
        hash: sha1(new Uint8Array(buffer)),
        mtimeMs: stat.mtimeMs,
        size: stat.size
      }
    } catch {
      return { exists: false }
    }
  }

  // ---------------------------------------------------------------- 写

  async save(input: SaveDocumentInput): Promise<SaveDocumentResult> {
    const normalized = normalizeRelPath(input.relPath)
    if (!normalized) return fail('INVALID_NAME', '文件名不合法')

    let abs: string
    try {
      abs = await workspaceService.resolveReal(normalized)
    } catch (err) {
      const appErr = err instanceof AppError ? err : mapNodeError(err)
      return fail(appErr.reason, appErr.message)
    }

    const bytes = encodeText(input.content, input.eol, input.hasBom)
    if (bytes.byteLength > MAX_NOTE_SIZE) {
      return fail('TOO_LARGE', '内容超出单文件 10 MB 上限，已停止保存')
    }

    return this.withLock(abs, async () => {
      const force = input.baseHash === ''

      if (!force) {
        const disk = await this.version(normalized)
        if (!disk.exists) {
          return fail('NOT_FOUND', '文件已被外部删除或移动')
        }
        if (disk.hash !== input.baseHash) {
          return fail('CONFLICT', '文件已被其他程序修改', {
            diskHash: disk.hash,
            diskMtimeMs: disk.mtimeMs
          })
        }
      }

      try {
        await atomicWriteFile(abs, bytes)
      } catch (err) {
        const appErr = err instanceof AppError ? err : mapNodeError(err)
        log.warn(`save failed: ${normalized} → ${appErr.reason}`)
        return fail(appErr.reason, appErr.message)
      }

      const stat = await fs.stat(abs).catch(() => null)
      return {
        ok: true,
        hash: sha1(bytes),
        mtimeMs: stat?.mtimeMs ?? Date.now(),
        savedAt: Date.now(),
        bytes: bytes.byteLength
      }
    })
  }

  // ---------------------------------------------------------------- 文件操作

  async createFile(relPath: string, content: string): Promise<FileOpResult> {
    const normalized = normalizeRelPath(ensureExtension(relPath))
    if (!normalized) return { ok: false, reason: 'INVALID_NAME', message: '文件名不合法' }
    if (!isValidSegment(basenameRel(normalized))) {
      return { ok: false, reason: 'INVALID_NAME', message: '文件名包含不允许的字符' }
    }

    return this.withLock(normalized, async () => {
      try {
        const abs = await workspaceService.resolveReal(normalized)
        // 'wx' 保证绝不覆盖已存在的文件
        const handle = await fs.open(abs, 'wx')
        try {
          await handle.writeFile(encodeText(content, '\n', false))
        } finally {
          await handle.close()
        }
        return { ok: true } as FileOpResult
      } catch (err) {
        return toFileOpFailure(err)
      }
    })
  }

  async createFolder(relPath: string): Promise<FileOpResult> {
    const normalized = normalizeRelPath(relPath)
    if (!normalized) return { ok: false, reason: 'INVALID_NAME', message: '文件夹名不合法' }
    if (!isValidSegment(basenameRel(normalized))) {
      return { ok: false, reason: 'INVALID_NAME', message: '文件夹名包含不允许的字符' }
    }
    try {
      const abs = await workspaceService.resolveReal(normalized)
      await fs.mkdir(abs)
      return { ok: true }
    } catch (err) {
      return toFileOpFailure(err)
    }
  }

  async rename(from: string, to: string): Promise<FileOpResult> {
    const normalizedFrom = normalizeRelPath(from)
    const normalizedTo = normalizeRelPath(ensureExtension(to, extnameRel(from)))
    if (!normalizedFrom || !normalizedTo) {
      return { ok: false, reason: 'INVALID_NAME', message: '路径不合法' }
    }
    if (!isValidSegment(basenameRel(normalizedTo))) {
      return { ok: false, reason: 'INVALID_NAME', message: '文件名包含不允许的字符' }
    }
    if (normalizedFrom === normalizedTo) return { ok: true }

    try {
      const fromAbs = await workspaceService.resolveReal(normalizedFrom)
      const toAbs = await workspaceService.resolveReal(normalizedTo)

      const onlyCaseChange = fromAbs.toLowerCase() === toAbs.toLowerCase()
      if (!onlyCaseChange) {
        const exists = await fs
          .stat(toAbs)
          .then(() => true)
          .catch(() => false)
        if (exists) {
          return { ok: false, reason: 'ALREADY_EXISTS', message: '目标已存在同名文件或文件夹' }
        }
      }

      await fs.rename(fromAbs, toAbs)
      // 重命名后清理旧的临时残留
      if (dirnameRel(normalizedFrom) !== dirnameRel(normalizedTo)) {
        // 目标父目录的临时文件已在写入时清理，这里无需额外处理
      }
      return { ok: true }
    } catch (err) {
      return toFileOpFailure(err)
    }
  }

  /** 删除：一律进系统回收站，不做物理删除 */
  async remove(relPath: string): Promise<FileOpResult> {
    const normalized = normalizeRelPath(relPath)
    if (!normalized) return { ok: false, reason: 'INVALID_NAME', message: '路径不合法' }

    try {
      const root = workspaceService.requireRoot()
      const abs = await workspaceService.resolveReal(normalized)
      if (abs === root) {
        return { ok: false, reason: 'BLOCKED', message: '不能删除工作区根目录' }
      }
      await shell.trashItem(abs)
      return { ok: true }
    } catch (err) {
      const appErr = mapNodeError(err)
      return { ok: false, reason: appErr.reason, message: `移入回收站失败：${appErr.message}` }
    }
  }

  async reveal(relPath: string): Promise<void> {
    const abs = await workspaceService.resolveReal(relPath)
    shell.showItemInFolder(abs)
  }

  /** 在工作区根目录创建唯一的默认笔记名 */
  async suggestNewNoteName(dirRel: string, base = '未命名笔记'): Promise<string> {
    const root = workspaceService.getRoot()
    const dir = dirRel ? normalizeRelPath(dirRel) ?? '' : ''
    for (let i = 0; i < 200; i++) {
      const name = i === 0 ? `${base}.md` : `${base} ${i + 1}.md`
      const candidate = dir ? `${dir}/${name}` : name
      const abs = root ? path.join(root, ...candidate.split('/')) : candidate
      const exists = abs
        ? await fs
            .stat(abs)
            .then(() => true)
            .catch(() => false)
        : false
      if (!exists) return candidate
    }
    return `${base} ${Date.now()}.md`
  }
}

/** 没写扩展名时补上默认扩展名；已带扩展名则原样返回 */
export function ensureExtension(relPath: string, fallbackExt = '.md'): string {
  const ext = extnameRel(relPath)
  if (NOTE_EXT_SET.has(ext)) return relPath
  if (ext === '') return `${relPath}${fallbackExt}`
  // 明确写了别的扩展名（例如 .png）时保持不动，由上层校验
  return relPath
}

/** 生成标题 + 正文组成的默认内容 */
export function defaultNoteContent(title: string): string {
  const stem = stemRel(`${title}`) || title
  return `---\ncreated: ${new Date().toISOString().slice(0, 10)}\ntags: []\n---\n\n# ${stem}\n\n`
}

export const documentService = new DocumentService()
