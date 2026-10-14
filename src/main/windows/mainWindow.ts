import path from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { APP_NAME } from '@shared/constants'
import { isSafeExternalUrl } from '@shared/utils/asset'
import { DEFAULT_SETTINGS, settingsStore } from '../services/settings/SettingsStore'
import { documentRecovery } from '../services/document/DocumentRecovery'
import { workspaceService } from '../services/workspace/WorkspaceService'
import { requestRendererClose } from '../ipc/closeCoordinator'
import { log } from '../utils/logger'

let mainWindow: BrowserWindow | null = null
let allowClose = false
let closing = false

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createMainWindow(): BrowserWindow {
  const settings = settingsStore.get()
  const bounds = settings.windowBounds ?? DEFAULT_SETTINGS.windowBounds

  const win = new BrowserWindow({
    width: bounds?.width ?? 1320,
    height: bounds?.height ?? 840,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: APP_NAME,
    backgroundColor: settings.theme === 'dark' ? '#16181c' : '#f7f8fa',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // Electron 安全基线：三项都不能开
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  })

  mainWindow = win

  win.once('ready-to-show', () => {
    win.show()
  })

  // ---- 导航与窗口限制 ----
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (url === current) return
    // 预览里的链接点击、外部拖放都不允许把应用主窗口导航走
    event.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })

  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  // ---- 关闭握手：先让渲染进程把未保存内容落盘 ----
  win.on('close', (event) => {
    if (allowClose) {
      persistBounds(win)
      return
    }
    event.preventDefault()
    void handleCloseRequest(win)
  })

  win.on('closed', () => {
    mainWindow = null
  })

  // ---- 加载页面 ----
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

/**
 * 关闭流程：
 * 1. 询问渲染进程是否全部保存完成（5 秒超时）
 * 2. 未完成 → 弹原生对话框，用户明确选择"保存草稿"或"丢弃"
 * 3. 任何情况下都不静默丢弃未保存内容
 */
async function handleCloseRequest(win: BrowserWindow): Promise<void> {
  if (closing) return
  closing = true

  try {
    const response = await requestRendererClose(win)

    if (response.allSaved) {
      allowClose = true
      persistBounds(win)
      win.close()
      return
    }

    const list = response.drafts.map((d) => `· ${d.relPath}`).slice(0, 10).join('\n')
    const { response: choice } = await dialog.showMessageBox(win, {
      type: 'warning',
      noLink: true,
      buttons: ['取消', '保存草稿并退出', '丢弃更改并退出'],
      defaultId: 1,
      cancelId: 0,
      title: '还有未保存的内容',
      message: '有笔记还没成功写入磁盘。',
      detail: list
        ? `涉及 ${response.drafts.length} 篇笔记：\n\n${list}\n\n选择「保存草稿」后，下次打开工作区会提示恢复。`
        : '无法从编辑器取得未保存内容，选择退出将丢失这些修改。'
    })

    if (choice === 0) return

    if (choice === 1 && response.drafts.length > 0) {
      const root = workspaceService.getRoot()
      if (root) {
        await documentRecovery.saveDrafts(root, response.drafts)
        log.info(`saved ${response.drafts.length} recovery drafts`)
      }
    }

    allowClose = true
    persistBounds(win)
    win.close()
  } catch (err) {
    log.error('close handshake failed', err)
  } finally {
    closing = false
  }
}

function persistBounds(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const isMaximized = win.isMaximized()
  if (isMaximized) return
  const bounds = win.getBounds()
  settingsStore.update({
    windowBounds: { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y }
  })
}

/** 退出前给用户一次机会，避免设置丢失 */
export function markMainWindowClosable(): void {
  allowClose = true
}
