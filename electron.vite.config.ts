import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * 内容安全策略。
 *
 * 开发期必须放行内联脚本 —— Vite 的 React Fast Refresh 会往 index.html 注入
 * 一段内联 preamble。生产环境则禁止内联脚本，只允许本地文件与自定义资源协议。
 *
 * 关于 `file:`：打包后页面通过 file:// 加载，Chromium 对 file:// 文档的
 * `'self'` 匹配在不同版本上表现不一致，因此显式列出 file:，
 * 避免出现"空白窗口"这类极难排查的故障。真正的红线是
 * 禁止远程脚本、禁止 object/iframe、禁止表单提交、禁止任意 connect。
 */
const PROD_CSP = [
  "default-src 'none'",
  "script-src 'self' file:",
  "style-src 'self' file: 'unsafe-inline'",
  "img-src 'self' file: data: blob: notes-asset:",
  "font-src 'self' file: data:",
  "connect-src 'self'",
  "media-src 'self' file: data: notes-asset:",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: notes-asset:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*",
  "media-src 'self' data: notes-asset:",
  "object-src 'none'",
  "frame-src 'none'"
].join('; ')

/** 把对应环境的 CSP 注入 index.html 的占位注释处 */
function cspPlugin(isDev: boolean): Plugin {
  const csp = isDev ? DEV_CSP : PROD_CSP
  return {
    name: 'markdown-notes:csp',
    transformIndexHtml(html: string) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`
      if (html.includes('<!--CSP-->')) return html.replace('<!--CSP-->', tag)
      return html.replace('</head>', `  ${tag}\n  </head>`)
    }
  }
}

export default defineConfig(({ command }) => {
  const isDev = command === 'serve'

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: {
          '@shared': resolve('src/shared'),
          '@main': resolve('src/main')
        }
      },
      build: {
        rollupOptions: {
          input: { index: resolve('src/main/index.ts') }
        }
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      },
      build: {
        rollupOptions: {
          input: { index: resolve('src/preload/index.ts') }
        }
      }
    },
    renderer: {
      root: resolve('src/renderer'),
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared')
        }
      },
      plugins: [react(), cspPlugin(isDev)],
      build: {
        rollupOptions: {
          input: { index: resolve('src/renderer/index.html') }
        }
      }
    }
  }
})
