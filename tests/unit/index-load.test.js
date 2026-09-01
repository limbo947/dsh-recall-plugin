/**
 * H2 index.json 载入校验单测
 *
 * loadIndex 损坏 fail-loud：JSON.parse 失败或整体非数组时，坏文件改名
 * index.json.corrupt-<ts> 保留现场 + recordError，按空索引继续（孤儿重建
 * 可从 tag 反推）；逐条非法条目（非对象/缺 string id）过滤 + 计数告警，
 * 整体不判死。root/time 的宽松兼容（root 以参数为准、time 缺省回退 now）
 * 是旧索引双向兼容策略，不属「损坏」，不告警。
 */

import { describe, it, expect } from 'vitest'
import { createSnapshots } from '../../src/host/snapshots.js'

const ROOT = 'D:/ws'
const SID = 'session-1'

function fakeState() {
  return {
    snapshots: new Map(),
    snapFeedback: new Map(),
    indexLoaded: new Set(),
    indexHealthy: new Set(),
    indexTruncated: new Set(),
    stores: new Map(),
    cutSeqCache: new Map(),
    gcLastAt: new Map(),
    gcCount: new Map(),
  }
}

function makeRt(state, rawIndex, opts = {}) {
  const S = {
    stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
    indexReadCmd: (dir) => 'READ ' + dir,
    renameFileCmd: (src, dst) => 'RENAME ' + src + ' => ' + dst,
  }
  const errors = []
  const rt = {
    state,
    isWin: false,
    scripts: S,
    errors,
    renameCalls: [],
    recordError: (msg) => { errors.push(String(msg)) },
    runShell: async (cmd) => {
      const c = String(cmd)
      if (c.startsWith('READ ')) return rawIndex
      if (c.startsWith('RENAME ')) {
        if (opts.renameFail) throw new Error('rename failed')
        rt.renameCalls.push(c)
        return ''
      }
      return ''
    },
    // F-G3：loadIndex 改走 runShellMeta（官方 CollectedOutput.truncated 可
    // 判定）；opts.truncated 模拟「stdout 超 maxBytes 被截断」的读
    runShellMeta: async (cmd) => ({ text: await rt.runShell(cmd), truncated: Boolean(opts.truncated) }),
  }
  return rt
}

function makeSnaps(state, rt) {
  return createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
}

function withStore(state) {
  state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })
}

describe('loadIndex 损坏 fail-loud（H2）', () => {
  it('截断 JSON → 改名 .corrupt 保留现场 + recordError + 按空索引', async () => {
    const state = fakeState()
    const rt = makeRt(state, '{"id":"m1",')
    const snaps = makeSnaps(state, rt)
    withStore(state)

    await snaps.loadIndex(ROOT, SID)

    expect(state.snapshots.size).toBe(0)
    expect(rt.renameCalls.length).toBe(1)
    expect(rt.renameCalls[0]).toContain('index.json.corrupt-')
    expect(rt.errors.some((e) => e.indexOf('recall index corrupt') >= 0)).toBe(true)
    expect(state.indexLoaded.has(ROOT)).toBe(true)
  })

  it('整体非数组 → 同样按损坏处理保留现场', async () => {
    const state = fakeState()
    const rt = makeRt(state, '{"not":"array"}')
    const snaps = makeSnaps(state, rt)
    withStore(state)

    await snaps.loadIndex(ROOT, SID)

    expect(state.snapshots.size).toBe(0)
    expect(rt.renameCalls.length).toBe(1)
    expect(rt.errors.some((e) => e.indexOf('recall index corrupt') >= 0)).toBe(true)
  })

  it('rename 失败 → 不标记 indexLoaded（下次重试而非跳过坏文件）', async () => {
    const state = fakeState()
    const rt = makeRt(state, '{broken', { renameFail: true })
    const snaps = makeSnaps(state, rt)
    withStore(state)

    await snaps.loadIndex(ROOT, SID)

    expect(state.indexLoaded.has(ROOT)).toBe(false)
    expect(rt.errors.some((e) => e.indexOf('quarantine failed') >= 0)).toBe(true)
  })

  it('逐条非法条目（缺 id/空 id/非对象）过滤 + 计数告警，正常条目保留', async () => {
    const state = fakeState()
    const idx = JSON.stringify([
      { id: 'm-ok', time: 1000, root: ROOT, sessionId: SID },
      { time: 2000 },               // 缺 id
      null,                          // 非对象
      { id: '', time: 2500 },        // A6：空字符串 id 同样拒绝
      { id: 'm2', time: 3000, root: ROOT, sessionId: SID },
    ])
    const rt = makeRt(state, idx)
    const snaps = makeSnaps(state, rt)
    withStore(state)

    await snaps.loadIndex(ROOT, SID)

    expect(state.snapshots.has('m-ok')).toBe(true)
    expect(state.snapshots.has('m2')).toBe(true)
    expect(state.snapshots.has('')).toBe(false)
    expect(state.snapshots.size).toBe(2)
    expect(rt.errors.some((e) => e.indexOf('3 invalid entries') >= 0)).toBe(true)
    expect(rt.renameCalls.length).toBe(0) // 不整体判死
  })

  it('F-G3 截断标记 → 不隔离、不覆盖原文件，按空索引继续并告警', async () => {
    // 模拟 stdout 超 4MB 上限：内容哪怕碰巧是完好 JSON（截断保留流尾部，
    // 现实中头已丢），也必须走截断分支而不是损坏分支
    const state = fakeState()
    const rt = makeRt(state, JSON.stringify([{ id: 'm1', time: 1 }]), { truncated: true })
    const snaps = makeSnaps(state, rt)
    withStore(state)

    await snaps.loadIndex(ROOT, SID)

    expect(state.snapshots.size).toBe(0)
    expect(rt.renameCalls.length).toBe(0) // 好/未知文件不被隔离改名
    expect(rt.errors.some((e) => e.indexOf('recall index read truncated') >= 0)).toBe(true)
    expect(state.indexLoaded.has(ROOT)).toBe(true) // 标记已载入防重试刷错误环
  })

  it('正常数组全载入，无告警；time 缺省回退 now、root 以参数为准（兼容）', async () => {
    const state = fakeState()
    const idx = JSON.stringify([
      { id: 'm1', sessionId: SID },  // 旧索引：无 root/time
      { id: 'm2', time: 2000, root: 'IGNORED', sessionId: SID },
    ])
    const rt = makeRt(state, idx)
    const snaps = makeSnaps(state, rt)
    withStore(state)

    await snaps.loadIndex(ROOT, SID)

    expect(state.snapshots.size).toBe(2)
    expect(state.snapshots.get('m1').root).toBe(ROOT) // 以参数为准
    expect(state.snapshots.get('m2').root).toBe(ROOT)
    expect(typeof state.snapshots.get('m1').time).toBe('number') // 回退 now
    expect(rt.errors.length).toBe(0)
  })
})
