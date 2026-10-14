/**
 * 文本处理：换行风格、BOM、编码。
 * 纯函数，主进程与渲染进程都可使用。
 */
import type { Eol } from '../types'

export interface TextBundle {
  content: string
  eol: Eol
  hasBom: boolean
}

const BOM = '\uFEFF'

/** 判断字节流是否带 UTF-8 BOM */
export function hasUtf8Bom(buffer: Uint8Array): boolean {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
}

/** 统计占多数的换行风格；没有换行时返回 \n */
export function detectEol(text: string): Eol {
  let crlf = 0
  let lf = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 10) {
      if (i > 0 && text.charCodeAt(i - 1) === 13) crlf++
      else lf++
    }
  }
  return crlf > lf ? '\r\n' : '\n'
}

/** 解码磁盘内容：剥离 BOM、把换行统一成 \n */
export function decodeText(buffer: Uint8Array): TextBundle {
  const bom = hasUtf8Bom(buffer)
  const body = bom ? buffer.subarray(3) : buffer
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(body)
  const eol = detectEol(raw)
  return { content: raw.replace(/\r\n/g, '\n'), eol, hasBom: bom }
}

/** 按原文件的换行风格与 BOM 重新编码，保证不擅自改写文件格式 */
export function encodeText(content: string, eol: Eol, withBom: boolean): Uint8Array {
  const body = eol === '\r\n' ? content.replace(/\n/g, '\r\n') : content
  const text = withBom ? BOM + body : body
  return new TextEncoder().encode(text)
}

/** 终稿结束时是否带换行（用于保持文件尾部风格一致） */
export function endsWithNewline(content: string): boolean {
  return /\n$/.test(content)
}

/** 简易统计：字符数、词数（拉丁按空白切分 + CJK 逐字计数）、行数 */
export function countStats(content: string): {
  chars: number
  words: number
  cjk: number
  lines: number
} {
  const chars = content.length
  const lines = content.length === 0 ? 0 : content.split('\n').length
  let cjk = 0
  for (const ch of content) {
    const code = ch.codePointAt(0) ?? 0
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      cjk++
    }
  }
  const latin = content.replace(
    /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g,
    ' '
  )
  const words = latin.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length + cjk
  return { chars, words, cjk, lines }
}

/** 相对时间描述，用于状态栏与草稿列表 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp)
  const sec = Math.floor(diff / 1000)
  // 仅"几乎同时"归为刚刚，其余按秒显示，避免几秒前的修改被吞成模糊描述
  if (sec < 2) return '刚刚'
  if (sec < 60) return `${sec} 秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

export function formatClock(timestamp: number): string {
  const d = new Date(timestamp)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds()
  ).padStart(2, '0')}`
}
