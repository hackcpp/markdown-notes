import { useEffect, useRef } from 'react'
import { editorHost } from './editorHost'
import { useDocsStore } from '../../stores/docsStore'

/**
 * 编辑器容器。
 *
 * 只负责把 CodeMirror 挂到一个稳定的 DOM 节点上；
 * 文档切换、内容更新一律通过 editorHost 的命令式接口完成，
 * React 不参与编辑器内部状态管理（否则每次按键都会重建编辑器）。
 */
export function EditorPane(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const active = useDocsStore((state) => state.active)

  useEffect(() => {
    const element = hostRef.current
    if (!element) return
    editorHost.mount(element)
    return () => {
      editorHost.unmount()
    }
  }, [])

  useEffect(() => {
    if (active) editorHost.activate(active)
  }, [active])

  return <div className="cm-host" ref={hostRef} />
}
