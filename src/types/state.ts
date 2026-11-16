// 共享 state 与 Runtime（rt）接口（事实来源：src/host/store.js createRuntime 的
// state 块字段一一对应 + index.js 对 rt 的消费面）。仅类型导出。
//
// M3 立骨架，M6 按六文件实际消费面定稿——新增导出/签名变化以 M6 实施记录为准。

import type { SnapshotFeedback } from './payloads.js'
import type { EnvErrorKind } from '../host/diagnostics.js'
import type { PwshScripts, PosixScripts } from './scripts.js'

// store 形态（store.js makeStore 装配：repo 是仓库工作目录、git 是真实 git-dir，
// 三个上限字段都是 config 热更新的 getter；home=false 表示降级进项目内存储）
export interface StoreInfo {
  dir: string
  repo: string
  git: string
  home: boolean
  excludeFile: string
  maxFileBytes: number
  // issue #24 快照护栏（0 = 不限制）：snapshotScript 在 add 之前消费
  maxWorkspaceBytes: number
  scanBudgetMs: number
}

export interface SnapshotInfo {
  root: string
  time: number
  sessionId: string
  // issue #31：false = 该条只登记了对话回退，没有文件树。缺省视为 true
  //（旧索引条目与旧内存条目都走这条默认），故只在 false 时赋值
  files?: boolean
}

// recordError 环形缓冲条目：kind 直存 classifyEnvError 返回值，未命中即 null
// ——建模不许滤掉「未分类」这一事实（status 端点 hint 按 null 回落）
export interface ErrorRecord {
  time: number
  message: string
  count: number
  kind: EnvErrorKind | null
}

// win32 下 ctx.shell 的方言判定（issue #15）：官方 shell 是提供方注册制，宿主
// 可以把 ctx.shell 配成 bash（pwsh 模板被 bash 执行即语法错误）。'pwsh' = 官方
// 执行器跑得动 pwsh 模板；'bash' = 需改走直连 powershell.exe 通道。
export type ShellDialect = 'pwsh' | 'bash'

// 共享可变 state：各 Map 缓存供 snapshots/maintenance/routes 复用，
// 由 createRuntime 生产、apply 生命周期内单例（无模块级可变状态，HMR 假设）
export interface SharedState {
  roots: Map<string, string>
  stores: Map<string, StoreInfo>
  snapshots: Map<string, SnapshotInfo>
  indexLoaded: Set<string>
  indexHealthy: Set<string>
  indexTruncated: Set<string>
  gitReady: Set<string>
  cutSeqCache: Map<string, number | null>
  homeRetryAt: Map<string, number>
  gcLastAt: Map<string, number>
  gcCount: Map<string, number>
  gitExe: string | null
  posixHomeBase: string | null
  // 上次存储位置判定所用的 storeRoot（issue #36 热更依据）：配置卡片改根目录
  // 时清空 stores/容器缓存重算，避免旧基底的 store 一直服务到下个重启
  storeBase: string
  // 方言探针缓存：判定结果 + in-flight promise（并发首调只跑一次探针）；
  // POSIX 不探测，两字段恒为 null
  shellDialect: ShellDialect | null
  shellDialectProbe: Promise<ShellDialect> | null
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

// ensureGit 结果（M1-D2：失败原因必须传出——captureSnapshot 分类成
// snapFeedback 的可行动提示；init/预热调用方忽略返回值）。
// store（issue #36）：home 不可写时 ensureGit 会降级到项目内 store 再试，
// 这里回传实际生效的那个——调用方必须用它继续后续命令，不能用旧变量。
export interface EnsureGitResult {
  ok: boolean
  error?: string
  store?: StoreInfo
}

// Runtime（rt）接口——store.js createRuntime 返回，M6 按六文件实际消费面定稿：
// snapshots/maintenance/routes-core/routes-manage/index 统一消费它，工厂分层
// 的依赖注入边界（ctx 不解构、不直接摸官方服务）。
export interface Runtime {
  state: SharedState
  isWin: boolean
  scripts: PwshScripts | PosixScripts
  runShell(cmd: string, opts?: ShellRunOptions): Promise<string>
  runShellMeta(cmd: string, opts?: ShellRunOptions): Promise<{ text: string; truncated: boolean }>
  recordError(text: string): void
  writeTextViaShell(file: string, text: string): Promise<void>
  resolveRoot(sessionId: string | null): Promise<string | null>
  resolveGit(): Promise<string>
  homeDirFor(root: string): Promise<string | null>
  resolveHomeContainer(): Promise<string | null>
  resolveStore(root: string): Promise<StoreInfo>
  storeFromDir(dir: string, home: boolean): StoreInfo
  tryUpgradeToHome(root: string): Promise<StoreInfo | null>
  // retried：内部单次降级重试用（issue #36），调用方不传
  ensureGit(root: string, store: StoreInfo, retried?: boolean): Promise<EnsureGitResult>
  cleanupLegacy(root: string): void
  cleanupAfterGitFailure(command: string): Promise<void>
}
