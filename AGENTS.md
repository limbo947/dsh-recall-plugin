# AGENTS.md

给 AI 编码代理（和快速上手的人类）的项目速览。读完本文件即可定位任意改动的落点。

## 一句话理解

DSH 消息撤回插件：在用户消息气泡旁加「撤回」按钮，把**项目文件**（独立影子 git 仓库快照）与**对话历史**（官方 sessions.fork）一并回退到该消息发送之前。npm 包 `dsh-recall-plugin`，Node ≥ 20，ESM。

## 核心机制（三个关键词）

1. **影子仓库**：每个工作区在 `~/.dsh/dsh-recall-snapshots/<工作区路径SHA256>/git/` 有独立 git 仓库，`--work-tree` 指向项目目录——项目零污染（无 .git、无快照落地）；home 不可写时降级到项目内 `.dsh-recall-snapshots/`。无 tag 可达的残骸仓库（快照在 `add` 与打 tag 之间失败留下）由 gc 前的条件清理回收：`for-each-ref` 空且 `ls-files` 非空时先 `read-tree --empty` 再 gc——否则 index 条目让这批 blob 对 prune 伪可达，gc 一个对象都回收不掉（issue #18，实证见 [docs/plans/completed/plan-build-root-guard.md](docs/plans/completed/plan-build-root-guard.md)）。「立即 gc」逐仓 gc 后还有空仓目录回收：`index.json` 明确为空数组、无 `snap-*` tag、内存无对应快照三条件全中的 store 目录整棵删掉；index 缺失/损坏（entries 为 null）的隔离现场一律保留。
2. **tag 即快照**：每条用户消息触发一次 `write-tree + commit-tree + tag snap-<消息ID>`，不建分支、不动工作区。消息 ID 即快照主键，索引丢失可从 tag 名反推重建（`rebuildOrphans`，时间从 tag creatordate 恢复）。index.json/lineage.json 走 tmp+rename 原子写；index 损坏时 fail-loud——改名 `.corrupt-<ts>` 隔离并告警，不静默当空。**工作区根自身命中基础排除表的目录形态项**（`…/target/debug`、`dist`）时不建快照：排除模式相对 root，永远匹配不到 root 自己，而这类目录没有回退价值（issue #18；`captureSnapshot` 在 `resolveStore` 前早退，init/snapshot-info 下同一条提示，逃生口＝删掉排除表对应项）。
3. **双轨回退**：文件走影子仓库 reset 到 tag；对话走官方 `sessions.fork({ atSeq: cutSeq })`——cutSeq 是该消息之前最近一次 `turn/end` 的 seq。
   - **scope 二选一**（缺省/非法回落 both）：both 为下述全链；`session-only` 走零 git 短路径——不进串行队列、不打安全快照、不 reset，仅保留 NO_SNAPSHOT/AGENT_BUSY 护栏后取切点返回 `count: 0`（确认面板 radio 二选一，cutSeq 为 null 不出选项）。
   - **归档与标题**：原会话归档（可恢复，`archiveOriginal` 可关；**归档必须带 `stopActivity`**——官方对「有活动在跑」的会话默认拒归档，而 jobs 作业结算不受抑制、会把已回滚的原会话唤醒开新一轮）；新会话继承原标题（不传 `increaseTitle`，避免「xxx 2」递增）。
   - **安全快照与 lineage**：both 的 execute 先打安全快照 `snap-pre-rollback-<ts>`，回退失败自动 reset 救援（H1）；fork 关系经 `lineage-record` 持久化进 lineage.json，快照管理按「版本家族」聚族（F1）。
   - **队列清理（G1）**：fork 的切点从 `turn/end` 推进到下一个 `turn/start`，会把被撤回消息的 inbox 入队事件带进子会话 seed——输入框上方凭空多一条排队消息，子会话被驱动时还会当作真实一轮消费；故 execute 顺带下发 `staleQueueItemIds`（窗口内入队项的 message id），Client 在子会话上按 id 直调官方 `updateQueue(itemId, { kind: 'remove' })` 清掉。不做队列快照匹配——快照走 control 帧、到达时机不定，命中式等待会整段落空。

## 项目架构与文件地图（改动先看这里）

源码全部在 `src/`：Host 半（`src/host/`，Node ESM TypeScript）按域拆成 ctx 绑定的工厂模块（无模块级可变状态），由 `src/host/index.ts` 装配；Client 半（浏览器）源码在 `src/client/`；跨域共享类型在 `src/types/`（仅类型导出）。`lib/` 是**纯构建产物目录**——`npm run build` 经 esbuild 转译/打包生成（16 个 host 产物 + client.js），勿直接编辑。

| 文件                              | 职责                                                                                                                                                                                                                                                                    | 什么时候改它           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `src/host/index.ts`             | Host 入口（`name`/`inject`/`Config`/`apply`）：装配域模块、注册 `/api/recall` 载体无关 exact 路由（connection fetch 注册表，端点表 = routes-core + routes-manage）、settings namespace `dsh-recall`（`installSettingsSection`/`installSection` 双版本接线 + watch 热更 cfg）、`session/event` 触发快照与启动预热、端点共享辅助（enqueue / agentBusy / dumpStores / locateSnapshotOnDisk / collectAllSnapshotRecords 等） | 加接线、改事件触发、改共享辅助  |
| `src/host/routes-core.ts`       | 核心端点：init / snapshot-info / preview / execute / status / lineage-record / notify（撤回终态事件上报转发，issue #19；P0-1 运行中 agent 拦截、P0-3 STALE 时效校验、H1 救援编排在此生效；preview/execute 与快照/gc 同一条串行队列）                                                                                                                | 改撤回主链路           |
| `src/host/routes-manage.ts`     | 管理端点：exclude-get/set、config-get/set/reset、manage（list/titles/messages/usage/delete/deleteAll/gc/lineage）+ 按过滤批量删除辅助                                                                                                                                                                                 | 改设置页后端           |
| `src/host/config.ts`            | 配置域：Schemastery `Config` schema（10 字段）+ `DEFAULTS` 运行时兜底镜像 + `createConfig`（env 覆盖最高优先）。**改默认值两处同步改**                                                                                                                                                                                            | 加/改配置项           |
| `src/host/settings-bridge.ts`   | settings 接缝注册接线：两代面分派 + 三条旧面注册路径（installSettingsSection/installSection/register）+ 新面 volatile 热更挂接。`dshSettings` 经参数注入（本体不 import 私有 peer），单测可直测注册 entry 的解 volatile ref 行为；index.ts 裸导入后注入                                                                                                     | 改 settings 注册接线      |
| `src/host/errors.ts`            | 错误码单一事实源（ALL\_CODES 一致性扫描；client 按 code 查 locales 词典 `err.*`，动态细节码回落 host message）                                                                                                                                                                                                          | 加端点错误码           |
| `src/host/diagnostics.ts`       | 环境错误分类（git 缺失/磁盘满/无权限/锁冲突/mkdir 冲突）+ 可行动中文提示（toast 与「最近错误」共用同一套文案，≤140 字符不嵌路径）                                                                                                                                                                                              | 改错误分类/提示         |
| `src/host/session-info.ts`      | 会话标题/消息文本两段式读取（live 快查 + 冷会话异步补齐），纯函数模块级导出供单测                                                                                                                                                                                                                               | 改标题/文本解析         |
| `src/host/exclude-patterns.ts`  | 排除表的「目录形态」判据（issue #18）：`dirNamePatterns` 取目录名集合、`buildArtifactRootSegment` 判工作区根是否命中（看任一路径段，win32 不敏感/POSIX 敏感）、`buildRootNotice` 拼停用文案。判据与脚本侧 oversize 目录跳过同源，改一处要同步另一处                                                                                                                                                     | 改构建产物 root 判定/文案  |
| `src/host/store.ts`             | 执行与存储层：`runShell`（danger-full-access + UTF-8 prelude + 失败兜底按 `$g` 分级清扫）、root/git 解析、POSIX home 三档回退与旧容器迁移（M2）、home/降级 store 迁移、store 心跳（M3）、`ensureGit`、共享 state                                                                                                                                    | 改存储/执行策略         |
| `src/host/snapshots.ts`         | capture/diff/rollback、index.json 落盘/载入、exclude 读写、孤儿重建、`resolveCutSeq`、`rescueRollback`（H1）、lineage 持久化（F1）、失败善后（prune + 3 次起 5min→60min 指数熔断）、SNAP\_SKIP 反馈                                                                                                                                                        | 改快照/回退算法         |
| `src/host/maintenance.ts`       | 定期 `git gc`（50 拍或 24h）、会话删除联动清 tag、条数上限（`maxSnapshotsPerWorkspace`）与按时间保留（`retentionDays`）清理；「立即 gc」另按磁盘枚举（注入 `dumpStores`）覆盖内存里没有的仓库并回收空仓目录（M3）                                                                                                                                                                 | 改磁盘治理            |
| `src/host/intent-journal.ts`    | 操作意图 journal（A2，吸收 U4 留痕）：execute 三针（begin/advance/clear）落 `recall-intent.json`；`recover` 在启动预热与 init 续做——先幂等判定（diff 一致只清记录，防 stale journal 误救援）→ agentBusy 护栏 → reset 到安全快照；写失败只告警不阻断                                                                                                                                       | 改崩溃恢复            |
| `src/host/scripts.pwsh.ts`      | PowerShell 命令模板（win32），与 posix 版**同名导出**；契约由 `src/types/scripts.ts` + tests/types 编译期断言锁死                                                                                                                                                                                                   | 改 Windows 命令     |
| `src/host/scripts.posix.ts`     | bash 命令模板（linux/darwin），与 pwsh 版共享同一契约                                                                                                                                                                                                                      | 改 POSIX 命令       |
| `src/types/`                    | 跨域共享类型库（仅类型导出，`import type` 消费、转译后零运行时引用；例外：`events.ts` 含事件名常量，host 侧以本地字面量 + 编译期绑定断言对偶）：`dsh-contract.ts`（Host 依赖面）、`ambient-modules.d.ts`（私有 peer 包 ambient 声明，全局脚本上下文）、`client-contract.ts`（Client slot/`__ModuleLoader__` 全局）、`scripts.ts`（双模板契约 + 哨兵字面量）、`payloads.ts`（index/lineage/exclude/root 结构）、`state.ts`（共享 state）、`api.ts`（/api/recall 端点类型）、`config.ts`（Config 类型镜像）、`events.ts`（撤回终态事件契约：事件名/`RecallCompleteEvent`/`RecallFailedEvent`/`RECALL_EVENT_VERSION`，issue #19） | 改跨域契约/类型         |
| `src/client/entry.ts`           | client 构建入口：esbuild entry，`__ModuleLoader__.load({id, factory})` 注册，react external                                                                                                                                                                                                          | 基本不动             |
| `src/client/app.ts`             | client 装配：注入 CSS、组装子模块、注册 `conversation.chat.node`（key 覆盖 user+steering，priority -1 冲突递减重试到 -3）与设置卡片双 slot 并注册（`settings.plugin.item` key=namespace `dsh-recall`；`plugins.bundle.config` key=包名 `dsh-recall-plugin`，各吃一代设置面）                                                                                                                                 | 改注册/装配           |
| `src/client/recall-node.ts`     | 撤回节点：撤回按钮/确认面板/toast、preview→execute→fork→归档→回填链（`refillDraft` 可关）、用户消息重绘（图片走官方 `renderMessageImages`）                                                                                                                                                                                                      | 改撤回 UI、改 fork 行为 |
| `src/client/settings-cards.ts`  | 设置卡片装配层：`RecallSettingsCard` 外壳 + `SectionToggle` 折叠头原子，组装配置 / 排除 / 快照管理三张卡片                                                                                                                                                                                                                | 改卡片装配           |
| `src/client/config-card.ts`     | 插件配置表单卡片（10 字段 + 恢复默认 + 语言下拉）                                                                                                                                                                                                                                                                  | 改配置表单           |
| `src/client/exclude-card.ts`    | 排除配置卡片（exclude 列表拉取 + 编辑 + 常用模式快捷追加）                                                                                                                                                                                                                                                     | 改排除编辑 UI        |
| `src/client/snapshot-manager.ts` | 快照树管理卡片（版本家族聚族、搜索、分级删除、磁盘占用、立即 gc、最近错误）                                                                                                                                                                                                                                                  | 改快照管理 UI        |
| `src/client/util.ts`              | client 纯函数（clockText/sizeText/buildTree…，模块级导出供单测）+ 有状态工厂（api/toast/ensureInit/t/setLocalePref，locale 状态归工厂）                                                                                                                                                                             | 改 client 工具      |
| `src/client/locales/`           | i18n 词典层（A4）：`zh.ts` 事实源 + `en.ts` + `index.ts`（`t`/`translate`/`resolveLocale`/`hasTranslation`，纯逻辑零状态）；key 用语义 ID，当前语言缺 key 回落 zh、再缺回落 key 本身。**新增文案先落 zh 再同步 en**（tests/unit/locales-parity 钉 key 集合/占位符一致 + 扫 client 字面量 key 漏配）                                                                                     | 加/改界面文案         |
| `src/client/log.ts`             | 命名空间 logger（A5）：`createLogger(ns)` 前缀 `[dsh-recall:<ns>]`、error/warn 恒输出、info/debug 由 `localStorage['dsh-recall.debug']`（`*` 或逗号分隔命名空间，每次调用重读）过滤；localStorage 不可用静默降级。**client 新代码禁裸 console**                                                                                                                       | 改 client 日志      |
| `src/client/css.ts`             | client CSS 常量（styles 服务注入，缺失降级 `<style>`）                                                                                                                                                                                                                   | 改样式              |
| `lib/*.js`                      | **构建产物**（esbuild 逐文件转译 `src/host/` 16 产物 + 打包 `src/client/` → client.js；随源码提交，CI 钉新鲜度）——勿直接编辑，改源码后 `npm run build`                                                                                                                                                               | 不手改              |
| `cordis.patch.yml`              | 持久插件挂载声明（bundle insert 行 + 默认 config 下发）                                                                                                                                                                                                                    | 改默认配置            |
| `assets/icon.svg`               | 插件图标（`package.json` 顶层 `icon` 声明；宿主 `readPluginMeta` 读成 base64 data URL，插件管理页 bundle 卡片/详情页按 36px 渲染；形状＝撤回按钮 `UndoIcon`，20×20 单色 `#658EFF`——`<img>` 隔离渲染不继承 `currentColor`，颜色必须写死）                                                                                                                        | 改图标              |
| `scripts/build-host.mjs`        | host 打包脚本（16 个入口逐文件转译、`bundle: false`、import 说明符逐字透传、产出 lib/ 同名文件）                                                                                                                                                                                                          | 改构建              |
| `scripts/build-client.mjs`      | client 打包脚本（产物包裹格式/注册 id/裸 require 白名单断言）                                                                                                                                                                                                                   | 改构建              |
| `scripts/verify-host.mjs`       | 装配门禁：真实 cordis `new Context()` + 服务桩 apply 插件（复刻生产 inject 门禁路径）                                                                                                                                                                                             | 改装配断言            |
| `scripts/check-dsh-version.mjs` | dsh 版本巡检（镜像漂移/reference + 契约文档漂移/dsh-contract、peer 越界、新版提示四层比对，纯函数有单测）                                                                                                                                                                                                      | 改巡检              |

**重要约束**：两套脚本模板必须同名导出——调用方统一走 `rt.scripts.*` / `S.*`，按 `process.platform` 单选；契约事实源是 `src/types/scripts.ts` + tests/types 编译期断言，scripts-contract.test.js 运行时断言作双保险。

**文档**：计划/规范类文档放 `docs/`，归类、命名与生命周期规范见 `docs/README.md`（新增文档前先读）。行为变更同步 CHANGELOG.md（Keep a Changelog 格式）。

## 命令脚本

| 命令                      | 作用                                                                                                                      | 何时跑                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `npm test`              | vitest 纯逻辑单测（tests/unit，37 文件，无 DSH 依赖，CI 同跑）                                                                           | 改任何逻辑后                             |
| `npm run test:client`   | client 组件测试（tests/client，6 文件；vitest + jsdom 独立配置，stub fetch/服务驱动，含 i18n 双语链路，CI 同跑）                                            | 改 client UI 后                        |
| `npm run typecheck`     | `tsc --noEmit` 全量类型检查（src/**/\* + tests/types/**/\* 编译期契约断言 + tests/client/**/\*；tests/unit 与 scripts/\*.mjs 不在 include 范围）                           | 改任何 src/ 后；发版前（CI 类型门禁置于单测前）       |
| `npm run test:probe`    | 官方 API 字段探针（tests/probe，依赖本机 dsh 安装，无 dsh 自动 skip）                                                                      | **dsh 升级后本地必跑**；新增官方 API 调用点先加探针条目 |
| `npm run verify:host`   | 装配门禁（inject 声明/端点注册/Config schema/settings 接入/卸载清零）                                                                     | 改 inject/端点/装配后；发版前                |
| `npm run build`         | host+client 全量打包：build-host.mjs 逐文件转译 src/host/ 16 产物 → lib/ + build-client.mjs 打包 src/client/ → lib/client.js（含产物格式断言） | 改任何 src/ 后必跑（CI 新鲜度门禁拦漏跑）          |
| `npm run check:dsh`     | dsh 版本巡检（本地 dsh vs docs/reference 镜像 + dsh-contract 契约文档、npm 最新 vs peer 范围）                                                  | 发布前；dsh 升级后                        |
| `npm run check:upgrade` | dsh 升级一键核验门禁：串联 check:dsh + test:probe + verify:host，输出后提示在 compat-audit.md 头部追加核验记录                                    | **dsh 升级后必跑**（替代手动三步）              |

CI（GitHub Actions）：`npm ci --legacy-peer-deps` + 类型门禁（typecheck）+ 单测 + 产物新鲜度统一门禁（`npm run build && git diff --exit-code lib/`）；探针与 verify:host 依赖本机 dsh，不进 CI。

## 官方文档合规清单（改代码前对照）

> 官方文档本地镜像在 `docs/reference/`（索引与更新见 `docs/reference/README.md`）；发布前过一遍本表。

| # | 要求                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 镜像                        |
| - | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1 | 入口形态：导出 `name` + `apply(ctx, config)`；`inject` 声明必需服务，依赖就绪才 apply                                                                                                                                                                                                                                                                                                                                                                                                                                              | 02-basic、06-framework     |
| 2 | 注册即副作用：一切 `ctx` 注册（`ctx.on`/`ctx.effect`/服务注册）卸载自动清理；手动资源在 `ctx.effect` 内返回 disposer——禁手写 removeListener/clearInterval                                                                                                                                                                                                                                                                                                                                                                                                       | 06-framework              |
| 3 | `Config` 必须是活 Schemastery schema（禁普通对象）；无硬编码可调参数（判定：能否在 cordis.yml 改值不改代码）；无效配置加载即响亮失败                                                                                                                                                                                                                                                                                                                                                                                                                           | 04-config                 |
| 4 | 组合包语义：`dsh.bundle.patch` → cordis.patch.yml；patch **按行替换**目标行整个 config（不深合并），覆盖前层行须重述所有键；默认值给用户大概率保留的值                                                                                                                                                                                                                                                                                                                                                                                                           | 05-publish                |
| 5 | 无跨 apply 的 module 级可变状态：HMR 卸载旧实例→重载新实例，注册清零                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 04-config、06-framework    |
| 6 | 事件域选对：持久事实用 `session/event` 广播；「模型可见即已记录」不变式                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 09-architecture、08-events |
| 7 | 扩展点归位：Chat 节点 `ConversationNodeDefinition` + keyed renderer、设置卡片 settings slot、fork 用 `ctx.sessions.fork`                                                                                                                                                                                                                                                                                                                                                                                                            | 09、11〜13                  |
| 8 | 禁止对官方 API 的字段假设：slot props、服务方法签名、事件/节点 data 的字段名与形状，用前必须核验——第一手是官方 `.d.ts`（dsh 安装目录下 `@deepseek-ai/<pkg>/lib/types/**`：slot props 查 `dsh-client-ui-chat` 的 `contract/slots.d.ts`（0.1.2 起由 ui-conversation 迁入），服务契约查 `dsh-api-session-controller/lib/types/client/contract/sessions.d.ts` 与 `dsh-api-workspace-controller` 等 client 服务包），其次 `docs/reference/` 镜像的示例代码，仍存疑读官方构建产物源码。运行时守卫（`typeof` 检查）**不能**补救错误假设：字段本不存在时守卫只是静默 no-op，功能死掉且零报错（issue #9 实证：读不存在的 `loadImage`，两轮修复从未执行） | 11〜13                     |

特注：

* `inject` 声明 `['shell', 'sessions', 'agents']`——`agents` 是 P0-1 运行中 agent 拦截所需；cordis 4 漏声明即抛并被访问点守卫吞掉、静默 fail-open（I10，verify-host 有行为级断言盯防）。**webServer 刻意不在 inject**（I32）：桌面端 composition 禁用它，硬依赖令 fiber 永久 pending；API 路由走 connection 的载体无关 fetch 路由，`ctx.inject` 可选注入、服务缺席仅 Client API 降级。

* `DSH_RECALL_GC_SNAPS/HOURS` env 绕过 schema 仅作 Config 覆盖，与 #3 有张力——新参数一律走 Config 字段。

* client 半 UI 资源清理依赖 React 卸载，编 UI 保持「挂载注册 / 卸载回收」成对。

* 发布前重点复核：#3 无新硬编码、#4 patch 默认值语义、#5 HMR 假设、#8 新增官方 API 调用点的字段已核验。

漂移控制：每 release 周期按 `docs/reference/README.md` 重拉镜像（重拉后同步更新该文件「归档日期」与「归档 dsh 版本」字段），变化同步进本清单、[docs/compat-audit.md](docs/compat-audit.md) 台账与「已知坑」；发布前跑 `npm run check:dsh` 做版本巡检——本地 dsh 与镜像漂移、peer 范围越界都会输出提醒。**dsh 升级后跑 `npm run check:upgrade`（串联三层门禁）并按 compat-audit 台账 I1-I41 定点复查**，替代全文重读「已知坑」。

## 关键设计决策（为什么这样写）

* **shell 以宿主身份执行**（`sandboxPolicy: { mode: 'danger-full-access' }`）：受限会话（workspace-write/read-only）写不了 home，回退必败。安全靠「命令全为固定模板，唯一变量是插件自推导路径，模型无法注入」。

* **串行队列 `state.queue`**：一条消息一次快照，preview/execute/gc/清理同队——互斥无 git 锁竞态。

* **幂等与节流**：`ensureGit` 去重；home 迁移失败 5min 节流；gc 失败也推进时间戳（环境性失败不堵队）。

* **双实例并发治理（M3）**：store 目录心跳文件（宿主 PID + epoch 秒，每次快照/建库刷新，TTL 900s）；失败清扫三级让路——另一活实例使用中让路 → 5min 内新锁让路 → 照常清扫。

* **win32/POSIX 文本写统一 stdin 单进程**（PF-2）：`fileWriteStdinCmd` 两平台同名——pwsh 用 `OpenStandardInput()` 字节流读（原因见 I27），POSIX 是 `cat > tmp`。

* **diff 不用 `-z`**（PowerShell 丢 NUL 行）：`core.quotePath=false` + 逐行 TAB 解析。

* **pwsh 哈希用 `SHA256::Create()`**：兼容 Windows PowerShell 5.1。

* **构建形态**：产物随源码提交入库（git 安装免 prepare），CI 统一新鲜度门禁。client 打包为单文件 CJS factory 包裹的原因见 I13；**改任何 `src/` 必须重跑 build，否则发布的是旧产物**。

## 数据流速查

```
用户消息 → session/event → 快照（串行队列；snapshotEnabled 关闭只冻结新建，维护照跑）
  → 格式守卫（A3：读 store/format marker，高版本/损坏即拒写并 recordError；列表等只读路径不受影响）
  → git add -A --ignore-errors（exclude 排除 + 超大跳过 + fail-open/SNAP_SKIP 回传）
  → write-tree → commit-tree → tag → maybeMaintain（定期 gc / 会话删除清理 / 条数上限 / 保留天数）
撤回 → preview（agentBusy 拦截 + diff 清单 + TREE 树指纹，PF-1；老 client 的 previewTotal 条目数校验为兼容路径）
  → 确认（面板内可选撤回范围 scope：both 默认 / session-only 仅对话，cutSeq 为 null 不出选项）
  → execute（scope 缺省/非法回落 both；session-only 走零 git 短路径：不进队列、无安全快照/STALE 校验/rollback/rescue，护栏检查后直接取切点返回 count:0；
    both：agentBusy 复查 + 树指纹比对安全快照（不一致 STALE；无指纹退回 previewTotal 校验）→ 安全快照 snap-pre-rollback-<ts>
    → 意图 journal（A2 三针：安全快照后 begin / 回退成功后 clear / rescue 前 advance、rescue 后 clear——先落意图再动磁盘）
    → reset 到 tag；失败自动 rescue 回安全快照，救援失败给可复制的手动命令）
  → 启动预热与 init 续做 recover（A2：幂等判定（diff 一致只清记录）→ agentBusy 护栏 → reset 到安全快照 → clear + 告警）
  → resolveCutSeq（最近 turn/end）→ client sessions.fork → 原会话归档（archiveOriginal 可关；带 stopActivity 先停作业再归档）
  → lineage-record 持久化 fork 关系 → 回填输入框（refillDraft 可关）
快照失败 → runShell 兜底（分级清扫：另一实例心跳/5min 内新锁让路，否则杀孤儿 + 清陈旧锁）
  → recordError（环境错误分类 git/space/permission/lock/mkdir + 可行动提示）+ prune + 熔断
  → toast（10min 文本节流，相邻重复合并 ×N）并停止轮询
有跳过 → snapFeedback{skipped} → client「已跳过未纳入的路径」提示
设置页 → exclude-get → 编辑 → exclude-set（白名单写入 → 下次快照重读生效）
配置表单 → config-get/config-set（settings 用户层 + watch 热更 cfg）/ config-reset（settings.replace，老服务降级写默认值）
快照管理 → manage list（磁盘+内存并集，30s 缓存；新快照只标 stale——旧列表立即应答 + 后台 dump 补新（in-flight 去重），client 静默二段刷新，PF-6）→ 树形（lineage 版本家族聚族；lineage 随 storesDump 一次读取，PF-4）→ titles/messages 异步补
  → 删除（scope=workspace/session/snapshot/deleteAll；批删缓存非空时以所见列表为准，PF-6）→ purgeTags 分块（每 100）+ saveIndex（stdin 单进程）
```

## 存储布局

每个工作区一份 store 目录：home 下 `~/.dsh/dsh-recall-snapshots/<工作区路径SHA256>/`；home 不可写时整体降级到 `<项目>/.dsh-recall-snapshots/`（exclude.txt 移入 store 目录内部）。影子 git 仓库在 `git/`（tag 即快照，`snap-<消息ID>`），索引 `index.json`、撤回链 `lineage.json`、格式 marker `format`、意图 journal `recall-intent.json`、`root.txt` 与 `heartbeat` 同层。

**逐文件格式、tag 命名与兼容纪律（读取侧字段可选化 / 高版本拒写 / 损坏处理语义）见 [docs/format.md](docs/format.md)**——本文件不重复叙述。

## 协作流程（改动 → 合并 → 发布）

1. **Host 逻辑改动**（src/host/，不含 client）：改代码 → `npm run typecheck` → `npm run build`（host 产物进 lib/）→ `npm test`（新增可纯化逻辑对应补单测）→ 涉及官方 API 字段时补探针条目并跑 `npm run test:probe` → 涉及 inject/端点/装配时跑 `npm run verify:host` → 冒烟验证。**本地工作流约定：改 `src/` 后先 `npm run build` 再 `npm test`**——package-layout 断言基于 lib/ 产物，忘 build 会基于陈旧产物假绿/假红。
2. **Client 改动**（src/client/）：改源码 → `npm run build`（产物 lib/client.js 随源码一起提交）→ `npm test` → 冒烟验证。
3. **脚本模板改动**（src/host/scripts.pwsh/posix.ts）：两平台过心智检查（路径引号、编码、命令长度上限差异），契约事实源在 `src/types/scripts.ts` + tests/types 编译期断言，`scripts-contract` 单测钉同名导出与 `g=`/`RECALL_CLEANUP` 约定；改动尽量双平台实弹复验。
4. **提交规范**：Conventional Commits 中文摘要（feat:/fix:/docs:/test:/ci:/chore:）；修复 bump patch、新功能 bump minor；metadata-only 可不发 GitHub Release。
5. **文档同步**：行为变更同步 README.md（+README.en.md）与 CHANGELOG.md；计划/规范文档归口 `docs/`（先读 docs/README.md）；官方 API 假设变化同步 compat-audit 台账。
6. **代码规范**：函数级注释解释「为什么」（动机与权衡），不复述「做什么」；单文件有效代码 ≤800 行，预估超 700 行即拆分；优先复用现有模块，新写模块前先查可复用的函数/类/工具；**catch 必须附降级理由**——为什么吞、为何安全、后续谁兜底，空 catch 需行内注释；review 时无注释的 catch 一律打回（不设 CI 启发式门禁：注释存在性检查误报高，纪律靠规约 + review）；**client 新代码一律走 `log.ts` 的命名空间 logger，禁裸 console**（error/warn 恒输出、info/debug 由 `localStorage['dsh-recall.debug']` 开关过滤）。
7. **发布流程**：bump version → git commit/push → npm publish → GitHub Release；发布后本机验证新版：npm 模式跑 `pnpm update dsh-recall-plugin`（profile 目录），或临时切 link 模式。
8. **GitHub Release 正文格式（固定）**：写精简版 CHANGELOG，不贴全文——按 `### 新增 / ### 变更 / ### 修复` 分节，每条改动 ≤100 字；正文末尾固定一行 `**Full Changelog**: [CHANGELOG.md](https://github.com/limbo947/dsh-recall-plugin/blob/main/CHANGELOG.md)`。完整细节（实证、字节数、台账引用）住在 `CHANGELOG.md`，正文只保「用户能一眼看懂改了什么」。创建/回写用 `gh release create|edit <tag> --notes-file <文件>`——多行中文正文不要内联进命令行（PowerShell 下 `Add-Content` 未带 `-Encoding` 会被拦，用文件写入工具备好正文）。

## 开发与验证

* **profile 双模式**（`~/.dsh/profiles/web/package.json` 的 `dsh-recall-plugin` 依赖，两种状态按需切换）：

  * **npm 模式**：依赖 `"^<ver>"` + pnpm install——跑的是 registry 发布版（lockfile 锁定具体版本，发布新版后须显式 `pnpm update dsh-recall-plugin` 才跟进；`^` 范围不自动升级已装版本）。

  * **link 模式**（改代码联调时用）：依赖改 `link:<本仓库>` 后 pnpm install——DSH 加载的是工作区 `lib/` 构建产物，改 `src/` 后需 `npm run build` 再重启 dsh-web 生效，无需复制；市场/pnpm 更新对 link: 依赖永不覆盖。

  * 判断当前是哪种模式：看 profile package.json 依赖字段即可；本机验证新发布版本前先确认（npm 模式下跑的还是旧版）。

* **工作区 junction**：`node_modules/@deepseek-ai/dsh-settings` 是 junction（Host 直接 import，ESM 按真实路径解析；link: 开发安装的真实路径是工作区，必须自备）；注意 dsh-settings 0.1.1-rc.2 未发布公共 npm，只能从 dsh 安装目录链接。junction 丢失时重建：
  `cmd /c mklink /J node_modules\@deepseek-ai\dsh-settings "%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-settings"`（PowerShell 下用 `New-Item -ItemType Junction -Target <目标>`，mklink 的 %APPDATA% 在 PS 传参下不展开）。
  `@deepseek-ai/schemastery` 已入 devDependencies（npm 直接装，不再需要 junction）；**npm install 会把 dsh-settings junction 当 extraneous 修剪掉**，装完依赖发现 link 模式起不来时先重建它。

* **冒烟路径**：中文路径工作区 → 发消息（出快照）→ 改文件 → 撤回（清单正确、文件恢复、对话回退、标题不变）→ 设置页快照管理（树形展开/折叠、叶子消息内容、三级/批量删除、立即 gc）。完整待办清单（各批次实弹验收项）见 [docs/plans/completed/smoke-checklist.md](docs/plans/completed/smoke-checklist.md)（新批次验收项追加新节）；执行记录（环境/结果/发现/发版判定）见同目录 [smoke-checklist-records.md](docs/plans/completed/smoke-checklist-records.md)。可行手法备忘：**headless 宿主**可直接产生「真实用户消息 + 快照」（`dsh --profile headless "…"`，在目标 cwd 跑；快照由该宿主的插件写入磁盘，web 宿主经 `init` 读回），配合 API 直调（`GET /?token=…` 换 cookie 后打 `/api/recall/*`）即可覆盖 A2/A3 类端点级验收，无需浏览器；杀进程窗口用「轮询 `recall-intent.json` 出现即杀」稳定命中。

* **测试分层**：单测（纯逻辑，CI 同跑）→ client 组件测试（A1：vitest + jsdom，`tests/client/`，stub fetch + stub 服务驱动组件、断言请求载荷与结构而不断言文案；CI 同跑，不替代宿主集成）→ 探针（官方 API 字段断言，把合规清单 #8 机器化）→ verify-host（装配层门禁）→ 活体冒烟（不替代关系，逐层补盲）。

## 已知坑（踩过的，别再踩）

> 细节（依赖的官方行为 / 出处 / 探针·单测 / 失效症状 / 复查动作）全部住在
> [docs/compat-audit.md](docs/compat-audit.md) 的「子系统 × 不变量 × 探针」矩阵
> （I1-I41），这里只留一行一条索引；dsh 升级后的定点复查流程见上文「漂移控制」。

* I1 chat.node keyed slot：负值 priority + 冲突递减重试；key 覆盖 `['user','steering']`。

* I2 chat.node props 有 `renderMessageImages` 与 `loadImage`（0.1.3-alpha.1 起下放），图片渲染走 `renderMessageImages`。

* I3 session-scope slot props 合成：`props.sessionId` 由 kit 注入。

* I4 `node.id` 才是快照主键；`node.key` 是位置键。

* I5 chat.node keyed key 与 UI 投影 kind 对齐（user + steering）。

* I6 fork 不传 `increaseTitle`（标题「xxx 2」递增回归钉）。

* I7 archiveSession = 从分组表面隐藏（F1 lineage 链断裂根因，Host 记录 fork 关系绕过）；忙碌会话须传 `stopActivity` 才归档，否则官方拒且被吞。

* I8 sessionQuery.listSessions 记录 id 在 `header.id`。

* I9 冷启动 `sessions.list()` 为空：exclude 枚举叠加 `resolveHomeContainer` 磁盘兜底。

* I10 cordis inject 门禁：漏声明被守卫 try 吞掉静默 fail-open。

* I11 Host import `@deepseek-ai/*` 按模块真实路径解析（link: 须自备 junction）。

* I12 设置卡片 slot：0.1.6-alpha.1 及以前 `settings.plugin.item` 按 namespace 交集分发（key=dsh-recall）；0.1.6-alpha.2 起旧插件 tab 移除，迁挂 `plugins.bundle.config`（key=bundle 包名 `dsh-recall-plugin`）——双键并注册，未声明 key 的 inject 静默 no-op。

* I13 ModuleLoader 单文件 CJS factory 包裹（R1 路线 B 依据；esbuild 打包、react external）。

* I14 pwsh 对 native 非零退出不抛：关键命令显式查 `$LASTEXITCODE`。

* I15 runShell 失败兜底：`g='<store.git>'` 赋值约定 + `RECALL_CLEANUP` 哨兵。

* I16 POSIX while 循环体禁用 `cond && cmd`（用 if/fi）。

* I17 `git init <dir>`：repo 与 git 是两个路径概念。

* I18 子进程不继承 DSH\_HOME：POSIX 三档回退。

* I19 快照索引两段式补全：manage list 字段补全 + messageTexts null 缓存。

* I20 批量删 tag 分块（每 100）：win32 命令行 32767 上限。

* I21 手写 .ps1 测试文件必须带 BOM。

* I22 Client 查 snapshot-info 前必须等 ensureInit 回调。

* I23 manage list 同 id 去重须字段补全（磁盘先占位、内存后补 root）。

* I24 POSIX home 三档回退第三档须拼 `.dsh` 子目录（漂移实证 issue #11；旧容器四态迁移兜底）。

* I25 失败清扫分级：心跳 + 新锁保护另一活跃实例，让路输出经 parseCleanupResult 记录。

* I26 影子仓库固化 info/attributes 字节保真（archive/add 应用树内 .gitattributes；renormalize 无 pathspec 是空操作）。

* I27 PS 5.1 `Console.In` 按输入代码页（GBK）解码 UTF-8 stdin，文本落盘必须 `OpenStandardInput` 字节流读；dsh pwshPath 解析对 WindowsApps 别名判否，生产口径常落 PS 5.1（PF-2 探针）。

* I28 `SessionHeader` 无 `title` 字段（标题在 `session/title` 事件日志）——冷标题无法走 listSessions，titles 半项废弃钉（官方未来加 title 探针红提示重启优化）。

* I29 0.1.2 服务层重组：插件 client 必须 `inject: [...]` 声明 + `ctx.<name>` 访问服务，`ctx.get('slots')` 静默 undefined → apply 首行退出，症状「Host 活 Client 死」UI 全消失无报错；guard 对 shadowing slot 强制分配 priority（插件传入值被覆盖，重试循环失效但无害）。

* I30 settings 面两次换代：0.1.2-alpha.2 起 `installSettingsSection` 改 `SettingsProvider.installSection`；0.1.7-alpha.1 起 `SettingsProvider` 整体移除（旧三分支静默 no-op）——分流按运行时注入实例的 API 探测，静态 import 判断会误判。新面细节见 I39。

* I31 `slots.entries(key)` 是只读快照、`slots.inject(key, cb)` 回调同步/延迟两态——priority 动态避让只在无 guard 环境真实生效（I1 的冲突递减重试在 inject 延迟路径是死代码）。

* I32 Host 不得硬依赖 webServer：桌面端 composition 禁用 `webserver` row，硬 inject 令 fiber 永久 pending（「entry did not activate」）；API 路由走 connection 的载体无关 exact fetch 路由（`ctx.inject` 可选注入 + `effect` 包裹 register 的异步 disposer）。

* I33 seeded 会话（fork 子会话）的全量读取：`sessionQuery.readSession` 内部 seed 校验恒抛且被静默折成 null → 子会话点任何消息误报「第一条用户消息」（重启不恢复）；修法＝降级 `observeSession`（restore 无此约束，取全量事件并释放租约）。

* I34 撤回回填附件走官方 composer 等价链路（`sessions.binding().session.readAttachment` → `conversation.createDrafts` → `shell.actions.addAttachments`，未接纳则 `releaseDraftAttachments`）；`readAttachment` 授权绑定消息所在会话——execute 开头用**源会话**早读字节，fork 后注册进子会话草稿，不能在子会话直读。全链 typeof 探测降级。

* I35 0.1.5 线 `sessions.fork` 切点取 `boundary+1` 后跳到下一个 `turn/start`——inbox 入队事件进子会话 seed，被撤回消息以「排队消息」复活；0.1.6-alpha.1 官方修复后插件清理链（G1）退化为无害空操作（peer 仍覆盖 0.1.5 线）。

* I36 win32 下 `ctx.shell` 方言不受插件控制（profile 可把 win32 配成 bash 执行器），pwsh 模板被 bash 执行首行即语法错误、快照/撤回全死；公开面无方言字段，按行为探测改走直连 powershell.exe 通道（stdin 字节透传/尾部截断/超时 kill/失败清扫四语义对齐官方）。0.1.7 起接缝换代见 I38。

* I37 0.1.6-alpha.2 移除 `ISessions.open`：会话导航改走 `uiWorkspace.openSession`（`ctx.workspaces` 只有归档能力、无导航）；同版 `sessions.list.byId` 含归档会话而归档不是合法主视图选择，「切换」类导航的判据须叠加 `workspaces.list` 的 `archivedSessionIds` 排除。

* I38 0.1.7-alpha.1 换 shell 执行接缝：`ShellExecutor` 删 `run`/`start`，改 `resolve(request)` + `execute(spec)` → `ShellExecution.result()`；`result()` 只在基础设施失败时 reject，`exitCode` 可为 `null`（准备期超时/信号终止）——插件按运行时方法探测双分支（`run` 优先 → `execute` 兜底），共用 spec 构造与失败分级（null + 无 stderr 或 first-cause `timedOut` → 判超时）。

* I39 0.1.7-alpha.1 换 settings 面：`ctx.settings` 变 `SettingsForms`，**ns = profile entry id**；只有 schema 标 `.volatile()` 的字段可被 `describe()` 收录/写入（`.volatile()` 需 schemastery ≥3.18.3 → 必须 feature-detect）；热更经只对自己 fiber 派发的 `loader/volatile-update`（故只能在自己 ctx 监听），取值解一层 Volatile ref。

* I40 反向代理子路径部署（0.1.7-rc.1 起官方支持）：服务端路径须按 `document.baseURI` 解析（`src/client/util.ts recallApiUrl`，缺尾斜杠按目录补齐、无 document 回落原路径）——根绝对 `/api/recall/*` 会打到代理未映射的根（实弹 404）。

* I41 win32 下 PowerShell 的**静默错误仍置退出码 1**：`Get-Content -ErrorAction SilentlyContinue` 读缺席文件退出码仍是 1——`fileReadCmd` 必须用 `Test-Path` 分支让缺席收成成功（POSIX 侧 `|| true` 天然免疫），否则 A3 格式守卫把无 marker 的正常 store 判成「读不到」并永久拒写（快照/撤回/列表载入全停）。
* I42 win32 目录重解析点（junction / 目录符号链接）必须排除出影子仓库：git for Windows 把 junction 当普通目录、`add -A` 递归进链接目标，`core.symlinks` 取 true / false / 默认三种取值**实测同样递归**（无法用配置规避）；自引用 junction（`a/link -> a`）于是按 Windows「路径中最多 31 个重解析点」上限把同一棵子树重复索引——实测 2 文件工作区 → 64 条索引（36 条路径长度 > 260），真实病例 1.24 万条 → 39.2 万条、`.git/index` 168 MB，preview/快照/回退全部退化到分钟级（`diffScript` 要为两侧各建一份 39 万条哈希表）。修法落在 `excludeSyncBlock`（三处脚本都在 `add -A` 之前调用它，故一处覆盖三条链路）+ `oversizeBlock` 同款压栈剪枝；POSIX 侧**有意不做**：git 把指向目录的符号链接记成 120000 条目、不递归进目标，照搬反而会把合法快照内容剔出快照（POSIX 的 bind mount 环不覆盖，已知缺口）。
