/**
 * snapshots.js 工厂级测试（P1-2）：feedback 落盘/回填往返
 *
 * createSnapshots 是工厂函数，注入假 rt/ctx/state 即可不跑 git 测试
 * saveIndex/loadIndex（纯索引 JSON 读写链路，经过 mock 的
 * rt.writeTextViaShell / rt.runShell）。钉住真实形状：
 * - 有跳过消息的 feedback 写进 index.json、正常快照不带；
 * - failed feedback 是纯内存态——失败消息没有索引条目（captureSnapshot
 *   失败路径只写 snapFeedback），saveIndex 按索引条目遍历故无从写入，
 *   重启即失（瞬态语义与熔断一致，有意决策见 plan-p1.md P1-2 差异）；
 * - loadIndex 回填回 snapFeedback（重启后 snapshot-info 仍可解释）；
 * - 旧格式索引（无 feedback 字段）正常载入、不产生 feedback。
 */

import { describe, it, expect } from 'vitest'
import { createSnapshots, isSafetySnapshotId, parseTagsWithTime } from '../../src/host/snapshots.js'
import { ENV_HINTS } from '../../src/host/diagnostics.js'

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

// 构造最小 rt：writeTextViaShell 捕获 index.json 落盘（diskIndex），
// runShell 按 indexReadCmd 前缀读回；脚本接口仅承载 stripBom/indexReadCmd
function fakeRt(state) {
  let diskIndex = ''
  const S = {
    stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
    indexReadCmd: (dir) => 'READ ' + dir,
  }
  const readDisk = (cmd) => (String(cmd).startsWith('READ ') ? diskIndex : '')
  return {
    state,
    isWin: false,
    scripts: S,
    writeTextViaShell: async (file, text) => {
      if (String(file).endsWith('index.json')) diskIndex = String(text)
    },
    runShell: async (cmd) => readDisk(cmd),
    // F-G3：loadIndex 走 runShellMeta（截断可判定）；本文件无非截断场景
    runShellMeta: async (cmd) => ({ text: readDisk(cmd), truncated: false }),
  }
}

const ROOT = 'D:/ws'
const SID = 'session-1'

describe('P1-2 feedback 持久化', () => {
  it('saveIndex：有跳过消息写入 feedback，正常快照不带；failed 不落盘（无索引条目）', async () => {
    const state = fakeState()
    const rt = fakeRt(state)
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })
    // 真实形状：skipped 是成功快照的反馈（条目与 feedback 并存）；failed
    // 消息没有快照，captureSnapshot 失败路径只写 feedback 不写索引条目。
    state.snapshots.set('m-skip', { root: ROOT, time: 2000, sessionId: SID })
    state.snapshots.set('m-ok', { root: ROOT, time: 3000, sessionId: SID })
    state.snapFeedback.set('m-skip', { skipped: ['a/', 'b/'] })
    state.snapFeedback.set('m-fail', { failed: true, error: 'boom' })

    await snaps.saveIndex(ROOT, SID)

    const entries = JSON.parse(await rt.runShell('READ /store'))
    expect(entries.find((e) => e.id === 'm-skip').feedback).toEqual({ skipped: ['a/', 'b/'] })
    expect(entries.find((e) => e.id === 'm-ok').feedback).toBeUndefined()
    // 现状钉子：saveIndex 按 state.snapshots 遍历，failed 消息无条目 →
    // feedback 不落盘。有意决策：failed 与熔断同为瞬态内存态，写无 tag 的
    // 幽灵条目会让 manage 树形把不存在的快照当节点（见 plan-p1.md）。
    expect(entries.find((e) => e.id === 'm-fail')).toBeUndefined()
  })

  it('loadIndex：回填 feedback 到 snapFeedback（重启后可解释）', async () => {
    const state = fakeState()
    const rt = fakeRt(state)
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })
    // 注：带 feedback 的 failed 条目当前不会由 saveIndex 产生（见上例），
    // 此处钉读取端防御——手工编辑/未来版本写入的索引仍被正确回填。kind
    // （M1 环境错误分类）随对象保留，重启后 status hint 不失效。
    const idx = JSON.stringify([
      { id: 'm-fail', time: 1000, root: ROOT, sessionId: SID, feedback: { failed: true, error: 'boom', kind: 'lock' } },
      { id: 'm-skip', time: 2000, root: ROOT, sessionId: SID, feedback: { skipped: ['a/'] } },
      { id: 'm-ok', time: 3000, root: ROOT, sessionId: SID },
    ])
    // 直接把索引文本塞进 fake rt 的读回（loadIndex 走 runShellMeta，两处都要覆盖）
    const feedIdx = idx
    rt.runShell = async () => feedIdx
    rt.runShellMeta = async () => ({ text: feedIdx, truncated: false })

    await snaps.loadIndex(ROOT, SID)

    expect(state.snapFeedback.get('m-fail')).toEqual({ failed: true, error: 'boom', kind: 'lock' })
    expect(state.snapFeedback.get('m-skip')).toEqual({ skipped: ['a/'] })
    expect(state.snapFeedback.has('m-ok')).toBe(false)
  })

  it('loadIndex：旧格式索引（无 feedback 字段）正常载入，无 feedback 产生', async () => {
    const state = fakeState()
    const rt = fakeRt(state)
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })
    const legacyIdx = JSON.stringify([
      { id: 'm1', time: 1000, root: ROOT, sessionId: SID },
      { id: 'm2', time: 2000, root: ROOT, sessionId: SID },
    ])
    rt.runShell = async () => legacyIdx
    rt.runShellMeta = async () => ({ text: legacyIdx, truncated: false })

    await snaps.loadIndex(ROOT, SID)

    expect(state.snapshots.has('m1')).toBe(true)
    expect(state.snapshots.has('m2')).toBe(true)
    expect(state.snapFeedback.size).toBe(0)
  })

  it('loadIndex：feedback 形状损坏/越界字段被清洗，不污染内存', async () => {
    const state = fakeState()
    const rt = fakeRt(state)
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })
    const dirtyIdx = JSON.stringify([
      { id: 'm1', time: 1000, root: ROOT, sessionId: SID, feedback: { failed: true, error: 42 } },
      { id: 'm2', time: 2000, root: ROOT, sessionId: SID, feedback: { skipped: 'not-array' } },
      { id: 'm3', time: 3000, root: ROOT, sessionId: SID, feedback: { failed: false } },
    ])
    rt.runShell = async () => dirtyIdx
    rt.runShellMeta = async () => ({ text: dirtyIdx, truncated: false })

    await snaps.loadIndex(ROOT, SID)

    // error 非 string 被丢弃但仍保留 failed:true（失败事实本身有效）
    expect(state.snapFeedback.get('m1')).toEqual({ failed: true })
    expect(state.snapFeedback.has('m2')).toBe(false) // skipped 非数组被清洗
    expect(state.snapFeedback.has('m3')).toBe(false) // failed:false 无 skipped → 不需要解释
  })

  it('saveIndex→loadIndex 往返：skipped 一致、failed 内存态重启即失（模拟重启）', async () => {
    // 第一轮：写入（真实形状：m-skip 条目+feedback，m-fail 只有 feedback）
    const state = fakeState()
    const rt = fakeRt(state)
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })
    state.snapshots.set('m-skip', { root: ROOT, time: 2000, sessionId: SID })
    state.snapshots.set('m-ok', { root: ROOT, time: 3000, sessionId: SID })
    state.snapFeedback.set('m-skip', { skipped: ['a/'] })
    state.snapFeedback.set('m-fail', { failed: true, error: 'boom' })
    await snaps.saveIndex(ROOT, SID)
    const persisted = await rt.runShell('READ /store')

    // 第二轮：全新 state/rt 模拟重启，从磁盘读回
    const state2 = fakeState()
    const rt2 = fakeRt(state2)
    const snaps2 = createSnapshots({ sessions: { get: () => null } }, rt2, { baseExcludes: [] })
    state2.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })
    rt2.runShell = async () => persisted
    rt2.runShellMeta = async () => ({ text: persisted, truncated: false })
    await snaps2.loadIndex(ROOT, SID)

    expect(state2.snapshots.has('m-skip')).toBe(true)
    expect(state2.snapshots.has('m-ok')).toBe(true)
    expect(state2.snapFeedback.get('m-skip')).toEqual({ skipped: ['a/'] })
    expect(state2.snapFeedback.has('m-ok')).toBe(false)
    // failed 是瞬态内存态：没进索引，重启后自然消失（重试自愈/熔断接管）
    expect(state2.snapFeedback.has('m-fail')).toBe(false)
  })
})

describe('F-G1 rebuildOrphans 过滤 pre-rollback 条目', () => {
  // 专用假 rt：listTagsWithTimeScript 回传「tag名 秒级时间戳」清单，
  // writeTextViaShell 捕获落盘索引
  function fakeRtRebuild(state, tags) {
    let diskIndex = ''
    const S = {
      stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
      indexReadCmd: (dir) => 'READ ' + dir,
      listTagsWithTimeScript: () => 'LISTTAGS',
    }
    return {
      state,
      isWin: false,
      scripts: S,
      resolveGit: async () => 'git-exe',
      writeTextViaShell: async (file, text) => {
        if (String(file).endsWith('index.json')) diskIndex = String(text)
      },
      runShell: async (cmd) => {
        if (String(cmd) === 'LISTTAGS') return tags.join('\n')
        return String(cmd).startsWith('READ ') ? diskIndex : ''
      },
      diskIndex: () => diskIndex,
    }
  }

  it('rebuild 输入含 snap-pre-rollback-123 与 snap-abc → 索引只收 abc，且 time 从 creatordate 恢复', async () => {
    const state = fakeState()
    const rt = fakeRtRebuild(state, ['snap-abc 1700000000', 'snap-pre-rollback-123 1700000001'])
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })

    await snaps.rebuildOrphans(ROOT, SID)

    expect(state.snapshots.has('abc')).toBe(true)
    // time 从 tag creatordate 恢复（秒→毫秒）：time=0 会让管理列表时间
    // 前缀缺失、retention/limits 按「最旧」误清
    expect(state.snapshots.get('abc').time).toBe(1700000000000)
    // 安全 tag 只作救援锚点：不进内存索引，更不落盘——否则 time=0 条目会进
    // 管理列表、占配额、被 retention 当「最旧」优先清掉（救援点随重度使用消失）
    expect(state.snapshots.has('pre-rollback-123')).toBe(false)
    const saved = JSON.parse(rt.diskIndex() || '[]')
    expect(saved.map((e) => e.id)).toEqual(['abc'])
  })

  it('parseTagsWithTime：正常行/坏时间行/空行/无空格行', () => {
    expect(parseTagsWithTime('snap-a 1700000000\nsnap-b notanumber\n\nsnap-c')).toEqual([
      { name: 'snap-a', time: 1700000000000 },
      { name: 'snap-b', time: null },
      { name: 'snap-c', time: null },
    ])
    expect(parseTagsWithTime('')).toEqual([])
    expect(parseTagsWithTime(null)).toEqual([])
  })

  it('isSafetySnapshotId 谓词：裸 id 命中、完整 tag 与普通 id 不命中', () => {
    // 与 routes-manage 展示过滤共用同一谓词——这里钉住边界，防两处判定漂移
    expect(isSafetySnapshotId('pre-rollback-1700000000000')).toBe(true)
    expect(isSafetySnapshotId('snap-pre-rollback-1700000000000')).toBe(false) // 完整 tag 名不是 id
    expect(isSafetySnapshotId('abc')).toBe(false)
    expect(isSafetySnapshotId('')).toBe(false)
    expect(isSafetySnapshotId(null)).toBe(false)
    expect(isSafetySnapshotId(123)).toBe(false)
  })
})

describe('PF-5 rebuildOrphans 四档守卫', () => {
  // 专用假 rt：loadIndex 走 runShellMeta（终态标记的数据源），rebuildOrphans
  // 走 runShell（listTagsWithTimeScript 回传 tag 清单）；diskIndex 捕获落盘。
  function fakeRtGuard(state, { rawIndex, truncated, tags }) {
    let diskIndex = ''
    let listCalls = 0
    const S = {
      stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
      indexReadCmd: (dir) => 'READ ' + dir,
      listTagsWithTimeScript: () => 'LISTTAGS',
    }
    return {
      state,
      isWin: false,
      scripts: S,
      resolveGit: async () => 'git-exe',
      writeTextViaShell: async (file, text) => {
        if (String(file).endsWith('index.json')) diskIndex = String(text)
      },
      runShell: async (cmd) => {
        if (String(cmd) === 'LISTTAGS') { listCalls++; return tags.join('\n') }
        return String(cmd).startsWith('READ ') ? diskIndex : ''
      },
      runShellMeta: async (cmd) => ({ text: String(cmd).startsWith('READ ') ? rawIndex : '', truncated: Boolean(truncated) }),
      diskIndex: () => diskIndex,
      listTagsCalled: () => listCalls,
      recordError: () => {},
    }
  }

  it('truncated（读截断）→ rebuild 整体跳过且不写盘（残缺视图绝不覆盖完好索引）', async () => {
    const state = fakeState()
    const rt = fakeRtGuard(state, { rawIndex: JSON.stringify([{ id: 'disk1', time: 1, sessionId: SID }]), truncated: true, tags: ['snap-orphan 1700000000'] })
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })

    await snaps.loadIndex(ROOT, SID)
    await snaps.rebuildOrphans(ROOT, SID)

    expect(state.indexTruncated.has(ROOT)).toBe(true)
    expect(rt.listTagsCalled()).toBe(0)      // 连 tag 清单进程都不起
    expect(rt.diskIndex()).toBe('')          // 不写盘
    expect(state.snapshots.size).toBe(0)     // 残缺空视图保持原样
  })

  it('healthy 且该 root 条目 > 0 → rebuild 跳过（常态 init 零多余进程）', async () => {
    const state = fakeState()
    const rt = fakeRtGuard(state, { rawIndex: JSON.stringify([{ id: 'a', time: 1, sessionId: SID }, { id: 'b', time: 2, sessionId: SID }]), truncated: false, tags: ['snap-late 1700000000'] })
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })

    await snaps.loadIndex(ROOT, SID)
    await snaps.rebuildOrphans(ROOT, SID)

    expect(state.indexHealthy.has(ROOT)).toBe(true)
    expect(rt.listTagsCalled()).toBe(0)
    expect(rt.diskIndex()).toBe('')
    expect(state.snapshots.size).toBe(2)
  })

  it('healthy 但条目为 0（磁盘索引为空数组）→ rebuild 照跑（合法重建态）', async () => {
    const state = fakeState()
    const rt = fakeRtGuard(state, { rawIndex: '[]', truncated: false, tags: ['snap-abc 1700000000'] })
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })

    await snaps.loadIndex(ROOT, SID)
    await snaps.rebuildOrphans(ROOT, SID)

    expect(state.indexHealthy.has(ROOT)).toBe(true)
    expect(rt.listTagsCalled()).toBe(1)
    expect(state.snapshots.has('abc')).toBe(true)
    expect(JSON.parse(rt.diskIndex()).map((e) => e.id)).toEqual(['abc'])
  })

  it.each([
    ['empty（无索引文件）', { rawIndex: '', truncated: false }],
    ['quarantined（损坏隔离）', { rawIndex: '{broken', truncated: false }],
  ])('%s → rebuild 照跑（自愈链路完整）', async (_label, opt) => {
    const state = fakeState()
    const rt = fakeRtGuard(state, { ...opt, tags: ['snap-orphan 1700000000'] })
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })

    await snaps.loadIndex(ROOT, SID)
    await snaps.rebuildOrphans(ROOT, SID)

    expect(state.indexHealthy.has(ROOT)).toBe(false)
    expect(rt.listTagsCalled()).toBe(1)
    expect(state.snapshots.has('orphan')).toBe(true)
  })
})

describe('M1 环境错误诊断接线（captureSnapshot 两个失败入口）', () => {
  // M1 主线的组装层钉子（纯函数测试覆盖不到）：ensureGit 失败 → 分类 →
  // snapFeedback 写入——此前该分支静默 return，客户端空轮询 20 次零提示。
  it('ensureGit 失败 → snapFeedback 写入分类后的可行动提示（不再静默）', async () => {
    const state = fakeState()
    const rt = {
      state,
      resolveRoot: async () => ROOT,
      resolveStore: async () => ({ dir: '/store', git: '/store/git/.git' }),
      tryUpgradeToHome: async (root) => state.stores.get(root),
      ensureGit: async () => ({ ok: false, error: 'error: could not lock config file /home/kevin/dsh-recall-snapshots/x/git/.git/config: File exists' }),
      scripts: {},
    }
    const snaps = createSnapshots({ get: () => null }, rt, { baseExcludes: [] })

    await snaps.captureSnapshot(SID, 'm-lock', 1000)

    const fb = state.snapFeedback.get('m-lock')
    expect(fb.failed).toBe(true)
    expect(fb.kind).toBe('lock')
    expect(fb.error).toBe(ENV_HINTS.lock)
    expect(fb.error.length).toBeLessThanOrEqual(140)
  })

  it('snapshotScript 失败 → 同样走分类（此处钉根因优先级：报错面是 add fatal、根因是磁盘满）', async () => {
    const state = fakeState()
    const rt = {
      state,
      resolveRoot: async () => ROOT,
      resolveStore: async () => ({ dir: '/store', git: '/store/git/.git' }),
      tryUpgradeToHome: async (root) => state.stores.get(root),
      ensureGit: async () => ({ ok: true }),
      scripts: {
        stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
        indexReadCmd: (dir) => 'READ ' + dir,
        snapshotScript: () => 'SNAP',
      },
      runShellMeta: async () => ({ text: '', truncated: false }),
      runShell: async (cmd) => {
        if (String(cmd) === 'SNAP') throw new Error('git add fatal (exit 2): No space left on device')
        return ''
      },
      recordError: () => {},
    }
    const snaps = createSnapshots({ get: () => null }, rt, { baseExcludes: [] })

    await snaps.captureSnapshot(SID, 'm-space', 1000)

    const fb = state.snapFeedback.get('m-space')
    expect(fb.failed).toBe(true)
    expect(fb.kind).toBe('space')
    expect(fb.error).toBe(ENV_HINTS.space)
  })
})