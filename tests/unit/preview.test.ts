import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../src/renderer/src/features/preview/pipeline'

describe('renderMarkdown · 基础渲染', () => {
  it('加粗渲染为 strong', async () => {
    const { html } = await renderMarkdown('完全依赖 **自注意力机制** 建模。', 'a.md')
    expect(html).toContain('<strong>')
    expect(html).not.toContain('**')
  })

  it('标题生成 h1 且带锚点 id', async () => {
    const { html, headings } = await renderMarkdown('# 标题甲\n\n正文', 'b.md')
    expect(html).toContain('<h1')
    expect(headings).toHaveLength(1)
    expect(headings[0].text).toBe('标题甲')
  })

  it('列表、代码块、引用正常渲染', async () => {
    const md = ['- 甲\n- 乙\n\n```python\ndef a():\n    pass\n```\n\n> 引用内容'].join('\n')
    const { html } = await renderMarkdown(md, 'c.md')
    expect(html).toContain('<li>')
    expect(html).toContain('<pre')
    expect(html).toContain('blockquote')
  })

  it('任务列表与删除线（GFM）', async () => {
    const md = '- [x] 已完成\n- [ ] 未完成\n\n~~删除~~'
    const { html } = await renderMarkdown(md, 'd.md')
    expect(html).toContain('checkbox')
    expect(html).toContain('<del>')
  })
})

describe('renderMarkdown · Frontmatter 处理', () => {
  const md = ['---', 'title: 我的笔记', 'tags: [AI, 笔记]', '---', '', '# 正文标题', '', '内容'].join('\n')

  it('Frontmatter 不进入预览正文', async () => {
    const { html } = await renderMarkdown(md, 'e.md')
    expect(html).not.toContain('tags: [AI, 笔记]')
    expect(html).not.toContain('title: 我的笔记')
    expect(html).toContain('正文标题')
  })

  it('Frontmatter 不产生标题大纲', async () => {
    const { headings } = await renderMarkdown(md, 'f.md')
    expect(headings.map((h) => h.text)).toEqual(['正文标题'])
  })

  it('行内格式在含 Frontmatter 的文档中仍然生效', async () => {
    const withBold = ['---', 'tags: [AI]', '---', '', '依赖 **自注意力机制** 建模。'].join('\n')
    const { html } = await renderMarkdown(withBold, 'g.md')
    expect(html).toContain('<strong>')
  })
})

describe('renderMarkdown · 安全', () => {
  it('内嵌 script 标签被消毒', async () => {
    const { html } = await renderMarkdown('正文 <script>alert(1)</script> 结束', 'h.md')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('javascript: 链接被移除', async () => {
    const { html } = await renderMarkdown('[点我](javascript:alert(1))', 'i.md')
    expect(html.toLowerCase()).not.toContain('javascript:')
  })

  it('onclick 内联事件被移除', async () => {
    const { html } = await renderMarkdown('<img src="x" onerror="alert(1)">', 'j.md')
    expect(html).not.toContain('onerror')
  })

  it('相对图片重写为 notes-asset 协议', async () => {
    const { html } = await renderMarkdown('![图](./assets/pic.png)', 'notes/k.md')
    expect(html).toContain('notes-asset://')
    expect(html).not.toContain('src="./assets/pic.png"')
  })

  it('外链保留 http/https', async () => {
    const { html } = await renderMarkdown('[官网](https://example.com)', 'l.md')
    expect(html).toContain('https://example.com')
  })
})
