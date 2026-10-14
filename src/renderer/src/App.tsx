import { useEffect } from 'react'
import { ContextMenuHost } from './components/ContextMenu'
import { DialogHost, ShortcutsDialog, ToastHost } from './components/Dialogs'
import { PromptDialogHost } from './components/PromptDialog'
import { EditorArea } from './features/editor/EditorArea'
import { editorHost } from './features/editor/editorHost'
import { Banners } from './features/workspace/Banners'
import { OutlinePanel } from './features/workspace/OutlinePanel'
import { Sidebar } from './features/workspace/Sidebar'
import { StatusBar } from './features/workspace/StatusBar'
import { TabBar } from './features/workspace/TabBar'
import { Toolbar, FormatBar } from './features/workspace/Toolbar'
import { Welcome } from './features/workspace/Welcome'
import { initDocumentBridge } from './features/documents/documents'
import { useAppCommands, useBootstrap } from './hooks/useAppCommands'
import { usePanelResize } from './hooks/usePanelResize'
import { useAppStore } from './stores/appStore'

// 编辑器事件 → 文档状态 / 保存调度 的接线，只需一次
initDocumentBridge()

export default function App(): React.JSX.Element {
  useBootstrap()
  useAppCommands()

  const ready = useAppStore((state) => state.ready)
  const workspace = useAppStore((state) => state.workspace)
  const settings = useAppStore((state) => state.settings)
  const theme = useAppStore((state) => state.theme)
  const focusMode = useAppStore((state) => state.focusMode)
  const updateSettings = useAppStore((state) => state.updateSettings)

  // 设置 → CodeMirror：明暗、行号、换行
  useEffect(() => {
    document.documentElement.style.setProperty('--editor-font-size', `${settings.fontSize}px`)
    editorHost.setPrefs({
      showLineNumbers: settings.showLineNumbers,
      wrapLines: settings.wrapLines,
      fontSize: settings.fontSize,
      dark: theme === 'dark'
    })
  }, [settings.showLineNumbers, settings.wrapLines, settings.fontSize, theme])

  const sidebarResize = usePanelResize({
    value: settings.sidebarWidth,
    min: 200,
    max: 520,
    onCommit: (width) => updateSettings({ sidebarWidth: width })
  })

  const outlineResize = usePanelResize({
    value: settings.outlineWidth,
    min: 200,
    max: 460,
    invert: true,
    onCommit: (width) => updateSettings({ outlineWidth: width })
  })

  const showChrome = !focusMode

  return (
    <div className={`app${focusMode ? ' is-focus' : ''}`}>
      {showChrome && <Toolbar />}

      {!ready && <div className="boot">正在启动…</div>}

      {ready && workspace && (
        <div className="workspace">
          {showChrome && settings.sidebarVisible && (
            <>
              <Sidebar />
              <div
                className="resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="调整侧边栏宽度"
                onMouseDown={sidebarResize.onMouseDown}
              />
            </>
          )}

          <main className="main">
            <Banners />
            <TabBar />
            {showChrome && <FormatBar />}
            <EditorArea />
          </main>

          {showChrome && settings.outlineVisible && (
            <>
              <div
                className="resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="调整大纲面板宽度"
                onMouseDown={outlineResize.onMouseDown}
              />
              <OutlinePanel />
            </>
          )}
        </div>
      )}

      {ready && !workspace && <Welcome />}

      <StatusBar />

      {/* 覆盖层 */}
      <ContextMenuHost />
      <DialogHost />
      <PromptDialogHost />
      <ShortcutsDialog />
      <ToastHost />
    </div>
  )
}
