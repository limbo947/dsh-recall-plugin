# DSH 契约文档（dsh-contract）

> 插件视角的官方（deepseek-harness）API 契约参考：插件**依赖面**逐项给出签名与核验状态，插件**未依赖面**给出全量清单与一句话说明。
>
> * 对应版本：**dsh 0.2.2-rc.1**（tag `dsh-v0.2.2-rc.1`，2026-11-04 核验；基线为本机 `0.2.2-alpha.2` 实装，两棵实装树逐文件 SHA256 对比；cordis 升 `4.1.0`、schemastery 升 `3.19.0`）。**零破坏版本**：89 包 `lib`/`dist` 漂移中无一处触及插件调用点——`dsh-session`（`sessions.fork` 整包）、`dsh-shell`、`dsh-workspace`、`dsh-session-query`、`dsh-client-ui-slots`、`dsh-host-webserver` 逐字节相同；`dsh-api-session-controller` 的改动全在会话 API 拆分（`HistoryController` / `ProjectionListener` / `ApiSessionList`）与控制帧内部形状，`fork` / `readAttachment` / `createDrafts` / `updateQueue` 签名与实现未动；cordis 4.1.0 的 `Fiber` 字段重构（`store`→`committed`、`config` 改 raw、`effectiveConfig` 为生效值、`update()` 返回 `Awaitable`）未被插件读取，`ctx.fiber.entry` 与 `loader/volatile-update` 仍由 loader 挂载/派发；`dsh-settings` 仅把 `owner` / `entry.fiber` 换成 `ctx.fiber` 解包；`cordis-plugin-include` 与 `dsh-app-boot` 的 patch 重构（`applyPatches` + journal + `PatchIndex`）保持 insert 与按 id 覆盖语义（插件 `cordis.patch.yml` 单条 insert 且带 id）。**两条生态 Breaking 不触插件**：`ChatNodeOwnerProps.fileMentions` 移除（插件未读）、`MessageImage` / `ImageGallery` 新增必填 `getTriggerProps`（插件走官方 `renderMessageImages` 闭包与 `loadImage`）；composer 系列槽新增「fixed 浮层必须 portal 到 document body」属贡献约束，插件四个注册 key 不在 composer 内。**门禁**：`typecheck`、单测 **597**、client **134**、`test:probe` **58/58**、`verify:host` 全过、`check:dsh` 六条 peer 全满足（`^4.0.1` 覆盖 cordis 4.1.0、`^3.18.1` 覆盖 schemastery 3.19.0，**无需追加段**）；web 宿主冒烟页面 200、模块清单含 `dsh-recall-plugin`。核验记录见 [upgrade-assessments/dsh-0.2.2-rc.1.md](upgrade-assessments/dsh-0.2.2-rc.1.md) 与 [compat-audit.md](compat-audit.md) 头部 0.2.2-rc.1 段。
>
> * 上一轮版本（`0.2.2-alpha.2`，沿革 ①–⑫）：**dsh 0.2.2-alpha.2**（tag `dsh-v0.2.2-alpha.2`，2026-10-28 核验；基线为本机 `0.2.1-rc.3` 实装，两棵实装树逐文件 SHA256 对比；cordis 升 `4.0.6-alpha.1`、schemastery 升 `3.18.6-alpha.1`）。**一处真实破坏（已修）+ 四条契约演进**：① **`readAttachment` 入参换代**（详见 §1.2「附件回读」）——≤0.2.1 收 `attachmentId` 字符串、宿主回会话日志反查完整引用并做引用授权；≥0.2.2-alpha.1 收完整 `ImageAttachmentRef`、宿主只按 `mediaType`/`bytes`/尺寸自证（裸 id 直接 `INVALID_ATTACHMENT_REF`）。插件原先传裸 id，撤回回填与编辑重发的图片会被逐项 `try/catch` 静默丢弃；改为「完整引用 → 裸 id」探测回退并缓存命中代后两代皆通（`src/client/draft-fill.ts`）；② `conversation.createDrafts` 新增第三参 `uploadImages`（普通会话 `true`＝进输入态即上传、子代理续写 `false`；旧版忽略多余实参，插件按场景分流——回填不发送传 `true`、自动发送传 `false`）；③ `sessions.fork` 不再写 `parentSession`，普通分支改由 header `origin` 判定（插件本就只读 `header.origin` 跳过快照、血缘自存 lineage.json，语义更正而非破坏）；④ cordis 统一配置访问：loader 的 ref 来源 `fiber.config` → `fiber.effectiveConfig`、候选解析收口为 `fiber.resolveConfig`（volatile 提交链 `updateVolatile` + `loader/volatile-update` 派发逐字未变，设置面热更不受影响）；⑤ 输入提交状态机新增 `sending` 相位 + **宿主确认接收后才 `commit-draft`**（失败保留草稿/引用/附件），对编辑重发是正向。**零破坏面**：`dsh-shell`、`dsh-session-query`、`dsh-client-ui-slots`、`dsh-workspace`（仅 locale）、`dsh-client-connection`（仅 d.ts 注释）逐字节相同；`conversation.chat.node` / `assistant-actions` / 设置两面 / `updateQueue` / `openSession` / `archiveSession` / `modelDirectories.select` 契约未变；事件集 62 种不变；新增 `conversation.chat.text-interaction` / `conversation.chat.user.before` 两个纯加法槽。**门禁**：`test:probe` **58/58**（新增 §1.2 附件回读 1 条、`createDrafts` 三参并入既有条目）、`typecheck` / 单测 529 / client 129 / `verify:host` 全过、`check:dsh` 六条 peer 全满足（新增 `>=0.2.2-alpha.1 <0.3.0` 段）；web 宿主冒烟 200 且 `POST /api/recall/init` 返回 200。核验记录见 [upgrade-assessments/dsh-0.2.2-alpha.2.md](upgrade-assessments/dsh-0.2.2-alpha.2.md) 与 [compat-audit.md](compat-audit.md) 头部 0.2.2-alpha.2 段。
>
> * 更早基线（`0.2.1-rc.3`，沿革 ①–⑪）：**dsh 0.2.1-rc.3**（tag `dsh-v0.2.1-rc.3`，2026-10-23 发布、0.2.1 线第三个候选版；`npm view` 的 latest dist-tag 仍指向 rc.2，需精确版本号安装；全局实装 `@deepseek-ai/dsh@0.2.1-rc.3`，升级前基线为本机 rc.2 实装，两棵实装树逐文件 SHA256 对比；cordis 4.0.5 / schemastery 两条独立版本线未动）。**零破坏版本：6 个 commit 全是纯加法与内部修复、无需改码**——三条 release notes 逐条核查：① 左/右侧栏与会话视图的「更多」菜单来自新包 `dsh-client-ui-entry-customization`（304 → 305 包），只声明并注册三个 root scope list 槽；② 新会话草稿修复落在 `ui-workspace.startSession` / `createInWorkspace`（blank 复用）与 `DraftInitializationOptions.whenDraftExists` 可选值，插件不调用该入口；③ API Key 路由的模型列表改跟官方 `/models`，只换数据来源；`engines.dsh` 优先判定维持 `dsh-app-boot` 原行为（零漂移），本插件未声明 `engines.dsh`（`engines` 仅 `{node:">=20"}`）→ 走 peer 路径，六条 `@deepseek-ai/dsh-*` peer 对 0.2.1-rc.3 全满足。**消费/注册契约零漂移**（305 个包两树逐文件哈希，`lib`/`dist` 漂移 20 包且无一触及插件消费面）：`sessions.fork`（`dsh-session` 整包）、`dsh-shell`、`dsh-settings`、`dsh-session-query`、`dsh-session-persistence`、`dsh-workspace`（`archiveSession`）、`dsh-api-session-controller`（运行时 JS）、`dsh-api-gateway`、`dsh-host-webserver`、`dsh-cordis-host-runner`（host 插件加载器）、`dsh-host-plugin-inventory`、`dsh-client-ui-chat`（slot 定义方）、`dsh-client-ui-attachment`、`dsh-client-ui-renderer`、`dsh-client-ui-slots`、`dsh-client-ui-settings-plugins`、`dsh-client-ui-secret-mask`、`dsh-client-ui-model-selection`（`ctx.modelDirectories`）、`dsh-app-boot`、`dsh-plugin-manager`、`dsh-hmr`、`dsh-base` 等零变更；`dsh-client-ui-conversation` 的漂移是**纯加法**（新槽 `conversation.session.header.views.actions`、`DraftInitializationOptions.whenDraftExists` 可选值、View 固定/更多菜单），`ui-workspace` 的漂移全在新建会话路径（`openSession`/`unarchiveSession` 未动）；输入链 `setDraft(DraftInput)` / `createDrafts` / `releaseDraftAttachments` / `addAttachments` / `submit` 签名与行为不变（`setDraft` 内部仅抽出 `$appendParagraphs` 复用）；`dsh-client-ui-secret-mask`（`conversation.user.text.node`，priority 100）零漂移，脱敏只在渲染层、回填 draft 仍为原文。**第三方依赖**：cordis `4.0.5`、schemastery、pi-ai 与 rc.2 完全一致（两树零漂移）。**事件集** 62 种不变（`dsh-session` 整包逐字节相同）。**门禁**：`test:probe` **58/58**（含本轮新增的输入区写入链 4 条：`InputActions.setDraft/addAttachments/submit`、`InputState.draft`、`SessionInputShell.actions`+`snapshot`、`createDrafts`/`releaseDraftAttachments`）、`verify:host` 装配断言全过（inject=shell,sessions,agents、端点 13 项）、`check:dsh` 六条 peer 对 rc.3 全满足（镜像 13 源逐字节零差异；「npm 最新」按 dist-tags 的 latest/next 取较新者）。核验记录归口 [compat-audit.md](./compat-audit.md) 头部 0.2.1-rc.3 段与 [upgrade-assessments/dsh-0.2.1-rc.3.md](upgrade-assessments/dsh-0.2.1-rc.3.md)（单版增量 rc.2 → rc.3）。**沿革事实（当前双分支实现的依据）**：① 0.1.7-alpha.1 起两处接缝换代——shell 执行接缝 `resolve` + `execute()`（删 `run` / `start`；§1.1 shell）、settings 面只剩 `SettingsForms`（profile entry id、可写字段须 `.volatile()`；§1.1 settings），插件双分支共存适配；② 包布局收进 `dsh/node_modules/@deepseek-ai/*`（I11）；③ fork 实现重写（边界语义等价，I35）；④ 事件集（§四；alpha.3 实测 62 种——相对 alpha.2 的 60 仅新增 `job/registered` / `job/settled`，零删除）；⑤ Session 日志格式 **V4**（保留原始 message id，插件以 id 为主键、以真实 `e.seq` 推 cutSeq，免疫）；⑥ `sessions.fork` 增加可选 `onCreated`（插件不传）；⑦ 0.2.1-alpha.2 起 `sessions.fork` 增加可选 `allowMigration`（仅显式 `false` 且源会话为 `migration-required` 时抛错拒绝；插件不传，保持 Host 默认）；⑧ **0.2.1-alpha.3 图片渲染入口换代为双面（I2）**——≤alpha.2 仅 `renderMessageImages`；≥alpha.3 移除它、改 `renderFactorySlot` + `loadImage` 经 `conversation.chat.user.content` Factory 渲染附件行（插件运行时双分支探测）；⑨ **0.2.1-alpha.4 兼容性门禁改为 `engines.dsh` 优先（新增 I43）**——声明 `engines.dsh` 则只查它并短路 peerDependencies；未声明沿用 peer 判定（本插件未声明，走 peer 路径）；⑩ **0.2.1-rc.2 零漂移（2026-10-17）**——rc.1 汇总版 Breaking 不触插件消费面，34 包 `lib/` 仅 3 处非功能漂移；新增 slot `conversation.input.model.label` 属模型选择器内部（与 `conversation.chat.node` 无 key/priority 竞争）；镜像九次重拉 13/13 逐字节相同（首个零差异轮次）；⑪ **0.2.1-rc.3 纯加法（2026-10-24）**——6 commit：新增客户端包 `dsh-client-ui-entry-customization` 与三个 root scope list 槽（`sidebar.panellist.actions` / `conversation.session.header.views.actions` / `sidebar.right.tab.guide.actions`），新会话改复用 blank 以找回未发送草稿并给 `DraftInitializationOptions` 增加可选 `whenDraftExists`（`replace`/`append`/`keep`，缺省等价旧 `clearPreviousDraft` 语义），API Key 路由模型列表改跟官方 `/models`；`sessions.fork`、`setDraft`/`createDrafts`/`addAttachments`、`openSession`/`unarchiveSession`、slot 定义方、兼容门禁逐字节零变更；镜像十次重拉 13/13 逐字节相同（连续第二轮零差异）。⑫ **0.2.2-alpha.2 一处破坏（2026-10-28，已修）**——`readAttachment` 换代致图片附件回填失效（§1.2 B1），`createDrafts` 增第三参；`sessions.fork` 停写 `parentSession`、普通分支由 `origin` 判定；cordis 配置访问统一（`fiber.config` → `fiber.effectiveConfig`，volatile 链未变）；输入提交增 `sending` 相位 + 宿主确认后才清草稿；镜像十一次重拉 13 源中 3 份有差异（08/09/13，均不落插件消费面）。⑬ **0.2.2-rc.1 零破坏（2026-11-04）**——89 包漂移全部不触插件调用点：Session API 拆分（history/投影/列表独立接口）与控制帧 `changes[]` 批量形状属官方内部协议；cordis 4.1.0 的 `Fiber` 字段重构与 loader 的 `entry.fiber` 包装未被插件读取（`ctx.fiber.entry` 与 `loader/volatile-update` 保留）；`ChatNodeOwnerProps.fileMentions` 移除与 `MessageImage.getTriggerProps` 必填是生态 Breaking、插件走官方闭包与 `loadImage` 不受影响；composer 槽新增浮层 portal 约束不覆盖插件注册的四个 key；镜像十二次重拉 13 源逐字节相同。
>
> * 来源：官方源码直接核验（本机构建检出在 `D:\workspace\dsh-plugin\deepseek-harness`），非文档转述——**遇字段争议一律以** **`.d.ts`/源码为准**（AGENTS.md 合规清单 #8）
>
> * 维护方式：dsh 升级后按第七节指引定点重核；本文档描述「一直成立的事实」，不设完成态
>
> * 配套：[compat-audit.md](./compat-audit.md)（耦合点矩阵，升级后定点复查）、[dsh-contract-verify.md](./dsh-contract-verify.md)（可应用契约的二次验证记录）
>
> * 上游源码路径均相对官方仓库根 `packages/`（简写），本机镜像在 `D:\workspace\dsh-plugin\deepseek-harness\packages\`

***

## 一、插件依赖面（详细契约，0.2.2-rc.1 核验通过）

### 1.1 Host 服务（经 `inject` 声明或 `ctx.get` 获取）

插件 `inject = ['shell', 'sessions', 'agents']`；`settings` / `sessionQuery` / `sandboxPolicy` 按需 `ctx.get`，`connection` 经 `ctx.inject([...], cb)` 可选注入（I32：桌面端 composition 禁用 webServer row，硬声明会让 fiber 永久 pending）。

#### shell —— 命令执行（`shell/shell/src/types.ts`）

两版逐字节一致，0.1.2-alpha.1 零变更（2026-08-30 双 tag diff 实证：`dsh-v0.1.1-rc.2 ↔ dsh-v0.1.2-alpha.1` 的 types.ts 零差异）。插件全量使用面：

```ts
// ≤0.1.6（旧面）：前台执行走 run
interface ShellExecutor {
  resolve(request: ShellExecRequest): ShellExecSpec   // 填充并封顶必填字段
  run(spec: ShellExecSpec): Promise<ShellRunResult>   // 前台执行，stdout 截断可判定
  // 另有 start()：后台进程句柄（插件未用）
}
// ≥0.1.7（新面）：run/start 抽象方法被删除，改为 handle + result()
interface ShellExecutor {
  resolve(request: ShellExecRequest): ShellExecSpec
  execute(spec: ShellExecSpec): Promise<ShellExecution>   // 准备期超时返回已 settled 的 handle
}
interface ShellExecution extends ShellProcess {
  result(): Promise<ShellRunResult>   // 只在基础设施失败（spawn 未产出进程）时 reject
}
// 插件 ShellExecRequest 字段：command / timeoutMs / stdoutMaxBytes / stdin / sandboxPolicy{mode:'danger-full-access', workspaceRoot}
// 插件 ShellRunResult 读取字段：exitCode（**可为 null**：准备期超时/信号终止）/ stdout.text / stdout.truncated / stderr.text / timedOut
```

**插件对策（双分支，I38）**：`src/host/store.ts` 的 `runViaExecutor(shell, spec)` 按运行时方法探测分流
（`typeof shell.run === 'function'` → 旧通道；否则 `execute` + `result()`），两分支共用同一 spec 构造与
同一失败分级——peer 保留 0.1.2–0.1.6 各线段，单路径会把老用户全断；也不能只看「宿主里装的 dsh-shell 版本」
（宿主注入的是它自己的执行器实例）。失败分级：`exitCode === null` 且无 stderr（或 first-cause `timedOut`
在场）→「命令准备期超时」；有 stderr / 非零退出 → 回显 stderr 原文（无 stderr 时由兜底落 `exit <code>`）。
探针见 `tests/probe/api-surface.test.js`（抽象面无 `run`/`start`、`result()` 与可空 `exitCode`）与
`tests/unit/store-shell-execute.test.js`。**方言面（I36）不受影响**：`ShellExecutor` 仍无「我是 bash 还是
pwsh」的字段，行为探针 + 直连 powershell.exe 兜底照旧。

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
  fork(opts: { sessionId: SessionId; atSeq?: number; increaseTitle?: boolean; onCreated?: (childId: SessionId) => void; allowMigration?: boolean }): Promise<SessionId>
  scope(id: SessionId): AgentContext | undefined
}
```

* fork 语义：从 `atSeq` 切出新会话；**不传** **`increaseTitle`** **避免「xxx 2」标题递增（不变量 I6）**；请求的 child-title rename 失败会在创建后抛错
* **0.2.1-alpha.2 新增可选 `allowMigration`**：仅显式 `false` 且源会话非 live 且持久化 `formatStatus === 'migration-required'` 时抛 `SessionForkError` 拒绝（侧栏「先打开原会话」迁移提示同源）；插件不传 → 保持 Host 默认允许迁移

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

#### connection —— 载体无关 API 路由（`client/connection/src/index.ts`）

```ts
interface HostConnectionHandle {
  fetch: {
    // exact 匹配（注册 path 与请求 pathname 全等才响应）；重复注册抛错；
    // 返回异步 disposer（注册本体挂在 connection 插件 fiber 的 effect 上）
    register(route: {
      path: string
      methods: readonly ('GET' | 'HEAD' | 'POST')[]
      requestBody: 'buffered' | 'streaming'
      fetch: (request: Request) => Promise<Response>
    }): () => Promise<void>
  }
}
```

插件经 `ctx.inject(['connection'], cb)` **可选注入**（服务缺席不 pending，仅 Client API 降级不可用），为 12 个端点各注册一条 `POST /api/recall/<name>` 的 exact 路由（`requestBody: 'buffered'`；插件自留 1MB 请求体上限），并用 `cb.effect` 包裹 register 返回值把异步 disposer 接到 fiber 卸载（否则 HMR 重载撞「route already registered」）。web 端由 client-connection 把 `/api` 前缀挂到 webServer、桌面端由 dsh-desktop-host 用 `createSharedFetchHandler('/api')` 直接分发——客户端 URL 与方法两端完全一致。**实测 0.1.2-alpha.1：插件** **`/api/recall/*`** **端点不受 Web UI 一次性 token 鉴权拦截**（鉴权作用于页面/静态资源层）。**为什么不再用 webServer 前缀路由**：桌面端 composition 对 `webserver` row 置 `disabled: true`，顶层 inject 硬声明会让 fiber 永久 pending（「entry did not activate」），详见 compat-audit I32。

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

```ts
// ≥0.1.7（新面）：整个 SettingsProvider 移除，只剩 SettingsForms
class SettingsForms extends Service {
  describe(options?): SettingsDescriptor[]            // ns = entry.options.id；无 volatile 字段的 entry 被跳过
  update(ns, patch, expectedRevision?): Promise<void> // ns 不存在抛 No configurable plugin entry "<ns>"
  replace(ns, section, expectedRevision?): Promise<void>   // 恢复默认路径
  mutate(ns, ops, expectedRevision?): Promise<void>
  configure(presentation, owner?): () => void         // 只控制「自动页」策略，非注册入口
  get writable(): boolean
}
```

签名与 0.1.1-rc.2 一致（entry 为组合 `base`、hooks.setSource + onChange）；内部 `ctx.inject(['settings'])` 后 `settings.register(ns, schema, ...)`。**0.1.2-alpha.2 破坏性变更：独立函数** **`installSettingsSection`** **移除**，官方插件（bash-local/pwsh-local 等）改 `ctx.inject(['settings'], sctx => sctx.settings.installSection(ctx, ns, schema, entry, hooks))`。插件 `src/host/index.ts` 双版本兼容：`typeof dshSettings.installSettingsSection === 'function'` 时走旧函数，否则走 `settings.installSection`。

**0.1.7-alpha.1 换代（I30/I39，本轮已双分支适配）**：`installSection`/`register`/`installSettingsSection`
**全树零命中**（旧三分支在新面上静默 no-op），配置所有权移到 profile：

* **ns = profile entry id**——`configEditor.entries().find(row => row.options.id === ns)` 是官方唯一匹配式；
  本机实测插件的行 id 是 bundle patch 的 insert 行 id **`recall`**（`entry.id` 则是带父 tree 前缀的
  `include:recall`），`describe()` 也按 `entry.options.id` 报 ns，并跳过 `fiber.state !== 2` 的条目
  （**apply 期看不到自身**是常态——插件因此保留 `options.id` 回退候选，见 `host/config.ts resolveSettingsNs`）。
* **volatile 门槛**：只有 schema 标 schemastery `.volatile()` 的字段被 `describe()` 收录、被
  `update/replace` 写入（无 volatile 字段的 entry 被跳过、写入抛 `has no volatile fields`）。`.volatile()`
  只在 schemastery ≥3.18.3 存在（0.1.6-alpha.2 随装 3.18.2），故插件 **feature-detect**（`withVolatile`）。
* **热更**：`cordis-plugin-loader` 的 `Entry.update → _commitVolatile` 把新值 commit 进运行中 fiber 的 ref，
  再经**只对目标 fiber 可见**的上下文派发 `loader/volatile-update(paths)` → 插件只能在自己 `ctx` 上监听、
  收到后重读 `config`（与 `fiber.config` 同对象）并解一层 Volatile ref（`unwrapConfig`，duck-type
  `typeof v.get === 'function'`，不引入 cosmokit 依赖）。
* **分派判据**：旧注册入口是否缺席——只看「`describe`/`update` 是函数」分不了流（旧面同样有），
  误判会让 0.1.6 上的 namespace 不注册（卡片失联）。
* 官方 Cookbook 佐证：`docs/reference/12-cookbook-settings-card.md`（0.1.7 重写版）给出的官方写法就是
  `z.string().volatile()` + `ctx.on('loader/volatile-update', …)` 读 `config.x.get()`。

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
  loadImage: MessageImageLoader   // 0.1.3-alpha.1 起下放；**0.2.1-alpha.3 起成为图片入口链的一环**（新面经它 + renderFactorySlot 渲染）
  // 旧面（≤0.2.1-alpha.2）：renderMessageImages: RenderMessageImages —— **0.2.1-alpha.3 已移除**
  //（随 conversation.message.images slot 拆分下线，见下方双面说明）
  fileMentions(owner: TurnTailOwnerProps): MarkdownFileMentions | undefined
  turnProcess?: TurnProcessOwnerProps        // 新增：折叠过程状态（插件未读）
}
```

* 插件实际读取（issue #23 起判据重写）：`node`（`data.content` 块数组 + `referenceLabels` / `skillNames`）/ `sessionId` + 两面单源判据在 `src/client/user-content.ts`——**旧面信号**＝`renderMessageImages` 闭包在场（≤0.2.1-alpha.2；该闭包与新槽位引入版本互斥，0.2.0-rc.2「已下发 renderFactorySlot、槽位缺席」的并存形态据此归旧面）；**新面**（≥0.2.1-alpha.3）＝`renderFactorySlot`（`ChatNodeViewProps & PropsRenderFactories`）+ `loadImage`，经 `renderFactorySlot('conversation.chat.user.content', { content: { text, attachments:[(image|file)], extraBlocks }, loadImage, interactive:true, facts:{...} })` 渲染**整条内容**（投影＝官方 `contentParts` 三分派复刻，官方 `UserMessageNodeView` 同款调用），返回空/抛错即回落自绘（旧面路径：图片走 `renderMessageImages`、文本/文件卡片/JSON 自绘）并 warn

* `props.sessionId` 由 scope='session' 的 kit 注入（`ui-session` merge 进 `SessionStandardProps`，I3）

* 注册键覆盖 `['user', 'steering']`（I5）；`node.id` 是快照主键、`node.key` 是位置键（I4）

* 内置 `ChatNodeKind` 全集（15 键，`ChatNodeDataMap` 增强，ui-chat/conversation-nodes/）：`user`、`steering`、`context`、`assistant-step`、`tool-call`、`command`（commandId 是其数据字段非键）、`compaction` / `manual-compaction`、`model-retry`、`system-prompt`、`turn-process`、`turn-tail`、`turn-error`、`turn-max-tokens`、`unknown`（projection kind 才叫 unknown-surface）；`chat` 是 view target 非 kind。注意 `context` 类消息节点插件未覆盖（无撤回按钮，按设计只挂 user/steering）

* 0.1.2-alpha.1 新增 turn-process 折叠：user/steering 不参与折叠（独立 kind），撤回按钮显示不受影响（已冒烟确认）

#### 输入区写入链与附件回读（I34 / **B1**，`client/ui-conversation` + `client/api-session-controller`）

```ts
// 回填「文本 + 附件 + 可选发送」全走官方通道（会话级 shell）
conversation.input.shell(sessionId): {
  actions: { setDraft(text): void; addAttachments(ids): boolean; submit(): void }
  get snapshot(): { draft: string; attachmentIds; draftRev; phase; ... }
}
conversation.createDrafts(sessionId, files, uploadImages?: boolean): DraftAttachmentDescriptor[]
conversation.releaseDraftAttachments(drafts): void
// 会话对象层：历史附件字节回读（撤回回填 / 编辑重发重建 File 的唯一通道）
sessions.binding(sessionId).session.readAttachment(arg): Promise<{ ok, value?: { attachment, data } }>
```

* `submit()` 无参、内部即 `submit('queue')`；插件替用户按下发送前按 `snapshot.draft` 校验草稿已落地（旧版空草稿会提前返回，表现为「没报错但没发」）。`setDraft` 是整段替换语义（含引用/引用块芯片），回填不会残留旧芯片。
* **`readAttachment` 入参两代（B1，0.2.2-alpha.2 核验）**：≤0.2.1 收 `attachmentId` 字符串，宿主 `referencedImage(source.events, id)` 回会话日志反查完整引用并做「会话引用」授权；≥0.2.2-alpha.1 收完整 `ImageAttachmentRef`，宿主 `attachments.readImage(request.attachment)` 只按 `mediaType`/`bytes`/`width`/`height` 自证（`session/attachment-invalid` + `ATTACHMENT_NOT_REFERENCED` 授权分支删除，裸 id 直接 `INVALID_ATTACHMENT_REF`）。两代返回形状一致（`{ attachment, data: Uint8Array }`），故插件按「完整引用 → 裸 id」探测回退，并把命中的那代缓存在 `buildDraftFill` 闭包里（同一次撤回的多张图不重复撞错）。误用另一代口径只会回 error（不抛专用错），这是回退探测成立的前提。
* `createDrafts` 第三参 `uploadImages`（≥0.2.2-alpha.2）：`true` 时图片进输入态即后台上传、发送复用已上传图；`false`（子代理续写）随 prompt 内联发字节。旧版忽略多余实参。**插件按场景分流**（真机实测教训）：只回填不发送 → `true`；**自动发送 → 必须 `false`**——官方 `sendSession` 会等上传回执，刚 fork 的子会话上传未结算时草稿会留在输入框、消息不发且无报错。
* 提交状态机（≥0.2.2-alpha.2）新增 `sending` 相位：**宿主确认接收后才 `commit-draft`**，失败保留草稿/引用/附件；`InputState.phase` 非 `plain` 时 `submit()` 静默 no-op。插件不读相位，只在刚 fork 的空会话上发起一次提交。

#### `settings.plugin.item` —— 设置页卡片（**0.1.6-alpha.2 起移除**）

```ts
// 0.1.2-alpha.2 〜 0.1.6-alpha.1：keyed/root（ui-settings-plugins slot-contract.ts）
'settings.plugin.item': { kind: 'keyed'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
// key = settings namespace（'dsh-recall'），按 namespace 交集分发（I12）
// owner props 为空（卡片自绘内部）
// 0.1.6-alpha.2：旧设置页插件 tab（settings.plugins.tab）与该 slot 一并删除，
// 产物 grep 无 'settings.plugin.item' 字符串；slots.inject 对未声明 key 静默
// no-op（renderer spec 为 undefined 直接 return），旧键注册保留为兼容路径
```

#### `plugins.bundle.config` —— 插件管理页 bundle 配置（**0.1.6-alpha.2 新增**，`client/ui-plugin-manager/src/client/slot-contract.ts`）

```ts
// 新插件管理页（Plugin Manager，取代旧设置页插件 tab）声明三个配置 slot：
'plugins.item':         { kind: 'list';  scope: 'root'; owner: PluginConfigViewProps } // 官方插件列表项（label/order；被 ui-settings-plugins 自带配置页占用）
'plugins.bundle.config': { kind: 'keyed'; scope: 'root'; owner: PluginConfigViewProps } // bundle 自带配置，key=bundle 包名（插件用 'dsh-recall-plugin'）
'plugins.row.config':   { kind: 'keyed'; scope: 'root'; owner: PluginConfigViewProps } // bundle 行配置，key=`<package>#<rowId>`
interface PluginConfigViewProps { readonly view: 'summary' | 'page' }
// bundle.config 只以 page 视图渲染（renderSlot(slot, { view: 'page' }, { entryKey: pkg.name })），
// 要求表单自含保存控件——RecallSettingsCard 自绘完整表单天然兼容（忽略 view prop）。
// 页面经 configLedger 投影 entries(name).options.key 聚合 bundle 集合，bundle 列表来自 pluginInventory。
```

#### Client 装载契约（I13）

`__ModuleLoader__.load({ id, factory })` 注册；单文件 CJS factory 包裹（classic script，禁顶层 import）；`react` 为 external，由 loader 运行时 `require("react")` 提供，external 白名单只此一家。

### 1.3 会话事件（`core/session/src/known-event-types.ts` + `types.ts`）

事件域 `session/event` 广播持久事实（合规 #6）。「模型可见即已记录」不变式成立。

插件 `scanCutSeq` 依赖（0.1.2-alpha.1 保留）：

* `'user/message'`：`UserMessage`，`e.data.id` 是稳定消息 ID（`Message.id` 跨表示边界不变）

* `'turn/end'`：关闭 turn，携带 `e.seq`（单调递增事件序号）；`resolveCutSeq` 取目标消息之前最近一次

事件信封：`{ type, seq, time, data, ignorable? }`；持久化读路径对未知类型 **fail-closed**——拒绝解释含集合外类型的日志（防新版日志被旧版错误重建，known-event-types.ts:8-17）；插件只扫描上述两种类型，官方新增类型对扫描逻辑天然向后兼容。**0.1.2-alpha.2 恢复：0.1.2-alpha.1 曾移除信封** **`ignorable?: true`** **字段（未知类型从「带标记可跳过」改为一律拒绝、fail-closed 取代 ignorable），alpha.2 回滚该变更**——已装产物实证（`dsh-session/lib/index.js` 事件校验 `event.ignorable !== void 0 && event.ignorable !== true` 分支、`dsh-session-persistence` 未知类型按 ignorable 区分拒绝/跳过）恢复 0.1.1-rc.2 语义；插件只扫 `user/message` + `turn/end`，不读 ignorable，无影响。另 `tool/call` 的 `callId` 类型由 `CallId` 改名为 `ToolCallId`（插件不读 tool/call，无影响）。**0.1.7-alpha.1（Session format V4）**：事件集 54→**59**（新增 `deliverables/presented`、`developer/message`、`image/offload`、`subagent/catalog`、`workspace/changes`，见 §四），并附 V3→V4 批量迁移工具、兼容部分 V3 会话缺轮次结束记录。插件按 `type` 精确匹配（只认 `user/message` + `turn/end`），新增类型天然被忽略；迁移保留原始 message id，插件以 id 为主键定位消息、`scanCutSeq` 用实际 `e.seq` 而非数组下标——坐标系与 fork 同源，免疫。**V3 缺 `turn/end` 的容忍是正向变化**：`resolveCutSeq` 依赖该记录，官方让它更可靠。

### 1.4 环境约束（0.1.2-alpha.1 实测）

* Node ≥ 22.19 / ≥ 24（本机 24.14.1）

* cordis 4：服务必须先 `inject` 声明才能 `ctx.<name>` 访问（漏声明被守卫吞掉静默 fail-open，I10）

* Web UI 访问带一次性 token（`dsh web` 启动输出 `?token=<...>`），插件 API 端点不受影响

* pwsh 路径解析对 WindowsApps 别名判否，生产口径常落 PS 5.1（I27 不变）

***

## 二、Client 扩展点全量清单（54 个 slot）

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

0.2.1-alpha.2 对本表新增 2 个未依赖 slot：`conversation.chat.flow`（single / session / ui-chat——有序 Chat 行与本地回声的渲染层；`conversation.view` 的 `PropsRenderSlots` 已由 `chat.node` 改指本 slot，keyed `chat.node` 贡献者注册路径不受影响）与 `conversation.chat.reasoning.body`（single / session / ui-chat——展开的思考正文，官方入口 priority 100）；另有 factory `conversation.chat.reasoning.content`（`SlotFactoryMap` / root scope，思考 Markdown 的 Content Factory）。

## 三、Host 服务全量清单（按域分组，\~75 个）

★ = 插件依赖。可选服务（`?`）可能缺席，访问前需判空。

**api 域**：`sessions`★（SessionStore + ISessions 扩展）、`sessionController`、`sessionFileReferences`、`sessionSkillCatalog`、`credentialsController`、`settingsController`、`directoryPickerController`、`workspaceController`、`workspaces`、`remote`（@Remote 网关客户端句柄，APIProxy 已移除）、`typertGateway`

**core 域**：`agents`★（AgentRegistry）、`sessions`★（SessionStore，与 api 层同实例）、`tools`（ToolRuntime）、`systemPrompt`、`agentLoop`、`agentDefaultModel`、`agent?`（当前 Agent，in-initiator 才有）

**shell 域**：`shell`★（ShellExecutor）、`shellEnv`

**session 域**：`sessionQuery`★（SessionQueryEngine）、`sessionPersistence`、`sessionProjections`、`sessionProjectionCache`、`sessionTitle`、`sessionTelemetry`、`sessionLogDownload`

**host/web**：`connection`★（载体无关 fetch/rpc 注册表，web 与桌面端同源）、`webServer`、`directoryPicker`、`web`（WebRuntime）、`webhookRuntime`

**llm**：`llm`（LlmRuntime）、`tokenMeter`、`deepseekLlmApiExtensions`

**sandbox/subprocess/terminal**：`sandboxPolicy`★（插件读 `workspaceRoot`）、`sandbox`、`subprocess`、`terminals`

**storage/fs/spill**：`storage`、`storageDomain`、`fs`（FileSystem）、`spillStore`、`attachments`

**interaction**：`commands`、`approval`、`userQuestions`、`permissionPresets`

**compaction/context**：`compaction`、`toolResultPruner`、`fileReferences`、`sessionReferenceResolver`

**goal/plan/jobs/schedule/workflow**：`goals`、`planMode`、`jobs`、`workflowEngine`（schedule 域经 config 声明）

**其他**：`skills`、`credentials`、`authorization`、`e2b`、`lsp`、`agentTeams`（experimental）、`inspector`（experimental）、`invariants`、`agentPresets`、`subagents`、`subagentModelSelection`、`typert`、`codeRuntime`、`messageFeedback`、`launchEnvironment?`

**boot/CLI**：`dshHomePath?`、`cmdlineArgs?`、`appReady?`、`appExit?`

**client 半专用**（Host 不可见）：`connection`、`locale`、`modules`/`clientModules`、`slots`/`uiRenderer`、`layout`、`uiSession`、`uiConversation`/`conversation`、`commandUi`、`inputTriggers`、`modelDirectories`、`chatFileMentions`、`settingsSchema`/`settingsScope`、`theme`、`uiWorkspace`、`timer`（cordis-client-runner 提供，声明后可用 `ctx.timeout` 等计时动词）

## 四、会话事件类型全集（62 种）

已知类型集合（`KNOWN_SESSION_EVENT_TYPES`，0.2.1-rc.3 复核；`dsh-session/lib/types/known-event-types.js`，由官方 `gen-persistence-catalog` 生成）：

```
agent-preset/selected   agent/inbox/spliced    approval/asked      approval/decided
approval/policy         assistant/attempt      assistant/message   command/done
command/run             compaction/end         compaction/prune    compaction/start
compaction/summary      deliverables/presented(*新)                developer/message(*新)
feedback/message-delete feedback/message-put  feedback/record     goal/change
hook/invoked            hook/result            image/offload(*新)  llm/retry
job/registered(*新)     job/settled(*新)
llm/retry-started       model/selection        permission/preset   plan/mode
request/context         request/header         sandbox/mode        schedule/change
session-log-deepseek/delivery-accepted         session/end-seed    session/title
session/title-llm-request                      step/end            step/start
subagent/catalog(*新)   subagent/descriptor    subagent/model-selection-policy
system/message(*新)     team/member            team/message/delivered
team/message/queued     team/task              todo/write          tool-workflow/agent-end
tool-workflow/agent-start                      tool-workflow/run-end
tool-workflow/run-start                        tool/call           tool/ptc-dispatch(*改)
tool/ptc-dispatch-start(*改)                   tool/result         turn/end
turn/start              user/message           web/deepseek-search-llm-request
working-directory/change(*新)
workspace/changes(*新)
```

0.1.2-alpha.1 相对 0.1.1-rc.2 新增 3 种：`model/selection`、`session-log-deepseek/delivery-accepted`、`subagent/model-selection-policy`。**0.1.3-alpha.1（Session format v2）一进一出**：移除 `assistant/chunk`（不再持久化顶层 chunk，按 attempt 聚合嵌入 `assistant/message`）、新增 log-only 的 `assistant/attempt`。**0.1.5-alpha.1（Session format v3）三处变化**：① 新增 `system/message`（系统提示词纳入消息历史，取代 `request/header` 的 `header.system` 字段）；② `tool/code-dispatch`/`tool/code-dispatch-start` 更名为 `tool/ptc-dispatch`/`tool/ptc-dispatch-start`（PTC 词汇规范化，读取侧 V2→V3 迁移会把旧 `ptc-dispatch` 重命名回 `code-dispatch` 供旧消费方，但 v3 原生写入用 `ptc-dispatch`）；③ 新增 `feedback/message-put`/`feedback/message-delete`（反馈独立提交）。**0.1.7-alpha.1（Session format v4）新增 5 种**：`deliverables/presented`、`developer/message`、`image/offload`、`subagent/catalog`、`workspace/changes`（另有 V3→V4 批量迁移工具；「部分 V3 会话缺轮次结束记录」的兼容属正向，`resolveCutSeq` 依赖的 `turn/end` 更可靠）。**对齐不改语义**——消费方按需扫描（如插件 scanCutSeq 只扫 `user/message` + `turn/end`）天然向后兼容；v3/v4 对旧日志经不可变相邻 generation 迁移，读取侧 seq 为迁移后密集重映射语义（V2→V3 会插入 `system/message` 事件并 remap seq，但保留原始 message id——插件以 id 为主键定位消息、以恢复后 seq 推导 cutSeq，坐标系与 fork 同源，不受影响）。**0.2.1-alpha.2 新增 1 种、零删除**：`working-directory/change`——对应新增的工作目录能力（官方架构文档同步明示其「不改变原始项目标识、沙箱写入根目录或已有进程目录」，本插件的影子仓库范围假设据此确认），`turn/end` 等快照主链事件未动。**0.2.1-alpha.3 新增 2 种、零删除**：`job/registered`、`job/settled`（jobs 作业注册/结算落会话日志，对应「应用意外退出后未完成任务显示『任务已停止』」的能力面；与 I7 的归档 stopActivity 护栏同域）——插件扫描面（`user/message` + `turn/end`）与快照触发不受影响。**0.2.1-alpha.4 零变化**（`dsh-session` `lib/` 逐字节相同，全集仍 62 种）。

## 五、内置 Tool 包清单（22 个）

`@deepseek-ai/dsh-tool-{ask-user, bash, bash-persistent, pwsh-persistent, cordis, fs, fs-search, goal, pwsh, ralph, skill, str-replace-editor, subagent, subagent-control, jobs, todo, web, workflow, subagent-report, terminal, working-directory, session-query}`

0.1.2 变化：PTC Mode 更名自 Code Mode；PTC 的 SDK 能力只能经 `run_code` 调用（不再暴露为直接工具）。**0.2.1-alpha.2 新增 3 个**（`terminal` / `working-directory` / `session-query`；同版 `dsh-tool-subagent` 移除 `enableRunInBackground` / `backgroundMode` 配置、改「每次委派启动 managed activation 并返回 child id」，并移除 `dsh-subagent-in-process-driver` 包）。插件不注册 tool，仅受 `tool/call`、`tool/result` 事件影响（快照内容层面）。

## 六、其他横切契约

* **bundle patch 语义**（`cordis.patch.yml`）：patch 按行替换目标行整个 config，不深合并；覆盖前层行须重述所有键（合规 #4）

* **HMR**：卸载旧实例 → 重载新实例，一切注册清零；禁跨 apply 模块级可变状态（合规 #5）

* **Config**：活 Schemastery schema，无效配置加载即响亮失败（合规 #3）

* **一次性 token 鉴权**：`dsh web` 启动 URL 带 `?token=`；实测插件 `/api/recall/*` 前缀路由不经过该鉴权层。**0.2.1-alpha.3 起 exact Fetch 路由明确「仅 owner Peer 可达、非 owner principal 一律 403」**（`dsh-api-remote-access` 方法级门禁 + Peer/Principal 模型）——本机 web/desktop（owner）不受影响；远程非 owner 部署下插件 API 会被 403（观察项，见 compat-audit 头部 0.2.1-alpha.3 段）

* **APIProxy 已移除**：一切远程调用走 `@Remote` 网关（插件未使用，无影响）

## 七、dsh 升级核查指引

1. **契约对比**（一次升级只做一遍）：**类型源 diff 核对法**——插件对官方 API 的依赖面已契约化为 `src/types/dsh-contract.ts`（Host 依赖面，含两个 ambient 模块）与 `src/types/client-contract.ts`（Client slot/`__ModuleLoader__`/服务），升级时以这两文件为**单一类型源**，逐节对照新旧 tag 的官方 `.d.ts`/产物 diff，类型与官方不一致处即升级断点；`conversation.chat.node` 声明位置可能在包重组后迁移（历史上曾发生 `ui-conversation` → `ui-chat`），先 `git/trees` 搜 slot 名再 diff。compare API 截断 300 文件不可用，用 `contents/trees` API 逐文件拉。
2. **机器化断言**：`npm run test:probe`（官方字段假设）→ `npm run verify:host`（装配门禁）→ `npm run check:dsh`（版本巡检；镜像漂移提醒后重拉 `docs/reference/` 并更新其头部「归档 dsh 版本」）。
3. **实弹冒烟**：中文路径工作区发消息 → 撤回（清单/文件恢复/对话回退/标题不变）→ 设置页快照管理。新 UI 机制（如 0.1.2 的 turn-process 折叠、字号调节）重点确认插件 UI 可见性与视觉协调。
4. **台账**：核查结论对照 `docs/compat-audit.md` I1-I43 定点更新，发现失效项补「失效症状 + 复查动作」。

> **版本核验记录归口**：历次版本（含最新 **0.2.1-rc.3**，2026-10-24：零破坏——6 commit 全是纯加法与内部修复；20 包 `lib`/`dist` 漂移但消费面逐字节零变更；六条 peer 对 rc.3 全满足；镜像 13 源逐字节零差异）的核查记录见 [compat-audit.md](./compat-audit.md) 头部核验段与 [upgrade-assessments/](./upgrade-assessments/)；本文只保留当前版本的核验状态与一直成立的事实，不堆叠历史记录。
