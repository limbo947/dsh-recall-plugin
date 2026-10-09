# dsh v0.2.1-alpha.2 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.1-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.2)（prerelease，2026-10-09 发布；npm dist-tag `alpha` 指向本版，`next` / `latest` 仍 0.2.0-rc.2）
> 本地基线：`npm install -g @deepseek-ai/dsh@0.2.1-alpha.2` 全局实装（0.2.1-alpha.1 → 0.2.1-alpha.2，15 增 / 12 删 / 546 替换包 / 2 分钟；对照源：[dsh-0.2.1-alpha.1.md](./dsh-0.2.1-alpha.1.md)）
> 评估方式：release notes 逐条筛查 + **全树内容级 diff**（npm 侧另装 `0.2.1-alpha.1` 完整树 290 包作基线逐包比对 → 274 包有差异 / 1156 个真内容变更文件，关键契约文件再逐行 diff）+ **门禁实跑**（check:dsh / 单测 499 / client 90 / test:probe 52 / verify:host）+ 镜像按 tag 重拉比对
> 总结论：**零破坏、无需改码、peer 窗口无需追加**——插件依赖面的注册/消费契约（chat.node 槽位与 `ChatNodeOwnerProps`、`ChatNodeKind` 全集、fork/binding、updateQueue、设置 slot）均未漂移；真增量集中在插件不消费处（Agent Teams inbox 直投、子代理统一执行、渲染中间层、webserver 绑定与 TLS）或纯加法（`fork.allowMigration` 可选、`formatStatus` 迁移态、`appendPluginRecord` 实验接口）；既有 peer 段 `>=0.2.1-alpha.1 <0.3.0` 同 tuple 天然覆盖本版。

## 一、更新日志梳理与初步判断

release notes 共 40 余条（新增 / 修复 / 优化 / 调整）。下表列出与插件系统 / 消息处理 / API 接口相关、需要插件侧核查的条目及核查结果，其余合并为末行：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **Agent Team 消息改为直接投递目标 Inbox，移除独立 outbox、自动重试与重发去重**（破坏性） | 调整 | **中相关**——G1 队列清理涉及 inbox 入队 | **零交集**——inbox 直投落在 Agent Teams 协作层（`ctx.agentTeams`，实验性组合包）；插件的 G1 走 `ui-conversation` 的 `service.d.ts`（`updateQueue` 声明处）**逐字节相同**；`dsh-agent` 包除 lockstep 版本号与依赖顺序外**零内容变化**（`InboxState` 类型本就存在，非本版新增） |
| **统一子代理执行与完成通知，工具立即返回 child ID**（破坏性） | 调整 | **中相关**——子代理会话观测 | **零交集**——落点 `dsh-tool-subagent`：`Config` 移除 `enableRunInBackground` / `backgroundMode`，语义改「每次委派启动 managed activation 并返回 child id，运行时自管结果投递与资源清理」；插件不注册 tool、不消费该配置。插件用的 `sessionQuery` 消费面仅新增可选 `formatStatus` |
| **移除工具展示的 `both` 混合模式**（破坏性） | 调整 | 低相关 | 零交集——落点在工具展示策略配置与 API，插件零消费 |
| **新增 `working_directory` 工具 + TS/Python SDK 会话工作目录读写接口** | 新增 | **高相关**——快照范围假设（插件绑定工作区根） | **零破坏 + 假设获官方确认**——新包 `dsh-working-directory` / `dsh-tool-working-directory`；镜像 `09-architecture.md` 本版新增句「工作目录提供用户上下文和执行路径，**不改变原始项目标识、沙箱写入根目录或已有进程目录**」——影子仓库以工作区根为范围、以 `danger-full-access` 执行的前提不受影响；事件集同步新增 `working-directory/change`（见 §2.3） |
| **新增实验性插件的 Session 状态记录接口** | 新增 | 中相关——插件写会话日志 | 零交集——`dsh-session` 新增 `appendPluginRecord` / `pluginRecordOf` + `PluginRecordMap`；**仅官方 `packages/experimental/` 可调用**（`verify-plugin-record-callers` gate 拒绝其他生产调用方），插件不消费；`Session` 既有导出与 `SESSION_FORMAT_VERSION = 4` 未动 |
| **pi-ai 路由按模型能力处理会话内系统提示词更新与工具动态增删** | 新增 | 低相关 | 零交集——落点 `dsh-agent-loop` 的 `lib/index.js` 与轮次流程（`agent/pre-step` 的运行时上下文协调）；插件的快照触发（`session/event` → `user/message`）与 cutSeq 推导（`turn/end` / `turn/start`）不受影响 |
| **修复插件包元信息不可读或辅助请求扩展准备失败时整个请求被阻断** | 修复 | **中相关**——插件加载与请求链 | 零交集——`dsh-package-manifest`（仅版本号变化）与 `dsh-host-plugin-inventory`（仅 package.json）**零内容变化**；插件顶层 `icon` + `dsh.bundle.patch` 声明路径不变 |
| **侧栏 Fork 与子代理目录浏览新增迁移提示：遇到需迁移的会话时引导先打开原会话** | 优化 | **高相关**——fork 链路 | **零破坏（纯加法）**——`sessions.fork` options 新增可选 `allowMigration?: boolean`：实现为「`allowMigration === false` 且源会话非 live 且 `formatStatus === 'migration-required'` 才抛错拒绝」，插件不传 → 保持 Host 默认允许迁移；`fork(source, boundary?, childSessionId?)` 主体签名、`SessionForkError`、`buildForkSeed` 导出均未动；`ui-workspace.forkSession` 新增第三可选参数（插件走 `sessions.fork`，不经该封装） |
| **优化自动会话标题生成：同主题追问保留已有标题** | 优化 | 中相关——fork 继承标题（I6） | 零破坏——插件 fork 不传 `increaseTitle` 的继承路径未变；落点在 `dsh-base` 组合层（标题 LLM `maxOutputTokens: 64 → 4096`）与新增 `dsh-session-title-all-prompts-llm` 包 |
| **Web 支持绑定指定 IPv4/IPv6 地址，并可用 `--tls-cert` / `--tls-key` 配置原生 HTTPS** | 新增 | 低相关 | 零交集——`dsh-host-webserver` 的 `Config.host` 由 `'127.0.0.1' \| '0.0.0.0'` 放宽为 `string`、新增 `tls?` 与 `protocol` getter；插件走载体无关 exact 路由（I32），不硬依赖 webServer row |
| **移除 agent-instructions 插件的逐行 `dshHome` 配置**（破坏性） | 调整 | 低相关 | 零交集——落点在 `dsh-agent-instructions` 的 `config.d.ts` / `files.d.ts`；插件自管配置，不经该插件 |
| **移除 webhook 族包与 hooks 族包** | 调整 | 低相关 | 零交集——`dsh-webhook`、`dsh-webhook-github`、`dsh-hook-protocol`、`dsh-hooks-claude-code`、`dsh-hooks-codex`、`dsh-subagent-in-process-driver` 六个包整包移除（全树 diff「仅 alpha.1 有」清单），插件零消费 |
| 其余（字体设置、语音输入麦克风、思考翻译插件、Git Worktrees 插件、Official 按需安装、Windows PTY 清理、macOS 图标等） | 混合 | 零相关 | 零交集——落点均在插件不消费的 UI / 平台 / 分发面 |

## 二、实证核验

### 2.1 门禁实跑（本机 0.2.1-alpha.2 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm install -g @deepseek-ai/dsh@0.2.1-alpha.2` | 成功（15 增 / 12 删 / 546 替换 / 2 分钟）；`npm ls -g` 实测 `0.2.1-alpha.2` |
| `npm run check:dsh` | **全绿**——本地 `0.2.1-alpha.2` 落在既有 peer 段 `>=0.2.1-alpha.1 <0.3.0` 内（同 tuple，无需追加）；6 条 `dsh-*` peer 与 cordis / schemastery 全部在范围内；npm 最新仍 `0.2.0-rc.2`（无新版本） |
| `npm run test:probe` | **52/52 全绿**（api-surface 50 + stdin 写 2） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 13 项）；方言探针回归 `pwsh` |
| `npm test` / `npm run test:client` / `npm run typecheck` | **499/499**（39 文件）、**90/90**（6 文件）、`tsc --noEmit` 零错误 |
| 镜像重拉 | 按 tag `dsh-v0.2.1-alpha.2` 拉取 13 源：**仅 `09-architecture.md` 有实质差异（+68 B）、其余 12 份逐字节相同**（差异清单见 §2.3） |

### 2.2 差异比对方法与零改动集合

**方法**：在 npm 侧另装 `@deepseek-ai/dsh@0.2.1-alpha.1` 完整依赖树（558 包）作基线——与全局实装的 alpha.2 树逐包「归一化版本号后内容比对」（版本号全部 lockstep 变更，不可用版本号定位变更面），分层输出「文件集合增删 / 真内容变更 / 仅版本号差异」。结果：包集合 290 → 299（**净增 9**——移除 6 包、新增 15 包），274 包有差异、1156 个真内容变更文件、40 包纯版本号差异。npm 自身没有留下旧版本残留副本（本版清理成功），基线由显式安装获得。

**零改动集合（除 package.json 版本号 / README 文案 / 注释外无文件变化）**：`dsh-client-modules`（消费面 `lib/types/index.d.ts` 逐字节相同）、`dsh-client-ui-slots`（整包仅 package.json 2 行——keyed slot priority 分发机制零漂移）、`dsh-shell`、`dsh-settings`、`dsh-sandbox-policy`、`dsh-session-query` 的 `lib/types/types.d.ts` 之外部分、`dsh-package-manifest`、`dsh-host-plugin-inventory`、`dsh-jobs-local`、`dsh-atomic-write`、`dsh-fs-local`、`dsh-base` 的 `lib/`（AgentRegistry 与 `idle│running` 状态语义所在，**仅 `cordis.patch.yml` 组合层变化**）。

**消费/注册契约文件字节级相同**：`ui-chat` 的 `contract/chat-nodes.d.ts`（`ChatNodeKind` 全集）、`chat/MessageItem.d.ts`、`contract/slots.d.ts` 中的 **`ChatNodeOwnerProps` 定义**（含 `renderMessageImages` / `loadImage` / `forkAt` / `fileMentions` / `turnProcess`）与 **`'conversation.chat.node'` SlotMap 声明**（`kind: 'keyed'` / `scope: 'session'` / `keyProps` 全 kind 映射）；`ui-conversation` 的 `service.d.ts`（`updateQueue` 声明处）与 `contract/input.d.ts`（`InputActions.setDraft` 签名）；`api-session-controller` 的 `client/contract/sessions.d.ts` 中 `fork` 主体签名与 `binding` 面。

→ 台账相关不变量的出处包在本版未变动或仅纯加法，结论与探针锚点原样成立：**I1/I2/I4/I5（chat.node 槽位与消息投影）、I6（fork 不传 increaseTitle）、I7（归档 stopActivity）、I8/I28（`header.id` 与 SessionHeader）、I12/I39（设置卡片挂点）、I27/I36/I38（shell 接缝与方言）、I29/I31（inject 与 slots.entries）、I32（不硬依赖 webServer）、I33/I35（fork 切点与 seeded 会话读取）、I34（附件回填链）、I37（会话导航归属）、I40（子路径基址）**。

### 2.3 关键证据链逐项

| 消费点 | 0.2.1-alpha.2 实装结论 | 出处 |
|---|---|---|
| chat.node 槽位与撤回按钮 props（I1/I2/I4/I5） | `ChatNodeOwnerProps` 逐字节相同；`'conversation.chat.node'` 声明未动。本版 ui-chat 真增量全在**插件不消费侧**：新增 `conversation.chat.flow` 渲染中间层（`conversation.view` 的 `PropsRenderSlots` 由 `chat.node` 改为 `chat.flow`，官方 view 内部重构）、新增 `conversation.chat.reasoning.body` slot 与 `conversation.chat.reasoning.content` factory、`ChatNodeHookContext` 增 `useGroupAction`、`ChatNodeInjected.hooks` 增 `groupAction`、`ChatViewInjected` 增 `chatNodeBottom`、`ChatNodeSeat` 三个新入参——均为官方渲染分层的纯加法，keyed `chat.node` 贡献者注册路径不变 | 逐行 diff |
| 回填链（I34 + `refillDraft`） | `ui-conversation` 的 `contract/input.d.ts` **整文件逐字节相同**（`InputActions.setDraft` 与 `addAttachments` 面未动）；`service.d.ts`（`createDrafts` / `updateQueue` 所在）**逐字节相同**；本版该包真增量仅 `contract/request-inspection.d.ts` 的注释级增补与 `lib/client.js` 打包产物 | 整文件哈希 + 逐行 diff |
| fork / 队列（I6/I33/I35、G1） | `fork` 主体签名未动；新增可选 `allowMigration?: boolean`（`ISessions` 契约 + `SessionManager` + `typert` schema 三处一致；Host 实现仅在该值 === false 且源会话非 live 且需迁移时拒绝）。`updateQueue` 声明处逐字节相同。`SessionProjectionSnapshot.state` 增 `'migration-required'`、`SessionSummary` / `SessionListEntry` / `SessionRecord` / `SessionPersistenceSnapshot` 各增可选 `formatStatus`——纯加法 | 逐行 diff + 实现 grep |
| 归档与导航（I7/I37） | `ui-workspace` 的 `navigation.d.ts`：`forkSession` 仅新增第三可选参数（`Pick<Parameters<ISessions['fork']>[0], 'allowMigration'>`）；`openSession` / `startSession(workspaceId?, options?)` 签名不变 | 逐行 diff |
| 事件触发与 cutSeq（快照主链） | `KNOWN_SESSION_EVENT_TYPES` **59 → 60，仅新增 `working-directory/change`、零删除**——`user/message`、`turn/end`、`turn/start` 全在；`SESSION_FORMAT_VERSION` 仍为 **4**；`turn/end` 的 seq 语义与 `e.seq` 推导路径未动 | 集合差集 + 逐行 diff |
| shell 执行接缝（I36/I38） | `dsh-shell` 仅 package.json 变化；`dsh-session` 运行时产物差异为注释重写 + 新增导出（`appendPluginRecord` / `pluginRecordOf`）。失败分级与 `exitCode === null` 判定面未动 | 全包 hash |
| 设置卡片与配置读写（I12/I39） | `ui-plugin-manager` 的 `slot-contract.d.ts`：`PluginPackageRef` 新增 `availability` / `official` 两字段（配置卡消费的是 `ConfigForm`，未动）；`plugins.bundle.config` 与 `settings.plugin.item` 均在位；`dsh-settings` 仅 package.json 变化 | 逐行 diff |
| AgentRegistry（P0-1 运行中拦截） | `dsh-base` 的 `lib/` 零变化；本版组合层（`cordis.patch.yml`）改动为：新增 `working-directory` / `tool-working-directory` 两行、移除 `skill-badge` 与 `tool-ralph`（原即 disabled）、移除 subagent 行的 `backgroundMode` 配置——插件不消费 | 全包 hash + 组合 diff |
| 镜像文档 | 13 源中 12 份逐字节相同；`09-architecture.md` +68 B：删两句冗余导语、补 `preset` patch 层语义、移除 webhook 行、AgentLoop 与轮次流程改写（对应动态工具增删）、**新增「工作目录不改变沙箱写入根目录」句**、Agent Teams 改「直接 inbox 消息」 | SHA256 比对 + 逐行 diff |

### 2.4 观察项（非阻塞）

1. **`working_directory` 工具引入「用户上下文 / 执行路径」与「项目标识 / 沙箱写入根」的区分**：官方文档明示工作目录切换不改变写入根，插件的影子仓库范围因此成立；但若未来官方让写入根跟随工作目录（或允许会话级切换工作区），快照范围需重新评估——届时按 I11 / store 解析链复查。
2. **会话格式迁移态（`formatStatus: 'migration-required'`）进入 fork 决策**：本版仅显式 `allowMigration: false` 才拒绝。若未来 Host 默认改为「拒绝迁移」，撤回对旧格式源会话的 fork 会失败——届时需评估是否在 preview 阶段先读 `sessionQuery` 的 `formatStatus` 并给出专属提示。
3. **`appendPluginRecord` 是有门槛的实验接口**：官方 verify gate 只放行自家 `packages/experimental/` 调用方，第三方插件（含本插件）不可用；插件持久化（index.json / lineage.json）继续走自管文件。
4. **`conversation.chat.flow` 中间层的长期含义**：本版 `chat.node` 贡献者路径不受影响，但官方把「行序与本地回声」的编排上移到 flow 层——若未来官方要求节点贡献者在 flow 内注册，插件的 keyed 注册需迁移。
5. **既有观察项延续**：`fork.onCreated` 插件未用、`ToolCallBlock.root` 可选化、`sessionQuery` 三 API 仍 `@deprecated`。

## 三、结论

* **影响程度：零破坏。** 插件依赖面的注册/消费契约（`conversation.chat.node` 槽位与 `ChatNodeOwnerProps`、`ChatNodeKind` 全集、fork/binding、`updateQueue`、`setDraft`、设置双 slot）在本版全部零漂移；release notes 中标注「破坏性」的六条（both 展示模式、PTC 沙箱、agent-instructions 配置、子代理统一、Agent Team inbox 直投、SDK 默认 profile）落点**全部在插件消费面之外**，并经包级 diff 实证（`dsh-agent` 零内容变化、`dsh-agent-loop` 与 `dsh-tool-subagent` 的改动均不在插件调用路径）。
* **具体表现：无需改码、无功能退化，另有一处假设获官方确认。** 撤回主链路（preview → execute → 安全快照 → reset → fork → 归档 → 回填 + G1 队列清理）、P0-1 运行中拦截、P0-3 STALE 校验、设置页三卡片与快照管理均无漂移；`working_directory` 能力的新增文档明示「不改变沙箱写入根目录」，影子仓库以工作区根为范围的前提由官方明确背书。
* **版本策略：无需追加 peer 段。** 既有 `>=0.2.1-alpha.1 <0.3.0` 与 `0.2.1-alpha.2` 同 tuple，prerelease 门槛天然放行；cordis 4.0.5-alpha.1 与 schemastery 3.18.5-alpha.1 两条独立版本线本轮未动。台账动作仅为：`dsh.compatibility.dshReleases` 补 `0.2.1-alpha.2: compatible`、`docs/dsh-contract.md` 与 `docs/reference/README.md` 版本字段随镜像同步（已完成）。
