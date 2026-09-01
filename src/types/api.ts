// /api/recall/* 端点请求/响应类型（事实来源：src/host/routes-core.js /
// routes-manage.js 端点表 + src/host/errors.js 错误码；payloads.ts 复用结构）。
// 仅类型导出。
//
// M4 后 ErrorCode 自 errors.ts 的 `(typeof ALL_CODES)[number]` 派生——M3 阶段
// errors.js 尚未 as const，这里内联 18 个码值并回链注释。

import type { FeedbackKind, LineageEntry } from './payloads.js'
import type { ResolvedConfig } from './config.js'

// 端点错误码（M4 errors.ts as const 后改引用）
export type ErrorCode =
  | 'STALE'
  | 'NO_SNAPSHOT'
  | 'NO_STORE'
  | 'AGENT_BUSY'
  | 'ROLLBACK_FAILED'
  | 'UNKNOWN_PATH'
  | 'BAD_TYPE'
  | 'EMPTY_PATCH'
  | 'SETTINGS_UNAVAILABLE'
  | 'SETTINGS_WRITE_FAILED'
  | 'BODY_TOO_LARGE'
  | 'ERROR'
  | 'NO_ROOT'
  | 'NO_SESSION'
  | 'PARTIAL_DELETE'
  | 'UNKNOWN_OP'
  | 'UNKNOWN_ENDPOINT'
  | 'INDEX_CORRUPT'

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
}
export interface InitResponse {
  ok: boolean
  root: string | null
  notice: InitNotice | null
  config: { refillDraft: boolean; archiveOriginal: boolean }
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
export interface PreviewOk {
  ok: true
  changes: DiffChange[]
  total: number
  truncated: boolean
  treeId: string | null
  time: number | null
  root: string | null
  cutSeq: number | null
}
export type PreviewResponse = PreviewOk | ErrBody

// ---- execute ----

export interface ExecuteArgs {
  sessionId?: string
  messageId?: string
  previewTreeId?: string
  previewTotal?: number
}
export interface ExecuteOk {
  ok: true
  count: number
  cutSeq: number | null
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
  | ManageGcOk
  | ManageLineageOk
  | ErrBody
  | { ok: false; unsupported: true }
