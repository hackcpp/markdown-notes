import type { FailureReason } from '@shared/types'
import { failureText } from '@shared/utils/errors'

interface NodeLikeError {
  code?: string
  message?: string
}

/** 带业务错误码的错误。渲染进程只关心 reason，不关心底层 errno。 */
export class AppError extends Error {
  readonly reason: FailureReason

  constructor(reason: FailureReason, message?: string) {
    super(message ?? failureText(reason))
    this.name = 'AppError'
    this.reason = reason
  }
}

const PERMISSION_CODES = new Set([
  'EACCES',
  'EPERM',
  'EBUSY',
  'EROFS',
  'EMFILE',
  'ENFILE',
  'ETXTBSY'
])
const DISK_CODES = new Set(['ENOSPC', 'EDQUOT', 'EFBIG'])
const NAME_CODES = new Set(['ENAMETOOLONG', 'EINVAL', 'ESRCH', 'ENOTDIR'])

/** 把 Node 的 errno 映射成可展示的业务错误 */
export function mapNodeError(err: unknown): AppError {
  if (err instanceof AppError) return err

  const e = (err ?? {}) as NodeLikeError
  const code = typeof e.code === 'string' ? e.code : ''

  let reason: FailureReason = 'IO_ERROR'
  if (PERMISSION_CODES.has(code)) reason = 'PERMISSION_DENIED'
  else if (DISK_CODES.has(code)) reason = 'DISK_FULL'
  else if (code === 'ENOENT') reason = 'NOT_FOUND'
  else if (code === 'EEXIST') reason = 'ALREADY_EXISTS'
  else if (code === 'EISDIR') reason = 'NOT_A_FILE'
  else if (code === 'ENOTEMPTY') reason = 'DIR_NOT_EMPTY'
  else if (NAME_CODES.has(code)) reason = 'INVALID_NAME'

  const detail = e.message ? `（${e.message}）` : ''
  return new AppError(reason, `${failureText(reason)}${detail}`)
}

export function toFileOpFailure(err: unknown): { ok: false; reason: FailureReason; message: string } {
  const appErr = mapNodeError(err)
  return { ok: false, reason: appErr.reason, message: appErr.message }
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
