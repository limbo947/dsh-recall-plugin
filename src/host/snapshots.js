/**
 * dsh-recall-plugin — 快照域（ctx 绑定的工厂，无模块级副作用）
 *
 * 职责：快照捕获（captureSnapshot）、索引落盘/载入/孤儿重建、
 * diff 清单（diffFor）、回退执行（rollbackFor）、会话切点解析
 * （resolveCutSeq）。依赖 store.js 的执行与存储层，脚本文本全部
 * 来自 rt.scripts（按平台选择的 scripts.pwsh.js / scripts.posix.js）。
 */

import * as E from './errors.js'
import { buildFeedbackError } from './diagnostics.js'

// ---- 纯逻辑（模块级导出，供 tests/unit 直接钉住；工厂内沿用同一实现）----

// 脚本侧 fail-open 跳过的路径（--ignore-errors 下无法索引的目录，如无
// 提交的嵌入式仓库）以「SNAP_SKIP <path>」行回传：这些路径不进快照，
// 撤回时既不恢复也不会被删，用户应当知道快照少了什么。
export function parseSkipped(out) {
  const skipped = []
  for (const line of String(out || '').split(/\r?\n/)) {
    if (line.indexOf('SNAP_SKIP ') === 0) skipped.push(line.slice('SNAP_SKIP '.length))
  }
  return skipped
}

// POSIX 侧 diff 输出是 TSV「kind<TAB>path」逐行（bash 模板不拼 JSON，
// 避免 jq 依赖与转义坑）；win32 侧是 ConvertTo-Json。这里按平台分叉解析。
export function parseChanges(text, isWin) {
  if (isWin) {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') return [parsed]
    return []
  }
  const out = []
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    out.push({ kind: line.slice(0, tab), rel: line.slice(tab + 1) })
  }
  return out
}

// PF-1：snapshotScript 输出中的 TREE 行（add -A 后的 index 树指纹）。
// execute 拿安全快照输出的指纹与 preview 指纹比对判 STALE；无该行的旧输出
// （脚本/Host 版本错位的理论场景）返回 null，调用侧跳过指纹校验。
export function parseTreeId(out) {
  for (const line of String(out || '').split(/\r?\n/)) {
    if (line.indexOf('TREE ') === 0) return line.slice(5).trim() || null
  }
  return null
}

// PF-1：diff 输出统一解析。脚本侧协议（见 scripts.*.js diffScript 注释）：
// win32 输出「TOTAL <n>」/「前 maxChanges 条 JSON」/「TREE <hash>」三段；
// POSIX 输出 TSV 逐行 + 末行「TREE <hash>」。标记行必须先剥离再交给
// parseChanges——win32 分支对整段文本 JSON.parse，标记行混入直接抛错。
// total 语义不变（全量条数）：win32 由 TOTAL 行回传（截断前移脚本侧），
// POSIX 无 TOTAL 行则取解析条数（不截断）。treeId 为 index 树指纹。
export function parseDiffOutput(text, isWin, maxChanges) {
  const lines = String(text || '').split(/\r?\n/)
  let total = null
  let treeId = null
  const body = []
  for (const line of lines) {
    if (line.indexOf('TREE ') === 0) { treeId = line.slice(5).trim() || null; continue }
    if (line.indexOf('TOTAL ') === 0) {
      const n = parseInt(line.slice(6), 10)
      if (Number.isFinite(n) && n >= 0) total = n
      continue
    }
    body.push(line)
  }
  const raw = body.join('\n').trim()
  const all = raw ? parseChanges(raw, isWin) : []
  const finalTotal = total !== null ? total : all.length
  const changes = all.slice(0, maxChanges)
  return { changes, total: finalTotal, truncated: finalTotal > changes.length, treeId }
}

// 在事件序列里找“该消息之前最近一次 turn/end 的 seq”。
export function scanCutSeq(events, messageId) {
  let anchor = -1
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e && e.type === 'user/message' && e.data && String(e.data.id) === String(messageId)) {
      anchor = i
      break
    }
  }
  if (anchor < 0) return null
  for (let i = anchor - 1; i >= 0; i--) {
    const e = events[i]
    if (e && e.type === 'turn/end' && typeof e.seq === 'number') return e.seq
  }
  return null
}

// H1：回退失败后的救援编排（模块级纯逻辑，deps 注入副作用，供单测钉三分支）。
// rollbackFor 失败（partial=true，工作区可能半回退）时，execute 已先打下
// pre-rollback-<ts> 安全快照（见 index.js）；snapshotScript 打 tag 无条件加
// snap- 前缀，实际 tag 名是 snap-pre-rollback-<ts>——这里在调用侧拼出完整
// tag 再传给 rescueScript（F-S1：前缀知识留在唯一知道 safetyId 语义的编排
// 层，rescueScript 保持通用只接受完整 tag 名）。rescue 本身幂等：即使
// rollback 实际未动工作区，reset 到安全快照也只是把工作区恢复成回退前
// （≈当前）状态。无安全快照（safety 快照当时失败）时退化为现状 fail-loud，
// 不静默。
export async function rescueRollback(deps, opts) {
  const { root, store, safetyId, safetyOk, rollbackError } = opts
  const reason = String(rollbackError || '未知原因')
  if (!safetyOk) {
    deps.recordError('recall rollback failed, no rescue snapshot: ' + reason)
    return { ok: false, code: E.RECALL_ROLLBACK_FAILED, message: '回退失败：' + reason + '（无可用安全快照，工作区可能处于半回退状态）' }
  }
  const tag = 'snap-' + safetyId
  // 手动恢复命令供用户复制执行：路径加引号让含空格的工作区路径可直接跑，
  // 目标与 rescueScript 同用完整 tag 名（两条路必须指向同一个快照）。
  const manual = 'git --git-dir="' + store.git + '" --work-tree="' + root + '" reset --hard ' + tag
  try {
    const out = await deps.runShell(deps.scripts.rescueScript(root, store, deps.gitExe, tag), { timeoutMs: 600000, stdoutMaxBytes: 65536 })
    // RESCUE_OK 哨兵校验（与 rollbackFor 的 ROLLBACK_OK 对称）：pwsh 对
    // native 非零退出不抛，脚本模板里虽有 $LASTEXITCODE 显式 throw 兜底，
    // 但「脚本跑完、git 静默未生效」的假成功只能靠哨兵识别——哨兵缺失按
    // 救援失败处理，走手动命令分支，不静默。
    if (String(out || '').indexOf('RESCUE_OK') < 0) throw new Error('rescue 脚本未输出 RESCUE_OK 哨兵')
    deps.recordError('recall rollback failed, rescued to safety tag: ' + tag + ' — ' + reason)
    return { ok: false, code: E.RECALL_ROLLBACK_FAILED, message: '回退失败：' + reason + '；已自动恢复到回退前的安全快照，请重新预览后重试' }
  } catch (rescueError) {
    const rescueReason = String(rescueError && rescueError.message ? rescueError.message : rescueError)
    deps.recordError('recall rollback failed and rescue failed: ' + tag + ' — ' + reason + ' | rescue: ' + rescueReason)
    return { ok: false, code: E.RECALL_ROLLBACK_FAILED, message: '回退失败：' + reason + '；自动恢复也失败，请手动执行：' + manual }
  }
}

// F-G1：safety 快照 id 识别（模块级纯逻辑，rebuildOrphans 与 manage list
// 共用同一谓词）。安全 tag 是回退前自动打下的救援锚点（pre-rollback-<ts>，
// 见 routes-core.js execute），不是消息快照——不进索引、不在列表展示。
// 消息 ID 为系统生成 GUID，前缀碰撞概率为零（plan-competitor-fixes F-G1 风险节）。
export function isSafetySnapshotId(id) {
  return typeof id === 'string' && id.indexOf('pre-rollback-') === 0
}

// listTagsWithTimeScript 输出解析（模块级纯逻辑，便于单测）：每行
// 「<tag名> <秒级时间戳>」，for-each-ref 的 refname 不含空格、时间戳
// 恒为行尾整数。时间解析失败/缺省回退 null——调用方以 0 兜底（保留
// 旧「无时间」行为），绝不因格式漂移丢 tag。
export function parseTagsWithTime(text) {
  const out = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const sp = t.lastIndexOf(' ')
    const name = sp > 0 ? t.slice(0, sp) : t
    const ts = sp > 0 ? parseInt(t.slice(sp + 1), 10) : NaN
    out.push({ name, time: Number.isFinite(ts) && ts > 0 ? ts * 1000 : null })
  }
  return out
}

// ---- 配置工厂 ----

export function createSnapshots(ctx, rt, config) {
  const sessions = ctx.sessions
  const state = rt.state
  // 平台选择的脚本模板（rt.scripts = scripts.pwsh.js / scripts.posix.js）：
  // 两套导出同名接口但实现分属 pwsh/bash，所有调用统一走 S.*
  const S = rt.scripts
  // 基础排除表随调用透传给脚本模板（用户 config 可调，即时生效）
  // 运行时读取而非创建时快照：设置卡片热更新 baseExcludes 后，
  // 下一次快照/diff/回退立即按新排除表执行
  const BASE = () => config.baseExcludes

  // 连续失败熔断（issue #7）：失败快照的重试既无谓地全量扫描工作区，
  // 又持续写入无 tag 可达的残骸对象（实测一个下午 127GB）。连续
  // FUSE_AFTER 次失败后按 BASE 起步、指数翻倍、CAP 封顶的退避跳过
  // 快照——冷却期内的消息不产生快照点，换来磁盘与 CPU 止血；冷却期满
  // 自动重试，成功一次即全部复位，用户修好环境（如补排除配置）后
  // 无需任何手动干预。
  const FUSE_AFTER = 3
  const FUSE_BACKOFF_BASE_MS = 5 * 60 * 1000
  const FUSE_BACKOFF_CAP_MS = 60 * 60 * 1000
  const snapFailures = new Map()

  // 索引落盘：任意长度文本统一走 rt.writeTextViaShell（win32 base64
  // 分块 / POSIX stdin，实现见 store.js）——saveIndex 与 writeExclude
  // 曾逐字重复这套平台分叉，改一处漏一处的风险随合并消失。
  async function saveIndex(root, sessionId) {
    const store = state.stores.get(root)
    if (!store) return
    // 每条带 root：设置页「快照管理」要跨工作区展示列表，而 store 目录名
    // 是 root 的单向哈希、反解不了——index.json 是唯一能持久「哈希↔工作区
    // 路径」对应关系的地方。loadIndex 忽略 entry.root（以参数为准），
    // 旧版本插件读新索引也只取已知字段，双向兼容。
    // feedback 落盘（P1-2）：只对「需要解释」的消息写 feedback 字段（失败/
    // 有跳过），正常快照不带——省空间；重启后 snapshot-info 仍能解释
    // 「这条消息为什么没有/缺了快照」。与 root 字段当年的兼容策略一致：
    // 老版本插件读新索引忽略未知字段。
    const entries = Array.from(state.snapshots.entries())
      .filter(([, s]) => s.root === root)
      .map(([id, s]) => {
        const rec = { id, time: s.time, root: s.root, sessionId: s.sessionId }
        const fb = state.snapFeedback.get(id)
        if (fb && (fb.failed || (Array.isArray(fb.skipped) && fb.skipped.length))) rec.feedback = fb
        return rec
      })
    try {
      await rt.writeTextViaShell(store.dir + (rt.isWin ? '\\' : '/') + 'index.json', JSON.stringify(entries))
    } catch (error) {
      rt.recordError('recall saveIndex failed: ' + String(error))
    }
  }

  async function loadIndex(root, sessionId) {
    if (state.indexLoaded.has(root)) return
    const store = state.stores.get(root)
    if (!store) return
    let raw = ''
    let truncated = false
    try {
      const meta = await rt.runShellMeta(S.indexReadCmd(store.dir), { stdoutMaxBytes: 4194304 })
      raw = S.stripBom(meta.text).trim()
      truncated = Boolean(meta.truncated)
    } catch (error) {
      // 读索引失败（shell 未就绪等）：不标记已载入，下次自然重试（既有语义）
      return
    }
    if (truncated) {
      // F-G3：读截断 ≠ 索引损坏。stdout 超 4MB 上限时官方 shell 只回传流
      // 尾部（runShellMeta 暴露的 CollectedOutput.truncated 可判定），JSON
      // 头已丢，parse 必失败——若走下方损坏分支会把好文件改名 .corrupt，
      // 索引记录（time/sessionId/feedback）全丢、rebuild 后变 time=0 条目
      // 又触发清理链。改为：不隔离、原文件原样保留，按空索引继续（标记
      // indexLoaded 防止重试循环刷错误环），本次绝不写回（防用残缺内存
      // 覆盖好文件）；下一次自然写索引时按当下内存状态覆盖，tag 是真相源，
      // 孤儿重建随时可反推兜底。4MB ≈ 每条约 100B × 4 万条，
      // maxSnapshotsPerWorkspace=0（不限）的长期工作区可能触达——上限即
      // 天花板的取舍记录于此。
      // PF-5：同时记 indexTruncated——init/预热紧接的 rebuildOrphans 若不
      // 知情，会把全部 tag 判成孤儿（内存为空）并全量重写索引，用残缺孤
      // 儿集覆盖完好的大索引（现有代码的真实隐患）。rebuildOrphans 对该
      // root 整体跳过。
      rt.recordError('recall index read truncated: ' + root + ' 的 index.json 超过读取上限，按空索引继续（原文件未改动，下次写索引自然覆盖）')
      state.indexLoaded.add(root)
      state.indexTruncated.add(root)
      return
    }
    if (!raw) { state.indexLoaded.add(root); return }
    let entries = null
    try {
      entries = JSON.parse(raw)
    } catch (error) {
      // H2：索引损坏 fail-loud——坏文件改名 .corrupt-<ts> 保留现场 + 记错误，
      // 按空索引继续（rebuildOrphans 从 tag 名反推重建，数据不丢），不再静默当空。
      if (await quarantineCorruptIndex(store)) state.indexLoaded.add(root)
      return
    }
    if (!Array.isArray(entries)) {
      // H2：整体形状非法（非数组）同样按损坏处理，保留现场。
      if (await quarantineCorruptIndex(store)) state.indexLoaded.add(root)
      return
    }
    let invalid = 0
    for (const entry of entries) {
      // H2：逐条过滤非法条目（非对象 / 缺 string id / 空 id——A6：空串 id
      // 是垃圾条目，进索引会让 snapshot-info 与回退按空主键查找）并计数告警，
      // 整体不判死；root/time 的宽松兼容保留（root 以参数为准、time 缺省回退
      // now）——那是旧索引双向兼容策略，不属「损坏」。
      if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id) { invalid++; continue }
      state.snapshots.set(entry.id, {
        root,
        time: typeof entry.time === 'number' ? entry.time : Date.now(),
        sessionId: entry.sessionId || sessionId
      })
      // feedback 回填（P1-2）：重启后仍能解释「这条消息为什么没有/缺了
      // 快照」。复用 setFeedback 落内存（保持 FIFO 上限），只回填「需要
      // 解释」的记录；旧版索引无 feedback 字段时天然跳过。kind（M1 环境错误
      // 分类）随对象保留——序列化是整体对象，但这里的重建是字段白名单，
      // 漏 kind 会让重启后的失败条目丢失分类、status hint 失效。
      const fb = entry.feedback
      if (fb && typeof fb === 'object') {
        const rec = {}
        if (fb.failed) {
          rec.failed = true
          if (typeof fb.error === 'string') rec.error = fb.error
          if (typeof fb.kind === 'string') rec.kind = fb.kind
        }
        if (Array.isArray(fb.skipped)) rec.skipped = fb.skipped.filter((p) => typeof p === 'string')
        if (rec.failed || (Array.isArray(rec.skipped) && rec.skipped.length)) setFeedback(entry.id, rec)
      }
    }
    if (invalid > 0) rt.recordError('recall index has ' + invalid + ' invalid entries for: ' + root)
    // 只在读取链路全部走通后才标记已载入：若在 try 前抢先标记，
    // runShell 失败（shell 未就绪等）被吞后该 root 本次进程内被永久
    // 视为「已载入」，索引永远为空、撤回按钮消失直到重启 DSH。
    // PF-5：healthy 单独标记（≠indexLoaded）——只有「磁盘索引确实在场且
    // 解析成功」才允许 rebuildOrphans 跳过；空索引/损坏隔离/读失败都不标。
    state.indexLoaded.add(root)
    state.indexHealthy.add(root)
  }

  // A5：quarantine 失败告警节流（每 store 5 分钟最多一条）。rename 失败时
  // indexLoaded 不标记 → 下次 loadIndex 重试 → 再失败会再告警，同一环境性
  // 故障（权限/磁盘）会把最近错误环（20 条）瞬间刷满；节流保留告警存在性
  // 同时防刷屏。Map 挂工厂闭包而非模块级（HMR 假设）。
  const quarantineThrottle = new Map()
  function quarantineErrorThrottled(store, text) {
    const last = quarantineThrottle.get(store.dir) || 0
    if (Date.now() - last < 5 * 60 * 1000) return
    quarantineThrottle.set(store.dir, Date.now())
    rt.recordError(text)
  }

  // H2：损坏索引现场保留——改名 index.json.corrupt-<ts> 而非删除，供排障；
  // 改完名原路径即空，下次 loadIndex 读到空按「无索引」处理，不重复告警。
  // 返回是否改名成功：失败时不标记 indexLoaded，下次重试而非让坏文件被跳过。
  async function quarantineCorruptIndex(store) {
    const sep = rt.isWin ? '\\' : '/'
    const corrupt = store.dir + sep + 'index.json.corrupt-' + Date.now()
    try {
      await rt.runShell(S.renameFileCmd(store.dir + sep + 'index.json', corrupt), { stdoutMaxBytes: 4096 })
      rt.recordError('recall index corrupt: 已按空索引继续，坏文件保留为 ' + corrupt)
      return true
    } catch (error) {
      quarantineErrorThrottled(store, 'recall index quarantine failed: ' + String(error))
      return false
    }
  }

  // ---- F1 fork lineage 持久化 ----
  // 撤回多次产生 A→B→C 链，但中间版本归档后从 sessions.list 隐藏，client 侧
  // 拿不到完整父链——Host 在 client fork 上报时记录 childId↔parentId 到
  // store 目录的 lineage.json（原子写），快照管理树据此聚族展示「版本家族」。
  // lineage.json 损坏不致命（与 index.json 损坏 fail-loud 语义区分）：按无
  // lineage 处理，快照树退化为现有「工作区 → 会话」分组。
  async function loadLineage(root) {
    const store = state.stores.get(root)
    if (!store) return []
    try {
      const raw = S.stripBom(await rt.runShell(S.lineageReadCmd(store.dir), { stdoutMaxBytes: 1048576 })).trim()
      if (!raw) return []
      const arr = JSON.parse(raw)
      return Array.isArray(arr)
        ? arr.filter((e) => e && typeof e.childId === 'string' && typeof e.parentId === 'string')
        : []
    } catch (error) {
      return []
    }
  }

  async function recordLineage(root, childId, parentId) {
    const store = state.stores.get(root)
    if (!store) return
    const sep = rt.isWin ? '\\' : '/'
    const existing = await loadLineage(root)
    // 去重：同一 (childId, parentId) 只记一次（fork 幂等）
    if (!existing.some((e) => e.childId === childId && e.parentId === parentId)) {
      existing.push({ childId, parentId, time: Date.now() })
      try {
        await rt.writeTextViaShell(store.dir + sep + 'lineage.json', JSON.stringify(existing))
      } catch (error) {
        rt.recordError('recall recordLineage failed: ' + String(error))
      }
    }
  }

  // exclude.txt 原文读取（设置页编辑用）：stripBom 剥掉 PS 5.1 Set-Content
  // 写入的 UTF-8 BOM，避免设置页首行出现不可见的 \uFEFF；两套模板对缺失
  // 文件都输出空串，这里不用区分「没配过」和「配了空」。
  async function readExclude(store) {
    return S.stripBom(await rt.runShell(S.excludeReadCmd(store.excludeFile), { stdoutMaxBytes: 1048576 }))
  }

  // exclude.txt 原文写入（设置页保存）：先 mkdir 父目录兜底（home 根目录
  // /降级 store 目录被用户手滑删掉时，保存不该因此失败），写本体统一走
  // rt.writeTextViaShell，与 saveIndex 共用同一套平台分叉原语。
  async function writeExclude(store, text) {
    const body = String(text == null ? '' : text)
    const sep = rt.isWin ? '\\' : '/'
    const parent = store.excludeFile.slice(0, store.excludeFile.lastIndexOf(sep))
    await rt.runShell(S.mkdirScript(parent), { stdoutMaxBytes: 4096 })
    await rt.writeTextViaShell(store.excludeFile, body)
  }

  // 索引丢失时从仓库 tag 重建：tag 名 snap-<messageId> 本身就是快照主键
  // PF-5 四档守卫（init/预热提速，每 root 省 1+N 条进程）：
  // - truncated → 整体跳过且不写盘：内存是残缺视图，rebuild 会把全部 tag
  //   判成孤儿并用残缺孤儿集覆盖完好的大索引（F-G3 隐患，本守卫根治）；
  // - healthy 且该 root 条目 > 0 → 跳过：索引确实在场，tag↔index 脱节的
  //   窗口只在 saveIndex 落盘失败时出现，该失败本身走 recordError 且下次
  //   saveIndex 自然补写（文档语义安全论证）；条目为 0 的 healthy 不跳
  //   （合法「磁盘有 tag、索引为空」态仍需重建）；
  // - empty/quarantined/读失败（都不标 healthy）→ 照跑，自愈链路完整。
  async function rebuildOrphans(root, sessionId) {
    if (state.indexTruncated.has(root)) return
    if (state.indexHealthy.has(root)) {
      let count = 0
      for (const s of state.snapshots.values()) {
        if (s && s.root === root) count++
      }
      if (count > 0) return
    }
    const store = state.stores.get(root)
    const gitExe = await rt.resolveGit()
    if (!store || !gitExe) return
    try {
      // 带时间戳清单（listTagsWithTimeScript）：重建条目从 tag 的
      // creatordate 恢复 time——此前只列 tag 名，重建条目一律 time=0，
      // 管理列表时间前缀缺失、retention/limits 按「最旧」误清真实快照。
      const listing = S.stripBom(await rt.runShell(S.listTagsWithTimeScript(store, gitExe), { stdoutMaxBytes: 4194304 })).trim()
      if (!listing) return
      for (const { name, time } of parseTagsWithTime(listing)) {
        const id = name.replace(/^snap-/, '')
        // F-G1：安全 tag（snap-pre-rollback-<ts>）只作救援锚点，不进索引——
        // 否则被 rebuild 成 time=0 条目后会进快照管理列表、占
        // maxSnapshotsPerWorkspace 配额、被 retention/limits 当「最旧」优先
        // 清掉，H1 的救援点在重度使用下会随 purge 消失（与 routes-core.js
        // execute「不进 index.json、列表不展示」的设计承诺对齐）。
        if (!id || isSafetySnapshotId(id) || state.snapshots.has(id)) continue
        state.snapshots.set(id, { root, time: time || 0, sessionId })
      }
      await saveIndex(root, sessionId)
    } catch (error) {
      rt.recordError('recall rebuildOrphans failed: ' + String(error))
    }
  }

  async function captureSnapshot(sessionId, messageId, time) {
    const root = await rt.resolveRoot(sessionId)
    if (!root) return
    // 熔断检查要在任何解析/建仓动作之前：冷却期内连 resolveStore 都
    // 不必跑，把失败重试的开销也一并止住
    const fused = snapFailures.get(root)
    if (fused && Date.now() < fused.skipUntil) return
    let store = await rt.resolveStore(root)
    store = await rt.tryUpgradeToHome(root)
    // ensureGit 失败（issue #11 主线缺口）：原先静默 return，不进
    // snapFeedback，客户端空轮询 20 次后放弃、用户零感知。现在走与
    // snapshotScript 失败相同的反馈通道——buildFeedbackError 把原始
    // stderr 分类成可行动提示（锁冲突/磁盘满等），客户端轮询到 failed
    // 即弹「快照失败：<提示>」并停止轮询。不接熔断：环境类失败常可自愈
    // （清磁盘/退锁后下一条消息即恢复），保持按消息重试，刷屏由
    // recordError 尾部去重与 toast 10min 节流缓解。
    const g = await rt.ensureGit(root, store)
    if (!g.ok) {
      setFeedback(messageId, { failed: true, ...buildFeedbackError(g.error || '未知原因') })
      return
    }
    await loadIndex(root, sessionId)
    try {
      const out = await rt.runShell(S.snapshotScript(root, store, state.gitExe, messageId, BASE()), { timeoutMs: 600000, stdoutMaxBytes: 65536 })
      snapFailures.delete(root)
      state.snapshots.set(String(messageId), { root, time: time || Date.now(), sessionId })
      await saveIndex(root, sessionId)
      setFeedback(messageId, { skipped: parseSkipped(out) })
    } catch (error) {
      rt.recordError('recall snapshot failed: ' + String(error))
      // 分类后的提示替代原始 stderr 直传（M1-D4）：识别为环境错误时给
      // 可行动文案，未识别时 buildFeedbackError 内部回落原文截断（保现状）
      setFeedback(messageId, { failed: true, ...buildFeedbackError(String(error)) })
      await handleSnapshotFailure(root, store)
    }
  }

  // 逐消息反馈写入（issue #7 失败可见性）：成功无跳过 → 清除（重试成功
  // 自愈）；失败/有跳过 → 记录。上限防泄漏：交替成功失败的长会话可以无限
  // 积累，Map 保插入序做 FIFO 淘汰。
  function setFeedback(messageId, rec) {
    const id = String(messageId)
    const keep = rec && ((rec.failed) || (Array.isArray(rec.skipped) && rec.skipped.length))
    if (keep) state.snapFeedback.set(id, rec)
    else state.snapFeedback.delete(id)
    if (state.snapFeedback.size > 200) state.snapFeedback.delete(state.snapFeedback.keys().next().value)
  }

  // snapshot-info 端点的反馈查询：优先逐消息记录；无记录但该 root 熔断中
  // 时反馈熔断状态（冷却期内的消息快照被静默跳过，客户端需要知道「不是
  // 还没好，是暂停了」）。客户端只对近 5 分钟的消息弹提示，历史消息查询
  // 不受影响。
  async function feedbackFor(sessionId, messageId) {
    const rec = state.snapFeedback.get(String(messageId || ''))
    if (rec) return rec
    if (!sessionId) return {}
    const root = await rt.resolveRoot(sessionId)
    if (root) {
      const f = snapFailures.get(root)
      if (f && Date.now() < f.skipUntil) {
        return { failed: true, error: '快照连续失败已暂停（熔断），约 ' + Math.ceil((f.skipUntil - Date.now()) / 60000) + ' 分钟后自动重试，详情见设置 · 插件配置 · 最近错误' }
      }
    }
    return {}
  }

  // 失败善后 = 清残骸 + 推进熔断。captureSnapshot 的调用方就是串行队列
  // （见 index.js 事件接线），这两个动作留在 catch 里顺势排队执行，
  // 与下一次快照天然互斥，无 git 锁竞态；自身整体 best-effort，
  // 清理失败不该让队列任务以异常收场。
  async function handleSnapshotFailure(root, store) {
    if (store && state.gitExe) {
      try {
        await rt.runShell(S.pruneScript(store, state.gitExe), { timeoutMs: 600000, stdoutMaxBytes: 4096 })
      } catch (error) {
        rt.recordError('recall prune after snapshot failure failed: ' + String(error))
      }
    }
    const f = snapFailures.get(root) || { count: 0, skipUntil: 0 }
    f.count++
    if (f.count >= FUSE_AFTER) {
      const backoff = Math.min(FUSE_BACKOFF_BASE_MS * 2 ** (f.count - FUSE_AFTER), FUSE_BACKOFF_CAP_MS)
      const wasFused = Date.now() < f.skipUntil
      f.skipUntil = Date.now() + backoff
      // 只在「未熔断→熔断」的跳变沿记录：熔断期间每条消息都会走上面的
      // 静默跳过分支，逐条记录会把最近错误环形缓冲刷成同一条目
      if (!wasFused) rt.recordError('recall snapshot fused after ' + f.count + ' consecutive failures, backoff ' + Math.round(backoff / 60000) + 'min for: ' + root)
    }
    snapFailures.set(root, f)
  }

  // 变更清单截断上限：防止超大工作区（几千个文件）把 DOM 与 JSON
  // 双双撑爆。清单对用户的价值集中在前若干条，其余以 truncated 计数
  // 汇总展示；total 保留完整计数让面板文案仍准确。
  const MAX_CHANGES = 500

  async function diffFor(messageId) {
    const snap = state.snapshots.get(String(messageId))
    if (!snap) return null
    const store = state.stores.get(snap.root)
    if (!store) return null
    // 8MB 上限：按平均每条 60 字节估算可容纳十余万条，正常项目远够；
    // 真超限时报错文案与「JSON 半截解析失败」的真实原因脱节，需显式检测
    const text = S.stripBom(await rt.runShell(S.diffScript(snap.root, store, state.gitExe, 'snap-' + messageId, BASE(), MAX_CHANGES), { timeoutMs: 600000, stdoutMaxBytes: 8388608 }))
    const trimmed = text.trim()
    if (!trimmed) return { changes: [], total: 0, truncated: false, treeId: null }
    // PF-1：解析下沉到 parseDiffOutput（标记行剥离 + 截断 + 树指纹），纯函数单测钉住
    return parseDiffOutput(trimmed, rt.isWin, MAX_CHANGES)
  }

  async function rollbackFor(messageId) {
    const snap = state.snapshots.get(String(messageId))
    if (!snap) return { ok: false, error: '该消息没有可用的项目快照' }
    const store = state.stores.get(snap.root)
    if (!store) return { ok: false, error: '快照存储不可用' }
    try {
      const text = S.stripBom(await rt.runShell(S.rollbackScript(snap.root, store, state.gitExe, 'snap-' + messageId, BASE()), { timeoutMs: 600000, stdoutMaxBytes: 65536 }))
      const m = text.trim().match(/^ROLLBACK_OK\s+(\d+)\s+(\d+)/)
      if (!m) {
        // 无 ROLLBACK_OK 哨兵：脚本在输出哨兵前终止，工作区状态不可知——
        // 一律按「可能半回退」处理，交给 execute 侧救援（H1）。
        return { ok: false, partial: true, error: '回退脚本未正常完成（工作区可能处于半回退状态）：' + text.slice(0, 300) }
      }
      const deleted = parseInt(m[1], 10)
      const restored = parseInt(m[2], 10)
      return { ok: true, count: (Number.isNaN(deleted) ? 0 : deleted) + (Number.isNaN(restored) ? 0 : restored) }
    } catch (error) {
      // runShell 抛错（脚本异常终止）：工作区同样可能半回退，交 execute 救援。
      const msg = String(error && error.message ? error.message : error)
      return { ok: false, partial: true, error: msg }
    }
  }

  // 解析“整段回退”的会话切点：优先读 live 会话的内存事件（零 IO、毫秒级），
  // 冷会话回退到 sessionQuery.readSession；结果按 (会话, 消息) 缓存——
  // 消息一旦入日志，其之前的 turn/end 永不变化，缓存终身有效。
  async function resolveCutSeq(sessionId, messageId) {
    if (!sessionId || !messageId) return null
    const cacheKey = String(sessionId) + '\u0000' + String(messageId)
    if (state.cutSeqCache.has(cacheKey)) return state.cutSeqCache.get(cacheKey)
    let result = null
    const live = sessions.get(sessionId)
    if (live && Array.isArray(live.events)) {
      result = scanCutSeq(live.events, messageId)
    } else {
      const query = ctx.get('sessionQuery')
      if (query) {
        try {
          const log = await query.readSession(sessionId)
          result = scanCutSeq(Array.isArray(log && log.events) ? log.events : [], messageId)
        } catch (error) {
          result = null
        }
      }
    }
    state.cutSeqCache.set(cacheKey, result)
    return result
  }

  return { saveIndex, loadIndex, readExclude, writeExclude, rebuildOrphans, captureSnapshot, diffFor, rollbackFor, resolveCutSeq, feedbackFor, loadLineage, recordLineage }
}
