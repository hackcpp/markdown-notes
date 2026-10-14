import { useEffect } from 'react'
import type { AppCommand } from '@shared/types'
import { dirnameRel } from '@shared/utils/path'
import { api } from '../lib/api'
import { useAppStore } from '../stores/appStore'
import { useDocsStore } from '../stores/docsStore'
import { editorHost } from '../features/editor/editorHost'
import {
  closeDocument,
  handleExternalChange,
  prepareForClose,
  saveAllDocuments,
  saveController
} from '../features/documents/documents'
import { createFolder, createNote, revealEntry } from '../features/workspace/fileOperations'
import { resetPreviewCache } from '../features/preview/pipeline'
import { createDebounced } from './usePanelResize'

/**
 * 主进程命令 → 渲染进程行为 的路由。
 *
 * 所有菜单项与菜单加速器都只发命令，具体怎么做由这里决定，
 * 保证菜单、快捷键、工具栏按钮三者行为完全一致。
 */
async function runCommand(command: AppCommand): Promise<void> {
  const app = useAppStore.getState()
  const docs = useDocsStore.getState()
  const active = docs.active

  switch (command) {
    case 'file.newNote':
      // 与当前笔记同目录，更符合"接着往下写"的直觉
      await createNote(active ? dirnameRel(active) : '')
      break
    case 'file.newFolder':
      await createFolder('')
      break
    case 'file.openFolder':
      await app.openWorkspaceDialog()
      break
    case 'file.reloadWorkspace':
      resetPreviewCache()
      await app.refreshTree()
      app.toast('工作区已重新扫描', 'success')
      break

    case 'file.save':
      if (active) await saveController.flush(active)
      break
    case 'file.saveAll':
      await saveAllDocuments()
      break
    case 'file.closeTab':
      if (active) await closeDocument(active)
      break
    case 'file.revealActive':
      if (active) await revealEntry(active)
      break

    case 'edit.undo':
      editorHost.undo()
      break
    case 'edit.redo':
      editorHost.redo()
      break
    case 'edit.find':
      editorHost.openFind(false)
      break
    case 'edit.findReplace':
      editorHost.openFind(true)
      break

    case 'view.toggleSidebar':
      app.toggleSidebar()
      break
    case 'view.toggleOutline':
      app.toggleOutline()
      break
    case 'view.modeSource':
      app.setViewMode('source')
      break
    case 'view.modeSplit':
      app.setViewMode('split')
      break
    case 'view.modePreview':
      app.setViewMode('preview')
      break
    case 'view.toggleTheme':
      app.cycleTheme()
      break
    case 'view.toggleFocus':
      app.toggleFocusMode()
      break

    case 'help.shortcuts':
      app.setShortcutsOpen(true)
      break

    default:
      break
  }
}

export function useAppCommands(): void {
  useEffect(() => {
    const refreshTreeDebounced = createDebounced(() => {
      void useAppStore.getState().refreshTree()
    }, 220)

    const offCommand = api.app.onCommand((command) => {
      void runCommand(command)
    })

    const offTreeChanged = api.app.onTreeChanged(() => {
      refreshTreeDebounced()
    })

    const offExternalChange = api.app.onExternalChange((event) => {
      void handleExternalChange(event)
    })

    const offRequestClose = api.app.onRequestClose(({ requestId }) => {
      void (async () => {
        const response = await prepareForClose(requestId)
        api.app.respondClose(response)
      })()
    })

    // Esc 退出专注模式
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && useAppStore.getState().focusMode) {
        useAppStore.getState().toggleFocusMode()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      offCommand()
      offTreeChanged()
      offExternalChange()
      offRequestClose()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}

/** 启动流程：读取设置、恢复工作区、加载草稿列表 */
export function useBootstrap(): void {
  const bootstrap = useAppStore((state) => state.bootstrap)
  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // 打开 / 切换文档后把键盘焦点交回编辑器，保持"打开就能写"的手感
  const active = useDocsStore((state) => state.active)
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => {
      if (editorHost.mounted) editorHost.focus()
    }, 30)
    return () => window.clearTimeout(timer)
  }, [active])
}
