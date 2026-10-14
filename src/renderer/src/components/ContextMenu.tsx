import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '../stores/appStore'

/**
 * 应用内右键菜单。
 *
 * 不用 Electron 的原生 Menu：原生菜单无法跟随应用主题，
 * 也无法在菜单项里展示快捷键提示的排版。这里用受控的 DOM 实现，
 * 并通过 Promise 把结果回传给调用方。
 */
export function ContextMenuHost(): React.JSX.Element | null {
  const menu = useAppStore((state) => state.contextMenu)
  const close = useAppStore((state) => state.closeContextMenu)
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu) return
    const element = ref.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width - 8
    const maxY = window.innerHeight - rect.height - 8
    setPosition({
      x: Math.min(menu.x, Math.max(8, maxX)),
      y: Math.min(menu.y, Math.max(8, maxY))
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close(null)
    }
    const onPointerDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) close(null)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('blur', () => close(null))
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown, true)
    }
  }, [menu, close])

  if (!menu) return null

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: position.x, top: position.y }}
    >
      {menu.items.map((item) => (
        <div key={item.id}>
          {item.separatorBefore && <div className="context-menu-separator" />}
          <button
            type="button"
            role="menuitem"
            className={`context-menu-item${item.danger ? ' is-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => close(item.id)}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>
  )
}
