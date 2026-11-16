/**
 * 存储可写性探测与降级单测（issue #36）
 *
 * issue #36 的现场：Windows 沙箱（restricted token）下 `~/.dsh` 的 store 目录
 * 既存在又可读，却一个子项都建不出来——旧判据 `New-Item -Force` / `mkdir -p`
 * 对已存在目录是空操作，于是谎报「home 可用」，README 承诺的降级永不触发，
 * 插件表现为「心跳在跑、撤回全废」。
 *
 * 本文件钉三件事：
 * 1) parseStoreProbe 的输出契约（缺行/截断按不可写判，代价不对称）；
 * 2) 两套模板的探测脚本真的建删临时项，并回传仓库存在性（换 store 不丢历史）；
 * 3) resolveStore / ensureGit 在探测失败、以及探测通过但写盘被拒时都降级，
 *    且 home 里已有仓库时**不**换 store（历史快照优先）。
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRuntime, parseStoreProbe, hashRootPath, isAbsoluteDirPath } from '../../src/host/store.js'
import * as pwsh from '../../src/host/scripts.pwsh.js'
import * as posix from '../../src/host/scripts.posix.js'

// recordError 会转发 console.error（宿主日志保持原样），单测里静音避免刷屏
beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

const REAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')

function setPlatform(value) {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

const OK = (text = '') => ({ exitCode: 0, stdout: { text, truncated: false }, stderr: { text: '' } })
const FAIL = (text) => ({ exitCode: 1, stdout: { text: '' }, stderr: { text } })

// 新代执行器（execute + result），与 store-shell-execute.test.js 同形。
// config 按引用交给 runtime（不复制）：热更用例要就地改字段验证缓存失效
function makeRuntime(reply, config) {
  const shell = { resolve: (spec) => spec, execute: async (spec) => ({ result: async () => reply(spec) }) }
  return createRuntime({ shell, sessions: { list: () => [] }, get: () => null }, config || { baseExcludes: [] })
}

const isProbe = (cmd) => cmd.includes('RCL_STORE_PROBE')
const isEnsureGit = (cmd) => cmd.includes('GIT_OK')
// 按精确路径判降级目录：home 存储目录名是 `dsh-recall-snapshots`（无点），
// 而 excludeSyncBlock 的兜底排除表里总含 `.dsh-recall-snapshots/` 这个模式，
// 子串匹配会把它误当降级目录（实测踩过）。
const isFallbackDir = (cmd) => cmd.includes('/work/proj/.dsh-recall-snapshots')

describe('parseStoreProbe（探测输出解析）', () => {
  it('可写 + 无仓库', () => {
    expect(parseStoreProbe('PROBE WRITABLE\nREPO NO\n')).toEqual({ writable: true, hasRepo: false })
  })

  it('不可写 + 有仓库（CRLF 与前后噪声不影响判定）', () => {
    expect(parseStoreProbe('junk\r\nPROBE NOWRITABLE\r\nREPO YES\r\n')).toEqual({ writable: false, hasRepo: true })
  })

  it('空/截断输出一律按不可写、无仓库（误判代价不对称）', () => {
    for (const v of ['', null, undefined, 'PROBE ', 'PROBE NOWRITABLE']) {
      expect(parseStoreProbe(v)).toEqual({ writable: false, hasRepo: false })
    }
    // 'NOWRITABLE' 不得被 'PROBE WRITABLE' 的子串判定误吞
    expect(parseStoreProbe('PROBE NOWRITABLE\nREPO NO').writable).toBe(false)
    // 只有 PROBE 行、缺 REPO 行时：可写成立、仓库按「无」判（保守，不丢历史）
    expect(parseStoreProbe('PROBE WRITABLE')).toEqual({ writable: true, hasRepo: false })
  })
})

describe('storeProbeScript 模板（两平台同名导出）', () => {
  for (const [title, module] of [['pwsh', pwsh], ['posix', posix]]) {
    it(`${title}: 真的建删临时项并回传仓库存在性`, () => {
      const s = module.storeProbeScript('/store/dir')
      expect(s).toContain('RCL_STORE_PROBE')
      expect(s).toContain('.recall-write-probe')
      expect(s).toContain('PROBE ')
      expect(s).toContain('REPO YES')
      expect(s).toContain('REPO NO')
      // 探测命令不得带 $g 字面量赋值：否则失败清扫会把探针当 git 命令处理
      expect(/(?:^|\n)\$?g\s*=\s*'/.test(s)).toBe(false)
    })
  }

  it('pwsh 侧不依赖 New-Item 的成功与否（那正是 issue #36 的假信号）', () => {
    const s = pwsh.storeProbeScript('C:\\store')
    expect(s).toContain('Set-Content -LiteralPath $tmp')
    expect(s).toContain('Remove-Item -LiteralPath $tmp -Force')
  })

  it('posix 侧建删都写失败才算不可写', () => {
    const s = posix.storeProbeScript('/store')
    expect(s).toContain('rm -f -- "$d/.recall-write-probe"')
    // mkdir 失败不中断脚本（否则连 REPO 行都拿不到）
    expect(s).toContain('mkdir -p -- "$d" 2>/dev/null || true')
  })

  for (const [title, module] of [['pwsh', pwsh], ['posix', posix]]) {
    it(`${title}: migrateScript 连带搬 lineage.json（换库不丢版本家族）`, () => {
      expect(module.migrateScript('/a', '/b')).toContain('lineage.json')
    })
  }
})

describe('resolveStore 用真写探测选存储根（issue #36）', () => {
  afterEach(() => {
    if (REAL_PLATFORM) Object.defineProperty(process, 'platform', REAL_PLATFORM)
  })

  function replyWith(probeText) {
    return (spec) => {
      const cmd = spec.command
      if (cmd.includes('DSH_HOME')) return OK('/home/u')          // probeHomeScript
      if (isProbe(cmd)) return probeText === 'THROW' ? (() => { throw new Error('shell gone') })() : OK(probeText)
      if (cmd.includes('command -v git')) return OK('/usr/bin/git')
      return OK('')
    }
  }

  it('探测可写 → 落在 home 存储（项目目录保持干净）', async () => {
    setPlatform('linux')
    const rt = makeRuntime(replyWith('PROBE WRITABLE\nREPO NO'))
    const store = await rt.resolveStore('/work/proj')
    expect(store.home).toBe(true)
    expect(store.dir).toContain('/home/u/dsh-recall-snapshots/')
  })

  it('目录存在但建不出子项 → 降级到项目内存储（旧判据在此谎报成功）', async () => {
    setPlatform('linux')
    const rt = makeRuntime(replyWith('PROBE NOWRITABLE\nREPO NO'))
    const store = await rt.resolveStore('/work/proj')
    expect(store.home).toBe(false)
    expect(store.dir).toBe('/work/proj/.dsh-recall-snapshots')
    expect(rt.state.errors.some((e) => String(e.message).includes('not writable'))).toBe(true)
  })

  it('探测命令自身失败也按不可写处理（不把异常抛给快照链）', async () => {
    setPlatform('linux')
    const rt = makeRuntime(replyWith('THROW'))
    const store = await rt.resolveStore('/work/proj')
    expect(store.home).toBe(false)
    expect(store.dir).toBe('/work/proj/.dsh-recall-snapshots')
  })
})

describe('storeRoot 显式快照根（issue #36 第三条出路）', () => {
  afterEach(() => {
    if (REAL_PLATFORM) Object.defineProperty(process, 'platform', REAL_PLATFORM)
  })

  it('isAbsoluteDirPath：win32 认盘符与 UNC，POSIX 只认 /', () => {
    expect(isAbsoluteDirPath('D:\\dsh-snap', true)).toBe(true)
    expect(isAbsoluteDirPath('D:/dsh-snap', true)).toBe(true)
    expect(isAbsoluteDirPath('\\\\server\\share', true)).toBe(true)
    expect(isAbsoluteDirPath('dsh-snap', true)).toBe(false)
    expect(isAbsoluteDirPath('C:relative', true)).toBe(false)
    expect(isAbsoluteDirPath('/data/snap', false)).toBe(true)
    expect(isAbsoluteDirPath('data/snap', false)).toBe(false)
    expect(isAbsoluteDirPath('', false)).toBe(false)
  })

  it('绝对路径 → 落在 <根>/dsh-recall-snapshots/<hash>，共享排除配置随根目录走', async () => {
    setPlatform('linux')
    const rt = makeRuntime((spec) => {
      const cmd = spec.command
      if (cmd.includes('echo YES')) return OK('NO')            // 旧位置不存在 → 无需搬迁
      if (isProbe(cmd)) return OK('PROBE WRITABLE\nREPO NO')
      if (cmd.includes('DSH_HOME')) return OK('/home/u')
      return OK('')
    }, { storeRoot: '/data/snap' })
    const store = await rt.resolveStore('/work/proj')
    expect(store.home).toBe(true)
    expect(store.dir).toBe('/data/snap/dsh-recall-snapshots/' + hashRootPath('/work/proj'))
    // 共享排除配置随根目录走（容器目录 = dir 去掉 65 字符哈希段）
    expect(store.excludeFile).toBe('/data/snap/dsh-recall-snapshots/exclude.txt')
    expect(await rt.resolveHomeContainer()).toBe('/data/snap/dsh-recall-snapshots')
  })

  // 热更（issue #36）：设置卡片保存即生效——配置对象是就地更新的，缓存必须跟着失效
  it('改 storeRoot → stores/容器缓存失效，下一次解析落到新根', async () => {
    setPlatform('linux')
    const cfg = { baseExcludes: [], storeRoot: '/data/a' }
    const rt = makeRuntime((spec) => {
      const cmd = spec.command
      if (cmd.includes('echo YES')) return OK('NO')
      if (isProbe(cmd)) return OK('PROBE WRITABLE\nREPO NO')
      if (cmd.includes('DSH_HOME')) return OK('/home/u')
      return OK('')
    }, cfg)
    const first = await rt.resolveStore('/work/proj')
    expect(first.dir).toBe('/data/a/dsh-recall-snapshots/' + hashRootPath('/work/proj'))

    cfg.storeRoot = '/data/b'
    const second = await rt.resolveStore('/work/proj')
    expect(second.dir).toBe('/data/b/dsh-recall-snapshots/' + hashRootPath('/work/proj'))
    expect(await rt.resolveHomeContainer()).toBe('/data/b/dsh-recall-snapshots')
  })

  // 换根不丢历史：新根还是空库、home 下有同工作区的仓时整仓搬过来
  it('换根时把 home 下既有 store 搬进新根（含 lineage）', async () => {
    setPlatform('linux')
    const homeDir = '/home/u/dsh-recall-snapshots/' + hashRootPath('/work/proj')
    const cmds = []
    const rt = makeRuntime((spec) => {
      const cmd = spec.command
      cmds.push(cmd)
      if (cmd.includes('DSH_HOME')) return OK('/home/u')
      if (cmd.includes('echo YES')) return OK('YES')
      if (isProbe(cmd)) {
        // 新根：还没有仓库；home：有仓（哪怕此刻写不进去）
        return OK(cmd.includes('/data/snap') ? 'PROBE WRITABLE\nREPO NO' : 'PROBE NOWRITABLE\nREPO YES')
      }
      if (cmd.includes('MIGRATE_OK')) return OK('MIGRATE_OK')
      return OK('')
    }, { storeRoot: '/data/snap' })
    const store = await rt.resolveStore('/work/proj')
    expect(store.dir).toBe('/data/snap/dsh-recall-snapshots/' + hashRootPath('/work/proj'))
    expect(cmds.some((c) => c.includes('MIGRATE_OK') && c.includes(homeDir))).toBe(true)
    expect(rt.state.errors.some((e) => String(e.message).includes('moved existing snapshots'))).toBe(true)
  })

  it('相对路径 → 忽略并告警，落回 home 派生（不静默改道）', async () => {
    setPlatform('linux')
    const rt = makeRuntime((spec) => {
      if (spec.command.includes('DSH_HOME')) return OK('/home/u')
      if (isProbe(spec.command)) return OK('PROBE WRITABLE\nREPO NO')
      return OK('')
    }, { storeRoot: 'relative/dir' })
    const store = await rt.resolveStore('/work/proj')
    expect(store.dir).toContain('/home/u/dsh-recall-snapshots/')
    expect(rt.state.errors.some((e) => String(e.message).includes('storeRoot is not an absolute path'))).toBe(true)
  })
})

describe('ensureGit 探测通过但写盘被拒时降级一次（issue #36 兜底）', () => {
  afterEach(() => {
    if (REAL_PLATFORM) Object.defineProperty(process, 'platform', REAL_PLATFORM)
  })

  it('home 侧无仓库 → 换到项目内 store 并成功建仓', async () => {
    setPlatform('linux')
    let homeProbes = 0
    const rt = makeRuntime((spec) => {
      const cmd = spec.command
      if (cmd.includes('DSH_HOME')) return OK('/home/u')
      if (isProbe(cmd)) {
        if (isFallbackDir(cmd)) return OK('PROBE WRITABLE\nREPO NO')
        homeProbes += 1
        // 首次探测判可写（沙箱策略在后续命令上才翻脸），降级时的复查判不可写
        return OK(homeProbes === 1 ? 'PROBE WRITABLE\nREPO NO' : 'PROBE NOWRITABLE\nREPO NO')
      }
      if (cmd.includes('command -v git')) return OK('/usr/bin/git')
      if (isEnsureGit(cmd)) {
        return isFallbackDir(cmd) ? OK('GIT_OK') : FAIL('fatal: cannot mkdir /home/u/store/git: Permission denied')
      }
      return OK('')
    })
    const home = await rt.resolveStore('/work/proj')
    expect(home.home).toBe(true)
    const g = await rt.ensureGit('/work/proj', home)
    expect(g.ok).toBe(true)
    expect(g.store.home).toBe(false)
    expect(g.store.dir).toBe('/work/proj/.dsh-recall-snapshots')
    expect(rt.state.stores.get('/work/proj').dir).toBe('/work/proj/.dsh-recall-snapshots')
    expect(rt.state.errors.some((e) => String(e.message).includes('switched to workspace store'))).toBe(true)
  })

  it('home 侧已有仓库 → 不换 store（历史快照优先），按失败返回', async () => {
    setPlatform('linux')
    const rt = makeRuntime((spec) => {
      const cmd = spec.command
      if (cmd.includes('command -v git')) return OK('/usr/bin/git')
      if (isProbe(cmd)) return OK('PROBE NOWRITABLE\nREPO YES')
      if (isEnsureGit(cmd)) return FAIL('fatal: cannot mkdir /home/u/store/git: Permission denied')
      return OK('')
    })
    const home = rt.storeFromDir('/home/u/dsh-recall-snapshots/abc', true)
    const g = await rt.ensureGit('/work/proj', home)
    expect(g.ok).toBe(false)
    expect(g.store).toBeUndefined()
    expect(rt.state.stores.get('/work/proj')).toBeUndefined()
    expect(rt.state.errors.some((e) => String(e.message).includes('holds a repo'))).toBe(true)
  })
})
