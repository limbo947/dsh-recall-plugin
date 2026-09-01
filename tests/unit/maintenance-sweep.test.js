/**
 * PF-7 sweepDeletedSessions 判定矩阵单测
 *
 * sweep 换 listSessions 一次建 id 集合替代逐会话 readSession 冷读（后者
 * 在串行队列里逐会话解压全日志，gc 到就堵队）。判定矩阵：live 命中保留、
 * 磁盘集合中保留（含归档/损坏日志——purge 不可逆宁可少清）、集合外 purge、
 * 服务缺失/枚举异常整体跳过（保守闸门）。titles 半项已由探针废弃
 * （SessionHeader 无 title，见 tests/probe/api-surface.test.js）。
 */

import { describe, it, expect } from 'vitest'
import { createMaintenance } from '../../src/host/maintenance.js'

const ROOT = 'R1'

function makeEnv({ liveIds = [], diskRecords = [], queryMissing = false, listThrows = false } = {}) {
  const state = {
    snapshots: new Map([
      ['m-live', { root: ROOT, time: 1, sessionId: 's-live' }],
      ['m-disk', { root: ROOT, time: 2, sessionId: 's-disk' }],
      ['m-gone', { root: ROOT, time: 3, sessionId: 's-gone' }],
    ]),
    stores: new Map([[ROOT, { dir: '/store', git: '/store/git/.git', home: true }]]),
    gitExe: 'git',
    gcLastAt: new Map(),
    gcCount: new Map(),
  }
  const purged = []
  const rt = {
    state,
    resolveStore: async () => state.stores.get(ROOT),
    runShell: async (cmd) => {
      purged.push(String(cmd))
      return ''
    },
    scripts: { purgeTagsScript: (store, git, tags) => 'PURGE ' + tags.join(','), gcScript: () => 'GC' },
    recordError: () => {},
  }
  const snaps = { saveIndex: async () => {} }
  const ctx = {
    sessions: { get: (id) => (liveIds.includes(id) ? { id } : null) },
    get: (name) => {
      if (name !== 'sessionQuery') return null
      if (queryMissing) return null
      return {
        listSessions: async () => {
          if (listThrows) throw new Error('query unavailable')
          return diskRecords.map((id) => ({ header: { id } }))
        },
      }
    },
  }
  const maint = createMaintenance(ctx, rt, snaps, { maxSnapshotsPerWorkspace: 0, retentionDays: 0 })
  return { maint, state, purged }
}

describe('PF-7 sweep 判定矩阵（listSessions 替代 readSession 冷读）', () => {
  it('live 命中 / 磁盘集合中 → 保留；集合外 → purge（purgeTags + saveIndex）', async () => {
    const { maint, state, purged } = makeEnv({
      liveIds: ['s-live'],
      diskRecords: ['s-disk', 's-archived-other'],
    })
    await maint.sweepDeletedSessions()
    expect(state.snapshots.has('m-live')).toBe(true)
    expect(state.snapshots.has('m-disk')).toBe(true)
    expect(state.snapshots.has('m-gone')).toBe(false)
    // purge 走 tag 删除 + 索引重写（purgeTagsScript 命令一次，100 块内）
    expect(purged.length).toBe(1)
    expect(purged[0]).toContain('snap-m-gone')
  })

  it('归档会话（不在 live 注册表但日志仍在磁盘）→ 不被误清', async () => {
    const { maint, state } = makeEnv({ liveIds: [], diskRecords: ['s-live', 's-disk'] })
    await maint.sweepDeletedSessions()
    expect(state.snapshots.has('m-live')).toBe(true)
    expect(state.snapshots.has('m-disk')).toBe(true)
    expect(state.snapshots.has('m-gone')).toBe(false)
  })

  it('sessionQuery 服务缺失 → 整体跳过（保守闸门）', async () => {
    const { maint, state, purged } = makeEnv({ queryMissing: true })
    await maint.sweepDeletedSessions()
    expect(state.snapshots.size).toBe(3)
    expect(purged.length).toBe(0)
  })

  it('listSessions 抛异常 → 整体跳过（枚举失败不动数据，宁可不清理）', async () => {
    const { maint, state, purged } = makeEnv({ listThrows: true })
    await maint.sweepDeletedSessions()
    expect(state.snapshots.size).toBe(3)
    expect(purged.length).toBe(0)
  })

  it('磁盘记录缺 header.id 的条目被过滤（I8 形状契约）', async () => {
    const { maint, state, purged } = makeEnv({
      liveIds: ['s-live'],
      diskRecords: [null, {}, 's-disk'],
    })
    await maint.sweepDeletedSessions()
    // s-live（live 命中）与 s-disk（磁盘集合）保留，残缺条目（null/{}）不计
    expect(state.snapshots.has('m-live')).toBe(true)
    expect(state.snapshots.has('m-disk')).toBe(true)
    expect(state.snapshots.has('m-gone')).toBe(false)
    expect(purged.length).toBe(1)
  })
})
