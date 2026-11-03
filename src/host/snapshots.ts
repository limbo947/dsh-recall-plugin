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
import { buildArtifactRootSegment } from './exclude-patterns.js'
import type { Runtime, StoreInfo, SnapshotInfo } from '../types/state.js'
import type { SnapshotFeedback, LineageEntry, IndexEntry } from '../types/payloads.js'
import type { HostContext, SessionEvent, SessionQueryEngine } from '../types/dsh-contract.js'
import type { ResolvedConfig } from '../types/config.js'
import type { ErrorCode, DiffChange } from '../types/api.js'
import type { PwshScripts, PosixScripts } from '../types/scripts.js'

// ---- 纯逻辑（模块级导出，供 tests/unit 直接钉住；工厂内沿用同一实现）----

// 脚本侧 fail-open 跳过的路径（--ignore-errors 下无法索引的目录，如无
// 提交的嵌入式仓库）以「SNAP_SKIP <path>」行回传：这些路径不进快照，
// 撤回时既不恢复也不会被删，用户应当知道快照少了什么。
export function parseSkipped(out: unknown): string[] {
  const skipped: string[] = []
  for (const line of String(out || '').split(/\r?\n/)) {
    if (line.indexOf('SNAP_SKIP ') === 0) skipped.push(line.slice('SNAP_SKIP '.length))
  }
  return skipped
}

// issue #24：快照前置护栏标记。脚本在 add 之前遍历工作区统计「纳入总量」与
// 耗时，任一超限输出「SNAP_LIMIT <bytes|time> <实测> <上限>」后退出（不建
// 快照）。旧脚本无该行 → 返回 null，走原成功路径（升级期兼容）。
// issue #29：'scan' 不是脚本的 SNAP_LIMIT 输出，而是 host 把「统计失败」
// （SNAP_SCAN_FAIL）折成同一形状——两者都要走「停用该工作区 + 反馈」通道，
// 共用 TTL/配置变化重试逻辑，value 此时是 git 退出码、limit 恒 0。
export interface SnapshotLimit {
  kind: 'bytes' | 'time' | 'scan'
  value: number
  limit: number
}

export function parseSnapshotLimit(out: unknown): SnapshotLimit | null {
  for (const line of String(out || '').split(/\r?\n/)) {
    if (line.indexOf('SNAP_LIMIT ') !== 0) continue
    const parts = line.slice('SNAP_LIMIT '.length).trim().split(/\s+/)
    const kind = parts[0]
    if (kind !== 'bytes' && kind !== 'time') continue
    const value = parseInt(parts[1] ?? '', 10)
    const limit = parseInt(parts[2] ?? '', 10)
    if (!Number.isFinite(value) || !Number.isFinite(limit)) continue
    return { kind, value, limit }
  }
  return null
}

// issue #29：预算扫描失败的哨兵（ls-files 非零退出）。与 SNAP_LIMIT 同为
// 「本次不建快照」通道，区别是规模未知——一律按停用处理，绝不放行 add。
// 旧脚本无这两行 → 返回 null，走原成功路径（升级期兼容）。
export interface ScanFail {
  rc: number
  message: string
}

export function parseScanFail(out: unknown): ScanFail | null {
  let rc: number | null = null
  let message = ''
  for (const line of String(out || '').split(/\r?\n/)) {
    // 前缀长度含尾随空格：SNAP_SCAN_FAIL = 15、SNAP_SCAN_ERR = 14
    if (line.indexOf('SNAP_SCAN_FAIL ') === 0) {
      const n = parseInt(line.slice(15).trim(), 10)
      if (Number.isFinite(n)) rc = n
    } else if (line.indexOf('SNAP_SCAN_ERR ') === 0) {
      message = line.slice(14).trim()
    }
  }
  return rc === null ? null : { rc, message }
}

// 字节数的可读文本：≥1MB 用 MB，更小用 KB（避免「0 MB / 0 MB」这种
// 测试态/小工作区下无信息的文案）
function bytesText(bytes: number): string {
  if (bytes >= 1048576) return Math.round(bytes / 1048576) + ' MB'
  return Math.max(1, Math.round(bytes / 1024)) + ' KB'
}

// 停用说明（snapFeedback.error 直显 + 最近错误同文案）：≤140 字符、给出
// 可行动的出口（调大对应上限或补充排除表），修好后下一次快照自动恢复。
// 字节口径必须写明「已按 .gitignore 与排除表过滤」（issue #28）：不写会让人
// 以为工作区真的这么大，进而去调大上限——那反而把 gitignore 里的垃圾真的收进
// 对象库，与该护栏的初衷相反。
export function buildSnapshotLimitNotice(limit: SnapshotLimit): string {
  if (limit.kind === 'scan') {
    // 不嵌 stderr（含路径必被 140 字符截断成残句）：原因由「最近错误」承载
    return '无法统计该工作区的快照范围（git 退出码 ' + limit.value + '），本次快照已跳过；该工作区暂停快照约 10 分钟，修复后自动恢复，详情见「最近错误」'
  }
  if (limit.kind === 'bytes') {
    return '该工作区可纳入快照的文件总量超过上限（约 ' + bytesText(limit.value) + ' / ' + bytesText(limit.limit) + '，已按 .gitignore 与排除表过滤），已停用快照；可调大「工作区总量上限」或补充排除表后自动恢复'
  }
  return '快照前的文件扫描超过时间预算（约 ' + Math.max(1, Math.round(limit.value / 1000)) + ' 秒 / ' + Math.max(1, Math.round(limit.limit / 1000)) + ' 秒），已停用快照；可调大「扫描时间预算」或补充排除表后自动恢复'
}

// POSIX 侧 diff 输出是 TSV「kind<TAB>path」逐行（bash 模板不拼 JSON，
// 避免 jq 依赖与转义坑）；win32 侧是 ConvertTo-Json。这里按平台分叉解析。
export function parseChanges(text: string, isWin: boolean): DiffChange[] {
  if (isWin) {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') return [parsed]
    return []
  }
  const out: DiffChange[] = []
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
export function parseTreeId(out: unknown): string | null {
  for (const line of String(out || '').split(/\r?\n/)) {
    if (line.indexOf('TREE ') === 0) return line.slice(5).trim() || null
  }
  return null
}

// PF-1：diff 输出统一解析。脚本侧协议（见 scripts.*.js diffScript 注释）：
// win32 输出「COUNTS m r a」/「TOTAL <n>」/「前 maxChanges 条 JSON」/「TREE」；
// POSIX 输出 TSV 逐行 + 末行「TREE <hash>」。标记行必须先剥离再交给
// parseChanges——win32 分支对整段文本 JSON.parse，标记行混入直接抛错。
// total 语义不变（全量条数）：win32 由 TOTAL 行回传（截断前移脚本侧），
// POSIX 无 TOTAL 行则取解析条数（不截断）。treeId 为 index 树指纹。
// counts 必须覆盖全量：清单截断到 maxChanges 条，按清单统计的分类数会与
// total 打架（实测 3054 条只报「修改 448」）。拿不到可信全量计数时置 null，
// 面板据 null 隐去摘要——比展示一个错数字更诚实。
export interface DiffCounts {
  modified: number
  restored: number
  added: number
}
export interface DiffResult {
  changes: DiffChange[]
  total: number
  truncated: boolean
  treeId: string | null
  counts: DiffCounts | null
}
function countChanges(list: DiffChange[]): DiffCounts {
  const counts: DiffCounts = { modified: 0, restored: 0, added: 0 }
  for (const c of list) {
    if (c && Object.prototype.hasOwnProperty.call(counts, String(c.kind))) counts[c.kind as keyof DiffCounts]++
  }
  return counts
}
// COUNTS 行的三段必须都是非负整数才采信：任一损坏即视为缺席，避免把半截
// 输出当计数（进而与 total 对不上）
function parseCounts(line: string): DiffCounts | null {
  const parts = line.trim().split(/\s+/)
  if (parts.length !== 3) return null
  const m = parseInt(parts[0] ?? '', 10)
  const r = parseInt(parts[1] ?? '', 10)
  const a = parseInt(parts[2] ?? '', 10)
  if (!Number.isFinite(m) || !Number.isFinite(r) || !Number.isFinite(a)) return null
  if (m < 0 || r < 0 || a < 0) return null
  return { modified: m, restored: r, added: a }
}
export function parseDiffOutput(text: string, isWin: boolean, maxChanges: number): DiffResult {
  const lines = String(text || '').split(/\r?\n/)
  let total: number | null = null
  let treeId: string | null = null
  let counts: DiffCounts | null = null
  const body: string[] = []
  for (const line of lines) {
    if (line.indexOf('TREE ') === 0) { treeId = line.slice(5).trim() || null; continue }
    if (line.indexOf('COUNTS ') === 0) { counts = parseCounts(line.slice(7)); continue }
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
  const truncated = finalTotal > changes.length
  // 解析到的条数覆盖 total ⇒ 本地统计等价全量（POSIX 从不截断、win32 未超限）；
  // 覆盖不了（win32 脚本侧已截断）就只有 COUNTS 行可信，缺席即 null
  const complete = all.length >= finalTotal
  return { changes, total: finalTotal, truncated, treeId, counts: counts || (complete ? countChanges(all) : null) }
}

// 扫描结果的完整形态：cut 为切点 seq，found 为事件序列里是否存在该消息。
// 「消息不存在」（读取面缺了 fork 继承前缀等）与「消息在、但其前无 turn/end」
// （真·首条）在数值上都折成 null；读取路径的降级判断必须区分二者，故单列 found。
export interface CutSeqScan {
  cut: number | null
  found: boolean
}

// 在事件序列里找“该消息之前最近一次 turn/end 的 seq”。
export function scanCutSeqDetail(events: SessionEvent[], messageId: string): CutSeqScan {
  let anchor = -1
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e && e.type === 'user/message' && e.data && String(e.data.id) === String(messageId)) {
      anchor = i
      break
    }
  }
  if (anchor < 0) return { cut: null, found: false }
  for (let i = anchor - 1; i >= 0; i--) {
    const e = events[i]
    if (e && e.type === 'turn/end' && typeof e.seq === 'number') return { cut: e.seq, found: true }
  }
  return { cut: null, found: true }
}

export function scanCutSeq(events: SessionEvent[], messageId: string): number | null {
  return scanCutSeqDetail(events, messageId).cut
}

// 扫描 fork 切点窗口内入队的用户消息，取出其 item id。
//
// 官方 fork 的切点是「boundary 那条 turn/end 之后、下一个 turn/start 之前」
// 的整段事件（routes-core 把 resolveCutSeq 的返回值当 atSeq 传下去）。一条
// 排队投递的用户消息，其 inbox 入队事件必然落在「上一个 turn/end」与「领取
// 它的那个 turn/start」之间——正好是这个窗口。于是这段入队记录被复制进子
// 会话 seed，子会话重建 inbox 后输入框上方就多出一条本该被撤回掉的排队消息；
// 子会话被驱动时该入队项还会被当作真实一轮消费。
//
// 取 item id 而非 rpcId：id 就是那条消息的 message id，也正是官方
// updateQueue 的寻址键（0.1.5-rc.1 实测——直删返回 accepted，重复删返回
// queue-item-not-found）。Client 拿到子会话 id 后按这些 id 直删，不读队列
// 快照、不做匹配；rpcId 匹配依赖队列帧到达时机，实测 30 秒窗口内可整段落空。
export function scanStaleQueueItemIds(events: SessionEvent[], cutSeq: number | null): string[] {
  if (!Array.isArray(events)) return []
  if (typeof cutSeq !== 'number' || !Number.isFinite(cutSeq)) return []
  const out: string[] = []
  for (const e of events) {
    if (!e || typeof e.seq !== 'number' || e.seq <= cutSeq) continue
    // 窗口在下一个 turn/start 处闭合，与 fork 的 cut 推进规则一致；窗口内
    // 没有 turn/start（切点之后就是末尾）时自然扫到事件结束。
    if (e.type === 'turn/start') break
    if (e.type !== 'agent/inbox/spliced') continue
    const inserted = e.data && Array.isArray(e.data.inserted) ? e.data.inserted : []
    for (const item of inserted) {
      const source = item && item.source
      if (!source || source.kind !== 'user') continue
      const id = item.id
      if (typeof id === 'string' && id !== '' && out.indexOf(id) < 0) out.push(id)
    }
  }
  return out
}

// 读一个 live 会话的内存事件：0.1.5-rc.1 起会话对象暴露 snapshotEvents()，
// events 是旧版字段。两者都探测，都拿不到返回 null——调用侧据此落磁盘降级链。
function liveEventsOf(live: { snapshotEvents?(): SessionEvent[]; events?: SessionEvent[] } | undefined): SessionEvent[] | null {
  if (!live) return null
  if (typeof live.snapshotEvents === 'function') {
    const events = live.snapshotEvents()
    if (Array.isArray(events)) return events
  }
  return Array.isArray(live.events) ? live.events : null
}

// 释放 sessionQuery 观测租约。官方在租约对象上装 Symbol.dispose（prepared 缓存
// 项靠它减引用，漏释放会卡住淘汰）；tsconfig 为 ES2022、无该符号的类型，运行时
// 探测即可——旧版服务/旧 Node 无该符号时静默跳过。
function disposeLease(lease: unknown): void {
  const disposeSymbol = (Symbol as unknown as { dispose?: symbol }).dispose
  if (!disposeSymbol || lease === null || typeof lease !== 'object') return
  const dispose = (lease as Record<symbol, unknown>)[disposeSymbol]
  if (typeof dispose === 'function') (dispose as () => void).call(lease)
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
export interface RescueDeps {
  runShell(cmd: string, opts?: { timeoutMs?: number; stdoutMaxBytes?: number }): Promise<string>
  scripts: PwshScripts | PosixScripts
  gitExe: string
  recordError(text: string): void
}
export interface RescueOpts {
  root: string
  store: StoreInfo
  safetyId: string
  safetyOk: boolean
  rollbackError?: string
}
export async function rescueRollback(deps: RescueDeps, opts: RescueOpts): Promise<{ ok: false; code: ErrorCode; message: string }> {
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
    // rescueError 是 catch 的 unknown，message 字段按 Error 形状断言读取
    const re = rescueError as { message?: string } | null | undefined
    const rescueReason = String(re && re.message ? re.message : rescueError)
    deps.recordError('recall rollback failed and rescue failed: ' + tag + ' — ' + reason + ' | rescue: ' + rescueReason)
    return { ok: false, code: E.RECALL_ROLLBACK_FAILED, message: '回退失败：' + reason + '；自动恢复也失败，请手动执行：' + manual }
  }
}

// F-G1：safety 快照 id 识别（模块级纯逻辑，rebuildOrphans 与 manage list
// 共用同一谓词）。安全 tag 是回退前自动打下的救援锚点（pre-rollback-<ts>，
// 见 routes-core.js execute），不是消息快照——不进索引、不在列表展示。
// 消息 ID 为系统生成 GUID，前缀碰撞概率为零（plan-competitor-fixes F-G1 风险节）。
export function isSafetySnapshotId(id: unknown): boolean {
  return typeof id === 'string' && id.indexOf('pre-rollback-') === 0
}

// listTagsWithTimeScript 输出解析（模块级纯逻辑，便于单测）：每行
// 「<tag名> <秒级时间戳>」，for-each-ref 的 refname 不含空格、时间戳
// 恒为行尾整数。时间解析失败/缺省回退 null——调用方以 0 兜底（保留
// 旧「无时间」行为），绝不因格式漂移丢 tag。
export function parseTagsWithTime(text: unknown): Array<{ name: string; time: number | null }> {
  const out: Array<{ name: string; time: number | null }> = []
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

// A3 格式 marker 判定（纯逻辑，模块级导出供单测）：把 <store>/format 的
// 原文（或读取失败）折成「放行/拒写 + 原因」。marker 语义：缺席（空串）视为
// 1——历史 store 从未写过该文件；合法版本号从 1 起（「0」按损坏处理，格式号
// 没有 0）；非整数内容与读取失败（raw 传 null）都按损坏：fail-closed，宁停
// 勿混——旧代码把新格式 store 当旧格式重写即数据破坏。读取失败由调用侧
// 「不缓存、每次重试」兜底，不会把环境性故障钉死成永久拒写。
export type StoreFormatReason = 'ok' | 'absent' | 'future' | 'corrupt' | 'unreadable'
export interface StoreFormatVerdict {
  ok: boolean
  v: number | null
  reason: StoreFormatReason
}
export function judgeStoreFormat(raw: unknown, supported: number): StoreFormatVerdict {
  if (raw === null) return { ok: false, v: null, reason: 'unreadable' }
  const t = String(raw == null ? '' : raw).trim()
  let v: number
  if (!t) {
    v = 1 // 缺席 = 视为 v1
  } else {
    if (!/^\d+$/.test(t)) return { ok: false, v: null, reason: 'corrupt' }
    v = parseInt(t, 10)
    if (v < 1) return { ok: false, v: null, reason: 'corrupt' }
  }
  if (v > supported) return { ok: false, v, reason: 'future' }
  return { ok: true, v, reason: t ? 'ok' : 'absent' }
}

// ---- 配置工厂 ----

export interface SnapshotsApi {
  saveIndex(root: string, sessionId: string | null): Promise<void>
  loadIndex(root: string, sessionId: string | null): Promise<void>
  readExclude(store: StoreInfo): Promise<string>
  writeExclude(store: StoreInfo, text: string): Promise<void>
  rebuildOrphans(root: string, sessionId: string | null): Promise<void>
  captureSnapshot(sessionId: string, messageId: string, time?: number): Promise<void>
  diffFor(messageId: string): Promise<DiffResult | null>
  rollbackFor(messageId: string): Promise<RollbackResult>
  resolveCutSeq(sessionId: string | null, messageId: string | null): Promise<number | null>
  resolveStaleQueueItemIds(sessionId: string | null, cutSeq: number | null): Promise<string[]>
  feedbackFor(sessionId: string | null | undefined, messageId: string): Promise<SnapshotFeedback | {}>
  loadLineage(root: string): Promise<LineageEntry[]>
  recordLineage(root: string, childId: string, parentId: string): Promise<void>
  // A3 格式守卫：写路径统一先过它（execute/maintenance/manage 的删除流在
  // 各自 tag 清理动作前调用；capture/loadIndex/saveIndex/recordLineage 内部已挂）
  guardStoreFormat(store: StoreInfo): Promise<boolean>
}

// 回退结果判别联合：成功恒带 count；失败带 error（可能半回退 partial）
export type RollbackResult =
  | { ok: true; count: number }
  | { ok: false; error: string; partial?: boolean }

export function createSnapshots(ctx: HostContext, rt: Runtime, config: ResolvedConfig): SnapshotsApi {
  const sessions = ctx.sessions
  const state = rt.state
  // 平台选择的脚本模板（rt.scripts = scripts.pwsh.js / scripts.posix.js）：
  // 两套导出同名接口但实现分属 pwsh/bash，所有调用统一走 S.*
  const S = rt.scripts
  // 基础排除表随调用透传给脚本模板（用户 config 可调，即时生效）
  // 运行时读取而非创建时快照：设置卡片热更新 baseExcludes 后，
  // 下一次快照/diff/回退立即按新排除表执行
  const BASE = (): string[] => config.baseExcludes

  // 连续失败熔断（issue #7）：失败快照的重试既无谓地全量扫描工作区，
  // 又持续写入无 tag 可达的残骸对象（实测一个下午 127GB）。连续
  // FUSE_AFTER 次失败后按 BASE 起步、指数翻倍、CAP 封顶的退避跳过
  // 快照——冷却期内的消息不产生快照点，换来磁盘与 CPU 止血；冷却期满
  // 自动重试，成功一次即全部复位，用户修好环境（如补排除配置）后
  // 无需任何手动干预。
  const FUSE_AFTER = 3
  const FUSE_BACKOFF_BASE_MS = 5 * 60 * 1000
  const FUSE_BACKOFF_CAP_MS = 60 * 60 * 1000
  // issue #29：分钟级失败视为「昂贵失败」——它多半是规模或环境问题而非偶发
  // 抖动，免费重试两次的代价（每条消息再付分钟级 + GB 级写入）远超收益
  const EXPENSIVE_FAIL_MS = 60 * 1000
  const snapFailures = new Map()

  // issue #24：护栏停用记录（root → 判定结果 + 触发时的配置值 + 时间）。
  // 为什么要在 JS 侧短路：判定本身要全量遍历一次工作区，每条消息都付一次
  // 就等于没修——停用期间直接跳过。失效条件有两条：配置值变化（用户调大
  // 上限/预算）立即可重试；TTL 到期（用户靠补充 exclude.txt 修复时配置
  // 值没变）最多 10 分钟自动重试一次，重试仍超限就重新记录。
  const SNAP_LIMIT_RETRY_MS = 10 * 60 * 1000
  const snapLimits = new Map<string, SnapshotLimit & { at: number; maxWorkspaceBytes: number; scanBudgetMs: number }>()
  const limitBlockedAt = new Map<string, number>()

  // 停用记录（超限/统计失败共用）：触发时的配置值一并存下，配置变化即可重试
  function markSnapshotLimited(root: string, limit: SnapshotLimit): void {
    snapLimits.set(root, { ...limit, at: Date.now(), maxWorkspaceBytes: config.maxWorkspaceBytes, scanBudgetMs: config.scanBudgetMs })
  }

  // 停用类 recordError 的 5 分钟节流：停用期内每条消息都走同一分支，
  // 逐条记录会把最近错误环刷成同一条（与 quarantineErrorThrottled 同款纪律）
  function noteSnapshotBlocked(root: string, detail: string): void {
    const last = limitBlockedAt.get(root) || 0
    if (Date.now() - last < 5 * 60 * 1000) return
    limitBlockedAt.set(root, Date.now())
    rt.recordError(detail)
  }

  // ---- A3：磁盘格式版本守卫 ----
  // 补「新读旧」方向的防线：读取侧字段全部可选化只解决旧插件读新格式；
  // 降级安装读到更高版本格式时行为未定义。per-store format marker：高版本/
  // 损坏拒写放行读（fail-closed，宁停勿混），低版本（含缺席=1）照常读写。
  const SUPPORTED_FORMAT = 1
  // 确认缓存 TTL：marker 在场且为支持版本时短期免读（稳态零额外进程），
  // 30s 对齐 index.ts excludeCache 的既有先例
  const FORMAT_OK_TTL_MS = 30000
  // store.dir -> 确认时刻：只记肯定结果（读到合法 marker），拒写/读失败/
  // 缺席都不缓存 → 每次重试自愈（改回 marker 立即恢复，不等缓存过期）
  const formatOkAt = new Map<string, number>()
  // 拒写告警节流（每 store 5min 一条）：被拒的写路径每条消息都会经过，
  // 不节流会把最近错误环刷满（与 quarantineErrorThrottled 同款纪律）
  const formatBlockedAt = new Map<string, number>()

  function formatFile(store: StoreInfo): string {
    return store.dir + (rt.isWin ? '\\' : '/') + 'format'
  }

  // marker 读取：null 表示读命令失败（shell 未就绪等），交判据按不可读处理
  async function readFormatRaw(store: StoreInfo): Promise<string | null> {
    try {
      return S.stripBom(await rt.runShell(S.fileReadCmd(formatFile(store)), { stdoutMaxBytes: 4096 }))
    } catch (error) {
      // 读失败按「不可读」交判据（fail-closed）；不缓存 → 下一条消息重试
      return null
    }
  }

  async function storeFormatVerdict(store: StoreInfo): Promise<StoreFormatVerdict> {
    const at = formatOkAt.get(store.dir)
    if (at !== undefined && Date.now() - at < FORMAT_OK_TTL_MS) return { ok: true, v: SUPPORTED_FORMAT, reason: 'ok' }
    const verdict = judgeStoreFormat(await readFormatRaw(store), SUPPORTED_FORMAT)
    // 只缓存「在场且受支持」；缺席留给补戳后再缓存（见 stampStoreFormat）
    if (verdict.ok && verdict.reason === 'ok') formatOkAt.set(store.dir, Date.now())
    return verdict
  }

  function formatBlockedThrottled(store: StoreInfo, verdict: StoreFormatVerdict): void {
    const last = formatBlockedAt.get(store.dir) || 0
    if (Date.now() - last < 5 * 60 * 1000) return
    formatBlockedAt.set(store.dir, Date.now())
    // 文案按原因三分：future=升级出口；corrupt=文件内容问题（可行动：改回 1）；
    // unreadable=读不到（多为环境未就绪——shell/subprocess 在宿主启动早期不可用，
    // 2026-09-30 实弹：headless 宿主预热期即命中）。三分而不是合并成
    // 「不可读或内容非法」的原因：把环境抖动说成「标记损坏」会让用户去翻一个
    // 根本没有问题的文件（误导），且它其实每次调用都会重试、下一条消息自愈。
    // 文案纪律同前：≤140 字符、不嵌长路径。
    const detail = verdict.reason === 'future'
      ? '磁盘格式标记为 v' + verdict.v + '（本插件支持 v' + SUPPORTED_FORMAT + '）：写入已暂停（快照/撤回/清理），列表仍可查看；请升级插件'
      : verdict.reason === 'corrupt'
        ? '磁盘格式标记内容非法（应为 ' + SUPPORTED_FORMAT + '）：写入已暂停（快照/撤回/清理）；请检查该 store 目录下的 format 文件'
        : '读不到快照库的磁盘格式标记（环境未就绪或文件不可读）：本次写入已暂停，下一条消息自动重试；持续出现请检查该 store 目录权限'
    rt.recordError('recall store format blocked: ' + detail)
  }

  // 写路径守卫（A3）：返回 false 即拒写（已按节流 recordError 告警）。
  async function guardStoreFormat(store: StoreInfo): Promise<boolean> {
    const verdict = await storeFormatVerdict(store)
    if (verdict.ok) return true
    formatBlockedThrottled(store, verdict)
    return false
  }

  // marker 补戳（挂在 saveIndex 写入路径）：缺席才写，稳态零额外进程——
  // 建库（ensureGit）后的首次 index 写入自然覆盖新 store，老 store 在下次
  // 写索引时自愈补齐；在 index 落盘前补戳（先立格式再落内容，中途崩溃时
  // marker 已在，老索引 + v1 marker 无害）。写失败不阻断（索引照常落盘），
  // 因未缓存确认而在下一条消息重试。
  async function stampStoreFormat(store: StoreInfo, verdict: StoreFormatVerdict): Promise<void> {
    if (!verdict.ok || verdict.reason !== 'absent') return
    try {
      await rt.writeTextViaShell(formatFile(store), String(SUPPORTED_FORMAT))
      formatOkAt.set(store.dir, Date.now())
    } catch (error) {
      // 补戳失败已告警、不阻断；下条消息重试
      rt.recordError('recall format stamp failed: ' + String(error))
    }
  }

  // 索引落盘：任意长度文本统一走 rt.writeTextViaShell（win32 base64
  // 分块 / POSIX stdin，实现见 store.js）——saveIndex 与 writeExclude
  // 曾逐字重复这套平台分叉，改一处漏一处的风险随合并消失。
  async function saveIndex(root: string, sessionId: string | null): Promise<void> {
    const store = state.stores.get(root)
    if (!store) return
    // A3：格式守卫——高版本/损坏时索引写整体短路（tag/内存删除侧在各自
    // 入口先行守卫，见 maintenance 与 routes-manage 的调用点）
    const verdict = await storeFormatVerdict(store)
    if (!verdict.ok) {
      formatBlockedThrottled(store, verdict)
      return
    }
    await stampStoreFormat(store, verdict)
    // 每条带 root：设置页「快照管理」要跨工作区展示列表，而 store 目录名
    // 是 root 的单向哈希、反解不了——index.json 是唯一能持久「哈希↔工作区
    // 路径」对应关系的地方。loadIndex 忽略 entry.root（以参数为准），
    // 旧版本插件读新索引也只取已知字段，双向兼容。
    // feedback 落盘（P1-2）：只对「需要解释」的消息写 feedback 字段（失败/
    // 有跳过），正常快照不带——省空间；重启后 snapshot-info 仍能解释
    // 「这条消息为什么没有/缺了快照」。与 root 字段当年的兼容策略一致：
    // 老版本插件读新索引忽略未知字段。
    const entries: IndexEntry[] = Array.from(state.snapshots.entries())
      .filter(([, s]) => s.root === root)
      .map(([id, s]) => {
        const rec: IndexEntry = { id, time: s.time, root: s.root, sessionId: s.sessionId }
        // issue #31：只在「仅消息」时落字段——旧索引与有文件树的条目都不写，
        // 缺省即 true，读侧零迁移
        if (s.files === false) rec.files = false
        const fb = state.snapFeedback.get(id)
        if (fb && (fb.failed || (Array.isArray(fb.skipped) && fb.skipped.length))) rec.feedback = fb
        return rec
      })
    try {
      await rt.writeTextViaShell(store.dir + (rt.isWin ? '\\' : '/') + 'index.json', JSON.stringify(entries))
    } catch (error) {
      // 写失败已告警；索引丢失可从 tag 反推重建（rebuildOrphans），不阻断主链
      rt.recordError('recall saveIndex failed: ' + String(error))
    }
  }

  async function loadIndex(root: string, sessionId: string | null): Promise<void> {
    if (state.indexLoaded.has(root)) return
    const store = state.stores.get(root)
    if (!store) return
    // A3：格式守卫——拒写态下不载入（隔离改名是写操作，也一并免掉）；
    // 不标记 indexLoaded，下次 init/预热自然重试
    if (!(await guardStoreFormat(store))) return
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
    let entries: IndexEntry[] | null = null
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
      const info: SnapshotInfo = {
        root,
        time: typeof entry.time === 'number' ? entry.time : Date.now(),
        sessionId: entry.sessionId || sessionId || ''
      }
      // issue #31：旧索引没有该字段 → 视为有文件树（缺省 true）
      if (entry.files === false) info.files = false
      state.snapshots.set(entry.id, info)
      // feedback 回填（P1-2）：重启后仍能解释「这条消息为什么没有/缺了
      // 快照」。复用 setFeedback 落内存（保持 FIFO 上限），只回填「需要
      // 解释」的记录；旧版索引无 feedback 字段时天然跳过。kind（M1 环境错误
      // 分类）随对象保留——序列化是整体对象，但这里的重建是字段白名单，
      // 漏 kind 会让重启后的失败条目丢失分类、status hint 失效。
      const fb = entry.feedback
      if (fb && typeof fb === 'object') {
        // 重建 feedback 记录：字段白名单逐项回填（failed 分支与 skipped 分支
        // 互斥），rec 以宽松形状声明，落 setFeedback 时由守卫保证形状落入
        // SnapshotFeedback 联合（至少含 failed 或非空 skipped，不会空对象）
        const rec: { failed?: boolean; error?: string; kind?: string; skipped?: string[] } = {}
        if (fb.failed) {
          rec.failed = true
          if (typeof fb.error === 'string') rec.error = fb.error
          if (typeof fb.kind === 'string') rec.kind = fb.kind
        }
        if (Array.isArray(fb.skipped)) rec.skipped = fb.skipped.filter((p) => typeof p === 'string')
        if (rec.failed || (Array.isArray(rec.skipped) && rec.skipped.length)) setFeedback(entry.id, rec as SnapshotFeedback)
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
  function quarantineErrorThrottled(store: StoreInfo, text: string): void {
    const last = quarantineThrottle.get(store.dir) || 0
    if (Date.now() - last < 5 * 60 * 1000) return
    quarantineThrottle.set(store.dir, Date.now())
    rt.recordError(text)
  }

  // H2：损坏索引现场保留——改名 index.json.corrupt-<ts> 而非删除，供排障；
  // 改完名原路径即空，下次 loadIndex 读到空按「无索引」处理，不重复告警。
  // 返回是否改名成功：失败时不标记 indexLoaded，下次重试而非让坏文件被跳过。
  async function quarantineCorruptIndex(store: StoreInfo): Promise<boolean> {
    const sep = rt.isWin ? '\\' : '/'
    const corrupt = store.dir + sep + 'index.json.corrupt-' + Date.now()
    try {
      await rt.runShell(S.renameFileCmd(store.dir + sep + 'index.json', corrupt), { stdoutMaxBytes: 4096 })
      rt.recordError('recall index corrupt: 已按空索引继续，坏文件保留为 ' + corrupt)
      return true
    } catch (error) {
      // 隔离失败已告警（带节流）；返回 false 让 loadIndex 不标记已载入、下次重试
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
  async function loadLineage(root: string): Promise<LineageEntry[]> {
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
      // 损坏/不可读按「无 lineage」继续（不隔离不告警，语义区分见函数头注释）
      return []
    }
  }

  async function recordLineage(root: string, childId: string, parentId: string): Promise<void> {
    const store = state.stores.get(root)
    if (!store) return
    // A3：格式守卫——拒写态下不落 lineage（纯增量 UI 数据，静默跳过）
    if (!(await guardStoreFormat(store))) return
    const sep = rt.isWin ? '\\' : '/'
    const existing = await loadLineage(root)
    // 去重：同一 (childId, parentId) 只记一次（fork 幂等）
    if (!existing.some((e) => e.childId === childId && e.parentId === parentId)) {
      existing.push({ childId, parentId, time: Date.now() })
      try {
        await rt.writeTextViaShell(store.dir + sep + 'lineage.json', JSON.stringify(existing))
      } catch (error) {
        // 已告警；lineage 只是展示增强，写失败不影响快照/回退主链
        rt.recordError('recall recordLineage failed: ' + String(error))
      }
    }
  }

  // exclude.txt 原文读取（设置页编辑用）：stripBom 剥掉 PS 5.1 Set-Content
  // 写入的 UTF-8 BOM，避免设置页首行出现不可见的 \uFEFF；两套模板对缺失
  // 文件都输出空串，这里不用区分「没配过」和「配了空」。
  async function readExclude(store: StoreInfo): Promise<string> {
    return S.stripBom(await rt.runShell(S.excludeReadCmd(store.excludeFile), { stdoutMaxBytes: 1048576 }))
  }

  // exclude.txt 原文写入（设置页保存）：先 mkdir 父目录兜底（home 根目录
  // /降级 store 目录被用户手滑删掉时，保存不该因此失败），写本体统一走
  // rt.writeTextViaShell，与 saveIndex 共用同一套平台分叉原语。
  async function writeExclude(store: StoreInfo, text: string): Promise<void> {
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
  async function rebuildOrphans(root: string, sessionId: string): Promise<void> {
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
      // 已告警；孤立重建失败不致命——快照本体在 tag 上，下次启动会再试
      rt.recordError('recall rebuildOrphans failed: ' + String(error))
    }
  }

  // issue #31：只登记撤回记录，不碰文件树。两处短路刻意绕开：
  // - snapFailures / snapLimits 描述的是「文件快照失败 / 超限」，开启本模式
  //   正是为了绕开它们，不应再阻断消息登记；
  // - buildArtifactRootSegment 早退（issue #18）的理由是产物根快照成本高且
  //   没有回退价值，而仅消息登记零成本，dist/target 里撤回对话仍有价值。
  // guardStoreFormat 保留（索引写入同受磁盘格式守卫约束）。ensureGit 仍跑一次
  // （gitReady 命中的话零进程）——store 布局完整才能复用 gc/枚举/清理全链；
  // 失败走与完整快照相同的反馈通道，不登记（避免同会话按钮时有时无）。
  async function captureMessageOnly(root: string, sessionId: string, messageId: string, time?: number): Promise<void> {
    let store: StoreInfo | null = await rt.resolveStore(root)
    store = (await rt.tryUpgradeToHome(root))!
    if (!(await guardStoreFormat(store))) return
    const g = await rt.ensureGit(root, store)
    if (!g.ok) {
      setFeedback(messageId, { failed: true, ...buildFeedbackError(g.error || '未知原因') })
      return
    }
    await loadIndex(root, sessionId)
    state.snapshots.set(String(messageId), { root, time: time || Date.now(), sessionId, files: false })
    await saveIndex(root, sessionId)
    // 与完整快照成功同款：清掉该消息的旧反馈（失败后重试成功要能自愈）
    setFeedback(messageId, { skipped: [] })
  }

  async function captureSnapshot(sessionId: string, messageId: string, time?: number): Promise<void> {
    const root = await rt.resolveRoot(sessionId)
    if (!root) return
    // issue #31：只回退消息在熔断/限流短路之前分流——那两个标记是文件快照
    // 的失败态，不该阻断消息登记（用户开这个模式正是为了绕开它们）
    if (config.messageOnly) {
      await captureMessageOnly(root, sessionId, messageId, time)
      return
    }
    // 熔断检查要在任何解析/建仓动作之前：冷却期内连 resolveStore 都
    // 不必跑，把失败重试的开销也一并止住
    const fused = snapFailures.get(root)
    if (fused && Date.now() < fused.skipUntil) return
    // issue #24：护栏停用期同样在解析之前短路（理由见 snapLimits 声明处）
    const limited = snapLimits.get(root)
    if (limited
      && limited.maxWorkspaceBytes === config.maxWorkspaceBytes
      && limited.scanBudgetMs === config.scanBudgetMs
      && Date.now() - limited.at < SNAP_LIMIT_RETRY_MS) return
    // issue #18：root 自身就是构建产物目录（…/target/debug、dist）时不建快照——
    // baseExcludes 是相对 root 的模式，匹配不到 root 自己，整个目录会被全量快照
    // （实测 7000 个产物全进 index、对象库 GB 级），而这类目录没有回退价值。
    // 位置在 resolveStore 之前：连空仓库都不建。不写 feedback、不进熔断——这是
    // 设计行为而非失败，原因由 init / snapshot-info 的 notice 告知用户。
    if (buildArtifactRootSegment(root, BASE(), rt.isWin)) return
    let store: StoreInfo | null = await rt.resolveStore(root)
    // tryUpgradeToHome 对刚 resolveStore 的 root 恒返回非空（缓存已写入）；
    // 断言仅为类型收口，运行语义与迁移前一致（原代码直接透传返回值）
    store = (await rt.tryUpgradeToHome(root))!
    // A3：格式守卫（fail-closed）——高版本/损坏 store 拒建快照（写操作）
    if (!(await guardStoreFormat(store))) return
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
    // issue #29：失败耗时是「昂贵失败」的判定依据（见 EXPENSIVE_FAIL_MS）
    const captureStartedAt = Date.now()
    try {
      // 整条快照脚本的兜底时限（0 = 不限制；runShell 的 timeoutMs 是必达的
      // kill 计时器，「不限」只能用一个足够大的数表达）
      const budget = config.snapshotBudgetMs > 0 ? config.snapshotBudgetMs : 86400000
      const out = await rt.runShell(S.snapshotScript(root, store, state.gitExe || '', messageId, BASE()), { timeoutMs: budget, stdoutMaxBytes: 65536 })
      // issue #24：前置扫描判定超限——本次不建快照，并按停用语义走反馈
      //（不是失败：不 prune、不进熔断），后续快照由上方短路跳过
      const limit = parseSnapshotLimit(out)
      if (limit) {
        markSnapshotLimited(root, limit)
        const notice = buildSnapshotLimitNotice(limit)
        noteSnapshotBlocked(root, 'recall snapshot disabled for ' + root + ': ' + notice)
        setFeedback(messageId, { failed: true, kind: 'workspaceLimit', error: notice })
        return
      }
      // issue #29：统计失败 = 规模未知，同样停用该工作区（不 prune、不进熔断：
      // 脚本在 add 之前就退出了，没有残骸要清）。stderr 原文只进「最近错误」
      const scanFail = parseScanFail(out)
      if (scanFail) {
        const pseudo: SnapshotLimit = { kind: 'scan', value: scanFail.rc, limit: 0 }
        markSnapshotLimited(root, pseudo)
        const notice = buildSnapshotLimitNotice(pseudo)
        noteSnapshotBlocked(root, 'recall snapshot scan failed for ' + root + ': rc=' + scanFail.rc + ' ' + scanFail.message)
        setFeedback(messageId, { failed: true, kind: 'scanFail', error: notice })
        return
      }
      snapFailures.delete(root)
      state.snapshots.set(String(messageId), { root, time: time || Date.now(), sessionId })
      await saveIndex(root, sessionId)
      setFeedback(messageId, { skipped: parseSkipped(out) })
    } catch (error) {
      // 已告警并回传失败反馈（客户端轮询到即弹提示）；handleSnapshotFailure 走 prune+熔断善后
      rt.recordError('recall snapshot failed: ' + String(error))
      // 分类后的提示替代原始 stderr 直传（M1-D4）：识别为环境错误时给
      // 可行动文案，未识别时 buildFeedbackError 内部回落原文截断（保现状）
      setFeedback(messageId, { failed: true, ...buildFeedbackError(String(error)) })
      await handleSnapshotFailure(root, store, Date.now() - captureStartedAt)
    }
  }

  // 逐消息反馈写入（issue #7 失败可见性）：成功无跳过 → 清除（重试成功
  // 自愈）；失败/有跳过 → 记录。上限防泄漏：交替成功失败的长会话可以无限
  // 积累，Map 保插入序做 FIFO 淘汰。
  function setFeedback(messageId: string | number, rec: SnapshotFeedback): void {
    const id = String(messageId)
    const keep = rec && ((rec.failed) || (Array.isArray(rec.skipped) && rec.skipped.length))
    if (keep) state.snapFeedback.set(id, rec)
    else state.snapFeedback.delete(id)
    // 环形上限超出即删最旧项（Map 迭代序 = 插入序）；取值判空替代 `!` 断言（A6）
    if (state.snapFeedback.size > 200) {
      const oldest = state.snapFeedback.keys().next().value
      if (oldest !== undefined) state.snapFeedback.delete(oldest)
    }
  }

  // snapshot-info 端点的反馈查询：优先逐消息记录；无记录但该 root 熔断中
  // 时反馈熔断状态（冷却期内的消息快照被静默跳过，客户端需要知道「不是
  // 还没好，是暂停了」）。客户端只对近 5 分钟的消息弹提示，历史消息查询
  // 不受影响。
  async function feedbackFor(sessionId: string | null | undefined, messageId: string): Promise<SnapshotFeedback | {}> {
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
  async function handleSnapshotFailure(root: string, store: StoreInfo | null, elapsedMs = 0): Promise<void> {
    if (store && state.gitExe) {
      try {
        await rt.runShell(S.pruneScript(store, state.gitExe), { timeoutMs: 600000, stdoutMaxBytes: 4096 })
      } catch (error) {
        // prune 失败已告警；善后整体 best-effort（理由见函数头注释）
        rt.recordError('recall prune after snapshot failure failed: ' + String(error))
      }
    }
    const f = snapFailures.get(root) || { count: 0, skipUntil: 0 }
    f.count++
    const expensive = elapsedMs >= EXPENSIVE_FAIL_MS
    // issue #29：昂贵失败跳过前两次免费重试——否则 600 秒超时要连付三轮才退避
    if (expensive && f.count < FUSE_AFTER) f.count = FUSE_AFTER
    if (f.count >= FUSE_AFTER) {
      const backoff = Math.min(FUSE_BACKOFF_BASE_MS * 2 ** (f.count - FUSE_AFTER), FUSE_BACKOFF_CAP_MS)
      const wasFused = Date.now() < f.skipUntil
      f.skipUntil = Date.now() + backoff
      // 只在「未熔断→熔断」的跳变沿记录：熔断期间每条消息都会走上面的
      // 静默跳过分支，逐条记录会把最近错误环形缓冲刷成同一条目
      if (!wasFused) {
        rt.recordError('recall snapshot fused after ' + f.count + ' consecutive failures, backoff ' + Math.round(backoff / 60000) + 'min for: ' + root + (expensive ? ' (last failure took ' + Math.round(elapsedMs / 1000) + 's)' : ''))
      }
    }
    snapFailures.set(root, f)
  }

  // 变更清单截断上限：防止超大工作区（几千个文件）把 DOM 与 JSON
  // 双双撑爆。清单对用户的价值集中在前若干条，其余以 truncated 计数
  // 汇总展示；total 保留完整计数让面板文案仍准确。
  const MAX_CHANGES = 500

  async function diffFor(messageId: string): Promise<DiffResult | null> {
    const snap = state.snapshots.get(String(messageId))
    if (!snap) return null
    // issue #31：仅消息条目没有 tag，跑 diffScript 只会失败——直接空清单
    if (snap.files === false) return { changes: [], total: 0, truncated: false, treeId: null, counts: { modified: 0, restored: 0, added: 0 } }
    const store = state.stores.get(snap.root)
    if (!store) return null
    // 8MB 上限：按平均每条 60 字节估算可容纳十余万条，正常项目远够；
    // 真超限时报错文案与「JSON 半截解析失败」的真实原因脱节，需显式检测
    const text = S.stripBom(await rt.runShell(S.diffScript(snap.root, store, state.gitExe || '', 'snap-' + messageId, BASE(), MAX_CHANGES), { timeoutMs: 600000, stdoutMaxBytes: 8388608 }))
    const trimmed = text.trim()
    if (!trimmed) return { changes: [], total: 0, truncated: false, treeId: null, counts: { modified: 0, restored: 0, added: 0 } }
    // PF-1：解析下沉到 parseDiffOutput（标记行剥离 + 截断 + 树指纹），纯函数单测钉住
    return parseDiffOutput(trimmed, rt.isWin, MAX_CHANGES)
  }

  async function rollbackFor(messageId: string): Promise<RollbackResult> {
    const snap = state.snapshots.get(String(messageId))
    if (!snap) return { ok: false, error: '该消息没有可用的项目快照' }
    const store = state.stores.get(snap.root)
    if (!store) return { ok: false, error: '快照存储不可用' }
    try {
      const text = S.stripBom(await rt.runShell(S.rollbackScript(snap.root, store, state.gitExe || '', 'snap-' + messageId, BASE()), { timeoutMs: 600000, stdoutMaxBytes: 65536 }))
      const m = text.trim().match(/^ROLLBACK_OK\s+(\d+)\s+(\d+)/)
      if (!m) {
        // 无 ROLLBACK_OK 哨兵：脚本在输出哨兵前终止，工作区状态不可知——
        // 一律按「可能半回退」处理，交给 execute 侧救援（H1）。
        return { ok: false, partial: true, error: '回退脚本未正常完成（工作区可能处于半回退状态）：' + text.slice(0, 300) }
      }
      // 捕获组缺席时 parseInt 得 NaN，由下方 Number.isNaN 兜零（与旧行为一致）
      const deleted = parseInt(m[1] ?? '', 10)
      const restored = parseInt(m[2] ?? '', 10)
      return { ok: true, count: (Number.isNaN(deleted) ? 0 : deleted) + (Number.isNaN(restored) ? 0 : restored) }
    } catch (error) {
      // runShell 抛错（脚本异常终止）：工作区同样可能半回退，交 execute 救援。
      const re = error as { message?: string } | null | undefined
      const msg = String(re && re.message ? re.message : error)
      return { ok: false, partial: true, error: msg }
    }
  }

  // 解析“整段回退”的会话切点：优先读 live 会话的内存事件（零 IO、毫秒级），
  // 冷会话走 sessionQuery；结果按 (会话, 消息) 缓存——消息一旦入日志，其之前的
  // turn/end 永不变化，缓存终身有效。
  //
  // 读取面降级链（0.1.5-rc.2 实测，I33）：readSession 对 seeded 会话（本插件每次
  // 撤回 fork 出的子会话即此类）恒抛——官方内部用 Session.create 校验，快照模式
  // 要求 seed 恰等于 fork 继承前缀，而读取侧交给它的是全量日志（继承前缀 + 自身
  // 事件），inheritedEventCount ≠ log.length 直接报错。此前 catch 把异常静默折成
  // null，与“真首条”不可分——子会话里点任何消息都显示“该消息是本会话中第一条
  // 用户消息”（误报）。降级改用 observeSession：它经 Session.fromRestore 恢复
  //（restore 模式不设该约束），租约的 events 是全量逻辑日志、继承前缀可见，切点
  // 沿用原 seq 空间，对 fork(atSeq) 仍然有效。
  async function resolveCutSeq(sessionId: string | null, messageId: string | null): Promise<number | null> {
    if (!sessionId || !messageId) return null
    const cacheKey = String(sessionId) + '\u0000' + String(messageId)
    if (state.cutSeqCache.has(cacheKey)) return state.cutSeqCache.get(cacheKey) || null
    let result: number | null = null
    const live = sessions.get(sessionId)
    if (live && Array.isArray(live.events)) {
      result = scanCutSeq(live.events, messageId)
    } else {
      const query = ctx.get<SessionQueryEngine>('sessionQuery')
      if (query) {
        // 第一跳：readSession。抛错、或消息根本没出现在它给的事件里（读取面缺
        // 继承前缀的版本差异）时都换下一跳——只有「消息在、其前无 turn/end」
        // 才是可信的“首条”结论。
        let fallback = false
        try {
          const log = await query.readSession(sessionId)
          const detail = scanCutSeqDetail(Array.isArray(log && log.events) ? log.events : [], messageId)
          result = detail.cut
          fallback = !detail.found
        } catch (error) {
          // readSession 抛错（seeded 会话恒抛，I33）换 observeSession 跳
          fallback = true
        }
        // 第二跳：observeSession（契约可选——旧版 dsh 无此 API 时维持原行为）。
        // 租约必须显式释放；两跳都失败才落到 null。
        if (fallback && typeof query.observeSession === 'function') {
          try {
            const lease = await query.observeSession(sessionId)
            try {
              result = scanCutSeq(lease && Array.isArray(lease.events) ? lease.events : [], messageId)
            } finally {
              disposeLease(lease)
            }
          } catch (error) {
            // 两跳都失败落 null：保守降级——文件回退不受影响，面板不出对话选项
            result = null
          }
        }
      }
    }
    state.cutSeqCache.set(cacheKey, result)
    return result
  }

  // fork 残留排队项的 id 解析：优先读 live 会话的内存事件（零 IO、毫秒级），
  // 退到 sessionQuery 的 observeSession（restore 模式，事件含继承前缀，覆盖
  // seeded 父会话——撤回链的父会话本身可能是上一次撤回 fork 出的子会话），
  // 最后才用 readSession（快照模式对 seeded 会话恒抛）。这里一旦返回空数组，
  // Client 侧的自动清理就永不触发，所以顺序按「内存 → restore → 磁盘」排，
  // 且内存读取同时探 snapshotEvents()（0.1.5-rc.1 的会话对象）与 events
  // （旧版字段）。三跳都失败才返回空数组（= 不清理），残留项可在 QueueDock
  // 手动删除，绝不阻断撤回主流程。
  async function resolveStaleQueueItemIds(sessionId: string | null, cutSeq: number | null): Promise<string[]> {
    if (!sessionId || typeof cutSeq !== 'number' || !Number.isFinite(cutSeq)) return []
    const live = liveEventsOf(sessions.get(sessionId))
    if (live) return scanStaleQueueItemIds(live, cutSeq)
    const query = ctx.get<SessionQueryEngine>('sessionQuery')
    if (!query) return []
    if (typeof query.observeSession === 'function') {
      try {
        const lease = await query.observeSession(sessionId)
        try {
          return lease && Array.isArray(lease.events) ? scanStaleQueueItemIds(lease.events, cutSeq) : []
        } finally {
          disposeLease(lease)
        }
      } catch (error) { /* restore 失败（旧版无此 API / 会话不可观测）：换磁盘跳 */ }
    }
    try {
      const log = await query.readSession(sessionId)
      return log && Array.isArray(log.events) ? scanStaleQueueItemIds(log.events, cutSeq) : []
    } catch (error) {
      // 三跳都失败按空数组（= 不清理，残留项可手动删；见函数头注释）
      return []
    }
  }

  return { saveIndex, loadIndex, readExclude, writeExclude, rebuildOrphans, captureSnapshot, diffFor, rollbackFor, resolveCutSeq, resolveStaleQueueItemIds, feedbackFor, loadLineage, recordLineage, guardStoreFormat }
}
