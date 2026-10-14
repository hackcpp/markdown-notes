import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap
} from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { tags as t } from '@lezer/highlight'
import { formatKeymap } from './format'

export interface EditorPrefs {
  showLineNumbers: boolean
  wrapLines: boolean
  fontSize: number
}

export const lineNumbersCompartment = new Compartment()
export const wrapCompartment = new Compartment()
export const darkCompartment = new Compartment()

/** 行号 + 活动行高亮 + 折叠三角的组合扩展 */
export function lineNumbersExtension(): Extension {
  return [lineNumbers(), highlightActiveLineGutter(), foldGutter()]
}

/** 自动换行扩展 */
export function wrapExtension(wrapLines: boolean): Extension {
  return wrapLines ? EditorView.lineWrapping : []
}

/**
 * 编辑器视觉样式。
 *
 * 全部颜色走 CSS 变量，因此明暗主题切换只需要改 <html data-theme>，
 * 不需要为每个 EditorState 重建主题扩展 —— 这一点很重要，
 * 因为每个打开的文件都持有自己独立的 EditorState。
 */
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--editor-font-size)',
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--editor-fg)'
  },
  '&.cm-editor.cm-focused': { outline: 'none' },
  '&.cm-editor': { height: '100%' },
  '.cm-scroller': {
    fontFamily: 'var(--editor-font-family)',
    lineHeight: 'var(--editor-line-height)',
    overflow: 'auto'
  },
  '.cm-content': {
    caretColor: 'var(--editor-caret)',
    padding: '24px 0 45vh 0'
  },
  '.cm-line': { padding: '0 28px' },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--editor-gutter-fg)',
    border: 'none',
    paddingRight: '2px'
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 16px', minWidth: '28px' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--editor-active-line)',
    color: 'var(--editor-gutter-active-fg)'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--editor-selection)'
  },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--editor-caret)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--editor-bracket)',
    outline: 'none'
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--editor-selection-match)' },
  '.cm-searchMatch': { backgroundColor: 'var(--search-match)', outline: 'none' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--search-match-active)' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--chip-bg)',
    border: 'none',
    color: 'var(--fg-muted)',
    padding: '0 6px',
    borderRadius: '4px'
  },
  '.cm-foldGutter span': { cursor: 'pointer', color: 'var(--fg-subtle)', padding: '0 4px' },
  // 查找面板
  '.cm-panels': {
    backgroundColor: 'var(--panel-bg)',
    color: 'var(--fg)',
    borderColor: 'var(--border)'
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-panel.cm-search': { padding: '8px 10px', fontSize: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search select': {
    fontFamily: 'inherit',
    fontSize: '12px'
  },
  '.cm-panel.cm-search input[type=text]': {
    backgroundColor: 'var(--input-bg)',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '4px 8px',
    outline: 'none'
  },
  '.cm-panel.cm-search input[type=text]:focus': { borderColor: 'var(--accent)' },
  '.cm-panel.cm-search label': { color: 'var(--fg-muted)', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' },
  '.cm-panel.cm-search button': {
    backgroundColor: 'var(--btn-bg)',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '4px 10px',
    cursor: 'pointer'
  },
  '.cm-panel.cm-search button:hover': { backgroundColor: 'var(--btn-hover)' },
  '.cm-panel.cm-search button[name=close]': { position: 'absolute', right: '8px', top: '8px', padding: '2px 8px' },
  '.cm-tooltip': {
    backgroundColor: 'var(--panel-bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-md)',
    color: 'var(--fg)'
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--fg)'
  },
  '.cm-completionLabel': { fontSize: '13px' },
  '.cm-completionDetail': { color: 'var(--fg-subtle)', fontStyle: 'normal', fontSize: '12px' }
})

/**
 * Markdown 语法高亮。
 * 同样使用 CSS 变量，保证明暗主题一致可读。
 */
const markdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, color: 'var(--syn-heading)', fontWeight: '700', fontSize: '1.25em' },
  { tag: t.heading2, color: 'var(--syn-heading)', fontWeight: '700', fontSize: '1.15em' },
  { tag: t.heading3, color: 'var(--syn-heading)', fontWeight: '650' },
  { tag: [t.heading4, t.heading5, t.heading6], color: 'var(--syn-heading)', fontWeight: '600' },
  { tag: t.strong, color: 'var(--syn-strong)', fontWeight: '700' },
  { tag: t.emphasis, color: 'var(--syn-emphasis)', fontStyle: 'italic' },
  { tag: t.strikethrough, color: 'var(--syn-strike)', textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--syn-link)' },
  { tag: t.url, color: 'var(--syn-url)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--syn-code)', backgroundColor: 'var(--editor-inline-code-bg)' },
  { tag: t.quote, color: 'var(--syn-quote)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--syn-list-marker)' },
  { tag: t.contentSeparator, color: 'var(--syn-separator)' },
  { tag: t.meta, color: 'var(--syn-meta)' },
  { tag: t.processingInstruction, color: 'var(--syn-meta)' },
  { tag: t.labelName, color: 'var(--syn-link)' },
  { tag: t.keyword, color: 'var(--syn-keyword)' },
  { tag: t.string, color: 'var(--syn-string)' },
  { tag: t.number, color: 'var(--syn-number)' },
  { tag: t.bool, color: 'var(--syn-number)' },
  { tag: t.null, color: 'var(--syn-number)' },
  { tag: t.atom, color: 'var(--syn-number)' },
  { tag: t.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: t.variableName, color: 'var(--syn-variable)' },
  { tag: [t.typeName, t.className], color: 'var(--syn-type)' },
  { tag: t.propertyName, color: 'var(--syn-property)' },
  { tag: t.function(t.variableName), color: 'var(--syn-function)' },
  { tag: t.operator, color: 'var(--syn-operator)' },
  { tag: t.punctuation, color: 'var(--syn-punctuation)' },
  { tag: t.bracket, color: 'var(--syn-punctuation)' },
  { tag: t.invalid, color: 'var(--danger)' }
])

/**
 * 构建一份完整的编辑器扩展集合。
 *
 * 每个打开的文档都会用同一组扩展创建自己的 EditorState，
 * 因此这里的函数必须是纯的：调用多次不能产生共享可变状态。
 */
export function buildEditorExtensions(
  prefs: EditorPrefs,
  dark: boolean,
  updateListener?: Extension
): Extension[] {
  return [
    // 变更监听必须挂上：它是"内容变更 → dirty → 自动保存"与"内容变更 → 预览镜像"的唯一入口。
    // 漏掉它会导致编辑内容既不保存、预览也不更新（而且关窗时因为状态一直是 clean 而静默丢弃）。
    ...(updateListener ? [updateListener] : []),

    // 第一优先级：自己的格式化快捷键
    keymap.of(formatKeymap),

    lineNumbersCompartment.of(prefs.showLineNumbers ? lineNumbersExtension() : []),
    wrapCompartment.of(wrapExtension(prefs.wrapLines)),
    darkCompartment.of(EditorView.darkTheme.of(dark)),

    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ activateOnTyping: true, closeOnBlur: true }),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    highlightSpecialChars(),
    search({ top: true }),

    syntaxHighlighting(markdownHighlightStyle, { fallback: true }),

    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      addKeymap: true
    }),

    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab
    ]),

    editorTheme
  ]
}
