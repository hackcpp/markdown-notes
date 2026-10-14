/**
 * 全局常量。
 * 该文件会被主进程、Preload、渲染进程共同引用，因此不能依赖任何 Node / DOM API。
 */

export const APP_NAME = 'Markdown Notes'
export const APP_ID = 'com.markdownnotes.app'

/** 允许作为笔记打开的扩展名（小写，含点） */
export const NOTE_EXTENSIONS = ['.md', '.markdown', '.mdx', '.txt']

/** 图片 / 附件扩展名，仅这些类型可以通过自定义协议被预览加载 */
export const ASSET_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.avif',
  '.ico'
]

/** 扫描目录时跳过的目录名 */
export const IGNORED_DIRS = [
  '.git',
  '.hg',
  '.svn',
  '.idea',
  '.vscode',
  'node_modules',
  'out',
  'dist',
  'build',
  'release',
  '.cache',
  '.next',
  '.nuxt',
  '.venv',
  '__pycache__',
  '.trash',
  '.markdown-notes'
]

/** 扫描目录时跳过的文件名 */
export const IGNORED_FILES = ['.DS_Store', 'Thumbs.db', 'desktop.ini']

/** 目录扫描最大深度，避免把磁盘刮干净 */
export const SCAN_MAX_DEPTH = 12

/** 单个笔记允许的最大体积（读取/保存均会校验） */
export const MAX_NOTE_SIZE = 10 * 1024 * 1024

/** 通过自定义协议提供资源时的单文件体积上限 */
export const MAX_ASSET_SIZE = 32 * 1024 * 1024

/** 停止输入后多久尝试自动保存 */
export const AUTOSAVE_IDLE_MS = 800

/** 长时间连续输入时的最长保存间隔 */
export const AUTOSAVE_MAX_MS = 3000

/** 预览重新解析的节流窗口 */
export const PREVIEW_THROTTLE_MS = 140

/** 本地图片 / 附件使用的自定义协议 */
export const ASSET_SCHEME = 'notes-asset'

/** 恢复草稿目录（位于 userData 下） */
export const RECOVERY_DIR = 'recovery'

/** 写入临时文件时使用的后缀，用于识别并跳过自己的中间产物 */
export const TEMP_SUFFIX = '.mn-tmp'

/** 自动保存失败 / 冲突时用于重试的退避上限 */
export const AUTOSAVE_MAX_RETRY_DELAY_MS = 8000

export const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon'
}
