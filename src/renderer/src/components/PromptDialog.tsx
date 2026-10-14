import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../stores/appStore'

/**
 * 文本输入对话框。
 *
 * Electron 没有实现 window.prompt，所以新建/重命名这类需要输入的地方
 * 必须用应用内对话框。这里同时承担输入校验（非法文件名当场提示）。
 */
export function PromptDialogHost(): React.JSX.Element | null {
  const prompt = useAppStore((state) => state.prompt)
  const resolvePrompt = useAppStore((state) => state.resolvePrompt)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!prompt) return
    setValue(prompt.defaultValue ?? '')
    setError(null)
    const timer = window.setTimeout(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      // 默认选中文件名主体，方便直接改名
      const dot = input.value.lastIndexOf('.')
      if (dot > 0) input.setSelectionRange(0, dot)
      else input.select()
    }, 10)
    return () => window.clearTimeout(timer)
  }, [prompt])

  if (!prompt) return null

  const submit = (): void => {
    const trimmed = value.trim()
    if (!trimmed) {
      setError('名称不能为空')
      return
    }
    const validation = prompt.validate?.(trimmed) ?? null
    if (validation) {
      setError(validation)
      return
    }
    resolvePrompt(trimmed)
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="dialog dialog-sm">
        <h2 className="dialog-title">{prompt.title}</h2>
        {prompt.label && <p className="dialog-message">{prompt.label}</p>}
        <input
          ref={inputRef}
          className="dialog-input"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              resolvePrompt(null)
            }
          }}
        />
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => resolvePrompt(null)}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            {prompt.confirmText ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
