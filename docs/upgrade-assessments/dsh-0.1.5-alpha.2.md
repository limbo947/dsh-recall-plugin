# dsh v0.1.5-alpha.2 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.1.5-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.2)（commit `b2e3b2a`，2026-09-09 发布；pre-release，**npm dist-tag `alpha` 尚未指向本版**——registry 现仍为 0.1.5-alpha.1，本地升级须等官方推包）
> 本地基线：dsh 0.1.5-alpha.1（上一评估基线，全局实装）；对照源：[dsh-0.1.5-alpha.1.md](./dsh-0.1.5-alpha.1.md)
> 评估方式：release notes 筛查 + **官方 dsh-v0.1.5-alpha.2 tag 源码实证**（ui-chat 槽位契约 / session-controller fork 契约 / slots.md 层级树 / 面板与文件交付决策文档）+ 与本地基线逐项 diff
> 总结论：**接口层面零破坏、行为层面无回归——无需任何代码修改。** 核心三链（撤回主链路 fork、快照触发/冷读、撤回按钮 UI 渲染）依赖的契约在 alpha.2 全部逐字保留；唯一结构变化（conversation 槽位迁入 `main.conversation`）是宿主面板挂载层调整，按 key 注入的插件注册不受影响。需跟进项（peer 范围越界 / 镜像漂移 / npm 推包后三层门禁复跑）均为发布前例行，非代码缺陷。

## 一、更新日志梳理与初步判断

按「是否命中插件依赖面」（对照 [dsh-contract.md](../dsh-contract.md) 建档的依赖面）筛选 release notes：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **Web 插件面板 API 调整**：新增 `sidebar.panellist`/`main` 全局面板注册；原 `conversation` Slot 迁移为 `main` 的 `conversation` key | 其他 | **高疑点**——直接命中插件 `conversation.chat.node` 注册路径（I1/I29 盯防对象） | **无破坏**，见 §2.1 |
| **模型显式交付文件**：`deliverables/presented` 事件 + 附件字节 + Sidebar 预览/默认应用打开 | 新增 | 中疑点——可能引入新事件类型/消息内容，触及插件冷读面 | **无影响**，见 §2.2 |
| **Session 数据格式 V3**（chore 段落 + 迁移 README 落库） | 其他 | 已于 alpha.1 深挖 | **无新变化**，见 §2.3 |
| **极简模式默认工具调整**：minimal/sdk-minimal 仅持久 shell，`str_replace_editor` 显式启用 | 其他 | 低疑点 | 无关——插件 shell 走宿主身份固定模板（`danger-full-access`），不依赖模型工具集 |
| Sidebar 文档类型预览、`/feedback` 明细、pi-ai 诊断保留、Base URL 校验、Windows 目录选择器置前、Composer 占位修复、MCP 分页游标去重、fs-ext 免编译、设置本地化 | 新增/修复/优化 | 无关 | 无关——UI/模型/MCP/发布层，与撤回链路零交集 |

**初步判断：本轮唯一需深挖的是「面板 API 调整」**——它改变了插件注册的槽位树宿主层级；文件交付功能需确认事件/格式代际是否变动。

## 二、详细变更核查（官方 dsh-v0.1.5-alpha.2 tag 源码实证）

### 2.1 Web 插件面板 API 调整（关键疑点，逐项排除）

**官方变更本质**（[global-main-panels 决策文档](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-alpha.2/.agents/notes/implemented/architecture/2026-09-08-global-main-panels.md)）：布局新增 root-scoped keyed `main` slot，原顶层 `conversation` 槽位迁入 `main.conversation`；左侧栏新增 `sidebar.panellist`（空列表无 DOM/间距）。**迁移的是宿主面板挂载层，不是节点槽位契约。**

对比 alpha.1 → alpha.2 槽位树（[slots.md](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-alpha.2/docs/subsystems/slots.md)「Current hierarchy」）：

- alpha.1：`root → conversation → conversation.session → … → conversation.chat.node`
- alpha.2：`root → main → main.conversation → conversation.session → … → conversation.chat.node`

**关键点：所有 key 名不变，仅多出 `main` 一层祖先。** [ui-chat contract/slots.ts](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-alpha.2/packages/client/ui-chat/src/client/contract/slots.ts)（alpha.2 tag）实证 `conversation.chat.node` 槽位声明**逐字段未变**：

```ts
'conversation.chat.node': {
  kind: 'keyed'
  scope: 'session'                                  // 仍是 session 域，未变 session-maybe
  owner: ChatNodeOwnerProps                          // 含 loadImage / renderMessageImages（原样保留）
  keyProps: { [Kind in ChatNodeKind]: { node: ChatNode<Kind> } }
  hookContext: ConversationLocationDataStore<ConversationTurnDataMap> | undefined
  inject: ChatNodeTurnDataInjected
}
```

1. 插件注册走 `ctx.slots.inject('conversation.chat.node', …)` 按 **key** 注入（[app.ts](../../src/client/app.ts)），不依赖挂载层级——树多了 `main.conversation` 祖先不影响注入匹配。
2. 官方 alpha.2 [conversation.zh.md](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-alpha.2/docs/subsystems/conversation.zh.md) 第三方节点扩展示例仍原样使用 `conversation.chat.node` 注册路径，印证该 key 是稳定公共契约。
3. `settings.plugin.item`（撤回设置卡片）在 alpha.2 层级树中完整保留（`root → sidebar → settings.section → settings.plugins.tab → settings.plugin.item`）。
4. `ChatNodeOwnerProps` 新增 `fileMentions`、`turnProcess?` 两个成员（官方新增能力），均不破坏插件——keyed renderer 组件实际只接收 `keyProps.node`（[recall-node.ts](../../src/client/recall-node.ts)），对新增 owner 字段天然免疫。

### 2.2 模型显式交付文件（排除）

官方 [web-explicit-file-delivery 决策文档](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-alpha.2/.agents/notes/archived/feature/2026-09-08-web-explicit-file-delivery.zh.md) 明确：

1. 新增**持久事件 `deliverables/presented`** + `present` 工具，成功最终 `tools/result` 后追加到调用方 Session——**不修改已发布的格式代际**，attachment 服务/格式不变。
2. 事件「required-on-read」——该语义针对**直接解析 session 日志的读取器**（旧读取端拒绝读取，避免静默丢引用）。插件读取全走官方面（`sessions.get` / `sessionQuery.readSession` / `session/event` 订阅 / `listSessions`），从不直接解析日志文件，官方 codec 自带新事件处理，对插件透明。
3. 插件消费的事件类型（`user/message`、`turn/end`、`session/title`）在 V3 事件清单中未变动；新事件 `deliverables/presented` 插件零消费。

### 2.3 Session 格式 V3 与 fork 契约（无新变化）

- alpha.2 相对 alpha.1 的 V3 仅是补充迁移 README 文档，格式代际（54 种事件）无新增破坏；alpha.1 已从迁移源码逐项排除 seq 位移/主键/id 影响（[dsh-0.1.5-alpha.1.md](./dsh-0.1.5-alpha.1.md) §2.1）。
- [session-controller 契约](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-alpha.2/packages/api/session-controller/src/client/contract/sessions.ts)（alpha.2 tag）实证 `ISessions.fork` **签名逐字不变**：`fork(opts: { sessionId; atSeq?; increaseTitle? })`，JSDoc 语义（cut 边界 = atSeq 之后第一次 turn/end，open turn 锚点不可用而非向后裁剪）与 I6 台账记录一致——零漂移。

### 2.4 其余交叉项

- **I29 client 服务层**：alpha.2 无服务层重组（变更集中在面板/交付/反馈），插件 `inject` 声明与服务访问不受影响。
- **MCP/子代理工具筛选修复**：与插件无关（插件不注册工具、不构造子代理）。
- **npm 发布状态**：`npm view @deepseek-ai/dsh dist-tags` 实证 `alpha` 现仍指向 `0.1.5-alpha.1`（alpha.2 tag 发布数分钟，registry 未同步）——本地升级须等官方推包后执行。

## 三、与插件功能实现的关联分析

**核心依赖面全部命中「契约未变」**：

| 插件模块/功能点 | 依赖面 | alpha.2 实证 |
|---|---|---|
| 撤回按钮注册（[app.ts](../../src/client/app.ts)） | `conversation.chat.node` keyed/session | 槽位声明逐字段不变，仅宿主层级多一层 `main.conversation` |
| 设置卡片（[settings-cards.ts](../../src/client/settings-cards.ts)） | `settings.plugin.item` | 层级树保留（settings → settings.plugins.tab） |
| 用户消息重绘（[recall-node.ts](../../src/client/recall-node.ts)） | `renderMessageImages` / `loadImage` | `ChatNodeOwnerProps` 原样保留两个字段 |
| 对话回退 fork（[snapshots.ts](../../src/host/snapshots.ts)） | `sessions.fork({sessionId, atSeq, increaseTitle})` | 签名 + JSDoc 语义零漂移 |
| 快照触发/冷读/scanCutSeq | `session/event`、`user/message`、`turn/end`、`session/title` | V3 事件清单不变；新事件 `deliverables/presented` 插件零消费 |
| 影子 git / exclude / 配置域 / 串行队列 | 与 dsh 变更零交集 | — |
| P0-1 agent 拦截 | `ctx.agents`（复数） | 无相关变更 |

**不受影响的模块**（证据充分）：撤回主链路、快照触发/影子 git/exclude/配置域、P0-1 agent 拦截、设置页/token 面。

**观察项（均为 alpha.1 遗留，非本次引入）**：

1. 带文件附件消息的撤回重绘仍缺失——官方新增「显式文件交付」卡片渲染（ui-deliverables），不改变插件重绘路径，观察项维持；
2. 旧会话（V1/V2）撤回切割正确性——V3 迁移产物上的实弹冒烟结果以 0.1.5 为准；
3. `ChatNodeOwnerProps` 新增 `turnProcess` 表明官方 turn 呈现细分在演化——插件 keyed renderer 只消费 `node.data`，自然免疫，未来若官方改 keyProps 形状需复核 I4。

## 四、影响评估结论

**总体结论：接口层面零破坏、行为层面无回归——无需任何代码修改。**

- **影响程度：无破坏性影响**。核心三链（撤回主链路 fork、快照触发/冷读、撤回按钮 UI 渲染）依赖的契约在 alpha.2 全部逐字保留。
- **具体表现**：沿用现有插件在 alpha.2 上功能与 0.1.5-alpha.1 一致（撤回按钮、fork 回退、设置页均正常），无失效点。
- **正面影响（被动）**：alpha.1 的本地 POSIX 路径图片重绘修复沿续；Sidebar 预览等新增 UI 与插件零交集。

## 五、后续动作

1. **等待官方推包**：`npm view @deepseek-ai/dsh dist-tags` 显示 `alpha` 仍为 0.1.5-alpha.1；推包后本地 `npm install -g @deepseek-ai/dsh@0.1.5-alpha.2` 升级基线。
2. **三层门禁复跑**（npm 推包后）：`npm run check:upgrade`（check:dsh 报漂移/peer 越界 + test:probe 关注事件全集增量 + verify:host 装配断言）。
3. **同步兼容声明**：package.json `dshReleases` 矩阵补 `0.1.5-alpha.2`、7 个 dsh-* peer 范围补 `|| >=0.1.5-alpha.2 <=0.1.5-alpha.2` tuple（沿 9c3c56b 先例）。
4. **同步契约文档**：reference/ 重拉归档（更新 reference/README.md 归档版本字段）、compat-audit 追加核验段（含新事件 `deliverables/presented` 的零消费记录）、AGENTS 版本字段。
5. **冒烟（人工）**：沿 alpha.1 遗留观察项——旧 V1/V2 会话撤回切割、带附件消息撤回重绘、本地 POSIX 路径图片重绘。
6. 0.1.5 正式版发布后：重跑 `npm run check:upgrade`，按 compat-audit 台账定点复查 I6/I7/I19/I28，核对 V3 相关不变量是否需新增条目。

## 证据清单

| 结论 | 证据（官方 dsh-v0.1.5-alpha.2 tag 源码 / npm registry 实况） |
|---|---|
| 面板 API 调整无破坏 | `docs/subsystems/slots.md`「Current hierarchy」（alpha.2 仅多 `main.conversation` 祖先、key 名全不变）；`packages/client/ui-chat/src/client/contract/slots.ts`（`conversation.chat.node` 声明逐字段不变） |
| chat.node owner 契约保留 | ui-chat `contract/slots.ts`：`ChatNodeOwnerProps` 含 `loadImage: MessageImageLoader`、`renderMessageImages: RenderMessageImages`（原样） |
| conversation 扩展路径不变 | alpha.2 `docs/subsystems/conversation.zh.md`：示例仍 `ctx.slots.inject('conversation.chat.node', …)` |
| 文件交付无格式代际变化 | `.agents/notes/archived/feature/2026-09-08-web-explicit-file-delivery.zh.md`：新持久事件 `deliverables/presented`，不修改已发布格式代际；插件零消费 |
| fork 契约逐字一致 | `packages/api/session-controller/src/client/contract/sessions.ts`（alpha.2）：`fork({sessionId, atSeq?, increaseTitle?})` + JSDoc 语义与 I6 一致 |
| V3 无新变化 | alpha.2 仅补迁移 README；alpha.1 已从迁移源码逐项排除（见 dsh-0.1.5-alpha.1.md §2.1） |
| npm 未推包 | `npm view @deepseek-ai/dsh dist-tags`：`alpha` 仍 0.1.5-alpha.1 |
| 插件消费面零交集 | 源码依赖面（conversation.chat.node / settings.plugin.item / sessions.fork / session-event 域 / ctx.agents）逐项对照 |
