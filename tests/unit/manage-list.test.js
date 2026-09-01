/**
 * F-G1 manage list 展示过滤：pre-rollback-* 存量污染条目不出现在快照列表
 *
 * 修复前 rebuildOrphans 曾把 safety tag（snap-pre-rollback-<ts>）strip 前缀
 * 后写进磁盘 index.json——这些 time=0 的污染条目会进 manage list。rebuild 侧
 * 已不再产生新污染（见 snapshots-persist.test.js F-G1 节），本文件钉住
 * routes-manage.js push() 的防御性展示过滤：磁盘/内存两个来源里的
 * pre-rollback-* 条目一律不渲染。谓词本体与 rebuildOrphans 共用
 * snapshots.js 的 isSafetySnapshotId（同一实现，防两处判定漂移）。
 */

import { describe, it, expect } from 'vitest'
import { createRoutesManage } from '../../src/host/routes-manage.js'

// op='list' 只触达：supported / listCache / dumpStores / state / sessionInfo；
// 其余 deps 留空（undefined），不被 list 路径访问。
function fakeDumps(entries, memorySnaps) {
  const state = { stores: new Map(), snapshots: memorySnaps || new Map() }
  return {
    supported: true,
    listCache: { items: null, at: 0 },
    dumpStores: async () => new Map([['/store', { root: 'D:/ws', entries }]]),
    state,
    sessionInfo: {
      sessionTitles: new Map(),
      messageTexts: new Map(),
      liveTitleFast: () => null,
      liveMessageTextFast: () => null,
    },
  }
}

describe('F-G1 manage list 过滤 pre-rollback 条目', () => {
  it('磁盘 dump 里的 pre-rollback-* 条目不进列表，普通条目照常', async () => {
    const routes = createRoutesManage(fakeDumps([
      { id: 'abc', time: 2, sessionId: 's1' },
      { id: 'pre-rollback-1700000000000', time: 0, sessionId: null },
    ]))

    const res = await routes.manage({ op: 'list' })

    expect(res.ok).toBe(true)
    expect(res.items.map((i) => i.id)).toEqual(['abc'])
    expect(res.total).toBe(1)
  })

  it('内存侧（state.snapshots）的 pre-rollback-* 条目同样被过滤', async () => {
    const memory = new Map()
    memory.set('pre-rollback-1700000000000', { root: 'D:/ws', time: 0, sessionId: null })
    memory.set('xyz', { root: 'D:/ws', time: 3, sessionId: 's1' })
    const routes = createRoutesManage(fakeDumps([], memory))

    const res = await routes.manage({ op: 'list' })

    expect(res.items.map((i) => i.id)).toEqual(['xyz'])
  })
})

// client fetchMessages 以 hasOwnProperty('messageText') 决定是否请求
// messages 端点冷读——Host 侧任何路径把 null 写进该属性（1.5.0 b8d39cb
// push 补全分支的回归），冷会话快照就永远只显示消息 ID。
describe('manage list messageText 字段存在性（client 冷读契约）', () => {
  it('冷会话条目经磁盘+内存双源后仍不携带 messageText 属性', async () => {
    const memory = new Map()
    memory.set('m1', { root: 'D:/ws', time: 2, sessionId: 's-cold' })
    const routes = createRoutesManage(fakeDumps(
      [{ id: 'm1', time: 2, sessionId: 's-cold' }],
      memory
    ))

    const res = await routes.manage({ op: 'list' })

    expect(res.items).toHaveLength(1)
    expect(Object.prototype.hasOwnProperty.call(res.items[0], 'messageText')).toBe(false)
  })

  it('live 命中的条目携带文本，双源补全不覆盖已有值', async () => {
    const memory = new Map()
    memory.set('m2', { root: 'D:/ws', time: 2, sessionId: 's-live' })
    const deps = fakeDumps([{ id: 'm2', time: 2, sessionId: 's-live' }], memory)
    deps.sessionInfo.liveMessageTextFast = (sid, mid) => (mid === 'm2' ? '你好' : null)
    const routes = createRoutesManage(deps)

    const res = await routes.manage({ op: 'list' })

    expect(res.items[0].messageText).toBe('你好')
  })
})
