import { EditorState, type StateEffect } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import { redo, undo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import { PREVIEW_THROTTLE_MS } from '@shared/constants'
import {
  buildEditorExtensions,
  darkCompartment,
  lineNumbersCompartment,
  lineNumbersExtension,
  wrapCompartment,
  wrapExtension,
  type EditorPrefs
} from './editorSetup'
import { runFormatCommand, type FormatCommand } from './format'

export interface SelectionInfo {
  line: number
  column: number
  selectedChars: number
  totalLines: number
  totalChars: number
}

export interface EditorHostListener {
  /** 内容发生变化（只通知"变了"，不传文本，避免每次按键都做 O(n) 字符串拷贝） */
  onDocChanged?: (relPath: string) => void
  onSelectionChanged?: (relPath: string, info: SelectionInfo) => void
  /** 节流后的内容镜像，供预览/大纲使用 */
  onContentMirror?: (relPath: string, text: string) => void
}

/**
 * 编辑器宿主（方案 5.1 中的 CodeMirror + Document Controller 交界层）。
 *
 * 核心设计：**一个 EditorView，每个文档一份 EditorState**。
 *
 * - 不为每个标签页创建独立 EditorView，避免 React 重渲染时反复重建编辑器实例；
 * - 每个文档的 EditorState 里同时保存了正文、光标、选区与撤销历史，
 *   因此切换标签页时只需 setState，撤销记录和光标都天然保留；
 * - 唯一无法随 state 迁移的是滚动位置，这里单独按文档记录并恢复。
 */
class EditorHost {
  private view: EditorView | null = null
  private states = new Map<string, EditorState>()
  private scrollTops = new Map<string, number>()
  private activePath: string | null = null
  private listener: EditorHostListener = {}
  private prefs: EditorPrefs = { showLineNumbers: false, wrapLines: true, fontSize: 15 }
  private dark = false
  private suppress = false
  private mirrorTimer: number | null = null
  private mirrorPending = false

  /**
   * 编辑器变更监听。
   *
   * 这是整个应用最关键的一条链路：内容变更 → 文档状态置为 dirty → 自动保存，
   * 以及 内容变更 → 预览 / 大纲镜像。扩展实例本身不可变，可以在所有
   * EditorState 之间安全共享，因此只创建一次。
   */
  private readonly updateListener = EditorView.updateListener.of((update) =>
    this.handleUpdate(update)
  )

  /**
   * 创建一份 EditorState 的唯一入口。
   *
   * 所有文档状态都必须经由此方法创建，确保变更监听一定被挂上 ——
   * 历史上正是因为某个创建点漏了监听，导致"编辑内容不保存、预览不更新"。
   */
  private createState(content: string): EditorState {
    return EditorState.create({
      doc: content,
      extensions: buildEditorExtensions(this.prefs, this.dark, this.updateListener)
    })
  }

  setListener(listener: EditorHostListener): void {
    this.listener = listener
  }

  mount(container: HTMLElement): void {
    if (this.view) return
    this.view = new EditorView({
      state: this.createState(''),
      parent: container
    })
  }

  unmount(): void {
    if (this.mirrorTimer !== null) {
      window.clearTimeout(this.mirrorTimer)
      this.mirrorTimer = null
    }
    this.view?.destroy()
    this.view = null
    this.activePath = null
    this.states.clear()
    this.scrollTops.clear()
  }

  get mounted(): boolean {
    return this.view !== null
  }

  getActivePath(): string | null {
    return this.activePath
  }

  has(relPath: string): boolean {
    return this.states.has(relPath)
  }

  // ------------------------------------------------------------ 文档生命周期

  /** 打开（或复用）一份文档的编辑状态，并切换为当前文档 */
  open(relPath: string, content: string): void {
    if (!this.states.has(relPath)) {
      this.states.set(relPath, this.createState(content))
    }
    this.activate(relPath)
  }

  activate(relPath: string): void {
    const view = this.view
    if (!view || this.activePath === relPath) return

    // 先保存当前文档的状态与滚动位置
    if (this.activePath) {
      this.states.set(this.activePath, view.state)
      this.scrollTops.set(this.activePath, view.scrollDOM.scrollTop)
    }

    const next = this.states.get(relPath)
    this.activePath = relPath
    if (!next) return

    this.suppress = true
    try {
      view.setState(next)
    } finally {
      this.suppress = false
    }

    const top = this.scrollTops.get(relPath) ?? 0
    view.requestMeasure({
      read: () => top,
      write: (measured, v) => {
        v.scrollDOM.scrollTop = measured
      }
    })
  }

  close(relPath: string): void {
    const wasActive = this.activePath === relPath
    this.states.delete(relPath)
    this.scrollTops.delete(relPath)
    if (!wasActive) return
    this.activePath = null
    // 由上层决定接下来激活哪一份文档；先清空视图内容避免闪现旧文档
    if (this.view) {
      this.suppress = true
      try {
        this.view.setState(this.createState(''))
      } finally {
        this.suppress = false
      }
    }
  }

  /** 取当前编辑器中的正文（唯一权威文本来源） */
  getText(relPath: string): string | null {
    // 当前文档一律以视图状态为准：视图里的内容才是最实时的，
    // states 只是"非当前文档"的状态缓存，绝不能让它成为保存的内容来源。
    if (this.view && this.activePath === relPath) return this.view.state.doc.toString()
    const state = this.states.get(relPath)
    if (state) return state.doc.toString()
    return null
  }

  /** 用磁盘内容替换编辑器内容（外部修改后重新加载） */
  replaceText(relPath: string, content: string): boolean {
    const state = this.states.get(relPath)
    if (!state) return false

    const next = state.update({
      changes: { from: 0, to: state.doc.length, insert: content }
    }).state

    this.suppress = true
    try {
      this.states.set(relPath, next)
      if (this.view && this.activePath === relPath) this.view.setState(next)
    } finally {
      this.suppress = false
    }

    this.listener.onContentMirror?.(relPath, content)
    return true
  }

  /** 文件被重命名 / 移动后，把编辑状态一并搬迁（保留撤销历史与光标） */
  rename(from: string, to: string): void {
    const state = this.states.get(from)
    if (state) {
      this.states.delete(from)
      this.states.set(to, state)
    }
    const top = this.scrollTops.get(from)
    if (top !== undefined) {
      this.scrollTops.delete(from)
      this.scrollTops.set(to, top)
    }
    if (this.activePath === from) this.activePath = to
  }

  // ------------------------------------------------------------ 视图行为

  focus(): void {
    this.view?.focus()
  }

  format(command: FormatCommand): boolean {
    if (!this.view || !this.activePath) return false
    const ok = runFormatCommand(this.view, command)
    this.view.focus()
    return ok
  }

  undo(): void {
    if (this.view) undo(this.view)
  }

  redo(): void {
    if (this.view) redo(this.view)
  }

  openFind(withReplace = false): void {
    const view = this.view
    if (!view) return
    openSearchPanel(view)
    if (withReplace) {
      // 默认面板的替换区由 name=replace 的按钮展开
      const toggle = view.dom.querySelector<HTMLElement>('.cm-panel.cm-search [name="replace"]')
      toggle?.click()
    }
    view.focus()
  }

  scrollToLine(relPath: string, line: number): void {
    this.activate(relPath)
    const view = this.view
    if (!view) return
    const total = view.state.doc.lines
    const target = Math.min(Math.max(line + 1, 1), total)
    const pos = view.state.doc.line(target).from
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 100 })
    })
    view.focus()
  }

  getSelectionInfo(): SelectionInfo | null {
    const view = this.view
    if (!view) return null
    const range = view.state.selection.main
    const line = view.state.doc.lineAt(range.head)
    return {
      line: line.number,
      column: range.head - line.from + 1,
      selectedChars: Math.abs(range.to - range.from),
      totalLines: view.state.doc.lines,
      totalChars: view.state.doc.length
    }
  }

  // ------------------------------------------------------------ 偏好与主题

  /**
   * 更新编辑器偏好。
   *
   * 因为每个文档各自持有一份 EditorState，改设置时必须把所有状态的对应
   * Compartment 一起重配置；当前文档走 view.dispatch，其余文档直接
   * 通过 state.update 生成新状态，避免逐个切换视图。
   */
  setPrefs(prefs: Partial<EditorPrefs> & { dark?: boolean }): void {
    const nextPrefs: EditorPrefs = {
      showLineNumbers: prefs.showLineNumbers ?? this.prefs.showLineNumbers,
      wrapLines: prefs.wrapLines ?? this.prefs.wrapLines,
      fontSize: prefs.fontSize ?? this.prefs.fontSize
    }
    const nextDark = prefs.dark ?? this.dark

    const changed =
      nextPrefs.showLineNumbers !== this.prefs.showLineNumbers ||
      nextPrefs.wrapLines !== this.prefs.wrapLines ||
      nextDark !== this.dark

    this.prefs = nextPrefs
    this.dark = nextDark
    if (!changed) return

    const makeEffects = (): StateEffect<unknown>[] => [
      lineNumbersCompartment.reconfigure(
        nextPrefs.showLineNumbers ? lineNumbersExtension() : []
      ),
      wrapCompartment.reconfigure(wrapExtension(nextPrefs.wrapLines)),
      darkCompartment.reconfigure(EditorView.darkTheme.of(nextDark))
    ]

    for (const [path, state] of [...this.states.entries()]) {
      // 当前文档由 view.dispatch 处理，否则会出现两份不一致的状态
      if (this.view && path === this.activePath) continue
      this.states.set(path, state.update({ effects: makeEffects() }).state)
    }

    if (this.view && this.activePath) {
      this.view.dispatch({ effects: makeEffects() })
    }
  }

  // ------------------------------------------------------------ 内部

  private handleUpdate(update: ViewUpdate): void {
    const path = this.activePath
    if (!path) return
    if (this.suppress) return

    if (update.docChanged) {
      this.states.set(path, update.state)
      this.listener.onDocChanged?.(path)
      this.scheduleMirror()
    }

    if (update.selectionSet || update.docChanged) {
      const range = update.state.selection.main
      const line = update.state.doc.lineAt(range.head)
      this.listener.onSelectionChanged?.(path, {
        line: line.number,
        column: range.head - line.from + 1,
        selectedChars: Math.abs(range.to - range.from),
        totalLines: update.state.doc.lines,
        totalChars: update.state.doc.length
      })
    }
  }

  /**
   * 预览重解析按节流触发。
   * 直接在每次按键时解析 Markdown 会在长文档上明显掉帧。
   */
  private scheduleMirror(): void {
    this.mirrorPending = true
    if (this.mirrorTimer !== null) return
    this.mirrorTimer = window.setTimeout(() => {
      this.mirrorTimer = null
      if (!this.mirrorPending) return
      this.mirrorPending = false
      const path = this.activePath
      if (!path) return
      const text = this.getText(path)
      if (text === null) return
      this.listener.onContentMirror?.(path, text)
    }, PREVIEW_THROTTLE_MS)
  }

  /** 立即刷新镜像（保存前 / 手动触发） */
  flushMirror(): void {
    if (this.mirrorTimer !== null) {
      window.clearTimeout(this.mirrorTimer)
      this.mirrorTimer = null
    }
    this.mirrorPending = false
    const path = this.activePath
    if (!path) return
    const text = this.getText(path)
    if (text === null) return
    this.listener.onContentMirror?.(path, text)
  }
}

export const editorHost = new EditorHost()
