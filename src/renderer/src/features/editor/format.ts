import { EditorSelection, type ChangeSpec } from '@codemirror/state'
import { EditorView, type KeyBinding } from '@codemirror/view'

export type FormatCommand =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'codeBlock'
  | 'link'
  | 'image'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'quote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'horizontalRule'
  | 'table'
  | 'clearFormat'

export interface FormatCommandInfo {
  id: FormatCommand
  label: string
  hint: string
  shortcut?: string
}

/** 工具栏 / 快捷键背后的命令清单（工具栏按这个顺序渲染） */
export const FORMAT_COMMANDS: FormatCommandInfo[] = [
  { id: 'bold', label: 'B', hint: '加粗', shortcut: 'Ctrl+B' },
  { id: 'italic', label: 'I', hint: '斜体', shortcut: 'Ctrl+I' },
  { id: 'strikethrough', label: 'S', hint: '删除线', shortcut: 'Ctrl+Shift+X' },
  { id: 'inlineCode', label: '‹›', hint: '行内代码', shortcut: 'Ctrl+E' },
  { id: 'heading1', label: 'H1', hint: '一级标题', shortcut: 'Ctrl+1' },
  { id: 'heading2', label: 'H2', hint: '二级标题', shortcut: 'Ctrl+2' },
  { id: 'heading3', label: 'H3', hint: '三级标题', shortcut: 'Ctrl+3' },
  { id: 'quote', label: '❝', hint: '引用', shortcut: 'Ctrl+Shift+Q' },
  { id: 'bulletList', label: '•', hint: '无序列表', shortcut: 'Ctrl+Shift+8' },
  { id: 'orderedList', label: '1.', hint: '有序列表', shortcut: 'Ctrl+Shift+7' },
  { id: 'taskList', label: '☑', hint: '任务列表', shortcut: 'Ctrl+Shift+9' },
  { id: 'link', label: '链接', hint: '插入链接', shortcut: 'Ctrl+K' },
  { id: 'image', label: '图片', hint: '插入图片', shortcut: 'Ctrl+Shift+I' },
  { id: 'codeBlock', label: '代码块', hint: '代码块', shortcut: 'Ctrl+Shift+K' },
  { id: 'table', label: '表格', hint: '插入表格' },
  { id: 'horizontalRule', label: '分隔线', hint: '分隔线' }
]

/** 块级模板中的光标哨兵：插入后光标停在该位置 */
const CARET = '\u0000'

// ---------------------------------------------------------------- 基础工具

/** 用成对标记包裹选区；无选区时插入占位文本并把光标放在标记中间 */
function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholder: string
): boolean {
  const { state } = view
  if (state.selection.ranges.length !== 1) return false

  const range = state.selection.main
  const selected = state.sliceDoc(range.from, range.to)
  const text = selected || placeholder

  const selection = selected
    ? EditorSelection.range(range.from + before.length, range.from + before.length + text.length)
    : EditorSelection.cursor(range.from + before.length + text.length)

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `${before}${text}${after}` },
    selection
  })
  return true
}

/**
 * 行前缀切换。
 *
 * 同一行已在选中范围内只处理一次；光标位置由 CodeMirror 自动映射，
 * 因此不需要手工计算偏移。
 */
function toggleLinePrefix(view: EditorView, prefix: string, pattern: RegExp): boolean {
  const { state } = view
  const edits: ChangeSpec[] = []
  const seen = new Set<number>()

  for (const range of state.selection.ranges) {
    const firstLine = state.doc.lineAt(range.from)
    const lastLine = state.doc.lineAt(range.to)
    for (let n = firstLine.number; n <= lastLine.number; n++) {
      const line = state.doc.line(n)
      if (seen.has(line.from)) continue
      seen.add(line.from)

      const match = pattern.exec(line.text)
      if (match) {
        edits.push({ from: line.from, to: line.from + match[0].length, insert: '' })
      } else {
        const indent = /^(\s*)/.exec(line.text)?.[1] ?? ''
        edits.push({ from: line.from, to: line.from, insert: `${indent}${prefix}` })
      }
    }
  }

  if (edits.length === 0) return false
  view.dispatch({ changes: edits })
  return true
}

/** 插入块级片段；光标所在行有正文时自动补换行，避免粘行 */
function insertBlock(view: EditorView, template: string): boolean {
  const { state } = view
  const range = state.selection.main
  const line = state.doc.lineAt(range.from)

  const markerIndex = template.indexOf(CARET)
  const block = markerIndex < 0 ? template : template.replace(CARET, '')
  const caretInBlock = markerIndex < 0 ? block.length : markerIndex

  const needsLeading = state.sliceDoc(line.from, range.from).trim().length > 0
  const needsTrailing = state.sliceDoc(range.to, line.to).trim().length > 0
  const lead = needsLeading ? '\n' : ''
  const tail = needsTrailing ? '\n' : ''

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `${lead}${block}${tail}` },
    selection: EditorSelection.cursor(range.from + lead.length + caretInBlock)
  })
  return true
}

const HEADING_PATTERN = /^ {0,3}#{1,6}\s+/
const QUOTE_PATTERN = /^ {0,3}>\s?/
const TASK_PATTERN = /^(\s*)[-*+]\s+\[[ xX]\]\s+/
const BULLET_PATTERN = /^(\s*)[-*+]\s+/
const ORDERED_PATTERN = /^(\s*)\d+[.)]\s+/

// ---------------------------------------------------------------- 命令

export function runFormatCommand(view: EditorView, command: FormatCommand): boolean {
  switch (command) {
    case 'bold':
      return wrapSelection(view, '**', '**', '加粗文本')
    case 'italic':
      return wrapSelection(view, '*', '*', '斜体文本')
    case 'strikethrough':
      return wrapSelection(view, '~~', '~~', '删除文本')
    case 'inlineCode':
      return wrapSelection(view, '`', '`', 'code')
    case 'link':
      return wrapSelection(view, '[', '](https://)', '链接文字')
    case 'image':
      return wrapSelection(view, '![', '](图片相对路径.png)', '图片描述')

    case 'heading1':
      return toggleLinePrefix(view, '# ', HEADING_PATTERN)
    case 'heading2':
      return toggleLinePrefix(view, '## ', HEADING_PATTERN)
    case 'heading3':
      return toggleLinePrefix(view, '### ', HEADING_PATTERN)

    case 'quote':
      return toggleLinePrefix(view, '> ', QUOTE_PATTERN)
    case 'bulletList':
      return toggleLinePrefix(view, '- ', BULLET_PATTERN)
    case 'orderedList':
      return toggleLinePrefix(view, '1. ', ORDERED_PATTERN)
    case 'taskList':
      return toggleLinePrefix(view, '- [ ] ', TASK_PATTERN)

    case 'codeBlock':
      return insertBlock(view, `\`\`\`\n${CARET}\n\`\`\``)
    case 'horizontalRule':
      return insertBlock(view, `---${CARET}`)
    case 'table':
      return insertBlock(
        view,
        ['| 列 1 | 列 2 | 列 3 |', '| --- | --- | --- |', `| ${CARET}|  |  |`].join('\n')
      )

    case 'clearFormat': {
      const { state } = view
      const range = state.selection.main
      const firstLine = state.doc.lineAt(range.from)
      const lastLine = state.doc.lineAt(range.to)
      const edits: ChangeSpec[] = []

      for (let n = firstLine.number; n <= lastLine.number; n++) {
        const line = state.doc.line(n)
        const cleaned = line.text
          .replace(HEADING_PATTERN, '')
          .replace(QUOTE_PATTERN, '')
          .replace(TASK_PATTERN, '')
          .replace(BULLET_PATTERN, '')
          .replace(ORDERED_PATTERN, '')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/~~(.+?)~~/g, '$1')
          .replace(/`([^`]*)`/g, '$1')
        if (cleaned !== line.text) edits.push({ from: line.from, to: line.to, insert: cleaned })
      }

      if (edits.length === 0) return false
      view.dispatch({ changes: edits })
      return true
    }

    default:
      return false
  }
}

/**
 * 编辑器内的格式化快捷键。
 *
 * 刻意不放 Ctrl+S / Ctrl+F / Ctrl+W —— 那些由主进程菜单加速器统一处理，
 * 同一个按键只应该被处理一次。
 */
export const formatKeymap: KeyBinding[] = [
  { key: 'Mod-b', run: (view) => runFormatCommand(view, 'bold') },
  { key: 'Mod-i', run: (view) => runFormatCommand(view, 'italic') },
  { key: 'Mod-Shift-x', run: (view) => runFormatCommand(view, 'strikethrough') },
  { key: 'Mod-e', run: (view) => runFormatCommand(view, 'inlineCode') },
  { key: 'Mod-k', run: (view) => runFormatCommand(view, 'link') },
  { key: 'Mod-Shift-i', run: (view) => runFormatCommand(view, 'image') },
  { key: 'Mod-Shift-k', run: (view) => runFormatCommand(view, 'codeBlock') },
  { key: 'Mod-1', run: (view) => runFormatCommand(view, 'heading1') },
  { key: 'Mod-2', run: (view) => runFormatCommand(view, 'heading2') },
  { key: 'Mod-3', run: (view) => runFormatCommand(view, 'heading3') },
  { key: 'Mod-Shift-q', run: (view) => runFormatCommand(view, 'quote') },
  { key: 'Mod-Shift-8', run: (view) => runFormatCommand(view, 'bulletList') },
  { key: 'Mod-Shift-7', run: (view) => runFormatCommand(view, 'orderedList') },
  { key: 'Mod-Shift-9', run: (view) => runFormatCommand(view, 'taskList') }
]
