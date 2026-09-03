# AGENTS.md

给 AI 编码代理（和快速上手的人类）的项目速览。读完本文件即可定位任意改动的落点。

## 一句话理解

DSH 消息撤回插件：在用户消息气泡旁加「撤回」按钮，把**项目文件**（独立影子 git 仓库快照）与**对话历史**（官方 sessions.fork）一并回退到该消息发送之前。当前版本 2.1.1（npm 包 `dsh-recall-plugin`，Node ≥ 20，ESM）。

## 核心机制（三个关键词）

1. **影子仓库**：每个工作区在 `~/.dsh/dsh-recall-snapshots/<工作区路径SHA256>/git/` 有独立 git 仓库，`--work-tree` 指向项目目录——项目零污染（无 .git、无快照落地）。home 不可写时降级到项目内 `.dsh-recall-snapshots/`。
2. **tag 即快照**：每条用户消息触发一次 `write-tree + commit-tree + tag snap-<消息ID>`。不建分支、不动工作区；消息 ID 即快照主键，索引丢失可从 tag 名反推重建（`rebuildOrphans`，时间从 tag creatordate 恢复）。index.json/lineage.json 走 tmp+rename 原子写；index 损坏时 fail-loud——改名 `.corrupt-<ts>` 隔离并告警，不静默当空。
3. **双轨回退**：文件走影子仓库 reset 到 tag；对话走官方 `sessions.fork({ atSeq: cutSeq })`——cutSeq 是该消息之前最近一次 `turn/end` 的 seq。原会话归档（可恢复，`archiveOriginal` 可关），新会话继承原标题（不传 `increaseTitle`，避免「xxx 2」递增）。execute 先打安全快照 `snap-pre-rollback-<ts>`，回退失败自动 reset 救援（H1）；fork 关系经 `lineage-record` 持久化进 lineage.json，快照管理按「版本家族」聚族（F1）。

## 项目架构与文件地图（改动先看这里）

源码全部在 `src/`：Host 半（`src/host/`，Node ESM TypeScript）按域拆成 ctx 绑定的工厂模块（无模块级可变状态），由 `src/host/index.ts` 装配；Client 半（浏览器）源码在 `src/client/`；跨域共享类型在 `src/types/`（仅类型导出）。`lib/` 是**纯构建产物目录**——`npm run build` 经 esbuild 转译/打包生成（13 个 host 产物 + client.js），勿直接编辑。

| 文件                              | 职责                                                                                                                                                                                                                                                                                                                               | 什么时候改它           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `src/host/index.ts`             | Host 入口（`name`/`inject`/`Config`/`apply`）：装配域模块、注册 `/api/recall` 前缀路由（端点表 = routes-core + routes-manage）、settings namespace `dsh-recall`（`installSettingsSection`/`installSection` 双版本接线 + watch 热更 cfg）、`session/event` 触发快照与启动预热、端点共享辅助（enqueue / agentBusy / dumpStores / locateSnapshotOnDisk / collectAllSnapshotRecords 等） | 加接线、改事件触发、改共享辅助  |
| `src/host/routes-core.ts`       | 核心端点：init / snapshot-info / preview / execute / status / lineage-record（P0-1 运行中 agent 拦截、P0-3 STALE 时效校验、H1 救援编排在此生效；preview/execute 与快照/gc 同一条串行队列）                                                                                                                                                                            | 改撤回主链路           |
| `src/host/routes-manage.ts`     | 管理端点：exclude-get/set、config-get/set/reset、manage（list/titles/messages/usage/delete/deleteAll/gc/lineage）+ 按过滤批量删除辅助                                                                                                                                                                                                              | 改设置页后端           |
| `src/host/config.ts`            | 配置域：Schemastery `Config` schema（9 字段）+ `DEFAULTS` 运行时兜底镜像 + `createConfig`（env 覆盖最高优先）。**改默认值两处同步改**                                                                                                                                                                                                                             | 加/改配置项           |
| `src/host/errors.ts`            | 错误码单一事实源（18 个 code + ALL\_CODES 一致性扫描；client 按 code 映射文案）                                                                                                                                                                                                                                                                        | 加端点错误码           |
| `src/host/diagnostics.ts`       | 环境错误分类（git 缺失/磁盘满/无权限/锁冲突/mkdir 冲突）+ 可行动中文提示（toast 与「最近错误」共用同一套文案，≤140 字符不嵌路径）                                                                                                                                                                                                                                                   | 改错误分类/提示         |
| `src/host/session-info.ts`      | 会话标题/消息文本两段式读取（live 快查 + 冷会话异步补齐），纯函数模块级导出供单测                                                                                                                                                                                                                                                                                    | 改标题/文本解析         |
| `src/host/store.ts`             | 执行与存储层：`runShell`（danger-full-access + UTF-8 prelude + 失败兜底按 `$g` 分级清扫）、root/git 解析、POSIX home 三档回退与旧容器迁移（M2）、home/降级 store 迁移、store 心跳（M3）、`ensureGit`、共享 state                                                                                                                                                                 | 改存储/执行策略         |
| `src/host/snapshots.ts`         | capture/diff/rollback、index.json 落盘/载入、exclude 读写、孤儿重建、`resolveCutSeq`、`rescueRollback`（H1）、lineage 持久化（F1）、失败善后（prune + 3 次起 5min→60min 指数熔断）、SNAP\_SKIP 反馈                                                                                                                                                                     | 改快照/回退算法         |
| `src/host/maintenance.ts`       | 定期 `git gc`（50 拍或 24h）、会话删除联动清 tag、条数上限（`maxSnapshotsPerWorkspace`）与按时间保留（`retentionDays`）清理                                                                                                                                                                                                                                     | 改磁盘治理            |
| `src/host/scripts.pwsh.ts`      | PowerShell 命令模板（win32），与 posix 版**同名导出**；契约由 `src/types/scripts.ts` + tests/types 编译期断言锁死                                                                                                                                                                                                                                        | 改 Windows 命令     |
| `src/host/scripts.posix.ts`     | bash 命令模板（linux/darwin），与 pwsh 版共享同一契约                                                                                                                                                                                                                                                                                           | 改 POSIX 命令       |
| `src/types/`                    | 跨域共享类型库（仅类型导出，`import type` 消费、转译后零运行时引用）：`dsh-contract.ts`（Host 依赖面 + schemastery/dsh-settings ambient）、`client-contract.ts`（Client slot/`__ModuleLoader__` 全局）、`scripts.ts`（双模板契约 + 哨兵字面量）、`payloads.ts`（index/lineage/exclude/root 结构）、`state.ts`（共享 state）、`api.ts`（/api/recall 端点类型）、`config.ts`（Config 类型镜像）               | 改跨域契约/类型         |
| `src/client/entry.ts`           | client 构建入口：esbuild entry，`__ModuleLoader__.load({id, factory})` 注册，react external                                                                                                                                                                                                                                               | 基本不动             |
| `src/client/app.ts`             | client 装配：注入 CSS、组装子模块、注册 `conversation.chat.node`（key 覆盖 user+steering，priority -1 冲突递减重试到 -3）与 `settings.plugin.item`（key=namespace `dsh-recall`）                                                                                                                                                                              | 改注册/装配           |
| `src/client/recall-node.ts`     | 撤回节点：撤回按钮/确认面板/toast、preview→execute→fork→归档→回填链（`refillDraft` 可关）、用户消息重绘（图片走官方 `renderMessageImages`）                                                                                                                                                                                                                           | 改撤回 UI、改 fork 行为 |
| `src/client/settings-cards.ts`  | 设置卡片：插件配置表单（9 字段 + 恢复默认）/ exclude 编辑 / 快照树管理（版本家族聚族、搜索、分级删除）                                                                                                                                                                                                                                                                     | 改设置页 UI          |
| `src/client/util.ts`            | client 纯函数（clockText/sizeText/buildTree…，模块级导出供单测）+ 有状态工厂（api/toast/ensureInit）                                                                                                                                                                                                                                                  | 改 client 工具      |
| `src/client/css.ts`             | client CSS 常量（styles 服务注入，缺失降级 `<style>`）                                                                                                                                                                                                                                                                                        | 改样式              |
| `lib/*.js`                      | **构建产物**（`npm run build` 生成：esbuild 逐文件转译 `src/host/` 13 产物 + 打包 `src/client/` → client.js；随源码提交，CI 钉新鲜度）——勿直接编辑，改源码后 `npm run build`                                                                                                                                                                                            | 不手改              |
| `cordis.patch.yml`              | 持久插件挂载声明（bundle insert 行 + 默认 config 下发）                                                                                                                                                                                                                                                                                         | 改默认配置            |
| `scripts/build-host.mjs`        | host 打包脚本（13 个入口逐文件转译、`bundle: false`、import 说明符逐字透传、产出 lib/ 同名文件）                                                                                                                                                                                                                                                               | 改构建              |
| `scripts/build-client.mjs`      | client 打包脚本（产物包裹格式/注册 id/裸 require 白名单断言）                                                                                                                                                                                                                                                                                        | 改构建              |
| `scripts/verify-host.mjs`       | 装配门禁：真实 cordis `new Context()` + 服务桩 apply 插件（复刻生产 inject 门禁路径）                                                                                                                                                                                                                                                                  | 改装配断言            |
| `scripts/check-dsh-version.mjs` | dsh 版本巡检（镜像漂移/reference + 契约文档漂移/dsh-contract、peer 越界、新版提示四层比对，纯函数有单测）                                                                                                                                                                                                                                                           | 改巡检              |

**重要约束**：两套脚本模板必须同名导出——调用方统一走 `rt.scripts.*` / `S.*`，按 `process.platform` 单选；契约事实源已升级为 `src/types/scripts.ts` + tests/types 编译期断言（scripts-contract.test.js 运行时断言保留为双保险）。

**文档**：计划/规范类文档放 `docs/`，归类、命名与生命周期规范见 `docs/README.md`（新增文档前先读）。行为变更同步 CHANGELOG.md（Keep a Changelog 格式）。

## 命令脚本

| 命令                      | 作用                                                                                                                      | 何时跑                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `npm test`              | vitest 纯逻辑单测（tests/unit，17 文件 227 例，无 DSH 依赖，CI 同跑）                                                                     | 改任何逻辑后                             |
| `npm run typecheck`     | `tsc --noEmit` 全量类型检查（src/**/\* + tests/types/**/\* 编译期契约断言；tests/unit 与 scripts/\*.mjs 退出范围）                           | 改任何 src/ 后；发版前（CI 类型门禁置于单测前）       |
| `npm run test:probe`    | 官方 API 字段探针（tests/probe，依赖本机 dsh 安装，无 dsh 自动 skip）                                                                      | **dsh 升级后本地必跑**；新增官方 API 调用点先加探针条目 |
| `npm run verify:host`   | 装配门禁（inject 声明/端点注册/Config schema/settings 接入/卸载清零）                                                                     | 改 inject/端点/装配后；发版前                |
| `npm run build`         | host+client 全量打包：build-host.mjs 逐文件转译 src/host/ 13 产物 → lib/ + build-client.mjs 打包 src/client/ → lib/client.js（含产物格式断言） | 改任何 src/ 后必跑（CI 新鲜度门禁拦漏跑）          |
| `npm run check:dsh`     | dsh 版本巡检（本地 dsh vs reference 镜像 + dsh-contract 契约文档、npm 最新 vs peer 范围）                                                  | 发布前；dsh 升级后                        |
| `npm run check:upgrade` | dsh 升级一键核验门禁：串联 check:dsh + test:probe + verify:host，输出后提示在 compat-audit.md 头部追加核验记录                                    | **dsh 升级后必跑**（替代手动三步）              |

CI（GitHub Actions）：`npm ci --legacy-peer-deps` + 类型门禁（typecheck）+ 单测 + 产物新鲜度统一门禁（`npm run build && git diff --exit-code lib/`）；探针与 verify:host 依赖本机 dsh，不进 CI。

## 官方文档合规清单（改代码前对照，2026-08-30 核对）

> 官方文档本地镜像在 `reference/`（索引与更新见 `reference/README.md`）；发布前过一遍本表。

| # | 要求                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 镜像                        |
| - | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1 | 入口形态：导出 `name` + `apply(ctx, config)`；`inject` 声明必需服务，依赖就绪才 apply                                                                                                                                                                                                                                                                                                                                                                                                                 | 02-basic、06-framework     |
| 2 | 注册即副作用：一切 `ctx` 注册（`ctx.on`/`ctx.effect`/服务注册）卸载自动清理；手动资源在 `ctx.effect` 内返回 disposer——禁手写 removeListener/clearInterval                                                                                                                                                                                                                                                                                                                                                            | 06-framework              |
| 3 | `Config` 必须是活 Schemastery schema（禁普通对象）；无硬编码可调参数（判定：能否在 cordis.yml 改值不改代码）；无效配置加载即响亮失败                                                                                                                                                                                                                                                                                                                                                                                            | 04-config                 |
| 4 | 组合包语义：`dsh.bundle.patch` → cordis.patch.yml；patch **按行替换**目标行整个 config（不深合并），覆盖前层行须重述所有键；默认值给用户大概率保留的值                                                                                                                                                                                                                                                                                                                                                                            | 05-publish                |
| 5 | 无跨 apply 的 module 级可变状态：HMR 卸载旧实例→重载新实例，注册清零                                                                                                                                                                                                                                                                                                                                                                                                                                      | 04-config、06-framework    |
| 6 | 事件域选对：持久事实用 `session/event` 广播；「模型可见即已记录」不变式                                                                                                                                                                                                                                                                                                                                                                                                                                      | 09-architecture、08-events |
| 7 | 扩展点归位：Chat 节点 `ConversationNodeDefinition` + keyed renderer、设置卡片 settings slot、fork 用 `ctx.sessions.fork`                                                                                                                                                                                                                                                                                                                                                                         | 09、11〜13                  |
| 8 | 禁止对官方 API 的字段假设：slot props、服务方法签名、事件/节点 data 的字段名与形状，用前必须核验——第一手是官方 `.d.ts`（dsh 安装目录下 `@deepseek-ai/<pkg>/lib/types/**`：slot props 查 `dsh-client-ui-chat` 的 `contract/slots.d.ts`（0.1.2 起由 ui-conversation 迁入），服务契约查 `dsh-api-session-controller/lib/types/client/contract/sessions.d.ts` 与 `dsh-api-workspace-controller` 等 client 服务包），其次 `reference/` 镜像的示例代码，仍存疑读官方构建产物源码。运行时守卫（`typeof` 检查）**不能**补救错误假设：字段本不存在时守卫只是静默 no-op，功能死掉且零报错（issue #9 实证：读不存在的 `loadImage`，两轮修复从未执行） | 11〜13                     |

特注：

* `inject` 当前声明 `['shell', 'sessions', 'webServer', 'agents']`——`agents` 是 P0-1 运行中 agent 拦截所需；cordis 4 漏声明即抛「cannot get property without inject」并被访问点守卫吞掉、静默 fail-open（I10，verify-host 有行为级断言盯防）。

* `DSH_RECALL_GC_SNAPS/HOURS` env 绕过 schema 仅作 Config 覆盖，与 #3 有张力——新参数一律走 Config 字段。

* client 半 UI 资源清理依赖 React 卸载，编 UI 保持「挂载注册 / 卸载回收」成对。

* 发布前重点复核：#3 无新硬编码、#4 patch 默认值语义、#5 HMR 假设、#8 新增官方 API 调用点的字段已核验。

漂移控制：每 release 周期按 `reference/README.md` 重拉镜像（重拉后同步更新该文件「归档日期」与「归档 dsh 版本」字段），变化同步进本清单、[docs/compat-audit.md](docs/compat-audit.md) 台账与「已知坑」；发布前跑 `npm run check:dsh`（P2-5）做版本巡检——本地 dsh 与镜像漂移、peer 范围越界都会输出提醒。**dsh 升级后跑** **`npm run check:upgrade`（串联三层门禁）并按 compat-audit 台账 I1-I30 定点复查**，替代全文重读「已知坑」。

## 关键设计决策（为什么这样写）

* **shell 以宿主身份执行**（`sandboxPolicy: { mode: 'danger-full-access' }`）：受限会话（workspace-write/read-only）写不了 home，回退必败。安全靠「命令全为固定模板，唯一变量是插件自推导路径，模型无法注入」。

* **串行队列** **`state.queue`**：一条消息一次快照，preview/execute/gc/清理同队——互斥无 git 锁竞态。

* **幂等与节流**：`ensureGit` 去重；home 迁移失败 5min 节流；gc 失败也推进时间戳（环境性失败不堵队）。

* **双实例并发治理（M3）**：store 目录心跳文件（宿主 PID + epoch 秒，每次快照/建库刷新，TTL 900s）；失败清扫三级让路——另一活实例使用中让路 → 5min 内新锁让路 → 照常清扫（issue #11 双实例互踩根治）。

* **win32/POSIX 文本写统一 stdin 单进程**（PF-2）：`fileWriteStdinCmd` 两平台同名——pwsh 用 `OpenStandardInput()` 字节流读（`Console.In` 在 PS 5.1 按输入代码页 GBK 解码 UTF-8 stdin 必挂，I27 探针钉）；POSIX 是 `cat > tmp`。base64 分块实现已移除（回退 = git revert，无运行时双路径）。

* **diff 不用** **`-z`**（PowerShell 丢 NUL 行）：`core.quotePath=false` + 逐行 TAB 解析。

* **pwsh 哈希用** **`SHA256::Create()`**：兼容 Windows PowerShell 5.1。

* **运行时形态（TS 迁移后全量构建）**：源码全部在 `src/`（host 13 + client 6 + types 类型库），`npm run build` 经 esbuild 打包——build-host.mjs 逐文件转译 `src/host/` → `lib/`（13 产物文件名与 npm 包现状逐一相同），build-client.mjs 打包 `src/client/` → 单文件 `lib/client.js`（CJS factory 包裹：loader 契约 classic script 禁顶层 import、react external 由 loader 运行时 `require("react")` 提供、注册 id `dsh-recall-plugin`）。产物随源码提交入库（git 安装免 prepare），CI 统一新鲜度门禁。**改任何** **`src/`** **必须重跑 build，否则发布的是旧产物**。

## 数据流速查

```
用户消息 → session/event → 快照（串行队列；snapshotEnabled 关闭只冻结新建，维护照跑）
  → git add -A --ignore-errors（exclude 排除 + 超大跳过 + fail-open/SNAP_SKIP 回传）
  → write-tree → commit-tree → tag → maybeMaintain（定期 gc / 会话删除清理 / 条数上限 / 保留天数）
撤回 → preview（agentBusy 拦截 + diff 清单 + TREE 树指纹，PF-1；老 client 的 previewTotal 条目数校验为兼容路径）
  → 确认 → execute（agentBusy 复查 + 树指纹比对安全快照（不一致 STALE；无指纹退回 previewTotal 校验）→ 安全快照 snap-pre-rollback-<ts>
  → reset 到 tag；失败自动 rescue 回安全快照，救援失败给可复制的手动命令）
  → resolveCutSeq（最近 turn/end）→ client sessions.fork → 原会话归档（archiveOriginal 可关）
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

```
~/.dsh/dsh-recall-snapshots/
├── exclude.txt                    # 用户自定义排除（gitignore 语法，全局共享）
└── <工作区路径SHA256>/
    ├── git/                       # 影子仓库工作目录（空，仅持有 .git）
    │   └── .git/                  # 真实 git-dir（config/info/objects…）
    │       ├── info/attributes    # 固化字节保真语义（关闭 EOL/clean filter 等，2.1.1）
    │       ├── gc.stamp           # 上次 gc 时间戳（跨重启节流凭据）
    │       └── attrs-v1.stamp     # 存量索引 renormalize 一次性迁移标记
    ├── index.json                 # [{id,time,root,sessionId}] 快照索引（tmp+rename 原子写；损坏改名 index.json.corrupt-<ts>）
    ├── lineage.json               # [{childId,parentId}] fork 撤回链（原子写；损坏按无处理，不隔离）
    ├── root.txt                   # store → 工作区路径元数据
    └── heartbeat                  # store 心跳（宿主 PID + epoch 秒，双实例让路依据，TTL 900s）
```

降级时（home 不可写）：整体落到 `<项目>/.dsh-recall-snapshots/`，exclude.txt 移入 store 目录内部。

## 协作流程（改动 → 合并 → 发布）

1. **Host 逻辑改动**（src/host/，不含 client）：改代码 → `npm run typecheck` → `npm run build`（host 产物进 lib/）→ `npm test`（新增可纯化逻辑对应补单测）→ 涉及官方 API 字段时补探针条目并跑 `npm run test:probe` → 涉及 inject/端点/装配时跑 `npm run verify:host` → 冒烟验证。**本地工作流约定：改** **`src/`** **后先** **`npm run build`** **再** **`npm test`**——package-layout 断言基于 lib/ 产物，忘 build 会基于陈旧产物假绿/假红。
2. **Client 改动**（src/client/）：改源码 → `npm run build`（产物 lib/client.js 随源码一起提交，CI 新鲜度门禁拦漏跑）→ `npm test` → 冒烟验证。
3. **脚本模板改动**（src/host/scripts.pwsh/posix.ts）：两平台过心智检查（路径引号、编码、命令长度上限差异），契约事实源在 `src/types/scripts.ts` + tests/types 编译期断言，`scripts-contract` 单测钉同名导出与 `g=`/`RECALL_CLEANUP` 约定；改动尽量双平台实弹复验。
4. **提交规范**：Conventional Commits 中文摘要（feat:/fix:/docs\:/test:/ci:/chore:）；修复 bump patch、新功能 bump minor；metadata-only 可不发 GitHub Release。
5. **文档同步**：行为变更同步 README.md（+README.en.md）与 CHANGELOG.md；计划/规范文档归口 `docs/`（先读 docs/README.md）；官方 API 假设变化同步 compat-audit 台账。
6. **代码规范**：函数级注释解释「为什么」（动机与权衡），不复述「做什么」；单文件有效代码 ≤800 行，预估超 700 行即拆分；优先复用现有模块，新写模块前先查可复用的函数/类/工具。
7. **发布流程**：bump version → git commit/push → npm publish → GitHub Release；发布后本机验证新版：npm 模式跑 `pnpm update dsh-recall-plugin`（profile 目录），或临时切 link 模式。

   * **网络/代理**：本机直连 GitHub 不通（Connection reset）。全局 git 配置已设
     `http.proxy`/`https.proxy = http://127.0.0.1:48046`（`git config --global`），
     push/pull/clone 默认即走该代理，无需单次 `-c` 注入。若该代理不可用，
     可用 `git config --global --unset http.proxy`/`--unset https.proxy` 撤销，
     回到仓库级定向代理或单次注入：
     `git -c http.proxy=http://127.0.0.1:48046 -c https.proxy=http://127.0.0.1:48046 push origin <branch|tag>`

## 开发与验证

* **profile 双模式**（`~/.dsh/profiles/web/package.json` 的 `dsh-recall-plugin` 依赖，两种状态按需切换）：

  * **npm 模式**：依赖 `"^<ver>"` + pnpm install——跑的是 registry 发布版（lockfile 锁定具体版本，发布新版后须显式 `pnpm update dsh-recall-plugin` 才跟进；`^` 范围不自动升级已装版本）。

  * **link 模式**（改代码联调时用）：依赖改 `link:<本仓库>` 后 pnpm install——DSH 加载的是工作区 `lib/` 构建产物，改 `src/` 后需 `npm run build` 再重启 dsh-web 生效，无需复制；市场/pnpm 更新对 link: 依赖永不覆盖。

  * 判断当前是哪种模式：看 profile package.json 依赖字段即可；本机验证新发布版本前先确认（npm 模式下跑的还是旧版）。

* **工作区 junction**：`node_modules/@deepseek-ai/{schemastery,dsh-settings}` 是 junction（Host 直接 import，ESM 按真实路径解析；link: 开发安装的真实路径是工作区，必须自备）；注意 dsh-settings 0.1.1-rc.2 未发布公共 npm，只能从 dsh 安装目录链接。junction 丢失时重建：
  `cmd /c mklink /J node_modules\@deepseek-ai\schemastery "%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\schemastery"`（dsh-settings 同理）。

* **冒烟路径**：中文路径工作区 → 发消息（出快照）→ 改文件 → 撤回（清单正确、文件恢复、对话回退、标题不变）→ 设置页快照管理（树形展开/折叠、叶子消息内容、三级/批量删除、立即 gc）。完整待办清单（各批次实弹验收项）见 [docs/plans/completed/smoke-checklist.md](docs/plans/completed/smoke-checklist.md)（2026-08-29 七节全部通过；新批次验收项追加新节）；执行记录（环境/结果/发现/发版判定）见同目录 [smoke-checklist-records.md](docs/plans/completed/smoke-checklist-records.md)。

* **测试分层**：单测（纯逻辑，CI 同跑）→ 探针（官方 API 字段断言，把合规清单 #8 机器化）→ verify-host（装配层门禁）→ 活体冒烟（不替代关系，逐层补盲）。dsh 升级后本地跑 `npm run check:upgrade`（串联 check:dsh + test:probe + verify:host），并按 compat-audit 台账 I1-I30 定点复查。

## 已知坑（踩过的，别再踩）

> 细节（依赖的官方行为 / 出处 / 探针·单测 / 失效症状 / 复查动作）全部住在
> [docs/compat-audit.md](docs/compat-audit.md) 的「子系统 × 不变量 × 探针」矩阵
> （I1-I29），这里只留一行一条索引；**dsh 升级后按台账 I1-I29 定点复查，不全文重读本节**。

* I1 chat.node keyed slot：负值 priority + 冲突递减重试；key 覆盖 `['user','steering']`。

* I2 chat.node props 无 `loadImage`，图片入口是 `renderMessageImages`。

* I3 session-scope slot props 合成：`props.sessionId` 由 kit 注入。

* I4 `node.id` 才是快照主键；`node.key` 是位置键。

* I5 chat.node keyed key 与 UI 投影 kind 对齐（user + steering）。

* I6 fork 不传 `increaseTitle`（标题「xxx 2」递增回归钉）。

* I7 archiveSession = 从分组表面隐藏（F1 lineage 链断裂根因，Host 记录 fork 关系绕过）。

* I8 sessionQuery.listSessions 记录 id 在 `header.id`。

* I9 冷启动 `sessions.list()` 为空：exclude 枚举叠加 `resolveHomeContainer` 磁盘兜底。

* I10 cordis inject 门禁：漏声明被守卫 try 吞掉静默 fail-open。

* I11 Host import `@deepseek-ai/*` 按模块真实路径解析（link: 须自备 junction）。

* I12 settings.plugin.item 按 namespace 交集分发（key=dsh-recall）。

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

* I29 dsh 0.1.2 client 服务层迁移：`client/runtime` 包删除、slots/sessions/workspaces 迁入 ui-renderer 与新增 api 包后，插件 client 对象必须 `inject: [...]` 声明 + `ctx.<name>` 属性访问服务，`ctx.get('slots')` 在未声明作用域下静默 undefined 导致 apply 首行退出——症状「Host 活 Client 死」UI 全消失无报错（guard 门禁 0.1.1-rc.2 已存在，触发点是服务层重组）；guard 对 shadowing slot 强制分配 priority（插件传入值被覆盖，重试循环失效但无害）。详见 compat-audit I29。

