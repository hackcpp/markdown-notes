// 跨平台启动包装器：先清掉 ELECTRON_RUN_AS_NODE 再调用 electron-vite。
//
// 背景：某些集成终端 / 工具链会在环境里预设 ELECTRON_RUN_AS_NODE=1，
// 目的是让 electron 二进制能被当作普通 Node 使用。一旦该变量存在，
// electron-vite 派生出的 Electron 会退化成纯 Node 进程，
// 主进程里 require('electron') 拿不到 app / protocol 等 API，
// 启动直接以 "Cannot read properties of undefined" 失败。
//
// 这里在派生子进程前彻底删除该变量，保证 npm run dev / start 在任何终端都能跑。
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electronVite = require.resolve('electron-vite/package.json')
const bin = path.join(path.dirname(electronVite), 'bin', 'electron-vite.js')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const args = process.argv.slice(2)
const child = spawn(process.execPath, [bin, ...args], {
  stdio: 'inherit',
  env,
  windowsHide: false
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

child.on('error', (err) => {
  console.error('[run-electron-vite] 启动失败:', err.message)
  process.exit(1)
})
