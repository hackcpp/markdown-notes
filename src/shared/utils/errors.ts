/**
 * 搜索结果与错误码的中文文案映射。
 * UI 只负责展示，不负责把错误码翻译成人话。
 */
import type { FailureReason } from '../types'

export const FAILURE_TEXT: Record<FailureReason, string> = {
  NO_WORKSPACE: '当前没有打开的工作区',
  OUTSIDE_WORKSPACE: '目标路径不在当前工作区内，已阻止访问',
  NOT_FOUND: '文件不存在或已被移动',
  ALREADY_EXISTS: '同名文件或文件夹已存在',
  INVALID_NAME: '名称不合法',
  DIR_NOT_EMPTY: '文件夹不为空',
  TOO_LARGE: '文件体积超出上限（10 MB）',
  NOT_A_FILE: '目标不是文件',
  CONFLICT: '文件已被其他程序修改，为避免覆盖已停止保存',
  PERMISSION_DENIED: '没有写入权限，或文件正被其他程序占用',
  DISK_FULL: '磁盘空间不足',
  IO_ERROR: '读写失败',
  BLOCKED: '该操作被安全策略阻止'
}

export function failureText(reason: FailureReason, fallback?: string): string {
  return FAILURE_TEXT[reason] ?? fallback ?? '未知错误'
}
