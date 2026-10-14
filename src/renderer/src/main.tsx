import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

/**
 * 入口。
 *
 * 刻意不使用 React.StrictMode：它会在开发环境刻意重复执行 effect，
 * 而 CodeMirror 的挂载/销毁是命令式的，重复执行会带来额外的边界情况。
 */
const container = document.getElementById('root')
if (!container) {
  throw new Error('缺少 #root 容器，无法挂载应用')
}

createRoot(container).render(<App />)
