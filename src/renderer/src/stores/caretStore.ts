import { create } from 'zustand'
import type { SelectionInfo } from '../features/editor/editorHost'

interface CaretState {
  relPath: string | null
  info: SelectionInfo | null
  setInfo: (relPath: string, info: SelectionInfo) => void
  clear: () => void
}

/**
 * 光标信息单独放在一个极小的 store 里。
 *
 * 原因：光标每次移动都会产生新数据，如果混进主 store 会让文件树、标签栏
 * 跟着一起重渲染；拆开后只有底部状态栏会更新。
 */
export const useCaretStore = create<CaretState>((set) => ({
  relPath: null,
  info: null,
  setInfo: (relPath, info) => set({ relPath, info }),
  clear: () => set({ relPath: null, info: null })
}))
