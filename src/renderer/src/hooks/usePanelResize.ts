import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 可拖拽面板宽度。
 *
 * 拖动过程中只更新本地 state（保证跟手），松手时才写回设置，
 * 避免每一帧都触发一次设置持久化。
 */
export function usePanelResize(options: {
  value: number
  min: number
  max: number
  /** 面板在右侧时传 true（鼠标向左拖动才是变宽） */
  invert?: boolean
  onCommit: (width: number) => void
}): { width: number; onMouseDown: (event: React.MouseEvent) => void } {
  const { value, min, max, invert = false, onCommit } = options
  const [width, setWidth] = useState(value)
  const widthRef = useRef(value)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (draggingRef.current) return
    setWidth(value)
    widthRef.current = value
  }, [value])

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = widthRef.current
      draggingRef.current = true
      document.body.classList.add('is-resizing')

      const onMove = (moveEvent: MouseEvent): void => {
        const delta = (moveEvent.clientX - startX) * (invert ? -1 : 1)
        const next = Math.min(max, Math.max(min, Math.round(startWidth + delta)))
        widthRef.current = next
        setWidth(next)
      }

      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        document.body.classList.remove('is-resizing')
        draggingRef.current = false
        onCommit(widthRef.current)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [invert, max, min, onCommit]
  )

  return { width, onMouseDown }
}

/** 简易防抖：把高频事件合并成一次执行 */
export function createDebounced(fn: () => void, delay: number): () => void {
  let timer: number | null = null
  return () => {
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = null
      fn()
    }, delay)
  }
}
