/**
 * diagnostics.js 环境错误诊断单测（M1-D6，issue #11）
 *
 * 三层钉住：
 * 1. classifyEnvError 纯函数：各 kind 模式命中（含 #11 原文样本）、跨平台
 *    措辞、多模式重叠按根因优先级取值（git > space > permission > lock >
 *    mkdir）、未识别 → null；
 * 2. buildFeedbackError：命中 → 提示文案非空且 ≤140（client toast 的
 *    '快照失败：' + slice(0,140) 硬约束）、不嵌原始路径；未命中 → 原文截断
 *    300 + kind 'unknown'（保 issue #7 现状）；
 * 3. recordError 尾部去重（工厂级）：同文本连发只计数不刷屏，间隔重复保留
 *    时序——issue #11「20 条环形缓冲被同一错误刷满」的回归钉。
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { classifyEnvError, ENV_HINTS, buildFeedbackError } from '../../src/host/diagnostics.js'
import { createRuntime, parseCleanupResult } from '../../src/host/store.js'

describe('classifyEnvError（纯函数）', () => {
  it('issue #11 原文样本 → lock', () => {
    const sample = 'recall ensureGit failed: error: could not lock config file /home/kevin/dsh-recall-snapshots/4073abcdef/git/.git/config: File exists'
    expect(classifyEnvError(sample)).toBe('lock')
  })

  it('git：POSIX 与 win32 两种措辞都命中', () => {
    expect(classifyEnvError('bash: git: command not found')).toBe('git')
    expect(classifyEnvError("'git' is not recognized as an internal or external command")).toBe('git')
    expect(classifyEnvError('git: not found')).toBe('git')
  })

  it('space：设备满/配额超限/errno 直书', () => {
    expect(classifyEnvError("Unable to create '/x/index.lock': No space left on device")).toBe('space')
    expect(classifyEnvError('fatal: unable to write pack: Disk quota exceeded')).toBe('space')
    expect(classifyEnvError('write /x: ENOSPC')).toBe('space')
  })

  it('permission：跨平台措辞', () => {
    expect(classifyEnvError('error: open("/x/config.lock"): Permission denied')).toBe('permission')
    expect(classifyEnvError('mkdir /x: Operation not permitted')).toBe('permission')
    expect(classifyEnvError('Access is denied. (Exception from HRESULT)')).toBe('permission')
  })

  it('lock：三种模式（含 #11 变体与 fatal: cannot lock）', () => {
    expect(classifyEnvError('error: could not lock config file /x/git/.git/config: File exists')).toBe('lock')
    expect(classifyEnvError("Unable to create '/x/index.lock': File exists")).toBe('lock')
    expect(classifyEnvError("fatal: cannot lock ref 'refs/tags/snap-1': 'refs/tags/snap-1' exists")).toBe('lock')
  })

  it('mkdir：两种措辞', () => {
    expect(classifyEnvError('fatal: cannot mkdir /x/dsh-recall-snapshots: File exists')).toBe('mkdir')
    expect(classifyEnvError("mkdir: cannot create directory '/x': File exists")).toBe('mkdir')
  })

  it('大小写不敏感', () => {
    expect(classifyEnvError('COULD NOT LOCK CONFIG FILE /X: FILE EXISTS')).toBe('lock')
    expect(classifyEnvError('NO SPACE LEFT ON DEVICE')).toBe('space')
  })

  it('多模式重叠按根因优先级取值（space/permission 在 lock 之前）', () => {
    // 「建锁失败」的报错面 + 磁盘满/权限的真根因：必须报根因而非报错面
    expect(classifyEnvError("Unable to create '/x/index.lock': No space left on device")).toBe('space')
    expect(classifyEnvError("Unable to create '/x/index.lock': Permission denied")).toBe('permission')
  })

  it('未识别 → null', () => {
    expect(classifyEnvError('')).toBe(null)
    expect(classifyEnvError(null)).toBe(null)
    expect(classifyEnvError('some unrelated failure output')).toBe(null)
  })
})

describe('ENV_HINTS / buildFeedbackError', () => {
  it('五种 kind 的提示齐备、≤140 且不嵌路径', () => {
    for (const kind of ['git', 'space', 'permission', 'lock', 'mkdir']) {
      const hint = ENV_HINTS[kind]
      expect(hint, kind + ' 提示缺失').toBeTruthy()
      expect(hint.length, kind + ' 提示超 140（toast 会被截断）').toBeLessThanOrEqual(140)
      expect(hint, kind + ' 提示不得嵌原始路径（140 截断约束）').not.toContain('/')
    }
  })

  it('命中 → error 为提示文案、kind 正确', () => {
    const r = buildFeedbackError('error: could not lock config file /home/kevin/dsh-recall-snapshots/x/git/.git/config: File exists')
    expect(r.kind).toBe('lock')
    expect(r.error).toBe(ENV_HINTS.lock)
  })

  it('未命中 → kind unknown、error 原文截断 300（保现状）', () => {
    const raw = 'weird failure '.repeat(100) // 1400 字符
    const r = buildFeedbackError(raw)
    expect(r.kind).toBe('unknown')
    expect(r.error).toBe(raw.slice(0, 300))
  })

  it('空/非字符串输入安全回落', () => {
    expect(buildFeedbackError('')).toEqual({ error: '', kind: 'unknown' })
    expect(buildFeedbackError(null).kind).toBe('unknown')
  })
})

describe('recordError 尾部去重（工厂级，issue #11 刷屏回归钉）', () => {
  afterEach(() => vi.restoreAllMocks())

  function makeRt() {
    // createRuntime 构造期只做解构与脚本奇偶校验（纯内存，不跑 shell），
    // 假 ctx 足以让 recordError 可被直测
    return createRuntime({ shell: null, sessions: null }, { baseExcludes: [] })
  }

  it('同文本连发 3 次 → 单条目 count=3，console.error 只 1 次', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rt = makeRt()
    const text = 'recall ensureGit failed: error: could not lock config file /x: File exists'
    rt.recordError(text)
    rt.recordError(text)
    rt.recordError(text)
    expect(rt.state.errors.length).toBe(1)
    expect(rt.state.errors[0].count).toBe(3)
    expect(rt.state.errors[0].kind).toBe('lock')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('间隔不同错误的重复仍新建条目（时序保留，不全局合并）', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const rt = makeRt()
    rt.recordError('A')
    rt.recordError('A')
    rt.recordError('B')
    rt.recordError('B')
    rt.recordError('A')
    expect(rt.state.errors.map((e) => [e.message, e.count])).toEqual([['A', 2], ['B', 2], ['A', 1]])
  })

  it('环形缓冲容量在去重后仍生效（25 条不同错误 → 保留最近 20）', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const rt = makeRt()
    for (let i = 0; i < 25; i++) rt.recordError('error-' + i)
    expect(rt.state.errors.length).toBe(20)
    expect(rt.state.errors[0].message).toBe('error-5')
    expect(rt.state.errors[0].kind).toBe(null)
  })
})

describe('parseCleanupResult（M3 清扫让路解读）', () => {
  it('CLEANUP_OTHER_INSTANCE <pid> → otherPid', () => {
    expect(parseCleanupResult('CLEANUP_OTHER_INSTANCE 4321\n')).toEqual({ otherPid: 4321, skippedFresh: false })
  })

  it('CLEANUP_SKIPPED_FRESH_LOCK → skippedFresh', () => {
    expect(parseCleanupResult('CLEANUP_SKIPPED_FRESH_LOCK\n')).toEqual({ otherPid: null, skippedFresh: true })
  })

  it('CLEANUP_DONE / 空输出 → 无让路（原清扫路径或清扫未跑）', () => {
    expect(parseCleanupResult('CLEANUP_DONE\n')).toEqual({ otherPid: null, skippedFresh: false })
    expect(parseCleanupResult('')).toEqual({ otherPid: null, skippedFresh: false })
    expect(parseCleanupResult(null)).toEqual({ otherPid: null, skippedFresh: false })
  })
})

describe('cleanupAfterGitFailure 接线（M3：让路情形的确认级诊断）', () => {
  afterEach(() => vi.restoreAllMocks())

  // 假 shell：runShellMeta 走 ctx.shell.resolve + ctx.shell.run（官方
  // ShellExecRequest 契约的最小面），直接回灌 killOrphansScript 的输出
  function makeRt(shellOutput) {
    const calls = { run: 0 }
    const ctx = {
      get: () => null,
      sessions: null,
      shell: {
        resolve: (spec) => spec,
        run: async () => { calls.run++; return { exitCode: 0, stdout: { text: shellOutput }, stderr: { text: '' } } },
      },
    }
    const rt = createRuntime(ctx, { baseExcludes: [] })
    return { rt, calls }
  }

  const GIT_CMD = "$git --git-dir='/s/git/.git' add -A\ng='/s/git/.git'"

  it('另一活实例心跳让路 → recordError 点名 PID（疑似升级为确认）', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rt, calls } = makeRt('CLEANUP_OTHER_INSTANCE 4321')
    await rt.cleanupAfterGitFailure(GIT_CMD)
    expect(calls.run).toBe(1)
    expect(rt.state.errors.length).toBe(1)
    expect(rt.state.errors[0].message).toContain('PID 4321')
    expect(rt.state.errors[0].message).toContain('让路')
  })

  it('新锁让路 → recordError 解释为何未清理', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rt } = makeRt('CLEANUP_SKIPPED_FRESH_LOCK')
    await rt.cleanupAfterGitFailure(GIT_CMD)
    expect(rt.state.errors.length).toBe(1)
    expect(rt.state.errors[0].message).toContain('新锁')
  })

  it('CLEANUP_DONE（正常清扫）→ 不产生新记录', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rt } = makeRt('CLEANUP_DONE')
    await rt.cleanupAfterGitFailure(GIT_CMD)
    expect(rt.state.errors.length).toBe(0)
  })

  it('哨兵命令 / 无 $g 赋值的命令 → 不跑清扫脚本', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rt, calls } = makeRt('CLEANUP_OTHER_INSTANCE 4321')
    await rt.cleanupAfterGitFailure('# RECALL_CLEANUP\ng=\'/s/git/.git\'')
    await rt.cleanupAfterGitFailure('echo hello')
    expect(calls.run).toBe(0)
    expect(rt.state.errors.length).toBe(0)
  })
})
