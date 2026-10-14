import { promises as fs } from 'node:fs'
import { protocol } from 'electron'
import { ASSET_EXTENSIONS, ASSET_SCHEME, MAX_ASSET_SIZE, MIME_BY_EXT } from '@shared/constants'
import { extnameRel, isInside, platformCaseInsensitive, normalizeRelPath } from '@shared/utils/path'
import { workspaceService } from '../services/workspace/WorkspaceService'
import { log } from '../utils/logger'

const ASSET_EXT_SET = new Set(ASSET_EXTENSIONS)

/**
 * 为预览中的本地图片注册自定义协议。
 *
 * 为什么不直接用 file://：
 * - file:// 会把整个磁盘暴露给渲染进程的 URL 空间；
 * - 一旦将来渲染层出现 XSS，攻击者就能读取任意本地文件。
 *
 * notes-asset:// 只允许读取「当前工作区内 + 白名单图片扩展名」的文件，
 * 其余一律 403。渲染进程拿不到 file:// 的读取能力。
 */
export function registerAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      // 形式：notes-asset://asset/?p=<相对工作区路径>
      const rel = url.searchParams.get('p')
      if (!rel) return new Response('bad request', { status: 400 })

      const normalized = normalizeRelPath(rel)
      if (!normalized) return new Response('invalid path', { status: 400 })

      const root = workspaceService.getRoot()
      if (!root) return new Response('no workspace', { status: 403 })

      const abs = await workspaceService.resolveReal(normalized)
      const realRoot = await fs.realpath(root)
      if (!isInside(realRoot, abs, platformCaseInsensitive(process.platform))) {
        return new Response('forbidden', { status: 403 })
      }

      const ext = extnameRel(abs)
      if (!ASSET_EXT_SET.has(ext)) return new Response('unsupported type', { status: 403 })

      const stat = await fs.stat(abs)
      if (!stat.isFile()) return new Response('not a file', { status: 404 })
      if (stat.size > MAX_ASSET_SIZE) return new Response('too large', { status: 413 })

      const data = await fs.readFile(abs)
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'Content-Type': MIME_BY_EXT[ext] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
        }
      })
    } catch (err) {
      log.warn('asset protocol failed', err)
      return new Response('not found', { status: 404 })
    }
  })
}

/** 把笔记中的相对资源路径转成自定义协议 URL —— 见 @shared/utils/asset */
