/**
 * PF-3 manage op='usage' 单测：多 store 并行 + 30s TTL 缓存
 *
 * usage 原实现逐 store 串行 await diskUsageScript（多工作区叠加慢）且无缓存
 * （ManageCard 每次 refresh 都重算）。改造后：runLimited 并发 4（读操作不碰
 * index.lock，防极端磁盘争抢）、单 store 失败跳过语义保留、全量分支 30s TTL
 * 缓存（删除/gc 调用点失效——本测试直接操作 usageCache 模拟）。
 */

import { describe, it, expect } from 'vitest'
import { createRoutesManage } from '../../src/host/routes-manage.js'

function makeDeps(stores, opts = {}) {
  const calls = []
  const usageCache = { at: 0, payload: null }
  const deps = {
    supported: true,
    state: { stores: new Map(stores.map((s) => [s.root, s])), gitExe: 'git' },
    rt: {
      resolveRoot: async () => null,
      resolveStore: async () => null,
      runShell: async (cmd) => {
        calls.push(cmd)
        if (opts.failDir && String(cmd).indexOf(opts.failDir) >= 0) throw new Error('disk error')
        return String(cmd.length) + '\n'
      },
      scripts: {
        diskUsageScript: (dir) => 'USAGE ' + dir,
        stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
      },
    },
    runLimited: async (tasks, concurrency) => {
      expect(concurrency).toBe(4)
      let i = 0
      const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
        while (i < tasks.length) await tasks[i++]()
      })
      await Promise.all(workers)
    },
    usageCache,
    sessionInfo: { sessionTitles: new Map(), messageTexts: new Map(), liveTitleFast: () => null, liveMessageTextFast: () => null },
  }
  return { deps, calls, usageCache }
}

const STORE_A = { root: 'D:/a', dir: '/store-a', home: true }
const STORE_B = { root: 'D:/b', dir: '/store-b', home: false }

describe('PF-3 usage 并行与缓存', () => {
  it('多 store 并行求和正确，单 store 失败跳过（既有语义）', async () => {
    const { deps, calls } = makeDeps([STORE_A, STORE_B], { failDir: '/store-b' })
    const routes = createRoutesManage(deps)
    const res = await routes.manage({ op: 'usage' })
    expect(res.ok).toBe(true)
    expect(res.bytes).toBe(Number('USAGE /store-a'.length)) // 仅 store-a 计入
    expect(res.homeStores).toBe(1)
    expect(res.fallbackStores).toBe(1)
    expect(calls.length).toBe(2)
  })

  it('全量分支 30s TTL 缓存：第二次调用不再跑 shell，删除后失效重算', async () => {
    const { deps, calls, usageCache } = makeDeps([STORE_A])
    const routes = createRoutesManage(deps)
    const first = await routes.manage({ op: 'usage' })
    expect(calls.length).toBe(1)
    const second = await routes.manage({ op: 'usage' })
    expect(calls.length).toBe(1) // 缓存命中
    expect(second).toEqual(first)
    // 模拟删除/gc 调用点的失效动作
    usageCache.payload = null
    await routes.manage({ op: 'usage' })
    expect(calls.length).toBe(2)
  })

  it('带 sessionId 的单工作区分支不写缓存（client 无此调用形态，不值得 key 维度）', async () => {
    const { deps, usageCache } = makeDeps([STORE_A])
    const routes = createRoutesManage(deps)
    // resolveRoot 返回 null → NO_ROOT（本测试只验「未写缓存」）
    await routes.manage({ op: 'usage', sessionId: 's1' }).catch(() => {})
    expect(usageCache.payload).toBe(null)
  })
})
