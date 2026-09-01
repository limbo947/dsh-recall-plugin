// DSH Host 依赖面契约（事实来源：docs/dsh-contract.md 建档，0.1.2-alpha.2；
// 字段形状以官方 `.d.ts`/源码为准，本文件是「依赖面」的唯一类型源）。
// 仅类型导出。dsh 升级核查流程（dsh-contract.md 第七节）改为 diff 本文件 +
// client-contract.ts。
//
// 建模纪律：读取侧字段尽量可选（双版本兼容分支：0.1.1-rc.2 ↔ 0.1.2-alpha.x），
// 运行时守卫（typeof 检查）不能补救错误假设——字段本不存在时守卫只是静默
// no-op（issue #9 实证），故类型按「文档承诺 + 探针钉真实实例」双锚。

// ---- 会话事件（core/session，51 种）----

// 0.1.2-alpha.2 已知事件类型全集（dsh-contract.md §四；只增未改未删）
export type SessionEventType =
  | 'agent-preset/selected'
  | 'agent/inbox/spliced'
  | 'approval/asked'
  | 'approval/decided'
  | 'approval/policy'
  | 'assistant/chunk'
  | 'assistant/message'
  | 'command/done'
  | 'command/run'
  | 'compaction/end'
  | 'compaction/prune'
  | 'compaction/start'
  | 'compaction/summary'
  | 'feedback/record'
  | 'goal/change'
  | 'hook/invoked'
  | 'hook/result'
  | 'llm/retry'
  | 'llm/retry-started'
  | 'model/selection'
  | 'permission/preset'
  | 'plan/mode'
  | 'request/context'
  | 'request/header'
  | 'sandbox/mode'
  | 'schedule/change'
  | 'session-log-deepseek/delivery-accepted'
  | 'session/end-seed'
  | 'session/title'
  | 'session/title-llm-request'
  | 'step/end'
  | 'step/start'
  | 'subagent/descriptor'
  | 'subagent/model-selection-policy'
  | 'team/member'
  | 'team/message/delivered'
  | 'team/message/queued'
  | 'team/task'
  | 'todo/write'
  | 'tool-workflow/agent-end'
  | 'tool-workflow/agent-start'
  | 'tool-workflow/run-end'
  | 'tool-workflow/run-start'
  | 'tool/call'
  | 'tool/code-dispatch'
  | 'tool/code-dispatch-start'
  | 'tool/result'
  | 'turn/end'
  | 'turn/start'
  | 'user/message'
  | 'web/deepseek-search-llm-request'

// 事件信封：{ type, seq, time, data, ignorable? }（0.1.2-alpha.2 恢复 ignorable）
export interface SessionEvent {
  type: SessionEventType
  seq: number
  time: number
  ignorable?: boolean
  data?: SessionEventData
}

// 插件实际消费的事件 data 字段（读取侧可选；text 块拼接见 messageTextFromEvents）
export interface SessionEventData {
  id?: string | number
  source?: { kind?: string }
  title?: string
  content?: Array<{ type?: string; text?: string }>
  [key: string]: unknown
}

// ---- 会话（core/session：SessionStore + api/session-controller 的 ISessions 扩展）----

export interface SessionHeader {
  id: string
  cwd?: string
  origin?: string
}

export interface Session {
  id: string
  header?: SessionHeader
  events: SessionEvent[]
}

export interface SessionStore {
  get(id: string): Session | undefined
  list(): Session[]
  create?(id?: string, options?: unknown): Session
}

// 0.1.2 迁包后 fork 签名逐字段一致；不传 increaseTitle 避免「xxx 2」递增（I6）
export interface SessionsForkService {
  fork(opts: { sessionId: string; atSeq?: number; increaseTitle?: boolean }): Promise<string>
}

// ---- sessionQuery（冷会话查询）----

export interface SessionRecord {
  header: SessionHeader
  live: boolean
  persisted: boolean
}

export interface SessionLogSnapshot {
  session: SessionHeader
  events: SessionEvent[]
}

export interface SessionQueryEngine {
  listSessions(signal?: unknown): Promise<SessionRecord[]>
  readSession(sessionId: string): Promise<SessionLogSnapshot>
}

// ---- shell（命令执行）----

export interface ShellExecRequest {
  command: string
  timeoutMs?: number
  stdoutMaxBytes?: number
  stdin?: string
  sandboxPolicy?: { mode: string; workspaceRoot?: string }
}

export interface ShellRunResult {
  exitCode?: number
  stdout?: { text?: string; truncated?: boolean }
  stderr?: { text?: string }
}

export interface ShellExecutor {
  resolve(request: ShellExecRequest): ShellExecRequest
  run(spec: ShellExecRequest): Promise<ShellRunResult>
}

// ---- agents（Agent 注册表，P0-1 运行中 agent 拦截）----

export interface AgentInfo {
  id: string
  status: 'idle' | 'running' | string
  session?: { header?: { cwd?: string } }
}

export interface AgentRegistry {
  list(): AgentInfo[]
  get?(id: string): AgentInfo | undefined
}

// ---- webServer（HTTP API 注册）----

// 插件实际消费的 HTTP 请求/响应面（req.url + async 迭代读 body；res.writeHead/end）
export interface HttpRequest {
  url?: string
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>
}
export interface HttpResponse {
  writeHead(status: number, headers?: Record<string, string>): unknown
  end(body?: string): unknown
}

export interface WebRoute {
  kind: 'prefix' | 'exact'
  path: string
  handler: (req: HttpRequest, res: HttpResponse) => unknown
}

export interface WebServer {
  register(route: WebRoute): () => void
}

// ---- settings（设置 namespace 注册 + 读写）----

export interface SettingsSectionHooks<T> {
  setSource(fn: () => T): void
  onChange(): void
}

export interface SettingsScope<T> {
  get(): T
  watch(fn: () => void): unknown
}

// routes-manage 消费面：describe/update/replace/writable
export interface SettingsDescriptor {
  ns?: string
  user?: Record<string, unknown>
}

export interface SettingsService {
  installSection<T>(owner: unknown, ns: string, schema: unknown, entry: T, hooks: SettingsSectionHooks<T>): void
  register<T>(ns: string, schema: unknown, options?: unknown): SettingsScope<T>
  describe?(): SettingsDescriptor[]
  update?(ns: string, patch: Record<string, unknown>): Promise<unknown>
  replace?(ns: string, value: unknown): Promise<unknown>
  writable?: boolean
}

// ---- Host 插件 ctx（cordis 4：服务先 inject 声明才能 ctx.<name> 访问，I10）----

export interface HostContext {
  shell: ShellExecutor
  sessions: SessionStore
  webServer: WebServer
  agents: AgentRegistry
  get<T = unknown>(name: string): T | undefined
  inject(names: string[], callback: (ctx: SettingsInjectedContext) => void): unknown
  on(event: string, listener: (session: Session, event: SessionEvent) => void): unknown
  effect(fn: () => void | (() => void)): unknown
}

// ctx.inject(['settings'], ...) 回调上下文（0.1.2-alpha.2 迁移语义）
export interface SettingsInjectedContext {
  settings: SettingsService
  effect(fn: () => void | (() => void)): unknown
}
