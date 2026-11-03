// /api/recall/* 端点请求/响应类型（事实来源：src/host/routes-core.js /
// routes-manage.js 端点表 + src/host/errors.js 错误码；payloads.ts 复用结构）。
// 仅类型导出。
//
// M4 后 ErrorCode 自 errors.ts 的 `(typeof ALL_CODES)[number]` 派生——M3 阶段
// errors.js 尚未 as const，这里内联 18 个码值并回链注释。

import type { FeedbackKind, LineageEntry } from './payloads.js'
import type { ResolvedConfig, LocalePref } from './config.js'
import type { ErrorCode } from '../host/errors.js'

export type { ErrorCode }

// 统一错误体（errBody 构造 + 各端点业务失败分支共用形状）
export interface ErrBody {
  ok: false
  code: ErrorCode
  message: string
}

// ---- init ----

export interface InitArgs {
  sessionId?: string
}
export interface InitNotice {
  unsupported?: boolean
  gitMissing?: boolean
  homeFallback?: boolean
  // issue #18：工作区根自身是构建产物目录（路径段命中基础排除表），快照已停用；
  // 值为已拼好的中文提示文案（exclude-patterns.buildRootNotice）。A4 起 client
  // 优先按下面的 buildRootArtifactSeg 本地取词，此字段保留一个版本周期供旧
  // client / 旧 Host 互操作（单向新增，读侧可选）
  buildRootNotice?: string
  // A4：命中的路径段名（如 'target'），client 用它本地渲染 notice.buildRoot
  buildRootArtifactSeg?: string
}
export interface InitResponse {
  ok: boolean
  root: string | null
  notice: InitNotice | null
  // 仅受支持平台且有 root 时下发（unsupported 分支缺省）；client 读侧可选。
  // A4：locale 为界面语言偏好（老 Host 不下发 → client 按 auto 解析）
  // issue #26：editSubmitsImmediately 老 Host 不下发 → client 按默认 true 处理
  config?: { refillDraft: boolean; archiveOriginal: boolean; locale?: LocalePref; editSubmitsImmediately?: boolean }
}

// ---- snapshot-info ----

export interface SnapshotInfoArgs {
  sessionId?: string
  messageId?: string
}
export interface SnapshotInfoResponse {
  has: boolean
  time: number | null
  id: string
  failed?: boolean
  error?: string
  kind?: FeedbackKind
  skipped?: string[]
  // issue #18：has=false 的「非失败」解释（当前只有构建产物 root 停用快照），
  // 与 init 的 notice.buildRootNotice 同源同文案；client 在近消息上 toast 一次。
  // A4：client 优先按 artifactSeg 本地取词，notice 保留一个版本周期（同上）
  notice?: string
  artifactSeg?: string
  // issue #31：false = 该消息只登记了对话回退（messageOnly），默认 true
  files?: boolean
}

// ---- preview ----

export interface PreviewArgs {
  sessionId?: string
  messageId?: string
}
export interface DiffChange {
  kind: string
  rel: string
}
// 全量分类计数：changes 会被截断到上限（默认 500 条），摘要若按清单统计
// 就会与 total 矛盾。null = 计数不可信（旧 Host 截断输出），client 隐去摘要。
export interface DiffCounts {
  modified: number
  restored: number
  added: number
}
export interface PreviewOk {
  ok: true
  changes: DiffChange[]
  total: number
  truncated: boolean
  treeId: string | null
  time: number | null
  root: string | null
  cutSeq: number | null
  counts?: DiffCounts | null
  // issue #31：false = 本条没有文件树，changes 恒为空且 execute 会强制
  // session-only；client 据此隐藏范围单选（老 Host 无该字段按 true）
  files?: boolean
}
export type PreviewResponse = PreviewOk | ErrBody

// ---- execute ----

// 撤回范围：both = 文件与对话一并回退（现状默认）；session-only = 仅 fork 回退
// 对话，工作区零改动。缺省/非法值一律按 both 处理——老 Client 不发、直调 API
// 乱发都落回现状链路，Host/Client 同包发布也无需能力协商。
export type RecallScope = 'both' | 'session-only'

export interface ExecuteArgs {
  sessionId?: string
  messageId?: string
  previewTreeId?: string
  previewTotal?: number
  scope?: RecallScope
}
export interface ExecuteOk {
  ok: true
  count: number
  cutSeq: number | null
  // fork 切点窗口内入队的排队消息 id：官方 fork 把「boundary 那条 turn/end
  // 之后、下一个 turn/start 之前」的整段事件复制进子会话 seed，被撤回消息的
  // inbox 入队记录正在其中——子会话重放后输入框上方会多出一条排队消息。
  // 这些 id 即消息 id，也是官方 updateQueue 的寻址键；Client 在 fork 出的
  // 子会话上按 id 直删（旧 Host 不下发 → 读侧可选）
  staleQueueItemIds?: string[]
}
export type ExecuteResponse = ExecuteOk | ErrBody

// ---- status ----

export interface StatusArgs {
  op?: 'clear'
}
export interface StatusErrorItem {
  time: number
  message: string
  count: number
  kind: FeedbackKind | null
  hint: string | null
}
export interface StatusResponse {
  ok: true
  errors: StatusErrorItem[]
  storeBase: string | null
}

// ---- lineage-record ----

export interface LineageRecordArgs {
  childId?: string
  parentId?: string
}
export interface LineageRecordOk {
  ok: true
}
export type LineageRecordResponse = LineageRecordOk | ErrBody

// ---- notify ----

// client 撤回终态上报（issue #19）：host 按 status 组装 dsh-recall/complete
// 或 dsh-recall/failed payload（version/time 由 host 补，root 由 host enrich）
// 经 ctx.emit 广播。字段是两类事件 payload 的并集读取侧可选——complete 用
// childSessionId/count/chatReverted/archiveRequested，failed 用 stage/code/error，
// 各自必填项由端点校验（缺失 → RECALL_BAD_TYPE）兜住，类型不重复建模。
export interface RecallNotifyArgs {
  status?: 'complete' | 'failed'
  sessionId?: string
  messageId?: string
  scope?: RecallScope
  cutSeq?: number | null
  childSessionId?: string | null
  chatReverted?: boolean
  archiveRequested?: boolean
  count?: number
  stage?: 'execute' | 'fork'
  code?: string
  error?: string
}
export type RecallNotifyResponse = { ok: true } | ErrBody

// ---- exclude-get / exclude-set ----

export interface ExcludeGetResponse {
  ok: boolean
  unsupported?: boolean
  files?: Array<{ path: string; home: boolean; roots: string[]; content: string }>
}
export interface ExcludeSetArgs {
  path?: string
  content?: string
}
export interface ExcludeSetOk {
  ok: true
}
export type ExcludeSetResponse = ExcludeSetOk | ErrBody | { ok: false; unsupported: true }

// ---- config-get / config-set / config-reset ----

export interface ConfigGetResponse {
  ok: true
  values: ResolvedConfig
  overridden: Record<string, unknown>
  envLocks: { gcSnaps: boolean; gcHours: boolean }
  writable: boolean
}
export interface ConfigSetArgs {
  patch?: Partial<ResolvedConfig>
}
export interface ConfigSetOk {
  ok: true
}
export type ConfigSetResponse = ConfigSetOk | ErrBody
export interface ConfigResetOk {
  ok: true
}
export type ConfigResetResponse = ConfigResetOk | ErrBody

// ---- manage ----

export interface ManageListItem {
  id: string
  time: number
  root: string | null
  workspace: string | null
  sessionId: string | null
  sessionTitle: string | null
  messageText?: string
  // issue #31：false = 该条只有对话回退，管理树标「仅消息」
  files?: boolean
}

export interface ManageArgs {
  op?: string
  sessionId?: string
  limit?: number
  sessionIds?: string[]
  requests?: Array<{ sessionId?: string; messageId?: string }>
  scope?: string
  root?: string
  messageId?: string
}
export interface ManageListOk {
  ok: true
  items: ManageListItem[]
  total: number
  stale?: boolean
}
export interface ManageTitlesOk {
  ok: true
  titles: Record<string, string | null>
}
export interface ManageMessagesOk {
  ok: true
  messageTexts: Record<string, string | null>
}
export interface ManageUsageOk {
  ok: true
  bytes: number
  gitAvailable: boolean
  homeStores: number
  fallbackStores: number
}
export interface ManageDeleteOk {
  ok: true
  deleted?: number
  stores?: number
}
// deleteAll 部分完成（有 store 失败）：deleted 随错误体一并回传
export interface ManageDeleteAllPartial {
  ok: false
  code: ErrorCode
  deleted: number
  message: string
}
export interface ManageGcOk {
  ok: true
  gc: boolean
}
export interface ManageLineageOk {
  ok: true
  lineage: LineageEntry[]
}
export type ManageResponse =
  | ManageListOk
  | ManageTitlesOk
  | ManageMessagesOk
  | ManageUsageOk
  | ManageDeleteOk
  | ManageDeleteAllPartial
  | ManageGcOk
  | ManageLineageOk
  | ErrBody
  | { ok: false; unsupported: true }
