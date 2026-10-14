import { describe, expect, it } from 'vitest'
import {
  basenameRel,
  dirnameRel,
  extnameRel,
  isInside,
  isValidSegment,
  joinRel,
  normalizeRelPath,
  platformCaseInsensitive,
  sanitizeFileName,
  stemRel
} from '@shared/utils/path'

describe('normalizeRelPath', () => {
  it('保留正常的相对路径', () => {
    expect(normalizeRelPath('notes/a.md')).toBe('notes/a.md')
  })

  it('统一 Windows 反斜杠', () => {
    expect(normalizeRelPath('notes\\sub\\a.md')).toBe('notes/sub/a.md')
  })

  it('折叠 . 与多余的斜杠', () => {
    expect(normalizeRelPath('./notes//a.md')).toBe('notes/a.md')
  })

  it('拒绝绝对路径与盘符', () => {
    expect(normalizeRelPath('/etc/passwd')).toBeNull()
    expect(normalizeRelPath('C:/Windows/system32')).toBeNull()
    expect(normalizeRelPath('C:\\Windows')).toBeNull()
  })

  it('拒绝越界路径', () => {
    expect(normalizeRelPath('../secrets.md')).toBeNull()
    expect(normalizeRelPath('notes/../../secrets.md')).toBeNull()
  })

  it('允许在越界后再折回工作区内', () => {
    expect(normalizeRelPath('notes/../a.md')).toBe('a.md')
  })

  it('拒绝空路径与控制字符', () => {
    expect(normalizeRelPath('')).toBeNull()
    expect(normalizeRelPath('   ')).toBeNull()
    expect(normalizeRelPath('notes/\u0000a.md')).toBeNull()
  })

  it('拒绝 ~ 开头的路径', () => {
    expect(normalizeRelPath('~/Documents/a.md')).toBeNull()
  })
})

describe('isInside', () => {
  it('识别子路径', () => {
    expect(isInside('/w/notes', '/w/notes/a.md')).toBe(true)
  })

  it('识别同路径', () => {
    expect(isInside('/w/notes', '/w/notes')).toBe(true)
  })

  it('拒绝前缀相似的兄弟目录', () => {
    expect(isInside('/w/notes', '/w/notes-evil/a.md')).toBe(false)
  })

  it('拒绝外部路径', () => {
    expect(isInside('/w/notes', '/etc/passwd')).toBe(false)
  })

  it('大小写不敏感模式下仍能拦截', () => {
    expect(isInside('C:/Work/N', 'c:/work/n/a.md', true)).toBe(true)
    expect(isInside('C:/Work/N', 'c:/work/other/a.md', true)).toBe(false)
  })

  it('正确处理尾部斜杠', () => {
    expect(isInside('/w/notes/', '/w/notes/a.md')).toBe(true)
  })
})

describe('platformCaseInsensitive', () => {
  it('Windows 与 macOS 不敏感', () => {
    expect(platformCaseInsensitive('win32')).toBe(true)
    expect(platformCaseInsensitive('darwin')).toBe(true)
    expect(platformCaseInsensitive('linux')).toBe(false)
  })
})

describe('isValidSegment', () => {
  it('接受普通文件名', () => {
    expect(isValidSegment('我的笔记.md')).toBe(true)
    expect(isValidSegment('note-1.md')).toBe(true)
  })

  it('拒绝非法字符', () => {
    expect(isValidSegment('a<b.md')).toBe(false)
    expect(isValidSegment('a|b.md')).toBe(false)
    expect(isValidSegment('a?b.md')).toBe(false)
  })

  it('拒绝以点开头或以点/空格结尾', () => {
    expect(isValidSegment('.hidden')).toBe(false)
    expect(isValidSegment('name.')).toBe(false)
    expect(isValidSegment('name ')).toBe(false)
  })

  it('拒绝 . 与 ..', () => {
    expect(isValidSegment('.')).toBe(false)
    expect(isValidSegment('..')).toBe(false)
  })
})

describe('路径拆分组装', () => {
  it('dirname / basename / stem / ext 协同工作', () => {
    const path = 'docs/guide/intro.md'
    expect(dirnameRel(path)).toBe('docs/guide')
    expect(basenameRel(path)).toBe('intro.md')
    expect(stemRel(path)).toBe('intro')
    expect(extnameRel(path)).toBe('.md')
  })

  it('顶层文件没有父目录', () => {
    expect(dirnameRel('a.md')).toBe('')
  })

  it('joinRel 清理首尾斜杠', () => {
    expect(joinRel('/docs/', '/guide', 'a.md')).toBe('docs/guide/a.md')
    expect(joinRel('', 'a.md')).toBe('a.md')
  })
})

describe('sanitizeFileName', () => {
  it('替换非法字符', () => {
    expect(sanitizeFileName('a:b/c?d.md')).toBe('a-b-c-d.md')
  })

  it('去掉开头的连续点', () => {
    expect(sanitizeFileName('...note.md')).toBe('note.md')
  })
})
