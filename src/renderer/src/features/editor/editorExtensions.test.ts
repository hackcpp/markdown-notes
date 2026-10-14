import { describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { buildEditorExtensions } from './editorSetup'

/**
 * 编辑器扩展装配的回归测试。
 *
 * 这里守的是一个真实发生过的严重缺陷：`buildEditorExtensions` 漏挂
 * `EditorView.updateListener` 时，编辑内容既不会把文档标记为脏（自动保存不调度，
 * Ctrl+S 也会因状态仍是 clean 而被跳过），也不会刷新预览镜像；
 * 关闭窗口时更会因为状态一直是 clean 而静默丢弃未保存的修改。
 */
describe('buildEditorExtensions', () => {
  const prefs = { showLineNumbers: false, wrapLines: true, fontSize: 15 }

  it('传入监听后，EditorState 中能取到该监听', () => {
    const listener = EditorView.updateListener.of(() => {})
    const state = EditorState.create({
      doc: 'hello',
      extensions: buildEditorExtensions(prefs, false, listener)
    })

    expect(state.facet(EditorView.updateListener)).toHaveLength(1)
  })

  it('同一监听实例被多份文档状态共享时不丢失', () => {
    const spy = vi.fn()
    const listener = EditorView.updateListener.of(spy)

    for (let i = 0; i < 3; i++) {
      const state = EditorState.create({
        doc: `doc-${i}`,
        extensions: buildEditorExtensions(prefs, i % 2 === 0, listener)
      })
      expect(state.facet(EditorView.updateListener)).toHaveLength(1)
    }
  })

  it('未传入监听时不会凭空造出一个监听', () => {
    const state = EditorState.create({
      doc: 'hello',
      extensions: buildEditorExtensions(prefs, false)
    })

    expect(state.facet(EditorView.updateListener)).toHaveLength(0)
  })
})
