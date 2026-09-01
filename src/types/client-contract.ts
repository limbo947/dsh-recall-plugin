// DSH Client 依赖面契约（事实来源：docs/dsh-contract.md §二 52 个 slot 清单 +
// src/client/* 现状消费面；0.1.2-alpha.2）。仅类型导出。
//
// 建模纪律同 dsh-contract.ts：读取侧可选、双版本兼容分支显式建模——
// conversation 服务 0.1.2 才有（0.1.1-rc.2 无，不能进静态 inject），styles
// 服务 0.1.2 已不存在——两者统一 ctx.get 探测 + 联合/可选类型表达降级。

// ---- __ModuleLoader__ 装载契约（I13：单文件 CJS factory，react external）----

declare global {
  interface Window {
    __ModuleLoader__: {
      load(opts: {
        id: string
        factory: (require: (name: string) => unknown) => unknown
      }): unknown
    }
  }
}

// ---- slot 全量清单（dsh-contract.md §二，52 个；★ = 插件注册）----

export type SlotName =
  | 'conversation.chat.node' // ★ keyed/session（ui-chat）
  | 'settings.plugin.item' // ★ keyed/root（ui-settings-plugins，key=settings namespace）
  | 'conversation' // single/session-maybe（ui-layout）
  | 'conversation.session' // single/session（ui-conversation）
  | 'conversation.session.header'
  | 'conversation.session.header.actions'
  | 'conversation.session.header.lineage'
  | 'conversation.session.header.utilities'
  | 'conversation.view'
  | 'conversation.composer'
  | 'conversation.composer.bar'
  | 'conversation.composer.dock'
  | 'conversation.input.attachments'
  | 'conversation.input.dock'
  | 'conversation.input.left'
  | 'conversation.input.right'
  | 'conversation.input.overlay'
  | 'conversation.input.plan'
  | 'conversation.input.model'
  | 'conversation.hero.brand.mark'
  | 'conversation.hero.workspace'
  | 'conversation.hero.agentPreset'
  | 'conversation.chat.commandview'
  | 'conversation.chat.assistant-actions'
  | 'conversation.chat.turnTail'
  | 'conversation.message.images'
  | 'conversation.details.tool'
  | 'details'
  | 'conversation.approval.detail'
  | 'conversation.trajectory.images'
  | 'shell.overlay'
  | 'sidebar'
  | 'sidebar.brand.mark'
  | 'sidebar.brand.name'
  | 'sidebar.footer.action'
  | 'sidebar.settings'
  | 'sidebar.workspaces'
  | 'root'
  | 'settings.action'
  | 'settings.close'
  | 'settings.general.item'
  | 'settings.header'
  | 'settings.onboarding'
  | 'settings.plugins.tab'
  | 'settings.section'
  | 'settings.trigger'
  | 'settings.models.footer'
  | 'settings.models.provider-card'
  | 'tool.call.toolview'
  | 'tool.view.cordis'
  | 'conversation.hero.workspace.directoryFlow'
  | 'sidebar.workspaces.directoryFlow'

// ---- Chat 节点（conversation.chat.node keyed slot props）----
// 插件实际读取仅三字段：node / renderMessageImages / sessionId（I2：props
// 无裸 loadImage；I3：sessionId 由 scope=session kit 注入；I4：node.id 是
// 快照主键、node.key 是位置键；I5：keyed key 与 UI 投影 kind 对齐 user+steering）

export interface ChatNodeData {
  id?: string
  key?: string
  kind?: string
  [key: string]: unknown
}

export interface ChatNodeProps {
  node?: ChatNodeData
  // 图片唯一入口：内部经 conversation.message.images slot 渲染官方
  // MessageImages（issue #9 实证：契约里从不存在 loadImage）
  renderMessageImages?: unknown
  sessionId?: string
}

// ---- 会话/工作区服务（client 侧）----

export interface ClientSessionsService {
  fork(opts: { sessionId: string; atSeq?: number; increaseTitle?: boolean }): Promise<string>
  open(sessionId: string): unknown
}

export interface ClientWorkspacesService {
  archiveSession(sessionId: string): Promise<unknown> | unknown
}

// ---- conversation 服务（0.1.2 新增，可选探测降级）----
// conversation.input.shell(sessionId).actions.setDraft(text) 是 refillDraft 的
// 官方写入通道；0.1.1-rc.2 无此服务（fillDraft 有界重试恒降级）

export interface ConversationInputShell {
  actions?: { setDraft(text: string): void }
  setDraft?(text: string): void
}

export interface ConversationService {
  input?: {
    shell?(sessionId: string): ConversationInputShell | null | undefined
  }
}

// ---- styles 服务（0.1.1-rc.2 存在、0.1.2 已移除，探测 + <style> 降级）----

export interface StylesService {
  insert(css: string): unknown
}

// ---- slots 服务（keyed 注册：负值 priority 冲突递减重试，I1）----

export interface SlotEntryOptions {
  key?: string
  priority?: number
}

export interface SlotsService {
  inject(name: SlotName | string, factory: () => unknown): unknown
  register(opts: { name: string; key?: string; priority?: number }, component: unknown): unknown
  entries(name: string): SlotEntryOptions[]
}

// ---- Client 插件 ctx（cordis 4 guard：声明过的服务才能 ctx.<name> 访问）----

export interface ClientContext {
  slots: SlotsService
  sessions: ClientSessionsService
  workspaces: ClientWorkspacesService
  timer: { timeout(fn: () => void, ms: number): unknown }
  get<T = unknown>(name: string): T | undefined
}

// 插件对象形态（entry.ts factory 返回；inject 清单见 entry.js）
export interface ClientPluginObject {
  name: string
  inject: string[]
  apply(ctx: ClientContext): void
}
