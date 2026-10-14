/** 极简日志。主进程输出到 stdout，打包后由用户按需查看。 */
const PREFIX = '[markdown-notes]'

function ts(): string {
  return new Date().toISOString().slice(11, 23)
}

export const log = {
  info(...args: unknown[]): void {
    console.log(PREFIX, ts(), ...args)
  },
  warn(...args: unknown[]): void {
    console.warn(PREFIX, ts(), ...args)
  },
  error(...args: unknown[]): void {
    console.error(PREFIX, ts(), ...args)
  }
}
