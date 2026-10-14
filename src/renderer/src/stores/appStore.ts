import { create } from 'zustand'
import type {
  ContextMenuItem,
  DraftInfo,
  FileNode,
  ResolvedTheme,
  Settings,
  ThemeMode,
  ViewMode,
  Workspace
} from '@shared/types'
import { api, describeIpcError } from '../lib/api'
import { DEFAULT_SETTINGS } from '@shared/defaults'

export type SidebarView = 'files' | 'search' | 'tags'

export interface ToastItem {
  id: number
  text: string
  kind: 'info' | 'error' | 'success'
}

export interface PromptState {
  id: string
  title: string
  label?: string
  defaultValue?: string
  confirmText?: string
  validate?: (value: string) => string | null
  resolve: (value: string | null) => void
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
  resolve: (id: string | null) => void
}

export interface DialogOption {
  id: string
  label: string
  danger?: boolean
  description?: string
}

export interface DialogOptions {
  title: string
  message?: string
  items: DialogOption[]
  /** 按 Esc 或点击遮罩时返回的 id */
  cancelId?: string
}

export interface DialogState extends DialogOptions {
  id: string
  resolve: (id: string | null) => void
}

interface AppState {
  ready: boolean
  bootError: string | null

  workspace: Workspace | null
  tree: FileNode[]
  treeLoading: boolean
  expanded: Record<string, boolean>
  selected: string | null
  recentWorkspaces: string[]

  settings: Settings
  theme: ResolvedTheme
  focusMode: boolean
  sidebarView: SidebarView

  drafts: DraftInfo[]
  prompt: PromptState | null
  contextMenu: ContextMenuState | null
  dialog: DialogState | null
  shortcutsOpen: boolean
  toasts: ToastItem[]

  // ---- 生命周期 ----
  bootstrap: () => Promise<void>
  openWorkspaceDialog: () => Promise<boolean>
  openWorkspacePath: (rootPath: string) => Promise<boolean>
  closeWorkspace: () => Promise<void>
  refreshTree: () => Promise<void>

  // ---- 文件树 ----
  setTree: (tree: FileNode[]) => void
  toggleExpanded: (relPath: string) => void
  setExpanded: (relPath: string, expanded: boolean) => void
  expandTo: (relPath: string) => void
  setSelected: (relPath: string | null) => void

  // ---- 设置 ----
  updateSettings: (patch: Partial<Settings>) => void
  cycleTheme: () => void
  setThemeMode: (mode: ThemeMode) => void
  setViewMode: (mode: ViewMode) => void
  toggleSidebar: () => void
  toggleOutline: () => void
  toggleFocusMode: () => void
  setFontSize: (size: number) => void
  setSidebarView: (view: SidebarView) => void

  // ---- 交互层 ----
  toast: (text: string, kind?: ToastItem['kind']) => void
  dismissToast: (id: number) => void
  ask: (options: Omit<PromptState, 'id' | 'resolve'>) => Promise<string | null>
  resolvePrompt: (value: string | null) => void
  openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => Promise<string | null>
  closeContextMenu: (id: string | null) => void
  openDialog: (options: DialogOptions) => Promise<string | null>
  closeDialog: (id: string | null) => void
  setShortcutsOpen: (open: boolean) => void
  loadDrafts: () => Promise<void>
}

let toastSeq = 0
let promptSeq = 0
let dialogSeq = 0

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? systemTheme() : mode
}

function applyThemeToDom(theme: ResolvedTheme): void {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  bootError: null,

  workspace: null,
  tree: [],
  treeLoading: false,
  expanded: {},
  selected: null,
  recentWorkspaces: [],

  settings: { ...DEFAULT_SETTINGS },
  theme: 'light',
  focusMode: false,
  sidebarView: 'files',

  drafts: [],
  prompt: null,
  contextMenu: null,
  dialog: null,
  shortcutsOpen: false,
  toasts: [],

  async bootstrap() {
    try {
      const [settings, state] = await Promise.all([api.settings.get(), api.workspace.state()])
      const theme = resolveTheme(settings.theme)
      applyThemeToDom(theme)

      set({
        settings,
        theme,
        workspace: state.workspace,
        recentWorkspaces: state.recentWorkspaces,
        ready: true
      })

      if (state.workspace) {
        const tree = await api.workspace.getTree()
        set({ tree })
      }
      await get().loadDrafts()
      void api.app.info().then((info) => {
        document.title = state.workspace
          ? `${state.workspace.name} — Markdown Notes`
          : `Markdown Notes ${info.version}`
      })
    } catch (err) {
      set({ ready: true, bootError: describeIpcError(err) })
    }

    // 跟随系统主题变化
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', () => {
        if (get().settings.theme !== 'system') return
        const theme = systemTheme()
        applyThemeToDom(theme)
        set({ theme })
      })
    }
  },

  async openWorkspaceDialog() {
    try {
      const result = await api.workspace.open()
      if (!result) return false
      set({ workspace: result.workspace, tree: result.tree, expanded: {}, selected: null })
      const state = await api.workspace.state()
      set({ recentWorkspaces: state.recentWorkspaces })
      document.title = `${result.workspace.name} — Markdown Notes`
      await get().loadDrafts()
      get().toast(`已打开工作区：${result.workspace.name}`, 'success')
      return true
    } catch (err) {
      get().toast(`打开工作区失败：${describeIpcError(err)}`, 'error')
      return false
    }
  },

  async openWorkspacePath(rootPath) {
    set({ treeLoading: true })
    try {
      const result = await api.workspace.openPath(rootPath)
      set({
        workspace: result.workspace,
        tree: result.tree,
        expanded: {},
        selected: null,
        treeLoading: false
      })
      const state = await api.workspace.state()
      set({ recentWorkspaces: state.recentWorkspaces })
      document.title = `${result.workspace.name} — Markdown Notes`
      await get().loadDrafts()
      return true
    } catch (err) {
      set({ treeLoading: false })
      get().toast(`打开工作区失败：${describeIpcError(err)}`, 'error')
      return false
    }
  },

  async closeWorkspace() {
    await api.workspace.close()
    set({ workspace: null, tree: [], expanded: {}, selected: null, drafts: [] })
    document.title = 'Markdown Notes'
  },

  async refreshTree() {
    if (!get().workspace) return
    try {
      const tree = await api.workspace.refresh()
      set({ tree })
    } catch (err) {
      get().toast(`刷新文件树失败：${describeIpcError(err)}`, 'error')
    }
  },

  setTree: (tree) => set({ tree }),

  toggleExpanded: (relPath) =>
    set((state) => {
      const next = { ...state.expanded }
      if (next[relPath]) delete next[relPath]
      else next[relPath] = true
      return { expanded: next }
    }),

  setExpanded: (relPath, expanded) =>
    set((state) => {
      const next = { ...state.expanded }
      if (expanded) next[relPath] = true
      else delete next[relPath]
      return { expanded: next }
    }),

  expandTo: (relPath) =>
    set((state) => {
      const next = { ...state.expanded }
      const segments = relPath.split('/')
      let current = ''
      for (let i = 0; i < segments.length - 1; i++) {
        current = current ? `${current}/${segments[i]}` : segments[i]
        next[current] = true
      }
      return { expanded: next }
    }),

  setSelected: (relPath) => set({ selected: relPath }),

  updateSettings(patch) {
    const merged = { ...get().settings, ...patch }
    const theme = resolveTheme(merged.theme)
    applyThemeToDom(theme)
    set({ settings: merged, theme })
    void api.settings
      .update(patch)
      .catch((err) => get().toast(`设置保存失败：${describeIpcError(err)}`, 'error'))
  },

  cycleTheme() {
    const order: ThemeMode[] = ['light', 'dark', 'system']
    const current = get().settings.theme
    const next = order[(order.indexOf(current) + 1) % order.length]
    get().updateSettings({ theme: next })
    get().toast(`主题：${{ light: '浅色', dark: '深色', system: '跟随系统' }[next]}`, 'info')
  },

  setThemeMode: (mode) => get().updateSettings({ theme: mode }),

  setViewMode: (mode) => get().updateSettings({ viewMode: mode }),

  toggleSidebar: () => get().updateSettings({ sidebarVisible: !get().settings.sidebarVisible }),

  toggleOutline: () => get().updateSettings({ outlineVisible: !get().settings.outlineVisible }),

  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),

  setFontSize: (size) =>
    get().updateSettings({ fontSize: Math.min(24, Math.max(11, Math.round(size))) }),

  setSidebarView: (view) => set({ sidebarView: view }),

  toast(text, kind = 'info') {
    const id = ++toastSeq
    set((state) => ({ toasts: [...state.toasts, { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3200)
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  ask(options) {
    return new Promise<string | null>((resolve) => {
      set({
        prompt: { ...options, id: `prompt-${++promptSeq}`, resolve }
      })
    })
  },

  resolvePrompt(value) {
    const prompt = get().prompt
    if (!prompt) return
    set({ prompt: null })
    prompt.resolve(value)
  },

  openContextMenu(x, y, items) {
    return new Promise<string | null>((resolve) => {
      set({ contextMenu: { x, y, items, resolve } })
    })
  },

  closeContextMenu(id) {
    const menu = get().contextMenu
    if (!menu) return
    set({ contextMenu: null })
    menu.resolve(id)
  },

  openDialog(options) {
    return new Promise<string | null>((resolve) => {
      set({ dialog: { ...options, id: `dialog-${++dialogSeq}`, resolve } })
    })
  },

  closeDialog(id) {
    const dialog = get().dialog
    if (!dialog) return
    set({ dialog: null })
    dialog.resolve(id)
  },

  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

  async loadDrafts() {
    try {
      const drafts = await api.drafts.list()
      set({ drafts })
    } catch {
      set({ drafts: [] })
    }
  }
}))
