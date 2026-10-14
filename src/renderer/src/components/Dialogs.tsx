import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { Icon } from './Icons'

/** 多项选择对话框（关闭未保存标签页、覆盖确认等场景共用） */
export function DialogHost(): React.JSX.Element | null {
  const dialog = useAppStore((state) => state.dialog)
  const closeDialog = useAppStore((state) => state.closeDialog)

  useEffect(() => {
    if (!dialog) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeDialog(dialog.cancelId ?? null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dialog, closeDialog])

  if (!dialog) return null

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog(dialog.cancelId ?? null)
      }}
    >
      <div className="dialog">
        <h2 className="dialog-title">{dialog.title}</h2>
        {dialog.message && <p className="dialog-message">{dialog.message}</p>}
        <div className="dialog-choices">
          {dialog.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`btn btn-block${item.danger ? ' btn-danger' : ''}${
                item.id === 'save' ? ' btn-primary' : ''
              }`}
              onClick={() => closeDialog(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 轻提示 */
export function ToastHost(): React.JSX.Element | null {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)
  if (toasts.length === 0) return null

  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast-${toast.kind}`}
          onClick={() => dismiss(toast.id)}
        >
          <Icon name={toast.kind === 'error' ? 'alert' : toast.kind === 'success' ? 'check' : 'info'} />
          <span>{toast.text}</span>
        </button>
      ))}
    </div>
  )
}

const SHORTCUTS: Array<{ group: string; items: Array<[string, string]> }> = [
  {
    group: '文件',
    items: [
      ['Ctrl+N', '新建笔记'],
      ['Ctrl+Shift+N', '新建文件夹'],
      ['Ctrl+Shift+O', '打开文件夹'],
      ['Ctrl+S', '保存当前笔记'],
      ['Ctrl+Alt+S', '全部保存'],
      ['Ctrl+W', '关闭当前标签页'],
      ['Ctrl+Shift+E', '在文件管理器中显示']
    ]
  },
  {
    group: '编辑',
    items: [
      ['Ctrl+Z / Ctrl+Shift+Z', '撤销 / 重做'],
      ['Ctrl+F / Ctrl+H', '查找 / 查找与替换'],
      ['Ctrl+B / Ctrl+I', '加粗 / 斜体'],
      ['Ctrl+E', '行内代码'],
      ['Ctrl+K', '插入链接'],
      ['Ctrl+1 / 2 / 3', '一 / 二 / 三级标题'],
      ['Ctrl+Shift+8 / 7 / 9', '无序 / 有序 / 任务列表'],
      ['Ctrl+Shift+Q', '引用'],
      ['Ctrl+Shift+K', '代码块']
    ]
  },
  {
    group: '视图',
    items: [
      ['Ctrl+Shift+B', '文件侧边栏'],
      ['Ctrl+Shift+U', '大纲面板'],
      ['Ctrl+Alt+1 / 2 / 3', '源码 / 分屏 / 预览'],
      ['Ctrl+Shift+L', '切换明暗主题'],
      ['Ctrl+Shift+D', '专注模式']
    ]
  }
]

export function ShortcutsDialog(): React.JSX.Element | null {
  const open = useAppStore((state) => state.shortcutsOpen)
  const setOpen = useAppStore((state) => state.setShortcutsOpen)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <div className="dialog dialog-lg">
        <h2 className="dialog-title">快捷键一览</h2>
        <div className="shortcut-grid">
          {SHORTCUTS.map((section) => (
            <section key={section.group}>
              <h3>{section.group}</h3>
              <dl>
                {section.items.map(([keys, label]) => (
                  <div key={keys} className="shortcut-row">
                    <dt>{label}</dt>
                    <dd>{keys}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
