/**
 * maintenance.js 按时间保留单测（S2-3）
 *
 * 纯函数 selectExpiredVictims（模块级导出）钉边界：0/负不启用、恰好
 * 在窗口内/外、time=0 孤儿最先清、多 root 独立、固定 now 钉时间语义。
 * 工厂级 enforceRetention 注入假 rt/ctx/snaps 钉执行链路（与
 * maintenance-limits.test.js 的 enforceLimits 同款结构）。
 */

import { describe, it, expect } from 'vitest'
import { selectExpiredVictims, createMaintenance } from '../../src/host/maintenance.js'

const DAY = 86400000

function snapMap(entries) {
  const m = new Map()
  for (const e of entries) m.set(e.id, { root: e.root, time: e.time, sessionId: e.sessionId || null })
  return m
}

describe('selectExpiredVictims（S2-3 纯逻辑）', () => {
  const now = 1000 * DAY

  it('0 或负值 = 不启用', () => {
    const snaps = snapMap([{ id: 'a', root: 'R1', time: 1 }])
    expect(selectExpiredVictims(snaps, 0, now).size).toBe(0)
    expect(selectExpiredVictims(snaps, -3, now).size).toBe(0)
    expect(selectExpiredVictims(snaps, undefined, now).size).toBe(0)
  })

  it('窗口内（time >= cutoff）不删，窗口外（time < cutoff）删', () => {
    const snaps = snapMap([
      { id: 'keep', root: 'R1', time: now - DAY + 1 },   // 刚好在窗口内
      { id: 'expire', root: 'R1', time: now - DAY - 1 },  // 刚过期
      { id: 'future', root: 'R1', time: now + 10 },       // 未来时间不受影响
    ])
    const victims = selectExpiredVictims(snaps, 1, now)
    expect([...victims.get('R1')].map((v) => v.id).sort()).toEqual(['expire'])
  })

  it('time=0 孤儿视为最旧，一并列入', () => {
    const snaps = snapMap([
      { id: 'orphan', root: 'R1', time: 0 },
      { id: 'recent', root: 'R1', time: now - 1000 },
    ])
    const victims = selectExpiredVictims(snaps, 1, now)
    expect([...victims.get('R1')].map((v) => v.id).sort()).toEqual(['orphan'])
  })

  it('多 root 各自独立判断', () => {
    const snaps = snapMap([
      { id: 'old1', root: 'R1', time: 1 },
      { id: 'old2', root: 'R2', time: 2 },
      { id: 'fresh', root: 'R2', time: now - 100 },
    ])
    const victims = selectExpiredVictims(snaps, 7, now)
    expect(victims.get('R1').map((v) => v.id)).toEqual(['old1'])
    expect(victims.get('R2').map((v) => v.id)).toEqual(['old2'])
  })
})

describe('enforceRetention（工厂级执行链路）', () => {
  function fakeSetup(days) {
    const state = {
      snapshots: new Map(),
      stores: new Map(),
      gitExe: 'git-exe',
      gcLastAt: new Map(),
      gcCount: new Map(),
    }
    const purged = []
    const saved = []
    const S = { purgeTagsScript: (store, gitExe, tags) => 'PURGE ' + tags.join(' '), gcScript: () => 'GC' }
    const rt = {
      state,
      scripts: S,
      resolveStore: async (root) => state.stores.get(root),
      runShell: async (cmd) => { if (String(cmd).startsWith('PURGE ')) { purged.push(...String(cmd).slice(6).split(' ')) } return '' },
      recordError: (t) => { state.lastError = t },
    }
    const snaps = { saveIndex: async (root) => { saved.push(root) } }
    const ctx = { sessions: { get: () => null }, get: () => null }
    // retentionDays = 0 的默认不启用路径由 createConfig 兜底；工厂直接
    // 以注入的 days 驱动，与 config 解析层解耦
    const maint = createMaintenance(ctx, rt, snaps, { retentionDays: days })
    return { state, rt, snaps, maint, purged, saved }
  }

  it('超期 → purge tag + 内存删除 + saveIndex', async () => {
    const { state, purged, saved, maint } = fakeSetup(1)
    state.stores.set('R1', { git: 'G1', dir: '/s' })
    state.snapshots.set('old', { root: 'R1', time: 1 })
    state.snapshots.set('fresh', { root: 'R1', time: Date.now() })

    const dropped = await maint.enforceRetention()

    expect(dropped).toBe(1)
    expect(purged).toEqual(['snap-old'])
    expect(state.snapshots.has('old')).toBe(false)
    expect(state.snapshots.has('fresh')).toBe(true)
    expect(saved).toEqual(['R1'])
  })

  it('0 = 不启用 → 什么都不做', async () => {
    const { state, purged, maint } = fakeSetup(0)
    state.stores.set('R1', { git: 'G1', dir: '/s' })
    state.snapshots.set('old', { root: 'R1', time: 1 })

    const dropped = await maint.enforceRetention()

    expect(dropped).toBe(0)
    expect(purged).toEqual([])
  })

  it('无 store / 无 git → 跳过该 root 不报错', async () => {
    const { state, maint } = fakeSetup(1)
    state.snapshots.set('old', { root: 'R-MISSING', time: 1 })

    const dropped = await maint.enforceRetention()

    expect(dropped).toBe(0)
  })
})