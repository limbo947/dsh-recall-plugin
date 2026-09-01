/**
 * PF-6 listCache 增量失效 + 批删复用缓存单测
 *
 * 原行为：每条消息快照清空 listCache.items → 对话中每次打开快照管理都
 * 全量 dumpStores，30s TTL 形同虚设。新行为：事件接线只标 stale，list
 * 先用旧 items 立即应答（stale: true），后台 dump 更新（in-flight 去重）；
 * 批删在缓存非空时直接由缓存构造 records（以用户所见为准），缓存为空才
 * 全量收集。
 */

import { describe, it, expect } from 'vitest'
import { createRoutesManage } from '../../src/host/routes-manage.js'

function makeDeps(opts = {}) {
  const listCache = { at: 0, items: opts.items || null, stale: false, refreshing: null }
  const usageCache = { at: 0, payload: null }
  let dumpCalls = 0
  let collectCalls = 0
  const purgeCalls = []
  const deps = {
    supported: true,
    listCache,
    dumpStores: async () => {
      dumpCalls++
      return new Map([['/store', { root: 'D:/ws', entries: opts.dumpEntries || [] }]])
    },
    collectAllSnapshotRecords: async () => {
      collectCalls++
      return opts.collectRecords || new Map()
    },
    state: {
      stores: new Map([['D:/ws', { dir: '/store', git: '/store/git/.git', home: true }]]),
      snapshots: opts.memorySnapshots || new Map(),
      indexLoaded: new Set(),
      gitExe: 'git',
    },
    enqueue: (task) => task(),
    usageCache,
    rt: {
      runShell: async (cmd) => {
        purgeCalls.push(String(cmd))
        return ''
      },
      scripts: { purgeTagsScript: (store, git, tags) => 'PURGE ' + tags.join(',') },
      recordError: () => {},
    },
    snaps: {
      saveIndex: async () => {},
      loadIndex: async () => {},
    },
    sessionInfo: {
      sessionTitles: new Map(),
      messageTexts: new Map(),
      liveTitleFast: () => null,
      liveMessageTextFast: () => null,
    },
  }
  return { deps, listCache, usageCache, counters: { get dump() { return dumpCalls }, get collect() { return collectCalls }, purgeCalls } }
}

function item(id, root, sessionId, time) {
  return { id, root, sessionId, time, workspace: 'ws', sessionTitle: null }
}

describe('PF-6 list 端点 stale 语义', () => {
  it('空缓存 → 同步 dump（首开现状），响应不带 stale', async () => {
    const { deps, counters } = makeDeps({ dumpEntries: [{ id: 'a', time: 1, sessionId: 's1' }] })
    const routes = createRoutesManage(deps)
    const res = await routes.manage({ op: 'list' })
    expect(res.ok).toBe(true)
    expect(res.stale).toBeFalsy()
    expect(res.items.map((i) => i.id)).toEqual(['a'])
    expect(counters.dump).toBe(1)
  })

  it('fresh 缓存 → 直接应答不再 dump', async () => {
    const { deps, listCache, counters } = makeDeps()
    listCache.items = [item('cached', 'D:/ws', 's1', 1)]
    listCache.at = Date.now()
    const routes = createRoutesManage(deps)
    const res = await routes.manage({ op: 'list' })
    expect(res.items.map((i) => i.id)).toEqual(['cached'])
    expect(res.stale).toBe(false)
    expect(counters.dump).toBe(0)
  })

  it('stale 缓存 → 立即应答带 stale:true，后台 dump 补新（仅一次）', async () => {
    const { deps, listCache, counters } = makeDeps({ dumpEntries: [{ id: 'fresh1', time: 9, sessionId: 's1' }] })
    listCache.items = [item('old', 'D:/ws', 's1', 1)]
    listCache.at = Date.now() - 60000 // 超 TTL
    listCache.stale = true
    const routes = createRoutesManage(deps)

    const first = await routes.manage({ op: 'list' })
    expect(first.items.map((i) => i.id)).toEqual(['old']) // 旧数据立即应答
    expect(first.stale).toBe(true)
    // 后台刷新进行中：连续第二次 list 不重复 dump（in-flight 去重）
    const second = await routes.manage({ op: 'list' })
    expect(second.stale).toBe(true)
    await listCache.refreshing
    expect(counters.dump).toBe(1)          // 两次 list 只触发一次 dump
    expect(listCache.stale).toBe(false)
    expect(listCache.items.map((i) => i.id)).toEqual(['fresh1'])
    // 后台完成后再 list：缓存 fresh 且无 stale
    const third = await routes.manage({ op: 'list' })
    expect(third.stale).toBe(false)
    expect(third.items.map((i) => i.id)).toEqual(['fresh1'])
  })
})

describe('PF-6 批删复用缓存', () => {
  it('缓存非空 → 直接由缓存构造 records，不跑 collectAllSnapshotRecords', async () => {
    const { deps, listCache, counters } = makeDeps()
    listCache.items = [
      item('del-1', 'D:/ws', 's1', 1),
      item('del-2', 'D:/ws', 's1', 2),
      item('keep', 'D:/other', 's2', 3),
    ]
    listCache.at = Date.now()
    const routes = createRoutesManage(deps)

    const res = await routes.manage({ op: 'delete', scope: 'workspace', root: 'D:/ws', sessionId: 's1' })
    expect(res.ok).toBe(true)
    expect(counters.collect).toBe(0)       // 缓存命中，全量收集未跑
    expect(counters.purgeCalls.length).toBe(1)
    expect(counters.purgeCalls[0]).toContain('snap-del-1')
    expect(counters.purgeCalls[0]).toContain('snap-del-2')
  })

  it('缓存为空 → 回落 collectAllSnapshotRecords（现状语义）', async () => {
    const { deps, counters } = makeDeps({
      collectRecords: new Map([['x1', { id: 'x1', root: 'D:/ws', sessionId: 's1', time: 1 }]]),
    })
    const routes = createRoutesManage(deps)
    const res = await routes.manage({ op: 'delete', scope: 'workspace', root: 'D:/ws', sessionId: 's1' })
    expect(res.ok).toBe(true)
    expect(res.deleted).toBe(1)
    expect(counters.collect).toBe(1)
    expect(counters.dump).toBe(0)
  })
})
