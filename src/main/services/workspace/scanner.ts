import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  IGNORED_DIRS,
  IGNORED_FILES,
  NOTE_EXTENSIONS,
  SCAN_MAX_DEPTH,
  TEMP_SUFFIX
} from '@shared/constants'
import type { FileNode } from '@shared/types'

const NOTE_EXT_SET = new Set<string>(NOTE_EXTENSIONS)
const IGNORED_DIR_SET = new Set<string>(IGNORED_DIRS)
const IGNORED_FILE_SET = new Set<string>(IGNORED_FILES)

/** 单次扫描最多返回的条目数，防止在超大目录下把渲染进程拖死 */
const MAX_ENTRIES = 30000

export interface ScanOptions {
  /** 是否收集非笔记文件（图片 / 附件）。V0.1 的文件树只展示笔记与目录 */
  includeAssets?: boolean
  maxEntries?: number
}

/**
 * 扫描工作区目录，产出文件树。
 *
 * 规则（与方案 5.3 一致）：
 * - 跳过 .git / node_modules / 构建产物等目录
 * - 跳过隐藏文件与临时文件
 * - 目录在前、文件在后，按名称排序
 * - 不跟随符号链接（避免环与越界）
 */
export async function scanWorkspace(root: string, options: ScanOptions = {}): Promise<FileNode[]> {
  const budget = { left: options.maxEntries ?? MAX_ENTRIES }
  return scanDirectory(root, '', 0, budget, options)
}

async function scanDirectory(
  absDir: string,
  relDir: string,
  depth: number,
  budget: { left: number },
  options: ScanOptions
): Promise<FileNode[]> {
  if (depth > SCAN_MAX_DEPTH || budget.left <= 0) return []

  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true })
  } catch {
    return []
  }

  const dirs: FileNode[] = []
  const files: FileNode[] = []

  for (const entry of entries) {
    if (budget.left <= 0) break
    const name = entry.name
    if (name.startsWith('.')) continue
    if (name.endsWith(TEMP_SUFFIX)) continue
    if (IGNORED_FILE_SET.has(name)) continue

    const childRel = relDir ? `${relDir}/${name}` : name

    // 符号链接一律跳过：既不跟随目录，也不把链出去的笔记当成工作区内容
    if (entry.isSymbolicLink()) continue

    if (entry.isDirectory()) {
      if (IGNORED_DIR_SET.has(name)) continue
      budget.left--
      const children = await scanDirectory(
        path.join(absDir, name),
        childRel,
        depth + 1,
        budget,
        options
      )
      dirs.push({ name, relPath: childRel, kind: 'directory', children })
      continue
    }

    if (!entry.isFile()) continue
    const ext = path.extname(name).toLowerCase()
    const isNote = NOTE_EXT_SET.has(ext)
    if (!isNote && !options.includeAssets) continue
    budget.left--
    files.push({ name, relPath: childRel, kind: 'file' })
  }

  const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })
  dirs.sort((a, b) => collator.compare(a.name, b.name))
  files.sort((a, b) => collator.compare(a.name, b.name))
  return [...dirs, ...files]
}

/** 递归统计文件树中的笔记数量 */
export function countNotes(nodes: FileNode[]): number {
  let total = 0
  for (const node of nodes) {
    if (node.kind === 'file') total++
    else if (node.children) total += countNotes(node.children)
  }
  return total
}

/** 在文件树中按相对路径查找节点 */
export function findNode(nodes: FileNode[], relPath: string): FileNode | null {
  const segments = relPath.split('/')
  let current: FileNode | undefined
  let level = nodes
  for (const segment of segments) {
    current = level.find((n) => n.name === segment)
    if (!current) return null
    level = current.children ?? []
  }
  return current ?? null
}
