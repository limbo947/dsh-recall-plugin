/**
 * dsh-recall-plugin — Host 入口（持久插件形态，bundle 行挂载）
 *
 * 职责：装配各域模块（config / store / snapshots / maintenance / session-info /
 * routes-core / routes-manage），通过 webServer 注册 /api/recall/* HTTP API
 * 供 Client 半调用，并接线 session/event 快照触发与启动预热。
 *
 * 这是持久 npm 插件包的主入口（exports["."]），由 cordis.patch.yml 的
 * insert 行挂载进 profile composition，DSH 重启后自动生效。业务逻辑已拆到
 * lib/ 各域模块（routes-core / routes-manage / session-info），本文件只做
 * 接线与 store 发现/执行工具，不承载端点业务。
 */

import { createConfig, Config, DEFAULTS } from './config.js'
import { parseStoresDump, parseExcludeDump } from './dump-parse.js'

// dump 解析纯函数住 dump-parse.js（避免 routes-manage 反向 import index 的
// 循环依赖），这里 re-export 保持既有 import 路径稳定
export { parseStoresDump, parseExcludeDump }
import { createRuntime } from './store.js'
import { createSnapshots, rescueRollback } from './snapshots.js'
import { createMaintenance } from './maintenance.js'
import { createSessionInfo, titleFromEvents, messageTextFromEvents } from './session-info.js'
import { createRoutesCore } from './routes-core.js'
import { createRoutesManage } from './routes-manage.js'
import * as dshSettings from '@deepseek-ai/dsh-settings'
import * as E from './errors.js'

export const name = 'dsh-recall-plugin'

// 硬依赖：shell（PowerShell 执行）、sessions（会话/沙箱策略）、
// webServer（Client 半的 HTTP API 通道）。agents（dsh-base 无条件装配的
// agent 注册表）为 P0-1 运行中 agent 拦截读运行状态所需——cordis 4 要求
// 服务在 inject 中声明才可经 ctx.agents 访问，漏声明会抛
// "cannot get property ... without inject" 导致检查静默 fail-open（冒烟发现）。
// 其余服务按需 ctx.get。
export const inject = ['shell', 'sessions', 'webServer', 'agents']

// 入口配置 schema：cordis 加载器据此校验 insert 行 config 并填充默认值，
// 非法配置在插件加载时响亮失败（官方「插件配置」文档要求）。
export { Config }

// config 由 cordis.patch.yml 的 insert 行 config 键下发（schema 默认值兜底），
// 设置页「插件配置」卡片的用户覆盖经 settings namespace 热更新进 cfg
// （见下方 installSettingsSection 接线）
export function apply(ctx, config) {
  const webServer = ctx.webServer

  const cfg = createConfig(config)
  const rt = createRuntime(ctx, cfg)
  const snaps = createSnapshots(ctx, rt, cfg)
  const maint = createMaintenance(ctx, rt, snaps, cfg)
  const state = rt.state

  // ---- settings namespace「dsh-recall」：设置页「插件配置」分区正规接入 ----
  // 官方 settings 辅助的版本兼容：0.1.2-alpha.2 起独立函数 installSettingsSection
  // 移除、改为 SettingsProvider.installSection 方法（bash-local 等官方插件同款
  // 迁移）；0.1.2-alpha.1 及以前用独立函数。二者语义一致：settings 服务挂载后
  // 以真 Config schema 注册 namespace、组合 base 取入口 config；服务卸载时源
  // 回退入口 config。解析层 = schema 默认 → 组合 base → 用户文档（设置卡片
  // 写入、dsh-settings 持久化），变更经 watch 热更新进运行中的 cfg。
  // 分支判断不能只看静态导入包（插件 node_modules 固定为最新版 dsh-settings，
  // 旧版 DSH 运行时会注入旧版实例），要按运行时注入实例的实际 API 分派：
  // installSection 方法（0.1.2-alpha.2）或 register 核心 API（0.1.1-rc.2 及
  // 以前，此时手动复刻独立函数接线语义——注册 namespace、源指向 scope、
  // 卸载回退入口 config、watch 热更新）。
  let readSettings = () => config
  function applyResolvedConfig(resolved) {
    Object.assign(cfg, createConfig(resolved && typeof resolved === 'object' ? resolved : {}))
  }
  const settingsHooks = {
    setSource: (fn) => { readSettings = fn },
    onChange: () => applyResolvedConfig(readSettings()),
  }
  try {
    if (typeof dshSettings.installSettingsSection === 'function') {
      // 包解析到旧版 dsh-settings：独立函数辅助
      dshSettings.installSettingsSection(ctx, 'dsh-recall', Config, config, settingsHooks)
    } else if (typeof ctx.inject === 'function') {
      ctx.inject(['settings'], (settingsCtx) => {
        const settingsService = settingsCtx.settings
        if (typeof settingsService.installSection === 'function') {
          // 0.1.2-alpha.2 起：settings 服务方法（inject 声明后取实例，方法
          // 与独立函数同签名——register 语义/组合 base/卸载回退/onChange
          // 触发全一致）
          settingsService.installSection(ctx, 'dsh-recall', Config, config, settingsHooks)
        } else if (typeof settingsService.register === 'function') {
          // 0.1.1-rc.2 及以前：仅 register 核心 API，复刻独立函数接线语义
          const scope = settingsService.register('dsh-recall', Config, { base: config })
          settingsHooks.setSource(() => scope.get())
          settingsHooks.onChange()
          scope.watch(() => settingsHooks.onChange())
          settingsCtx.effect(() => () => {
            settingsHooks.setSource(() => config)
            settingsHooks.onChange()
          })
        }
      })
    }
  } catch (error) {
    rt.recordError('recall settings namespace skipped: ' + String(error))
  }

  // 平台门控：win32 走 PowerShell 模板，linux/darwin 走 bash 模板。
  // 其余平台干净短路：init 返回 unsupported，Client 弹一次性提示。
  const supported = process.platform === 'win32' || process.platform === 'linux' || process.platform === 'darwin'

  // 请求体上限：端点里 exclude-set 接受用户任意文本，无上限时可被无限
  // POST 撑爆内存。1MB 远超正常配置体量，超限干净报错而不是悄悄截断。
  const MAX_BODY_BYTES = 1048576

  // 快照管理列表的结果缓存（apply 级跨请求共享）：30s 缓存让二次打开即时；
  // delete 与新快照落地时失效。listCache/excludeCache 是可变 holder——routes
  // 层改属性（items/payload），本文件的事件接线读同一引用。
  // PF-6：事件接线不再清空 items 而是 stale 标记——list 端点先用旧 items
  // 立即应答（对话中打开快照管理不再等全量 dump），后台 dump 更新缓存
  // （refreshing 持有进行中的 promise 做 in-flight 去重，stale 期间重复
  // list 不重复起进程）；Client 收到 stale 标记静默再拉一次。
  const listCache = { at: 0, items: null, stale: false, refreshing: null }
  // 排除配置枚举缓存（30s）：exclude-set 成功写入后立即失效。
  const excludeCache = { at: 0, payload: null }
  // 全量磁盘占用缓存（30s，PF-3）：删除/gc 后失效（占用变化必须立即可见），
  // 每条消息不失效——快照带来的增量由 TTL 到期自然覆盖，不然 TTL 形同虚设。
  const usageCache = { at: 0, payload: null }

  // 会话标题/文本两段式读取（live 秒回，冷会话由 Client 异步补齐）
  const sessionInfo = createSessionInfo(ctx)

  async function readJsonBody(req) {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY_BYTES) throw new Error(E.RECALL_BODY_TOO_LARGE)
      chunks.push(chunk)
    }
    const text = Buffer.concat(chunks).toString('utf8')
    if (!text.trim()) return {}
    return JSON.parse(text)
  }

  function sendJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }

  // 统一错误映射：业务失败与系统异常分离，文案与诊断解耦。code 给
  // Client 做分支判断，message 直接展示。
  function errBody(error) {
    const text = String(error && error.message ? error.message : error)
    if (text === E.RECALL_BODY_TOO_LARGE) return { ok: false, code: E.RECALL_BODY_TOO_LARGE, message: '请求体超过 1MB 上限' }
    return { ok: false, code: E.RECALL_ERROR, message: text }
  }

  // 队列入队即占住后续快照，队列失败不堵队（catch 就地消化）。
  function enqueue(task) {
    const run = state.queue.then(task)
    state.queue = run.catch(() => {})
    return run
  }

  // 通用并发限制器：冷会话标题/消息文本补齐会 readSession 整日志解压，
  // 全量 Promise.all 会同时压垮磁盘/CPU，限制同时最多 concurrency 个任务。
  async function runLimited(tasks, concurrency) {
    const limit = concurrency > 0 ? concurrency : 4
    let index = 0
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (index < tasks.length) {
        const task = tasks[index++]
        await task()
      }
    })
    await Promise.all(workers)
  }

  // 归一化 cwd/root 路径用于跨会话同工作区比对：Windows 大小写不敏感 +
  // 去掉尾部分隔符，避免 D:\Foo 与 d:\foo\ 误判为不同目录。
  function normalizeWorkdir(path) {
    if (!path) return ''
    let p = String(path)
    return (process.platform === 'win32' ? p.toLowerCase() : p).replace(/[\\/]+$/, '')
  }

  // 回退前重保护检查（P0-1）：目标工作区有 agent 正在跑时拒绝预览/撤回。
  // 保守策略——不做自动取消，仅拦下操作并提示先停止。守卫式访问只为防御
  // 「未来版本改名 / agent 服务未装配」，失败视为「不忙」（fail-open）。
  function agentBusy(sessionId, root) {
    let reg = null
    try { reg = ctx.agents } catch (error) { return false }
    if (!reg) return false
    try {
      if (typeof reg.list === 'function') {
        for (const agent of reg.list()) {
          if (!agent || agent.status !== 'running') continue
          // 发起会话自身的 agent（覆盖最常见场景：本会话 agent 在跑）
          if (sessionId && String(agent.id) === String(sessionId)) return true
          // 跨会话同工作区：另一会话的 agent 在同一个目录跑也会被文件回退波及
          const cwd = agent.session && agent.session.header && agent.session.header.cwd
          if (root && cwd && normalizeWorkdir(cwd) === normalizeWorkdir(root)) return true
        }
        return false
      }
      if (sessionId && typeof reg.get === 'function') {
        const agent = reg.get(sessionId)
        return Boolean(agent && agent.status === 'running')
      }
    } catch (error) { /* fail-open */ }
    return false
  }

  // 枚举当前全部已知 exclude 文件并按路径去重。exclude-get 直接消费结果；
  // exclude-set 用它做路径白名单校验，堵死「借 API 写任意文件」的通道。
  async function listExcludeFiles() {
    const roots = new Set(state.stores.keys())
    for (const session of ctx.sessions.list()) {
      const cwd = session && session.header && session.header.cwd
      if (cwd) roots.add(cwd)
    }
    const byFile = new Map()
    await Promise.all(Array.from(roots).map(async (root) => {
      try {
        const store = await rt.resolveStore(root)
        if (store && !byFile.has(store.excludeFile)) byFile.set(store.excludeFile, { store, roots: [] })
        byFile.get(store.excludeFile).roots.push(root)
      } catch (error) {
        /* 单个根解析失败只影响它自己，不拖垮整个列表 */
      }
    }))
    // 磁盘兜底：冷启动时会话注册表为空（惰性载入），但 home 容器目录可能
    // 早已存在（历史快照）。容器在 ⇒ 共享 exclude.txt 可编辑。
    try {
      const container = await rt.resolveHomeContainer()
      if (container) {
        const probe = rt.scripts.stripBom(await rt.runShell(rt.scripts.dirExistsScript(container), { stdoutMaxBytes: 4096 })).trim()
        if (probe === 'YES') {
          const excludeFile = container + (rt.isWin ? '\\' : '/') + 'exclude.txt'
          if (!byFile.has(excludeFile)) {
            // 伪 store：仅承载 readExclude/writeExclude 用到的 excludeFile 与 home
            byFile.set(excludeFile, { store: { dir: container, home: true, excludeFile }, roots: [] })
          }
        }
      }
    } catch (error) {
      /* 兜底失败退回注册表结果 */
    }
    return byFile
  }

  // 工作区 cwd 全集：live 注册表只是子集，sessionQuery.listSessions 是
  // 「live + 磁盘冷元数据」的完整语料。manage list 与 delete 兜底共用。
  async function collectCwds() {
    const cwds = new Set()
    for (const session of ctx.sessions.list()) {
      const cwd = session && session.header && session.header.cwd
      if (cwd) cwds.add(cwd)
    }
    try {
      const querySvc = ctx.get('sessionQuery')
      if (querySvc && typeof querySvc.listSessions === 'function') {
        for (const record of await querySvc.listSessions()) {
          const cwd = record && record.header && record.header.cwd
          if (cwd) cwds.add(cwd)
        }
      }
    } catch (error) { /* 冷元数据不可用时退回 live 注册表 */ }
    return cwds
  }

  // 一条 shell dump 全部 store 元数据（容器子目录 + 降级候选目录的 root.txt
  // 与 index.json），manage list 与 delete 兜底共用。
  async function dumpStores() {
    const container = await rt.resolveHomeContainer()
    const extras = Array.from(await collectCwds()).map((cwd) => cwd + (rt.isWin ? '\\' : '/') + '.dsh-recall-snapshots')
    try {
      const text = rt.scripts.stripBom(await rt.runShell(rt.scripts.storesDumpScript(container || '', extras), { timeoutMs: 120000, stdoutMaxBytes: 8388608 }))
      return parseStoresDump(text)
    } catch (error) {
      // 同 refreshListCacheInBackground：dump 失败按空 Map 继续是设计行为，
      // 但失败原因必须留痕，否则列表缺数据时无从排查
      console.error('recall stores dump failed:', String(error && error.stack || error))
      return new Map()
    }
  }

  // 磁盘反查某快照归属的 store：dump 全部 index 后按 id 查找。delete 的
  // 兜底路径用它消灭「列表可见但内存缺失 ⇒ 误报不存在」。
  async function locateSnapshotOnDisk(id) {
    if (!id) return null
    const dump = await dumpStores()
    const hints = new Map()
    for (const [root, st] of state.stores.entries()) {
      if (st && st.dir) hints.set(st.dir, root)
    }
    for (const [dir, info] of dump) {
      const hit = (info.entries || []).find((e) => e && e.id === id)
      if (!hit) continue
      // root 优先取 root.txt 权威值（info.root），index.json 条目的 hit.root
      // 可能有丢反斜杠的历史坏数据（否则解析到错误 hash 的 store 删错目录）
      const root = info.root || hints.get(dir) || (typeof hit.root === 'string' && hit.root) || null
      if (!root) continue
      try {
        const store = await rt.resolveStore(root)
        if (store) return { store, root }
      } catch (error) { /* 单个 root 解析失败继续找 */ }
    }
    return null
  }

  // 收集全量快照记录（内存 + 磁盘 dump 并集），供树形管理的按工作区/会话
  // 批量删除使用。去重只按 id——同一消息 ID 全局唯一。
  async function collectAllSnapshotRecords() {
    const records = new Map()
    function add(id, root, sessionId, time) {
      if (!id || typeof id !== 'string') return
      const old = records.get(id)
      if (!old) {
        records.set(id, {
          id,
          root: root || null,
          sessionId: sessionId || null,
          time: typeof time === 'number' ? time : 0
        })
        return
      }
      // 同一消息 ID 可能出现磁盘先占位、内存后补全的情况：用更全的
      // root/sessionId/time 覆盖旧值，避免树形节点归到「未知」导致批量
      // 删除按工作区/会话匹配不到。
      if (!old.root && root) old.root = root
      if (!old.sessionId && sessionId) old.sessionId = sessionId
      if (!old.time && time) old.time = time
    }
    for (const [id, s] of state.snapshots.entries()) {
      if (s) add(id, s.root, s.sessionId, s.time)
    }
    const dump = await dumpStores()
    const hints = new Map()
    for (const [root, st] of state.stores.entries()) {
      if (st && st.dir) hints.set(st.dir, root)
    }
    for (const [dir, info] of dump) {
      const baseRoot = info.root || hints.get(dir) || null
      for (const e of info.entries || []) {
        if (!e || typeof e.id !== 'string') continue
        // root 优先取 root.txt 权威值（info.root）——index.json 条目的 e.root
        // 可能带历史丢反斜杠的坏数据（删除/展示按错误 root 解析错 store）
        add(e.id, baseRoot || (typeof e.root === 'string' && e.root) || null, e.sessionId, e.time)
      }
    }
    return records
  }

  // ---- 端点表组装：核心路由 + 管理路由，合并进单一 endpoints 对象供
  // webServer 前缀路由分发（端点名是 path 第一段，故无跨域命名冲突）。
  const deps = {
    ctx, rt, snaps, maint, state, cfg, supported,
    enqueue, agentBusy, runLimited, readJsonBody, sendJson, errBody,
    listExcludeFiles, dumpStores, locateSnapshotOnDisk, collectAllSnapshotRecords,
    listCache, excludeCache, usageCache, sessionInfo, titleFromEvents, messageTextFromEvents,
    // readSettings 传活绑定而非当前引用（A1）：dsh-settings 服务晚挂载时
    // setSource 会重绑定 readSettings——按值捕获的副本停在旧闭包（入口
    // config），config-reset 会按旧值「恢复默认」。活绑定让消费者每次调用
    // 都取到当前闭包。
    applyResolvedConfig, readSettings: () => readSettings(), DEFAULTS, rescueRollback, E,
  }
  const endpoints = {
    ...createRoutesCore(deps),
    ...createRoutesManage(deps),
  }

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/api/recall',
    handler: async (req, res) => {
      const path = (req.url || '').split('?')[0]
      const name = path.replace(/^\/api\/recall\/?/, '').split('/')[0]
      const endpoint = endpoints[name]
      if (!endpoint) {
        sendJson(res, 404, { ok: false, code: E.RECALL_UNKNOWN_ENDPOINT, message: 'unknown endpoint: ' + name })
        return
      }
      try {
        const args = await readJsonBody(req)
        sendJson(res, 200, await endpoint(args))
      } catch (error) {
        sendJson(res, 200, errBody(error))
      }
    }
  }))

  // 快照事件与启动预热仅在受支持平台注册（见上方 supported 短路说明）
  if (!supported) return

  // 每条用户消息触发快照（子代理会话跳过）；快照完成后串行接一次维护
  // （定期 gc / 会话清理）——排在同一条队列里，与快照天然互斥，无 git 锁竞态
  ctx.on('session/event', (session, event) => {
    if (!event || event.type !== 'user/message') return
    const data = event.data
    if (!data || typeof data.id !== 'string' || !data.id) return
    const source = data.source
    if (!source || source.kind !== 'user') return
    if (session && session.header && session.header.origin === 'subagent') return
    const messageId = data.id
    const time = event.time
    state.queue = state.queue
      // 快照总开关：cfg 按调用时读取，设置页热更即时生效。关闭时只冻结新建，
      // maybeMaintain 照常跑——已停增的存储仍需被 gc/清理治理。
      .then(() => (cfg.snapshotEnabled ? snaps.captureSnapshot(session.id, messageId, time) : null))
      .then(() => maint.maybeMaintain(session.id))
      // PF-6：不清 items 只标 stale——列表先按旧数据应答、后台补新（见 listCache 注释）
      .then(() => { listCache.stale = true })
      .catch((error) => rt.recordError('recall snapshot error: ' + String(error)))
  })

  // 启动预热：所有已存在工作区解析存储、重建索引与孤儿快照，并清理旧版
  // 项目内 blobs 目录（home 可用时）。不触发维护（开机预热应尽量轻）。
  ;(async () => {
    const warmupRoots = new Map()
    for (const session of ctx.sessions.list()) {
      const cwd = session && session.header && session.header.cwd
      if (cwd && !warmupRoots.has(cwd)) warmupRoots.set(cwd, session.id)
    }
    const querySvc = ctx.get('sessionQuery')
    if (querySvc && typeof querySvc.listSessions === 'function') {
      try {
        const records = await querySvc.listSessions()
        for (const record of records || []) {
          // listSessions 记录形如 {header, live, persisted}，会话 id 在
          // header.id——此前误用顶层 record.id（恒 undefined），预热重建的
          // 孤儿快照 sessionId 记为空，树形管理里会落进「已删除会话」。
          const id = record && record.header && record.header.id ? record.header.id : null
          const cwd = record && record.header && record.header.cwd
          if (cwd && !warmupRoots.has(cwd)) warmupRoots.set(cwd, id)
        }
      } catch (error) { /* 冷元数据不可用则退回 live 注册表 */ }
    }
    for (const [cwd, sessionId] of warmupRoots) {
      Promise.resolve(rt.resolveStore(cwd))
        .then(() => rt.tryUpgradeToHome(cwd))
        .then((store) => rt.ensureGit(cwd, store))
        .then(() => snaps.loadIndex(cwd, sessionId))
        .then(() => snaps.rebuildOrphans(cwd, sessionId))
        .then(() => rt.cleanupLegacy(cwd))
        .catch(() => {})
    }
  })()
}
