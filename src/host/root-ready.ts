/**
 * dsh-recall-plugin — 根就绪链（issue #24）
 *
 * 预热与 init 端点共享同一条链并做 in-flight 去重：同一工作区在本进程内只跑
 * 一次 resolveStore → tryUpgradeToHome → ensureGit → loadIndex →
 * rebuildOrphans → recover。独立成模块的两个动机：入口的「产物 root 早退」
 * 分支（issue #18 对偶，报告者 #24 指出）住在 apply 闭包里时无法被单测直接
 * 钉住；预热/init 的幂等契约收在一处，避免两处各自演化。
 */

import { buildArtifactRootSegment } from './exclude-patterns.js'
import type { Runtime, StoreInfo } from '../types/state.js'
import type { ResolvedConfig } from '../types/config.js'
import type { SnapshotsApi } from './snapshots.js'
import type { IntentJournal } from './intent-journal.js'

export interface RootReadyDeps {
  rt: Pick<Runtime, 'isWin' | 'resolveStore' | 'tryUpgradeToHome' | 'ensureGit' | 'cleanupLegacy'>
  snaps: Pick<SnapshotsApi, 'loadIndex' | 'rebuildOrphans' | 'guardStoreFormat'>
  journal: Pick<IntentJournal, 'recover'>
  cfg: Pick<ResolvedConfig, 'baseExcludes'>
}

export type EnsureRootReady = (root: string, sessionId: string | null) => Promise<StoreInfo | null>

export function createEnsureRootReady({ rt, snaps, journal, cfg }: RootReadyDeps): EnsureRootReady {
  const ready = new Map<string, Promise<StoreInfo | null>>()

  return function ensureRootReady(root: string, sessionId: string | null): Promise<StoreInfo | null> {
    // issue #18 对偶缺口：产物 root 不建快照（captureSnapshot 已早退），预热
    // 也不该为它建仓/列 tag——dist/、build/ 里的工作区每次启动都会白付
    // resolveStore + ensureGit + rebuildOrphans 的进程开销。判据与
    // captureSnapshot 完全同源（baseExcludes 目录形态项 × root 路径段）：
    // 两处必须同判据，否则「init 说停用、预热却在扫」的分裂会重现。
    if (buildArtifactRootSegment(root, cfg.baseExcludes, rt.isWin)) return Promise.resolve(null)
    const cached = ready.get(root)
    if (cached) return cached
    const task = (async (): Promise<StoreInfo | null> => {
      let store: StoreInfo | null = await rt.resolveStore(root)
      // 非空断言：resolveStore 恒在 state.stores 写入并返回（含降级兜底），
      // tryUpgradeToHome 只在该 store 存在时返回它——null 不可达（沿用原控制流）
      store = (await rt.tryUpgradeToHome(root))!
      // issue #36：ensureGit 可能把 home store 一次性降级到项目内——init 必须
      // 用生效的那个 store 继续，否则 notice.homeFallback 会漏报（用户看不到
      // 降级说明）。失败仍不阻断：错误进最近错误，快照路径会再反馈。
      const g = await rt.ensureGit(root, store)
      if (g.store) store = g.store
      await snaps.loadIndex(root, sessionId)
      await snaps.rebuildOrphans(root, sessionId || '')
      // A3：拒写态下跳过恢复——reset 是写操作，fail-closed 同样适用
      if (await snaps.guardStoreFormat(store)) await journal.recover(store)
      rt.cleanupLegacy(root)
      return store
    })()
    ready.set(root, task)
    // 失败不缓存（与 loadIndex「读失败不标记已载入」同款纪律）：shell 未就绪
    // 等瞬态故障应留给下一次 init/预热重试。catch 就地消化，防 unhandled rejection
    task.catch(() => { ready.delete(root) })
    return task
  }
}
