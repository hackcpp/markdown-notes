import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  },
  test: {
    environment: 'node',
    // 纯逻辑层测试放在 tests/；渲染层需要与源码同处一个 tsconfig（含 DOM lib）的测试与其源码同级
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // 主进程代码依赖 electron 运行时，因此单元测试只覆盖纯逻辑层
    reporters: ['default']
  }
})
