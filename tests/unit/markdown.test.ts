import { describe, expect, it } from 'vitest'
import {
  displayTitle,
  extractHeadings,
  extractTags,
  extractTitle,
  parseFrontmatter,
  slugify,
  stripInline
} from '@shared/markdown'

describe('extractHeadings', () => {
  it('按层级提取标题并记录行号', () => {
    const md = '# 一级\n\n正文\n\n## 二级\n### 三级\n'
    const headings = extractHeadings(md)
    expect(headings.map((h) => [h.level, h.text, h.line])).toEqual([
      [1, '一级', 0],
      [2, '二级', 4],
      [3, '三级', 5]
    ])
  })

  it('跳过围栏代码块里的伪标题', () => {
    const md = ['# 真标题', '', '```bash', '# 这是注释', '```', '', '# 另一个标题'].join('\n')
    const headings = extractHeadings(md)
    expect(headings.map((h) => h.text)).toEqual(['真标题', '另一个标题'])
  })

  it('波浪号围栏同样生效', () => {
    const md = ['~~~', '## 假标题', '~~~', '## 真标题'].join('\n')
    expect(extractHeadings(md).map((h) => h.text)).toEqual(['真标题'])
  })

  it('把 #标签 行排除在标题之外', () => {
    const md = '#标签\n\n# 真标题'
    expect(extractHeadings(md).map((h) => h.text)).toEqual(['真标题'])
  })

  it('重名标题生成唯一 slug', () => {
    const md = '# 笔记\n\n# 笔记\n\n# 笔记'
    const headings = extractHeadings(md)
    expect(headings.map((h) => h.slug)).toEqual(['笔记', '笔记-1', '笔记-2'])
  })

  it('去掉标题里的行内标记', () => {
    const md = '# **加粗** 与 `代码` 与 [链接](https://example.com)'
    expect(extractHeadings(md)[0].text).toBe('加粗 与 代码 与 链接')
  })

  it('六个以上的 # 不算标题', () => {
    expect(extractHeadings('####### 七级')).toHaveLength(0)
  })
})

describe('slugify', () => {
  it('保留中文', () => {
    expect(slugify('注意力机制')).toBe('注意力机制')
  })

  it('空格转连字符并转小写', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('去掉标点', () => {
    expect(slugify('A, B; C!')).toBe('a-b-c')
  })

  it('空输入回退到 section', () => {
    expect(slugify('   ')).toBe('section')
  })
})

describe('stripInline', () => {
  it('移除多种行内标记', () => {
    expect(stripInline('**a** *b* `c` ~~d~~ [e](f)')).toBe('a b c d e')
  })
})

describe('parseFrontmatter', () => {
  it('解析标量与内联数组', () => {
    const md = ['---', 'title: 我的笔记', 'tags: [AI, 笔记]', '---', '', '正文'].join('\n')
    const fm = parseFrontmatter(md)
    expect(fm?.attrs.title).toBe('我的笔记')
    expect(fm?.attrs.tags).toEqual(['AI', '笔记'])
    expect(fm?.bodyStartLine).toBe(5)
  })

  it('解析列表式数组', () => {
    const md = ['---', 'tags:', '  - AI', '  - 笔记', '---', '正文'].join('\n')
    const fm = parseFrontmatter(md)
    expect(fm?.attrs.tags).toEqual(['AI', '笔记'])
  })

  it('去掉引号', () => {
    const md = ['---', 'title: "带引号的标题"', '---'].join('\n')
    expect(parseFrontmatter(md)?.attrs.title).toBe('带引号的标题')
  })

  it('没有 Frontmatter 时返回 null', () => {
    expect(parseFrontmatter('# 只有标题')).toBeNull()
  })

  it('未闭合时返回 null', () => {
    expect(parseFrontmatter('---\ntitle: x\n')).toBeNull()
  })

  it('忽略注释行', () => {
    const md = ['---', '# 注释', 'title: x', '---'].join('\n')
    expect(parseFrontmatter(md)?.attrs.title).toBe('x')
    expect(parseFrontmatter(md)?.attrs['# 注释']).toBeUndefined()
  })
})

describe('extractTags', () => {
  it('兼容 tags 与 tag 字段', () => {
    expect(extractTags('---\ntags: [a, b]\n---')).toEqual(['a', 'b'])
    expect(extractTags('---\ntag: a\n---')).toEqual(['a'])
  })

  it('支持逗号与空格分隔的字符串', () => {
    expect(extractTags('---\ntags: a, b c\n---')).toEqual(['a', 'b', 'c'])
  })

  it('去掉 # 前缀并去重', () => {
    expect(extractTags('---\ntags: [#a, a]\n---')).toEqual(['a'])
  })

  it('没有 Frontmatter 时返回空数组', () => {
    expect(extractTags('# 标题')).toEqual([])
  })
})

describe('标题回退', () => {
  it('优先使用第一个 H1', () => {
    expect(extractTitle('# 页内标题', 'fallback')).toBe('页内标题')
  })

  it('其次使用 Frontmatter.title', () => {
    expect(extractTitle('---\ntitle: 元数据标题\n---\n\n正文', 'fallback')).toBe('元数据标题')
  })

  it('最后回退到文件名', () => {
    expect(extractTitle('正文', 'fallback')).toBe('fallback')
  })

  it('displayTitle 回退时去掉扩展名', () => {
    expect(displayTitle('正文', 'docs/my-note.md')).toBe('my-note')
  })
})
