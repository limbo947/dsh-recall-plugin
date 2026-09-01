/**
 * PF-5 cleanupLegacy 内存标记单测
 *
 * 旧版 blobs 目录只存在于极早期版本用户的降级工作区，探测删除一次后不可
 * 能再出现——legacyCleaned 标记让同 root 多次 init 只付一条进程（init 与
 * 启动预热都会调用）。pwsh 侧 legacyRmScript 加 -ErrorAction SilentlyContinue
 * 是配套改动：目标不存在是常态，不容错则 Remove-Item 抛错永远走不到
 * 「成功」分支，标记失效。
 */

import { describe, it, expect } from 'vitest'
import { createRuntime } from '../../src/host/store.js'

function fakeCtx() {
  const calls = []
  const shell = {
    resolve: (spec) => spec,
    run: async (spec) => {
      calls.push(spec.command)
      return { exitCode: 0, stdout: { text: '', truncated: false }, stderr: { text: '' } }
    },
  }
  return { ctx: { shell, sessions: { list: () => [] }, get: () => null }, calls }
}

const CFG = { baseExcludes: [], maxFileBytes: 104857600 }

describe('PF-5 cleanupLegacy 标记', () => {
  it('home store：多次 init 只跑一次 legacyRm（标记命中后跳过）', async () => {
    const { ctx, calls } = fakeCtx()
    const rt = createRuntime(ctx, CFG)
    rt.state.stores.set('D:/ws', { dir: '/store', git: '/store/git/.git', home: true })

    rt.cleanupLegacy('D:/ws')
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.length).toBe(1)

    rt.cleanupLegacy('D:/ws')
    rt.cleanupLegacy('D:/ws')
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.length).toBe(1) // 标记命中，不再起进程
  })

  it('降级 store（home:false）→ 直接跳过（该目录就是新 store，不能删）', async () => {
    const { ctx, calls } = fakeCtx()
    const rt = createRuntime(ctx, CFG)
    rt.state.stores.set('D:/ws', { dir: 'D:/ws/.dsh-recall-snapshots', git: 'D:/ws/.dsh-recall-snapshots/git/.git', home: false })

    rt.cleanupLegacy('D:/ws')
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.length).toBe(0)
  })

  it('store 未解析 → 不跑（与既有守卫一致）', async () => {
    const { ctx, calls } = fakeCtx()
    const rt = createRuntime(ctx, CFG)
    rt.cleanupLegacy('D:/unknown')
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.length).toBe(0)
  })
})
