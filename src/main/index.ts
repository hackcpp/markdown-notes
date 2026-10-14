import { app, BrowserWindow, protocol, session } from 'electron'
import { APP_ID, ASSET_SCHEME } from '@shared/constants'
import { IPC } from '@shared/ipc/channels'
import type { ExternalChangeEvent, TreeChangedEvent } from '@shared/types'
import { registerIpcHandlers } from './ipc'
import { registerAssetProtocol } from './protocol/assetProtocol'
import { buildAppMenu } from './menu'
import { settingsStore } from './services/settings/SettingsStore'
import { documentRecovery } from './services/document/DocumentRecovery'
import { workspaceService } from './services/workspace/WorkspaceService'
import { createMainWindow, getMainWindow } from './windows/mainWindow'
import { log } from './utils/logger'

// 自定义协议必须在 app ready 之前登记为特权协议，
// 否则渲染进程既无法在 CSP 中放行它，也无法享受 secure context。
protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

/** 主进程 → 渲染进程的单向事件推送 */
function sendToRenderer(channel: string, payload: unknown): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send(channel, payload)
}

function wireWorkspaceEvents(): void {
  workspaceService.onTreeChanged((event: TreeChangedEvent) => {
    sendToRenderer(IPC.evtTreeChanged, event)
  })
  workspaceService.onExternalChange((event: ExternalChangeEvent) => {
    // hash 留空：渲染进程会按需向主进程确认磁盘版本，
    // 避免每次文件事件都同步读盘。
    sendToRenderer(IPC.evtExternalChange, event)
  })
}

/** 阻止渲染进程加载任何到不了我们自己页面的权限请求 */
function hardenSession(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
}

const hasLock = app.requestSingleInstanceLock()

if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_ID)

    settingsStore.init()
    documentRecovery.init()
    hardenSession()
    registerAssetProtocol()
    registerIpcHandlers({ getWindow: getMainWindow })
    wireWorkspaceEvents()
    buildAppMenu(getMainWindow)

    createMainWindow()

    // 恢复上次工作区（目录已被删除时静默降级，不影响启动）
    const settings = settingsStore.get()
    if (settings.lastWorkspace) {
      try {
        await workspaceService.open(settings.lastWorkspace)
        log.info('restored last workspace')
      } catch (err) {
        log.warn('restore last workspace failed:', (err as Error).message)
        settingsStore.update({ lastWorkspace: null })
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', async () => {
    await settingsStore.flushNow()
    await workspaceService.close()
  })
}

process.on('uncaughtException', (err) => {
  log.error('uncaught exception in main process:', err)
})
