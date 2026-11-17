/**
 * ensureGit 并发去重单测（issue #37）
 *
 * 现场：新建工作区发首条消息时，init 端点（或启动预热）的 `ensureRootReady`
 * 与首条消息快照的 `captureSnapshot` 各自直接跑一次 `git init`，两条链不共享
 * 任何锁。git 的 `copy_templates` 先 `lstat` 判「目标不存在」再以 `O_EXCL` 建，
 * 输家拿到 EEXIST → `fatal: cannot copy ... File exists`，该条消息没有快照。
 *
 * 本文件钉三件事：
 * 1) 同一 store.git 的并发调用只触发**一次** shell，且两个调用拿到同一结果；
 * 2) 失败不缓存：in-flight 清理后下一次调用会真的重试（瞬态失败可自愈）；
 * 3) 已就绪（gitReady 命中）时不进 in-flight 表，零 shell。
 *
 * 用 deferred promise 而不是 setTimeout 制造并发窗口：断言不依赖时序，
 * CI 慢机上同样稳定。
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRuntime, SHELL_PROBE_COMMAND, SHELL_PROBE_SENTINEL } from '../../src/host/store.js'

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

const OK = (text = '') => ({ exitCode: 0, stdout: { text, truncated: false }, stderr: { text: '' } })
const FAIL = (text) => ({ exitCode: 1, stdout: { text: '' }, stderr: { text } })

// 手工闸门：让 ensureGit 命令停在 promise 上，测试显式放行——
// 这样才能稳定地让两个调用真正重叠（不靠 sleep 撞窗口）
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// 等异步链推进到「ensureGit 的 shell 已发起」：resolveGit 自己也是一次 shell
// 往返，单次 setImmediate 不够。用有界轮询替代固定 sleep（CI 慢机同样稳定）。
async function settle(times = 8) {
  for (let i = 0; i < times; i++) await new Promise((r) => setImmediate(r))
}

// win32 上 runShell 会先跑方言探针（issue #15）：不按哨兵应答就判成 bash、
// 改走直连通道真的去 spawn powershell.exe——单测里必须让探针命中 pwsh 分支。
const replyProbe = (spec) => (spec.command.includes(SHELL_PROBE_SENTINEL) ? OK(SHELL_PROBE_SENTINEL + '\n') : null)

// 计数型 runtime：ensureGit 脚本每次调用 +1，并由测试决定何时完成
function makeRuntime({ gate } = {}) {
  const calls = { ensureGit: 0 }
  const shell = {
    resolve: (spec) => spec,
    execute: async (spec) => ({
      result: async () => {
        const probe = replyProbe(spec)
        if (probe) return probe
        const cmd = spec.command
        if (cmd.includes('GIT_OK')) {
          calls.ensureGit += 1
          if (gate) await gate.promise
          return OK('GIT_OK')
        }
        // resolveGitScript 等其它命令直接成功
        return OK('/usr/bin/git')
      },
    }),
  }
  const rt = createRuntime({ shell, sessions: { list: () => [] }, get: () => null }, { baseExcludes: [] })
  return { rt, calls }
}

const STORE = {
  dir: '/store', repo: '/store/git', git: '/store/git/.git', home: true,
  excludeFile: '/store/exclude.txt', maxFileBytes: 8388608,
  maxWorkspaceBytes: 268435456, scanBudgetMs: 10000,
}

describe('ensureGit 并发去重（issue #37）', () => {
  it('同一 store.git 并发两次 → 只跑一次 shell，两个调用拿到同一结果', async () => {
    const gate = deferred()
    const { rt, calls } = makeRuntime({ gate })

    const a = rt.ensureGit('/work/proj', STORE)
    const b = rt.ensureGit('/work/proj', STORE)
    // 两个调用都已发起；闸门未放行时应只有一次 shell 在跑
    await settle()
    expect(calls.ensureGit).toBe(1)

    gate.resolve()
    const [ra, rb] = await Promise.all([a, b])
    expect(ra.ok).toBe(true)
    expect(rb.ok).toBe(true)
    // 同一 promise 的产物：同一 store 引用（不是各自构造的新对象）
    expect(ra.store).toBe(rb.store)
    expect(calls.ensureGit).toBe(1)
  })

  it('三次并发也只跑一次（去重对 N 个调用者成立）', async () => {
    const gate = deferred()
    const { rt, calls } = makeRuntime({ gate })
    const all = [
      rt.ensureGit('/work/proj', STORE),
      rt.ensureGit('/work/proj', STORE),
      rt.ensureGit('/work/proj', STORE),
    ]
    await settle()
    expect(calls.ensureGit).toBe(1)
    gate.resolve()
    const results = await Promise.all(all)
    expect(results.every((r) => r.ok)).toBe(true)
    expect(calls.ensureGit).toBe(1)
  })

  it('成功后再调用：gitReady 命中，零 shell（不因去重改变原有幂等语义）', async () => {
    const { rt, calls } = makeRuntime()
    const first = await rt.ensureGit('/work/proj', STORE)
    expect(first.ok).toBe(true)
    expect(calls.ensureGit).toBe(1)

    const second = await rt.ensureGit('/work/proj', STORE)
    expect(second.ok).toBe(true)
    // 仍是 1：第二次走 gitReady 短路，没有新进程
    expect(calls.ensureGit).toBe(1)
  })

  it('失败不缓存：in-flight 清理后下一次真的重试', async () => {
    let attempt = 0
    const shell = {
      resolve: (spec) => spec,
      execute: async (spec) => ({
        result: async () => {
          const probe = replyProbe(spec)
          if (probe) return probe
          const cmd = spec.command
          if (cmd.includes('GIT_OK')) {
            attempt += 1
            // 首次失败（模拟 EEXIST 竞态输家），之后成功
            if (attempt === 1) return FAIL("fatal: cannot copy 'x' to 'y': File exists")
            return OK('GIT_OK')
          }
          return OK('/usr/bin/git')
        },
      }),
    }
    const rt = createRuntime({ shell, sessions: { list: () => [] }, get: () => null }, { baseExcludes: [] })
    // 非 home store：跳过 issue #36 的「home 无仓库时降级到项目内」分支，
    // 否则首次失败会被降级路径救回来，测不到「失败结果未被缓存」这条语义
    const nonHome = { ...STORE, home: false }

    const failed = await rt.ensureGit('/work/proj', nonHome)
    expect(failed.ok).toBe(false)
    expect(String(failed.error)).toContain('cannot copy')

    // 关键：错误结果没有被 in-flight 缓存住，第二次必须真的再跑
    const retried = await rt.ensureGit('/work/proj', nonHome)
    expect(retried.ok).toBe(true)
    expect(attempt).toBe(2)
  })

  it('不同 store.git 不互相去重（各建各的仓库）', async () => {
    const gate = deferred()
    const { rt, calls } = makeRuntime({ gate })
    const other = { ...STORE, dir: '/store2', repo: '/store2/git', git: '/store2/git/.git' }

    const a = rt.ensureGit('/work/a', STORE)
    const b = rt.ensureGit('/work/b', other)
    await settle()
    // 键是 store.git：两个不同仓库各自跑一条
    expect(calls.ensureGit).toBe(2)

    gate.resolve()
    const [ra, rb] = await Promise.all([a, b])
    expect(ra.ok && rb.ok).toBe(true)
  })
})
