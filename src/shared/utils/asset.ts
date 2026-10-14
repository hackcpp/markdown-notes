import { ASSET_SCHEME } from '../constants'
import { joinRel } from './path'

/**
 * 把笔记中的相对图片 / 附件路径转换成自定义协议 URL。
 * 主进程负责注册并校验该协议，渲染进程只负责拼 URL。
 */
export function toAssetUrl(src: string, docRelPath: string): string {
  const docDir = docRelPath.includes('/') ? docRelPath.slice(0, docRelPath.lastIndexOf('/')) : ''
  let target = src.replace(/\\/g, '/').trim().replace(/^\.\//, '')

  // 去掉可能的查询串 / 锚点（Windows 路径本身不含这些字符）
  const hashIndex = target.search(/[?#]/)
  let suffix = ''
  if (hashIndex >= 0) {
    suffix = target.slice(hashIndex)
    target = target.slice(0, hashIndex)
  }

  if (target.startsWith('/')) {
    target = target.slice(1)
  } else if (docDir) {
    target = joinRel(docDir, target)
  }

  return `${ASSET_SCHEME}://asset/?p=${encodeURIComponent(target)}${suffix}`
}

/** 是否是"需要走本地协议"的相对路径（外链、data:、锚点保持原样） */
export function isRelativeAsset(src: string): boolean {
  if (!src) return false
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src)) return false
  if (src.startsWith('#')) return false
  return true
}

/** 是否是可以安全交给系统浏览器打开的外部链接 */
export function isSafeExternalUrl(url: string): boolean {
  return /^(https?|mailto):/i.test(url)
}

/** 从 notes-asset URL 反解出相对路径（仅用于调试与测试） */
export function parseAssetUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${ASSET_SCHEME}:`) return null
    const p = parsed.searchParams.get('p')
    return p ?? null
  } catch {
    return null
  }
}
