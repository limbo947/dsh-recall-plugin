# DSH 契约文档（dsh-contract）

> 插件视角的官方（deepseek-harness）API 契约参考：插件**依赖面**逐项给出签名与核验状态，插件**未依赖面**给出全量清单与一句话说明。
>
> * 对应版本：**dsh 0.1.2-rc.1**（tag `dsh-v0.1.2-rc.1`，commit `a66e4702`，2026-09-03 发布；rc 前基线 alpha.5 `db6bdc35`、alpha.4 `4e84901e` 已并入）
>
> * 来源：官方源码直接核验（本机构建检出在 `D:\workspace\dsh-plugin\deepseek-harness`），非文档转述——**遇字段争议一律以** **`.d.ts`/源码为准**（AGENTS.md 合规清单 #8）
>
> * 维护方式：dsh 升级后按第七节指引定点重核；本文档描述「一直成立的事实」，不设完成态
>
> * 上游源码路径均相对官方仓库根 `packages/`（简写），本机镜像在 `D:\workspace\dsh-plugin\deepseek-harness\packages\`

***

## 一、插件依赖面（详细契约，0.1.2-alpha.1 核验通过）

### 1.1 Host 服务（经 `inject` 声明或 `ctx.get` 获取）

插件 `inject = ['shell', 'sessions', 'webServer', 'agents']`。

#### shell —— 命令执行（`shell/shell/src/types.ts`）

两版逐字节一致，0.1.2-alpha.1 零变更（2026-08-30 双 tag diff 实证：`dsh-v0.1.1-rc.2 ↔ dsh-v0.1.2-alpha.1` 的 types.ts 零差异）。插件全量使用面：

```ts
interface ShellExecutor {
  resolve(request: ShellExecRequest): ShellExecSpec   // 填充并封顶必填字段
  run(spec: ShellExecSpec): Promise<ShellRunResult>   // 前台执行，stdout 截断可判定
  // 另有 start()：后台进程句柄（插件未用）
}
// 插件 ShellExecRequest 字段：command / timeoutMs / stdoutMaxBytes / stdin / sandboxPolicy{mode:'danger-full-access', workspaceRoot}
// 插件 ShellRunResult 读取字段：exitCode / stdout.text / stdout.truncated / stderr.text
```

#### sessions —— 会话注册表（`core/session/src/index.ts`，`SessionStore`）

0.1.2-alpha.1 新增 `seq-ranges` 导出，`get/list/create` 不变（双 tag diff 实证；唯一实质变化是移除事件信封 `ignorable` 校验分支，见 §1.3）。

```ts
class SessionStore {
  get(id: SessionId): Session | undefined   // live 会话；Session.events 为内存事件数组
  list(): Session[]
  create(id?, options?): Session            // 归属调用 fiber，fiber 销毁即移除
}
```

`api/session-controller/src/client/contract/sessions.ts` 在同一 `ctx.sessions` 上扩展（同一服务实例的两层契约）。**0.1.2-alpha.1 迁包**：client 侧 sessions 服务由 0.1.1-rc.2 的 `client/runtime`（已删除）迁入该新包，`fork` 签名逐字段一致：

```ts
interface ISessions {
  fork(opts: { sessionId: SessionId; atSeq?: number; increaseTitle?: boolean }): Promise<SessionId>
  scope(id: SessionId): AgentContext | undefined
}
```

* fork 语义：从 `atSeq` 切出新会话；**不传** **`increaseTitle`** **避免「xxx 2」标题递增（不变量 I6）**；请求的 child-title rename 失败会在创建后抛错

* 归档会话仅从分组表面隐藏（I7），fork 链由插件 lineage.json 自行记录

#### sessionQuery —— 冷会话查询（`session-query/session-query/src/index.ts`）

```ts
interface SessionQueryEngine {
  listSessions(signal?): Promise<SessionRecord[]>            // 目录级 header 枚举，不触碰全量日志
  readSession(sessionId): Promise<SessionLogSnapshot>        // 整日志解压（10 秒级），冷会话兜底
  // 另有 search/trace 等搜索 API（插件未用）
}
interface SessionRecord { header: SessionHeader; live: boolean; persisted: boolean }
interface SessionLogSnapshot { session: SessionHeader; events: SessionEvent[] }
```

* 0.1.2-alpha.1：`readSession` 增加 persistence repair + replay validation（截断尾部自动修复并警告），返回形状不变

* 插件读取：`rec.header.id` / `rec.header.cwd`（`SessionHeader` **无** **`title`** **字段**，标题在 `session/title` 事件日志——I28）；`log.events` 交给 `scanCutSeq`

* 冷启动 `sessions.list()` 为空时 exclude 枚举叠加 `resolveHomeContainer` 磁盘兜底（I9）

#### agents —— Agent 注册表（`core/agent/src/index.ts`）

`list(): Agent[]` 不变；`AgentStatus = 'idle' | 'running'`；`agent.id` / `agent.session.header.cwd` 可读。插件 `agentBusy`（P0-1）守卫式访问：`typeof reg.list === 'function'` + `status === 'running'` 判断。新版新增 `get/isOwnedBy/create/resume` 等方法与子代理身份机制，与插件读取面无交集。

#### webServer —— HTTP API（`host/webserver/src/index.ts`）

```ts
class WebServer {
  register(route: WebRoute): () => void   // kind: 'exact' | 'prefix'；重复注册抛错；返回注销函数
}
```

插件用 `register({ kind: 'prefixes', path: '/api/recall', ... })` 挂前缀路由（`ctx.effect` 内注册，卸载自动清理）。**实测 0.1.2-alpha.1：插件** **`/api/recall/*`** **端点不受 Web UI 一次性 token 鉴权拦截**（鉴权作用于页面/静态资源层）。

#### settings（经 settings 辅助接入，`settings/settings/src/index.ts`）

```ts
// 0.1.2-alpha.1 及以前：独立函数（当前已移除，仅作历史记录）
function installSettingsSection<T>(
  ctx: Context, ns: SettingsNamespace, schema: z<T>, entry: T,
  hooks: SettingsSectionHooks<T>   // setSource(current) + onChange
): void

// 0.1.2-alpha.2 起：SettingsProvider 方法（独立函数被官方移除）
class SettingsProvider {
  installSection<T>(owner: Context, ns: SettingsNamespace, schema: z<T>, entry: T,
    hooks: SettingsSectionHooks<T>): void
  register<Ns extends string, T>(ns: Ns, schema: z<T>, options?): SettingsScope<T>
}
```

签名与 0.1.1-rc.2 一致（entry 为组合 `base`、hooks.setSource + onChange）；内部 `ctx.inject(['settings'])` 后 `settings.register(ns, schema, ...)`。**0.1.2-alpha.2 破坏性变更：独立函数** **`installSettingsSection`** **移除**，官方插件（bash-local/pwsh-local 等）改 `ctx.inject(['settings'], sctx => sctx.settings.installSection(ctx, ns, schema, entry, hooks))`。插件 `src/host/index.ts` 双版本兼容：`typeof dshSettings.installSettingsSection === 'function'` 时走旧函数，否则走 `settings.installSection`（verify-host 桩同步提供 installSection）。

#### conversation —— 会话级输入服务（**0.1.2 新增**，插件可选探测）

`client/ui-conversation/src/client/service.ts` 的 `ConversationService`（`super(ctx, 'conversation')`），构造注入 `input: SessionInputResolver`——`conversation.input.shell(sessionId).setDraft(text)` 是插件 refillDraft（撤回后回填输入框）的官方写入通道。

* **0.1.2-alpha.1 新增**（0.1.1-rc.2 无此服务，无 `setDraft` 通道）

* 插件**未静态声明**该服务（见 §1.1 sessions 段「conversation 不进 inject」的双版本取舍），统一 `ctx.get('conversation')` 探测 + 存在性判断降级

### 1.2 Client 扩展点（slot，经 `__ModuleLoader__` 装载）

#### `conversation.chat.node` —— 撤回按钮宿主（**声明已迁包**：`client/ui-chat/src/client/contract/slots.ts`）

```ts
'conversation.chat.node': {
  kind: 'keyed'; scope: 'session'
  owner: ChatNodeOwnerProps
  keyProps: { [Kind in ChatNodeKind]: { node: ChatNode<Kind> } }
  hookContext: string
  inject: ChatNodeTurnDataInjected   // hooks.turnData: SlotHookFactory<...>
}

interface ChatNodeOwnerProps {
  selectedCallId?: ToolCallId
  cwd?: string
  openFile(path: string): void
  inspectCall(callId: ToolCallId): void
  forkAt(seq: number): void
  renderMessageImages: RenderMessageImages   // 图片唯一入口（I2：props 无裸 loadImage）
  fileMentions(owner: TurnTailOwnerProps): MarkdownFileMentions | undefined
  turnProcess?: TurnProcessOwnerProps        // 新增：折叠过程状态（插件未读）
}
```

* 插件实际读取仅三字段：`node` / `renderMessageImages` / `sessionId`，0.1.2-alpha.1 全部保留

* `props.sessionId` 由 scope='session' 的 kit 注入（`ui-session` merge 进 `SessionStandardProps`，I3）

* 注册键覆盖 `['user', 'steering']`（I5）；`node.id` 是快照主键、`node.key` 是位置键（I4）

* 内置 `ChatNodeKind` 全集（15 键，`ChatNodeDataMap` 增强，ui-chat/conversation-nodes/）：`user`、`steering`、`context`、`assistant-step`、`tool-call`、`command`（commandId 是其数据字段非键）、`compaction` / `manual-compaction`、`model-retry`、`system-prompt`、`turn-process`、`turn-tail`、`turn-error`、`turn-max-tokens`、`unknown`（projection kind 才叫 unknown-surface）；`chat` 是 view target 非 kind。注意 `context` 类消息节点插件未覆盖（无撤回按钮，按设计只挂 user/steering）

* 0.1.2-alpha.1 新增 turn-process 折叠：user/steering 不参与折叠（独立 kind），撤回按钮显示不受影响（已冒烟确认）

#### `settings.plugin.item` —— 设置页卡片（`client/ui-settings-plugins/src/client/slot-contract.ts`）

```ts
'settings.plugin.item': { kind: 'keyed'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
// key = settings namespace（'dsh-recall'），按 namespace 交集分发（I12）
// owner props 为空（卡片自绘内部）
```

#### Client 装载契约（I13）

`__ModuleLoader__.load({ id, factory })` 注册；单文件 CJS factory 包裹（classic script，禁顶层 import）；`react` 为 external，由 loader 运行时 `require("react")` 提供，external 白名单只此一家。

### 1.3 会话事件（`core/session/src/known-event-types.ts` + `types.ts`）

事件域 `session/event` 广播持久事实（合规 #6）。「模型可见即已记录」不变式成立。

插件 `scanCutSeq` 依赖（0.1.2-alpha.1 保留）：

* `'user/message'`：`UserMessage`，`e.data.id` 是稳定消息 ID（`Message.id` 跨表示边界不变）

* `'turn/end'`：关闭 turn，携带 `e.seq`（单调递增事件序号）；`resolveCutSeq` 取目标消息之前最近一次

事件信封：`{ type, seq, time, data, ignorable? }`；持久化读路径对未知类型 **fail-closed**——拒绝解释含集合外类型的日志（防新版日志被旧版错误重建，known-event-types.ts:8-17）；插件只扫描上述两种类型，官方新增类型对扫描逻辑天然向后兼容。**0.1.2-alpha.2 恢复：0.1.2-alpha.1 曾移除信封** **`ignorable?: true`** **字段（未知类型从「带标记可跳过」改为一律拒绝、fail-closed 取代 ignorable），alpha.2 回滚该变更**——已装产物实证（`dsh-session/lib/index.js` 事件校验 `event.ignorable !== void 0 && event.ignorable !== true` 分支、`dsh-session-persistence` 未知类型按 ignorable 区分拒绝/跳过）恢复 0.1.1-rc.2 语义；插件只扫 `user/message` + `turn/end`，不读 ignorable，无影响。另 `tool/call` 的 `callId` 类型由 `CallId` 改名为 `ToolCallId`（插件不读 tool/call，无影响）。

### 1.4 环境约束（0.1.2-alpha.1 实测）

* Node ≥ 22.19 / ≥ 24（本机 24.14.1）

* cordis 4：服务必须先 `inject` 声明才能 `ctx.<name>` 访问（漏声明被守卫吞掉静默 fail-open，I10）

* Web UI 访问带一次性 token（`dsh web` 启动输出 `?token=<...>`），插件 API 端点不受影响

* pwsh 路径解析对 WindowsApps 别名判否，生产口径常落 PS 5.1（I27 不变）

***

## 二、Client 扩展点全量清单（52 个 slot）

插件依赖 2 个（★），其余为未依赖参考。`kind` 决定注册语义：`keyed` 按键替换、`single` 全局唯一、`chain` 依次决策、`list` 有序堆叠。

| #  | slot                                      | kind   | scope         | 所在包                 | 说明                             |
| -- | ----------------------------------------- | ------ | ------------- | ------------------- | ------------------------------ |
| 1  | ★ `conversation.chat.node`                | keyed  | session       | ui-chat             | Chat 节点渲染器（按 ChatNodeKind 键）   |
| 2  | ★ `settings.plugin.item`                  | keyed  | root          | ui-settings-plugins | 插件设置卡片（按 settings namespace 键） |
| 3  | conversation                              | single | session-maybe | ui-layout           | 会话外层壳                          |
| 4  | conversation.session                      | single | session       | ui-conversation     | 严格会话体                          |
| 5  | conversation.session.header               | single | session       | ui-conversation     | 会话头                            |
| 6  | conversation.session.header.actions       | —      | session       | ui-conversation     | 头部动作区                          |
| 7  | conversation.session.header.lineage       | —      | session       | ui-conversation     | 头部谱系区                          |
| 8  | conversation.session.header.utilities     | —      | session       | ui-conversation     | 头部工具区                          |
| 9  | conversation.view                         | list   | session       | ui-conversation     | Chat 主视图                       |
| 10 | conversation.composer                     | chain  | session       | ui-conversation     | 输入条                            |
| 11 | conversation.composer.bar                 | single | session-maybe | ui-conversation     | 输入条主体                          |
| 12 | conversation.composer.dock                | —      | session       | ui-conversation     | 输入条 dock                       |
| 13 | conversation.input.attachments            | single | session-maybe | ui-conversation     | 草稿图片渲染                         |
| 14 | conversation.input.dock                   | —      | session       | ui-conversation     | 输入区 dock                       |
| 15 | conversation.input.left / .right          | —      | session       | ui-conversation     | 输入条左右插槽                        |
| 16 | conversation.input.overlay                | —      | session       | ui-conversation     | 输入区覆盖层                         |
| 17 | conversation.input.plan                   | —      | session       | ui-conversation     | Plan 控件                        |
| 18 | conversation.input.model                  | —      | session       | ui-conversation     | 模型控件                           |
| 19 | conversation.hero.brand.mark              | single | —             | ui-conversation     | 空会话品牌标                         |
| 20 | conversation.hero.workspace               | —      | —             | ui-conversation     | 空会话工作区选择                       |
| 21 | conversation.hero.agentPreset             | —      | —             | ui-conversation     | 空会话 Agent Preset 选择            |
| 22 | conversation.chat.commandview             | keyed  | session       | ui-chat             | 命令行卡片（按命令名键）                   |
| 23 | conversation.chat.assistant-actions       | list   | session       | ui-chat             | 0.1.2 新增：助手消息操作行（按消息 id）       |
| 24 | conversation.chat.turnTail                | chain  | session       | ui-chat             | 0.1.2 新增：完成回合尾部扩展              |
| 25 | conversation.message.images               | single | session       | ui-chat             | 持久消息图片渲染器（替换内置画廊）              |
| 26 | conversation.details.tool                 | single | session       | ui-chat             | 工具详情面板                         |
| 27 | details                                   | single | —             | ui-layout           | 详情面板壳                          |
| 28 | conversation.approval.detail              | —      | session       | ui-approval         | 审批卡片详情                         |
| 29 | conversation.trajectory.images            | —      | session       | ui-trajectory       | 轨迹视图图片                         |
| 30 | shell.overlay                             | —      | —             | ui-layout           | 全局覆盖层                          |
| 31 | sidebar                                   | single | —             | ui-layout           | 侧栏壳                            |
| 32 | sidebar.brand.mark / .name                | —      | —             | ui-sidebar          | 侧栏品牌                           |
| 33 | sidebar.footer.action                     | —      | —             | ui-sidebar          | 侧栏底部动作                         |
| 34 | sidebar.settings                          | —      | —             | ui-sidebar          | 侧栏设置入口                         |
| 35 | sidebar.workspaces                        | —      | —             | ui-sidebar          | 侧栏工作区列表                        |
| 36 | root                                      | single | —             | ui-renderer         | 应用根                            |
| 37 | settings.action / settings.close          | —      | —             | ui-settings         | 设置页动作/关闭                       |
| 38 | settings.general.item                     | —      | —             | ui-settings         | 通用设置项                          |
| 39 | settings.header                           | —      | —             | ui-settings         | 设置页头                           |
| 40 | settings.onboarding                       | —      | —             | ui-settings         | 设置页引导                          |
| 41 | settings.plugins.tab                      | —      | —             | ui-settings         | 插件配置页签                         |
| 42 | settings.section                          | —      | —             | ui-settings         | 设置分区                           |
| 43 | settings.trigger                          | —      | —             | ui-settings         | 设置入口触发器                        |
| 44 | settings.models.footer                    | —      | —             | ui-settings-models  | 模型设置页脚                         |
| 45 | settings.models.provider-card             | —      | —             | ui-settings-models  | 0.1.2 新增：提供方登录配置卡              |
| 46 | tool.call.toolview                        | —      | session       | ui-tool             | 工具调用视图                         |
| 47 | tool.view\.cordis                         | —      | session       | ui-cordis           | cordis 检查工具视图                  |
| 48 | conversation.hero.workspace.directoryFlow | —      | —             | ui-workspace        | 目录流（工作区选择）                     |
| 49 | sidebar.workspaces.directoryFlow          | —      | —             | ui-workspace        | 目录流（侧栏）                        |

注：`conversation.input.model` 由 ui-conversation 声明、ui-model-selection 提供运行时；目录流是 0.1.2 拆分后的目录选择接缝。

## 三、Host 服务全量清单（按域分组，\~75 个）

★ = 插件依赖。可选服务（`?`）可能缺席，访问前需判空。

**api 域**：`sessions`★（SessionStore + ISessions 扩展）、`sessionController`、`sessionFileReferences`、`sessionSkillCatalog`、`credentialsController`、`settingsController`、`directoryPickerController`、`workspaceController`、`workspaces`、`remote`（@Remote 网关客户端句柄，APIProxy 已移除）、`typertGateway`

**core 域**：`agents`★（AgentRegistry）、`sessions`★（SessionStore，与 api 层同实例）、`tools`（ToolRuntime）、`systemPrompt`、`agentLoop`、`agentDefaultModel`、`agent?`（当前 Agent，in-initiator 才有）

**shell 域**：`shell`★（ShellExecutor）、`shellEnv`

**session 域**：`sessionQuery`★（SessionQueryEngine）、`sessionPersistence`、`sessionProjections`、`sessionProjectionCache`、`sessionTitle`、`sessionTelemetry`、`sessionLogDownload`

**host/web**：`webServer`★、`directoryPicker`、`web`（WebRuntime）、`webhookRuntime`

**llm**：`llm`（LlmRuntime）、`tokenMeter`、`deepseekLlmApiExtensions`

**sandbox/subprocess/terminal**：`sandboxPolicy`★（插件读 `workspaceRoot`）、`sandbox`、`subprocess`、`terminals`

**storage/fs/spill**：`storage`、`storageDomain`、`fs`（FileSystem）、`spillStore`、`attachments`

**interaction**：`commands`、`approval`、`userQuestions`、`permissionPresets`

**compaction/context**：`compaction`、`toolResultPruner`、`fileReferences`、`sessionReferenceResolver`

**goal/plan/jobs/schedule/workflow**：`goals`、`planMode`、`jobs`、`workflowEngine`（schedule 域经 config 声明）

**其他**：`skills`、`credentials`、`authorization`、`e2b`、`lsp`、`agentTeams`（experimental）、`inspector`（experimental）、`invariants`、`agentPresets`、`subagents`、`subagentModelSelection`、`typert`、`codeRuntime`、`messageFeedback`、`launchEnvironment?`

**boot/CLI**：`dshHomePath?`、`cmdlineArgs?`、`appReady?`、`appExit?`

**client 半专用**（Host 不可见）：`connection`、`locale`、`modules`/`clientModules`、`slots`/`uiRenderer`、`layout`、`uiSession`、`uiConversation`/`conversation`、`commandUi`、`inputTriggers`、`modelDirectories`、`chatFileMentions`、`settingsSchema`/`settingsScope`、`theme`、`uiWorkspace`、`timer`（cordis-client-runner 提供，声明后可用 `ctx.timeout` 等计时动词）

## 四、会话事件类型全集（51 种）

已知类型集合（`KNOWN_SESSION_EVENT_TYPES`，0.1.2-alpha.1）：

```
agent-preset/selected   agent/inbox/spliced    approval/asked      approval/decided
approval/policy         assistant/chunk        assistant/message   command/done
command/run             compaction/end         compaction/prune    compaction/start
compaction/summary      feedback/record        goal/change         hook/invoked
hook/result             llm/retry              llm/retry-started   model/selection(*新)
permission/preset       plan/mode              request/context     request/header
sandbox/mode            schedule/change        session-log-deepseek/delivery-accepted(*新)
session/end-seed        session/title          session/title-llm-request
step/end                step/start             subagent/descriptor
subagent/model-selection-policy(*新)           team/member         team/message/delivered
team/message/queued     team/task              todo/write          tool-workflow/agent-end
tool-workflow/agent-start                      tool-workflow/run-end
tool-workflow/run-start tool/call              tool/code-dispatch  tool/code-dispatch-start
tool/result             turn/end               turn/start          user/message
web/deepseek-search-llm-request
```

0.1.2-alpha.1 相对 0.1.1-rc.2 新增 3 种：`model/selection`、`session-log-deepseek/delivery-accepted`、`subagent/model-selection-policy`。**只增未改未删**——消费方按需扫描（如插件 scanCutSeq）天然向后兼容。

## 五、内置 Tool 包清单（19 个）

`@deepseek-ai/dsh-tool-{ask-user, bash, bash-persistent, pwsh-persistent, cordis, fs, fs-search, goal, pwsh, ralph, skill, str-replace-editor, subagent, subagent-control, jobs, todo, web, workflow, subagent-report}`

0.1.2 变化：PTC Mode 更名自 Code Mode；PTC 的 SDK 能力只能经 `run_code` 调用（不再暴露为直接工具）。插件不注册 tool，仅受 `tool/call`、`tool/result` 事件影响（快照内容层面）。

## 六、其他横切契约

* **bundle patch 语义**（`cordis.patch.yml`）：patch 按行替换目标行整个 config，不深合并；覆盖前层行须重述所有键（合规 #4）

* **HMR**：卸载旧实例 → 重载新实例，一切注册清零；禁跨 apply 模块级可变状态（合规 #5）

* **Config**：活 Schemastery schema，无效配置加载即响亮失败（合规 #3）

* **一次性 token 鉴权**：`dsh web` 启动 URL 带 `?token=`；实测插件 `/api/recall/*` 前缀路由不经过该鉴权层

* **APIProxy 已移除**：一切远程调用走 `@Remote` 网关（插件未使用，无影响）

## 七、dsh 升级核查指引

1. **契约对比**（一次升级只做一遍）：**类型源 diff 核对法**——插件对官方 API 的依赖面已契约化为 `src/types/dsh-contract.ts`（Host 依赖面，含两个 ambient 模块）与 `src/types/client-contract.ts`（Client slot/`__ModuleLoader__`/服务），升级时以这两文件为**单一类型源**，逐节对照新旧 tag 的官方 `.d.ts`/产物 diff，类型与官方不一致处即升级断点；`conversation.chat.node` 声明位置可能在包重组后迁移（本次 `ui-conversation` → `ui-chat`），先 `git/trees` 搜 slot 名再 diff。compare API 截断 300 文件不可用，用 `contents/trees` API 逐文件拉。
2. **机器化断言**：`npm run test:probe`（官方字段假设）→ `npm run verify:host`（装配门禁）→ `npm run check:dsh`（版本巡检；镜像漂移提醒后重拉 `reference/` 并更新其头部「归档 dsh 版本」）。
3. **实弹冒烟**：中文路径工作区发消息 → 撤回（清单/文件恢复/对话回退/标题不变）→ 设置页快照管理。新 UI 机制（如 0.1.2 的 turn-process 折叠、字号调节）重点确认插件 UI 可见性与视觉协调。
4. **台账**：核查结论对照 `docs/compat-audit.md` I1-I29 定点更新，发现失效项补「失效症状 + 复查动作」。

> **0.1.2-alpha.1 升级核查已完成（2026-08-30）**：0.1.1-rc.2 ↔ 0.1.2-alpha.1 双 tag 对比结论——
> client 半大重构（`client/runtime` 删除，sessions/workspaces 迁入新增 `api/session-controller`、
> `api/workspace-controller`，slots 迁入 `ui-renderer`，chat 节点迁入新包 `ui-chat`）；
> I29 触发点是该服务层重组而非 guard 新增（guard 两版语义一致）；Host 半契约零破坏
> （shell types 逐字节一致、settings installSettingsSection 逐字节一致、fork/register/list
> 签名不变）；事件 `ignorable` 移除改 fail-closed；新增 3 种事件类型与 3 个 slot；
> webserver 新增 gzip（默认 none）。全部已落档：compat-audit I1-I29 出处、本文档 §1/§2/§3、
> CHANGELOG Unreleased。下版升级时先读本段，避免重复劳动。
>
> **0.1.2-alpha.2 升级核查已完成（2026-08-31）**：alpha.1 ↔ alpha.2 对比（实测 npm 产物 + release notes）——
> ① 事件信封 `ignorable?: true` **恢复**（alpha.1 移除改 fail-closed，alpha.2 回滚，`dsh-session`/`dsh-session-persistence` 实测确认），插件不读 ignorable 无影响（§1.3 已改）；
> ② settings 独立函数 `installSettingsSection` **移除** → `SettingsProvider.installSection` 方法（bash-local/pwsh-local 同款迁移），插件 `src/host/index.ts` 双版本兼容分支已加、verify-host 桩补 installSection（§1.1 settings 段已改）；
> ③ `conversation.chat.node` 声明位置：alpha.2 已实装在 `dsh-client-ui-chat`（alpha.1 镜像同包），探针路径更新为双包探测（§1.2 已改）；
> ④ 其余（插件列表分组、Node 24 启动修复、RemoteError 封装、peer 优化）与插件依赖面无交集。机器化断言：`test:probe` 17/17 绿、`verify:host` 全绿、`check:dsh` 仅镜像漂移（reference 已重拉更新）。
>
> **0.1.2-alpha.3 / alpha.4 升级核查（2026-09-02）**：`npm install -g @deepseek-ai/dsh@alpha` 实装 alpha.4，
> 关键产物证据链抽查无漂移——fork 签名逐字一致（§1.1 sessions）、`renderMessageImages` 仍为图片唯一入口
> （§1.2 chat.node）、`SettingsProvider.installSection` 导出面未再变（§1.1 settings）、SessionHeader 仍无 title
> （§1.1 sessionQuery）。逐条核验结论见 compat-audit.md 头部 alpha.4 核验段；机器化断言：`check:upgrade`
> 三层门禁全绿（check:dsh 漂移一致 + test:probe 31/31 + verify:host 装配断言通过）。本文件头部「对应版本」
> 已同步，本段与探针/verify-host 构成防漂移闭环——升级后 `npm run check:dsh` 捕获文档版本未同步即报红。
>
> **0.1.2-rc.1 升级核查（2026-09-03）**：`npm install -g @deepseek-ai/dsh@next` 实装 rc.1（候选发布版，
> 相对 alpha 线代码冻结，另发 alpha.5 基线）。关键产物证据链抽查无漂移——fork 签名逐字一致（§1.1 sessions）、
> renderMessageImages / ChatNodeKind 全集未变（§1.2 chat.node，探针 kind 断言全绿）、
> `SettingsProvider.installSection` 导出面未再变（§1.1 settings）、SessionHeader 仍无 title（§1.1 sessionQuery）、
> guard 的 shadowing priority 分配不变（I29）。**唯一注意点**：fork JSDoc 语义澄清——cut 边界取
> `atSeq` 之后第一次 `turn/end`（at-or-after），且 open turn 内的锚点「不可用而非向后裁剪」；
> 插件 `resolveCutSeq` 传的 cutSeq 本就是该消息之前最近一次 `turn/end` 的 seq，取 at-or-after 时
> 若锚点落在 open turn（运行中的 agent 回合）官方会拒 fork 而非裁剪——撤回触发时若目标消息位于
> 运行中回合内需留意（P0-1 agentBusy 拦截已挡运行中撤回，实际触发面小）。逐条结论见 compat-audit.md
> 头部 rc.1 核验段；机器化断言：`check:upgrade` 三层门禁全绿（check:dsh 漂移一致 + test:probe 31/31 + verify:host 装配断言通过）。

