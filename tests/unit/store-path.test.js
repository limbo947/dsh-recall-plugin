/**
 * POSIX home 基底解析单测（M2-D4，I24 漂移修复）
 *
 * selectPosixHomeBase 三分支纯函数断言 + resolvePosixHomeBase 旧容器迁移
 * 四态（mock runShell 控制输出 → 断言 base 选择与 recordError 调用，副作用
 * 全经 deps 注入）。win32 CI 也能跑：两者都是 lib/store.js 模块级纯逻辑，
 * 工厂内 posixHomeBaseResolve 只在 POSIX 运行时被触达。
 */

import { describe, it, expect } from 'vitest'
import { selectPosixHomeBase, resolvePosixHomeBase } from '../../src/host/store.js'
import { legacyHomeMigrateScript } from '../../src/host/scripts.posix.js'

describe('selectPosixHomeBase（三档回退选择）', () => {
  it('第一档：bash env 探测命中 → 直接用，不涉迁移', () => {
    const r = selectPosixHomeBase({ probed: '/data/dsh-home', envHome: '/env/home', homedir: '/home/u' })
    expect(r).toEqual({ base: '/data/dsh-home', third: false })
  })

  it('第二档：探测为空、Node 主进程 DSH_HOME 命中', () => {
    const r = selectPosixHomeBase({ probed: '', envHome: '/env/home', homedir: '/home/u' })
    expect(r).toEqual({ base: '/env/home', third: false })
  })

  it('第三档：全空 → homedir/.dsh（I24：补齐 .dsh 层对齐 win32）且标记 third', () => {
    const r = selectPosixHomeBase({ probed: '', envHome: '', homedir: '/home/u' })
    expect(r).toEqual({ base: '/home/u/.dsh', third: true })
  })
})

describe('resolvePosixHomeBase（第三档旧容器迁移编排四态）', () => {
  function fakeDeps(output) {
    const calls = { runShell: [], errors: [] }
    return {
      deps: {
        runShell: async (cmd) => { calls.runShell.push(cmd); return output },
        scripts: { legacyHomeMigrateScript: (h) => 'MIGRATE ' + h },
        recordError: (t) => { calls.errors.push(t) },
      },
      calls,
    }
  }

  it('MIGRATE_OK → 落规范位 ~/.dsh，无告警', async () => {
    const { deps, calls } = fakeDeps('MIGRATE_OK\n')
    const base = await resolvePosixHomeBase(deps, { probed: '', envHome: '', homedir: '/home/u' })
    expect(base).toBe('/home/u/.dsh')
    expect(calls.errors.length).toBe(0)
    expect(calls.runShell.length).toBe(1)
  })

  it('OLD_ABSENT（全新装机）→ 落规范位，无告警', async () => {
    const { deps, calls } = fakeDeps('OLD_ABSENT')
    const base = await resolvePosixHomeBase(deps, { probed: '', envHome: '', homedir: '/home/u' })
    expect(base).toBe('/home/u/.dsh')
    expect(calls.errors.length).toBe(0)
  })

  it('BOTH_PRESENT（双容器并存）→ 沿用旧位 + recordError（数据所在优先）', async () => {
    const { deps, calls } = fakeDeps('BOTH_PRESENT')
    const base = await resolvePosixHomeBase(deps, { probed: '', envHome: '', homedir: '/home/u' })
    expect(base).toBe('/home/u')
    expect(calls.errors.length).toBe(1)
    expect(calls.errors[0]).toContain('并存')
  })

  it('MIGRATE_FAIL → 沿用旧位 + recordError（数据不丢优先于路径规范）', async () => {
    const { deps, calls } = fakeDeps('MIGRATE_FAIL')
    const base = await resolvePosixHomeBase(deps, { probed: '', envHome: '', homedir: '/home/u' })
    expect(base).toBe('/home/u')
    expect(calls.errors.length).toBe(1)
  })

  it('探测命令自身失败 → 沿用旧位 + recordError（无法判断旧容器时保守）', async () => {
    const calls = { errors: [] }
    const deps = {
      runShell: async () => { throw new Error('shell unavailable') },
      scripts: { legacyHomeMigrateScript: (h) => 'MIGRATE ' + h },
      recordError: (t) => { calls.errors.push(t) },
    }
    const base = await resolvePosixHomeBase(deps, { probed: '', envHome: '', homedir: '/home/u' })
    expect(base).toBe('/home/u')
    expect(calls.errors.length).toBe(1)
  })

  it('非第三档（DSH_HOME 显式配置）不触发迁移、不跑 shell', async () => {
    const { deps, calls } = fakeDeps('MIGRATE_OK')
    const base = await resolvePosixHomeBase(deps, { probed: '', envHome: '/env/home', homedir: '/home/u' })
    expect(base).toBe('/env/home')
    expect(calls.runShell.length).toBe(0)
  })
})

describe('legacyHomeMigrateScript 形状（POSIX 专属模板）', () => {
  it('old/new 路径正确 + 四态标记齐备', () => {
    const s = legacyHomeMigrateScript('/home/u')
    expect(s).toContain("old='/home/u/dsh-recall-snapshots'")
    expect(s).toContain("new='/home/u/.dsh/dsh-recall-snapshots'")
    for (const marker of ['MIGRATE_OK', 'OLD_ABSENT', 'BOTH_PRESENT', 'MIGRATE_FAIL']) {
      expect(s, '缺少状态标记 ' + marker).toContain(marker)
    }
  })
})
