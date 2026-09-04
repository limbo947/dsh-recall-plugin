# dsh v0.1.3-alpha.1 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.1.3-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.1)（tag `d347e70`，2026-09-04 发布；pre-release，**npm 未发布**——dist-tags latest 仍为 0.1.2-rc.1）
> 本地基线：dsh 0.1.2-rc.1（全局实装）；reference/ 镜像 2026-09-03 归档（rc.1）
> 评估方式：release notes 筛查 + 插件官方 API 依赖面逐项 diff tag 源码（纯源码比对，**未实装、无探针/冒烟**）
> 总结论：**接口层面零破坏，无需改码即可在 0.1.3-alpha.1 上运行**；影响集中在行为层面，程度「轻-中」，其中性能回退为官方已知、计划下版修复项。

## 一、更新日志梳理与初步判断

按「是否命中插件依赖面」筛选 release notes（对照 [dsh-contract.md](../dsh-contract.md) 建档的依赖面）：

| 变更 | 类别 | 初判 |
|---|---|---|
| **破坏性**：Session persistence API 改为生命周期持有的 `SessionHandle`；`agentLoop.create()` 异步化；新增 session 锁（同一 session 至多被一个进程持有） | Chores | **高疑点**——命中会话持久化层 |
| **Session format 升级 v2**：旧 v0/v1 日志经不可变相邻 generation 迁移，Assistant 流按 attempt 聚合进持久化 settlement，Web 保持实时增量显示 | Chores | **高疑点**——命中事件流/seq 语义 |
| Web 支持上传任意类型通用文件：文件与图片同一预览区混排 | 新增 | **中疑点**——命中用户消息重绘 |
| Agent Team `send_message` 统一采用 steer 语义 | 优化 | 低疑点——keyed renderer 覆盖 `['user','steering']` |
| 已知性能回退：部分历史 session 加载响应速度（官方自认，下版修复） | 官方自认 | 命中插件冷读路径 |
| 出站网络请求遵循 `HTTP_PROXY` 等代理环境变量 | 新增 | 无关（影子 git 为本地进程，插件自身无出站网络请求） |
| Windows 盘符根目录 Workspace 修复（路径分隔符/标题/绝对路径校验） | 修复 | 低疑点——store 路径 SHA256 输入 |
| 流式工具调用续传分片空值覆盖修复 / Session 缓存读取修复 / 会话搜索结果进入会话修复 | 修复 | 无关（不触及插件依赖面） |
| `read_image` 工具卡直接渲染图片 / Skill 模糊搜索 / 链接样式统一 / `FS_NOT_OBSERVED` 诊断统一 / Windows 子进程不弹控制台窗口 | 其余 | 无关 |

**初步判断：存在潜在影响，需深入核查**——两个高疑点（SessionHandle、Session format v2）直接落在插件的「双轨回退」对话半（`resolveCutSeq` → `sessions.fork({ atSeq })`）。

## 二、详细变更核查（tag 源码实证）

### 2.1 SessionHandle（persistence seam 内部重构，接口面不外泄）

- `ctx.sessionPersistence` 是**新服务**（`create`/`open`/`stat`/`list` + 读写全走 `SessionHandle`），插件不依赖它——插件依赖的是 `ctx.sessions`（服务契约面）与 `ctx.sessionQuery`（检索面）。
- 写锁为 **in-process only**（跨进程 lease 官方标注为 planned next layer）——插件全部调用与 dsh 同进程，无影响。
- 写路径明确仍消费 `session/event` 域（「`session/event` copies into a bounded internal batching window」）——**插件的快照触发器安全**（[index.ts](../../src/host/index.ts) 的 `session/event` 监听）。
- fork 出的 seeded 会话构造期 seed 事件**不触发** `session/event`（「Constructor seed events never emit `session/event`」）——插件按消息 ID 幂等建快照，本就兼容。

### 2.2 Session format v2（真正的风险中心）

[session-format-v1-to-v2](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.3-alpha.1/packages/session/session-format-v1-to-v2/README.md) 包 README 实证——这是一次 **cardinality-changing**（事件基数变化）迁移：

- 顶层 `assistant/chunk` 事件被**移除**、按 attempt 聚合嵌入 `assistant/message`；新增 log-only 的 `assistant/attempt`；
- 幸存事件 **seq 密集重映射**（dense old-to-new sequence map），所有已声明的同会话 seq 引用被重写；
- fork 的 seeded cut 不再存数字（v2 header 不存 numeric cut），改由 `session/end-seed { inherited: true }` 标记推导；且迁移「refuses an inherited cut that splits an Assistant attempt」（拒绝切在 Assistant attempt 中间的继承 cut）；
- 旧 v0/v1 日志读取时经不可变相邻 generation 迁移（「immutable adjacent-generation migrations」），迁移是全量内存物化（「Whole-artifact transformation…does not stream the rewrite」）——**官方已知性能回退的来源**。

### 2.3 插件依赖契约逐项 diff（全部逐字比对 tag 源码）

| 插件依赖 | 0.1.3-alpha.1 实证 | 结论 |
|---|---|---|
| `ISessions.fork({sessionId, atSeq?, increaseTitle?})`（[recall-node.ts](../../src/client/recall-node.ts)） | [sessions.ts 契约](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.3-alpha.1/packages/api/session-controller/src/client/contract/sessions.ts) 签名与 cut 语义注释（「boundary is the first turn/end at or after it」）**逐字一致** | 不变 |
| `sessionQuery.listSessions()/readSession()`（[store.ts](../../src/host/store.ts)、[maintenance.ts](../../src/host/maintenance.ts)、[routes-manage.ts](../../src/host/routes-manage.ts)） | [session-query README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.3-alpha.1/packages/session-query/session-query/README.md)：两方法保留；seq 保证「zero-based contiguous」；`readSession` 仅**增强** `inheritedEventCount`（读取侧可选字段）；`listSessions` 保持轻量（「stays lightweight」） | 不变（有增强） |
| `conversation.chat.node` keyed slot + `renderMessageImages`（[recall-node.ts](../../src/client/recall-node.ts)） | [ui-chat slots.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.3-alpha.1/packages/client/ui-chat/src/client/contract/slots.ts)：契约一致（keyed / session scope / keyProps node）；`ChatNodeOwnerProps` **仍含 `renderMessageImages`**，且**新增 `loadImage: MessageImageLoader` 下放** | 不变（有增强） |
| `workspaces.archiveSession(sessionId)`（[recall-node.ts](../../src/client/recall-node.ts)） | [workspace-controller service.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.3-alpha.1/packages/api/workspace-controller/src/client/service.ts)：签名与「Archive a Session from Workspace grouping surfaces」语义一致 | 不变（I7 仍成立） |
| `session/event` 事件域（快照触发） | persistence 写路径仍消费该域（§2.1） | 不变 |
| user/steering 节点投影（keyed renderer key 覆盖） | ui-chat README 确认仍在（「steering echoes render with the pending-steering marker」） | 不变 |

**插件文本提取不受 chunk 移除影响**：[session-info.ts](../../src/host/session-info.ts) 的 `messageTextFromEvents`/`titleFromEvents` 只消费 `user/message` 与 `session/title` 事件，不触碰被移除的顶层 `assistant/chunk`。

**peer 范围**：`^0.1.1-rc.2`（[package.json](../../package.json)）在 semver 上覆盖 0.1.3-alpha.1，无需调整。

## 三、与插件功能实现的关联分析

**不受影响的模块**（证据充分）：

- **快照触发**：`session/event` 事件域保留，seed 事件不触发反而减少无效快照；
- **消息文本/标题提取**：只消费 `user/message` + `session/title`，与 `assistant/chunk` 移除零交集；
- **store 定位/维护清理**：`listSessions` 保持目录级 header 枚举轻量语义，PF-7 的「一次 listSessions 替代逐会话冷读」设计反而受益；
- **影子 git 仓库 / exclude / 配置域**：与 dsh 变更零交集。

**受行为影响的模块与程度**：

1. **`resolveCutSeq` → `fork({ atSeq })` 链路**（[snapshots.ts](../../src/host/snapshots.ts)、[recall-node.ts](../../src/client/recall-node.ts)）——**中等，逻辑自洽但需实弹验证**。seq 密集重映射后插件扫描到的是 v2 语义 seq，fork 也按同一 v2 语义解释 `atSeq`；cut 取 `turn/end`（turn 边界）且官方迁移拒绝切在 Assistant attempt 中间——三层自洽。但 v1 旧会话首次读取即触发迁移，「迁移后 turn/end 位置」是否与插件预期完全一致，只能实弹确认。
2. **冷读性能**（`resolveCutSeq` 冷分支、`titles`/`messages` 补齐端点）——**确定的体验回退**（官方自认，下版修复）。来源是 v1→v2 迁移的全量内存物化（source + target + seq map），旧会话每次冷读都付这个代价。撤回确认→执行链路对冷会话的响应时间会变慢；插件已有的 (会话, 消息) 级终身缓存 + 并发限 4 可部分缓解。
3. **用户消息重绘**（[recall-node.ts](../../src/client/recall-node.ts) 的 `renderMessageImages` 路径）——**低，UI 完整性小缺陷**。新通用文件附件与图片混排后，撤回重绘目前只走 `renderMessageImages`，**文件附件块将缺失展示**（功能正确，显示不全）。
4. **盘符根 Workspace**（如 `D:\`）——**低，边缘场景**。0.1.3 修复后盘符根可用作 workspace，store 路径 SHA256 对尾斜杠归一化是否稳定，建议冒烟一次。

## 四、影响评估结论

**总体结论：接口层面零破坏，无需任何代码修改即可在 0.1.3-alpha.1 上运行；影响集中在行为层面，程度「轻-中」，其中一项为官方已知将修复的缺陷。**

- **无影响（契约实证不变）**：快照触发（`session/event`）、fork 签名与 cut 语义、`sessionQuery` 读接口、chat.node 槽位与 `renderMessageImages`、`archiveSession`、settings 槽位；peer 范围 `^0.1.1-rc.2` semver 覆盖。
- **确定影响（性能）**：冷会话撤回与标题/文本补齐变慢——来源是 v2 迁移的全量内存物化 + 官方已知回退，非插件缺陷，等 0.1.3 正式版官方修复。
- **待验证影响（正确性）**：v1 旧会话的撤回切割位置（seq 重映射 + `session/end-seed` 标记推导 cut）——逻辑推演自洽，风险在官方实现细节，实弹见真章。
- **待补功能（低优先级）**：撤回后用户消息重绘对新文件附件类型的展示缺失。

## 五、后续动作（0.1.3 正式版发布后执行）

1. 本地升级（npm 发布后 `npm install -g @deepseek-ai/dsh@next`）→ 跑 `npm run check:upgrade`（check:dsh 漂移 + test:probe + verify:host 三层门禁）。
2. 按 [compat-audit.md](../compat-audit.md) 台账定点复查 **I6**（fork increaseTitle）/ **I7**（archiveSession）/ **I19**（两段式补全）/ **I28**（SessionHeader 无 title）。
3. 台账更新一处：**I2** 补记「0.1.3 起 chat.node props 已下放 `loadImage`」（原『props 无 loadImage』表述过时）。
4. 冒烟清单追加三项：**旧 v1 会话撤回**（重点验证切割点与对话回退正确）、**带文件附件消息的撤回重绘**、**盘符根 Workspace 的快照/撤回**。
5. 若正式版仍有性能回退：观察撤回确认→执行链路对冷会话的响应时间，必要时对 `resolveCutSeq` 冷分支增加缓存粒度。

## 证据清单

| 结论 | 证据（0.1.3-alpha.1 tag） |
|---|---|
| fork 契约逐字一致 | `packages/api/session-controller/src/client/contract/sessions.ts` |
| v1→v2 cardinality-changing / dense remap / end-seed cut | `packages/session/session-format-v1-to-v2/README.md` |
| SessionHandle in-process 锁 / seed 不触发 session/event | `packages/session/session-persistence/README.md` |
| sessionQuery seq 零基连续 / listSessions 轻量 | `packages/session-query/session-query/README.md` |
| renderMessageImages 保留 / loadImage 新增 | `packages/client/ui-chat/src/client/contract/slots.ts` |
| archiveSession 语义不变 | `packages/api/workspace-controller/src/client/service.ts` |
| user/steering 投影仍在 | `packages/client/ui-chat/README.md` |
