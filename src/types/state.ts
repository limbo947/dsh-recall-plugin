// 共享 state 与 Runtime（rt）接口（事实来源：src/host/store.js createRuntime 的
// state 块字段一一对应 + index.js 对 rt 的消费面）。仅类型导出。
//
// M3 立骨架，M6 按六文件实际消费面定稿——新增导出/签名变化以 M6 实施记录为准。

import type { SnapshotFeedback } from './payloads.js'
import type { EnvErrorKind } from '../host/diagnostics.js'
import type { PwshScripts, PosixScripts } from './scripts.js'

// store 形态（store.js makeStore 装配：repo 是仓库工作目录、git 是真实 git-dir，
// maxFileBytes 是 config 热更新的 getter；home=false 表示降级进项目内存储）
export interface StoreInfo {
  dir: string
  repo: string
  git: string
  home: boolean
  excludeFile: string
  maxFileBytes: number
}

export interface SnapshotInfo {
  root: string
  time: number
  sessionId: string
}

// recordError 环形缓冲条目：kind 直存 classifyEnvError 返回值，未命中即 null
// ——建模不许滤掉「未分类」这一事实（status 端点 hint 按 null 回落）
export interface ErrorRecord {
  time: number
  message: string
  count: number
  kind: EnvErrorKind | null
}

// 共享可变 state：各 Map 缓存供 snapshots/maintenance/routes 复用，
// 由 createRuntime 生产、apply 生命周期内单例（无模块级可变状态，HMR 假设）
export interface SharedState {
  roots: Map<string, string>
  stores: Map<string, StoreInfo>
  snapshots: Map<string, SnapshotInfo>
  queue: Promise<void>
  indexLoaded: Set<string>
  indexHealthy: Set<string>
  indexTruncated: Set<string>
  gitReady: Set<string>
  cutSeqCache: Map<string, number>
  homeRetryAt: Map<string, number>
  gcLastAt: Map<string, number>
  gcCount: Map<string, number>
  gitExe: string | null
  posixHomeBase: string | null
  homeContainer: string | null
  errors: ErrorRecord[]
  snapFeedback: Map<string, SnapshotFeedback>
}

// runShell 选项（runShellMeta 消费面：timeoutMs/stdoutMaxBytes/stdin）
export interface ShellRunOptions {
  timeoutMs?: number
  stdoutMaxBytes?: number
  stdin?: string
}

// Runtime（rt）接口骨架——store.js createRuntime 返回，六文件签名统一消费。
// M6 定稿：本骨架只列当前已知消费面，M6 按 store/snapshots/maintenance/
// routes-core/routes-manage/index 实际调用补齐。
export interface Runtime {
  state: SharedState
  isWin: boolean
  scripts: PwshScripts | PosixScripts
  runShell(cmd: string, opts?: ShellRunOptions): Promise<string>
  runShellMeta(cmd: string, opts?: ShellRunOptions): Promise<{ text: string; truncated: boolean }>
  recordError(text: string): void
  ensureGit(root: string, store: StoreInfo | null): Promise<unknown>
  resolveRoot(sessionId: string | null): Promise<string | null>
  resolveStore(root: string): Promise<StoreInfo | null>
  storeFromDir(dir: string, home: boolean): StoreInfo
  tryUpgradeToHome(root: string): Promise<StoreInfo | null>
  resolveHomeContainer(): Promise<string | null>
  resolveGit(): Promise<string>
  writeTextViaShell(file: string, body: string): Promise<unknown>
  cleanupLegacy(root: string): void
}
