/**
 * 纯字符串路径工具（不依赖 node:path，渲染进程也能安全引用）。
 * 约定：所有"相对路径"都使用 POSIX 分隔符 ' / '，且永远不以 '/' 开头。
 */

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/** 把 Windows 反斜杠统一成 '/' */
export function toPosix(input: string): string {
  return input.replace(/\\/g, '/')
}

/** 去掉末尾分隔符（保留根路径如 '/' 或 'C:/'） */
export function stripTrailingSlash(input: string): string {
  const p = toPosix(input)
  if (p === '/' || /^[a-zA-Z]:\/$/.test(p)) return p
  return p.replace(/\/+$/, '')
}

/**
 * 归一化用户/渲染进程传入的相对路径。
 * 非法（绝对路径、盘符、越界、空、含控制字符）时返回 null。
 */
export function normalizeRelPath(input: string): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw) return null
  if (CONTROL_CHARS.test(raw)) return null
  const unified = toPosix(raw)
  if (unified.startsWith('/')) return null
  if (/^[a-zA-Z]:/.test(unified)) return null
  if (unified.startsWith('~')) return null
  if (unified.includes('\0')) return null

  const parts: string[] = []
  for (const seg of unified.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (parts.length === 0) return null
      parts.pop()
      continue
    }
    if (seg === '.') continue
    parts.push(seg)
  }
  if (parts.length === 0) return null
  return parts.join('/')
}

/** 仅做格式校验，不做归一化 */
export function isSafeRelPath(input: string): boolean {
  return normalizeRelPath(input) !== null
}

/** 父目录（相对路径）；顶层文件返回 '' */
export function dirnameRel(relPath: string): string {
  const p = toPosix(relPath)
  const idx = p.lastIndexOf('/')
  return idx < 0 ? '' : p.slice(0, idx)
}

/** 文件名（含扩展名） */
export function basenameRel(relPath: string): string {
  const p = toPosix(relPath)
  const idx = p.lastIndexOf('/')
  return idx < 0 ? p : p.slice(idx + 1)
}

/** 去掉扩展名的文件名 */
export function stemRel(relPath: string): string {
  const base = basenameRel(relPath)
  const idx = base.lastIndexOf('.')
  return idx <= 0 ? base : base.slice(0, idx)
}

export function extnameRel(relPath: string): string {
  const base = basenameRel(relPath)
  const idx = base.lastIndexOf('.')
  return idx <= 0 ? '' : base.slice(idx).toLowerCase()
}

export function joinRel(...parts: string[]): string {
  return parts
    .map((p) => toPosix(p).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
}

/**
 * target 是否位于 root 之内（或就是 root 本身）。
 * caseInsensitive 在 Windows / macOS 上传 true，避免大小写绕过边界检查。
 */
export function isInside(root: string, target: string, caseInsensitive = false): boolean {
  const r = stripTrailingSlash(root)
  const t = stripTrailingSlash(target)
  const a = caseInsensitive ? r.toLowerCase() : r
  const b = caseInsensitive ? t.toLowerCase() : t
  if (a === b) return true
  if (!b.startsWith(a)) return false
  return b.charAt(a.length) === '/'
}

/** 平台是否默认大小写不敏感 */
export function platformCaseInsensitive(platform: string): boolean {
  return platform === 'win32' || platform === 'darwin'
}

/** 生成一个合法的文件名（去掉不允许出现在文件名里的字符） */
export function sanitizeFileName(input: string): string {
  return input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 120)
    .trim()
}

/** 校验单个路径段是否是合法文件名 */
export function isValidSegment(seg: string): boolean {
  if (!seg) return false
  if (seg === '.' || seg === '..') return false
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(seg)) return false
  if (/[. ]$/.test(seg)) return false
  if (/^\./.test(seg)) return false
  return true
}
