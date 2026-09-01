/**
 * dsh-recall-plugin — 快照维护（ctx 绑定的工厂，无模块级副作用）
 *
 * 职责：磁盘占用治理，两件事——
 * 1. 定期 git gc：全量保留策略下把 loose 对象压 pack + 跨版本 delta，
 *    无损（所有 tag 可达对象一个不丢），通常省一半以上空间；
 * 2. 会话删除联动清理：会话日志已从磁盘消失时，删除该会话全部快照 tag
 *    并重写索引，空间由紧随的同一次 gc --prune=now 真正释放。
 *
 * 触发点在每条用户消息快照之后的同一条串行队列里（见 index.js 的事件
 * 接线），因此 gc/清理与快照天然互斥，不存在 git 锁竞态。
 */

// gc 节流阈值来自 config 域（设置页「插件配置」卡片可实时改写 cfg，
// 因此这里按调用时取值而不是工厂创建时快照；环境变量
// DSH_RECALL_GC_SNAPS/GC_HOURS 仍最高优先，见 config.js）：
// 每 gcSnaps 条快照或距上次 gc gcHours 小时，先到先触发。默认「50 条或
// 24 小时」——重活（gc）一天至多一次的量级，轻会话用户也不会等太久。

// P1-3 纯逻辑：按 root 分组选出超限部分的最旧快照（time 升序，time=0 孤儿
// 最旧优先），模块级导出供 tests/unit 直接钉边界；工厂内 enforceLimits 复用。
export function selectOverLimitVictims(snapshots, limit) {
  if (!limit || limit <= 0) return new Map() // 0 或负值 = 不限制
  const byRoot = new Map()
  for (const [id, s] of snapshots.entries()) {
    if (!s || !s.root) continue
    if (!byRoot.has(s.root)) byRoot.set(s.root, [])
    byRoot.get(s.root).push({ id, time: s.time })
  }
  const victims = new Map()
  for (const [root, list] of byRoot) {
    if (list.length <= limit) continue
    const excess = list.length - limit
    // 按时间升序排：time=0 最旧，优先清；同时间保插入序（先入先出）
    list.sort((a, b) => (a.time || 0) - (b.time || 0))
    victims.set(root, list.slice(0, excess))
  }
  return victims
}

// S2-3 按时间保留的纯逻辑：retentionDays <= 0 不启用；按 root 分组，
// 命中「time > 0 且早于 cutoff」的入选（time=0 孤儿视为最旧，一并最先
// 清——与 selectOverLimitVictims 同构）。模块级导出供单测钉边界。
export function selectExpiredVictims(snapshots, retentionDays, now) {
  if (!retentionDays || retentionDays <= 0) return new Map()
  const cutoff = (typeof now === 'number' ? now : Date.now()) - retentionDays * 86400000
  const byRoot = new Map()
  for (const [id, s] of snapshots.entries()) {
    if (!s || !s.root) continue
    // time=0 孤儿（rebuildOrphans 重建）无真实时间，视为最旧列入
    if (s.time > 0 && s.time >= cutoff) continue
    if (!byRoot.has(s.root)) byRoot.set(s.root, [])
    byRoot.get(s.root).push({ id, time: s.time })
  }
  return byRoot
}

export function createMaintenance(ctx, rt, snaps, config) {
  const sessions = ctx.sessions
  const state = rt.state
  // 平台选择的脚本模板（gc/purge 两套模板同名导出）
  const S = rt.scripts

  // 删除一个会话的全部快照：按 root 分组（同一会话可能换过工作目录），
  // tag 分块删除规避命令行长度上限，索引重写交给 snaps.saveIndex。
  // best-effort：单块失败只记日志，剩余块继续；tag 残留由下次清理幂等收尾。
  async function purgeSession(sessionId) {
    const byRoot = new Map()
    for (const [id, s] of state.snapshots.entries()) {
      if (!s || s.sessionId !== sessionId) continue
      if (!byRoot.has(s.root)) byRoot.set(s.root, [])
      byRoot.get(s.root).push(id)
    }
    let purged = 0
    for (const [root, ids] of byRoot) {
      let store = state.stores.get(root)
      if (!store) {
        // 冷启动时 store 缓存可能还没建：现场解析一次而不是直接跳过——
        // 跳过会让该 root 的快照永远清不掉（sweep 每轮都 miss）
        try { store = await rt.resolveStore(root) } catch (error) { store = null }
      }
      if (!store || !state.gitExe) continue
      try {
        for (let i = 0; i < ids.length; i += 100) {
          await rt.runShell(S.purgeTagsScript(store, state.gitExe, ids.slice(i, i + 100).map((id) => 'snap-' + id)), { timeoutMs: 120000, stdoutMaxBytes: 4096 })
        }
        for (const id of ids) state.snapshots.delete(id)
        await snaps.saveIndex(root, sessionId)
        purged += ids.length
      } catch (error) {
        rt.recordError('recall purge session failed: ' + String(error))
      }
    }
    if (purged > 0) console.error('recall purged snapshots of deleted session:', sessionId, purged)
    return purged
  }

  // 扫描索引里出现过的全部会话：不在 sessions 注册表、也不在磁盘会话目录
  // 里的，才认定「已删除」。
  // PF-7：一次 listSessions 建 id 集合替代逐会话 readSession 冷读——后者
  // 对每个非 live 会话解压全量日志且跑在串行队列里，会话多的老工作区 gc
  // 一到就把后续快照/撤回全堵在队尾；listSessions 是「目录级 header 枚举、
  // 不触碰全量日志」（I8：记录 id 在 header.id），一次调用即得全部磁盘
  // 会话 id 集。判定语义与旧「readSession 成败」等价且更保守：归档会话
  // 日志仍在磁盘（集合中保留，不被误清——旧路径同样靠这一点）、日志损坏
  // 但文件在的也保留（purge 不可逆，宁可少清）。
  // 保守闸门保持：sessionQuery 服务（或 listSessions）不存在、枚举抛异常
  // 时整体跳过——无法枚举就无法区分「已删除」和「只是冷着」，误删快照
  // 不可逆，宁可不清理。
  // titles 半项（PF-7 原案）：探针（tests/probe/api-surface.test.js）确认
  // SessionHeader 无 title 字段（标题住在事件日志里）→ 冷标题无法走
  // listSessions，titles 冷读维持 readSession 现状。
  async function sweepDeletedSessions() {
    const ids = new Set()
    for (const s of state.snapshots.values()) {
      if (s && s.sessionId) ids.add(s.sessionId)
    }
    if (!ids.size) return
    const query = ctx.get('sessionQuery')
    if (!query || typeof query.listSessions !== 'function') return
    let diskIds
    try {
      diskIds = new Set(((await query.listSessions()) || [])
        .map((r) => r && r.header && r.header.id)
        .filter(Boolean))
    } catch (error) {
      return
    }
    for (const id of ids) {
      if (sessions.get(id)) continue
      if (diskIds.has(id)) continue
      await purgeSession(id)
    }
  }

  // 存储总量上限（P1-3）：按 root 分组统计，超限按 time 升序删最旧。
  // 调用点（runGc/runGcAll）都在串行队列里，与快照互斥，无 git 锁竞态。
  // 删除前 console.error 留痕（静默删历史撤回点必须可追溯，与 purgeSession
  // 同款）；删除后重写索引。time=0 的孤儿条目（rebuildOrphans 重建）视为
  // 最旧优先清理——它们没有真实时间，先于有时间的快照被清。
  // 分组与选中逻辑在模块级 selectOverLimitVictims（单测直接钉边界）。
  async function enforceLimits() {
    const victimsMap = selectOverLimitVictims(state.snapshots, config.maxSnapshotsPerWorkspace)
    if (!victimsMap.size) return 0
    let dropped = 0
    for (const [root, victims] of victimsMap) {
      let store = state.stores.get(root)
      if (!store) {
        try { store = await rt.resolveStore(root) } catch (error) { store = null }
      }
      if (!store || !state.gitExe) continue
      try {
        for (let i = 0; i < victims.length; i += 100) {
          await rt.runShell(S.purgeTagsScript(store, state.gitExe, victims.slice(i, i + 100).map((v) => 'snap-' + v.id)), { timeoutMs: 120000, stdoutMaxBytes: 4096 })
        }
        for (const v of victims) state.snapshots.delete(v.id)
        await snaps.saveIndex(root, null)
        dropped += victims.length
        console.error('recall enforceLimits dropped ' + victims.length + ' oldest snapshots for: ' + root + ' (max ' + config.maxSnapshotsPerWorkspace + ')')
      } catch (error) {
        rt.recordError('recall enforceLimits failed for ' + root + ': ' + String(error))
      }
    }
    return dropped
  }

  // 按时间保留（S2-3）：对每个 root 清掉早于保留窗口的快照。结构与
  // enforceLimits 同款（tag 分块删除 + saveIndex + 留痕），与条数上限
  // 各自独立触发，在同一轮 gc 周期里先后执行。时间维度的删除同样
  // 静默丢历史撤回点，故 console.error 留痕与 enforceLimits 一致。
  async function enforceRetention() {
    const victimsMap = selectExpiredVictims(state.snapshots, config.retentionDays, Date.now())
    if (!victimsMap.size) return 0
    let dropped = 0
    for (const [root, victims] of victimsMap) {
      let store = state.stores.get(root)
      if (!store) {
        try { store = await rt.resolveStore(root) } catch (error) { store = null }
      }
      if (!store || !state.gitExe) continue
      try {
        for (let i = 0; i < victims.length; i += 100) {
          await rt.runShell(S.purgeTagsScript(store, state.gitExe, victims.slice(i, i + 100).map((v) => 'snap-' + v.id)), { timeoutMs: 120000, stdoutMaxBytes: 4096 })
        }
        for (const v of victims) state.snapshots.delete(v.id)
        await snaps.saveIndex(root, null)
        dropped += victims.length
        console.error('recall enforceRetention dropped ' + victims.length + ' expired snapshots for: ' + root + ' (retention ' + config.retentionDays + 'd)')
      } catch (error) {
        rt.recordError('recall enforceRetention failed for ' + root + ': ' + String(error))
      }
    }
    return dropped
  }

  // 维护核心（节流判定 + 清理 + gc）：force 供设置页「立即 gc」手动触发，
  // 跳过阈值检查但仍走同一条串行队列调用方——与快照天然互斥的约束不变。
  // 失败也推进 gcLastAt：gc 失败往往是环境性的（磁盘/杀软），不推进时间戳
  // 会让后续每条消息都重试一次重量级 gc，把队列堵住。
  async function runGc(sessionId, force) {
    const root = await rt.resolveRoot(sessionId)
    if (!root) return false
    const store = state.stores.get(root)
    if (!store || !state.gitExe) return false
    const now = Date.now()
    const last = state.gcLastAt.get(store.git) || 0
    const count = (state.gcCount.get(store.git) || 0) + 1
    state.gcCount.set(store.git, count)
    if (!force && count < config.gcSnaps && now - last < config.gcHours * 3600000) return false
    state.gcCount.set(store.git, 0)
    try {
      await sweepDeletedSessions()
      // P1-3：总量上限清理（sweep 之后、gc 之前）——与快照在同一条串行
      // 队列里，删除 tag 与 gc 互斥，无 git 锁竞态；best-effort，
      // 自身失败不进 catch 的主错误路径（enforceLimits 内部已兜）。
      await enforceLimits()
      // S2-3：按时间保留清理（与条数上限维度各自独立，同条串行队列）
      await enforceRetention()
      await rt.runShell(S.gcScript(store, state.gitExe), { timeoutMs: 600000, stdoutMaxBytes: 4096 })
    } catch (error) {
      rt.recordError('recall maintenance failed: ' + String(error))
    }
    state.gcLastAt.set(store.git, Date.now())
    return true
  }

  // 全局 gc（设置卡片没有会话上下文）：清理扫描一次 + 逐 store gc。
  // store 全集取内存缓存（启动预热与历次操作会填齐已知工作区）；逐个
  // best-effort，单个失败记错误继续。调用方（manage 端点）把它排进同一条
  // 串行队列，与快照天然互斥，无 git 锁竞态。
  async function runGcAll() {
    const stores = Array.from(new Set(Array.from(state.stores.values()).filter(Boolean)))
    if (!stores.length || !state.gitExe) return false
    try {
      await sweepDeletedSessions()
    } catch (error) {
      rt.recordError('recall sweep failed: ' + String(error))
    }
    try {
      // P1-3：全局清理一次（runGcAll 无会话上下文，enforceLimits 自身按
      // root 遍历内存快照，天然覆盖全部已知工作区）
      await enforceLimits()
    } catch (error) {
      rt.recordError('recall enforceLimits failed: ' + String(error))
    }
    try {
      // S2-3：按时间保留全局清理一次
      await enforceRetention()
    } catch (error) {
      rt.recordError('recall enforceRetention failed: ' + String(error))
    }
    let done = 0
    for (const store of stores) {
      try {
        await rt.runShell(S.gcScript(store, state.gitExe), { timeoutMs: 600000, stdoutMaxBytes: 4096 })
        done++
      } catch (error) {
        rt.recordError('recall gc failed for ' + (store && store.git) + ': ' + String(error))
      }
      state.gcLastAt.set(store.git, Date.now())
      state.gcCount.set(store.git, 0)
    }
    return true
  }

  // 每条消息快照后串行调用（见 index.js 事件接线）
  async function maybeMaintain(sessionId) {
    await runGc(sessionId, false)
  }

  // 模块收敛：runGc/runGcAll 之外的内部步骤不对外暴露面；enforceLimits /
  // sweepDeletedSessions 保留导出供单测以工厂形态驱动（注入假 rt/ctx 钉
  // 执行链路；PF-7 sweep 判定矩阵依赖导出）。
  return { maybeMaintain, runGc, runGcAll, enforceLimits, enforceRetention, sweepDeletedSessions }
}
