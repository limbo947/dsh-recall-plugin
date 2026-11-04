# dsh v0.2.2-rc.1 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.2-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1)（prerelease，2026-11-04 发布，0.2.2 线首个候选版）
> 本地基线：升级前全局实装 `@deepseek-ai/dsh@0.2.2-alpha.2`；本轮为**单版增量**（alpha.2 → rc.1，中间无其他版本）。对照源：[dsh-0.2.2-alpha.2.md](./dsh-0.2.2-alpha.2.md)
> 评估方式：release notes 筛查 + **两棵实装树逐文件 SHA256**（旧实装目录改名作基线、新装对比，329 → 329 包，89 包 `lib`/`dist` 漂移）+ 消费点 `.d.ts`/实现逐行 diff + 门禁实跑 + web 宿主冒烟
> 总结论：**零破坏**。插件全部调用点（fork 切点、附件回读、草稿写入、会话导航、快照/端点、槽注册、设置热更）在 rc.1 上逐字节未变或仅注释漂移；89 个漂移包中没有一处触及插件读取的字段。方向中性偏正（插件更新与安装诊断、槽浮层 portal 约束澄清）。

## 一、更新日志梳理与初步判断

release notes 的插件系统条目（`tools.resolve`/`executable` 迁移、PTC birpc 与 SSH 协议 2→3、`agent/request` 不许改路由、Session Projection 异步注册）对第三方插件的波及面很大，但按插件实际消费面筛只剩五条需深挖：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **Session API 拆出独立接口**（快照 / 事件日志订阅 / 运行状态 / 事件投影分别可读） | Breaking（notes） | **高相关**——`sessions.fork` 与 `session.get/list` 是撤回主链 | **零破坏**——拆分落在 `dsh-api-session-controller` 的 `HistoryController` / `ProjectionListener` / `ApiSessionList`；`SessionManager` 面仅控制帧内部形状从「单 key 帧」改为「`changes[]` 批量帧」，属官方 Host↔Client 内部协议，插件不消费控制帧（§2.3） |
| **Cordis Fiber 统一原始配置、候选配置与生效配置访问**（cordis → 4.1.0） | Breaking（notes） | **高相关**——设置面 volatile 热更、`ctx.fiber.entry` 解析都挂在 loader 上 | **零破坏**——`Fiber.store` → `committed`、`config` 改为 raw、`effectiveConfig` 才是生效值、`update()` 返回 `Awaitable`；插件不读这四个字段，只读 `ctx.fiber.entry`（loader 仍在 `internal/plugin` 里挂载）与 `loader/volatile-update` 事件（仍在派发）（§2.3） |
| **统一右键/键盘菜单，覆盖会话、工作区、侧栏并支持开发者扩展** | 能力（notes） | **中相关**——新增 root 槽与浮层 portal 约束 | **零破坏**——新增 `contextMenu.content` root keyed 槽（插件未注册、无 key 竞争）；composer 系列槽文档新增「fixed 浮层必须 portal 到 document body」的贡献约束，插件四个注册 key 都不在 composer 内（§2.4） |
| **第三方插件更新与热更新失败回退旧版；安装失败区分诊断** | 能力（notes） | **低相关**——安装期行为 | **正向**——`dsh-plugin-manager` 的漂移集中在 GitHub 连接检查失败诊断的流式日志与安装日志，插件更新路径能力增强，不影响运行期（§2.3） |
| **`MessageImage` / `ImageGallery` 新增必填 `getTriggerProps`**（notes 未单列，diff 发现） | 隐性 Breaking | **中相关**——图片渲染 | **不受影响**——插件不直接用这两个组件，走官方 `props.renderMessageImages` 闭包（官方内部已接新 prop）；`loadImage` / `ImageLoader` 未变（§2.4） |

其余条目逐条排除：`tools.resolve` / `executable` 迁移（插件不注册工具）、PTC birpc 与 SSH 2→3（未用）、`agent.model` 固定路由（host 侧未注册 `agent/request`）、Session Projection 异步注册（插件不用 projection API）、官方组合包列表改由 `@deepseek-ai/dsh-official-bundles` 导出（安装期解析，插件走 `dsh.bundle.patch` 单条 insert）、`apply_patch` 默认关闭与「文件修改先读防护默认关闭」（工具策略，插件不依赖）、Web Fetch 内网放开（未用）、SDK 重启生效（未用）、Node ≥ 24.9（基线 alpha.2 已要求，本机 24.14.1）。

## 二、实证核验

### 2.1 门禁实跑（本机 0.2.2-rc.1 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test`（unit） | **597/597** |
| `npm run test:client` | **134/134** |
| `npm run test:probe` | **58/58**（直接对本机 rc.1 实装的 API 面断言） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 13 项） |
| `npm run check:dsh` | 六条 `@deepseek-ai/dsh-*` peer 与 cordis `4.1.0`、schemastery `3.19.0` 全满足（`^4.0.1` / `^3.18.1` 本身覆盖新 minor，**无需追加段**）；镜像与契约版本字段待回填 → 回填后复跑全绿 |
| `npm run build` | 产物新鲜（`git status lib/` 无改动） |
| 宿主冒烟 | `node <dsh>/lib/bin.js --profile web --no-open --port 3099`：页面 200（44.5 KB）、模块清单含 `{"id":"dsh-recall-plugin","url":"plugins/??dsh-recall-plugin/client.js&rev=…"}`、日志仅 `recall shell dialect probe: pwsh`、无 compat/skip/denied；停止后端口释放 |

> `/api/recall/*` 走 connection 的载体无关 fetch 路由，不经 web 服务器 HTTP 面（直连返回 401 属预期，非回归）；插件的装配与端点注册由 `verify:host` 断言覆盖。

### 2.2 包集合与漂移面

**329 → 329 包**：新增 3（`dsh-client-ui-context-menu`、`dsh-client-ui-file-actions`、`dsh-fs-patch`），移除 3（`dsh-computer-use`、`dsh-cua`、`dsh-cua-bundle`——Computer Use 迁出主仓）。第三方依赖：cordis `4.0.6-alpha.1 → 4.1.0`、schemastery `3.18.6-alpha.1 → 3.19.0`、Node 下限 `>=24.9.0`（沿用）。

**逐字节零漂移的消费面**：`dsh-session`（`sessions.fork` 实现整包）、`dsh-session-query`、`dsh-shell`（`setDraft`/`submit`/`addAttachments`/`snapshot`）、`dsh-workspace`（`get`/`archiveSession`）、`dsh-client-ui-slots`（槽框架与冲突机制）、`dsh-client-connection`、`dsh-host-webserver`（exact 路由注册面）、`dsh-attachment`、`dsh-client-ui-settings-plugins`、`dsh-host-plugin-inventory`、`dsh-host-frontend-static`。

### 2.3 关键包逐行 diff（插件消费点）

- **`dsh-api-session-controller`**（16 文件 / +254−199）：`SessionManager.handleControlFrame` 的替换帧由 `{key, value}` 改为 `{changes: [{key, val}]}` 批量形状；`ApiSessionList` 新增 `listMetadata` 句柄并收窄 `snapshot` 计算范围；`HistoryController` / `ProjectionListener` 接新独立接口。`sessions.fork`、`readAttachment`、`createDrafts`、`updateQueue` 的客户端签名与实现一处未动（`manager.d.ts` 仅两行注释）。
- **`cordis` 4.1.0**（13 文件）：`Fiber.config` 改「下次激活的原始输入」、新增 `effectiveConfig` 生效值、`store` → `committed`、`provisions` 新增、`update()` 返回 `Awaitable<void>`；`utils`/`logger`/`reflect` 为配套类型。插件侧无直接读取。
- **`cordis-plugin-loader`**（9 文件）：`Entry.fiber` 改为持有 `{ ctx: { fiber } }` 包装（官方全包同步改为 `this.fiber.ctx.fiber`，`dsh-settings` 的 `owner.ctx.fiber` 同源）；`EntryTree.write()` → `commit(change)`、`internal/update` 拆出 `internal/commit`；`fiber.entry` 挂载与 `loader/volatile-update` 派发逐字保留（553 / 765–767 行）。
- **`cordis-plugin-include` + `dsh-app-boot`**：patch 实现抽成新模块（`applyPatches` + `journal` + `PatchIndex`），插件的 `cordis.patch.yml` 单条 `insert`（带 `id: recall`）语义不变——`data.push(...structuredClone(insert))` 与按 id 覆盖 key 的路径未改，新增的是运行时改动回写与 owner 归属（插件管理页编辑 entry 用）。
- **`dsh-client-ui-chat`**（12 文件 / +208−53）：`ChatNodeOwnerProps` 移除 `fileMentions`、`ChatViewInjected` 新增 `resolveFilePath` / `useContextMenu`（文件链接与右键菜单下移到视图层）；`ReasoningBodyOwnerProps` 增 `rawText`。`conversation.chat.node` / `assistant-actions` 的 key、kind、priority 与 props 核心字段未变；插件未读 `fileMentions`。
- **`dsh-client-ui-conversation`**（4 文件 / +230−71）：改会话头右键菜单（`getTriggerProps` + `portal: true`）与 composer 槽文档约束，`createDrafts` / `releaseDraftAttachments` / `setDraft` / 提交状态机一处未动。
- **`dsh-client-ui-attachment`**：`MessageImage` / `ImageGallery` 增必填 `getTriggerProps`（右键菜单绑定），`ImageLoader` 与 `MessageImageSpec` 不变。
- **`dsh-settings`**（4 行）：`configure(presentation, owner)` 与 `autoGenerate` 读取由 `owner` / `entry.fiber` 改为 `owner.ctx.fiber` / `entry.fiber.ctx.fiber`，兼容 Fiber 与 Context 两种入参；`installSettingsSection` / `installSection` / `register` / `describe` / `update` 入口未变。
- **`dsh-client-modules`**：`entry.fiber.update(config)` 改为 `await entry.fiber.update(config, true)`；`__ModuleLoader__.load({id, factory})` 契约不变。
- **`dsh-client-ui-workspace`**（+1003−1003）：侧栏会话操作重构为统一右键菜单（`session-actions/ForkSession.d.ts`、`SessionId.d.ts` 删除，`context-menus.d.ts` 新增），`navigation.d.ts`（`openSession` / `archiveSession` / `unarchiveSession`）逐字节未变。
- **`dsh-session-log-deepseek`**：纯加法（`SessionLogDeepSeekService.registerExclusion`，`apply` 改 async），插件经 `dsh-session-query` 读会话，不直接消费。

### 2.4 生态 Breaking 与插件的距离

两条会打到第三方插件的破坏性改动都不在插件路径上：

1. **`ChatNodeOwnerProps.fileMentions` 移除**——注册 `conversation.chat.node` 且用它渲染文件引用链接的插件会读到 `undefined`（运行时守卫只会静默 no-op）。本插件自绘兜底面只渲染文本/图片/文件卡片/JSON，未引用该字段；新面整条内容走官方 content Factory，文件引用由官方内部渲染。
2. **`MessageImage` / `ImageGallery` 的 `getTriggerProps` 必填**——直接调用这两个组件的插件会因缺参渲染异常。本插件撤回回填的图片走 `props.renderMessageImages` 闭包（官方 Chat 自己接新 prop），编辑卡缩略图走官方 `loadImage`，两者都不经过组件级调用。

composer 槽新增的「fixed 浮层必须 portal 到 document body」是**贡献约束**而非运行时检查：`conversation.composer` / `conversation.input.*` 系列槽的浮层会被 docked composer 的包含块裁剪。插件四个注册 key（`conversation.chat.node`、`conversation.chat.assistant-actions`、`settings.plugin.item`、`plugins.bundle.config`）都不在 composer 内，唯一 `position: fixed` 的元素是 toast（挂在消息流/文档层），不受此约束影响。后续若把入口迁进 composer 工具行（`conversation.input.right` 备选方案），需按新约束 portal。

### 2.5 运行时行为抽查（静态确认 + 冒烟）

- `ctx.fiber.entry` → 新版 loader 仍在 `internal/plugin` 里执行 `fiber.entry = fiber.parent[Entry.key]`，设置 ns 解析（`resolveSettingsNs`）的首选路径依旧可用。
- `loader/volatile-update` 仍在 `_commitVolatile()` 提交后派发（改为 `fiber.ctx.emit`，事件冒泡到插件 context 不变），设置热更链未断。
- `ctx.timer.timeout`（复制按钮回退计时）所在 `Timer` 服务本版零漂移。
- `dsh-session` 整包逐字节相同 → fork 的 cutSeq 语义、`turn/end` 推进、`origin` 判定全部不变。

未做本轮的活体浏览器回归（撤回 → fork → 回填 → 编辑重发）：消费面零漂移 + 58 条 API 探针全过 + 宿主冒烟通过已能支撑结论；发版前如需双保险，按 `docs/plans/completed/smoke-checklist-records.md` 的第十二节流程补跑一次。

## 三、影响面结论

| 模块 | 影响 |
|---|---|
| 影子快照 / gc / 护栏 / 串行队列 / 宿主端点 | 无（依赖包逐字节相同；装配断言 13 项全过） |
| 撤回 execute（preview → 安全快照 → reset → fork → 归档 → 打开） | 无（`sessions.fork` 整包未动） |
| 撤回回填（文本 / 图片 / 附件引用） | 无（`readAttachment` / `createDrafts` / `setDraft` 未变，图片仍走官方闭包） |
| 编辑并重发（编辑卡 / 提交链 / 自动发送） | 无（composer 槽只有文档约束变化，`submit` 与草稿快照未变） |
| 版本翻页器 / 快照管理 / 队列清理 | 无（`openSession` / `unarchiveSession` / `updateQueue` 未变） |
| 设置卡片与 volatile 热更 | 无（`dsh-settings` 仅解 fiber 包装；ns 解析与热更事件仍可用） |
| 插件安装与升级 | 正向（插件更新与热更失败回退、安装失败分诊断） |
| 未来若把入口迁入 composer / 复用 `MessageImage` | 需按新约束适配（portal 到 body、补 `getTriggerProps`） |

**方向与程度**：中性偏正，零功能级回归，零代码改动。正向面是插件更新能力与安装诊断；风险面仅两条**生态 Breaking**（`fileMentions` 移除、`MessageImage` 必填 prop）与一条**贡献约束**（composer 浮层 portal），都在插件当前实现之外，已记入台账备查。

## 四、台账同步

- `package.json`：`dsh.compatibility.dshReleases` 补 `0.2.2-rc.1`；peer 范围**不变**——`@deepseek-ai/cordis` 的 `^4.0.1` 与 `@deepseek-ai/schemastery` 的 `^3.18.1` 天然覆盖 `4.1.0` / `3.19.0`，六条 `dsh-*` 的 `>=0.2.2-alpha.1 <0.3.0` 覆盖 rc.1。
- `docs/reference/`：第十二次重拉（`dsh-v0.2.2-rc.1`），**13 源逐字节相同**（连续第二轮零差异），仅更新 `README.md` 的归档日期与归档版本字段。
- `docs/dsh-contract.md`：对应版本 → 0.2.2-rc.1；沿革补 ⑬。
- `docs/compat-audit.md`：新增 0.2.2-rc.1 核验段。
- `README.md` / `README.en.md`：DSH 徽章与支持范围 → `0.2.2-rc.1`。
- `CHANGELOG.md`：`[Unreleased]` 记录本次核验与台账同步。
