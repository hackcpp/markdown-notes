import { useAppStore, type DialogOptions } from '../stores/appStore'

/**
 * 打开一个应用内对话框，返回用户选择项的 id（取消返回 null）。
 *
 * 为什么不用 window.confirm / prompt：
 * Electron 并未实现 window.prompt，且原生弹窗无法承载我们需要的
 * 三项选择与风险提示排版。
 */
export function openDialog(options: DialogOptions): Promise<string | null> {
  return useAppStore.getState().openDialog(options)
}

export type { DialogOptions }
