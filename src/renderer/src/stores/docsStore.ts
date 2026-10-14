import { create } from 'zustand'
import type { Eol } from '@shared/types'
import { displayTitle } from '@shared/markdown'

export type DocStatus = 'clean' | 'dirty' | 'saving' | 'error' | 'conflict' | 'missing'

export interface DocMeta {
  relPath: string
  /** 标签页显示名：优先第一个 H1，回退文件名 */
  title: string
  /** 磁盘版本基准；保存成功后被更新 */
  baseHash: string
  eol: Eol
  hasBom: boolean
  mtimeMs: number
  size: number
  status: DocStatus
  /** 失败原因文案（status 为 error / conflict / missing 时展示） */
  errorText?: string
  /** 冲突时对端版本，供"覆盖"或"重新加载"使用 */
  diskHash?: string
  diskMtimeMs?: number
  lastSavedAt: number | null
  /** 打开后是否被编辑过（用于"从未保存"的提示） */
  everDirty: boolean
}

interface DocsState {
  docs: Record<string, DocMeta>
  /** 标签页顺序 */
  order: string[]
  active: string | null
  /** 只读镜像：供预览与大纲使用，按节流更新，不参与保存 */
  content: Record<string, string>
  loading: Record<string, boolean>

  upsert: (meta: DocMeta) => void
  patch: (relPath: string, patch: Partial<DocMeta>) => void
  setContent: (relPath: string, text: string) => void
  setLoading: (relPath: string, loading: boolean) => void
  setActive: (relPath: string | null) => void
  remove: (relPath: string) => void
  rename: (from: string, to: string) => void
  clear: () => void
}

export const useDocsStore = create<DocsState>((set) => ({
  docs: {},
  order: [],
  active: null,
  content: {},
  loading: {},

  upsert(meta) {
    set((state) => ({
      docs: { ...state.docs, [meta.relPath]: meta },
      order: state.order.includes(meta.relPath) ? state.order : [...state.order, meta.relPath]
    }))
  },

  patch(relPath, patch) {
    set((state) => {
      const current = state.docs[relPath]
      if (!current) return state
      return { docs: { ...state.docs, [relPath]: { ...current, ...patch } } }
    })
  },

  setContent(relPath, text) {
    set((state) => {
      const current = state.docs[relPath]
      const nextTitle = current ? displayTitle(text, relPath) : relPath
      const docs =
        current && current.title !== nextTitle
          ? { ...state.docs, [relPath]: { ...current, title: nextTitle } }
          : state.docs
      return { content: { ...state.content, [relPath]: text }, docs }
    })
  },

  setLoading(relPath, loading) {
    set((state) => ({ loading: { ...state.loading, [relPath]: loading } }))
  },

  setActive(relPath) {
    set({ active: relPath })
  },

  remove(relPath) {
    set((state) => {
      const docs = { ...state.docs }
      delete docs[relPath]
      const content = { ...state.content }
      delete content[relPath]
      const order = state.order.filter((p) => p !== relPath)
      let active = state.active
      if (active === relPath) {
        const index = state.order.indexOf(relPath)
        active = order[Math.min(index, order.length - 1)] ?? null
      }
      return { docs, content, order, active }
    })
  },

  rename(from, to) {
    set((state) => {
      const doc = state.docs[from]
      if (!doc) return state
      const docs = { ...state.docs }
      delete docs[from]
      docs[to] = { ...doc, relPath: to, title: displayTitle(state.content[from] ?? '', to) }
      const content = { ...state.content }
      if (from in content) {
        content[to] = content[from]
        delete content[from]
      }
      return {
        docs,
        content,
        order: state.order.map((p) => (p === from ? to : p)),
        active: state.active === from ? to : state.active
      }
    })
  },

  clear() {
    set({ docs: {}, order: [], active: null, content: {}, loading: {} })
  }
}))

/** 是否存在任何未保存内容 */
export function hasUnsavedChanges(docs: Record<string, DocMeta>): boolean {
  return Object.values(docs).some(
    (doc) => doc.status === 'dirty' || doc.status === 'saving' || doc.status === 'error'
  )
}

export function unsavedDocs(docs: Record<string, DocMeta>): DocMeta[] {
  return Object.values(docs).filter(
    (doc) => doc.status === 'dirty' || doc.status === 'saving' || doc.status === 'error'
  )
}
