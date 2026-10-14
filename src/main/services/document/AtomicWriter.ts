import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { TEMP_SUFFIX } from '@shared/constants'
import { mapNodeError } from '../../utils/errors'

/**
 * 原子写入：同目录临时文件 → 刷新缓冲 → rename 覆盖。
 *
 * 注意边界：原子 rename 只能保证"写入过程不会被读到半截内容"，
 * 它无法阻止两个独立程序同时写同一个文件。版本校验（见 DocumentService）
 * 才是防覆盖的关键，这里不承担该职责。
 */
export async function atomicWriteFile(absPath: string, data: Uint8Array): Promise<void> {
  const dir = path.dirname(absPath)
  const base = path.basename(absPath)
  const tmp = path.join(dir, `.${base}.${randomBytes(6).toString('hex')}${TEMP_SUFFIX}`)

  // 保留原文件权限；新文件使用 0644（Windows 上此参数基本无影响）
  let mode = 0o644
  try {
    const st = await fs.stat(absPath)
    if (st.isFile()) mode = st.mode & 0o777
  } catch {
    /* 目标不存在，使用默认权限 */
  }

  let handle: Awaited<ReturnType<typeof fs.open>> | null = null
  try {
    handle = await fs.open(tmp, 'wx', mode)
    await handle.writeFile(data)
    // 先落盘再 rename，避免掉电后出现空文件
    await handle.sync()
  } catch (err) {
    if (handle) await handle.close().catch(() => undefined)
    await fs.unlink(tmp).catch(() => undefined)
    throw mapNodeError(err)
  }
  await handle.close().catch(() => undefined)

  try {
    await fs.rename(tmp, absPath)
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined)
    throw mapNodeError(err)
  }

  // 尽力而为地 fsync 父目录；Windows 上打开目录会失败，忽略即可
  try {
    const dirHandle = await fs.open(dir, 'r')
    await dirHandle.sync().catch(() => undefined)
    await dirHandle.close().catch(() => undefined)
  } catch {
    /* 平台不支持，忽略 */
  }
}

/** 清理写入过程中可能残留的临时文件 */
export async function cleanupTempFiles(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.endsWith(TEMP_SUFFIX))
        .map((e) => fs.unlink(path.join(dir, e.name)).catch(() => undefined))
    )
  } catch {
    /* 忽略 */
  }
}
