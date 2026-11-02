/**
 * 构建产物工作区根的快照护栏单测（issue #18）
 *
 * 三块：判定纯函数（dirNamePatterns / buildArtifactRootSegment）、captureSnapshot
 * 早退（不建 store、不跑脚本、不写 feedback）、两个端点的 notice 下发。
 * 这里钉的是「不建快照」这条设计行为本身；真正的 git 级行为（排除表对 root
 * 自身失效、gc 回收 0-ref 残骸）由实弹复核覆盖，纯单测测不到对象库。
 */

import { describe, it, expect } from 'vitest'
import { createSnapshots } from '../../src/host/snapshots.js'
import { createRoutesCore } from '../../src/host/routes-core.js'
import { dirNamePatterns, buildArtifactRootSegment, buildRootNotice } from '../../src/host/exclude-patterns.js'
import { DEFAULTS } from '../../src/host/config.js'
import * as E from '../../src/host/errors.js'

const BASE = ['.git', 'node_modules/', '.dsh-recall-snapshots/', 'dsh-recall-snapshots/', 'target/', 'dist/', 'build/', '*.exe', '*.zip']
const SID = 's1'

describe('排除表目录形态判据', () => {
  it('dirNamePatterns：只取目录形态项（去尾斜杠、剔除通配/反选/注释）', () => {
    expect(dirNamePatterns(BASE)).toEqual(['.git', 'node_modules', '.dsh-recall-snapshots', 'dsh-recall-snapshots', 'target', 'dist', 'build'])
    expect(dirNamePatterns(['!keep/', '#comment', '', '   ', 'a/b', '*', 'out'])).toEqual(['out'])
    expect(dirNamePatterns(null)).toEqual([])
    expect(dirNamePatterns('target/')).toEqual([])
  })

  it('命中任一路径段：target/debug 这类被 basename 判据漏掉的形态必须命中', () => {
    // issue #18 最坏形态：basename 是 debug，真正表明「构建产物」的是上一层 target
    expect(buildArtifactRootSegment('D:\\ws\\src-tauri\\target\\debug', BASE, true)).toBe('target')
    expect(buildArtifactRootSegment('D:\\ws\\src-tauri\\target\\debug\\deps', BASE, true)).toBe('target')
    expect(buildArtifactRootSegment('D:\\ws\\app\\dist', BASE, true)).toBe('dist')
    expect(buildArtifactRootSegment('D:\\ws\\node_modules', BASE, true)).toBe('node_modules')
  })

  it('不命中：普通项目路径与盘符不参与判定', () => {
    expect(buildArtifactRootSegment('D:\\ws\\my-app', BASE, true)).toBeNull()
    expect(buildArtifactRootSegment('C:\\', BASE, true)).toBeNull()
    expect(buildArtifactRootSegment('D:\\ws\\target', [], true)).toBeNull()   // 判定表为空即不拦
    expect(buildArtifactRootSegment(null, BASE, true)).toBeNull()
  })

  it('issue #32：保留设备名只在 pwsh 排除层，不触发构建产物 root 停用', () => {
    // 裸名一旦混入共享默认表会被 dirNamePatterns 当目录项，整个工作区都会失去快照。
    expect(buildArtifactRootSegment('D:\\projects\\nul\\app', DEFAULTS.baseExcludes, true)).toBeNull()
    expect(buildArtifactRootSegment('/home/u/con/proj', DEFAULTS.baseExcludes, false)).toBeNull()
  })

  it('win32 大小写不敏感、POSIX 敏感（返回排除表原始写法供文案展示）', () => {
    expect(buildArtifactRootSegment('D:\\ws\\TARGET\\debug', BASE, true)).toBe('target')
    expect(buildArtifactRootSegment('/home/u/Target/app', BASE, false)).toBeNull()
    expect(buildArtifactRootSegment('/home/u/target/app', BASE, false)).toBe('target')
    // 尾斜杠归一（调用侧 root 可能带尾分隔符）
    expect(buildArtifactRootSegment('D:\\ws\\target\\', BASE, true)).toBe('target')
  })

  it('提示文案：含命中段名、给出口、不超客户端 140 字符上限', () => {
    const text = buildRootNotice('target')
    expect(text).toContain('target')
    expect(text).toContain('基础排除表')
    expect(text.length).toBeLessThanOrEqual(140)
  })
})

// captureSnapshot 的假 rt：只提供早退路径与正常路径各需的接口，计数副作用
function fakeRt(root) {
  const calls = { resolveStore: 0, ensureGit: 0, runShell: 0 }
  const state = { snapshots: new Map(), snapFeedback: new Map(), stores: new Map(), indexLoaded: new Set() }
  const store = { dir: '/store', repo: '/store/git', git: '/store/git/.git', home: true, excludeFile: '/exclude.txt', maxFileBytes: 8388608, maxWorkspaceBytes: 268435456, scanBudgetMs: 10000 }
  const rt = {
    state,
    isWin: true,
    scripts: { stripBom: (t) => String(t == null ? '' : t), indexReadCmd: () => 'READ', fileReadCmd: (f) => 'FMT ' + f, snapshotScript: () => 'SNAP_SCRIPT', pruneScript: () => 'PRUNE' },
    resolveRoot: async () => root,
    resolveStore: async () => { calls.resolveStore++; return store },
    tryUpgradeToHome: async () => store,
    ensureGit: async () => { calls.ensureGit++; return { ok: true } },
    runShell: async (cmd) => {
      // A3：格式 marker 读取返回空串（缺席 → 守卫放行并补戳）；不计入调用数
      if (String(cmd).startsWith('FMT ')) return ''
      calls.runShell++
      return 'TREE abc\nSNAP_OK'
    },
    runShellMeta: async () => ({ text: '', truncated: false }),
    writeTextViaShell: async () => {},
    recordError: () => {},
  }
  return { rt, state, calls }
}

describe('captureSnapshot：构建产物 root 早退', () => {
  it('命中时零副作用：不建 store、不 ensureGit、不跑快照脚本、不写快照与 feedback', async () => {
    const { rt, state, calls } = fakeRt('D:\\ws\\target\\debug')
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: BASE })
    await snaps.captureSnapshot(SID, 'm1')
    expect(calls).toEqual({ resolveStore: 0, ensureGit: 0, runShell: 0 })
    expect(state.snapshots.has('m1')).toBe(false)
    expect(state.snapFeedback.has('m1')).toBe(false)
  })

  it('未命中时照常走快照链（回归钉：护栏不能误伤普通工作区）', async () => {
    const { rt, state, calls } = fakeRt('D:\\ws\\my-app')
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: BASE })
    await snaps.captureSnapshot(SID, 'm1')
    expect(calls.resolveStore).toBe(1)
    expect(calls.runShell).toBe(1)
    expect(state.snapshots.get('m1').root).toBe('D:\\ws\\my-app')
  })
})

describe('端点 notice：构建产物 root 的停用说明', () => {
  function makeDeps(root, isWin = true) {
    const state = { snapshots: new Map(), stores: new Map(), gitExe: 'git-exe', errors: [] }
    const deps = {
      rt: {
        state,
        isWin,
        recordError: (m) => state.errors.push(String(m)),
        resolveRoot: async () => root,
        resolveStore: async () => ({ dir: '/store', repo: '/store/git', git: '/store/git/.git', home: true, excludeFile: '/e.txt', maxFileBytes: 1 }),
        tryUpgradeToHome: async () => ({ dir: '/store', repo: '/store/git', git: '/store/git/.git', home: true, excludeFile: '/e.txt', maxFileBytes: 1 }),
        ensureGit: async () => ({ ok: true }),
        cleanupLegacy: () => {},
      },
      snaps: { loadIndex: async () => {}, rebuildOrphans: async () => {}, feedbackFor: async () => ({}), guardStoreFormat: async () => true },
      // A2/A3 桩：本文件只关心 notice 文案，守卫与意图恢复一律放行/空操作
      intentJournal: {
        begin: async () => {}, advance: async () => {}, clear: async () => {},
        read: async () => null, file: () => '/store/recall-intent.json', recover: async () => false,
      },
      // issue #24：根就绪链由 index.ts 注入（init 与预热共享）；本文件只关心
      // notice 文案，桩直接返回假 store 供 init 计算 homeFallback
      ensureRootReady: async () => ({ dir: '/store', repo: '/store/git', git: '/store/git/.git', home: true, excludeFile: '/e.txt', maxFileBytes: 1 }),
      state,
      cfg: { baseExcludes: BASE },
      supported: true,
      enqueueFor: (_root, task) => task(),
      enqueueMany: (_roots, task) => task(),
      agentBusy: () => false,
      rescueRollback: async () => ({ ok: false, code: E.RECALL_ROLLBACK_FAILED, message: 'rescue' }),
      E,
    }
    return deps
  }

  it('init 与 snapshot-info 下发同一句文案（构建产物 root）', async () => {
    const routes = createRoutesCore(makeDeps('D:\\ws\\src-tauri\\target\\debug'))
    const init = await routes.init({ sessionId: SID })
    expect(init.ok).toBe(true)
    expect(init.notice.buildRootNotice).toBe(buildRootNotice('target'))
    const info = await routes['snapshot-info']({ sessionId: SID, messageId: 'm1' })
    expect(info.has).toBe(false)
    expect(info.notice).toBe(buildRootNotice('target'))
  })

  it('普通 root 不下发（回归钉）', async () => {
    const routes = createRoutesCore(makeDeps('D:\\ws\\my-app'))
    const init = await routes.init({ sessionId: SID })
    expect(init.notice.buildRootNotice).toBeUndefined()
    const info = await routes['snapshot-info']({ sessionId: SID, messageId: 'm1' })
    expect(info.notice).toBeUndefined()
  })
})
