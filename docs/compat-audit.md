# compat 台账：官方 API 耦合点矩阵

> 本文是「一直成立的事实」规范（非计划）：把 AGENTS.md「已知坑」的散文列表升级为
> 「子系统 × 不变量 × 探针」矩阵，供 **dsh 升级后定点复查**——升级后先过本表，逐条
> 核对「出处」是否漂移，替代全文重读 AGENTS.md。AGENTS.md「已知坑」保留为一行一条
> 索引，细节住这里，避免双写漂移。
>
> 出处标注为 2026-09-01 核验（alpha.3）；每次 dsh 升级后按「复查动作」更新本节「核验日期」。
>
> **0.2.1-alpha.2 核验（2026-10-09）——零破坏版本，无需改码，peer 窗口无需追加**：**npm 已发布**（dist-tag `alpha` 指向本版，
> tag `dsh-v0.2.1-alpha.2`，2026-10-09 发布、0.2.1 线第二个 alpha；`latest`/`next` 仍 0.2.0-rc.2），
> `npm install -g @deepseek-ai/dsh@0.2.1-alpha.2` 全局实装（15 增 / 12 删 / 546 替换包、2 分钟；cordis 4.0.5-alpha.1 与
> schemastery 3.18.5-alpha.1 **两条独立版本线本轮未动**）。**核验方式为全树内容级 diff**：npm 侧另装 `0.2.1-alpha.1`
> 完整树（558 包）作基线——包集合 290 → 299（移除 6 / 新增 15），274 包有差异、**1156 个真内容变更文件**、40 包纯版本号差异；
> 关键契约文件再逐行 diff。**消费/注册契约零漂移**：ui-chat `contract/slots.d.ts` 的 **`ChatNodeOwnerProps` 定义与
> `'conversation.chat.node'` SlotMap 声明**逐字节相同（含 `renderMessageImages` / `loadImage` / `forkAt`），`contract/chat-nodes.d.ts`
> 与 `chat/MessageItem.d.ts` 逐字节相同；ui-conversation `service.d.ts`（`updateQueue` 声明处）与 `contract/input.d.ts`
> （`InputActions.setDraft`）**整文件逐字节相同**；`dsh-client-modules` 的 `lib/types/index.d.ts` 逐字节相同、`dsh-client-ui-slots`
> 整包仅 package.json（**keyed slot priority 分发机制零漂移**）。**包级零内容变化**：`dsh-agent`（除 lockstep 版本号与依赖顺序）、
> `dsh-base` 的 `lib/`、`dsh-shell`、`dsh-settings`、`dsh-sandbox-policy`、`dsh-jobs-local`、`dsh-package-manifest`、
> `dsh-host-plugin-inventory`、`dsh-atomic-write`、`dsh-fs-local`。**真增量（插件不消费或纯增）**：① Agent Teams inbox 直投
> （破坏性声明，落点在 `ctx.agentTeams` 实验协作层，非插件消费面）；② 子代理统一执行——`dsh-tool-subagent` 移除
> `enableRunInBackground` / `backgroundMode` 配置、改「每次委派启动 managed activation 并返回 child id」；
> ③ `sessions.fork` 新增可选 `allowMigration`（实现：仅 `=== false` 且源非 live 且 `formatStatus === 'migration-required'` 时拒绝，
> 插件不传保持 Host 默认）+ `ui-workspace.forkSession` 新增第三可选参数；④ ui-chat 新增 `conversation.chat.flow` 渲染中间层
> （`conversation.view` 的 `PropsRenderSlots` 由 `chat.node` 改 `chat.flow`）、`conversation.chat.reasoning.body` / `.content`、
> `ChatNodeSeat` 新增 `useChatNodeBottom` / `deferCollapse` / `useGroupAction` 入参；⑤ `formatStatus` 迁移态字段（session-query /
> session-persistence / SessionListEntry / SessionSummary / SessionProjectionSnapshot.state 各加可选值）；
> ⑥ `dsh-session` 新增 `appendPluginRecord` / `pluginRecordOf`（**仅官方 experimental 包可调**，第三方不可用）、
> `SESSION_FORMAT_VERSION` 仍 4；⑦ webserver 任意绑定地址 + TLS（`Config.host` 放宽为 `string`、新增 `tls?`）；
> ⑧ agents home 解析（`DSH_AGENTS_HOME`）；⑨ 包增删：移除 webhook 族 2 + hooks 族 3 + `dsh-subagent-in-process-driver`，
> 新增 working-directory / tool-working-directory / tool-terminal / tool-session-query / session-title-all-prompts-llm
> 与多个 experimental bundle。**事件集**：`KNOWN_SESSION_EVENT_TYPES` 59 → 60，仅新增 `working-directory/change`、**零删除**
> （`user/message` / `turn/end` / `turn/start` 全在）。**正向澄清**：镜像 `09-architecture.md` 新增「工作目录提供用户上下文和执行路径，
> **不改变原始项目标识、沙箱写入根目录或已有进程目录**」——影子仓库以工作区根为范围的前提获官方背书（13 源中仅此份变化、
> +68 B，其余 12 份逐字节相同）。**门禁**：`test:probe` **52/52**、`verify:host` 装配断言全过（inject=shell,sessions,agents、
> 端点 13 项）、单测 **499/499**、`test:client` **90/90**、`typecheck`、`check:dsh` **`✔ 全部一致`**（本地 0.2.1-alpha.2
> 落在既有 peer 段 `>=0.2.1-alpha.1 <0.3.0` 内——**同 tuple 无需追加**，与 alpha.1 轮次的「跨 tuple 必须显式追加」形成对照）。
> **台账动作**：`dshReleases` 补 `0.2.1-alpha.2: compatible`、`docs/dsh-contract.md` 与 `docs/reference/README.md` 版本字段
> 随镜像同步。核验记录归口 [upgrade-assessments/dsh-0.2.1-alpha.2.md](./upgrade-assessments/dsh-0.2.1-alpha.2.md)。
> **观察项（非阻塞）**：① working_directory 引入「用户上下文/执行路径」与「项目标识/沙箱写入根」的区分——若未来写入根
> 跟随工作目录，快照范围需重评；② 若未来 Host 让 fork 默认拒绝迁移，撤回对旧格式源会话会失败——届时在 preview 读
> `formatStatus` 给出专属提示；③ `appendPluginRecord` 有 verify gate，第三方插件不可用；④ `conversation.chat.flow` 中间层
> 若未来要求节点贡献者迁入，keyed 注册需迁移。
>
> **2.4.10 发版核验（2026-10-07）**：插件 **2.4.10 已发布**（npm `latest`＝2.4.10、GitHub Release `v2.4.10` 已创建、
> 非 draft/prerelease，tag `v2.4.10` 指向 `1474f46`）；发布提交两个——`df7d7cf`（fix：回退恢复侧改 diff 变更集
> issue #22 + junction 防护评审补强 P3，含机器生成 exclude 行转义两处 JS 串反斜杠被吞的实弹修复）+ `1474f46`
> （chore(release)：2.4.10——`[Unreleased]` 改名、版本 bump、AGENTS.md 单测文件数 37→39）。发版前门禁全绿：
> `typecheck`、单测 **499/499**（39 文件）、`test:client` **90/90**（6 文件）、`build` 后 `lib/` 与提交逐字一致
> （`lib/client.js` 156136 字节）、`test:probe` **52/52**、`verify:host` 装配断言全过（端点 13 项）、`check:dsh`
> `✔ 全部一致`（本地 dsh 0.2.1-alpha.1、npm 最新 0.2.0-rc.2 无新版本）。registry 端点 `/dsh-recall-plugin/2.4.10`
> 与 `dist-tags.latest=2.4.10` 双确认（传播延迟约 1 分钟，packument `modified=2026-10-07T11:22:53Z`，经 HTTP 轮询就绪后直下）。
> **发布产物核验**：tarball 179.8 kB / 解包 553.4 kB，解包后 **24/24 文件与工作区逐字节 SHA256 一致**（17 个 lib
> 产物 + package.json + CHANGELOG.md + README.md + README.en.md + cordis.patch.yml + assets/icon.svg + LICENSE）。
> **本机 profile 实装（装载级）验证通过**：web profile pin `2.4.9` → `2.4.10`、`minimumReleaseAgeExclude` 补
> `2.4.10`、`pnpm install` 实装（8.8s）；`node_modules/dsh-recall-plugin` 为普通目录（npm 模式）、版本 2.4.10、
> peer 含 0.2.1 段；新代码标记在位（`lib/scripts.pwsh.js` 含 `read-tree --empty` / `ReparsePoint` / `reparseRel.Sort()`
> 与转义语句，`lib/scripts.posix.js` 含分批 pathspec archive）。desktop profile 一并实装 2.4.10（pin +
> `minimumReleaseAgeExclude` + `pnpm install`，10s）。**宿主启停冒烟（同日补做，当日实例已重启）通过**：3080 上的
> 原实例实为应用自带 CLI shim（`resources\runtime\cli\bin\dsh.cmd`，设 `ELECTRON_RUN_AS_NODE=1` 后执行 `web` 子命令，
> 走 web profile）——停旧实例（`taskkill /T /F`，端口即刻释放、无残留）→ 原形态重启并捕获 stderr：出现插件自身
> `recall shell dialect probe: pwsh`、**无任何 skip/compat 行**（兼容门禁未跳过本插件），3080 重新监听；
> 启动预热落地：6 个有属主的 store 心跳文件在启动后 1–2 秒内批量刷新（对照重启前为 10-01/10-03/10-04 的陈旧
> 时间戳）。桌面 GUI 经 `Start-Process` 直接拉起未能驻留（无交互桌面会话，进程自行退出；用户日常走 GUI 即可，
> 与本轮 web 宿主形态互不影响）。
>
> **2.4.9 发版核验（2026-10-03）**：插件 **2.4.9 已发布**（npm `latest`＝2.4.9、GitHub Release `v2.4.9` 已创建、
> 非 draft/prerelease，tag `v2.4.9` 指向 `5b21369`）；发布提交两个——`d008fb1`（feat：issue #19 撤回完成事件/回调，
> 随 2.4.8 发布、本次补录进历史）+ `5b21369`（chore(release)：2.4.9——dsh 0.2.1-alpha.1 兼容声明，peer 窗口
> 追加 `>=0.2.1-alpha.1 <0.3.0` 段、上限放宽覆盖 0.2 全线）。**推送前网络受限**：github.com:443 直连超时、
> 本机 git 全局代理 `127.0.0.1:48046` 未启动、`.ssh` 无密钥；经用户提供的 `127.0.0.1:48047` 代理以
> `-c http(s).proxy` 单次覆盖完成 fetch/push（不改 git 配置）；npm registry 直连正常，publish 未走代理。
> 发版前门禁：`typecheck`、`build`（`lib/` 三产物同步、`lib/client.js` 156136 字节）、单测 **497/497**、
> `test:client` **90/90**、`test:probe` **52/52**、`verify:host` 装配断言全过（端点 13 项）、`check:upgrade` 三层全绿
> （`check:dsh` `✔ 全部一致`）。registry 端点 `/dsh-recall-plugin/2.4.9` 与 `dist-tags.latest=2.4.9` 双确认
> （发布后 CLI 初查仍解析到 2.4.8、传播约数分钟，packument `modified=2026-10-03T11:23:36Z`；故产物核验改走
> registry tarball 端点直下）。**发布产物核验**：tarball 175973 字节，解包后 **20/20 文件与工作区逐字节 SHA256 一致**
> （17 个 lib 产物 + package.json + CHANGELOG.md + README.md）。**连带处理**：2.4.8（issue #19）此前「npm 已发、
> git 未提交/未 tag」——本次补录提交 `d008fb1` 并**补齐 v2.4.8 tag + GitHub Release**（tag 指向 `d008fb1`、
> `--latest=false` 保持 v2.4.9 为 Latest；Release 清单 v2.4.9(Latest)/v2.4.8/v2.4.7 次序正确）。**本机 profile
> 实装验证通过**：web profile pin `2.4.6` → `2.4.9`、`minimumReleaseAgeExclude` 补 `2.4.9`、`pnpm install`
> 实装 2.4.9（peer 窗口含 0.2.1 段；`pnpm peers check` 的 missing 清单为宿主提供型、dshmarket 等同款，属既有
> 状态）；启停 `dsh web`（全局 dsh 0.2.1-alpha.1 宿主）——stderr 出现插件自身 `recall shell dialect probe: pwsh`、
> **无 skip/compat 行**（兼容门禁未跳过本插件），进程已停、无残留。
>
> **0.2.1-alpha.1 核验（2026-10-03）——零破坏版本，无需改码；peer 窗口须追加 0.2.1 段**：**npm 已发布**（dist-tag `alpha` 指向本版，
> tag `dsh-v0.2.1-alpha.1`，2026-10-03 发布、0.2.0 线补丁版首个 alpha；`latest`/`next` 仍 0.2.0-rc.2——**装本版须显式写版本号**），
> `npm install -g @deepseek-ai/dsh@0.2.1-alpha.1` 全局实装（22 增 / 3 删 / 536 替换包、1 分钟；cordis 随装 4.0.5-alpha.1、
> schemastery 3.18.5-alpha.1——两者产物**除版本号外逐字节相同**）。**核验方式为全树内容级 diff**：npm 在 Windows 上清理失败留下的
> `.dsh-EBhnoWNL` 残留**正好是 0.2.0-rc.2 整包副本（462.3MB / 26639 文件）**，直接用作基线（比对后已删除）；287 个子包版本号全部
> lockstep 变更（不可用版本号定位），故按「逐包文件集合哈希 → 关键包逐文件归一化版本号比对 → 契约文件逐行 diff」三层定位变更面，
> 并以 GitHub compare 266 commits 交叉验证。**零改动集合（除 package.json 版本号 / README 文案 / 注释外无文件变化）**：6 个 peer
> 出处包 `dsh-session-query`、`dsh-settings`、`dsh-shell`、`dsh-host-webserver`（各仅 README）、`dsh-session`（README + 注释 +
> `invariant.js` 移除）、`dsh-sandbox-policy`（README + `invariant.js` 移除）；其余 `dsh-base`、`dsh-session-projection`、
> `dsh-session-persistence`、`dsh-host-plugin-inventory`、`dsh-client-ui-settings-plugins`、`dsh-session-format`、
> `dsh-session-format-v3-to-v4`、`dsh-atomic-write`、`dsh-session-reference`、`dsh-agent`（仅注释 + invariant 移除）、
> `dsh-client-connection`、`dsh-client-ui-slots`（各仅 README）——**I1/I2/I4/I5/I6/I7/I8/I9/I12/I27/I29/I30/I31/I32/I33/I34/I35/I36/I37/I38/I39/I40
> 的出处包全部涵盖**。**消费/注册契约文件字节级相同**：ui-chat `contract/slots.d.ts`（chat.node props，`renderMessageImages`/`loadImage`
> 在位）与 `contract/chat-nodes.d.ts`（`ChatNodeKind` 全集）、`chat/ChatNodeSeat.d.ts` / `chat/MessageItem.d.ts`；api-session-controller
> `client/contract/sessions.d.ts`（fork/binding）＋`client/sessions/session.d.ts`＋`client/contract/session.d.ts`（`updateQueue`）；
> ui-conversation `service.d.ts`（`updateQueue`/草稿附件链）；ui-workspace `navigation.d.ts` 的 `openSession` 面。**真增量（插件不消费或纯增/正向）**：
> ① 官方草稿系统重构（ui-conversation 新增 `DraftSnapshot`/`DraftInput`/`readConversationDraft`/`requestDraftInitialization`，
> `bindDraftMirror`→`bindDraftPersistence`，**`InputActions.setDraft(text: string)` 签名未变**、`InputFacade.setDraft` 放宽为 `DraftInput`——
> 插件回填链零适配）；② ui-chat `StatsPills` 拆为 `ActivityPill`/`UsagePill`、`ToolCallBlock.root` 可选化、新增 `ToolArgs = PartialArguments`、
> 内部 `partial.d.ts` 移除（插件零消费）；③ ui-workspace `startSession` 新增可选 `options`（新会话预填）、api-session-controller `SessionList`
> 构造器新增内部 `workSliceMs`（分片提速，插件不实例化该类、走 `sessionQuery` 服务）；④ plugin-manager `slot-contract.d.ts` 纯加法
> （`plugins.add.actions`，`plugins.bundle.config` 原样）；⑤ invariant 运行时插件与 `./invariant` 导出全树移除（插件零引用，`src/` 搜索零命中）；
> ⑥ **正向**：`dsh-client-modules` 的 `claimStyles` 修复（未认领 `<style>` 先快照、只认领工厂运行期间新增——启停插件不再误移别家样式）；
> 队列滞留修复（目标任务停止→恢复→再停止）惠及 G1 周边时序。**门禁**：`test:probe` **52/52**、`verify:host` 装配断言全过
> （inject=shell,sessions,agents、端点 13 项）、`check:dsh` 在 peer 窗口追加后全绿。**兼容声明**：6 条 `dsh-*` peer 窗口追加
> `>=0.2.1-alpha.1 <0.2.2` 段（prerelease 门槛：旧窗口 upper `0.2.1` 不带 prerelease、候选 tuple 0.2.1 与 lower 0.2.0 不同 tuple 的复合
> 门槛，与 issue #517 同根因；新段同时覆盖 0.2.1 线后续 alpha/beta/rc/正式版——**同 minor 线不追加 tuple 的惯例只适用于 tuple 不变的
> 版本推进，跨 tuple 必须显式追加**）；**随 2.4.9 发版按决定放宽上限至 `<0.3.0`**（0.2 全线正式版自动放行；0.2.2+ tuple 的 prerelease
> 仍受同一门槛约束，待核验后另加段）；cordis `^4.0.1 || >=4.0.5-alpha.1 <4.0.6`、schemastery `^3.18.1 || >=3.18.5-alpha.1 <3.18.6`
> （两者产物除版本号外逐字节相同，属已验证窗口）；`dshReleases` 补 `0.2.1-alpha.1: compatible`。**观察项（非阻塞）**：① 官方草稿系统
> 演进中——插件 `setDraft(string)` 仍在兼容面（注释明示接受 plain text），若未来字符串分支废弃需改走 `DraftSnapshot`（按 I34 复查动作跟进）；
> ② `ToolCallBlock.root` 可选化与 `SessionList` 构造器签名变化均为内部/不消费面；③ 既有观察项延续（`fork.onCreated` 未用、`dsh-tool-jobs`
> 唤醒上限、`sessionQuery` 三 API 仍 `@deprecated`）。**待办**：活体冒烟本轮未跑（本版对插件零契约变更；按惯例发版前补，建议关注草稿回填
> 与「新会话预填」共存、插件启停样式隔离观感）。评估实证见
> [upgrade-assessments/dsh-0.2.1-alpha.1.md](upgrade-assessments/dsh-0.2.1-alpha.1.md)。
>
> **0.2.0-rc.2 核验（2026-09-29）——零破坏版本，无需改码**：**npm 已发布**（dist-tag `next` 指向本版，tag `dsh-v0.2.0-rc.2`，
> 2026-09-29 发布；`latest` 仍 0.1.7-rc.2、`alpha` 仍 0.1.7-alpha.2——**装最新仍须显式写版本号**）。**发布初期整条线对 npm 用户不可装**：
> `dsh-web-app@0.2.0-rc.2` 精确 pin 的 `@deepseek-ai/dsh-client-ui-settings-account@0.2.0-rc.2` 漏发（注册表直查与 tarball HEAD 双证 404；
> 全依赖闭包扫描 252 包确认唯一缺口），`--install-strategy=shallow`／`--omit=optional`／cwd package.json `overrides`（实测对 `npm i -g`
> 不生效）三类变通全部 ETARGET——约 2 小时后上游补发，`npm install -g @deepseek-ai/dsh@0.2.0-rc.2` 成功（534 包替换、2 分钟；
> 工作区 `dsh-settings` junction 自动跟随到 rc.2；`dsh --version` 实测 `0.2.0-rc.2`）。该包经查**非启动必需件**（`dsh-web-app` 组成里
> 的一行独立客户端插件 `ui-settings-account`，管 DeepSeek 登录与平台计费页；运行期依赖仅 schemastery/cordis，两版均未变），留 rc.1
> 混装亦兼容。**核验方式为 tarball 级逐文件 SHA256 比对**（不依赖安装成功：27 个官方 rc.2 包 vs 本机 rc.1 实装）。**零改动集合**：
> 6 个 peer（`dsh-session`/`dsh-session-query`/`dsh-settings`/`dsh-shell`/`dsh-host-webserver`/`dsh-sandbox-policy`）＋`dsh-base`/
> `dsh-plugin-manager` **只有 package.json 版本号变化**；四个注册/消费面契约文件**字节级全等**——ui-chat `contract/slots.d.ts`
> （chat.node props）、plugin-manager `slot-contract.d.ts`（`plugins.bundle.config`；其 client.js 的 +82/−101 行无一行涉及 slot
> key/entryKey/bundle 解析）、api-session-controller `contract/sessions.d.ts`（fork/binding）、ui-conversation `contract/slots.d.ts`
> （composer/草稿）；`dsh-session-projection`（消息 kind 归属）、`dsh-client-ui-slots`、`dsh-api-workspace-controller`/
> `dsh-api-settings-controller`/`dsh-client-connection` 亦仅版本号变化。**真增量全部落在插件不消费处**：ui-chat（`formatRunDuration`
> 改返回 `RunDurationPart[]`、鲸鱼尾改 APNG 资源、locale）、ui-theme（`FONT_SIZE_MIN/MAX` 12–17→10–22）、api-remotes（新增
> `export type {} from '@deepseek-ai/dsh-user-questions/remote'`）、dsh-schedule（提醒框架文案由「untrusted reminder content…」改为
> 固定句 `This is a scheduled message from the user`，6 增 4 删，**无新事件类型、无新消息 kind、投递路径不变**）、
> dsh-tool-ask-user（异步问答 opt-in `Config{mode?: 'legacy' | 'timed', timeout?}`，默认 legacy；新增 `lib/types/timed.d.ts`）、
> plugin-manager（`InstallInputError.problem` 增 `'shipped'`、`managementText` 增可选 `installing`）、api-session-controller typert
> 签名表增可选 `userQuestions`（active/settled）、两次 pwsh 工具仅提示文案与持久完成标记识别、镜像 `09-architecture.md` 桌面段重写
> （净 −173 字符，对应桌面内置 dsh 命令的新能力）。**门禁**：`test:probe` **52/52**、`verify:host` 装配断言全过（inject=shell,sessions,agents、
> 端点 12 项）、`check:dsh` 在镜像与契约文档字段同步后全绿（6 条 peer 落在 `>=0.2.0-rc.1 <0.2.1` 窗口内）。**兼容声明**：peer 范围由既有
> 0.2.0 窗口天然覆盖——同 minor 线内出新版**不追加 tuple**（符合 2.3.11 起约定），`dshReleases` 补 `0.2.0-rc.2: compatible`。
> **观察项（非阻塞）**：① 上游漏发任一子包会让整条 dsh 线对 npm 用户不可装——升级前可先用依赖闭包探针预检（本轮脚本化扫描 252 包）；
> ② 异步问答 timed 模式若被用户手动开启，等待超时后 agent 继续工作——插件 P0-1 拦截读 `agents.status`，语义不变，未实弹验证；
> ③ 既有观察项延续（`fork.onCreated` 未用、`dsh-tool-jobs` 唤醒上限、`sessionQuery` 三 API 仍 `@deprecated`）。**待办**：活体冒烟本轮未跑
> （本版对插件零契约变更），如需按 smoke-checklist 补一轮真宿主 + 浏览器实弹。评估实证见 [upgrade-assessments/dsh-0.2.0-rc.2.md](upgrade-assessments/dsh-0.2.0-rc.2.md)。
>
> **0.2.0-rc.1 核验（2026-09-29）——零破坏版本，无需改码**：**npm 已发布**（dist-tag `next` 指向本版，
> tag `dsh-v0.2.0-rc.1`，2026-09-28 发布、0.2.0 系列首个候选版本、汇总自 `v0.1.7-rc.2`；`latest` 仍 0.1.7-rc.2、
> `alpha` 仍 0.1.7-alpha.2——**`npm i -g @deepseek-ai/dsh` 装不到本版，必须显式写版本号**），`npm install -g
> @deepseek-ai/dsh@0.2.0-rc.1` 全局实装（0.1.7-rc.2 → 0.2.0-rc.1；cordis 4.0.4 / schemastery 3.18.4 版本与内容均未变；
> 包布局不变、工作区 `dsh-settings` junction 随升级自动解析到新版）。**核验方式为全树逐文件哈希 diff**：npm 在
> Windows 上清理失败留下的 `.dsh-EBhnoWNL` 残留**正好是 0.1.7-rc.2 整包副本（298MB）**，直接用作基线（比对后已删除）。
> 规模：**528 包中 310 包仅版本号 lockstep 变更**；类型面 **65 改 / 23 增 / 0 删**，运行时 JS **71 改 / 11 增 / 2 删**。
> **零改动集合（`.js` 与 `.d.ts` 双向字节级相同）**：`dsh-shell`、`dsh-settings`、`dsh-session-query`、`dsh-agent`、
> `dsh-client-connection`、`dsh-host-webserver`、`dsh-sandbox-policy`、`dsh-client-ui-slots`、`dsh-client-ui-renderer`、
> `dsh-client-ui-settings-plugins`、`dsh-pwsh-local`、`dsh-shell-env`、`dsh-subprocess`、`dsh-attachment{,-local}`、
> `dsh-cordis-host-runner/lib/index.js`（插件加载路径，仅 typert 元数据表变）、`dsh-client-ui-settings-plugins`——
> 即 **I9/I10/I13/I20/I27/I29/I30/I31/I32/I36/I37/I38/I39/I40 的出处包在本版未变动**，各条核验结论与探针锚点原样成立。
> **符号级复核**：`readAttachment` 4→4、`updateQueue` 72→72、`archiveSession` 175→175、`openSession` 31→31、
> `createDrafts`/`releaseDraftAttachments` 2→2、`setDraft` 33→33、`addAttachments` 4→4、`stopActivity` 32→32、
> `increaseTitle` 5→5、`atSeq` 27→27——**计数逐项相等（0 差异）**。**槽位契约**：`plugins.bundle.config` 在插件管理页
> 产物中出现 9→9，定义块（`kind:keyed` / `scope:root`）与渲染调用 `renderSlot("plugins.bundle.config", {view:"page"},
> {entryKey: pkg.name})` **逐行一致**；`settings.plugin.item` 两版均 0 命中（0.1.6-alpha.2 起移除，与 I12 一致）；
> client runner 守卫服务表中 `uiWorkspace`/`workspaces`/`slots`/`sessions`/`timer` 计数一致（插件 inject 的 5 个服务全在）。
> **唯一接口增量**：`dsh-api-session-controller` 的 `ISessions.fork` 新增**可选** `onCreated?: (childId) => void`
> （语义＝子会话已入目录后、可选标题递增重命名之前回调）+ typert 签名表同步；插件不传该参数，行为逐字不变。
> **消费面真改动全部落在插件不消费处**：`dsh-session`（`repair.ts` 抽出 `ToolCallRecovery` 类、`openTurnClosers` 改复用它，
> 对应官方「修复工具调度异常后对话无法继续」；`buildForkSeed` 的 `forked` cause 语义保留）、`dsh-client-ui-workspace`
> （标题语义 `displayTitle` → `session.title?.trim() ?? ""`、新增「未命名」文案，插件不读 `displayTitle`）、
> `dsh-client-ui-conversation`（`submit(mode, source?: 'click'|'enter')` + `InputEvent.submission` + `messageSubmitted`
> 回调与 `send_button_click` 埋点，新参数全可选；`setDraft`/`addAttachments`/`createDrafts`/`releaseDraftAttachments`
> 实现未动）、`dsh-client-ui-chat`（RunningStatus/RunningWhaleTail 组件与 shimmer 样式、文案；`contract/slots.d.ts` 未动）、
> `dsh-client-ui-plugin-manager`（client.js 约 6800 行 diff，全是刷新反馈 `PluginRefreshToast`/`refreshStatus`、安装输入清洗、
> 埋点；`slot-contract.d.ts` 未动）、`dsh-config-editor`（`configuration()` 的 inherited 改由组合层 `composeEntries` 计算，
> 对应「改善插件配置保存等待时间」；插件设置卡片走自有 `/api/recall` → `ctx.settings` 的 describe/update/replace，
> 而 `dsh-settings` 字节未变）、`dsh-agent-loop`（工具调度失败后改由 owning step 补保守结果）、`dsh-app-boot`
> （`OPTIONAL_BUNDLES` 增 `dsh-experimental-schedule-bundle`——**自动化任务改由可选 bundle 提供**）、
> `dsh-web-app` patch（移除 `schedule`/`time-context` 行、新增桌面端埋点行 disabled）、`dsh-base` patch（新增 `otel` 行
> 与遥测配置：collector 域名更换 + `maxRequestBytes`）。**依赖面**：三方 `sharp` 0.35.5 / `ws` 8.22.0 /
> `koffi` 3.3.1→**3.1.1**（降级，win32 ACL 原生绑定）/ `libreoffice-kit` 0.1.2 / 新增 `got` 14.6.6 等小幅变动，
> 均不在插件路径；`cordis` / `schemastery` 未变。**门禁**：`test:probe` **52/52**、`verify:host` 装配断言全过
> （inject=shell,sessions,agents、端点 12 项）、`npm test` **436/436**、`npm run typecheck` 通过、`check:dsh` 扩范围后
> 6 条 peer 全绿；`dsh --version` 实测 `0.2.0-rc.1`（CLI 可启动）。**活体冒烟（2026-09-29，真宿主 + 浏览器实弹，link 模式 / `D:\tmp\recall-h0`）
> 逐项通过**：插件经启动期兼容门禁激活（同 profile 的第三方 `dshmarket@1.65.1` 因 peer 只到 `^0.1.2-alpha.2` 被跳过，
> 反证该门禁真实生效）；`status`/`init` 正常；两条消息各出快照 → 改文件 → 撤回：面板文案与清单正确、文件回退、
> 安全快照 `snap-pre-rollback-1790612487546`、lineage `childId=session-478696aa… parentId=session-d278b62c…`、
> 子会话打开且仅含被撤回消息之前一轮、标题继承无递增、文本回填、无残留排队项、原会话归档；
> 设置页配置卡渲染完整且 `保存`/`恢复默认` 双向回读一致（I39 面读写双通）、快照管理树两级展开 + 版本家族聚族 +
> 叶子消息文本 + `立即 gc`（51 条 / 1.4 MB「gc 完成」）、「最近错误」无错误不渲染；dsh stderr 除门禁 skip 说明外
> 仅插件自身方言探针输出，零报错。详见 smoke-checklist-records.md 2026-09-29 节。**兼容声明**：peer 范围**必须新增 tuple**
> `|| >=0.2.0-rc.1 <0.2.1`（npm semver 的 prerelease 门槛要求「同 tuple 且带 prerelease 的比较器」，既有
> `>=0.1.7-alpha.1 <0.1.8` 单段放行不了 `0.2.0-rc.1`，不扩范围则启动期兼容门禁会整行跳过本 bundle）、
> `dshReleases` 补 `0.2.0-rc.1: compatible`。**观察项（非阻塞）**：① 官方 `repair` 重构后若 cut 落在未闭合轮次内，
> 合成 `tool/result` 的文案与 seq 分配已变——插件 `cutSeq` 恒取平衡前缀，不触发该分支；② `fork.onCreated` 可在子会话
> 入目录时立即拿到 childId（插件当前不需要）；③ 自动化任务默认关闭，用户如需须在插件管理页开启该 bundle；
> ④ 既有观察项延续：`dsh-tool-jobs` 唤醒上限、`sessionQuery.snapshotEvents`/`eventAt`/`ownEvents` 仍标 `@deprecated`。
> 评估实证见 upgrade-assessments/dsh-0.2.0-rc.1.md。
>
> **2.4.6 发版核验（2026-09-29）**：插件 **2.4.6 已发布**（npm `latest`＝2.4.6、GitHub Release `v2.4.6` 为 Latest、
> 非 draft/prerelease，tag `v2.4.6` 指向 `484bf99`）；发布提交 `484bf99`（chore(release) 2.4.6——0.2.0-rc.1 兼容声明
> （peer 新增 tuple）随版发布，含两份升级评估归档与冒烟执行记录）。**推送前 rebase 一次**：远端 `main` 上另有 `82b2344`
> （同作者、2026-09-24 经 Web 改 README 安装步骤：新增 desktop profile 安装行、删去「重启 DSH 进程」段），本地提交已
> rebase 其上，远端历史未被改写。发版前门禁：`typecheck`、`build`（`lib/` 零漂移，`lib/client.js` 120644 字节）、
> 单测 **436/436**、`test:probe` **52/52**、`verify:host` 装配断言全过（端点 12 项）、`check:dsh` 四层 `✔ 全部一致`。
> registry 直连 `/2.4.6` 与 `dist-tags.latest` 双确认（发布后约 2 分钟可见，初查仍解析到 2.4.5）；
> `dsh-recall-plugin@2.4.6` shasum `c6f1fecc…` 与发布输出一致。**发布产物核验**：`npm pack dsh-recall-plugin@2.4.6`
> （152022 字节 tarball）解包 23 文件——`assets/icon.svg`、15 个 lib 产物、`cordis.patch.yml`、双语 README、CHANGELOG、
> LICENSE 齐备；包内 `lib/client.js` 与工作区文件 **SHA256 相同**（`0A495F37…`，与 2.4.5 同值——本版无 client 源码改动）。
> **npm 模式实装验证（本版存在的理由闭环）**：profile 切回 npm 模式（`2.4.6` 精确 pin）+ `pnpm install`（pnpm 12 的
> 发布年龄策略把 2.4.6 写入 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`，属既有机制），实装
> `node_modules/dsh-recall-plugin` 为**普通目录（非 junction）**、版本 2.4.6、peer 含 `|| >=0.2.0-rc.1 <0.2.1`；
> 重启 `dsh web` 后 stderr **无本插件 skip 行**（仅 `dshmarket@1.65.1` 的既有 skip 说明）、出现插件自身
> `recall shell dialect probe: pwsh`，`/api/recall/status` → `{ok:true, errors:[]}`、`/api/recall/init` → root 与 config 正常
> ——即「npm 模式 + dsh 0.2.0-rc.1」下本插件不再被启动期兼容门禁跳过。
>
> **0.1.7-rc.2 核验（2026-09-24）——零破坏版本，无需改码**：**npm 已发布**（dist-tag `next` 指向本版，tag `dsh-v0.1.7-rc.2`，
> 2026-09-24 发布、rc.1 后 346 提交；`latest` 仍 0.1.5-rc.3、`alpha` 仍 0.1.7-alpha.2），`npm install -g @deepseek-ai/dsh@0.1.7-rc.2`
> 全局实装（0.1.7-rc.1 → 0.1.7-rc.2；cordis 4.0.4 / schemastery 3.18.4 与 vendor 栈内容均未变；包布局不变、junction 无需重建）。
> **核验方式为聚焦消费面的内容级 diff**（本轮升级前未留整包基线——npm 残留 `.dsh-EBhnoWNL` 实测为本版自身解包中转目录）：
> `npm pack` 下载 28 个包（全部 peer + 全部消费点所在包 + 官方 bundle `dsh-base`/`dsh-web-app`）的 rc.1 版本，与 rc.2 树做全文件
> SHA256 比对 + 契约/实现文件 `git diff --no-index` 逐行核对。**零改动集合（仅 package.json 版本号 + README.i18n.yaml）**：
> `dsh-shell`、`dsh-settings`、`dsh-sandbox-policy`、`dsh-host-webserver`、`dsh-pwsh-local`、`dsh-client-connection`、`dsh-client-modules`、
> `dsh-client-ui-renderer`、`dsh-client-ui-session`、`dsh-client-store`、`dsh-host-plugin-inventory`、`dsh-api-gateway`——即
> **I13/I27/I31/I32/I38/I39/I40 的出处包在本版未变动**。**契约与符号级复核**：`api-session-controller` 的 `lib/types/client/**`
> （fork/updateQueue/readAttachment/binding/archiveSession 客户端契约）**不在变更清单**；13 包 × 23 符号（`conversation.chat.node`、
> `renderMessageImages`、`loadImage`、`readAttachment`、`updateQueue`、`archivedSessionIds`、`unarchiveSession`、`stopActivity`、
> `createDrafts`、`releaseDraftAttachments`、`addAttachments`、`setDraft`、`plugins.bundle.config`、`settings.plugin.item`、
> `observeSession`、`volatile-update`、`archiveSession`、`openSession`、`fork`、`QueueAction`、`SessionQueryError`、`readSession`、
> `increaseTitle`）在新旧树**计数逐项相等（0 差异）**。**消费面真改动全部落在插件不消费处**：`api-session-controller`（模型目录/账号模型
> `initializeDefaultModel`/`hasProviderApiKey`、`selectModel` 默认保存异步化、`prompt` 改 `requireModel`）、`dsh-session`（纯新增
> `ToolHistoryProjection`/`Session.toolHistory()`）、`dsh-session-query`（`read()` 投影失败新抛 `SESSION_QUERY_CORRUPT_SESSION`）、
> `dsh-workspace` + `api-workspace-controller`（`initializeDefault(request)` → `initializeDefault(signal)`，默认标题取路径末段）、
> `ui-workspace`（快捷键系统含 fork/archive 快捷键与 `dismissForkError`、归档筛选三态；`archivedSessionIds` 派生与
> `openSession`/`unarchiveSession` 未变）、`ui-chat`（`shell.quota-notice` 链 + `developerMessageDefinition` → 新 node kind
> `developer-message`）、`ui-conversation`（停机快捷键、`ConversationBinding.openTurn`、`binding()` 新增 `@throws` 文档）、
> `ui-plugin-manager`（安装源识别）、`ui-primitives`（样式/图标/焦点环）、`app-boot`（`Profile.skippedBundles` +
> `reportSkippedBundles`：不兼容 bundle 的跳过报告由 stderr 打印改为 launcher 单次打印，**判定逻辑未变**）、
> `dsh-base`/`dsh-web-app` 的 patch（`llm-deepseek` 拆 api-key/account；新增 `schedule`/`time-context`/`shortcuts` 行，默认 disabled）。
> 依赖面：主包依赖 80→81，新增 `dsh-experimental-auto-review`，无删除。**门禁**：`test:probe` **52/52**、`verify:host` 装配断言全过
> （方言探针回归 `pwsh`）、`typecheck` 通过、`npm test` **436/436**；`check:dsh` 初跑两处文档漂移（reference/dsh-contract 仍记 rc.1），
> 本轮同步（reference 镜像按 `dsh-v0.1.7-rc.2` tag 重拉，13 源中仅 `09-architecture.md` 有实质差异：3 处替换、净 +55 字符，
> 含工具热更新增说明）。**兼容声明**：`dshReleases` 补 `0.1.7-rc.2: compatible`（peer 范围 `>=0.1.7-alpha.1 <0.1.8` 天然覆盖，
> 无新 tuple）。**观察项（非阻塞）**：① `session-query.read()` 新增显式抛错（I33 降级链保持 try/catch）；
> ② 新 node kind `developer-message` 不被插件 key `['user','steering']` 命中（行为不变）；③ 归档筛选三态不改 `archivedSessionIds`
> 语义（I37 判据继续有效）；④ `initializeDefault(signal)` 签名破坏性变更（插件零消费）；⑤ 升级操作陷阱：Windows 上 npm 替换全局
> bin shim 遇文件占用只留哈希名半成品（`.dsh.cmd-<hash>` 等），需手工改回标准名恢复 `dsh` 命令，且 npm 残留 `.dsh-EBhnoWNL`
> 为本版自身解包中转副本、非历史基线。评估实证见 upgrade-assessments/dsh-0.1.7-rc.2.md。
>
> **0.1.7-rc.1 核验（2026-09-24）——零破坏版本，无需改码**：**npm 已发布**（dist-tag `next` 指向本版，tag `dsh-v0.1.7-rc.1`，
> 2026-09-23 发布，0.1.7 系列首个候选版本、汇总自 v0.1.5-rc.3；`latest` 仍 0.1.5-rc.3、`alpha` 仍 0.1.7-alpha.2），
> `npm install -g @deepseek-ai/dsh@0.1.7-rc.1` 全局实装（0.1.7-alpha.2 → 0.1.7-rc.1；cordis / schemastery 等 vendor 栈版本与内容均未变，
> 包布局不变、子包数 276→276，junction 无需重建）。**核验方式为全树内容级 diff**：升级前对 alpha.2 整包做快照，
> 升级后 `git diff --no-index` 全文件比对——**915 条变更（853 改 / 49 增 / 9 删 / 4 重命名）、647 个非 package.json 文件有真实内容差异**，
> 其中 320 个是随包 LibreOffice 运行时负载、14 个是 dsh 主包 lib 产物与 README。**零改动集合（仅 package.json 版本号，内容字节级一致）**：
> `dsh-session`、`dsh-session-query`、`dsh-shell`、`dsh-pwsh-local`、`dsh-sandbox-policy`、`dsh-host-webserver`、`dsh-client-connection`、
> `dsh-client-modules`、`dsh-shell-env`、`dsh-agent`、`dsh-agent-loop`、`dsh-attachment`、`dsh-attachment-local`、`dsh-api-workspace-controller`、
> `dsh-client-ui-{slots,renderer,session,settings-plugins}`、`dsh-settings`、`dsh-config-editor`、`dsh-workspace`、`dsh-subprocess-local`、
> `dsh-tool-jobs`、`dsh-host-plugin-inventory`，以及整个 cordis vendor 栈——即
> **I9/I10/I11/I13/I14/I20/I28/I30/I31/I32/I34/I36/I38/I39 的出处包在本版未变动**，alpha.1/alpha.2 的核验结论与探针锚点原样成立。
> **消费面真改动只有四个包 + 一处文案**：`dsh-client-ui-chat`（15 文件：工具调用 preparing 阶段、聊天设置、本地图片预览；
> `lib/types/client/contract/slots.d.ts` **SHA256 相同**）、`dsh-client-ui-conversation`（9：`contract/records.d.ts` 把 `RunningToolCall`
> 拆为 `PreparingToolCall | StartedToolCall`、`contract/conversation.d.ts` 放宽 `ConversationStartMatch` 到 `SessionEventLike` 并改
> start/update 语义——`contract/slots.d.ts` **SHA256 相同**）、`dsh-api-session-controller`（8：assistant 流退休记账 `settleAssistant` +
> 工具流阶段类型；`contract/session.d.ts` **SHA256 相同**，host 侧 fork 实现 `lib/index.js` 不在变更清单）、
> `dsh-client-ui-plugin-manager`（7：host 侧安装/运行树/失败类型，客户端 slot 契约未变），以及 `dsh-client-ui-workspace` 一条中文文案
> （「子代理」→「子智能体」）。**契约与符号级复核**：`conversation.chat.node`(32)、`renderMessageImages`(19)、
> `readAttachment`/`updateQueue`/`binding`/`fork(`、`archiveSession`(34)/`unarchiveSession`(19)/`openSession`(4)/`stopActivity`(1)/
> `archivedSessionIds`(24)、`createDrafts`/`releaseDraftAttachments`/`addAttachments`/`setDraft`、`plugins.bundle.config`(4) 在新旧树**计数逐项相等**；
> 插件消费的 20 个 `--dsw-alias-*` 设计令牌全部存在。**本版唯一新增机制——启动期插件/runtime 兼容性门禁**：`dsh-app-boot` 新增
> `plugin-compatibility` / `profile-compatibility` / `compatibility-preflight` 三块，逐条取 `peerDependencies` 中名字为 `@deepseek-ai/dsh`
> 或 `@deepseek-ai/dsh-*` 的条目用 `semver.satisfies(runtime, range, { includePrerelease: true })` 判定；不兼容的行在启动期**整行禁用**
> （`disabled`，原生 Include 整棵拒绝），可经 profile 的 `compatibility.json`（精确 `包名@版本` → DSH 版本列表）或
> `dsh plugin allow-version --accept-risk` 豁免；安装命令在 pnpm 执行前预检（拒绝码 `incompatible-version`）。
> **本插件实测放行**：以官方自带 semver 7.8.5 实跑，6 条 peer 的复合区间对 `0.1.7-rc.1` 全部 `true` → 不需要豁免；
> 全树（新旧两树）均无 `dshReleases` 字面量，`dsh.compatibility.dshReleases` 仍是市场台账声明、非安装门禁（与 2.3.11 结论一致）。
> **门禁**：`test:probe` **49/49**、`verify:host` 装配断言全过（方言探针回归 `pwsh`）、`typecheck` 通过、`npm test` **430/430**、
> `npm run build` 产物零漂移；`check:dsh` 初跑仅两处文档漂移，本轮同步（reference 镜像按 `dsh-v0.1.7-rc.1` tag 重拉，13 源中仅
> 11 号对话节点文档有实质差异 +182 字符）。**兼容声明**：`dshReleases` 补 `0.1.7-rc.1: compatible`（peer 范围 `>=0.1.7-alpha.1 <0.1.8`
> 天然覆盖，无新 tuple）；README 双语徽章与兼容范围字段同步。**观察项（非阻塞）**：① 新门禁使 peer 区间从元数据变为**启动硬门槛**
> ——未开窗的新 minor 线会被直接禁用（显式优于静默失败），后续 0.1.8 线需先核验再开窗；② 本版新增「反向代理子路径部署」支持，
> 插件客户端用绝对路径 `/api/recall/*` 且 Host 端按 exact path 注册路由，不感知子路径前缀（普通部署不受影响，子路径场景未验证）；
> ③ 本版新增 SSH 远端工作区能力，影子仓库 / `--work-tree` 假定工作区在本机文件系统，远端场景未验证；④ 既有观察项延续
> （`dsh-tool-jobs` 的 `maxConsecutiveWakes` 无默认值 × P0-1 `agentBusy` 守卫窗口；`snapshotEvents`/`eventAt`/`ownEvents` 仍 deprecated）；
> ⑤ 可选增强：本版支持插件用 locale 声明多语言标题/描述与 package.json 图标供管理页展示（本包当前仅中文 description）。
> 评估实证见 upgrade-assessments/dsh-0.1.7-rc.1.md。
> **2.4.5 发版核验（2026-09-24）**：插件 **2.4.5 已发布**（npm `latest`＝2.4.5、GitHub Release `v2.4.5`、tag `v2.4.5` 指向
> `b0e54b0`）。发布提交链：`b0e54b0`（chore(release) 2.4.5——设置页 UI 重做、插件管理页图标与快照管理交互改进，随版含
> README/AGENTS/截图刷新）、`50b4812`（chore(release)：同步 package-lock 根版本到 2.4.5）。发版前门禁：`build`（`lib/client.js`
> esbuild 直出 120644 字节 / 工作区 CRLF 形态 132609 字节）、`typecheck`、单测 **436/436**、`test:probe` **52/52**、
> `verify:host` 装配断言全过（端点 12 项）、`check:dsh` 四层一致。registry 直连 `/2.4.5` 与 `dist-tags.latest` 双确认
> （发布后约 4 分钟可见，初查 `/2.4.5` 为 404）；GitHub Release 为 Latest、非 draft/prerelease。**发布产物核验**：
> `npm pack dsh-recall-plugin@2.4.5`（149703 字节 tarball）解包 23 文件——`assets/icon.svg` 在包内（图标功能的发布前提）、
> 15 个 lib 产物 + `cordis.patch.yml` + 双语 README + CHANGELOG + LICENSE 齐备；包内 `lib/client.js` 与工作区文件
> **SHA256 相同**（`0A495F37…`），即 registry 上的内容与本地构建逐字节一致。**本机 profile 说明**：web profile 当前为
> **link 模式**（`link:D:/workspace/dsh-plugin/dsh-recall-plugin`），本机 DSH 直接加载工作区产物，故本轮以「发布 tarball ↔
> 工作区产物哈希一致」替代 2.4.4 的 npm 模式实装验证（未改用户 profile；如需严格复刻，切 npm 模式后
> `pnpm update dsh-recall-plugin@2.4.5` 即可）。
>
> **2.4.4 发版核验（2026-09-24）**：插件 **2.4.4 已发布**（npm `latest`＝2.4.4、GitHub Release `v2.4.4`、tag `v2.4.4` 指向
> `64aeb3f`）。发布提交链：`dc3dad4`（fix(client)：端点路径按文档基址解析，I40）、`f72a8ce`（docs(compat)：rc.1 评估归档 +
> 版本声明同步）、`64aeb3f`（chore(release) 2.4.4，含 lockfile 根版本同步）。发版前门禁：`build`（`lib/client.js` 112112 字节）、
> `typecheck`、单测 **435/435**、`check:upgrade` 三层全绿（探针 **52/52**）。registry 直连 `/2.4.4` 与 `dist-tags.latest` 双确认
> （传播约 1 分钟）；GitHub Release 为 Latest、非 draft/prerelease。**本机 profile 验证**：web profile（npm 模式）经
> `pnpm update dsh-recall-plugin@2.4.4` 实装 2.4.4（依赖声明随之变 `^2.4.4`；pnpm 12 的 `minimumReleaseAge` 对新发布版本须
> 显式带版本号，pnpm 已自动写入 `minimumReleaseAgeExclude`），实装产物核验含 I40 修复（`lib/client.js` 的
> `document.baseURI` 解析在位，仅余两条回落兜底字面量）。
>
> **0.1.7-alpha.2 核验（2026-09-23）——零破坏版本，无需改码**：**npm 已发布**（dist-tag `alpha` 指向本版，tag commit `0010283`），
> `npm install -g @deepseek-ai/dsh@alpha` 全局实装（0.1.7-alpha.1 → alpha.2；cordis 4.0.3→4.0.4、schemastery 3.18.3→3.18.4；
> 包布局不变，junction 无需重建）。**核验方式为全树内容级 diff**：以 npm 残留的 alpha.1 整包副本为基线做 SHA256 全文件比对——
> 277 包版本号变化、**342 个非 package.json 文件真实改动**，插件消费面再逐包下钻到签名级。**零改动集合（字节级一致，仅 package.json）**：
> `dsh-session`、`dsh-session-query`、`dsh-shell`、`dsh-pwsh-local`、`dsh-sandbox-policy`、`dsh-host-webserver`、`dsh-client-connection`、
> `dsh-shell-env`、`dsh-agent`、`dsh-agent-loop`、`dsh-attachment`、`dsh-attachment-local`、`dsh-api-workspace-controller`、
> `dsh-client-ui-{slots,renderer,session}`，以及整个 cordis vendor 栈（cordis / plugin-loader / include / timer / group / cosmokit /
> schemastery）——即 **I9/I10/I13/I20/I28/I29/I30/I31/I32/I36/I38/I39 的出处包在本版未变**，alpha.1 的核验结论与探针锚点原样成立。
> **消费面逐字/字节核验**：`updateQueue` / `readAttachment` / `QueueAction`（含 `{kind:'remove'}`）签名行逐字一致（G1、I34 不受影响）；
> `ui-chat` 与 `ui-conversation` 的 slot 契约（`conversation.chat.node`、`ConversationNode` 全集、`records`）**字节未变**（I1/I2/I4/I5）；
> `__ModuleLoader__.load({id, factory})` 形态逐字在位（I13，仅新增 `importError(id)` 诊断）；`plugins.bundle.config` 仍在（I12）；
> fork 实现与三条切点锚点未动（I6/I33/I35）。**改动面全部落在插件不消费处**：`dsh-api-session-controller` 仅历史分页
> （新增 `turnWindow`、`paginate` Turn 对齐）与客户端本地回声 / Inbox claim watermark 记账；`dsh-client-ui-chat` 为滚动跟随钩子
> （`use-scroll-follow`/`use-process-scroll`）；`dsh-client-ui-conversation` 为排队消息重编辑保留换行（`updateQueue` 契约无关）；
> `dsh-subprocess-local` 仅新增 spill 失败日志管道；`dsh-tool-pwsh-persistent` 的持久命令等待修复与插件路径无关
> （插件走 `dsh-shell` → `dsh-pwsh-local` 或直连通道，两者字节未变）。**门禁**：`test:probe` **46/46**、`verify:host` 装配断言全过
> （方言探针回归 `pwsh`）、`typecheck` 通过、`npm test` **430/430**；`check:dsh` 初跑仅两处文档漂移，本轮同步
> （reference 镜像按 `dsh-v0.1.7-alpha.2` tag 重拉，13 文件**零差异**，仅头部归档字段更新）。**兼容声明**：`dshReleases` 补
> `0.1.7-alpha.2: compatible`（peer 范围 `>=0.1.7-alpha.1 <0.1.8` 天然覆盖，无新 tuple）。**观察项（非阻塞）**：
> ① `dsh-tool-jobs` 的 `maxConsecutiveWakes` 由 `default(3)` 改为**无默认（不限）**，唤醒走 `owner.status === 'idle' && owner.followup(message)`，
> 而 P0-1 `agentBusy` 只认 `status === 'running'`——链式后台命令/一次性子代理完成场景下「守卫见 idle、下一拍被唤醒开新轮」的窗口概率上升
> （官方无「待唤醒」状态可读，本轮不改码，留实弹观察：先起后台任务再撤回，看原会话是否被唤醒继续跑）；
> ② I12 探针（`settings.plugin.item`）自 0.1.6 线起为**静默 skip**（`ui-settings-plugins` 不再发布该 slot 契约，alpha.1 亦然），
> 建议退休或改锚 `plugins.*` 侧，避免「死探针绿灯」。评估实证见 upgrade-assessments/dsh-0.1.7-alpha.2.md。
> **发版核验（2026-09-23）**：插件 **2.4.2 已发布**（npm `latest`＝2.4.2、GitHub Release `v2.4.2`、tag commit `e1f494c`；
> registry 直连 `/latest` 与 `/2.4.2` 双确认，初查有约 1 分钟传播延迟，与 2.4.1 一致）。发布提交：`de007d7`（docs/compat——
> 评估归档 + `dshReleases`/镜像/契约文档/README 徽章同步）与 `e1f494c`（chore(release) 2.4.2，含 lockfile 根版本同步）。
> 发版前门禁：`npm run build` 产物零漂移（`lib/` 无变更）、`typecheck` 通过、`npm test` 430/430、`check:upgrade` 三层全绿。
> **本机 profile 验证**：web profile（npm 模式，依赖 `^2.4.1`）经 `pnpm update dsh-recall-plugin@2.4.2` 实装 2.4.2。
> 注意（pnpm 12 的 `minimumReleaseAge` 策略）：刚发布的版本用不带版本号的 `pnpm update <pkg>` 会被跳过并提示
> `Already up to date`（旧版仍在允许年龄内），需**显式带版本号**更新；pnpm 会把该版本写入 profile 的
> `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`（默认自动豁免，`minimumReleaseAgeStrict` 才改为提示）。
> **观察项结项（2026-09-23 同日）**：① 唤醒窗口根因查明并修复——官方归档对「有活动在跑」的会话默认拒
> （`workspace/session-activity` 命中即 `workspace/session-active`），插件旧写法不传 `stopActivity` 又把
> reject 吞掉，于是「有后台作业在跑时撤回」原会话静默不归档、作业续跑，而作业结算 `cause: 'kill'` 不属
> 被抑制的 `teardown`，完成通知会把已回滚的原会话唤醒开新一轮；现改传 `{ stopActivity: true }` 并让失败
> 留痕（详见 I7；`src/client/recall-node.ts` + `src/types/client-contract.ts`）。② 死探针已处置：I12 改为
> 双代面探针 + 一条 fail-loud「两代面至少一条在位」断言（新面 `plugins.bundle.config` 首次纳入断言），
> 探针 46 → 49；I7 另补客户端 `stopActivity` 选项锚点。
> **2.4.3 发版核验（2026-09-23）**：插件 **2.4.3 已发布**（npm `latest`＝2.4.3、GitHub Release `v2.4.3`、
> tag commit `1478ca0`）。发布提交链：`6c723c2`（I7 归档改 `stopActivity` + 失败留痕、I12 探针改造）、
> `1759fbe`（I7 实弹验证记录）、`1478ca0`（chore(release) 2.4.3，含 lockfile 根版本同步）。发版前门禁：
> `build` 产物零漂移、`typecheck` 通过、`npm test` 430/430、`check:upgrade` 三层全绿（probe **49/49**）。
> registry 直连 `/2.4.3` 与 `/latest` 双确认（传播约 2 分钟，略慢于 2.4.2 的约 1 分钟）。
>
> **0.1.7-alpha.1 核验与适配（2026-09-22）——破坏性版本，两处接缝已双分支适配**：**npm 已发布**（dist-tag `alpha` 指向本版，
> tag commit `c36a83f`；`latest` 已推进到 0.1.5-rc.2、`next` 为 0.1.5-rc.3），`npm install -g @deepseek-ai/dsh@alpha`
> 全局实装。**包布局变化**：官方包从全局扁平位收进 `dsh/node_modules/@deepseek-ai/*`；插件工作区 junction 已随之指向
> 新路径，`@deepseek-ai/{schemastery,dsh-settings}` 实测解析正常（I11 无破坏）。**适配前**三层门禁：`test:probe` **35/39（4 红）**、
> `verify:host` 装配断言通过（唯一警告＝方言探针降级）、`typecheck` + `npm test` 391/391 通过（插件自身逻辑零回归）。
> **两处硬破坏**：
> ① **shell 接缝换代**——`ShellExecutor` 删除 `run`/`start` 抽象方法，只剩 `resolve` + `execute(spec): Promise<ShellExecution>`
> （`ShellExecution.result(): Promise<ShellRunResult>`），官方消费方统一 `(await ctx.shell.execute(spec)).result()`，全树 grep `shell.run` 零调用
> （I36 探针红即此）。插件 `src/host/store.ts` 的 `runShellMeta` 与方言探针两处命中：**POSIX 上必经官方通道 → `shell.run is not a function` → 建仓/快照/回退/gc 全失效**；
> **win32 上探针抛错被 catch 折成 null → 误判 bash → 走自建 spawn 直连通道侥幸可用**（代价是失去官方通道语义 + 误导性启动日志）。
> ② **settings 接缝换代**——`dsh-settings` 导出面只剩 `SettingsForms`（`configure`/`describe`/`update`/`replace`/`mutate`/`writable`），
> `installSection`/`installSettingsSection` **全树零命中**（I30 由「在位」改判「0.1.7 起移除」）；寻址键变成 **profile entry id**
> （`configEditor.entries().find(row => row.options.id === ns)`，未知 ns 抛 `No configurable plugin entry`），且**只有 schema 标
> `.volatile()` 的字段**才被 `describe()` 收录、被 `update/replace` 写入（无 volatile 字段→写入抛 `has no volatile fields`、entry 被跳过）。
> 插件三分支 settings 接线在 0.1.7 上**静默 no-op**（无异常无日志）→ namespace 不注册、热更失效；`config-get` 恒找不到 `ns='dsh-recall'`
> → 覆盖字段恒空；`config-set`/`config-reset` 必抛 → **设置页配置卡片在 0.1.7 上只读且保存必失败**。`verify:host` 的自带 settings 桩
> 同时提供 `installSection`，故本门禁掩盖了该换代（需补探针）。**一处锚点更新**：fork 实现重写（源改走
> `sessionQuery.observeSession`、`boundary = atSeq ?? latestCompletedPrefixBoundary()`、校验 `events[boundary].seq === boundary`
> 否则 `session/fork-unavailable`、`buildForkSeed` = 前缀 + `session/end-seed` + 开放轮合成 closer、`inheritedEventCount = boundary + 1`），
> 3 条切点探针红；**语义上插件用法等价**——`atSeq` 由「吸附到 ≥atSeq 的首条 turn/end」改为「包含式真实事件 seq」，插件传的本就是
> 目标消息前最近一次 `turn/end` 的 seq，两种语义结果一致（I35 根治保持）。**零交集/在位项**：事件集 54→**59**（新增
> `deliverables/presented`、`developer/message`、`image/offload`、`subagent/catalog`、`workspace/changes`；插件只扫 `user/message`+`turn/end`，
> Session V4 迁移保留原始 message id）；`UserMessage.id`/`content` 与 `ImageBlock`/`FileBlock` 的 `attachment.attachmentId` 不变
> （release notes「仅存于自定义事件的附件不再自动读取/导出」针对插件自定义事件，本插件不写会话事件 → I34 附件链零影响，
> `readAttachment`→`{attachment,data}`、`createDrafts`/`releaseDraftAttachments`/`input.shell().actions.{setDraft,addAttachments}`、`updateQueue` 全在位）；
> `DshBundleManifest.patch: string | string[]`（单文件 patch 写法保留）；`plugins.bundle.config` 仍在；`ISessions.fork` 签名逐字不变、
> `ISessions.open` 仍缺席、`uiWorkspace.openSession` 与归档集合判据（I37）探针绿；`snapshotEvents(fromSeq?, toSeqExclusive?)`/`eventAt`/`ownEvents` 在位
> （后两者仍 `@deprecated`）；`readBytes` 迁移与插件零交集（插件文件读写全走自建 shell 模板）。**适配落地（同批次，两次独立提交可分别 revert）**：
> shell 接缝双分支（`runViaExecutor` 按运行时方法分流 + `exitCode === null` 分级，见 **I38**）与 settings 双分支（`SettingsForms` 按 profile entry id 寻址 +
> `Config` 标 volatile + ref 解包热更，见 **I39**）；探针按新实现重钉、verify-host 桩补「只给新面」的第二 pass、台账补 I38/I39。**门禁复核**：
> `typecheck` 通过、`npm test` 425/425、`test:probe` 46/46、`verify:host` 两个 pass 全过；实机在装 0.1.7-alpha.1 上验证——方言探针回归 `pwsh`、
> `describe()` 已返回本插件 entry（`ns=recall`、`applies: live`、writable）、`settings.update('recall', …)` 生效且 `replace(ns, {})` 复位干净
> （旧硬编码 `dsh-recall` 实测抛 `No configurable plugin entry`，正是本轮修复点）。**版本策略已同步**：6 个 `dsh-*` peer 各补 `>=0.1.7-alpha.1 <0.1.8` 段、
> `dshReleases` 补 `0.1.7-alpha.1: compatible`、`reference/` 镜像按 tag 重拉（13 源中 4 份有差异：05/09/11/12，均非破坏性；其中重写版 12 给出的官方写法
> ——`z.string().volatile()` + `ctx.on('loader/volatile-update', …)` 读 `config.x.get()`——与本轮实现同构）。**待人工**：双平台实弹冒烟
> （POSIX 撤回全链、旧版 0.1.6-alpha.2 回归降级）与 `docs/plans/completed/plan-dsh-0.1.7-adapt.md` 的 M5 六项对照点（2026-09-23 实弹全过；M5-5 降级回归另实锤并修复一处旧面注册回归）。评估实证见
> upgrade-assessments/dsh-0.1.7-alpha.1.md。**发版核验（2026-09-23）**：插件 **2.4.1 已发布**（npm `latest`＝2.4.1，
> GitHub Release `v2.4.1`，tag commit `4761999`）；发布前终审补 P1——settings 接线拆出 `src/host/settings-bridge.ts`
> 并加 5 例 CI 回归钉（c3cc8a7 旧面解包回归的唯一自动化防线，`32d7c82`）。发布后 `check:upgrade` 三层全绿
> （check:dsh 四层一致 / probe 46/46 / verify:host 双 pass），单测 430/430。遗留记账：M5-6② 附件回填待图片模型
> 环境补验（官方 API 面已核验、代码未动）；预热 IIFE 加固已实施并归档（`docs/plans/completed/plan-warmup-unhandled-rejection.md`，2026-09-30 随质量加固批次实弹复现 fatal 后修复）。
>
> **0.1.6-alpha.2 核验（2026-09-18）**：**npm 已发布**（dist-tag `alpha` 指向本版，tag commit `ddefc45`；`latest`
> 仍 0.1.5-rc.1、`next` 仍 0.1.5-rc.2），`npm install -g @deepseek-ai/dsh@alpha` 全局实装（dsh-settings 随装
> 0.1.6-alpha.2、schemastery 仍 3.18.2；junction 存活无需重建）。三层门禁：`test:probe` 37/37 + `verify:host`
> 装配断言通过；`check:dsh` 报镜像/契约版本漂移，本次同步（reference/ 按 alpha.2 tag 重拉，仅 06/09 两文件
> 实质差异且均非契约面）。tag 对比 887 commits / 300+ 文件（compare 截断不可用，沿 tree-SHA 逐包下钻法），
> 消费面包源码级结论：**I12 失效**——旧设置页插件 tab 整体移除，`settings.plugin.item`/`settings.plugins.tab`
> 产物归零，ui-plugin-manager 新增 `plugins.item`/`plugins.bundle.config`/`plugins.row.config`，插件设置卡片
> 迁挂 `plugins.bundle.config`（key=`dsh-recall-plugin`；renderer 对未声明 key 的 inject 是 `specDynamic===void 0`
> 直接 return 的静默 no-op，故旧键保留双版本兼容、无需探测，I12 已更新）；**session-controller client 面大改**
> （release notes「Client Sessions 支持多实例共存」）：新增 `retain`/`using`/`retainInfo`/`SessionReference`
> 引用模型、`queue-mirror.ts` 删除，`binding()` 收窄为「只借已 retain 的会话」——fork 签名逐字不变
> （I6），本机产物实证 `cut = SessionLogOffset(boundary.seq + 1)`（I35 根治保持）；附件链（I34）全链
> typeof 降级兜底，源会话未 retain 时仅附件不重建；ui-chat `slots.ts` 唯一变化是 `conversation.chat.turnTail`
> chain→list + 新增 `openExternalLink`（插件零消费），`chat.node` 契约（I2/I4/I5）与
> `ChatNodeOwnerProps.renderMessageImages/loadImage` 并存不变；connection `fetch.register` 契约不变（仅新增
> `streamBaseUrl?` 可选字段，I32 路线不受影响）；`SettingsProvider.installSection` 在位（I30）；probe 37/37
> 钉 API 字段面。**兼容声明**：peer 范围 `>=0.1.6-alpha.1 <0.1.7` 天然覆盖 alpha.2 无需扩展。其余 release
> notes 变化（插件管理页/文件改动卡片/Office 预览/Inbox 重启恢复/终端权限/运行时解析+运行时卸载）与插件
> 消费面零交集或由既有清理机制兜底（HMR 卸载语义未变）。
>
> **0.1.6-alpha.2 实弹补充（2026-09-18）**：`ISessions` 同时移除 `open`（契约注释「navigation belongs to
> view owners」），会话导航迁至独立 `uiWorkspace` 服务的 `openSession(target: SessionTarget)`
> （`SessionTarget = SessionId | SubagentAddress`，官方 UI 亦以裸 sessionId 调用）；`ctx.workspaces`
> （IWorkspaces）只有归档能力、无导航 → fork 后打开子会话需改走 uiWorkspace（**第二处改码**，I37）。该服务
> 揭示的第二件事：`sessions.list.byId` 在 alpha.2 **包含归档会话**，插件「切换」按钮赖以排除归档会话的闸门
> 失效——归档集合改从 `workspaces` 快照读（**第三处改码**，I37）。实弹冒烟通过
> （[记录](plans/completed/smoke-checklist-records.md)）：插件管理页
> bundle 配置卡渲染与配置读写、撤回主链路 + fork 子会话打开 + 标题继承 + 回填、快照管理树/两级实删（Host
> tag 与索引对账）/立即 gc/切换两向（归档行不渲染、活跃行正常打开）。结论：三处改码，实弹全覆盖。
>
> **0.1.6-alpha.1 旧版回退实弹（2026-09-18）**：本批次三处改码都在跨版本面上（静态 `uiWorkspace`
> inject、`plugins.bundle.config` 注册、读 `workspaces` 归档集合），故把全局 dsh 降到 0.1.6-alpha.1 实弹一轮，
> 确认未升级 dsh 的用户更新插件后不变砖。三项全过（[记录](plans/completed/smoke-checklist-records.md)）：
> 旧 slot（`settings.plugin.item`，key `dsh-recall`）卡片照常渲染且样式注入正常，`plugins.bundle.config` 在旧
> 渲染器上是静默 no-op、零报错；撤回 fork 后子会话由 `uiWorkspace.openSession` 正常打开（归属实证：切过去后
> 再发消息，新快照记到子会话 id）；快照管理树按 lineage 聚族（`v1/2` 与 `v2/2`）正常。静态面同时核实：
> alpha.1 的 `ISessions.open` 与 `UiWorkspace.openSession` 并存（I37 双分支两条路都通）、
> `WorkspaceSnapshot.archivedSessionIds` 已存在（闸门判据同样生效）、alpha.1 的 `dsh-web-app` 依赖并挂载
> `dsh-client-ui-workspace`（静态 inject 不会令 fiber 长期 pending）。降级固有现象（非缺陷）：alpha.2 写入的
> `workspace/changes` 事件对 alpha.1 harness 未知且未标 ignorable，旧会话日志不可读。
>
> **0.1.6-alpha.1 核验（2026-09-15）**：**npm 已发布**（dist-tag `alpha` 指向本版；`latest` 仍为 0.1.5-rc.1、
> `next` 仍为 0.1.5-rc.2；0.1.6 线首个预发布），`npm install -g @deepseek-ai/dsh@alpha` 全局实装。
> 三层门禁：`verify:host` 装配断言通过 + `npm test` 330/330 + `test:probe` 32 例中 1 红——红点即本版
> 唯一行为级变化：`sessions.fork` 切点由「cut 从 boundary+1 向后推进到下一 turn/start 前」改为
> 「cut 固定 boundary.seq+1、精确切到选中轮次结束」（实装产物 `dsh-api-session-controller/lib/index.js`
> 确认，`.agents/notes/implemented/bug-fix/2026-09-11-session-controller-fork-turn-cut` 记载），结束事件
> 之后的排队输入、标题、模型设置均不入 seed——**I35 残留排队消息被官方根治**，探针按 2.3.20 预留的
> 好消息路径改钉新锚点后 32/32 复绿。其余消费面零破坏：`snapshotEvents`/`eventAt`/`ownEvents` 仅标
> `@deprecated` 未移除（内存跳行为不变，列为前瞻观察项）；`ShellExecutor.start` 异步化不涉及插件
> （插件只用 `resolve`+`run`）；`agent/session-start`→`agent/created` 事件改名与插件无关（不订阅、
> agents 面仅 `list`/`get`/`status`）；回填链 `createDrafts`/`addAttachments`/`releaseDraftAttachments`
> 与 chat.node/settings slot 全部在位。**G1 清理不退役**：peer 范围保留 0.1.5 线段，该线 fork 切点
> 未修复、清理仍必要；0.1.6 线上退化为 `queue-item-not-found` 吞掉的无害空操作。tag 对比（800 commits /
> 300 文件）按消费面包过滤后唯一源码命中即 fork 实现；reference/ 镜像按 alpha.1 tag 重拉 13 源：10 份
> 内容相同、05/09/13 三文件有实质差异（09 不变式措辞补「纯消息投影」、新增 `agent/created`、桌面 profile
> 重写；13 钩子行改名；均不触及插件消费的槽位/契约），已覆盖同步。**兼容声明同步**：peer 开 0.1.6 新
> minor 线段（`>=0.1.6-alpha.1 <0.1.7`）、`dshReleases` 补 `0.1.6-alpha.1: compatible`、reference/README
> 与 dsh-contract.md 版本字段同步。评估实证见 upgrade-assessments/dsh-0.1.6-alpha.1.md。
>
> **0.1.5-rc.2 核验（2026-09-11）**：**npm 已发布**（dist-tag `next` 指向 0.1.5-rc.2、`latest` 仍为 rc.1，
> `dsh-v0.1.5-rc.2` tag commit `fb2c4b9`，2026-09-10 发布），全局实装，桌面端 DSH Desktop 0.1.5-rc.2 同源。
> 三层门禁：`test:probe` 31/31 + `verify:host` 装配断言通过 + `npm test` 307/307；`check:dsh` 报镜像/契约漂移，
> 本次同步处理，8 个 peer 在 rc.2 全部在范围内。**消费面零类型 diff**：rc.1→rc.2 tag 对比（4 commits / 300 文件）
> 按消费面包 + 类型源过滤后唯一命中 `packages/client/ui-chat/src/client/chat/TurnTailNodeView.module.css`（+3 行
> 纯 CSS 间距）；`sessions.d.ts`、`slots.d.ts`、`slot-contract.d.ts` 等类型源全部未动。reference/ 镜像按 rc.2 tag
> 重拉：13 源中 12 份内容相同、11 号仅 CRLF 噪声（逐行相同）。**兼容声明同步**：`dshReleases` 矩阵补
> `0.1.5-rc.2: compatible`；peer 范围沿用按 minor 线开窗（`>=0.1.5-alpha.1 <0.1.6`）天然放行同 tuple 的 rc.2，
> 无需改 peer 串；reference/README 与 dsh-contract.md 版本字段同步至 0.1.5-rc.2。评估实证见
> upgrade-assessments/dsh-0.1.5-rc.2.md。结论：接口层面零破坏、行为层面无回归，无需改码；本版发布（2.3.12）
> 同时修复 DSH Desktop 安装校验对历史包 peer 的解析失败（见 CHANGELOG 2.3.12）。**2.3.14 追加**：0.1.5-rc.2
> 实弹暴露 `sessionQuery.readSession` 对 seeded 会话（撤回 fork 出的子会话）恒抛——子会话内撤回预览对全部
> 消息误报「该消息是本会话中第一条用户消息」（I33）；修复＝降级 `observeSession` 读取全量逻辑日志，
> 真机 API（dsh web + `/api/recall/preview`）复验通过。
>
> **0.1.5-rc.1 核验（2026-09-10）**：**npm 已发布**（dist-tag `latest` 与 `next` 指向 0.1.5-rc.1，
> `dsh-v0.1.5-rc.1` tag commit `183f08e`，2026-09-10 发布；0.1.5 系列首个候选版本，汇总自 v0.1.2-rc.1
> 以来的变更），`npm install -g @deepseek-ai/dsh@0.1.5-rc.1` 全局实装。三层门禁：`test:probe` 31/31 +
> `verify:host` 装配断言通过；`check:dsh` 报镜像/契约漂移与 peer 越界，本次同步处理。**依赖面源码零 diff**：
> tree-SHA 比对 alpha.2↔rc.1，插件消费的包（`dsh-session`、`dsh-client-ui-chat`、`dsh-client-ui-conversation`、
> `dsh-api-session-controller`、`dsh-client-ui-settings-plugins`、`dsh-settings`、`dsh-shell`、`dsh-session-query`、
> `dsh-host-webserver`、`dsh-sandbox-policy`、`cordis`、`schemastery`）目录树哈希**全部逐字节相同**——rc.1 相对
> alpha.2 是纯发布层推进（版本号 + 依赖 pin），无契约变化。reference/ 镜像按 rc.1 tag 重拉，13 源与 alpha.2
> 归档**内容零差异**（仅 11 号文件换行符 CRLF/LF 噪声，`--ignore-cr-at-eol` 比对为空）。release notes 中三项
> 开发者相关 API 调整（移除 `ctx.agent` 单数、`Inbox` 改 type-only、Web 面板 `conversation`→`main.conversation`）
> 均已在 alpha.1/alpha.2 逐项排除（见对应核验段），rc.1 无新增契约点。**兼容声明同步扩展**：package.json
> `dshReleases` 矩阵补 `0.1.5-rc.1: compatible`、7 个 peerDependencies 各补 `>=0.1.5-rc.1 <=0.1.5-rc.1` tuple；
> reference/README「归档 dsh 版本」与 dsh-contract.md「对应版本」同步至 0.1.5-rc.1。评估实证见
> upgrade-assessments/dsh-0.1.5-rc.1.md。结论：接口层面零破坏、行为层面无回归，无需改码；alpha.1 遗留观察项
> （旧 V2 会话撤回切割实弹、带文件附件消息重绘、本地 POSIX 路径图片重绘）仍待人工冒烟。
>
> **0.1.5-alpha.2 核验（2026-09-10）**：**npm 已发布**（dist-tag `alpha` 指向 0.1.5-alpha.2，
> `dsh-v0.1.5-alpha.2` tag commit `b2e3b2a`，2026-09-09 发布），`npm install -g @deepseek-ai/dsh@0.1.5-alpha.2`
> 全局实装。`npm run check:upgrade` 三层门禁：`test:probe` 31/31 + `verify:host` 装配断言通过；`check:dsh`
> 报镜像/契约漂移与 peer 越界，本次同步处理。**依赖面源码零 diff**：tree-SHA 比对 alpha.1↔alpha.2，插件消费的
> 类型源（`dsh-session/lib/types/types.d.ts`、`dsh-client-ui-chat`/`dsh-client-ui-conversation` 的 `slots.d.ts`、
> `dsh-api-session-controller` 的 `sessions.d.ts`、`dsh-client-ui-settings-plugins` 的 `slot-contract.d.ts`）
> 全部未变；reference/ 镜像 13 源中仅 `09-architecture.md` 一行措辞变化（agentTeams「私有」→「公开发布」，
> 与插件零交集），其余 12 源 SHA 未动。**本次唯一需深挖项：release notes「Web 插件面板 API 调整——原 `conversation`
> Slot 迁移为 `main` 的 `conversation` key」**——实证：顶层布局槽位确已改名（`ConversationSlotProps =
> PropsRuntime<'main.conversation'>`），但插件从不注册顶层 `conversation` slot，只用 `conversation.chat.node`
> （keyed/session，路径不变）与 `settings.plugin.item`（不变）；`ctx.get('conversation')`（refillDraft 回填）
> 是**服务**访问（`InputHub`，`ctx.conversation.input`）非 slot，与被改名的槽位是两回事，不受影响。其余变更
> （Sidebar 文档预览、模型交付文件、`/feedback` 明细、pi-ai 配置、Base URL 校验、文件夹选择器、Composer 占位、
> 子代理工具指导、MCP 分页、`fs-ext` 编译修复、minimal 默认工具、设置本地化）均与撤回链路零交集。**兼容声明同步扩展**：
> package.json `dshReleases` 矩阵补 `0.1.5-alpha.2: compatible`、7 个 peerDependencies 各补 `>=0.1.5-alpha.2
> <=0.1.5-alpha.2` tuple；reference/README「归档 dsh 版本」与 dsh-contract.md「对应版本」同步至 0.1.5-alpha.2。
> 评估实证见 upgrade-assessments/dsh-0.1.5-alpha.2.md。结论：接口层面零破坏、行为层面无回归，无需改码；
> alpha.1 遗留观察项（旧 V2 会话撤回切割实弹、带文件附件消息重绘、本地 POSIX 路径图片重绘）仍待人工冒烟。
>
> **0.1.5-alpha.1 核验（2026-09-09）**：**npm 已发布**（dist-tag `alpha` 指向 0.1.5-alpha.1，
> `dsh-v0.1.5-alpha.1` tag commit `5dda764`，2026-09-09 发布），`npm install -g @deepseek-ai/dsh@0.1.5-alpha.1`
> 全局实装，reference/ 镜像重拉归档（13 文件映射表未变；05/09/13 有官方文字修订——09 新增桌面应用节 +
> 系统提示词改经 `system/message` 历史传递的 agent-loop 语义细化，非 API 契约变化），`test:probe` 31/31 +
> `verify:host` 装配断言通过（check:dsh 报镜像/契约漂移与 peer 越界，本次同步处理）。重查关键产物证据链：
> I1/I29 guard.d.ts shadowing priority 分配不变；I2 renderMessageImages 与 loadImage 并存不变；I4 node.id/key
> 语义不变；I6 fork 签名逐字一致（`sessions.d.ts`）；I7 archiveSession 路由仍在；I28 SessionHeader 仍无 title；
> I30 installSection 未回归。**本次核心变更：Session format V3**（一进两改：新增 `system/message`、
> `tool/code-dispatch*` 更名 `tool/ptc-dispatch*`、新增 `feedback/message-put`/`message-delete`，全集 51→54 种）——
> V2→V3 迁移插入 system 事件并 remap seq，但**保留原始 message id**；插件对 seq 位移免疫（读取全走官方恢复后
> 内存态、消息定位以 id 为主键、cutSeqCache 内存态不跨版本），scanCutSeq 用 `e.seq` 实际值非数组下标，天然鲁棒。
> 另两项 API 调整零交集：移除 `ctx.agent`（单数）——插件只用 `ctx.agents` 复数注册表（rg 实证零处单数引用）；
> `Inbox` 改 type-only——插件零处 `Inbox`/`hasPending`/`claim` 引用。**兼容声明同步扩展**：package.json
> `dshReleases` 矩阵补 `0.1.3-alpha.2`（修正 2.3.7 遗漏）+ `0.1.5-alpha.1`、7 个 peerDependencies 范围各补
> `>=0.1.5-alpha.1 <=0.1.5-alpha.1` tuple；`src/types/dsh-contract.ts` 事件 union 同步至 54 种（备忘面，零消费）。
> 评估实证见 upgrade-assessments/dsh-0.1.5-alpha.1.md。结论：接口层面零破坏，无需改码，升级后 `test:probe`
> 与 `verify:host` 机器化盯防继续有效；V3 迁移语义待 0.1.5 正式版发布后按本段定点复查（重点：旧 V2 会话
> 撤回切割实弹 + `assistant/attempt`/`system/message` 是否进入插件消费面）。
>
> **0.1.3-alpha.2 核验（2026-09-08）**：**npm 已发布**（dist-tag `alpha` 指向 0.1.3-alpha.2，
> `dsh-v0.1.3-alpha.2` tag commit `82a5fd6`，2026-09-07 发布），`npm install -g @deepseek-ai/dsh@0.1.3-alpha.2`
> 全局实装（依赖 dsh-settings 0.1.3-alpha.2、schemastery 3.18.2），reference/ 镜像重拉归档
> （13 文件，映射表未变；仅 09-architecture.md 官方文字修订——agent-loop 请求不可变语义、migration
> 只读 open 不发布后继/写 open 排他发布与 interrupted turn/end 补齐规则细化，非 API 契约变化），
> `npm run check:upgrade` 三层门禁全绿（check:dsh 漂移一致 + test:probe 31/31 + verify:host 装配断言通过，
> peer 兼容声明随本次扩展见下）。重查关键产物证据链：I1/I29 guard.d.ts shadowing priority 分配不变；
> I2 renderMessageImages 与 loadImage 并存不变（0.1.3-alpha.1 下放形态延续）；I5 ChatNodeKind 全集探针
> 断言全绿；I4 node.id/key 语义不变；I6 fork 签名逐字一致（`fork({sessionId, atSeq?, increaseTitle?})`）；
> I7 archiveSession 路由 workspaceRegistry 仍在；I28 SessionHeader 仍无 title；I30 installSection 未回归。
> alpha.2 相对 alpha.1 **无新增契约点**（官方变更集中在 session migration 语义细化与 agent-loop 文档，
> 与插件耦合点零交集）。**兼容声明同步扩展**：package.json `dshReleases` 矩阵补
> `0.1.3-alpha.2: compatible`、7 个 peerDependencies 范围各补 tuple `|| >=0.1.3-alpha.2 <=0.1.3-alpha.2`
> （沿 2.3.4 逐 tuple OR 窗口先例；CHANGELOG 待发版 2.3.7 时补记）。结论：无插件破坏性变更，无需改码，
> 升级后 `test:probe` 与 `verify:host` 机器化盯防继续有效。
>
> **0.1.3-alpha.1 核验（2026-09-07）**：**npm 未发布**（dist-tags latest 仍 0.1.2-rc.1），本地
> `dsh-v0.1.3-alpha.1` tag 源码构建（检出 `D:\workspace\DSH\deepseek-harness0.1.3-alpha.1`，
> `pnpm install` + `pnpm run build`）后 `npm link` 全局实装，reference/ 镜像重拉归档
> （13 文件，映射表未变；来源改记 tag 检出而非 master），`npm run check:upgrade` 三层门禁全绿
> （check:dsh 漂移一致 + test:probe 31/31 + verify:host 装配断言通过）。重查关键产物证据链：
> I1/I29 guard.d.ts shadowing priority 分配不变；I2 renderMessageImages 仍在、I5 ChatNodeKind
> 全集探针断言全绿；I4 node.id/key 语义不变；I6 fork 签名逐字一致
> （`fork({sessionId, atSeq?, increaseTitle?})`）；I7 archiveSession 路由 workspaceRegistry 仍在；
> I28 SessionHeader 仍无 title；I30 installSection 未回归。**新契约点（非漂移）**：
> ChatNodeOwnerProps 新增必填 `loadImage: MessageImageLoader` 下放（原 Omit 剔除形态撤销，插件未用、
> 仍走 renderMessageImages，消费方无破坏）；sessionQuery.readSession 增强 `inheritedEventCount`
> （读取侧可选字段）；事件集 `assistant/chunk` 移除 + `assistant/attempt` 新增（v2 迁移，插件只扫
> user/message + turn/end 零交集）；SessionHandle 为 persistence seam 内部重构不外泄。
> 结论：无插件破坏性变更，无需改码，升级后 `test:probe` 与 `verify:host` 机器化盯防继续有效。
>
> **0.1.2-alpha.4 核验（2026-09-02）**：`npm install -g @deepseek-ai/dsh@alpha`
> 实装 alpha.4，reference/ 镜像重拉至 alpha.4 归档（13 文件，映射表未变），
> `npm run check:upgrade` 三层门禁全绿（check:dsh 漂移一致 +
> test:probe 31/31 + verify:host 装配断言通过）。逐条抽查关键产物证据链：
> I1/I29 `dsh-cordis-client-runner/lib/types/client/guard.d.ts` register 代理仍分配
> shadowing priority（allocatePriority 签名未变）；I2 `dsh-client-ui-chat/.../slots.d.ts`
> ChatNodeOwnerProps.renderMessageImages 仍在；I4 conversation.d.ts node.id/key 语义不变；
> I6 `dsh-api-session-controller/.../sessions.d.ts` fork 签名逐字一致
> （`fork({sessionId, atSeq?, increaseTitle?})`）；I28 SessionHeader 仍无 title
> （title 折叠自 session/title 事件）；I30 dsh-settings 仍只暴露 `installSection`
> （`installSettingsSection` 未回归）。结论：无插件破坏性变更，无需改码，
> 升级后 `test:probe` 与 `verify:host` 机器化盯防继续有效。
>
> **0.1.2-rc.1 核验（2026-09-03）**：`npm install -g @deepseek-ai/dsh@next` 实装 rc.1
> （候选发布版，相对 alpha 线代码冻结；alpha tag 已升至 alpha.5 基线），reference/ 镜像
> 重拉归档（映射表未变），`npm run check:upgrade` 三层门禁全绿（check:dsh 漂移一致 +
> test:probe 31/31 + verify:host 装配断言通过）。重查关键产物证据链：
> I1/I29 guard.d.ts shadowing priority 分配不变；I2 renderMessageImages 仍在、I5
> ChatNodeKind 全集探针断言全绿；I4 node.id/key 语义不变；I6 fork 签名逐字一致
> （`fork({sessionId, atSeq?, increaseTitle?})`）——**JSDoc 语义澄清**：cut 边界取
> `atSeq` 之后第一次 `turn/end`（at-or-after），open turn 内锚点「不可用而非向后裁剪」，
> 已写入 I6 条目与 dsh-contract §1.1（resolveCutSeq 传最近 turn/end 语义兼容，运行中
> 回合由 P0-1 agentBusy 拦截兜底）；I28 SessionHeader 仍无 title；I30 installSection 未回归。
> 结论：无插件破坏性变更，无需改码。
>
> **0.1.2-alpha.2 核验（2026-08-31）**：新增 I30（settings 辅助函数移除）；
> I1/I2/I4/I5 的 chat.node 出处均为 ui-chat 包（探针已改双包探测）；事件信封
> `ignorable` 在 alpha.2 恢复（§1.3，插件不读无影响）；其余矩阵条目复查无漂移。
>
> **0.1.2-alpha.3 核验（2026-09-01）**：对照官方 release（117 commit）逐条评估，
> 本版本无插件破坏性变更——
> 1. **移除 SQLite Session 持久化后端**（`refactor(session)!`，breaking）为存储层裁剪：
>    删除 `dsh-session-persistence-sqlite`，仅留 JSONL provider；插件走 `ctx.sessions`
>    服务契约面（fork/open/search/list），不依赖持久化后端实现，**契约未漂移**。
>    I6 已对照 alpha.3 `session-controller/contract/sessions.ts` 核对，`ISessions.fork`
>    签名逐字一致（`fork({sessionId, atSeq?, increaseTitle?})`）。
> 2. **图片可靠投递**（steer/follow-up 图片）：仅把 `SubagentPromptRequest.content`
>    类型迁至 `dsh-attachment`（`PromptContentPart[]`），不触及插件的 chat.node slot、
>    `renderMessageImages`、fork。I1/I2/I4/I5 复查无漂移。
> 3. 其余（导航预览/渲染优化/权限文案/read_image/Tab 补全/断连误判/标题窄视口）均为
>    UI 与工具层，与插件耦合点无关。
> 结论：无需改码；升级后仍跑 `npm run check:dsh` + `npm run test:probe` 机器化钉住。
>
> **0.1.2-alpha.3 本地实装核验（2026-09-01）**：全局 dsh 已实装 alpha.3
> （`npm install -g @deepseek-ai/dsh@alpha`），reference/ 镜像已重拉至
> alpha.3 归档——官方 docs/ 目录重构后源路径迁移（如
> `docs/develop/basic/*` → `docs/user/develop/basic/*`、
> 11 号文件并入 `docs/subsystems/conversation.zh.md`），映射表已写入
> reference/README.md「更新方式」。实机验证：
> 1. `npm run test:probe` 17/17 绿——fork 签名（I6）、renderMessageImages（I2）、
>    SessionHeader 负向断言（I28）、stdin 字节保真（I27）官方字段假设无漂移；
> 2. `npm run verify:host` 装配门禁绿——inject 声明/12 端点/installSection
>    兼容分支（I30 在 alpha.3 导出面未再变）；
> 3. `npm test` 285/285 绿；`npm run check:dsh` 漂移一致安静退出。
> 结论：I1–I30 逐条复查无新增漂移，无需改码（09-architecture.md 新镜像仍写
> `fork(source, boundary?, childSessionId?)`，经 .d.ts 实机核验为文档示意写法而非
> 另一签名——唯一契约是对象形态 `fork({sessionId, atSeq?, increaseTitle?})`，见 I6）。
>
> **复查方式增强（2026-09-01）**：针对「确认未变」类复查动作缺证据链的审查结论
> （实证漏检：I5 的 context 键 0.1.2-alpha.1 已新增但探针零感知；I1 priority 语义与
> I29 的 guard 强制覆盖事实脱节），完成三项增强：
> 1. I1/I3/I4/I5/I7/I9/I12/I18/I20 的复查动作全部补官方产物证据链（读哪个包哪个
>    文件、断言哪个字段/语义），I1 与 I29 对齐，I5 补「context 已评估无害」结论；
> 2. 新增负向探针：I5 的 ConversationNode kind 全集断言（官方新增 kind 即红，逼人
>    评估是否需覆盖）、I6 的 atSeq/increaseTitle 严格可选断言（变必填即红）；
> 3. 新增 `npm run check:upgrade` 一键门禁：串联 check:dsh + test:probe +
>    verify:host，dsh 升级后一条命令全跑，并提示在本文头部追加核验记录。
>
> **PR #13 合并收尾（2026-09-01）**：合并外部贡献的两项修复（dsh-turn-fold 槽位
> priority 动态避让 + POSIX diff awk 多余点号），新增 I31（slots.entries /
> inject 回调时机 / StoredEntry 形状的新调用点）并补 api-surface 双包探针；
> CHANGELOG Unreleased 补记 awk 条目。矩阵其余无漂移。

## 矩阵

### I1 conversation.chat.node keyed slot：负值 priority + 冲突递减重试
- **依赖的官方行为**：keyed slot（key=`user`）不指定 priority 会因与默认渲染器同 key
  冲突而拒载整个插件；负值 priority 覆盖默认实现。
- **出处**：slot 注册契约（0.1.2-alpha.1 迁包：`dsh-client-ui-chat` 的 contract/slots.d.ts；0.1.1-rc.2 在 `dsh-client-ui-conversation`，声明内容逐字段一致）+ `dsh-cordis-client-runner/lib/types/client/guard.d.ts`（0.1.2 起 register 代理强制分配 shadowing priority，见 I29）。
- **探针/单测**：`tests/probe/api-surface.test.js`（guard 的 allocatePriority/shadowing 断言）+ 冒烟「撤回按钮出现」覆盖。
- **失效症状**：插件白屏/整体拒载，或撤回按钮不渲染。
- **复查动作**：读 `dsh-cordis-client-runner/lib/types/client/guard.d.ts` 确认 register
  代理仍强制分配 shadowing priority（「later registrations sort first」）——0.1.2 起
  插件传入的 priority 被覆盖（I29 实证），app.js 的负值递减重试循环因此失效但无害
  （插件注册晚于官方默认渲染器，shadowing 排序后仍排前、等效覆盖默认实现）；若官方改回
  尊重插件 priority 值，可恢复重试循环原始语义。`['user','steering']` 两 key 仍独立注册
  （kind 集合由 I5 探针盯防）。

### I2 chat.node props：renderMessageImages 为图片渲染入口（0.1.3 起 loadImage 下放）
- **依赖的官方行为**：`renderMessageImages({ images: [{attachment}], align })` 是图片
  渲染入口；`loadImage` 在 0.1.2-alpha.1 被 `Omit<MessageImagesOwnerProps,'loadImage'>`
  明确剔除，**0.1.3-alpha.1 起作为必填 `loadImage: MessageImageLoader` 直接下放**
  （session 授权图片加载器，供 chat-node 渲染附件展示槽用）。插件撤回重绘仍只走
  `renderMessageImages`，读 `loadImage` 属误用。
- **出处**：`dsh-client-ui-chat/lib/types/client/contract/slots.d.ts`（ChatNodeOwnerProps；
  0.1.3-alpha.1 实证 `loadImage: MessageImageLoader` 与 `renderMessageImages` 并存、
  Omit 剔除形态撤销；ui-conversation 构建产物仍保留历史 Omit 类型命名）。
- **探针/单测**：`tests/probe/api-surface.test.js`（renderMessageImages 存在 + Omit 整型匹配；
  0.1.3-alpha.1 产物下仍全绿——Omit 类型在 ui-conversation 产物中以历史形态保留）。
- **失效症状**：图片永久无声空白（issue #9：读不存在的 loadImage，守卫 return，零报错）。
- **复查动作**：重跑 test:probe；确认 images 仍传 image 块数组（非裸 attachment）；
  若未来去掉历史 Omit 类型导致探针红，改为断言 loadImage 下放形态即可。

### I3 session-scope slot props 合成：props.sessionId 由 kit 注入
- **依赖的官方行为**：`props = {...kit, ...injected, ...slotInjected.props, ...ownerProps}`，
  kit 注入 `sessionId/useSession/useSessions/useWorkspaces/useProjection`；owner 同名覆盖 kit。
- **出处**：`dsh-client-ui-renderer` standardProps/renderEntry（构建产物）。
- **探针/单测**：`tests/probe/api-surface.test.js`（standardProps/renderEntry 存在性断言）+ UserRecallNode 读取 `props.sessionId`/`props.renderMessageImages`。
- **失效症状**：撤回按钮按 `sessionId` 查询失效（按钮出现但快照查询错会话）。
- **复查动作**：读 `dsh-client-ui-renderer/lib/client.js` 的 `standardProps`（L549）与
  `renderEntry`（L650）——确认合成顺序仍为 `{...kit, ...injected, ...slotInjected.props,
  ...ownerProps}`：kit 最先展开（sessionId/useSession 等 kit 注入项仍在）、ownerProps
  同名覆盖 kit 的语义未变。

### I4 消息节点 id：node.id 是快照主键，node.key 是位置键
- **依赖的官方行为**：`node.id` 是真实消息 ID；`node.key` 是位置键（如 `13:input`）。
- **出处**：`dsh-client-ui-chat` ChatNode 类型（0.1.2-alpha.1 迁入，`node.id`/`node.key` 语义不变）。
- **探针/单测**：`tests/probe/api-surface.test.js`（ConversationViewNode 同时声明 id/key）+ 冒烟「撤回 → 文件恢复正确」覆盖。
- **失效症状**：快照查询永远 miss，撤回按钮永不出现或撤回错消息。
- **复查动作**：读 `dsh-client-ui-conversation/lib/types/client/contract/conversation.d.ts`
  L94-100 `ConversationViewNode`——`id`（消息 ID）与 `key`（位置键）两字段仍存在且分离；
  `dsh-client-ui-chat` 的 ChatNode 仍继承该接口（chat-nodes.d.ts L3-8）。

### I5 chat.node keyed key 与 UI 投影 kind 对齐（user + steering）
- **依赖的官方行为**：agent 运行中插入的转向指令投影为 `steering`（非 `user`），存储层
  `role` 恒 user；只注册 `key:'user'` 时 steering 节点落到官方默认渲染、撤回按钮缺失。
- **出处**：`dsh-client-ui-chat` 投影 kind 定义（0.1.2-alpha.1 迁入；完整 ChatNodeKind 全集见 dsh-contract.md §1.1，含新增 `context` 键）。
- **探针/单测**：`tests/probe/api-surface.test.js`（ConversationNode kind 全集负向断言：
  官方新增 kind 即红，逼人评估是否需覆盖）+ 冒烟「agent 运行中转向指令带撤回按钮」覆盖。
- **失效症状**：转向指令消息无撤回按钮（静默缺失）。
- **复查动作**：跑 test:probe 的 kind 集合断言。现状 kind 全集 11 个（user/assistant/
  steering/context/model-retry/turn-error/turn-max-tokens/tool-result/command/
  compaction/unknown，`dsh-client-ui-conversation/lib/types/client/contract/records.d.ts`
  L248 ConversationNode）——其中 `context`（官方 0.1.2-alpha.1 新增）已评估**无害**：
  context 注入行不需要撤回按钮，落官方默认渲染即可，无需注册 key；其余 kind 同理
  （assistant/tool 等是助手侧内容）。只有 user/steering 是「用户气泡」形态需覆盖。

### I6 sessions.fork：不传 increaseTitle（标题「xxx 2」回归钉）
- **依赖的官方行为**：`fork({ sessionId, atSeq?, increaseTitle? }) → Promise<SessionId>`；
  `increaseTitle` 会把子会话标题改为「xxx 2」并递增。
- **出处**：`dsh-api-session-controller/lib/types/client/contract/sessions.d.ts` L97
  （0.1.2-alpha.1 由 `dsh-client-runtime` 迁入该新包；fork 签名与 0.1.1-rc.2 逐字段一致）。
- **探针/单测**：`tests/probe/api-surface.test.js`（fork 双包探测 + atSeq/increaseTitle 严格可选负向断言）。
- **失效症状**：撤回后标题变「xxx 2」且多次撤回递增。
- **复查动作**：确认 fork 签名未变、increaseTitle 仍可选；本项目仍不传它。另注：
  docs/reference/09-architecture.md「新行为归属位置」表写
  `ctx.sessions.fork(source, boundary?, childSessionId?)`（2026-09-01 镜像）——
  **是文档的示意写法，不是另一个签名**：alpha.3 实装
  `dsh-api-session-controller/lib/types/client/contract/sessions.d.ts` L94-98 的
  `ISessions.fork(opts: {sessionId, atSeq?, increaseTitle?})` 是唯一契约（JSDoc 明示
  opts 即 source session id / anchoring cut 的 event seq / 标题递增开关），文档的
  第三个参数 `childSessionId?` 在契约中不存在；Host 侧 `dsh-session` 只有
  `CreateSessionOptions.seed`（种子回放），无 fork 方法。本项目撤回走
  `fork({ sessionId, atSeq })` 对象形态（src/client/recall-node.ts），与契约逐字
  匹配，探针钉住。

  **0.1.2-rc.1 语义澄清（2026-09-03）**：JSDoc 明示 cut 边界语义——boundary 是
  `atSeq` 处或之后第一次 `turn/end`（at-or-after），且当锚点在 open turn 内时
  「不可用而非向后裁剪」（fork 决议失败而非改绑前一个 turn/end）。与插件
  `resolveCutSeq`（取目标消息之前最近一次 turn/end 的 seq 传入）语义兼容：
  传的 seq 本身即 turn/end 则 at-or-after 命中同一点；唯一差异场景是目标消息
  位于运行中的回合内（无已闭合 turn/end）——官方拒绝 fork 而非裁剪，P0-1
  agentBusy 拦截已挡运行中撤回，实际触发面小。签名与探针零变化，无需改码。

### I7 archiveSession 语义：归档 = 从分组表面隐藏（F1 lineage 链断裂根因）；忙碌会话须 stopActivity
- **依赖的官方行为**：`archiveSession(sessionId, options?)` 把会话移入 registry-global set，
  **hidden from grouping surfaces**（日志与记账槽保留）。**`options.stopActivity !== true` 时先经
  `workspace/session-activity` 瀑布问「这会话还有什么在跑」**（provider：`dsh-agent` 回合 /
  `dsh-jobs` 运行中作业 / `dsh-subagent` 子代理 / `dsh-schedule`），命中即抛
  `workspace/session-active` 拒绝归档；传 `stopActivity: true` 才改成「先停后归档」
  （`workspace/session-stop` → `dsh-jobs` 以 `registry.kill(id, owner, "session archived")` 杀作业，
  结算 `settleCause = 'kill'`，**不属** `dsh-tool-jobs` 抑制通知的 `teardown`）。
- **出处**：`dsh-api-workspace-controller/lib/types/client/{service.d.ts,model.d.ts,contract/}`
  （0.1.2-alpha.1 由 `dsh-client-runtime` 迁入该新包）；归档准入与先停后归档实现于
  `dsh-workspace/lib/index.js`（`archiveSession(sessionId, options = {})`）、
  `dsh-jobs/lib/index.js`（`installJobArchiveAdmission`）、`dsh-jobs-local/lib/index.js`（`killJob`）。
- **探针/单测**：`tests/probe/api-surface.test.js`（archiveSession Remote 方法存在 + workspaceRegistry
  路由 + 客户端 `options?: { stopActivity?: boolean }` 与 `workspace/session-active` 拒绝语义）；
  F1 用 Host 记录 fork lineage 绕过该限制。
- **失效症状（2026-09-23 插件侧实证）**：撤回时源会话有后台作业在跑 → 插件旧写法
  `archiveSession(sessionId)` 被官方拒且 `.catch()` 把错误吞掉 → **原会话静默不归档（仍留在列表）**、
  作业继续跑；作业结算 `cause: 'kill'` 不被抑制 → `dsh-tool-jobs` 在 idle 的源 agent 上
  `followup(...)` → **文件已回滚的原会话被唤醒开新一轮**（幽灵执行）。
  （纯 client 侧读不到已归档中间版本的 parentId 是另一类既有症状。）
- **复查动作**：读 `dsh-workspace/lib/index.js` 的 `archiveSession`（`stopActivity !== true` 时经
  waterfall 拒、`=== true` 时 `stopSessionActivity`）与 `dsh-jobs/lib/index.js` 的
  `installJobArchiveAdmission`；任一漂移即复核插件的归档调用（现传 `{ stopActivity: true }` 并留痕）。
- **实弹验证（2026-09-23，win32 本机 web profile，真模型 + 真后台作业，`D:\tmp\recall-h0` 隔离工作区）**：
  预修复版（npm 2.4.2）—— 会话跑起两个后台作业后撤回第二条消息：原会话**未归档**（`~/.dsh/storages/workspace.json`
  归档集合 32 条不变、仍留在会话列表并被打上「已完成」标记），且随后被**两次唤醒**（13:35「pwsh-1 已结束」、
  13:37「pwsh-2 已结束」两轮落在已回滚的原会话里；该两次未改写工作区文件，伤害落在会话层）。修复版
  （profile 临时切 `link:` 本仓库）—— 同流程：归档集合 **32 → 33**（原会话 `session-185df8ae` 入集合、
  从列表消失），作业在撤回时刻被停（原定 13:45:20 结算；13:46 复查无自然完成轮、原会话投影无任何作业通知内容），
  **无幽灵轮**；fork 子会话仅含被撤回消息之前的对话（逐项与设计一致）。

### I8 sessionQuery.listSessions：会话 id 在 header.id
- **依赖的官方行为**：listSessions 记录形如 `{header, live, persisted}`，会话 id 在
  `header.id`；顶层 `record.id` 恒 undefined。
- **出处**：`dsh-session-query/lib/types/corpus.d.ts`（`header: SessionHeader`）。
- **探针/单测**：`tests/probe/api-surface.test.js`（header: SessionHeader + listSessions + SessionRecord 顶层无 id 负向断言）。
- **失效症状**：预热重建的孤儿快照 sessionId 记空，树形管理落「已删除会话」。
- **复查动作**：确认 SessionRecord.header 结构未变。

### I9 冷启动 sessions.list() 为空：exclude 枚举须叠加 home 容器磁盘兜底
- **依赖的官方行为**：`ctx.sessions.list()` 是纯内存 Map，冷启动惰性载入常为空。
- **出处**：官方部分 = `dsh-session/lib/index.js`（SessionStore 纯内存 Map，L1480-1481）；项目部分 = `resolveHomeContainer` 磁盘兜底（src/host/store.ts，**非官方耦合**——dsh 升级复查不涉及，改 store 代码时复核）。
- **探针/单测**：`tests/probe/api-surface.test.js`（SessionStore 服务名 + 内存 Map 形态断言）+ 冒烟「冷启动设置页可见排除配置」覆盖。
- **失效症状**：设置页误报「尚未创建快照存储」，exclude 编辑不可见。
- **复查动作**：读 `dsh-session/lib/index.js` L1480-1481 `SessionStore`——`store` 仍是
  纯内存 Map（注释明示「Persistence is intentionally not implemented here」）、`list()`
  （L1723）仍同步返回该 Map；冷启动为空、依赖持久化插件经 `session/event` 重放填充的
  语义未变。`resolveHomeContainer` 磁盘兜底路径（本项目 src/host/store.ts）仍有效。

### I10 cordis inject 门禁：ctx.<service> 必须在 inject 声明
- **依赖的官方行为**：cordis 4 要求服务在插件 `inject` 声明才可经 `ctx.xxx` 访问，漏声明
  抛 `cannot get property "xxx" without inject`，被守卫式 try 吞掉后静默 fail-open。
- **出处**：`dsh/node_modules/@deepseek-ai/cordis/lib/index.js`（ReflectService handler）。
- **探针/单测**：`scripts/verify-host.mjs`（真实 Context apply 不抛 = inject 完整）。
- **失效症状**：如 agentBusy 恒返回「不忙」、撤回防护失效（P0-1 实证）。
- **复查动作**：新增 `ctx.<服务>` 调用点同步加进 `inject`；verify:host 变红即修。

### I11 Host import @deepseek-ai/* 按模块真实路径解析（junction）
- **依赖的官方行为**：npm/git 安装走 profile 树（hoisted）；link: 开发安装走工作区，
  须自备 `node_modules/@deepseek-ai/{schemastery,dsh-settings}` junction。
- **出处**：ESM 无全局 node_modules 回退；AGENTS.md「开发与验证」节 junction 重建命令。
- **探针/单测**：`verify:host` / `npm test` 能 import 即通过。
- **失效症状**：`ERR_MODULE_NOT_FOUND`（1.6.0 实证）。
- **复查动作**：link 模式开发前确认 junction 存在；丢失按 AGENTS.md 命令重建。

### I12 settings.plugin.item 按 namespace 交集分发（**0.1.6-alpha.2 起 slot 移除，已迁挂 plugins.bundle.config**）
- **依赖的官方行为**：`settings.plugin.item` 是 root 级 keyed slot，按 settings namespace
  作为 entryKey 分发；卡片 key 必须与 Host namespace（`dsh-recall`）一致。
- **出处**：`dsh-client-ui-settings-plugins` configurable 标签页声明；**0.1.6-alpha.2 旧设置页
  插件 tab 整体移除，该 slot 与 `settings.plugins.tab` 一并删除**（产物 grep 双双归零），替代者是
  ui-plugin-manager 插件管理页的 `plugins.item`/`plugins.bundle.config`/`plugins.row.config`
  （bundle 配置 key=bundle 包名，page 视图自含保存控件）。
- **探针/单测**：`tests/probe/api-surface.test.js`（settings.plugin.item 断言）+ 冒烟「设置页撤回卡片出现」覆盖。
- **失效症状**：0.1.6-alpha.2 上设置卡片永不渲染（slot 无声明者，注册静默 no-op——renderer
  `specDynamic` 返回 undefined 即 return，不抛错）。
- **复查动作**：读 `dsh-client-ui-settings-plugins`/`dsh-client-ui-plugin-manager` 的
  `lib/client.js` grep `settings.plugin.item`（应无）与 `plugins.bundle.config`（应有）；插件
  `src/client/app.ts` 双键并注册——`settings.plugin.item`（key=`dsh-recall`，旧版 dsh）+
  `plugins.bundle.config`（key=`dsh-recall-plugin`，alpha.2+），未声明 key 的 inject 是静默
  no-op 故无需版本探测；实弹确认插件管理页 dsh-recall-plugin 的 bundle 页出现配置表单。

### I13 ModuleLoader：单文件 CJS factory 包裹（R1 路线 B 依据）
- **依赖的官方行为**：插件 bundle 由 `serveBundle` 原文 serve 为 `text/javascript`，浏览器
  以 classic `<script>` 执行；factory 的 `require(spec)` 只按「包名」粒度解析（seed →
  loadCache → 已注册 factory），不认相对路径，未命中 throw（bundle purity gate）。
- **出处**：`dsh-client-modules/lib/index.js` L212（`window.__ModuleLoader__`）、
  serveBundle、`dsh-client-modules/lib/client.js` makeRequire（miss 分支）——
  注意两处 `lib/client.js` 不要混淆：前者是官方包内文件，后者是本仓库的构建产物
  （A8 澄清）。
- **探针/单测**：`scripts/build-client.mjs` 产物断言（factory(require) 包裹 + 无顶层 import）。
- **失效症状**：ESM 多文件相对 import → 顶层 import SyntaxError 拒载（白屏）。
- **复查动作**：dsh 升级后确认 loader 仍为「单文件 CJS table」；若支持 ESM 多文件，
  R1 可换路线 A。

### I14 pwsh 对 native 非零退出不抛：关键命令显式查 $LASTEXITCODE
- **依赖的官方行为**：PowerShell 的 `$ErrorActionPreference` 不作用于 native 命令，非零
  退出码不抛；不显式检查会「旧索引/空树假成功」。
- **出处**：`src/host/scripts.pwsh.ts`（snapshot/diff/rollback/rescue 模板的显式 throw）。
- **探针/单测**：`tests/unit/scripts-contract.test.js`（模板结构断言）。
- **失效症状**：空树假成功（1.7.0 实证）。
- **复查动作**：新增 pwsh native 命令模板时维持 `$LASTEXITCODE` 检查。

### I15 runShell 失败兜底：g='<store.git>' 赋值约定 + RECALL_CLEANUP 哨兵
- **依赖的官方行为**：runShell 失败路径从脚本文本提取 `g='<store.git>'` 清孤儿进程与
  stale 锁；清扫脚本带 `RECALL_CLEANUP` 哨兵防递归。
- **出处**：`src/host/store.ts` extractGitDir / cleanupAfterGitFailure（**非官方耦合**：项目内约定，dsh 升级复查不涉及；改 runShell 失败兜底时复核）。
- **探针/单测**：`tests/unit/scripts-contract.test.js`（STORE_SCRIPTS 的 g= 约定 + 哨兵）。
- **失效症状**：孤儿 git 持锁 30+ 分钟；清扫脚本自递归。
- **复查动作**：新增带 store 脚本模板必须维持 g= 赋值；scripts-contract 变红即修。

### I16 POSIX while 循环体禁用 cond && cmd
- **依赖的官方行为**：`set -e` 下 `cond && cmd` 条件为假时整条管道退出码 1，杀脚本。
- **出处**：`src/host/scripts.posix.ts`（snapshotScript 的 if/fi 用法）。
- **探针/单测**：`tests/unit/scripts-contract.test.js`（结构断言，间接）。
- **失效症状**：快照脚本在「无跳过」路径整条退出码 1、set -e 杀脚本。
- **复查动作**：新增 posix while 循环体一律 if/fi；不回归 cond && cmd。

### I17 git init <dir>：repo 与 git 是两个路径概念
- **依赖的官方行为**：`git init <dir>` 把真实 git-dir 建在 `<dir>/.git`。
- **出处**：`src/host/store.ts` makeStore（repo=dir/git、git=dir/git/.git）。
- **探针/单测**：无直接探针；冒烟「中文路径工作区快照/撤回」覆盖。
- **失效症状**：脚本 `--git-dir` 指向错误路径，快照/回退全失败。
- **复查动作**：git init 语义为 git 固有行为，无 dsh 升级风险；改 store 布局时复核。

### I18 子进程不继承 DSH_HOME：POSIX home 探测三档回退
- **依赖的官方行为**：DSH bash 执行器洗刷子进程 DSH_* 变量，用户导出的 DSH_HOME 在
  bash 里通常不可见。
- **出处**：官方部分 = `dsh-shell-env/lib/index.js`（DSH_ENV_PREFIX 注册表 + RESERVED_BASH_ENV_KEYS 含 DSH_HOME_ENV）；项目部分 = `src/host/store.ts` posixHomeBaseResolve（**非官方耦合**，改 store 代码时复核）。
- **探针/单测**：`tests/probe/api-surface.test.js`（DSH_ENV_PREFIX / RESERVED_BASH_ENV_KEYS / DSH_HOME_ENV 断言）+ 冒烟「POSIX 下快照存对 home」覆盖。
- **失效症状**：快照存错 home 目录（或降级到项目内）。
- **复查动作**：读 `dsh-shell-env/lib/index.js`——`DSH_ENV_PREFIX` 注册表与
  `RESERVED_BASH_ENV_KEYS`（含 `DSH_HOME_ENV`）机制未变：模型侧 shell 工具的 DSH_*
  变量由该注册表统一产出，用户随意导出的 DSH_HOME 不可见；三档回退顺序仍正确；第三档
  落点为 `homedir/.dsh`（I24，勿回退成裸 homedir）。

### I19 快照索引两段式补全：manage list 字段补全 + messageTexts null 缓存
- **依赖的官方行为**：`sessionQuery.readSession` 冷读整日志解压很贵（10 秒级），快照管理
  列表首屏不等冷标题/消息文本，由 client 异步二次请求补齐。
- **出处**：`src/host/index.ts` manage titles/messages 端点 + `lib/client.js`（src/client 构建产物）两段式（**非官方耦合**：项目内时序约定，dsh 升级复查不涉及；改 manage 端点时复核）。
- **探针/单测**：`tests/unit/client-pure.test.js`（buildTree）+ 冒烟「树形展开见标题/消息」。
- **失效症状**：冷会话标题/消息永不补齐，或无文本消息每次刷新重复解压冷日志。
- **复查动作**：确认 readSession 契约未变；messageTexts null 也缓存（避免重复冷读）。

### I20 批量删 tag 分块（每 100）：win32 命令行 32767 上限
- **依赖的官方行为**：DSH pwsh 执行器把命令串作为 `-Command` 单个 argv 元素 spawn，Windows
  命令行 32767 字符上限。
- **出处**：官方部分 = `dsh-pwsh-local/lib/index.js`（命令串作为单个 argv 元素传 `-Command`）；项目部分 = `src/host/index.ts` deleteSnapshotsByFilter / `src/host/maintenance.ts` purgeSession 分块实现（**非官方耦合**，改批量命令时复核）。
- **探针/单测**：`tests/probe/api-surface.test.js`（-Command 单 argv 断言）+ 冒烟「长历史工作区批量删除」覆盖。
- **失效症状**：长历史工作区批量删 tag spawn 失败。
- **复查动作**：读 `dsh-pwsh-local/lib/index.js` L75-78——命令串仍作为**单个 argv 元素**
  传给 `-Command`（无中间 shell、无 shell-quoting 层），Windows 命令行 32767 字符上限的
  生效前提未变；新增批量命令时维持分块（每 100，见本条目依赖行为）。

### I21 ps1 测试文件带 BOM（PS 5.1 无 BOM 按 ANSI 解析）
- **依赖的官方行为**：Windows PowerShell 5.1 对无 BOM 的 .ps1 按 ANSI(GBK) 解析，中文路径乱码。
- **出处**：AGENTS.md 已知坑；真实链路（argv 直传 + UTF8_PRELUDE）不受影响。
- **探针/单测**：无（测试文件约定）。
- **失效症状**：手写 .ps1 测试里中文路径乱码。
- **复查动作**：新增 .ps1 测试文件必须带 BOM。

### I22 Client 查 snapshot-info 前必须等 ensureInit 回调
- **依赖的官方行为**：Host 端 init 要跑数条 shell（建仓/loadIndex），是异步预热；快照捕获
  也是异步的。client 侧「单槽缓存 init promise + 有界轮询」是自有时序约定（非官方字段）。
- **出处**：`src/client/util.ts` ensureInit / `src/client/recall-node.ts` UserRecallNode 轮询（**非官方耦合**：项目自有时序约定，dsh 升级复查不涉及；改 client 轮询时复核）。
- **探针/单测**：无直接探针；冒烟「冷启动撤回按钮出现」覆盖。
- **失效症状**：冷启动误判 `has:false` 且不重试，撤回按钮永不出现。
- **复查动作**：确认 init 仍为每会话一次的异步预热；轮询窗口/次数与快照耗时匹配。

### I23 manage list 同 id 去重须字段补全（磁盘先占位、内存后补）
- **依赖的官方行为**：快照列表是「磁盘 dump + 内存缓存」并集，同一 id 可能磁盘先占位
  （root 缺失）、内存后补全；按「首次命中即丢弃」会让节点落「未知工作区」。
- **出处**：`src/host/index.ts` manage list 的 push 补全逻辑 / collectAllSnapshotRecords（**非官方耦合**：项目内并集去重实现，dsh 升级复查不涉及；改 manage list 时复核）。
- **探针/单测**：无直接探针；冒烟「跨工作区快照树形归组正确」覆盖。
- **失效症状**：树形一级节点落「未知工作区」，批量删除按工作区/会话匹配不到。
- **复查动作**：确认 store 目录仍是 root 的单向哈希（磁盘反查 root 依赖 root.txt/index）。

### I24 POSIX home 三级回退第三档缺失 .dsh 子目录（issue #11 修复）
- **依赖的官方行为**：win32 第三档是 `Join-Path USERPROFILE .dsh`；POSIX 版曾直接用
  裸 `os.homedir()`，两平台第三档布局不一致，快照落 `~/dsh-recall-snapshots` 而非
  `~/.dsh/dsh-recall-snapshots`（issue #11 截图实证）。
- **出处**：`src/host/store.ts` selectPosixHomeBase / resolvePosixHomeBase（第三档补 `/.dsh`
  + 旧容器一次性迁移四态编排）vs `src/host/scripts.pwsh.ts` homeDirScript；迁移模板
  `src/host/scripts.posix.ts` legacyHomeMigrateScript。
- **探针/单测**：`tests/unit/store-path.test.js`（三分支 + 迁移四态 + 模板形状）。
- **失效症状**：POSIX 快照落 `~/dsh-recall-snapshots`；改 base 而无迁移时存量用户
  「看不到」历史快照。
- **复查动作**：改 POSIX home 解析链时核对第三档仍拼 `/.dsh`；legacyHomeMigrateScript
  四态输出未漂移（MIGRATE_OK/OLD_ABSENT/BOTH_PRESENT/MIGRATE_FAIL）；parity SKIP
  集合三处（src/host/store.ts checkScriptParity、scripts-contract.test.js）仍含该平台专属导出。

### I25 失败清扫分级：心跳 + 新锁保护活跃实例（issue #11 根因治理）
- **依赖的官方行为**：POSIX `kill -0` / win32 `Get-Process -Id` 探活；`find -mmin` 与
  `.LastWriteTime` 的 mtime 判定；心跳文件内容为「宿主 PID + epoch 秒」ASCII 单行
  （pwsh 侧必须 ascii 编码——utf8 会带 BOM 破坏 POSIX 侧首字段解析）。
- **出处**：`src/host/scripts.pwsh.ts` / `src/host/scripts.posix.ts` killOrphansScript（三级出口
  CLEANUP_OTHER_INSTANCE / CLEANUP_SKIPPED_FRESH_LOCK / CLEANUP_DONE）+
  ensureGitScript/snapshotScript 的 heartbeatBlock 写入 + `src/host/store.ts`
  parseCleanupResult / cleanupAfterGitFailure。
- **探针/单测**：`tests/unit/diagnostics.test.js`（parseCleanupResult + 接线）+
  `tests/unit/scripts-contract.test.js`（出口标记、心跳接线、STALE_LOCK_MIN /
  HEARTBEAT_TTL_S 两侧同值）。
- **失效症状**：多实例互踩死循环回归（清扫误杀对方活跃 git → 对方也失败 → 循环）。
- **复查动作**：改锁清单或阈值时两侧常量必须同步；心跳写保持 fail-open（不连累
  快照主流程）；parseCleanupResult 的标记名与模板输出逐字一致。

### I26 影子仓库固化 info/attributes 字节保真（issue #12 修复）
- **依赖的官方行为**：`git archive` 与 `git add` 都应用「快照树里项目自己的
  .gitattributes」——`text=auto` + 缺省 `core.eol=native`（Windows 即 CRLF）会让
  archive 解包把 LF 转 CRLF，仓库级 `core.autocrlf=false` 挡不住（属性驱动的转换
  看 core.eol，不看 autocrlf，实测）。`$GIT_DIR/info/attributes` 是优先级最高的
  属性源，对全部路径一票否决树内与全局属性。另两个实测细节：`git add
  --renormalize` 无 pathspec 是空操作（必须 `-- ':(top)'` 顶层魔法 pathspec，
  且不能加 --literal-pathspecs）；属性变更后裸 add -A 受 stat 缓存影响时序依赖
  地跳过重哈希（racy 复查只覆盖「add 与文件同秒写入」），存量归一化条目需要
  显式 renormalize 迁移。
- **出处**：`src/host/scripts.pwsh.ts` / `src/host/scripts.posix.ts` FIDELITY_ATTRS 常量 +
  ensureGitScript 的 info/attributes 固化 + snapshotScript 的 attrsMigrateBlock
  （一次性 renormalize，标记文件 attrs-v1.stamp，失败不 throw 保快照主流程）。
- **探针/单测**：`tests/unit/scripts-contract.test.js`（两侧常量逐字同值、固化行、
  renormalize + ':(top)' + 迁移标记）；issue #12 分析的实验矩阵与真实模板端到端
  复验（2026-08-29，本机 system autocrlf=true + 恶意 .gitattributes，16 项全过）。
- **失效症状**：text=auto / eol=crlf 项目回退后换行符漂移（LF↔CRLF 双向失真，
  capture 侧归一化 + restore 侧反向转换）；`export-ignore` 声明让文件从回退归档
  静默消失（快照有、恢复无、零报错）；clean filter / $Id$ / working-tree-encoding
  改写恢复内容。
- **复查动作**：git 升级后复核 info/attributes 优先级仍高于树内 .gitattributes、
  archive 仍应用属性转换（若 git 未来改为「archive 不做转换」，固化即冗余无害）；
  FIDELITY_ATTRS 两侧同值；改动属性内容须同步换 attrs-v1.stamp 标记名（版本化，
  让存量仓库重新迁移）。

### I27 PS 5.1 stdin 文本读取按输入代码页解码；dsh pwshPath 解析实际常落 PS 5.1（PF-2 探针）
- **依赖的官方/环境行为**：① PowerShell 5.1（.NET 4.x）的 `[Console]::In` 读重定向
  stdin 按 `Console.InputEncoding`（中文机器 GBK 936）解码——UTF-8 字节流会乱码
  （字节数漂移、中文损坏）；官方 `ENCODING_PREAMBLE` 与插件 `UTF8_PRELUDE` 只设
  `OutputEncoding`，救不了输入侧；`[Console]::InputEncoding` 对重定向 stdin 设置
  行为不可靠。可靠读取手法是 `[Console]::OpenStandardInput()` 读原始字节 +
  `UTF8Encoding($false)` 显式解码（与代码页无关，PS 5.1/pwsh 7 双解释器实测
  逐字节保真）。② dsh-pwsh-local 的 `candidateExists` 用 `lstatSync`+isFile/
  isSymbolicLink 判存在——WindowsApps 的 pwsh 应用执行别名是 appexeclink
  reparse point，`lstatSync` 报 ENOENT 判否：本机只装 WindowsApps 别名 pwsh 时
  **生产口径就是 powershell.exe 5.1**，5.1 兼容性不是兜底考量而是主路径。
- **出处**：`dsh-pwsh-local/lib/index.js`（ENCODING_PREAMBLE / resolvePwshPath /
  candidateExists，2026-08-29 构建产物源码）；`dsh-subprocess-local/lib/index.js`
  （stdin 经 `child.stdin.end(data)`，Node UTF-8 编码）。
- **探针/单测**：`tests/probe/stdin-write.test.js`（与执行器同 argv 形态 spawn，
  OpenStandardInput 形态逐字节保真回归钉）；实弹见 plan-performance.md PF-2 探针
  结论（形态 A Console.In 在 PS 5.1 红的实证）。
- **失效症状**：若改回 `[Console]::In.ReadToEnd()` 读 stdin——中文机器上
  index.json/lineage.json/exclude.txt 写入内容乱码、JSON.parse 失败、误走损坏隔离。
- **复查动作**：dsh 升级后核对执行器 stdin 写侧仍是 `child.stdin.end`（UTF-8）；
  若未来官方 preamble 加设 InputEncoding 或执行器默认 PS 7 真身，探针仍绿（字节
  流形态与编码无关），可保持现状。

### I28 SessionHeader 无 title 字段（PF-7 titles 半项废弃依据）
- **依赖的官方行为**：`SessionHeader` 持久化字段只有 version/id/createdAt/cwd/
  parentSession/seedLength/origin/delegationDepth/agentPreset——会话标题不在
  header 里，住在事件日志的 `session/title` 事件（session-info.js
  titleFromEvents 的既有读取路径）。因此 `listSessions()`（目录级 header 枚举）
  拿不到冷会话标题，只能拿 id/cwd。
- **出处**：`dsh-session/lib/types/types.d.ts`（SessionHeader 接口，2026-08-29 核验）。
- **探针/单测**：`tests/probe/api-surface.test.js` 负向断言（SessionHeader 体内
  不含 `readonly title`——未来官方加 title 时探针红，提示可重启 titles 优化：
  冷标题免 readSession 冷读）；header.id 存在的正向断言（sweep 依赖，I8）。
- **失效症状**：无（titles 半项未实施，维持 readSession 现状）；若未来误按
  `header.title` 取标题会恒 undefined。
- **复查动作**：dsh 升级后探针红（官方加了 title）→ 重新实施 plan-performance.md
  PF-7 的 titles 半项（listSessions 建 id→title Map，冷标题零 readSession）。

### I29 Client 插件必须声明式 inject + 属性访问服务（0.1.2 服务作用域重组，UI 全消失实证）
- **依赖的官方行为**：client runner 用 `dynamicCordisContext`
  （`cordis-client-runner/src/client/guard.ts`）包插件 apply 收到的 ctx——属性
  访问 `ctx.<service>` 只对插件对象 `inject` 数组声明过的服务做跨 scope 解析；
  `ctx.get(name)` 虽不做声明检查，但解析结果取决于服务在插件 fiber 作用域内
  是否可见。**guard 门禁 0.1.1-rc.2 已存在且语义相同**（0.1.2 仅把 import 从
  `dsh-client-runtime` 换成 `dsh-client-ui-renderer`，guard.ts/runtime.ts/
  index.ts 其余零变更）；真正触发失效的是 **0.1.2 的 client 服务层大迁移**：
  `client/runtime` 包整体删除，slots 服务迁入 `ui-renderer`、sessions 迁入
  `api/session-controller`（新包）、workspaces 迁入 `api/workspace-controller`
  （新包）——未声明 inject 的插件 fiber 在新拓扑下经 `ctx.get('slots')` 解析
  不到服务（返回 undefined）。0.1.1-rc.2 时 slots 由同作用域的 client/runtime
  提供，`ctx.get('slots')` 可用。**升级后未声明式改造的插件 apply 首行
  `if (!ctx.get('slots')) return` 静默退出**：CSS 不注入、slot 全部不注册、
  entry 仍 active（apply 无异常），页面无任何失败提示。同批第三方插件
  （better-sidebar、archive-manager）同样消失，dshmarket 活着是因为它本来就
  声明 `inject: ['slots','locale','theme']`。
- **出处**：`cordis-client-runner/src/client/guard.ts`（dynamicCordisContext/
  readService：属性访问 requireDeclaration=true、get=false；guardedSlots 对
  keyed 等 shadowing kind **强制 allocatePriority 覆盖插件传入的 priority**，
  「later registrations sort first」——插件侧 priority 冲突递减重试循环失效
  但无害）；官方 denyRead 教学语明确要求
  `{ inject: ['slots', …], apply(ctx) { … } }`。cordis 4 对「inject 声明未满足」
  的语义见 `cordis-client-runner/src/client/runtime.ts` L390-394（「Settled but
  not active = legal pending on an unsatisfied declaration」）与
  `@deepseek-ai/cordis` Fiber._checkImpl（服务不可得即不启动、不报错）。
- **探针/单测**：无直接探针（浏览器端行为，CI 外）。修复以实弹验证钉：CSS
  `<style data-plugin="dsh-recall-plugin">` 注入 + 设置卡渲染 + 撤回按钮 DOM
  （2026-08-30 dsh 0.1.2-alpha.1 link 模式全过）。
- **双版本兼容（2026-08-31 cordis 4.0.1 实测钉）**：修复的 inject 清单为
  `['slots','sessions','workspaces','timer']`——**不含 `conversation`**：
  conversation 服务 0.1.2 才存在（ui-conversation `service.ts` 提供，
  0.1.1-rc.2 无），静态声明它会让 0.1.1-rc.2 上的插件走「声明未满足」路径
  静默不启动（fiber settled 但 apply 不执行，UI 全灭且无报错——与 I29 症状
  相同但成因不同）；故 conversation 统一走 `ctx.get('conversation')` 探测 +
  降级（guard 的 get 对缺失服务安全返回 undefined；0.1.1-rc.2 上回填输入框
  功能本来就不存在，0.1.2 主流程不受影响）。
- **失效症状**：本插件 UI 全部消失（按钮 + 设置卡），无报错无声息；Host 半
  API 正常（`/api/recall/*` 200）——「Host 活 Client 死」即此症。
- **复查动作**：dsh 升级后核对 guard.ts 的门禁语义是否放宽（get 恢复跨 scope
  或声明要求变化）；插件 `src/client/entry.ts` 的 inject 清单与官方 client 域
  服务清单比对（声明缺失服务会让 fiber 静默不启动——styles 已从声明剔除、
  conversation 走 get 探测）；0.1.2 之后若 conversation 成为两端稳定服务，
  可重新评估是否进 inject；guard 的 slots register 优先级覆盖策略若改回尊重
  插件值，可恢复 priority 重试循环的原始语义。

### I30 settings 独立辅助函数移除：installSettingsSection → SettingsProvider.installSection（0.1.2-alpha.2 破坏性变更实证）
- **依赖的官方行为**：Host 侧 settings namespace 接入路径随版本迁移——0.1.2-alpha.1
  及以前用独立导出 `installSettingsSection(ctx, ns, schema, entry, hooks)`；
  0.1.2-alpha.2 起独立函数**移除**，改为 `SettingsProvider` 实例方法
  `installSection(owner, ns, schema, entry, hooks)`（owner 是调用插件 ctx），
  官方 bash-local / pwsh-local 同款写法 `ctx.inject(['settings'], sctx => sctx.settings.installSection(...))`。
- **出处**：已装 0.1.2-alpha.2 产物 `dsh-settings/lib/index.js`（导出面仅
  `SettingsConflictError`/`SettingsProvider`/`redactSecrets`，无 installSettingsSection）vs
  alpha.1 镜像 `settings/settings/lib/index.js:638`（仍导出）。两个签名逐字段一致
  （entry 为组合 base、hooks 为 setSource/onChange/validate）。
- **探针/单测**：无静态探针（import 到不存在的命名导出会直接 SyntaxError，探针
  读 .d.ts 也不覆盖）；`verify:host` 装配门禁在升级后必红并给出此症状——插件
  `src/host/index.ts` 静态 import 即崩。已做双版本兼容分支
  （`typeof dshSettings.installSettingsSection === 'function'` 走旧函数，否则走
  `ctx.inject(['settings'])` + `installSection`）；verify-host 桩自 0.1.7 适配起
  **同时提供两代面**，且「只给新面（无 installSection）」单独跑一个 pass（断言 7）——
  桩只提供旧面时本换代会被自己的桩掩盖（见下）。
- **失效症状**：插件 Host 半启动即崩——SyntaxError `does not provide an export
  named 'installSettingsSection'`，`/api/recall/*` 全 404，UI 按钮可能报 snapshot
  失败。若 npm 版与本地并行（本机曾装 alpha.1 未发 npm），新旧并存时此症状
  只出现在新 dsh 环境。
- **复查动作**：dsh 升级后 `npm run verify:host` 必跑；若官方再次调整接入路径
  （如 installSection 改名/改签名），同步兼容分支与 verify-host 桩。
- **0.1.7-alpha.1 起整个 `SettingsProvider` 移除（已适配，双分支）**：`installSection`、
  `installSettingsSection`、`register` 全树零命中，导出面只剩 `SettingsForms`
  （`configure`/`describe`/`update`/`replace`/`mutate`/`writable`）；namespace 概念消失，
  读写按 **profile entry id**（`entry.options.id`）寻址，且只有 schema 标 schemastery
  `.volatile()` 的字段可写（无 volatile 字段的 entry 在 `describe()` 被跳过、写入抛
  `has no volatile fields`）——面换代与 volatile 门槛的完整台账见 **I39**。
  插件的三分支兼容在此环境下**全不命中且静默 no-op**（无异常、无日志，故 verify:host 桩
  若只提供 installSection 就会掩盖它）→ namespace 不注册、配置热更失效、
  `config-get`/`config-set`/`config-reset` 三条端点读写失效。**插件对策**：按运行时实例的
  **旧注册入口是否缺席**分派（`installSection`/`register` 任一在位即旧面，否则新面）——
  只按「`describe`/`update` 是函数」分不了流（旧面同样有它们），这条判据是 0.1.6 上
  「不变砖」的关键；新面不注册 namespace、挂 `loader/volatile-update` 热更（I39）。

### I31 slots.entries 快照与 slots.inject 回调执行时机（PR #13 动态避让依赖）
- **依赖的官方行为**：`conversation.chat.node` 的 priority 动态避让
  （`nextShadowPriority`）依赖三个官方语义：① `slots.entries(key)` 返回该槽位
  已注册条目的只读快照（稳定引用，render-erased 视图）；② 条目形状
  `StoredEntry`，priority 在 `entry.options.priority`（可选字段，缺失/非法按 0
  兜底）；③ `slots.inject(key, cb)` 的回调**在声明已存在时同步执行、否则延迟到
  声明 register() 提交后执行**——旧实现外层 try/catch 捕获不到延迟回调里的
  keyed 冲突异常，priority 递减重试实际从未生效（I1 的「冲突递减重试」在 inject
  延迟路径上是死代码，dsh-turn-fold 占 `-1` 即暴露）。guard 环境（0.1.2）下
  register 代理强制 allocatePriority 覆盖插件传入值（I29），动态计算值被丢弃但
  无害——避让的真实生效面是无 guard 的直连环境与官方未来尊重插件 priority 的
  场景。
- **出处**：`dsh-client-ui-renderer/lib/types/client/registry.d.ts`
  （`entries(key): readonly StoredEntry[]` L154；`inject` 文档注释「runs
  synchronously when the declaration already exists; otherwise it runs inside
  the declaring register() call」）；`StoredEntry` 本体声明内嵌于
  `dsh-cordis-client-runner/lib/client.js` 声明表（ui-slots 包不独立发布，
  `options: { key?, id?, order?, label?, priority? }`）；0.1.1-rc.2 等价面在
  `dsh-client-runtime/lib/types/client/slots.d.ts` L129（同签名，npm tarball
  核验）。
- **探针/单测**：`tests/probe/api-surface.test.js` 新增双包探测（entries 签名
  + StoredEntry options 形状）；`tests/unit/client-pure.test.js` 的
  `nextShadowPriority` 5 例（空 entries / 同 key 占用 / 连续冲突 / 非法值 /
  空形状容错边界）。
- **失效症状**：entries 删除/改名 → inject 回调内 TypeError 被 catch
  （console.error），撤回按钮不注册；StoredEntry.options 形状变化 → 计算退化
  （NaN/undefined 按 0 兜底），避让失效回到 keyed 冲突拒载。
- **复查动作**：dsh 升级后 `npm run test:probe`（新探针红即 entries/形状漂移）；
  若 guard 改为尊重插件 priority，动态避让成为主路径，需与 dsh-turn-fold 实弹
  复验共存。

### I32 载体无关路由：host 插件不得硬依赖 webServer（桌面端 composition 禁用该 row）
- **依赖的官方行为**：桌面端（DSH Desktop）复用 web 组合但禁用网络与浏览器启动行——
  `desktop.cordis.patch.yml` 对 `webserver`/`web-runtime`/`web-startup` 等 row 置
  `disabled: true`，`connection` row 保留并把 inject 覆盖为 `[credentials]`；
  `dsh-desktop-host` 取 `ctx.get('connection')` 后用 `createSharedFetchHandler('/api')`
  直接分发 `/api/*`。因此 host 插件把 webServer 写进顶层 inject 会让 fiber 永久
  pending（`waiting for service: webServer` → 「1 entry did not activate」整树加载失败）。
  API 路由必须走 connection 的载体无关 exact fetch 路由：route =
  `{ path: '/api/<...>', methods: ['GET'|'HEAD'|'POST'], requestBody: 'buffered' | 'streaming',
  fetch: (request: Request) => Promise<Response> }`——web 端由 client-connection 把 `/api`
  挂到 webServer、桌面端由 desktop-host 分发，客户端 URL 与方法两端一致。
- **注册生命周期（本项目踩点）**：`connection.fetch.register` 的本体挂在 connection
  插件 fiber 的 effect 上（实现里 `owner = this.ctx`，不是调用者），返回**异步
  disposer**。插件侧必须 `ctx.inject(['connection'], cb)`（可选注入，服务缺席不 pending，
  仅 Client API 降级不可用）+ `cb.effect(() => cb.connection.fetch.register(route))` 包裹，
  否则 HMR 重载会撞 `exact Fetch route ... is already registered`、卸载后路由残留。
- **出处**：`@deepseek-ai/dsh-desktop-host/config/desktop.cordis.patch.yml`（webserver
  `disabled: true`；connection 行覆盖 inject）；`dsh-desktop-host/lib/index.js` L337/L344/L379
  （`ctx.get('connection')` → `createSharedFetchHandler('/api')` → `/api/` 前缀分发）；
  `dsh-client-connection/lib/index.js`（`get fetch()` 的 owner 闭包、`registerFetchRoute`
  的 `owner.effect` 包裹与重复注册抛错）；类型面 `dsh-client-connection/lib/types/rpc.d.ts`
  （`ConnectionFetchRoute` / `HostConnectionFetch.register(): () => Promise<void>`）。
- **探针/单测**：`scripts/verify-host.mjs` 以 connection 桩断言——每端点一条 exact 路由、
  路由形状（methods 含 POST / requestBody=buffered / fetch 可调用）、fetch 分发响应 200
  且 body 带 `ok`、未知 path 404、卸载后注册清零（异步 disposer 由 cordis 等待）；
  `src/types/dsh-contract.ts` 按官方 `.d.ts` 建模消费面（HttpRequest/HttpResponse 已删）。
- **失效症状**：① webServer 加回顶层 inject → 桌面端 fiber 永久 pending、插件树加载失败
  （错误页 / 无撤回按钮）；② connection 改为硬 inject → 旧版 dsh 或未装配 connection 的
  部署同样 pending（现为可选注入，缺席时仅 Client API 不可用）；③ 忘记 effect 包裹
  register → HMR 重载报 route 已注册、或卸载后路由残留。
- **复查动作**：dsh 升级后 `npm run verify:host`（路由注册/形状/清零断言）；桌面端冒烟
  看启动日志无 pending；官方若新增 Fetch 路由约束（path 前缀、方法集），以
  `dsh-client-connection` 的 `assertFetchRoute` 源码为准同步。


### I33 seeded 会话的会话读取：readSession 恒抛，须降级 observeSession（撤回 fork 子会话误报「第一条用户消息」）
- **依赖的官方行为**：`sessionQuery.readSession` 内部以
  `Session.create(id, events, header, inheritedEventCount)` 做回放校验；官方 `Session` 构造器在
  快照模式（`Session.create` 装配）下要求 seeded 头 `inheritedEventCount === log.length`
  （「seeded session constructor seed must equal its inherited prefix」）。而读取面交给它的是
  全量逻辑日志——`snapshotLive` 走 `session.snapshotEvents()` 无参＝`slice(0, log.length)` 全量，
  冷读 `handle.read(0)` 返回完整存储日志（继承前缀物理存在）——inheritedEventCount 是 fork 时的
  前缀长度，两者必然不等，`readSession` 对任何 seeded 会话直接抛错。正确读取面是
  `sessionQuery.observeSession(id)`：经 `Session.fromRestore` 恢复（restore 模式无该约束），
  租约 `events` 为全量逻辑日志（含继承前缀）；读毕必须释放（`Symbol.dispose`，prepared 缓存项
  靠它减引用）。
- **项目踩点（2.3.13 → 2.3.14 修复）**：`resolveCutSeq` 此前把读取异常静默折成 null，与「真首条」
  不可分——在撤回 fork 出的子会话（本插件自己造的 seeded 会话）里点**任何**消息都显示
  「该消息是本会话中第一条用户消息」，重启/重装不恢复（确定性，非缓存）。真机实测（dsh web
  0.1.5-rc.2 + 插件走 `/api/recall/preview`）：修前子会话 6 条消息 cutSeq 全 null、父会话全部正常
  （43/62/88/156）；修后子会话 156/43/62/88/197、真首条（你好）仍 null，父会话不变。降级链：
  readSession →（抛错 / 事件里缺该消息）→ observeSession；只有「消息在、其前无 turn/end」不降级；
  两跳都失败才落到 null。
- **出处**：`dsh-session/lib/index.js`（构造器 seeded 校验；`snapshotEvents(fromSeq=0,
  toSeqExclusive=this.seq)` 全量语义；`ownEvents()` 前缀后切片）；`dsh-session-query/lib/index.js`
  （readSession 的 `Session.create(loaded.events, ...)` 校验、`snapshotLive`、
  `readColdSessionLog`、`observeSession` 租约）；`dsh-session-persistence-jsonl/lib/index.js`
  （handle.read 的 slice 语义、`inheritedEventCount` getter、`encodeMaterialization`）。
- **探针/单测**：`tests/unit/snapshots-cutseq.test.js`（抛错降级 / 缺消息降级 / 真首条不降级 /
  两跳失败保底 null / 旧版无 observeSession 维持原行为 / 租约释放与缓存命中）；真机验证＝
  `dsh web --no-open` 后 POST `/api/recall/preview`（本次核验即此法）。
- **失效症状**：seed​ed 会话（撤回子会话、或任何 fork 调用产生的会话）内撤回预览对全部消息都显示
  「该消息是本会话中第一条用户消息、无法回退对话」；文件回退仍可执行（cutSeq null 只是跳过对话
  回退），重启不恢复。
- **复查动作**：dsh 升级后跑 `npm test`（本档单测）；真机冒烟＝在撤回产生的子会话里对非首条消息
  preview，面板应显示「对话将一并回退」而非「第一条用户消息」；官方若修 readSession 或调整
  sessionQuery 读取面，以 `dsh-session-query/lib/index.js` 源码为准同步本降级链。
- **rc.2 增补（2026-09-24）**：`dsh-session-query/lib/index.js` 的 `SessionObservationReader.read()`
  在投影计算失败时新增显式抛出 `SESSION_QUERY_CORRUPT_SESSION`（rc.1 → rc.2，+7/−1 行；此前走静默路径）。
  该读取面的抛错语义因此扩大，插件既有降级链（readSession → observeSession）本就按「抛错即降级」处理、
  无需改码；若未来新增 `read()` 消费点，须沿用同一降级惯用法（勿裸调用）。


### I34 撤回回填的附件重建：readAttachment + createDrafts + addAttachments（探测式消费，全链降级）
- **依赖的官方行为**：撤回回填把被撤回消息的附件（image/file 块，均带 durable
  `attachment.attachmentId` 引用）也放回输入框，链路与官方 composer 的 `addFiles` 等价：
  1) `sessions.binding(sessionId).session.readAttachment(attachmentId)`——wire 调
  `remote.session.attachment({ sessionId, attachmentId })`，返回
  `{ attachment: { mediaType, ... }, data: Uint8Array }`（官方历史图片回显
  `HistoricalImageCache.loadCanonical` 同款调用）；
  2) `conversation.createDrafts(sessionId, files)`——浏览器 `File` → 运行时草稿附件
  （图片=object URL 预览，其他文件立即后台上传），返回按输入顺序的描述符；
  3) `shell.actions.addAttachments(ids)`（官方 composer 走 `shell.addAttachments`；
  未接纳返回 false 时 `conversation.releaseDraftAttachments(drafts)` 回滚）。
- **会话授权（本项目踩点）**：`readAttachment` 的 sessionId 是「消息所在会话」——被撤回消息
  不在 fork 出的子会话日志里，故插件在 execute 一开始用**源会话**早读字节（此刻源会话仍在册、
  归档尚未发生），fork + open 后再把 `File` 注册进**子会话**的草稿。直读子会话会拿不到授权。
- **出处**：`dsh-cordis-client-runner/lib/client.js`（ISession 声明：`readAttachment` 签名与
  `ImageAttachmentRef` 返回）；`dsh-api-session-controller/lib/types/client/sessions/session.js`
  （readAttachment 实现：`remote.session.attachment({sessionId, attachmentId})` + base64 解码）；
  `dsh-client-ui-conversation/lib/client.js`（`SessionInputShell.actions.addAttachments`、
  `ConversationController.createDrafts / releaseDraftAttachments`、composer `addFiles` 组合、
  `HistoricalImageCache` 对 readAttachment 的用法）。
- **探针/单测**：无直接探针——官方这些 client 面未随附 `.d.ts`（ui-conversation 无类型文件、
  session-controller 的 client 目录仅 `.js`），字段以源码核验；纯逻辑
  `attachmentRefsFromBlocks` / `defaultAttachmentName` 由 `tests/unit/client-pure.test.js` 钉。
- **失效症状**：撤回回填只回来文本、附件不回（服务面缺失时静默降级；不影响撤回主流程与文本回填；
  旧版 dsh 恒降级）。
- **复查动作**：dsh 升级后对照上述三处源码是否漂移（方法名、返回形状、`addAttachments` 的布尔
  语义、`createDrafts` 的 descriptor 形状）；真机冒烟＝对带图片的消息撤回，输入框应出现附件
  缩略图（smoke-checklist 可追加项）。


### I35 fork 切点携带 inbox 入队事件：撤回后被撤回的消息以「排队消息」复活
- **依赖的官方行为**：0.1.5 线的 `sessions.fork({ sessionId, atSeq })` 切点不是「切点事件本身」——host 侧
  取 `boundary = events.find(e => e.type === 'turn/end' && e.seq >= atSeq)`，再令
  `cut = boundary.seq + 1` 并**向后跳过非 `turn/start` 的事件**，seed = `events.slice(0, cut)`。
  于是「boundary 那条 turn/end 之后、下一个 turn/start 之前」的整段事件都会进入子会话。排队
  投递的用户消息，其 inbox 入队事件（`agent/inbox/spliced`，`target: 'next-turn'`，
  `data.inserted[].source.rpcId`）必然落在「上一个 turn/end」与「领取它的那个 turn/start」
  之间——正好落进该窗口。
  **0.1.6-alpha.1 起官方修复**：`cut` 固定为 `boundary.seq + 1`（不再向后推进），结束事件之后的
  排队输入、标题、模型设置均不入 seed——本坑在 0.1.6 线上从源头消失（实装产物
  `dsh-api-session-controller/lib/index.js` 确认；官方记载见 `.agents/notes/implemented/bug-fix/
  2026-09-11-session-controller-fork-turn-cut`）。peer 范围保留 0.1.5 线段，故下方插件对策在
  0.1.5 安装上仍必要，在 0.1.6 上退化为无害空操作。
- **症状**：撤回后 fork 出的子会话重放 seed 时重建出该 inbox 项，UI 的 QueueDock 在输入框上方
  显示一条与被撤回消息同内容的「排队消息」（与回填的草稿重复）。日志实证：父会话 seq 93
  `turn/end` → 94 入队（`rpcId 4aa8cdb6`）→ 95 `turn/start` → 96 领取后移除 → 100
  `user/message` 落日志；子会话 seed 恰止于 94，重放出同一入队项。
- **插件对策**：Host 侧 `scanStaleQueueItemIds` 扫窗口内 inbox 入队项、取 user 来源项的
  `item.id`（即该消息的 message id，也是 `updateQueue` 的寻址键），经 execute 响应的
  `staleQueueItemIds` 下发；Client 侧对子会话逐项调官方 `updateQueue(itemId, { kind: 'remove' })`
  直删（等价 QueueDock 的「删除排队消息」）。不读队列快照、不做匹配——快照走 control 帧、到达
  时机不定，命中式等待会整段落空（2.3.19 真机复现：30 秒窗口内卡片始终在，清理从未触发）；
  入队项若已被消费，`updateQueue` 返回 `queue-item-not-found`，逐项吞掉即可。
- **出处**：`dsh-api-session-controller/lib/index.js`（fork 的 boundary/cut 推进；
  `updateQueue` 以 `agent.inbox.nextTurn.find(message => message.id === request.itemId)` 寻址）；
  `dsh-api-session-controller/lib/types/client/contract/session.d.ts`（`ISession.updateQueue`、
  `SessionFace = ISession & ObservableSnapshot<SessionSnapshot>`）；`dsh-client-ui-conversation/lib/client.js`
  （QueueDock 读 `session.getSnapshot().queue`）；`agent/inbox/spliced` 的 `inserted[].id` ≡ 该消息
  `user/message` 的 id，由本机会话日志解压实证（0.1.5-rc.1）。
- **探针/单测**：`tests/probe/api-surface.test.js`「sessions.fork 切点语义」3 例直钉构建
  产物锚点（boundary 解析 / cut 固定切分 `boundary.seq + 1` / seed 前缀切片）——0.1.6-alpha.1
  起 cut 锚点钉新语义，官方若回退到向后推进即红（残留复活信号）；纯逻辑 `scanStaleQueueItemIds` /
  `resolveStaleQueueItemIds`（含读取链顺序：内存 `snapshotEvents` → `observeSession` →
  `readSession`）由 `tests/unit/snapshots-queue-residue.test.js` 钉 9 例，执行链响应字段由
  `tests/unit/routes-stale.test.js` 钉。
- **失效症状**：三跳读取全失败（冷会话 + restore 不可用）→ 不清理，残留排队消息仍显示（用户可在
  QueueDock 手动删除）；会话面未就绪（`binding`/`updateQueue` 缺失）→ 5 秒后 `console.warn` +
  toast 提示手动路径；撤回与回填主流程不受影响。
- **复查动作**：fork 的 cut 规则变化时上述探针即红（0.1.6-alpha.1 的固定切分即按此信号完成改钉；
  若官方回退向后推进，本清理重新生效、无需改码）；真机冒烟＝对「agent 运行中发送、随后被撤回」
  的消息撤回，输入框上方不应出现排队消息（0.1.6-alpha.1 起为官方根治的正向确认）。


### I36 win32 下 `ctx.shell` 的方言不受插件控制：pwsh 模板 ⇄ pwsh 执行器之间无契约保证（issue #15）

- **依赖的官方行为**：官方 shell 能力是**提供方注册制**——一个 composition 恰好一个 `ctx.shell` 实现
  （bash-local / bash-sandbox / pwsh-local / pwsh-sandbox 四选一，挂两个会因服务重复注册抛错），
  win32 层的 profile 可以把它配成 **bash**（如只启用 `bash-sandbox`、禁用 `pwsh-sandbox`）。而
  `ShellExecutor` 的公开面只有 `resolve(request)` / `run(spec)` / `start(spec)` 与 `sandboxMode`
  getter，`ShellExecRequest` / `ShellRunResult` 里**没有任何「我是 bash 还是 pwsh」的字段**——方言
  不可查询。插件按 `process.platform` 单选 pwsh 模板，与宿主实际执行器之间没有任何契约约束。
  **0.1.7-alpha.1 起公开面变为 `resolve(request)` / `execute(spec)` 两方法**（`run`/`start` 抽象方法
  已删除，官方消费方统一 `(await ctx.shell.execute(spec)).result()`）——方言字段依旧不存在，探针式
  对策继续成立；执行接缝本身的双分支与失败分级见 **I38**。该断点在 POSIX 上会使整条 shell 链路抛
  `shell.run is not a function`（win32 因探针抛错后判 bash 走自建直连通道而侥幸可用），
  **已在 2.3.25 落地双分支适配**（`run 优先 → execute 兜底`，两分支共用 spec 构造与失败分级）。
- **症状**：这类宿主上 pwsh 模板被 bash 执行，第一行编码前导即语法错误
  （`bash: -c: line 1: syntax error near unexpected token '('`），`ensureGit` 起每一步都失败——
  快照从未成功、撤回按钮不可用，win32 上功能面整个死亡（issue #15 实测：dsh 0.1.6-alpha.1 + Windows 11）。
- **插件对策**：行为探针判方言 + 判成 bash 时改走 Node `spawn` 直连。探针为内联的
  `Write-Output <罕见 ASCII 哨兵>`（pwsh 侧 exit 0 且回显哨兵即判 pwsh；非零退出——bash 下
  command-not-found 即 127——或无输出或 reject 一律判 bash），结果按进程缓存并以 in-flight promise
  去重（突发 `session/event` 只探一次）、走独立路径不触发失败清扫、不带 UTF8_PRELUDE、30s 短超时；
  POSIX 不探测（bash 模板与 bash 执行器天然一致）。直连通道用
  `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -Command <单 argv>`
  （PS 5.1 全平台自带，不赌 PS7；模板本就按 5.1 兼容写，见 I14/I27），保留四项官方语义：stdin 字节
  透传（I27 的 `Console.In` 代码页坑由字节流绕开）、stdout 截断标记（F-G3，loadIndex 据它区分截断与
  损坏）、超时 `child.kill()`、非零退出仍走 `cleanupAfterGitFailure`；env 复刻官方清洗（凭证形状名 +
  全部 `DSH_*`，再叠 `NO_COLOR`/`PAGER`/`GIT_PAGER`），cwd 取 `sandboxPolicy.workspaceRoot || process.cwd()`。
  带 `RECALL_CLEANUP` 哨兵的失败清扫脚本**不触发探针**、只读缓存（它只在一条真实命令失败后被调用，
  方言早已判定；未判定时按 pwsh 走官方通道）——善后路径不再叠一条探测进程。
- **出处**：`dsh-shell/lib/types/index.d.ts`（`ShellExecutor` 公开面：resolve/run/start + sandboxMode，
  无方言字段）；`dsh-pwsh-local/lib/index.js`（候选链末档 `System32\WindowsPowerShell\v1.0\powershell.exe`、
  argv `-NoLogo -NoProfile -NonInteractive -Command <单 argv>`、`ENV_OVERRIDES`）；`dsh-subprocess/lib/index.js`
  （`SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i`、`key.toUpperCase().startsWith("DSH_")`）；
  issue #15（报告者实测 Git Bash 宿主下方言冲突）。
- **探针/单测**：`tests/probe/api-surface.test.js`「win32 shell 方言与执行接缝」4 例（ShellExecutor 无方言字段
  且抽象面只有 `resolve`/`execute`（断言「无 `abstract run(`」——官方若把 `run` 加回来即红，提示重估双分支
  判据优先级）；`ShellExecution.result()` 与可空 `exitCode`/`timedOut`；直连复刻的三项官方事实：PS 5.1 候选
  路径 + argv 旗标 + env overrides；env 清洗口径）；
  `tests/unit/store-shell-dialect.test.js` 31 例（判定/收集/清洗/路径四个纯函数 + 假 child 覆盖 stdin
  字节透传、截断、超时 kill、spawn error + 分流接线：pwsh 方言零触达 spawn、bash 方言走直连且官方
  通道只跑探针那一次、in-flight 去重、POSIX 不探测、清扫脚本不探测、直连失败仍走清扫）；
  `tests/unit/store-shell-execute.test.js` 10 例（两代执行器分流、`result()` reject 原样上抛、
  `exitCode === null` 分级、截断透传、新面在 POSIX 上走得通）。
- **失效症状**：探针误判 pwsh 为 bash → 走直连通道（pwsh 模板同样能跑，功能不受影响；代价是绕开
  官方托管环境——无 `dshEnv`/PATH 注入、无进程树级终止，宿主崩溃可能留下孤儿 git 与陈旧锁，靠 M3
  心跳/陈旧锁分级清扫自愈）；探针误判 bash 为 pwsh（bash 意外能回显哨兵）→ 维持原状（功能死）；
  直连可执行文件缺失 → `spawn` reject → 命令失败并进「最近错误」。
- **复查动作**：dsh 升级后确认 `ShellExecutor` 仍无方言字段（有则改读字段、探针与探测命令一并退役）
  且官方 pwsh 候选路径/argv/env 清洗未变——上述 4 条探针自动盯防；接缝面同看 I38（公开面 = `resolve` +
  `execute`，`run`/`start` 缺席）；实弹按
  `docs/plans/pending/plan-shell-dialect-win32.md` 验收 3「profile 只启用 bash-sandbox」全链复跑。


### I37 0.1.6-alpha.2 移除 `ISessions.open`：会话导航归 uiWorkspace，且 `sessions.list` 含归档会话

- **依赖的官方行为**：`ISessions` 在 0.1.6-alpha.2 不再暴露 `open(sessionId)`（契约注释「navigation
  belongs to view owners」），只留 `list` 快照与引用模型 `retain`/`using`/`retainInfo`。会话导航归
  `UiWorkspace`（服务 key `uiWorkspace`，包 `dsh-client-ui-workspace`）：`openSession(target:
  SessionTarget)`——`SessionTarget = SessionId | SubagentAddress`（两者都是裸 id，官方 UI 亦以裸
  sessionId 调用）→ 内部 `replaceMain` = `sessions.retain(target, { source: 'mainView' })` +
  `selection.set({ sessionId })` + `layout.selectPanel(null)`。**已归档会话不是合法的主视图选择**：
  `clearArchivedCurrent()` 在 `archivedSessionIds` 命中当前选择时 `clearMain()`，视图落「选择一个
  工作区开始」空态。`ctx.workspaces`（IWorkspaces）只有 `archiveSession`/`unarchiveSession`，无导航
  方法——导航必须走 `uiWorkspace`。
- **症状（修复前）**：撤回 execute 成功、fork 与 lineage 落盘正常，但子会话不打开——页面停在「选择
  一个工作区开始」空态。根因是原调用的 `sessions.open` 在 alpha.2 已不存在，`typeof` 守卫静默跳过
  （合规清单 #8 的又一实证：字段本不存在时守卫只是 no-op，功能死掉且零报错）。
- **插件对策（导航）**：`inject` 声明 `uiWorkspace`（0.1.2-alpha.1 起该服务存在；0.1.1-rc.2 无此服务，
  该线段已从 peer 范围移除，见下方「服务可用性」）、`ctx.uiWorkspace` 类型化；导航处双版本分支——
  `uiWorkspace.openSession(id)` 优先，旧版回退 `sessions.open(id)`。**旧版回退已实弹**：alpha.1 上两个入口
  并存，走 uiWorkspace 分支正常打开子会话（2026-09-18 记录）。
- **插件对策（闸门）**：「切换」按钮的判据是「在 `sessions.list.byId` 里**且**不在归档集合里」——归档集合
  从 `ctx.workspaces.list.getSnapshot().archivedSessionIds` 读（`ClientWorkspacesService` 补 `list` 面，
  服务经 `buildSettingsCards` 传入快照管理卡）。只靠 `sessions.list` 会在 alpha.2 上放行归档会话：点击后
  官方把归档选择清空，视图落空态。
- **出处**：`dsh-api-session-controller/lib/types/client/contract/sessions.d.ts`（`ISessions` 无
  `open`、`SessionTarget` 定义）；`dsh-client-ui-workspace/lib/types/client/navigation.d.ts`
  （`UiWorkspace.openSession`/`openWorkspace`/`archiveSession`）与同包 `lib/client.js`
  （`replaceMain`/`clearArchivedCurrent`、官方 `open = (sessionId) => uiWorkspace.openSession(sessionId)`）；
  `dsh-api-workspace-controller/lib/types/client/model.d.ts`（`WorkspaceSnapshot.archivedSessionIds`）。
- **服务可用性（各版本线 registry 实证，2026-09-18）**：`dsh-client-ui-workspace` 的 registry tarball 逐版核验
  ——`0.1.1-rc.2` 的产物里**没有** `uiWorkspace` 服务（`super(ctx, "…")` 零命中、`uiWorkspace` 字样零命中），
  故该版本线的静态 inject 无法满足（该线同时缺 `sessions`/`workspaces`：`dsh-api-session-controller`/
  `dsh-api-workspace-controller` 与 `dsh` 都没有 0.1.1-rc.2 发布版）——**这是声明前既有状态**，非本批次引入；
  `0.1.2-alpha.2` 起有 `uiWorkspace` 服务但**无 `openSession`**（该线导航走 `sessions.open` 回退分支，
  `ISessions.open` 到 0.1.6-alpha.1 都还在）；`0.1.5-rc.2` 起 `openSession` 在位。dsh 实际发布版本里
  0.1.2-alpha.1 与 0.1.3-alpha.1 不存在（首个为 0.1.2-alpha.2 / 0.1.3-alpha.2），peer 区间下界沿旧标注。
- **探针/单测**：`tests/probe/api-surface.test.js`「会话导航归属」2 例（`ISessions` 无独立 `open(` 方法
  且 `retain(target: SessionTarget)` 在位；`uiWorkspace.openSession(target: SessionTarget): void` 在位）。
- **失效症状**：未声明 `uiWorkspace` 时 cordis 解析不到该服务（I29 门禁）→ 回退分支调不存在的
  `sessions.open` → 撤回后子会话不打开；对归档目标调 `openSession` → 视图被清空为空态（「切换」路径，
  闸门判据漏掉归档集合时即现）。
- **复查动作**：升级后跑上述探针；官方若恢复 `ISessions.open`、或 `openSession` 改名改签名，探针即红。
  实弹＝撤回一条非首条消息后确认子会话自动打开且标题继承，以及「切换」只对未归档会话渲染、点击后正常
  打开该会话。


### I38 shell 执行接缝换代：`run`/`start` → `execute(spec).result()`，且 `exitCode` 可为 null
- **依赖的官方行为**：0.1.7-alpha.1 起 `ShellExecutor` 的前台执行面是
  `resolve(request): ShellExecSpec` + `execute(spec): Promise<ShellExecution>`，结果经
  `ShellExecution.result(): Promise<ShellRunResult>` 取（按需创建、记忆化）；`run`/`start` 抽象方法被
  删除。语义要点（决定失败分级怎么写）：`result()` **只在基础设施失败**（spawn 未产出进程）时 reject，
  非零退出/超时 kill/abort kill 一律 resolve 并以 first-cause 标 `timedOut`/`aborted`、回显生效的
  `timeoutMs`；`exitCode: number | null`（null = 准备期超时或信号终止）；`stdout`/`stderr` 仍是
  `CollectedOutput { text, truncated, spillPath? }`（F-G3 的「读截断 ≠ 内容损坏」判定不受影响）；
  `sandboxPolicy: { mode: 'danger-full-access', workspaceRoot }` 仍是合法形态。
- **出处**：`dsh-shell/lib/types/index.d.ts`（`abstract resolve(...)` / `abstract execute(...)`，无
  `abstract run(`）、`dsh-shell/lib/types/types.d.ts`（`ShellExecution extends ShellProcess` +
  `result()`、`ShellRunResult.exitCode: number | null` / `timedOut: boolean`）；
  `dsh-tool-pwsh/lib/index.js` 官方消费方形态 `const result = await (await ctx.shell.execute(ctx.shell.resolve({...}))).result()`。
- **插件对策**：`src/host/store.ts` 新增 `runViaExecutor(shell, spec)`——按**运行时方法探测**分流
  （`typeof shell.run === 'function'` → 旧通道；否则 `execute` + `result()`），两分支共用同一 spec 构造
  与同一失败分级。为什么按方法探测而非包版本：宿主注入的是它自己的执行器实例，插件 `node_modules` 里的
  dsh-shell 版本与运行时无关；peer 保留 0.1.2–0.1.6 各线段（老用户仍可能装），单路径等于把老用户全断。
  失败分级：`exitCode` 为 `null` 且无 stderr（或 first-cause `timedOut` 在场）→ 文案「命令准备期超时」；
  有 stderr / 非零退出 → 回显 stderr 原文（无 stderr 时由 `throwShellFailure` 落 `exit <code>`），
  两类文案各自可读且 `diagnostics.classifyEnvError` 的环境错误分类保持可命中。
- **探针/单测**：`tests/probe/api-surface.test.js`「win32 shell 方言与执行接缝」中的 2 例（抽象面无
  `run`/`start`；`ShellExecution.result()` + 可空 `exitCode`/`timedOut`）；
  `tests/unit/store-shell-execute.test.js` 10 例（旧/新执行器分流、spec 逐字透传、两代都缺时响亮报错、
  `result()` reject 原样上抛、两分支 `truncated` 透传一致、**新面在 POSIX 上走得通**（本轮硬指标：
  旧调用在此必 TypeError）、`exitCode === null` 归超时 / 有 stderr 归非零退出）。
- **失效症状**：POSIX 上 `shell.run is not a function` → 建仓/快照/diff/回退/gc/索引读写全部失败、
  撤回不可用（win32 上被自建直连通道掩盖，只表现为误导日志与失去官方通道语义）；新面下若漏判
  `exitCode === null`，超时会被报成 `exit null` 这类不可读文案且丢掉诊断分类。
- **复查动作**：dsh 升级后跑上述探针（抽象面变化即红）；实弹＝win32 与 WSL 各跑一轮撤回全链，且
  启动日志应为 `recall shell dialect probe: pwsh`（0.1.7 上判成 bash 即是接缝未走通的信号）。


### I39 settings 面换代：`SettingsForms` + profile entry id 寻址 + volatile 门槛（0.1.7-alpha.1）
- **依赖的官方行为**：0.1.7-alpha.1 起 `ctx.settings` 是 `SettingsForms`，整个 `SettingsProvider` 移除
  （I30 末段）；**ns = profile entry id**——`write/update/replace` 经
  `configEditor.entries().find(row => row.options.id === ns)` 定位（找不到抛 `No configurable plugin entry "<ns>"`），
  `describe()` 报 `ns: entry.options.id` 并跳过 `entry.fiber` 未就绪（`state !== 2`）的条目；
  **可写门槛 = schema 标 schemastery `.volatile()`**（`volatileForm` 读 `schema.meta.volatile`，
  无 volatile 字段的 entry 在 `describe()` 直接跳过、写入抛 `Plugin entry "<ns>" has no volatile fields`）。
  热更链路：`cordis-plugin-loader` 的 `Entry.update → _commitVolatile` 把新值 commit 进运行中 fiber 的
  ref（`updateVolatile`），再经**只对目标 fiber 可见**的上下文派发 `loader/volatile-update(paths)`
  （`self[Context.filter] = (owner) => owner.fiber === fiber`）——所以插件只能在**自己 ctx** 上监听。
  另两条运行时可访问面事实：`Context.fiber` 在 cordis 上增补、`Fiber.entry` 由 loader 增补
  （**可选**：无 Loader 挂载时缺席，消费侧必须判空）。
- **出处**：`dsh-settings/lib/index.js`（`var SettingsForms = class extends Service`、`entries().find(row => row.options.id === ns)`、
  `ns: entry.options.id`、`volatileForm` 的 `schema.meta.volatile` 判据与两条错误文案）；
  `cordis-plugin-loader/lib/index.js`（`_commitVolatile`：`volatileEntries(fiber.config)` → `updateVolatile(ref, source)`
  → `fiber.ctx.emit(self, "loader/volatile-update", paths)`）与其 `lib/types/index.d.ts` 的
  `interface Fiber { entry?: Entry }`；`lib/types/config/entry.d.ts`（`options.id` = 「Stable id inside the
  containing entry tree」、`get id()` 带父 tree 前缀）。**本机实测（2026-09-22，0.1.7-alpha.1 link 模式）**：
  插件的 profile 行 id 是 bundle patch 的 insert 行 id **`recall`**（`include:recall` 的局部 id），
  `entry.options.id` 即它；apply 期 `describe()` **看不到自身**（fiber 仍 LOADING，实测 11 条不含 recall），
  boot 落定后 17 条含 `recall`；`config.flag` 在 apply 期就是 `Volatile` ref（`{ get() }`）。
- **插件对策**：`src/host/config.ts` 三个模块级纯函数——`withVolatile(field)`（`.volatile()` 只有
  schemastery ≥3.18.3 才有，0.1.6-alpha.2 随装 3.18.2，故 **feature-detect**，探不到原样返回）、
  `resolveSettingsNs(ctx, settings)`（旧面 → 注册字面量 `dsh-recall`；新面 → 候选按 `entry.options.id`
  → `entry.id` 与 `describe()` 的 ns 集合求交集，交集为空时回退 `options.id`（apply 期 describe 看不到
  自身是常态，不是「新面不可用」），无 entry 又非旧面 → `null`）、`unwrapConfig(raw)`（Volatile ref 用
  duck-type `typeof v.get === 'function'` 解一层——不引入 cosmokit 依赖；`applyResolvedConfig` 与 **apply
  初始 cfg** 两处都要解，否则用户覆盖值被静默读成默认值）。`src/host/index.ts` 分派判据是「旧注册入口
  缺席」（见 I30）；新面挂 `ctx.on('loader/volatile-update', () => applyResolvedConfig(config))`
  （apply 拿到的 `config` 就是 `fiber.config` 同对象，ref 被 commit 后重读即得新值）。`routes-manage` 的
  `config-get/set/reset` 一律用解析出的 ns，未解析到时按 `RECALL_SETTINGS_UNAVAILABLE` 报逃生口文案。
- **探针/单测**：`tests/probe/api-surface.test.js`「settings 面换代」3 例（导出面只剩 `SettingsForms`
  且 `installSection`/`register` 零命中；ns = profile entry id 的两处匹配式；volatile 门槛与两条错误文案）
  +「volatile 热更链路与运行时可访问面」3 例（`loader/volatile-update` 的 dispatch 与按 fiber 过滤；
  `Fiber.entry` 增补形状；`Entry.id`/`options.id` 双形态）；`tests/unit/settings-bridge.test.js` 24 例
  （`withVolatile` 两态、旧/新面判据、ns 解析六种路径含「旧面回退不得误用 options.id」、`unwrapConfig`
  解 ref/数组/嵌套、routes 级 config-get/set/reset 在两代面下都用解析出的 ns 与 ns 缺失时的错误码文案）；
  `verify:host` 断言 7（只给新面的桩也必须装配成功且 ns 贯通到端点读写）。
- **失效症状**：旧接线在新面上静默 no-op（无异常无日志）→ namespace 不注册、设置卡片读不到覆盖字段、
  保存与恢复默认必失败（`No configurable plugin entry "dsh-recall"`）；volatile 漏标 → entry 在
  `describe()` 里不可见（卡片空/只读）；`unwrapConfig` 漏点 → 配置「读成默认值」（用户改了不生效）；
  ns 解析错面（旧面误用 options.id）→ 0.1.6 上写入必失败。
- **复查动作**：dsh 升级后跑上述探针（导出面/匹配式/volatile 判据/事件名/`Fiber.entry` 任一漂移即红——
  这些漂移在运行期都是静默失效，正是本轮被自建桩掩盖的同类面）；实弹＝0.1.7 上设置页保存若干字段
  → 立即生效（volatile 热更，无重载日志）→ 恢复默认 → 重启复查持久化；旧版回归＝0.1.6-alpha.2 上
  卡片照常可写（双分支旧路径未破坏）。


### I40 子路径部署：服务端路径必须按 `document.baseURI` 解析（0.1.7-rc.1 官方支持）
- **依赖的官方行为**：0.1.7-rc.1 起官方支持「Web 挂在反向代理子路径」，做法是三件事同时成立——
  ① `dsh-host-frontend-static` 在每次 index 响应上注入 `<base href="./">`；② 前端产物资源改**相对引用**
  （`./assets/…`，此前是根绝对）；③ 客户端把服务端路径按**文档基址**解析：`dsh-api-gateway` 的
  `new URL(REMOTE_STREAM_MUX_PATH.slice(1), globals.__DSH_TRANSPORT__?.streamBaseUrl ?? document.baseURI)`，
  连接 RPC 则直接以**去前导斜杠**的相对路由 POST（`` `${channel}/${endpoint}`.slice(1) ``，契约注释
  「Receives the document-relative route so a carrier resolves it against its own base」）。因此根绝对
  路径 `/api/…` 会越过子路径前缀打到代理未映射的根——这是插件端点路径必须跟进的硬理由。
- **出处**：`dsh-host-frontend-static/lib/index.js`（`<base href="./">` 注入，0.1.7-alpha.2 即存在、rc.1 未变）；
  `dsh-web-frontend/dist/index.html`（`./assets/…` 相对引用，rc.1 相对 alpha.2 的唯一实质差异即此）；
  `dsh-api-gateway/lib/client.js`（`streamBaseUrl ?? document.baseURI`）；`dsh-client-connection/lib/client.js`
  （相对路由 POST）。
- **插件对策**：`src/client/util.ts` 的 `recallApiUrl(name, base?)`——以 `document.baseURI` 为基址解析
  `api/recall/<name>`；基址缺尾斜杠时按目录补齐（用户直接敲 `/dsh` 时 `dsh` 不会被当成文件名吞掉前缀）；
  无 `document`（非浏览器）或基址非法时回落原根绝对路径，旧行为不倒退。`api()` 是唯一调用点，已改走它。
  **Host 端零改动**：代理剥前缀后宿主见到的仍是 `/api/recall/*`，exact 路由照常命中（实弹 200）。
- **探针/单测**：`tests/probe/api-surface.test.js`「子路径部署的服务端路径基址」3 例（`<base href="./">` 注入、
  前端资源相对引用且无根绝对引用、官方客户端 `document.baseURI` 解析）；`tests/unit/client-pure.test.js`
  「端点路径的基址解析」5 例（根/子路径/多级子路径/缺尾斜杠/非法与无 document 回落 + fetch 桩钉住调用点 URL）。
- **失效症状**：子路径部署下插件 UI 正常渲染（按钮在），但每次调用失败——`/api/recall/*` 落到代理根
  返回 404（页面表现为提示「网络/请求失败」类文案），预览、撤回、快照管理、设置卡片全部受影响；
  根部署（代理前缀为空）下两种解析等价，无感知。
- **复查动作**：dsh 升级后跑上述探针（`<base>` 注入消失、前端资源改回根绝对、官方改回 document 相对之外的
  基址口径，任一漂移即红→读本条重估）；实弹＝把 web 前端挂在 `/dsh/` 前缀反向代理后（仅映射该前缀），
  插件端点请求须落到 `/dsh/api/recall/*`。**2026-09-24 实弹记录**（0.1.7-rc.1，`node` 子路径代理 +
  `--trusted-host`）：带前缀 `POST /dsh/api/recall/status` → 200（`{"ok":true,…}`）、根绝对
  `POST /api/recall/status` → 404（代理未映射），修复后源码产出的 URL 经代理实测 200。


### I41 PowerShell 静默错误仍置退出码 1：读缺席文件必须显式收成成功（2026-09-30 实弹）

- **依赖的官方行为**：dsh 的 shell 执行面（`ShellExecutor.execute` → `ShellExecution.result()`）以**进程退出码**判定成败，
  非零即视为执行失败抛给调用方（既有约定，见 I14/I38）；这条判定对「命令自己吞掉了报错」的情形同样生效。
- **环境事实（win32）**：`Get-Content -LiteralPath <缺失路径> -Raw -Encoding UTF8 -ErrorAction SilentlyContinue`
  **退出码为 1**——`-ErrorAction SilentlyContinue` 只吞掉错误*文本*，不改进程退出码（pwsh 7 与 Windows PowerShell 5.1
  实测同款，静默读目录占位同样置 1）。POSIX 侧无此问题（`cat … 2>/dev/null || true` 天然归零）。
- **插件对策**：`fileReadCmd`（A3 起通用小文件读取，`src/host/scripts.pwsh.ts`）用 `if (Test-Path -LiteralPath <f>) { Get-Content … }`
  分支让缺席路径以成功的末条命令收尾（退出码 0、无输出），与 POSIX 版逐字同语义；`tests/unit/scripts-contract.test.js`
  有文本钉（两侧形态各一条断言）防回归。
- **失效症状（修复前实证）**：A3 格式守卫首次调用即把**没有任何 marker 的正常 store** 判成「读不到」（`judgeStoreFormat`
  的 `unreadable` 分支只认 null），启动日志出现 `recall store format blocked: 磁盘格式标记不可读或内容非法…`；
  由于守卫同时挡在 `captureSnapshot` 与 `saveIndex` 上，补戳永远写不下去 ⇒ **快照、撤回、列表载入全停且不可自愈**
  （win32 专有；POSIX 正常）。同一坑还会让 A2 的 intent journal 读取把「文件不存在」与「读失败」混为一谈。
- **复查动作**：dsh 升级或 PowerShell 大版本变化后，跑 `npx vitest run tests/unit/scripts-contract.test.js`（文本钉）
  与一次 win32 实弹冒烟（首次快照后检查 store 目录出现 `format=1`）；若 PowerShell 未来改掉「静默错误置 1」的行为，
  文本钉会提示可以简化回单命令形态。细节与实证见 [plans/completed/plan-quality-hardening.md](plans/completed/plan-quality-hardening.md)
  的「活体冒烟」节与 [plans/completed/smoke-checklist-records.md](plans/completed/smoke-checklist-records.md) 的 2026-09-30 节缺陷 1。


## 与 E1 verify-host 的对应关系

装配层条目（I10 inject 门禁、端点注册、Config schema、卸载清零）由
`scripts/verify-host.mjs` 机器化断言；自 0.1.7 适配起该脚本跑**两个 pass**（旧面桩 +
「只给新面（无 `installSection`）」的桩），后者专治本轮的实际教训——自建桩同时提供
两代面时旧三分支先命中、新面从未被走通，换代被自家桩掩盖（I30/I39）；字段层条目（I2/I6/I8 等）由 `tests/probe/`
字段探针断言；纯逻辑与脚本契约由 `tests/unit/` 断言。矩阵里「探针/单测」标注
`无直接探针` 的条目即为测试缺口，dsh 升级后优先补。
