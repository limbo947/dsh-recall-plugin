/**
 * dsh-recall-plugin — 管理路由域（R2 从 index.js 拆出）
 *
 * exclude-get/set、config-get/set/reset、manage（列表/标题/文本/占用/删除/
 * 删除全部/gc/lineage）端点，以及 manage 用的删除辅助（deleteSnapshotsByFilter /
 * deleteAllSnapshots）。依赖经 deps 注入；listCache/excludeCache 是 apply 级
 * 可变 holder（改属性而非重绑定），与 index.js 的事件接线共享同一引用。
 */

import { isSafetySnapshotId } from './snapshots.js'
import { parseExcludeDump } from './dump-parse.js'

export function createRoutesManage(deps) {
  const {
    ctx, rt, snaps, maint, state, cfg, supported, enqueue, runLimited,
    listExcludeFiles, dumpStores, locateSnapshotOnDisk, collectAllSnapshotRecords,
    listCache, excludeCache, usageCache, sessionInfo, titleFromEvents, messageTextFromEvents,
    applyResolvedConfig, readSettings, DEFAULTS, E,
  } = deps
  const { sessionTitles, messageTexts, liveTitleFast, liveMessageTextFast } = sessionInfo

  // PF-6：list items 构建（磁盘 dump + 内存并集 + 排序）从 list 分支抽出——
  // 同步路径与 stale 后台刷新共用同一实现（改一处漏一处的风险随合并消失）。
  async function buildListItems() {
    const allItems = []

    // 磁盘全量：一条 shell dump。标题只查 live/缓存（liveTitleFast，同步
    // 瞬时）——冷会话标题由 Client 拿到列表后异步调 titles 补齐。
    const dump = await dumpStores()
    const hints = new Map()
    for (const [root, st] of state.stores.entries()) {
      if (st && st.dir) hints.set(st.dir, root)
    }
    // 去重只用 id（消息 ID 全局唯一）：带 root 进 key 会让同一快照因
    // 「磁盘来源 root 缺失 / 内存来源 root 齐全」出现两条重复行
    const byId = new Map()
    function push(id, time, root, sessionId) {
      if (!id || typeof id !== 'string') return
      // F-G1 防御性展示过滤：修复前 rebuildOrphans 曾把 safety tag
      // （pre-rollback-<ts>）strip 前缀后写进 index.json——存量污染条目
      // 不做迁移清理（一次性数据，代价收益不划算），这里挡住可见性：
      // 安全快照不是消息快照，本就不该出现在管理列表/树里。
      if (isSafetySnapshotId(id)) return
      const old = byId.get(id)
      if (!old) {
        const rec = {
          id,
          time: typeof time === 'number' ? time : 0,
          root: root || null,
          workspace: root ? root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : null,
          sessionId: sessionId || null,
          sessionTitle: liveTitleFast(sessionId)
        }
        // 消息文本只放已确认值：live 命中字符串则带，否则不设字段。
        const liveText = liveMessageTextFast(sessionId, id)
        if (liveText) rec.messageText = liveText
        byId.set(id, rec)
        allItems.push(rec)
        return
      }
      // 与 collectAllSnapshotRecords 同款补全：磁盘先占位、内存后补全 root
      if (!old.root && root) { old.root = root; old.workspace = root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || null }
      if (!old.sessionId && sessionId) { old.sessionId = sessionId; old.sessionTitle = liveTitleFast(sessionId) }
      // 与 !old 分支同规（live 命中才写字段）：null 落进属性会让 client
      // 误判「已查过」而跳过 messages 冷读——冷会话快照永远只显示消息 ID
      if (!old.messageText && id) { const t = liveMessageTextFast(sessionId, id); if (t) old.messageText = t }
      if (!old.time && time) old.time = time
    }
    for (const [dir, info] of dump) {
      const baseRoot = info.root || hints.get(dir) || null
      for (const e of info.entries || []) {
        if (!e || typeof e.id !== 'string') continue
        // root 优先取 root.txt（info.root，resolveStore 写下的权威映射）：index.json
        // 条目里的 e.root 曾出现丢失反斜杠的坏数据（哈希↔root 错位，删除落到空
        // store），root.txt 是每次 resolveStore 都重写的规范源，兜底才用条目值
        push(e.id, e.time, baseRoot || (typeof e.root === 'string' && e.root) || null, e.sessionId)
      }
    }
    // 内存兜底（刚拍未落盘的保险，正常已被磁盘 dump 覆盖）
    for (const [id, s] of state.snapshots.entries()) {
      push(id, s.time, s.root, s.sessionId)
    }
    allItems.sort((a, b) => (b.time || 0) - (a.time || 0))
    return allItems
  }

  // PF-6：stale 时的后台缓存刷新（in-flight 去重）——stale 期间重复 list
  // 复用同一进行中的 dump，不重复起进程（否则进程数反而放大）。完成后清
  // stale 标记；失败静默（下次 stale 触发自然重试）。
  function refreshListCacheInBackground() {
    if (listCache.refreshing) return listCache.refreshing
    listCache.refreshing = buildListItems()
      .then((allItems) => {
        listCache.items = allItems
        listCache.at = Date.now()
        listCache.stale = false
      })
      // 冒烟实证：这里的静默吞错曾让 stale 卡死近半小时无任何观测点——
      // 失败必须留痕（console），否则只能靠行为异常反推
      .catch((error) => { console.error('recall list refresh failed:', String(error && error.stack || error)) })
      .finally(() => { listCache.refreshing = null })
    return listCache.refreshing
  }

  // 按过滤条件批量删除快照（工作区/会话两个树节点共用）：先收集匹配
  // id 并按 root 分组，再整体进串行队列——与快照/gc 互斥，避免 git 锁
  // 竞态。每个 root 先 purge tag 再补载索引后重写 index.json，防止冷启动
  // 时用残缺内存覆盖同 store 其余磁盘快照。
  // PF-6：缓存非空（含 stale）时直接由缓存 items 构造 records，省一次
  // 全量 dumpStores——删除以「用户当前所见」为准（stale 说明有新快照未
  // 入列表，用户没看到的也不在删除预期内）；缓存为空才全量收集。
  async function deleteSnapshotsByFilter(match, sessionId) {
    let records
    if (Array.isArray(listCache.items) && listCache.items.length) {
      records = new Map()
      for (const it of listCache.items) {
        if (!it || typeof it.id !== 'string') continue
        records.set(it.id, { id: it.id, root: it.root || null, sessionId: it.sessionId || null, time: typeof it.time === 'number' ? it.time : 0 })
      }
    } else {
      records = await collectAllSnapshotRecords()
    }
    const byRoot = new Map()
    for (const rec of records.values()) {
      if (!match(rec) || !rec.root) continue
      if (!byRoot.has(rec.root)) byRoot.set(rec.root, [])
      byRoot.get(rec.root).push(rec.id)
    }
    let deleted = 0
    await enqueue(async () => {
      for (const [root, rootIds] of byRoot) {
        let store = state.stores.get(root)
        if (!store) {
          try { store = await rt.resolveStore(root) } catch (error) { store = null }
        }
        if (!store) continue
        try {
          if (state.gitExe) {
            // tag 分块删除：win32 命令行有 32767 字符上限，整批传大量 tag 会
            // 在长历史工作区上爆掉；与 maintenance.purgeSession 同款 100 个/块。
            const tags = rootIds.map((id) => 'snap-' + id)
            for (let i = 0; i < tags.length; i += 100) {
              await rt.runShell(rt.scripts.purgeTagsScript(store, state.gitExe, tags.slice(i, i + 100)), { timeoutMs: 120000, stdoutMaxBytes: 4096 })
            }
          }
          if (!state.indexLoaded.has(root)) {
            try { await snaps.loadIndex(root, sessionId) } catch (error) { /* 载入失败照常重写，退化为旧行为 */ }
          }
          for (const id of rootIds) state.snapshots.delete(id)
          await snaps.saveIndex(root, sessionId)
          deleted += rootIds.length
        } catch (error) {
          // 单个 root 失败不阻断其他 root：best-effort，错误进状态页可见的
          // 错误缓冲，剩余 root 继续清理。
          rt.recordError('recall batch delete failed for ' + root + ': ' + String(error))
        }
      }
      listCache.items = null
      usageCache.payload = null
    })
    return deleted
  }

  // 删除所有工作区的全部快照。树形管理的「工作区/会话」批量删除以
  // index.json 中的记录为目标；但「全部删除」必须把 git tag 当作真相源：
  // index 可能因旧版/崩溃/手动修复而为空或过期，不能因为索引里没有条目就
  // 漏删真实快照。磁盘枚举到的 store 即使 root.txt 丢失也直接按目录操作。
  async function deleteAllSnapshots() {
    return enqueue(async () => {
      const stores = new Map()
      for (const [root, store] of state.stores.entries()) {
        if (store && store.dir) stores.set(store.dir, { store, root })
      }
      const dump = await dumpStores()
      for (const [dir, info] of dump.entries()) {
        const known = stores.get(dir)
        if (known) {
          if (!known.root && info.root) known.root = info.root
          known.entries = info.entries || []
        } else {
          stores.set(dir, {
            // 全局删除只动该目录下的 git/index；不必、也不能依赖可反解的 root。
            store: rt.storeFromDir(dir, false),
            root: info.root || null,
            entries: info.entries || []
          })
        }
      }

      if (stores.size === 0) return { deleted: 0, stores: 0, failed: 0 }

      const gitExe = await rt.resolveGit()
      if (!gitExe) {
        const message = '未检测到 git CLI，无法验证并删除快照 tag'
        rt.recordError('recall delete all failed: ' + message)
        return { deleted: 0, stores: 0, failed: stores.size || 1, message }
      }

      let deleted = 0
      let clearedStores = 0
      let failed = 0
      for (const { store, root } of stores.values()) {
        try {
          // 先列出实际 tag；不要使用 entries 推导 tag，entries 是可丢失缓存。
          const output = await rt.runShell(rt.scripts.listTagsScript(store, gitExe), { timeoutMs: 120000, stdoutMaxBytes: 4194304 })
          const tags = rt.scripts.stripBom(output).split(/\r?\n/).map((tag) => tag.trim()).filter((tag) => tag.indexOf('snap-') === 0)
          for (let i = 0; i < tags.length; i += 100) {
            await rt.runShell(rt.scripts.purgeTagsScript(store, gitExe, tags.slice(i, i + 100)), { timeoutMs: 120000, stdoutMaxBytes: 4096 })
          }
          // purgeTagsScript 为幂等 best-effort，故必须回读校验，避免脚本吞掉
          // 个别失败后仍错误地把 index.json 清空。
          const remainedOutput = await rt.runShell(rt.scripts.listTagsScript(store, gitExe), { timeoutMs: 120000, stdoutMaxBytes: 4194304 })
          const remained = rt.scripts.stripBom(remainedOutput).split(/\r?\n/).map((tag) => tag.trim()).filter((tag) => tag.indexOf('snap-') === 0)
          if (remained.length) throw new Error('仍有 ' + remained.length + ' 个快照 tag 未删除')

          // tag 清理被确认后才清空索引。直接写已枚举的 store，兼容 root.txt
          // 缺失/错位的旧仓库；不能调用 saveIndex(root)，后者会重新按 root 寻址。
          await rt.writeTextViaShell(store.dir + (rt.isWin ? '\\' : '/') + 'index.json', '[]')
          for (const tag of tags) state.snapshots.delete(tag.slice('snap-'.length))
          if (root) {
            for (const [id, snap] of state.snapshots.entries()) {
              if (snap && snap.root === root) state.snapshots.delete(id)
            }
            state.indexLoaded.add(root)
          }
          deleted += tags.length
          clearedStores += 1
        } catch (error) {
          failed += 1
          rt.recordError('recall delete all failed for ' + store.dir + ': ' + String(error))
        }
      }
      // list 既合并内存也 dump 磁盘；无论完全/部分完成都必须失效，才能让
      // 成功删除的 store 立即从树上消失，而失败 store 仍保留供用户重试。
      listCache.items = null
      usageCache.payload = null
      return { deleted, stores: clearedStores, failed }
    })
  }

  return {
    'exclude-get': async () => {
      // 设置页「撤回设置」标签的配置读取。不支持平台照常短路：Client
      // 显示不可用提示而不是空白表单，与 init 的 notice 语义对齐。
      if (!supported) return { ok: false, unsupported: true }
      // 30s 结果缓存：首次进入要 resolveStore 链 + 读取，二次打开/切标签
      // 不应重复付出这份代价；exclude-set 写入后失效。
      if (excludeCache.payload && Date.now() - excludeCache.at < 30000) return excludeCache.payload
      const byFile = await listExcludeFiles()
      // PF-8：一条脚本 base64 读全部 exclude 文件——原每文件一条 Get-Content/
      // cat 进程是首开 4-6 条链路里的大头；内容走 base64 对任意用户文本
      // 免疫（定界不会被内容行打乱），parse 失败/文件缺失按空内容处理
      // （与原 readExclude 对不存在文件输出空串的语义一致）。
      let contents = new Map()
      try {
        const text = rt.scripts.stripBom(await rt.runShell(rt.scripts.excludeDumpScript(Array.from(byFile.keys())), { stdoutMaxBytes: 1048576 }))
        contents = parseExcludeDump(text)
      } catch (error) { /* dump 失败退回空内容列表（读失败的原语义） */ }
      const payload = {
        ok: true,
        files: Array.from(byFile.entries()).map(([path, info]) => ({
          path,
          home: Boolean(info.store.home),
          roots: info.roots,
          content: contents.get(path) || ''
        }))
      }
      excludeCache.at = Date.now()
      excludeCache.payload = payload
      return payload
    },

    'exclude-set': async (args) => {
      if (!supported) return { ok: false, unsupported: true }
      const path = args && args.path ? String(args.path) : ''
      const content = args && typeof args.content === 'string' ? args.content : ''
      // 路径白名单：重新枚举当前已知 exclude 文件并要求精确命中，
      // 客户端伪造的任意路径在这里被拒（见 listExcludeFiles 注释）
      const byFile = await listExcludeFiles()
      const info = byFile.get(path)
      if (!info) return { ok: false, code: E.RECALL_UNKNOWN_PATH, message: '未知的排除文件路径' }
      await snaps.writeExclude(info.store, content)
      // 写入后立即失效：设置页保存后刷新必须看到最新内容
      excludeCache.payload = null
      return { ok: true }
    },

    // 设置页「插件配置」卡片读配置：resolved 全量值 + 用户已覆盖字段 + env
    // 锁定字段（环境变量优先级最高）+ 可写性（只读 provider 禁存）。
    'config-get': async () => {
      const envLocks = {
        gcSnaps: Boolean(process.env && process.env.DSH_RECALL_GC_SNAPS),
        gcHours: Boolean(process.env && process.env.DSH_RECALL_GC_HOURS),
      }
      let overridden = {}
      let writable = false
      try {
        const settings = ctx.get('settings')
        if (settings && typeof settings.describe === 'function') {
          const list = settings.describe()
          const ours = (Array.isArray(list) ? list : []).find((d) => d && d.ns === 'dsh-recall')
          if (ours && ours.user && typeof ours.user === 'object') overridden = ours.user
          writable = settings.writable !== false
        }
      } catch (error) { /* describe 不可用按「无覆盖」处理 */ }
      return {
        ok: true,
        values: {
          gcSnaps: cfg.gcSnaps,
          gcHours: cfg.gcHours,
          maxFileBytes: cfg.maxFileBytes,
          maxSnapshotsPerWorkspace: cfg.maxSnapshotsPerWorkspace,
          baseExcludes: cfg.baseExcludes.slice(),
          refillDraft: cfg.refillDraft,
          snapshotEnabled: cfg.snapshotEnabled,
          archiveOriginal: cfg.archiveOriginal,
          retentionDays: cfg.retentionDays,
        },
        overridden,
        envLocks,
        writable,
      }
    },

    // 设置页「插件配置」卡片存配置：白名单字段 + 类型清洗后经 settings.update
    // 写进用户层，watch 链路把新值热更新进 cfg，无需重启。
    'config-set': async (args) => {
      const patch = args && args.patch && typeof args.patch === 'object' ? args.patch : {}
      const clean = {}
      if (patch.gcSnaps !== undefined) clean.gcSnaps = Number(patch.gcSnaps)
      if (patch.gcHours !== undefined) clean.gcHours = Number(patch.gcHours)
      if (patch.maxFileBytes !== undefined) clean.maxFileBytes = Number(patch.maxFileBytes)
      if (patch.maxSnapshotsPerWorkspace !== undefined) {
        const n = Number(patch.maxSnapshotsPerWorkspace)
        // 0 或负值 = 不限制（schema 由 number 校验，非法 NaN 在 settings.write 层被拒）
        if (!Number.isFinite(n)) return { ok: false, code: E.RECALL_BAD_TYPE, message: '快照总量上限必须是数字' }
        clean.maxSnapshotsPerWorkspace = Math.max(0, n)
      }
      if (patch.refillDraft !== undefined) clean.refillDraft = Boolean(patch.refillDraft)
      if (patch.snapshotEnabled !== undefined) clean.snapshotEnabled = Boolean(patch.snapshotEnabled)
      if (patch.archiveOriginal !== undefined) clean.archiveOriginal = Boolean(patch.archiveOriginal)
      if (patch.retentionDays !== undefined) {
        const n = Number(patch.retentionDays)
        // 0/负值 = 不启用（schema 校验 base 由 number 承担，NaN 由 settings.write 拒）
        if (!Number.isFinite(n) || n < 0) return { ok: false, code: E.RECALL_BAD_TYPE, message: '保留天数必须是 >= 0 的数字（0 表示不启用）' }
        clean.retentionDays = Math.trunc(n)
      }
      if (patch.baseExcludes !== undefined) {
        if (!Array.isArray(patch.baseExcludes)) return { ok: false, code: E.RECALL_BAD_TYPE, message: 'baseExcludes 必须是字符串数组' }
        clean.baseExcludes = patch.baseExcludes.filter((p) => typeof p === 'string' && p.trim())
      }
      if (!Object.keys(clean).length) return { ok: false, code: E.RECALL_EMPTY_PATCH, message: '没有可写入的配置字段' }
      let settings = null
      try { settings = ctx.get('settings') } catch (error) { settings = null }
      if (!settings || typeof settings.update !== 'function') {
        return { ok: false, code: E.RECALL_SETTINGS_UNAVAILABLE, message: '设置服务不可用：请在 profile 的 cordis.patch.yml 按 id: recall 覆盖配置' }
      }
      try {
        await settings.update('dsh-recall', clean)
      } catch (error) {
        return { ok: false, code: E.RECALL_SETTINGS_WRITE_FAILED, message: '配置写入失败：' + String(error && error.message ? error.message : error) }
      }
      return { ok: true }
    },

    // 设置页「快照管理」卡片：列表 / 磁盘占用 / 单条删除 / 手动 gc。
    // 全部走串行队列——删除 tag 与 gc 与快照争的是同一个 git 仓库。
    'manage': async (args) => {
      if (!supported) return { ok: false, unsupported: true }
      const op = args && args.op ? String(args.op) : 'list'
      const sessionId = args && args.sessionId ? String(args.sessionId) : null
      if (op === 'list') {
        const limitRaw = args && args.limit !== undefined ? Number(args.limit) : 200
        const safeLimit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 200, 1), 2000)
        // PF-6：缓存非空且（fresh 或 stale）→ 立即用旧 items 应答，对话中
        // 打开快照管理不再等全量 dump（30s TTL 曾被每条消息的清空形同虚设）。
        // stale 时后台刷新（in-flight 去重），Client 凭 stale 标记静默再拉
        // 一次渐进补新。缓存为空 → 同步 dump（首开现状）。
        if (listCache.items && (Date.now() - listCache.at < 30000 || listCache.stale)) {
          const stale = Boolean(listCache.stale)
          if (stale) refreshListCacheInBackground()
          return { ok: true, items: listCache.items.slice(0, safeLimit), total: listCache.items.length, stale }
        }
        const allItems = await buildListItems()
        listCache.at = Date.now()
        listCache.items = allItems
        listCache.stale = false
        return { ok: true, items: allItems.slice(0, safeLimit), total: allItems.length }
      }
      if (op === 'titles') {
        // supported 已在 manage 入口短路（A3：此处重复检查是死代码）
        const ids = Array.from(new Set(
          (Array.isArray(args && args.sessionIds) ? args.sessionIds.map(String) : []).filter(Boolean)
        )).slice(0, 100)
        const out = {}
        // 并发限 4：冷标题 readSession 是重 IO，限制后列表不受影响、标题渐进补齐
        await runLimited(ids.map((sid) => async () => {
          if (out[sid] !== undefined) return
          let title = liveTitleFast(sid)
          if (title === null) {
            const query = ctx.get('sessionQuery')
            if (query && typeof query.readSession === 'function') {
              try {
                const log = await query.readSession(sid)
                title = titleFromEvents(log && log.events)
              } catch (error) { title = null }
            }
          }
          sessionTitles.set(sid, title)
          out[sid] = title
        }), 4)
        return { ok: true, titles: out }
      }
      if (op === 'messages') {
        // supported 已在 manage 入口短路（A3：此处重复检查是死代码）
        const reqs = Array.isArray(args && args.requests) ? args.requests.slice(0, 200) : []
        const bySession = new Map()
        for (const r of reqs) {
          const sid = r && r.sessionId ? String(r.sessionId) : null
          const mid = r && r.messageId ? String(r.messageId) : null
          if (!sid || !mid) continue
          if (!bySession.has(sid)) bySession.set(sid, [])
          bySession.get(sid).push(mid)
        }
        const texts = {}
        await runLimited(Array.from(bySession.entries()).map(([sid, mids]) => async () => {
          // 该会话所有消息都已缓存（含 null）时，不必 readSession 冷读
          const allCached = mids.every((mid) => messageTexts.has(String(sid) + '\u0000' + String(mid)))
          let log = null
          if (!allCached) {
            const query = ctx.get('sessionQuery')
            if (query && typeof query.readSession === 'function') {
              try {
                log = await query.readSession(sid)
              } catch (error) { log = null }
            }
          }
          for (const mid of mids) {
            const key = String(sid) + '\u0000' + String(mid)
            // 缓存命中（含 null）直接复用，避免已确认无文本的消息反复冷读
            if (messageTexts.has(key)) {
              texts[mid] = messageTexts.get(key)
              continue
            }
            let text = liveMessageTextFast(sid, mid)
            if (text === null && log && Array.isArray(log.events)) {
              text = messageTextFromEvents(log.events, mid)
            }
            messageTexts.set(key, text)
            texts[mid] = text
          }
        }), 4)
        return { ok: true, messageTexts: texts }
      }
      if (op === 'usage') {
        // PF-3 顺带：全量 usage 结果 30s TTL（与 listCache 同款，删除/gc 后
        // 由调用点失效）——ManageCard 每次 refresh 都重算的话，枚举再快
        // 也是白付。仅缓存无 sessionId 的全量分支（client 唯一调用形态；
        // 单工作区分支无调用方，不值得引入 key 维度）。
        if (!sessionId && usageCache.payload && Date.now() - usageCache.at < 30000) {
          return usageCache.payload
        }
        let bytes = 0
        let homeStores = 0
        let fallbackStores = 0
        if (sessionId) {
          const root = await rt.resolveRoot(sessionId)
          if (!root) return { ok: false, code: E.RECALL_NO_ROOT, message: '无法解析当前工作区' }
          const store = state.stores.get(root)
          if (!store) return { ok: false, code: E.RECALL_NO_STORE, message: '当前工作区尚未创建快照存储' }
          if (store.home) homeStores++
          else fallbackStores++
          const out = await rt.runShell(rt.scripts.diskUsageScript(store.dir), { stdoutMaxBytes: 4096 })
          bytes = parseInt(rt.scripts.stripBom(out).trim(), 10) || 0
        } else {
          // PF-3 顺带：多 store 并行——读操作不碰 index.lock，但为防极端
          // 磁盘争抢仍走 runLimited（并发 4）而不是裸 Promise.all；单 store
          // 失败跳过的既有语义不变。
          const knownStores = Array.from(state.stores.values()).filter((s) => s && s.dir)
          const perStore = new Map()
          await runLimited(knownStores.map((store) => async () => {
            try {
              const out = await rt.runShell(rt.scripts.diskUsageScript(store.dir), { stdoutMaxBytes: 4096 })
              perStore.set(store.dir, parseInt(rt.scripts.stripBom(out).trim(), 10) || 0)
            } catch (error) { /* 单 store 失败跳过 */ }
          }), 4)
          for (const store of knownStores) {
            if (store.home) homeStores++
            else fallbackStores++
            bytes += perStore.get(store.dir) || 0
          }
        }
        const payload = { ok: true, bytes, gitAvailable: state.gitExe !== '', homeStores, fallbackStores }
        if (!sessionId) {
          usageCache.at = Date.now()
          usageCache.payload = payload
        }
        return payload
      }
      if (op === 'delete') {
        const scope = args && args.scope ? String(args.scope) : 'snapshot'
        const root = args && args.root ? String(args.root) : null
        const targetSessionId = args && args.sessionId ? String(args.sessionId) : null
        const id = args && args.messageId ? String(args.messageId) : ''
        if (scope === 'workspace') {
          if (!root) return { ok: false, code: E.RECALL_NO_ROOT, message: '缺少工作区路径' }
          const deleted = await deleteSnapshotsByFilter((rec) => rec.root === root, sessionId)
          return { ok: true, deleted }
        }
        if (scope === 'session') {
          if (!targetSessionId) return { ok: false, code: E.RECALL_NO_SESSION, message: '缺少会话 ID' }
          // 树形中会话挂在具体工作区下，客户端会传 root 限定范围；不传则保持
          // 旧语义（删该会话全部工作区的快照），兼容老调用方。
          const deleted = await deleteSnapshotsByFilter(
            (rec) => rec.sessionId === targetSessionId && (!root || rec.root === root),
            sessionId
          )
          return { ok: true, deleted }
        }
        // 管理列表来自磁盘（跨工作区全量），而内存 state.snapshots 只含当前
        // 工作区 + 预热过的——冷启动时列表里有、内存里没有，只查内存会误报
        // 「不存在」。解析链：内存命中 → Client 透传的条目 root → 磁盘 index 反查。
        let snap = state.snapshots.get(id) || null
        let snapRoot = snap ? snap.root : root
        let store = null
        if (snapRoot) {
          try { store = await rt.resolveStore(snapRoot) } catch (error) { store = null }
        }
        if (!store) {
          // 兜底：扫 home 容器与降级目录的 index.json，找到含该 id 的 store
          const found = await locateSnapshotOnDisk(id)
          if (found) { store = found.store; snapRoot = found.root }
        }
        if (!store) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: '该快照不存在' }
        const finalStore = store
        const finalRoot = snapRoot
        await enqueue(async () => {
          if (state.gitExe) {
            await rt.runShell(rt.scripts.purgeTagsScript(finalStore, state.gitExe, ['snap-' + id]), { timeoutMs: 120000, stdoutMaxBytes: 4096 })
          }
          // 兜底路径到这里时内存可能还没载入过该 root 的索引——先 loadIndex
          // 补齐内存视图，再删目标条目后重写，避免用残缺内存覆盖同 store
          // 其余磁盘快照。
          if (!state.indexLoaded.has(finalRoot)) {
            try { await snaps.loadIndex(finalRoot, sessionId) } catch (error) { /* 载入失败照常重写，退化为旧行为 */ }
          }
          state.snapshots.delete(id)
          await snaps.saveIndex(finalRoot, sessionId)
          // 列表缓存失效：Client 删除后会立刻 refresh，必须看到最新状态
          listCache.items = null
          usageCache.payload = null
        })
        return { ok: true }
      }
      if (op === 'deleteAll') {
        const result = await deleteAllSnapshots()
        if (result.failed > 0) {
          return {
            ok: false,
            code: E.RECALL_PARTIAL_DELETE,
            deleted: result.deleted,
            message: result.message || ('已删除 ' + result.deleted + ' 条快照，但有 ' + result.failed + ' 个存储未完成；请查看最近错误后重试')
          }
        }
        return { ok: true, deleted: result.deleted, stores: result.stores }
      }
      if (op === 'gc') {
        // 带会话上下文：只 gc 该会话的工作区；无上下文（设置卡片）：全部已知
        // store 逐个 gc。两者都排进串行队列，与快照互斥。
        const done = sessionId
          ? await enqueue(() => maint.runGc(sessionId, true))
          : await enqueue(() => maint.runGcAll())
        // gc 后占用显著下降：立即失效占用缓存，设置页 refresh 必须看到新值
        usageCache.payload = null
        return { ok: true, gc: Boolean(done) }
      }
      if (op === 'lineage') {
        // F1 / PF-4：返回全部已知工作区的 fork lineage（childId ↔ parentId
        // 撤回链），供快照管理树聚族。原实现对每个 root 串行 loadLineage
        // （每 root 一条进程，20 工作区 ≈ 10s，版本家族标记最后才亮）——
        // LINEAGE 段并入 storesDump 后一次 dump 全拿，零新增进程。dump 的
        // ==DIR 就是磁盘 store 目录（比 roots 全集更全，还免去对未知 root
        // resolveStore 建目录的副作用）；无 LINEAGE 段的旧输出按空 lineage
        // 处理（parseStoresDump 容错）。
        const hints = new Map()
        for (const [root, st] of state.stores.entries()) {
          if (st && st.dir) hints.set(st.dir, root)
        }
        let dump
        try { dump = await dumpStores() } catch (error) { dump = new Map() }
        const out = []
        for (const info of dump.values()) {
          for (const e of info.lineage || []) out.push(e)
        }
        return { ok: true, lineage: out }
      }
      return { ok: false, code: E.RECALL_UNKNOWN_OP, message: '未知的管理操作: ' + op }
    },

    // 设置页「插件配置」卡片恢复默认：整段清空 user 层回组合 base——官方
    // settings RPC 的 replace 明确是「restoration/reset 路径」。老版本服务
    // 没有 replace 时降级 settings.update 写 DEFAULTS。
    'config-reset': async () => {
      let settings = null
      try { settings = ctx.get('settings') } catch (error) { settings = null }
      if (!settings || typeof settings.update !== 'function') {
        return { ok: false, code: E.RECALL_SETTINGS_UNAVAILABLE, message: '设置服务不可用：请在 profile 的 cordis.patch.yml 按 id: recall 覆盖配置' }
      }
      try {
        if (typeof settings.replace === 'function') {
          await settings.replace('dsh-recall', {})
        } else {
          await settings.update('dsh-recall', Object.assign({}, DEFAULTS, { baseExcludes: DEFAULTS.baseExcludes.slice() }))
        }
      } catch (error) {
        return { ok: false, code: E.RECALL_SETTINGS_WRITE_FAILED, message: '恢复默认失败：' + String(error && error.message ? error.message : error) }
      }
      // 重置后热更运行中的 cfg（与 config-set 同链路的 watch 触发，这里做
      // 双保险：descriptor 已变更，applyResolvedConfig 立即落地）
      applyResolvedConfig(readSettings())
      return { ok: true }
    }
  }
}
