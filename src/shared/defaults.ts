import type { Settings } from './types'

/**
 * 默认设置。主进程与渲染进程共用，避免两边默认值漂移
 * （主进程负责持久化，渲染进程在拿到设置前需要一份可用的兜底值）。
 */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  viewMode: 'split',
  sidebarVisible: true,
  outlineVisible: true,
  sidebarWidth: 268,
  outlineWidth: 240,
  fontSize: 15,
  showLineNumbers: false,
  wrapLines: true,
  lastWorkspace: null,
  recentWorkspaces: [],
  windowBounds: null
}
