import { describe, expect, it } from 'vitest'
import {
  countStats,
  decodeText,
  detectEol,
  encodeText,
  formatRelativeTime,
  hasUtf8Bom
} from '@shared/utils/text'

describe('detectEol', () => {
  it('识别 LF', () => {
    expect(detectEol('a\nb\nc')).toBe('\n')
  })

  it('识别 CRLF', () => {
    expect(detectEol('a\r\nb\r\nc')).toBe('\r\n')
  })

  it('混合时取多数', () => {
    expect(detectEol('a\r\nb\r\nc\nd')).toBe('\r\n')
  })

  it('没有换行时默认 LF', () => {
    expect(detectEol('abc')).toBe('\n')
  })
})

describe('decodeText', () => {
  it('剥离 BOM 并统一换行', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a\r\nb')])
    const result = decodeText(bytes)
    expect(result.hasBom).toBe(true)
    expect(result.content).toBe('a\nb')
    expect(result.eol).toBe('\r\n')
  })

  it('无 BOM 时不误判', () => {
    const result = decodeText(new TextEncoder().encode('a\nb'))
    expect(result.hasBom).toBe(false)
    expect(result.content).toBe('a\nb')
  })

  it('hasUtf8Bom 边界', () => {
    expect(hasUtf8Bom(new Uint8Array([0xef, 0xbb]))).toBe(false)
    expect(hasUtf8Bom(new Uint8Array([0xef, 0xbb, 0xbf]))).toBe(true)
  })
})

describe('encodeText', () => {
  it('按 LF 编码', () => {
    expect(new TextDecoder().decode(encodeText('a\nb', '\n', false))).toBe('a\nb')
  })

  it('按 CRLF 还原', () => {
    expect(new TextDecoder().decode(encodeText('a\nb', '\r\n', false))).toBe('a\r\nb')
  })

  it('重新加上 BOM', () => {
    const bytes = encodeText('a', '\n', true)
    expect(bytes[0]).toBe(0xef)
    expect(hasUtf8Bom(bytes)).toBe(true)
  })

  it('往返转换后内容不变', () => {
    const original = '第一行\r\n第二行\r\n'
    const decoded = decodeText(new TextEncoder().encode(original))
    const reEncoded = new TextDecoder().decode(encodeText(decoded.content, decoded.eol, false))
    expect(reEncoded).toBe(original)
  })
})

describe('countStats', () => {
  it('统计中日韩字符与拉丁词', () => {
    const stats = countStats('你好 world\n第二行')
    expect(stats.chars).toBe('你好 world\n第二行'.length)
    expect(stats.lines).toBe(2)
    expect(stats.cjk).toBe(5)
    expect(stats.words).toBe(6)
  })

  it('空内容', () => {
    expect(countStats('')).toEqual({ chars: 0, words: 0, cjk: 0, lines: 0 })
  })
})

describe('formatRelativeTime', () => {
  const now = Date.UTC(2026, 0, 10, 12, 0, 0)

  it('秒级', () => {
    expect(formatRelativeTime(now - 3000, now)).toBe('3 秒前')
  })

  it('分钟级', () => {
    expect(formatRelativeTime(now - 5 * 60 * 1000, now)).toBe('5 分钟前')
  })

  it('小时级', () => {
    expect(formatRelativeTime(now - 3 * 3600 * 1000, now)).toBe('3 小时前')
  })

  it('天级', () => {
    expect(formatRelativeTime(now - 2 * 86400 * 1000, now)).toBe('2 天前')
  })

  it('超过一个月回退到日期', () => {
    expect(formatRelativeTime(now - 90 * 86400 * 1000, now)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('未来时间按刚刚处理', () => {
    expect(formatRelativeTime(now + 10000, now)).toBe('刚刚')
  })
})
