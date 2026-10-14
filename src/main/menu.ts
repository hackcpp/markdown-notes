import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { APP_NAME } from '@shared/constants'
import { IPC } from '@shared/ipc/channels'
import type { AppCommand } from '@shared/types'

/**
 * 应用菜单。
 *
 * 注意分工：菜单只负责"发出命令"，不直接操作状态。
 * 真正的执行在渲染进程（它持有编辑器与文档状态）。
 * 另外刻意 *不* 把 Ctrl+B 之类的编辑快捷键放进加速器 ——
 * 那些由 CodeMirror 的 keymap 处理，避免一次按键触发两次。
 */
export function buildAppMenu(getWindow: () => BrowserWindow | null): void {
  const send = (command: AppCommand) => () => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.evtCommand, command)
  }

  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push({
    label: '文件',
    submenu: [
      { label: '新建笔记', accelerator: 'CmdOrCtrl+N', click: send('file.newNote') },
      { label: '新建文件夹', accelerator: 'CmdOrCtrl+Shift+N', click: send('file.newFolder') },
      { type: 'separator' },
      { label: '打开文件夹…', accelerator: 'CmdOrCtrl+Shift+O', click: send('file.openFolder') },
      { label: '重新加载工作区', accelerator: 'CmdOrCtrl+Shift+R', click: send('file.reloadWorkspace') },
      { type: 'separator' },
      { label: '保存', accelerator: 'CmdOrCtrl+S', click: send('file.save') },
      { label: '全部保存', accelerator: 'CmdOrCtrl+Alt+S', click: send('file.saveAll') },
      { type: 'separator' },
      { label: '在文件管理器中显示', accelerator: 'CmdOrCtrl+Shift+E', click: send('file.revealActive') },
      { label: '关闭当前标签页', accelerator: 'CmdOrCtrl+W', click: send('file.closeTab') },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit', label: '退出' }
    ]
  })

  template.push({
    label: '编辑',
    submenu: [
      { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: send('edit.undo') },
      { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', click: send('edit.redo') },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'selectAll', label: '全选' },
      { type: 'separator' },
      { label: '查找', accelerator: 'CmdOrCtrl+F', click: send('edit.find') },
      { label: '查找与替换', accelerator: 'CmdOrCtrl+H', click: send('edit.findReplace') }
    ]
  })

  template.push({
    label: '视图',
    submenu: [
      { label: '文件侧边栏', accelerator: 'CmdOrCtrl+Shift+B', click: send('view.toggleSidebar') },
      { label: '大纲面板', accelerator: 'CmdOrCtrl+Shift+U', click: send('view.toggleOutline') },
      { type: 'separator' },
      { label: '源码模式', accelerator: 'CmdOrCtrl+Alt+1', click: send('view.modeSource') },
      { label: '分屏模式', accelerator: 'CmdOrCtrl+Alt+2', click: send('view.modeSplit') },
      { label: '预览模式', accelerator: 'CmdOrCtrl+Alt+3', click: send('view.modePreview') },
      { type: 'separator' },
      { label: '切换明暗主题', accelerator: 'CmdOrCtrl+Shift+L', click: send('view.toggleTheme') },
      { label: '专注模式', accelerator: 'CmdOrCtrl+Shift+D', click: send('view.toggleFocus') },
      { type: 'separator' },
      { role: 'resetZoom', label: '重置缩放' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全屏' },
      ...(app.isPackaged
        ? []
        : ([{ role: 'toggleDevTools', label: '开发者工具' }] as MenuItemConstructorOptions[]))
    ]
  })

  template.push({
    label: '帮助',
    submenu: [
      { label: '快捷键一览', accelerator: 'CmdOrCtrl+/', click: send('help.shortcuts') },
      { label: '打开用户数据目录', click: () => void shell.openPath(app.getPath('userData')) },
      { type: 'separator' },
      { label: `关于 ${APP_NAME}`, click: () => void shell.openExternal('https://www.electronjs.org/docs/latest/') }
    ]
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
