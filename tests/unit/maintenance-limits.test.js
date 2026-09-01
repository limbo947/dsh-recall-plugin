/**
 * maintenance.js 存储总量上限单测（P1-3）
 *
 * 纯函数 selectOverLimitVictims（模块级导出）钉边界；工厂级 enforceLimits
 * 注入假 rt/ctx/snaps 钉执行链路（tag purge + saveIndex + 内存删除）。
 */

import { describe, it, expect } from 'vitest'
import { selectOverLimitVictims, createMaintenance } from '../../src/host/maintenance.js'

function snapMap(entries) {
  const m = new Map()
  for (const e of entries) m.set(e.id, { root: e.root, time: e.time, sessionId: e.sessionId || null })
  return m
}

describe('selectOverLimitVictims（P1-3 纯逻辑）', () => {
  it('超限 N 条 → 删最旧 N 条（time 升序）', () => {
    const snaps = snapMap([
      { id: 'a', root: 'R1', time: 100 },
      { id: 'b', root: 'R1', time: 300 },
      { id: 'c', root: 'R1', time: 200 },
      { id: 'd', root: 'R1', time: 400 },
    ])
    const victims = selectOverLimitVictims(snaps, 2)
    expect([...victims.get('R1')].map((v) => v.id)).toEqual(['a', 'c'])
  })

  it('恰好等于上限 → 不删', () => {
    const snaps = snapMap([{ id: 'a', root: 'R1', time: 1 }, { id: 'b', root: 'R1', time: 2 }])
    expect(selectOverLimitVictims(snaps, 2).size).toBe(0)
  })

  it('time=0 孤儿最先被清（视为最旧）', () => {
    const snaps = snapMap([
      { id: 'orphan', root: 'R1', time: 0 },
      { id: 'a', root: 'R1', time: 100 },
      { id: 'b', root: 'R1', time: 200 },
    ])
    const victims = selectOverLimitVictims(snaps, 1)
    expect([...victims.get('R1')].map((v) => v.id)).toEqual(['orphan', 'a'])
  })

  it('0 或负值 = 不限制', () => {
    const snaps = snapMap([{ id: 'a', root: 'R1', time: 1 }])
    expect(selectOverLimitVictims(snaps, 0).size).toBe(0)
    expect(selectOverLimitVictims(snaps, -1).size).toBe(0)
    expect(selectOverLimitVictims(snaps, undefined).size).toBe(0)
  })

  it('多 root 各自独立算上限', () => {
    const snaps = snapMap([
      { id: 'a1', root: 'R1', time: 1 }, { id: 'a2', root: 'R1', time: 2 }, { id: 'a3', root: 'R1', time: 3 },
      { id: 'b1', root: 'R2', time: 1 },
    ])
    const victims = selectOverLimitVictims(snaps, 2)
    expect(victims.get('R1').map((v) => v.id)).toEqual(['a1'])
    expect(victims.has('R2')).toBe(false)
  })
})

describe('enforceLimits（工厂级执行链路）', () => {
  function fakeSetup(maxLimit) {
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
    const maint = createMaintenance(ctx, rt, snaps, { maxSnapshotsPerWorkspace: maxLimit })
    return { state, rt, snaps, maint, purged, saved }
  }

  it('超限 → purge 最旧 tag + 内存删除 + saveIndex', async () => {
    const { state, purged, saved, maint } = fakeSetup(2)
    state.stores.set('R1', { git: 'G1', dir: '/s' })
    state.snapshots.set('a', { root: 'R1', time: 100 })
    state.snapshots.set('b', { root: 'R1', time: 200 })
    state.snapshots.set('c', { root: 'R1', time: 300 })

    const dropped = await maint.enforceLimits()

    expect(dropped).toBe(1)
    expect(purged).toEqual(['snap-a'])
    expect(state.snapshots.has('a')).toBe(false)
    expect(state.snapshots.has('b')).toBe(true)
    expect(saved).toEqual(['R1'])
  })

  it('未超限 → 什么都不做', async () => {
    const { state, purged, saved, maint } = fakeSetup(10)
    state.stores.set('R1', { git: 'G1', dir: '/s' })
    state.snapshots.set('a', { root: 'R1', time: 100 })

    const dropped = await maint.enforceLimits()

    expect(dropped).toBe(0)
    expect(purged).toEqual([])
    expect(saved).toEqual([])
  })

  it('0 = 不限制', async () => {
    const { state, purged, maint } = fakeSetup(0)
    state.stores.set('R1', { git: 'G1', dir: '/s' })
    state.snapshots.set('a', { root: 'R1', time: 100 })
    state.snapshots.set('b', { root: 'R1', time: 200 })

    const dropped = await maint.enforceLimits()

    expect(dropped).toBe(0)
    expect(purged).toEqual([])
  })

  it('无 store / 无 git → 跳过该 root 不报错', async () => {
    const { state, maint } = fakeSetup(1)
    state.snapshots.set('a', { root: 'R-MISSING', time: 100 })

    const dropped = await maint.enforceLimits()

    expect(dropped).toBe(0)
  })
})