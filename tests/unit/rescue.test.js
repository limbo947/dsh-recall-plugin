/**
 * H1 回退失败救援闭环单测
 *
 * 两块纯逻辑：
 * 1. rescueRollback（snapshots.js 模块级导出）——execute 失败分支的救援编排，
 *    副作用经 deps 注入（runShell/scripts/recordError），钉三分支：
 *    无救援点（safety 快照当时失败）/救援成功/救援失败；
 * 2. rollbackFor 失败形状——保持 { ok, count } 成功形状不变，失败路径不再
 *    裸抛，改为返回 { ok:false, partial:true, error }（可能半回退），让
 *    execute 侧能区分「可救援失败」与「成功」。
 */

import { describe, it, expect, vi } from 'vitest'
import { createSnapshots, rescueRollback } from '../../src/host/snapshots.js'
import * as pwshScripts from '../../src/host/scripts.pwsh.js'
import * as posixScripts from '../../src/host/scripts.posix.js'

const ROOT = 'D:/ws'
const SID = 'session-1'

function fakeState() {
  return {
    snapshots: new Map(),
    stores: new Map(),
    indexLoaded: new Set(),
    indexHealthy: new Set(),
    indexTruncated: new Set(),
    gitExe: 'git-exe',
  }
}

function fakeRt(state, runShellImpl) {
  const S = {
    stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
    rollbackScript: (root, store, gitExe, tag, base) => 'ROLLBACK ' + tag,
  }
  return {
    state,
    isWin: false,
    scripts: S,
    runShell: runShellImpl || (async () => ''),
  }
}

function makeSnaps(state, rt) {
  return createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
}

describe('rollbackFor 失败形状（H1）', () => {
  it('ROLLBACK_OK 哨兵解析出 deleted+restored 总数', async () => {
    const state = fakeState()
    const rt = fakeRt(state, async () => 'ROLLBACK_OK 2 3\n')
    const snaps = makeSnaps(state, rt)
    state.snapshots.set('m1', { root: ROOT, time: 1, sessionId: SID })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })

    const res = await snaps.rollbackFor('m1')

    expect(res).toEqual({ ok: true, count: 5 })
  })

  it('无 ROLLBACK_OK 哨兵 → partial:true（工作区可能半回退）', async () => {
    const state = fakeState()
    const rt = fakeRt(state, async () => 'some garbage output')
    const snaps = makeSnaps(state, rt)
    state.snapshots.set('m1', { root: ROOT, time: 1, sessionId: SID })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })

    const res = await snaps.rollbackFor('m1')

    expect(res.ok).toBe(false)
    expect(res.partial).toBe(true)
    expect(res.error).toContain('半回退')
  })

  it('runShell 抛错 → partial:true，error 携带脚本输出摘要', async () => {
    const state = fakeState()
    const rt = fakeRt(state, async () => { throw new Error('index.lock exists') })
    const snaps = makeSnaps(state, rt)
    state.snapshots.set('m1', { root: ROOT, time: 1, sessionId: SID })
    state.stores.set(ROOT, { dir: '/store', git: '/store/git/.git' })

    const res = await snaps.rollbackFor('m1')

    expect(res.ok).toBe(false)
    expect(res.partial).toBe(true)
    expect(res.error).toContain('index.lock exists')
  })

  it('无快照/无存储仍返回 ok:false（非 partial，execute 已前置拦截）', async () => {
    const state = fakeState()
    const rt = fakeRt(state)
    const snaps = makeSnaps(state, rt)

    expect(await snaps.rollbackFor('missing')).toEqual({ ok: false, error: '该消息没有可用的项目快照' })
  })
})

describe('rescueRollback 救援编排（H1）', () => {
  function deps(runShell, recordError) {
    return {
      runShell,
      scripts: { rescueScript: (root, store, gitExe, tag) => 'RESCUE ' + tag },
      gitExe: 'git-exe',
      recordError,
    }
  }
  const opts = (safetyOk) => ({
    root: '/ws',
    store: { git: '/g' },
    safetyId: 'pre-rollback-1',
    safetyOk,
    rollbackError: 'boom',
  })

  it('无安全快照 → 不调 runShell，返回无救援点', async () => {
    const runShell = vi.fn(async () => 'RESCUE_OK')
    const recordError = vi.fn()
    const res = await rescueRollback(deps(runShell, recordError), opts(false))

    expect(res.code).toBe('ROLLBACK_FAILED')
    expect(res.message).toContain('无可用安全快照')
    expect(runShell).not.toHaveBeenCalled()
    expect(recordError).toHaveBeenCalledTimes(1)
  })

  it('救援成功 → 返回已恢复文案，传给脚本的是完整 tag 名', async () => {
    const runShell = vi.fn(async () => 'RESCUE_OK')
    const recordError = vi.fn()
    const res = await rescueRollback(deps(runShell, recordError), opts(true))

    expect(res.code).toBe('ROLLBACK_FAILED')
    expect(res.message).toContain('已自动恢复')
    expect(runShell).toHaveBeenCalledTimes(1)
    // F-S1：snapshotScript 打 tag 无条件加 snap- 前缀，rescueScript 收到的
    // 必须是完整 tag 名——裸 safetyId 会让 reset 落到 unknown revision
    expect(runShell.mock.calls[0][0]).toContain('snap-pre-rollback-1')
    expect(recordError.mock.calls[0][0]).toContain('snap-pre-rollback-1')
  })

  it('救援失败 → 返回手动恢复命令（引号路径 + 完整 tag 名）', async () => {
    const runShell = vi.fn(async () => { throw new Error('rescue boom') })
    const recordError = vi.fn()
    const res = await rescueRollback(deps(runShell, recordError), opts(true))

    expect(res.code).toBe('ROLLBACK_FAILED')
    expect(res.message).toContain('git --git-dir="/g" --work-tree="/ws" reset --hard snap-pre-rollback-1')
    expect(recordError.mock.calls[0][0]).toContain('rescue failed')
  })

  it('RESCUE_OK 哨兵缺失 → 按救援失败处理（防 git 静默未生效的假成功）', async () => {
    const runShell = vi.fn(async () => 'some output without sentinel')
    const recordError = vi.fn()
    const res = await rescueRollback(deps(runShell, recordError), opts(true))

    expect(res.code).toBe('ROLLBACK_FAILED')
    expect(res.message).toContain('请手动执行')
    expect(recordError.mock.calls[0][0]).toContain('rescue failed')
  })

  // F-S1 接线测试：真实 scripts 模板 + 假 runShell——捕获 runShell 收到的
  // 命令串，断言 reset 目标带 snap- 前缀。S1 之所以漏网，正是因为原有
  // 三分支测试全用假脚本模板，从未触达真实模板的 tag 命名。
  it('接线测试：真实 pwsh/posix 模板产出的命令 reset 到 snap-pre-rollback-*', async () => {
    for (const scripts of [pwshScripts, posixScripts]) {
      const seen = []
      const recordError = vi.fn()
      const d = {
        runShell: async (cmd) => { seen.push(cmd); return 'RESCUE_OK' },
        scripts,
        gitExe: 'git-exe',
        recordError,
      }
      const res = await rescueRollback(d, opts(true))

      expect(res.message).toContain('已自动恢复')
      expect(seen).toHaveLength(1)
      expect(seen[0]).toContain('reset --hard')
      expect(seen[0]).toContain("'snap-pre-rollback-1'")
    }
  })
})
