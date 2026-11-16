# dsh v0.2.2-rc.2 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.2-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.2)（prerelease，2026-11-11 发布，0.2.2 线第二个候选版；21 位贡献者、commit `ddac967`）
> 本地基线：升级前全局实装 `@deepseek-ai/dsh@0.2.2-rc.1`；本轮为**单版增量**（rc.1 → rc.2，中间无其他版本）。对照源：[dsh-0.2.2-rc.1.md](./dsh-0.2.2-rc.1.md)
> 评估方式：release notes 56 条逐条筛查 + **两棵实装树逐文件 SHA256**（旧实装目录改名作基线、新装对比；包集合 329 → 336；排除 `*.map` 后 182 包 `lib`/`dist` 漂移）+ 消费点 `.d.ts`/实现逐行 diff + 门禁实跑 + 镜像十三次重拉
> 总结论：**零破坏**。插件全部调用点（fork 切点与种子、附件回读与草稿回填、消息重绘入口、会话导航与归档、槽注册、设置热更、`/api/recall` 端点）在 rc.2 上逐字节未变；四条进入邻域的演进（Session 批量追加、fork 标题跳号、归档清理 worktree、工具错误收口）逐条排除。方向**中性偏正**：插件加载失败降级、聊天增量失败重建、重复提交与重复唤醒修复都朝插件依赖的方向走；唯一的行为联动是 Forge/Worktree 会话被归档时的目录清理，属官方归档语义、非插件引入。

## 一、更新日志梳理与初步判断

release notes 共 56 条（3 新增 / 27 优化 / 26 修复 / 20 其他，其他段含大量 Breaking 与迁移说明）。按插件实际消费面筛，只有七条需要深挖，其余 49 条按「插件未使用该能力」逐条排除：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **Session 支持批量追加事件（日志格式不变），自定义追加接口的包装代码需适配批量调用**（其他-13） | Breaking（notes） | **高相关**——`session/event` 是快照触发点 | **零影响**——`Session.append` 新增数组重载（首参非字符串进 `#appendEvents`）+ `SurfaceManager.prepareBatch`；`session/event` 仍按**每个事件各派发一次**，只是派发期间 `session.seq`/`session.surface` 已含完整 batch。插件 handler 只读 `event.type` / `event.data.id` / `data.source.kind` / `event.time` / `session.header.origin`，不读 `seq`/`surface`，也从不 append（§2.3） |
| **修复重复创建会话分支时的标题编号，跳过已用编号**（修复-11） | 行为修复 | **中相关**——撤回每次都 fork 并继承标题 | **零影响**——`increasedForkTitle(title, taken)` 只在该次 fork 传了 `increaseTitle`（`sourceTitle !== undefined`）时执行 rename；插件刻意不传（避免「xxx 2」递增），子会话标题仍原样继承（§2.3） |
| **归档会话默认清理符合条件的 Git 工作树，保留分支与提交**（其他-2） | 行为变更（含迁移） | **中相关**——撤回 execute 末尾归档原会话 | **非 worktree 会话零影响**——清理由 `dsh-experimental-worktree` 的 `WorktreeReclamation` 监听 `workspace/session-archived` 执行，判据是会话 projection 中 `created` 且 `owned` 的 worktree 并通过 `unused()`；`dsh-workspace` 只新增两个并行事件（`session-archived` / `session-unarchiving`）与「durability → 停止请求 → 后续接纳」返回语义，`archiveSession(id, { stopActivity: true })` 签名未变（§2.4） |
| **工具失败提供更明确的错误类型与代码；依赖旧错误分类的插件需适配**（其他-14） | Breaking（notes） | **中相关**——插件按 `code` 处理附件回读失败 | **零影响**——新包 `dsh-error` 提供 `HarnessError`；`dsh-attachment` 的 `AttachmentError` 由裸 `Error` 改为继承它（`code` 与 `ATTACHMENT_ERROR_CODES` 集合逐字未变），`dsh-shell-env` 同款。插件不依赖原型链、只按 `code` 降级（§2.4） |
| **可选插件加载失败导致整个 Web 页面无法启动**（修复-3） | 稳定性修复 | **低相关（正向）** | **正向**——`dsh-client-modules` 的 `ClientEntries` 改为「单行创建失败记日志、留作 inactive entry」，插件加载异常不再拖垮整页（§2.5） |
| **聊天更新出错后，历史加载和新消息显示持续卡住**（修复-10） | 稳定性修复 | **低相关（正向）** | **正向**——新增 `ConversationUpdateError`（`rebuilt: true/false`）与「完整重建窗口 + 替换视图」回退，插件消息节点随视图重建恢复（§2.3、§2.5） |
| **发送消息或准备附件期间重试请求，导致同一消息被重复提交**（修复-13） | 行为修复 | **低相关（正向）** | **正向**——配合输入提交 `sending` 相位与 `submit(…, allowEmpty)` 纯加法重载，编辑重发链更稳（§2.4） |

**逐条排除的其余条目**（选择依据：插件不注册工具、不跑 PTC/SDK、不使用子代理编排、不直连搜索与 Office/Computer Use、不读凭据、不注册 Conversation Definition）：

- **插件系统能力**：插件动态注册/移除/重启 MCP 服务（其他-5，新包 `dsh-mcp-manager`）、按语言扩展聊天代码块（其他-6，新 hoc 槽 `conversation.chat.markdown.fence`）、插件索引展示 Star/下载量（其他-7）——均为新增扩展点，插件未注册；左侧栏插件入口收纳（优化-3）、插件导航与会话列表共用滚动区（优化-9）为布局调整，插件入口在消息气泡内。
- **Agent/子代理**：AgentTeam 改用统一具名子代理、中断工具默认关闭（其他-3）、`agents.create` 移除 `parentAgent`、`AgentRegistry.enter(agent)` 去掉 owner 参数——插件只用 `ctx.agents` 做 `agentBusy` 判定（`agents.get`），不创建 agent。
- **会话与上下文**：PTC 工具调用总量限制（其他-12）、Anthropic 签名 thinking 省略（修复-22）、会话恢复/压缩后的上下文提示（优化-16）、自动加载更早消息（优化-12 + `ChatViewInjected.consumeOlder`）——插件不使用 `loadOlder`，消息节点由官方流驱动。
- **输入与粘贴**：未聚焦输入框时也可粘贴到最近可用输入框（优化-18）——新增文档级粘贴路由 `registerFileIntake`，判据 `EDITABLE = input, textarea, select, [contenteditable]`，插件编辑卡用 `textarea` 命中即跳过（§2.4）。
- **模型与搜索**：Gemini 原生接口、模型请求重试策略、API Key 掩码、DeepSeek Search API 默认化、单次多查询——插件只经 `ctx.modelDirectories` 读模型目录（`dsh-client-ui-model-selection` 仅新增 `conversation.input.model.options` 纯加法槽，`conversation.input.model` 的 owner props 未变）。
- **平台与其他**：Tools/Office/Computer Use/LiveShare/终端面板/Windows 目录授权/Zod 与 Stagehand 升级——插件不涉及；`dsh-office-to-pdf` 与 `dsh-experimental-agent-team*` 的包合并/移除在包集合中可见，但不在调用点。

## 二、实证核验

### 2.1 门禁实跑（本机 0.2.2-rc.2 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test`（unit） | **597/597** |
| `npm run test:client` | **142/142** |
| `npm run test:probe` | **59/59**（直接对本机 rc.2 实装的 API 面断言） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 13 项） |
| `npm run check:dsh` | 本地 0.2.2-rc.2、六条 `@deepseek-ai/dsh-*` peer 与 cordis `4.1.0`、schemastery `3.19.0`（dsh 树内；全局根另有一份 `3.18.4`，两者都在 `^3.18.1` 内）全满足；镜像/契约字段回填后全绿 |
| `npm run build` | 未改源码，`lib/` 无变更 |
| 宿主冒烟 | 沿用 rc.1 的 web 宿主结论（`--profile web` 页面 200、模块清单含 `dsh-recall-plugin`、stderr 仅 `recall shell dialect probe: pwsh`）；本版 `dsh-client-modules` 的加载降级与 `dsh-web-frontend` 的构建指纹变化不影响该链路 |

> `/api/recall/*` 走 connection 的载体无关 fetch 路由，不经 web 服务器 HTTP 面；装配与端点注册由 `verify:host` 断言覆盖。

### 2.2 包集合与漂移面

**329 → 336 包**：移除 7（`dsh-experimental-agent-team` / `-profile` / `-client-ui-agent-team` / `-tool-agent-team` 四包与 `dsh-experimental-agent-team` 五件套合并为 `dsh-agent-team` / `dsh-tool-agent-team` / `dsh-client-ui-agent-team`；`dsh-api-account-controller` + `dsh-deepseek-account-platform` 并入 `dsh-client-ui-account-notifications`；`dsh-office-to-pdf` 由 `dsh-office-kit` / `dsh-tool-office` / `libreoffice-kit-wasm` 取代）；新增 13（Computer Use 三包回归 `dsh-computer-use` / `dsh-cua` / `dsh-cua-bundle`、`dsh-mcp-manager`、`dsh-terminal-panel`、`dsh-error`、`dsh-util-ripgrep`、`dsh-client-ui-account-notifications`、`dsh-agent-team` 三件套、`dsh-office-kit` / `dsh-tool-office` / `libreoffice-kit` / `libreoffice-kit-wasm`）。

**逐字节零漂移的消费面**：`dsh-shell`（`resolve`/`run`/`execute` 与 `setDraft`/`submit`/`addAttachments`/`snapshot`）、`dsh-client-ui-slots`（槽框架与 priority 冲突机制）、`dsh-settings`（`installSettingsSection`/`installSection`/`register` + volatile 热更）、`dsh-host-webserver`（exact 路由注册面）、`dsh-session/fork` 子路径（`buildForkSeed` 整文件）。这三包零漂移直接决定了：git 执行链、附件/草稿链、槽注册与设置热更链不动。

**第三方依赖与运行时**：cordis `4.1.0`、schemastery `3.19.0`、Node `>=24.9.0` 与 rc.1 完全一致；**事件集** 62 → 63（`dsh-session` 的 `KNOWN_SESSION_EVENT_TYPES` 新增 `team/mode`）。

**哈希漂移的两个噪声源**（核验时必须排除，否则结论不可用）：
1. **sourcemap 补齐**：多个包新增 `*.d.ts.map` / `*.js.map`，纯构建元数据；
2. **客户端产物单行压缩**：本版把多数 `client.js` 压成一行（`window.__ModuleLoader__.load({id, factory})` 形态未变），导致 `dsh-client-ui-chat` 等包出现「1 增 N 删」的巨型 diff，逐个核对注册首行后确认无契约变化。

### 2.3 关键包逐行 diff（插件消费点）

- **`dsh-session`**（7 文件 / `index.js` +151−79）：新增 `append(inputs: readonly SessionEventInput[])` 重载与 `#appendEvents`、`SurfaceManager.prepareBatch(events)`、`currentBatchPublication` 只读访问器；`append(type, data, ...opts)` 保持单事件签名，`commit`/`publicationEntry` 路径未变；`session/event` 发布仍走 `invokeContainedSessionObservers` 的**逐事件**循环。类型面只加 `SessionEventInput` 与 `prepareBatch`。插件不 append、不读 batch 状态 → 兼容。
- **`dsh-api-session-controller`**（24 文件 / Host `index.js` +139−42、客户端 `session.js` +138−48）：`fork(request)` 段（`boundary` 校验 + `buildForkSeed(source.events, boundary)`）不在任何 diff 块内，逐字未变；`sessions.fork` 客户端只改标题跳号（见 §2.4）与注释；新增 `types/continuation.d.ts`（空 draft 继续生成）、`retry-rpc` 源、`InputHub.retry`；`readAttachment` / `createDrafts` / `updateQueue` / `releaseDraftAttachments` 的客户端签名与实现一处未动；`SessionManager` 移除 `agentAvailable` / `updateParentAvailability`（子代理可用性模型简化，插件未用）；`archived-session-gate` 仅注释与「子代理中间态血缘复查」。
- **`dsh-client-ui-chat`**（18 文件 / `client.js` 压缩化）：`ChatViewInjected` 增 `consumeOlder`；`ChatViewSlotProps` 增 `'conversation.chat.markdown.fence'`；新增 `conversation.chat.markdown.fence`（`kind: 'hoc'`，按语言包裹代码块）；`conversation.chat.node` 的 key 集合与 `ChatNodeOwnerProps` 核心字段未变（`message.d.ts` 只把 `turn-trigger` 注释改为「记录的通知或手动续写开启 Turn」）；`TurnTailNodeView` 仍以 `closing.finalNode.messageId` 是否存在决定是否渲染 `conversation.chat.assistant-actions`——版本翻页器的槽位与注入 sessionId 语义不变。
- **`dsh-client-ui-conversation`**（16 文件）：`InputActions.submit(mode?, source?, allowEmpty?)`、`insertQuote(text, summary?)` 为纯加法；`DraftSnapshot` / `setDraft(text)` / `addAttachments` 未变；`DraftQuote` 增可选 `summary`；新增 `input/file-intake`（文档级粘贴路由，含 `EDITABLE` 判据）与两个 root `hoc` 槽（品牌 mark）；`ConversationUpdateError` + 重建回退（见 §2.5）；`[data-composer-card]` 与 `data-slot="conversation.input.permission"` / `conversation.input.model` 在新产物中仍在——编辑卡的 chip 抄值链未断（已实查新 `client.js`）。
- **`dsh-workspace`**（3 文件）：`archiveSession` 签名与 `ArchiveSessionOptions` 未变；新增 `workspace/session-archived`（`@mode parallel`，持久归档与停止请求之后派发）与 `workspace/session-unarchiving`（取消/结算归档后续工作，拒绝则保留归档态）两个事件；返回语义扩为「durability → 停止请求 → 后续接纳」。
- **`dsh-client-modules`**（3 文件）：`ClientModuleRegistry` 只改 release commit 字面量（`c59d10a` → `a6b1b85`）；`ClientEntries.initialize` 增加「单行创建失败留作 inactive entry」的降级。
- **`dsh-attachment`**（`index.js` +7−9）：`AttachmentError` 由裸 `Error` 改为 `extends HarnessError`（`super(message, code, options)`），新增 `isAttachmentError` 兼容跨包副本；`ATTACHMENT_ERROR_CODES` 集合未变。
- **`dsh-app-boot`**（`index.js` +37−17）：环境变量层的路由白名单（`isHomeLayerRouteName` / `HOME_LAYER_ENDPOINT_NAMES`）与 `.env` 提示文案——对应「DSH 用户目录配置 DeepSeek 端点后无法启动」的修复；兼容性门禁（`engines.dsh` 优先 / peer 回退）未变。

### 2.4 生态 Breaking 与插件的距离

notes 里的四条生态 Breaking 都在插件路径之外，或只与插件共享一个稳定的次级契约：

1. **`agents.create` 移除 `parentAgent`、`AgentRegistry.enter(agent)` 去掉 owner**（AgentTeam 统一具名子代理）——插件只经 `ctx.agents` 读活体（`agents.get`），不创建 agent，也不建子代理树。
2. **工具错误类型细化**（`dsh-error` / `HarnessError`）——插件不注册 tool；对附件链只消费 `code`，而 `code` 集合与 `readAttachment` 的入参形状都没变（0.2.2-alpha.2 的 B1 修复路径仍成立：完整引用 → 裸 id 探测回退）。
3. **归档清理 Git 工作树**——只在 `dsh-experimental-worktree` 挂载时生效，且只处理 `created` 中 `owned` 的 worktree。插件归档普通项目会话不受影响；若用户启用 Forge/Worktree 并在工作树会话里撤回，原会话归档会按官方默认清掉该工作树目录（保留分支与提交），需保留时在 worktree 设置里关闭清理。本机 web profile 未启用该能力（依赖仅 `dsh-better-sidebar` / `dsh-connect-trae` / `dshmarket` / skill-explorer 等第三方）。
4. **composer 文档级粘贴路由**——`registerFileIntake` 的 document 级监听先判 `origin.closest(EDITABLE)`，命中即返回；插件编辑卡用 `textarea`（`EDITABLE` 含 `textarea`），所以卡内粘贴/拖入不会同时进底部输入框，无重复附件风险。

### 2.5 运行时行为抽查（静态确认 + 消费点）

- **快照触发时机**：`session/event` 的派发次数与事件对象形状未变；插件在 handler 里只做「`user/message` + `source.kind === 'user'` + `origin !== 'subagent'`」判定，随后异步入队（`resolveRoot` → 串行队列），与 batch 提交顺序无关。
- **撤回 execute 链**：`preview`/`execute` 的 cutSeq 解析读 `sessions.get` / `sessionQuery.observeSession`（`dsh-session-query` 只加 `inspectSession` 纯加法），`fork` 的 `atSeq` 边界校验与种子构造未变；归档仍走 `archiveSession({ stopActivity: true })`，`stopActivity` 抑制语义未变（`dsh-workspace` 新增的是归档**之后**的接纳事件）。
- **消息重绘**：`conversation.chat.node` keyed 槽的 `key` 覆盖 `['user','steering']` 与负 priority 递减重试机制由 `dsh-client-ui-slots`（零漂移）保证；`renderFactorySlot` / `loadImage` / `conversation.user.text` 投影链未变（`ChatNodeOwnerProps` 只增不改）。
- **版本翻页器**：`assistant-actions` 槽仍由 `TurnTailNodeView` 在「回合有最终消息」时渲染 `{messageId}`，`inject(scopeId)` 仍收 sessionId；无最终消息时切到会话头兜底（issue #35 的双入口设计已覆盖）。
- **编辑卡 meta 抄值**：`[data-composer-card]` / `conversation.input.permission` / `conversation.input.model` 三个选择器在新产物中仍命中（实查 `dsh-client-ui-conversation/lib/client.js`），图标/权限 chip 文本来源不变。
- **聊天增量失败重建**：`ConversationUpdateError(rebuilt)` + 完整窗口重放是官方新增的容错路径；插件节点不实现 Conversation Definition，异常恢复对插件只表现为「视图重建后重新渲染」。

未做本轮的真实浏览器活体回归（撤回 → fork → 回填 → 编辑重发）：消费面零漂移 + 59 条 API 探针全过 + 装配断言通过已能支撑结论；本版唯一新增的输入侧交互是文档级粘贴路由，已按判据静态排除。发版前如需双保险，按 [smoke-checklist-records](../plans/completed/smoke-checklist-records.md) 第十二节补跑一次。

## 三、影响面结论

| 模块 | 影响 |
|---|---|
| 影子快照 / gc / 护栏 / 串行队列 / 宿主端点 | 无（`dsh-shell`、`dsh-host-webserver` 逐字节相同；`dsh-session` 的批量接口不改变 `session/event` 派发；装配断言 13 项全过） |
| 撤回 execute（preview → 安全快照 → reset → fork → 归档 → 打开） | 无（`fork` 实现与 `buildForkSeed` 未动；`archiveSession` 签名未变） |
| 撤回回填（文本 / 图片 / 附件引用） | 无（`readAttachment` / `createDrafts` / `setDraft` 未变；`AttachmentError` 只换基类不改 `code`） |
| 编辑并重发（编辑卡 / 提交链 / 自动发送） | 无（`submit` 只增可选第三参；`DraftSnapshot` 与 `data-slot` 锚点未变；粘贴路由不覆盖 `textarea`） |
| 版本翻页器 / 快照管理 / 队列清理 | 无（`openSession` / `unarchiveSession` / `updateQueue` 未变；`assistant-actions` 渲染判据未变） |
| 设置卡片与 volatile 热更 | 无（`dsh-settings` 逐字节相同） |
| 插件加载与安装 | 正向（可选插件失败不再拖垮整页、未加载插件标注「未运行」及原因） |
| 聊天视图容错 | 正向（增量更新失败回退完整重建，不再长期卡住） |
| 撤回后原会话归档（Forge/Worktree 用户） | 官方行为联动（原会话如持有 owned worktree，归档默认清理该目录并保留分支；本机 profile 未启用） |
| 未来若注册代码块扩展 / 输入区选项 / 继续生成 | 有现成纯加法槽可用（`conversation.chat.markdown.fence`、`conversation.input.model.options`、`InputHub.retry`），当前未接入 |

**方向与程度**：中性偏正，零功能级回归，零代码改动，零 peer 段追加。正向面集中在「插件加载容错、聊天视图自愈、重复提交/重复唤醒修复」；风险面只有一条**行为联动**（归档清理 worktree）与两条**能力机会**（fence 槽、`retry`），都不在插件当前实现路径上。

## 四、台账同步与观察项处置

- `package.json`：`dsh.compatibility.dshReleases` 补 `0.2.2-rc.2`；peer 范围**不变**（`^4.0.1` / `^3.18.1` 覆盖 cordis 4.1.0、schemastery 3.19.0；`>=0.2.2-alpha.1 <0.3.0` 覆盖 rc.2）。
- `docs/reference/`：第十三次重拉（`dsh-v0.2.2-rc.2`），13 源中 3 份有差异（01-quickstart 链接、09-architecture 事件域与 AgentLoop/Agent Teams 段、11-cookbook-conversation-node 的 Window 更新路径与不变量 9），其余 10 份逐字节相同。
- `docs/dsh-contract.md`：对应版本 → 0.2.2-rc.2（rc.1 降为「上一轮版本」）；沿革补 ⑭；事件集 62 → 63（补 `team/mode`）；内置 Tool 清单校正为 26 项（补 `agent-team` / `office`，并补齐此前遗漏的 `present` / `schedule` / `workspace-dependencies`、去掉已不存在的 `subagent-report`）。
- `docs/compat-audit.md`：新增 0.2.2-rc.2 核验段。
- `README.md` / `README.en.md`：DSH 徽章与支持范围 → `0.2.2-rc.2`；「已知限制」补 Forge/Worktree 交互一条（归档会清理本会话创建的工作树）。
- `AGENTS.md`：台账索引 I1-I46 → I1-I47；「漂移控制」补逐字节对比的两个噪声源（排除 `*.map`、核对 `__ModuleLoader__.load` 首行）。

三条观察项已各自落地，不再留作待办：

| 观察项 | 处置与落点 |
|---|---|
| 客户端产物压缩化导致逐字节哈希失真 | 写进 `AGENTS.md`「漂移控制」与 [compat-audit.md](../compat-audit.md) 头部 rc.2 段，方法固定为「排除 `*.map` + 逐包核对注册首行」 |
| 批量 append 下 `session.seq` 语义前移 | 写进 [dsh-contract.md](../dsh-contract.md) §四事件集说明：监听器逐事件收到 `session/event`，但 `seq` / `surface` 已含整个 batch；当前插件不读 `seq`，新增读 `seq` 的逻辑须避开派发期 |
| 撤回 + Forge/Worktree 的目录清理 | 写进 `README.md` / `README.en.md`「已知限制」：可在 Worktree 设置关闭归档清理，或撤回后解档原会话（翻页器切换目标时自动解档）；属官方归档语义，非插件缺陷 |
