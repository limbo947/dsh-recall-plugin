/**
 * issue #31：只回退消息（messageOnly）的捕获短路径
 *
 * 验收面：开启后不跑快照脚本（零对象写入）、仍登记 files:false 条目；
 * 绕过 snapLimits / snapFailures 短路（两者描述文件快照的失败态，不该阻断
 * 消息登记）；ensureGit 失败不登记；diffFor 对无文件树条目直接空清单；
 * 索引往返只在 false 时落字段、旧条目缺省视为有文件树。
 */

import { describe, it, expect } from 'vitest'
import { createSnapshots } from '../../src/host/snapshots.js'

const ROOT = 'D:/ws'
const SID = 's1'
const STORE = { dir: '/store', git: '/store/git/.git' }

function fakeState() {
  return {
    snapshots: new Map(),
    snapFeedback: new Map(),
    indexLoaded: new Set(),
    indexHealthy: new Set(),
    indexTruncated: new Set(),
    stores: new Map(),
    gcLastAt: new Map(),
    gcCount: new Map(),
  }
}

function setup(options = {}) {
  const state = fakeState()
  state.stores.set(ROOT, STORE)
  const calls = { snapshotScript: 0, runShell: 0, ensureGit: 0 }
  let diskIndex = ''
  const rt = {
    state,
    isWin: false,
    scripts: {
      stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
      indexReadCmd: (dir) => 'READ ' + dir,
      fileReadCmd: (f) => 'FMT ' + f,
      snapshotScript: () => {
        calls.snapshotScript++
        return 'SNAP_SCRIPT'
      },
    },
    resolveRoot: async () => ROOT,
    resolveStore: async () => STORE,
    tryUpgradeToHome: async () => STORE,
    ensureGit: async () => {
      calls.ensureGit++
      return options.ensureGit || { ok: true }
    },
    recordError: () => {},
    runShell: async (cmd) => {
      calls.runShell++
      return String(cmd).startsWith('READ ') ? diskIndex : ''
    },
    runShellMeta: async (cmd) => ({ text: String(cmd).startsWith('READ ') ? diskIndex : '', truncated: false }),
    writeTextViaShell: async (file, text) => {
      if (String(file).endsWith('index.json')) diskIndex = String(text)
    },
  }
  const cfg = options.cfg || { baseExcludes: [], messageOnly: true, maxWorkspaceBytes: 1, scanBudgetMs: 1 }
  const snaps = createSnapshots({ sessions: { get: () => null } }, rt, cfg)
  return { state, rt, snaps, calls, cfg, readIndex: async () => JSON.parse(await rt.runShell('READ /store')) }
}

describe('messageOnly 捕获短路径（issue #31）', () => {
  it('不跑快照脚本，仍登记 files:false 条目并落盘', async () => {
    const { snaps, calls, state, readIndex } = setup()

    await snaps.captureSnapshot(SID, 'm1', 1234)

    expect(calls.snapshotScript).toBe(0) // 零对象写入：整条 snapshotScript 不启动
    expect(state.snapshots.get('m1')).toEqual({ root: ROOT, time: 1234, sessionId: SID, files: false })
    const entries = await readIndex()
    expect(entries.find((e) => e.id === 'm1').files).toBe(false)
  })

  it('关闭开关时走完整快照脚本（行为不变）', async () => {
    const { snaps, calls } = setup({ cfg: { baseExcludes: [], messageOnly: false } })

    await snaps.captureSnapshot(SID, 'm2', 1)

    expect(calls.snapshotScript).toBe(1)
  })

  it('绕过 SNAP_LIMIT 停用短路：同工作区超限后仍能登记消息', async () => {
    const { snaps, rt, cfg, state } = setup({ cfg: { baseExcludes: [], messageOnly: false, maxWorkspaceBytes: 1, scanBudgetMs: 1 } })
    rt.runShell = async () => 'SNAP_LIMIT bytes 999 1'

    await snaps.captureSnapshot(SID, 'm-limit', 1)
    expect(state.snapshots.has('m-limit')).toBe(false) // 完整模式：超限停用，不登记

    cfg.messageOnly = true
    rt.runShell = async (cmd) => (String(cmd).startsWith('READ ') ? '' : '')
    await snaps.captureSnapshot(SID, 'm-msg', 2)
    // 停用标记只约束文件快照；仅消息登记不该被它拦下
    expect(state.snapshots.get('m-msg').files).toBe(false)
  })

  it('ensureGit 失败：不登记条目，写失败反馈（与完整快照同通道）', async () => {
    const { snaps, state } = setup({ ensureGit: { ok: false, error: '未检测到 git CLI' } })

    await snaps.captureSnapshot(SID, 'm3', 1)

    expect(state.snapshots.has('m3')).toBe(false)
    expect(state.snapFeedback.get('m3').failed).toBe(true)
  })

  it('diffFor：files:false 直接返回空清单，不跑 diff 脚本', async () => {
    const { snaps, state, calls } = setup()
    state.snapshots.set('m4', { root: ROOT, time: 1, sessionId: SID, files: false })
    const before = calls.runShell

    const diff = await snaps.diffFor('m4')

    expect(diff).toEqual({ changes: [], total: 0, truncated: false, treeId: null, counts: { modified: 0, restored: 0, added: 0 } })
    expect(calls.runShell).toBe(before)
  })

  it('loadIndex：files:false 回填，旧条目（无字段）视为有文件树', async () => {
    const { snaps, state, rt } = setup()
    const idx = JSON.stringify([
      { id: 'only', time: 1, root: ROOT, sessionId: SID, files: false },
      { id: 'full', time: 2, root: ROOT, sessionId: SID },
    ])
    rt.runShell = async (cmd) => (String(cmd).indexOf('FMT ') === 0 ? '' : idx)
    rt.runShellMeta = async () => ({ text: idx, truncated: false })

    await snaps.loadIndex(ROOT, SID)

    expect(state.snapshots.get('only').files).toBe(false)
    expect(state.snapshots.get('full').files).toBeUndefined()
  })

  it('saveIndex：有文件树的条目不带 files 字段（省体积、旧版可读）', async () => {
    const { snaps, state, readIndex } = setup()
    state.snapshots.set('full', { root: ROOT, time: 5, sessionId: SID })

    await snaps.saveIndex(ROOT, SID)

    const entries = await readIndex()
    expect(entries.find((e) => e.id === 'full').files).toBeUndefined()
  })
})
