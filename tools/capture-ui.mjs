// 一次性 UI 截图工具：通过 CDP 驱动 Electron 渲染进程，展开目录 → 打开笔记 → 截图。
import fs from 'node:fs'

const PORT = 9222
const OUT = process.argv[2] || 'ui-shot.png'
const TARGET_FILE = process.argv[3] || 'Transformer.md'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getPageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {}
    await sleep(500)
  }
  throw new Error('DevTools target not found')
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', () => res())
    ws.addEventListener('error', () => rej(new Error('ws error')))
  })
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id
      pending.set(mid, { resolve, reject })
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    return r.result?.value
  }
  return { ready, send, evaluate, close: () => ws.close() }
}

const target = await getPageTarget()
const c = cdp(target.webSocketDebuggerUrl)
await c.ready
await c.send('Runtime.enable')
await c.send('Page.enable')

// 只在最近的 .tree-row 上派发一次 click（点多次会在展开/折叠之间来回抵消）
const clickByText = (text) => `(() => {
  const leaves = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(text)})
  if (!leaves.length) return false
  const row = leaves[0].closest('.tree-row') || leaves[0]
  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  return true
})()`

// 反复尝试：目录展开是逐层的，每轮点一个还没点过的目录，直到目标笔记出现
const openState = await c.evaluate(`(() => { window.__clicked = []; return true })()`)
void openState
let opened = false
for (let round = 0; round < 25; round++) {
  const hasTarget = await c.evaluate(`(() => {
    return [...document.querySelectorAll('*')].some(e => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(TARGET_FILE)})
  })()`)
  if (hasTarget) {
    await c.evaluate(clickByText(TARGET_FILE))
    opened = true
    break
  }
  // 点开一个尚未点过的目录名（从当前可见的树节点里挑）
  const picked = await c.evaluate(`(() => {
    const names = ['知识库', 'Transformer', '日记', 'notes', 'notes2']
    for (const n of names) {
      if (window.__clicked.includes(n)) continue
      const leaf = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === n)
      if (leaf) { window.__clicked.push(n); return n }
    }
    return null
  })()`)
  if (!picked) { await sleep(400); continue }
  await c.evaluate(clickByText(picked))
  await sleep(600)
}
console.log('opened target:', opened)

await sleep(2800)

const shot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
console.log('saved:', OUT, fs.statSync(OUT).size, 'bytes')

const probe = await c.evaluate(`(() => {
  const preview = document.querySelector('[class*="preview"]')
  const lines = [...document.querySelectorAll('.cm-line')]
  return {
    editorLines: lines.length,
    firstLines: lines.slice(0, 6).map(l => l.textContent),
    previewChars: preview ? preview.textContent.trim().length : 0,
    headings: [...document.querySelectorAll('[class*="preview"] h1, [class*="preview"] h2')].map(h => h.textContent)
  }
})()`)
console.log('probe:', JSON.stringify(probe, null, 2))
c.close()
process.exit(0)
