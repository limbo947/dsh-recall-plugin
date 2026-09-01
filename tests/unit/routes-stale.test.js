/**
 * PF-1 execute 预览失效校验分支单测（工厂级，注入假 deps 不跑 git）
 *
 * execute 的 STALE 判定三代并存：
 * - 带 previewTreeId：安全快照输出 TREE 指纹 ≠ preview 指纹 → STALE
 *   （安全快照已打下，不进索引反成救援点）；安全快照失败（无指纹）→
 *   跳过指纹校验继续回退（不阻断主流程的既有语义）。
 * - 只带 previewTotal（老 Client）：退回重复 diff 的条目数校验。
 * - 都不带（直调 API）：不校验直接回退。
 */

import { describe, it, expect } from 'vitest'
import { createRoutesCore } from '../../src/host/routes-core.js'
import * as E from '../../src/host/errors.js'

const ROOT = 'D:/ws'
const ID = 'm1'

function makeDeps(opts = {}) {
  const state = {
    snapshots: new Map([[ID, { root: ROOT, time: 1, sessionId: 's1' }]]),
    stores: new Map([[ROOT, { dir: '/store', git: '/store/git/.git' }]]),
    gitExe: 'git-exe',
    errors: [],
  }
  const calls = { diffFor: 0, snapshotScript: 0, rollback: 0 }
  const deps = {
    rt: {
      state,
      recordError: (m) => state.errors.push(String(m)),
      runShell: async (cmd) => {
        if (String(cmd) === 'SNAP_SCRIPT') {
          calls.snapshotScript++
          if (opts.snapshotFails) throw new Error('snap failed')
          return opts.safetyTreeId ? 'TREE ' + opts.safetyTreeId + '\nSNAP_OK' : 'SNAP_OK'
        }
        return ''
      },
      scripts: { snapshotScript: () => 'SNAP_SCRIPT' },
    },
    snaps: {
      diffFor: async () => {
        calls.diffFor++
        return { changes: [], total: opts.freshTotal ?? 7, truncated: false, treeId: null }
      },
      rollbackFor: async () => {
        calls.rollback++
        return { ok: true, count: 3 }
      },
      resolveCutSeq: async () => null,
    },
    state,
    cfg: { baseExcludes: [] },
    supported: true,
    enqueue: (task) => task(),
    agentBusy: () => false,
    rescueRollback: async () => ({ ok: false, code: E.RECALL_ROLLBACK_FAILED, message: 'rescue' }),
    E,
  }
  return { deps, calls }
}

describe('PF-1 execute 指纹校验分支', () => {
  it('previewTreeId 与安全快照指纹一致 → 正常回退，不跑重复 diff', async () => {
    const { deps, calls } = makeDeps({ safetyTreeId: 'tree-aaa' })
    const routes = createRoutesCore(deps)
    const res = await routes.execute({ messageId: ID, previewTreeId: 'tree-aaa' })
    expect(res.ok).toBe(true)
    expect(calls.diffFor).toBe(0)          // 重复 diff 被消掉（PF-1 主收益）
    expect(calls.snapshotScript).toBe(1)   // 安全快照照打
    expect(calls.rollback).toBe(1)
  })

  it('previewTreeId 与安全快照指纹不一致 → STALE（安全快照已打下）', async () => {
    const { deps, calls } = makeDeps({ safetyTreeId: 'tree-changed' })
    const routes = createRoutesCore(deps)
    const res = await routes.execute({ messageId: ID, previewTreeId: 'tree-preview' })
    expect(res.ok).toBe(false)
    expect(res.code).toBe(E.RECALL_STALE)
    expect(calls.diffFor).toBe(0)
    expect(calls.snapshotScript).toBe(1)   // 校验失败前快照已落地（救援点）
    expect(calls.rollback).toBe(0)
  })

  it('安全快照失败（无指纹）→ 跳过指纹校验继续回退（不阻断主流程）', async () => {
    const { deps, calls } = makeDeps({ snapshotFails: true })
    const routes = createRoutesCore(deps)
    const res = await routes.execute({ messageId: ID, previewTreeId: 'tree-preview' })
    expect(res.ok).toBe(true)
    expect(calls.rollback).toBe(1)
    expect(stateErrs(deps).some((e) => e.indexOf('safety snapshot failed') >= 0)).toBe(true)
  })

  it('只带 previewTotal（老 Client）→ 走旧 total 校验（跑一次 diff）', async () => {
    const { deps, calls } = makeDeps({ freshTotal: 7 })
    const routes = createRoutesCore(deps)
    const ok = await routes.execute({ messageId: ID, previewTotal: 7 })
    expect(ok.ok).toBe(true)
    const stale = await routes.execute({ messageId: ID, previewTotal: 6 })
    expect(stale.code).toBe(E.RECALL_STALE)
    expect(calls.diffFor).toBe(2)
  })

  it('都不带 → 不校验直接回退（直调 API 兼容）', async () => {
    const { deps, calls } = makeDeps()
    const routes = createRoutesCore(deps)
    const res = await routes.execute({ messageId: ID })
    expect(res.ok).toBe(true)
    expect(calls.diffFor).toBe(0)
  })
})

function stateErrs(deps) {
  return deps.state.errors
}
