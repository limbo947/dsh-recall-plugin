# dsh v0.2.2-rc.3 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.2-rc.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3)（prerelease，0.2.2 线第三个候选版）
> 本地基线：升级前全局实装 `@deepseek-ai/dsh@0.2.2-rc.2`；本轮为**单版增量**（rc.2 → rc.3，中间无其他版本）。对照源：[dsh-0.2.2-rc.2.md](./dsh-0.2.2-rc.2.md)
> 评估方式：release notes 逐条筛查 + **两棵实装树逐文件 SHA256**（排除 `*.map`）+ 消费点 `.d.ts`/实现逐行 diff + 门禁实跑 + 镜像 13 源重拉
> 总结论：**零破坏、零改码**。rc.3 相对 rc.2 只有 6 个 commit（3 个是 release/CI/桌面安装器），实质代码变更仅 1 个新实验包 `dsh-deepseek-chat-import` 及其为自身接入所做的**纯加法**槽/枚举改动。插件全部消费面（`dsh-session`、`dsh-session-query`、`dsh-shell`、`dsh-sandbox-policy`、`dsh-pwsh-sandbox`、`dsh-settings`、`dsh-client-ui-slots`、`dsh-client-ui-chat`、`dsh-client-ui-conversation`、`dsh-workspace`、`dsh-api-session-controller`、`dsh-api-workspace-controller`）**逐字节相同**，唯一差异是 `package.json` 的 version 字段。

## 一、更新日志梳理与初步判断

release notes 仅 2 条（1 新增 + 1 修复）。按插件实际消费面筛，只有一条需要深挖：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **新增实验包 `dsh-deepseek-chat-import`（DeepSeek 会话导入）** | 新增能力 | **中相关**——引入新会话形态 | **零影响**。会话由 `Session.create` + `SessionHandle.append(events)` 直接落盘（`src/importer.ts`），**不经 live Session**，故不触发 `session/event`（插件的快照触发点）。用户在该会话继续对话时事件形状与普通会话一致（`source: { kind: 'user' }`、`turn/start`/`turn/end` 齐全，`src/conversation.ts`），插件的 `cwd` 解析 / `cutSeq` / `fork` 路径照常工作 |
| **Windows 桌面内更新修复** | 平台修复 | 无 | `apps/desktop/installer/` 改动，不进 npm 包，插件无消费面 |

**逐条排除的其余改动**（均为新包接入所需的纯加法）：

- **新增槽位**：`dsh-client-ui-workspace` 新增 `workspace.picker` Component Factory 与第三个 directory-flow 洞（`workspace.picker.directoryFlow`）；`dsh-client-ui-sidebar` 新增 `sidebar.session.action`（`kind: 'hoc'`，root）。插件只注册五个槽（`conversation.chat.node`、`conversation.chat.assistant-actions`、`conversation.session.header.actions`、`settings.plugin.item`、`plugins.bundle.config`），无一处涉及新增键；`navigation.d.ts`（`UiWorkspace.openSession`/`archiveSession` 契约）SHA256 相同。
- **bundle 名单**：`dsh-official-bundles` 三处、`dsh-client-ui-plugin-manager` 的 `MORE_BUNDLES`/`EXPERIMENTAL_BUNDLES` 各插入一个 bundle 名字符串——纯数组插入；`slot-contract.d.ts`（`plugins.bundle.config` 契约）逐字节相同。
- **图标与类型**：`dsh-client-ui-primitives` 新增 2 个 upload 图标；`dsh-api-session-controller` 的 `RemoteErrorDetailsMap` 加一行 `'deepseekChatImport/owner-only': {}`（139 个文件中唯一非 `package.json` 差异，一行 declaration 字符串，插件 0 处消费该映射）。
- **平台与文档**：`.github/workflows/*`、`scripts/ci-verified-download.*`、`docs/*`、`snapshots/*`、生成脚本——非运行时或不在调用点。

## 二、实证核验

### 2.1 包级漂移（两棵实装树逐文件 SHA256，排除 `*.map`）

包集合 336 → **337**（+`dsh-deepseek-chat-import`）。插件消费面 **21 个包仅 `package.json` 版本字段不同**：`dsh-session`（44 文件）、`dsh-session-query`（30）、`dsh-shell`（12）、`dsh-sandbox-policy`（18）、`dsh-pwsh-sandbox`（18）、`dsh-settings`（26）、`dsh-client-ui-slots`（12）、`dsh-client-ui-chat`（245）、`dsh-client-ui-conversation`（196）、`dsh-workspace`（29）、`dsh-api-workspace-controller`（49）、`dsh-client-ui-model-selection`（35）、`dsh-client-ui-session`（21）、`dsh-client-store`（10）、`dsh-client-ui-message-feedback`（36）、`dsh-session-format`（22）、`dsh-attachment`（24）、`dsh-client-ui-settings`（34）、`dsh-client-ui-settings-plugins`（25）、`dsh-client-ui-cordis`（49）、`dsh-client-ui-plugin-market`（31）。本机实装目录与 npm `@0.2.2-rc.3` tarball 对上述核心包已交叉验证逐字节一致。

### 2.2 关键不变量复核

- **`Session.append` 批量重载 / `session/event` 派发 / `fork` 切点与标题**：本版**均无变化**。`dsh-session` 的 `lib/index.js` 在 rc.2 与 rc.3 SHA256 相同；批量重载 `append(inputs: readonly SessionEventInput[])`、`#appendEvents`、`SurfaceManager.prepareBatch` 在 **rc.2 即已存在**，不是本版新增。派发语义仍是**逐事件**（`#appendEvents` 在 publications 循环里逐条 `invokeContainedSessionObservers(…, 'session/event', …)`），插件 handler 只读 `event.type`/`data.id`/`data.source.kind`/`event.time`/`session.header.origin`，不读 `seq`/batch 状态，也从不 append。`buildForkSeed`（`events.slice(0, boundary+1)` + `session/end-seed`）整文件未变；标题逻辑仍是「仅显式传 `increaseTitle` 才 rename」，插件只传 `{ sessionId, atSeq: cutSeq }`。
- **`archiveSession(id, { stopActivity: true })`**：签名与语义**不变**。`dsh-workspace` 29 文件仅 `package.json` 差异，`ArchiveSessionOptions.stopActivity?: boolean` 与 `archiveSession(sessionId, options?)` 同 rc.2；客户端面 `dsh-api-workspace-controller` 49 文件仅版本差异，「无 `stopActivity` 时有活动的会话以 `workspace/session-active` 拒绝」的语义同文。

### 2.3 门禁实跑（本机 rc.3 实装）

| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test`（unit） | **627/627** |
| `npm run test:client` | **143/143** |
| `npm run test:probe` | **63/63**（58 API 字段探针 + stdin + store-probe，直接断言 rc.3 实装面） |
| `npm run verify:host` | 通过（inject=shell,sessions,agents，端点 13 项） |
| `npm run check:dsh` | 修复前红（仅镜像与契约文档两处版本字段）；回填后六条 peer 全满足、cordis `4.1.0` / schemastery `3.19.0` 均在范围内 |

### 2.4 镜像回填

`docs/reference/` 13 个源按 `dsh-v0.2.2-rc.3` tag 重拉，**13/13 逐字节相同**（连续第 N 轮零差异）；头部「归档日期 / 归档 dsh 版本」同步到 2026-11-17 / 0.2.2-rc.3。

## 三、结论与残留项

- **无需改码**：`dsh.compatibility.dshReleases` 补 `0.2.2-rc.3`；peer 范围无需追加（`>=0.2.2-alpha.1 <0.3.0` 已覆盖）。
- **观察项（非缺陷）**：若用户安装并启用 `dsh-deepseek-chat-import`，导入的会话在「继续对话」时会正常触发插件快照（`cwd` = 目标工作区路径，root 可解析）；其历史消息由 `SessionHandle` 直接落盘、不触发 `session/event`，故不会被补拍——与「插件只对实时用户消息拍快照」的既有语义一致。
- **未做真实浏览器活体回归**：消费面零漂移 + 63 条探针 + 装配断言已足以支撑「零破坏」；如需双保险按 [smoke-checklist-records.md](../plans/completed/smoke-checklist-records.md) 补跑一轮。
