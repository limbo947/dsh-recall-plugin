# TS 迁移 M7：client 侧 .ts 化 + tsconfig 终态

> 状态：已完成（2026-09-01 实施）｜ 实弹冒烟：已补做通过（2026-09-02，见「冒烟记录」）｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M7/8
>
> 一句话：client 六文件转 `.ts`（createElement 风格不变），build-client 入口切换，tsconfig 移除 allowJs 收终态。

## 目标

`src/client/` 全部 `.ts`；`lib/client.js` 产物包裹格式/注册 id/require 白名单断言零变化；浏览器实弹冒烟通过；tsconfig 进入终态（上游 §2 描述形态）。

## 前置

M6 完成（host 全部 .ts；types/client-contract.ts、types/api.ts 可消费）。

## 任务分解

### 1. 六文件类型化（entry → app → recall-node → settings-cards → util → css）

- **createElement 风格保持**：React 以参数逐层注入的形态是「同形态复刻」的一部分；参数类型 `type ReactApi = typeof import('react')`（`import type`，运行时零依赖——这是 @types/react 的唯一用途）
- **禁引 `.tsx`**：automatic runtime 会产出 `require('react/jsx-runtime')`，触发 build-client.mjs 裸 require 白名单断言（该断言同时是「未混入新运行时依赖」的防线）
- `entry.ts`：`__ModuleLoader__.load({ id, factory })` 注册 id 字面量不变；全局类型来自 client-contract.ts（`declare global`）
- `app.ts`：两个 keyed slot（`conversation.chat.node` priority -1 冲突递减重试到 -3、`settings.plugin.item` key=namespace）与 conversation/styles 可选探测降级，用 client-contract.ts 的联合/可选类型建模——旧版兼容分支注释保留
- `util.ts`：api client 返回类型接 `types/api.ts`（api-contracts.test.ts 补 client 侧双向绑定的另一半）
- 纯函数（clockText/sizeText/buildTree/nextShadowPriority/groupByLineage 等）签名标注，client-pure.test.js **零改动**（vitest 解析已实证）

### 2. build-client.mjs 入口切换

仅一行：入口 `src/client/entry.js` → `src/client/entry.ts`。产物包裹格式、注册 id、react-only require 白名单断言原样保留（它们转译 `.ts` 入口同样适用）。

### 3. 产物一次性 diff 独立 commit

esbuild 对 client 源码（含类型擦除后）重打包可能产生一次性规整 diff，单独 commit 并与 M2 host 产物 diff 同样按边界 review。

### 4. tsconfig 收终态

全部源文件已 `.ts`：移除 `allowJs`（`checkJs` 已于 M2 关闭）。终态与上游 §2 一致：strict + noEmit，include `src/**/*` 与 `tests/types/**/*`；`"lib": ["ES2022", "DOM", "DOM.Iterable"]` 自 M1 起在配、终态保留（client 的 window/document/HTMLElement 类型来源）。client 侧 M1 遗留 ts-nocheck（若有）清零。

### 5. 浏览器实弹冒烟

- 撤回按钮出现（user/steering 消息）、确认面板、toast（成功/失败/STALE 自动重预览）
- 设置页三卡：插件配置表单（9 字段 + 恢复默认 + env 锁定字段置灰）、exclude 编辑、快照树（版本家族聚族/搜索/分级删除）
- 撤回主链路实弹：preview → execute → fork → 归档 → 草稿回填（refillDraft 开/关各一遍）

## 验收标准

- `npm run build` 后 `git diff --exit-code lib/` 为零（一次性 diff 入库后）
- `npm test` / `npm run typecheck` / `npm run verify:host` 全绿
- 冒烟清单逐项通过（结果记录到本文件实施记录区）
- `@ts-ignore` 零残留；ts-nocheck 全仓清零

## 风险与回退

| 风险 | 对策 |
| --- | --- |
| `__ModuleLoader__` 全局类型与真实 loader 漂移 | client-contract.ts 以 dsh-contract.md 52 slot 建档为准；冒烟实弹兜底 |
| esbuild 对 .ts 入口产物与预期不符（包裹格式变化） | build-client.mjs 自带格式/id/白名单断言即冒烟；产物 diff 单独 commit 人工过目 |
| 冒烟项遗漏 | 清单与上游 §六「行为零变化」逐条对照，不跳项 |

回退：六文件 + build-client 一行 + tsconfig 一行，按 commit revert。

## 实施记录

> 2026-09-01 实施完成。基线 HEAD `59e40b0`（M6 收口）。client 六文件 `git mv` 后 .ts 化（createElement 风格保持），build-client 入口切 entry.ts，tsconfig 移除 allowJs 收终态（strict + noEmit + include src/**/* 与 tests/types/**/*）。

### 逐文件落地

| 文件 | 类型化要点 |
| --- | --- |
| util.ts | `ReactApi = typeof import('react')`；`UtilApi` 工厂返回接口（api 泛型、messageFor、ensureInit 等）；clockText/sizeText/bytesToMb/buildTree 纯函数签名（buildTree 构建期 Map + 终态数组分离）；TreeWorkspace/TreeSession 接口 |
| app.ts | nextShadowPriority 接 SlotEntryOptions（`{ options: { key, priority } }`——client-contract 实测修正）；createApp(ReactApi) 返回 apply(ctx: ClientContext)；styles ctx.get<StylesService> |
| recall-node.ts | KIND_INFO 的 ChangeKind 联合；ChangeCounts/summaryText；RecallStage 状态机判别联合（idle/loading/error/confirm/executing/done）；RecallNodeApi；api 泛型标注（SnapshotInfoResponse/PreviewResponse/ExecuteResponse）；renderMessageImages 断言为 ReactNode 返回 |
| settings-cards.ts | groupByLineage 返回 Map<string, FamilyInfo>；ConfigDraft 草稿形状；ManageCard/ConfigForm/ExcludeCard/SectionToggle 组件 props/state 全量；api 精确响应类型（ManageListOk/ManageTitlesOk/ManageMessagesOk/ManageUsageOk/ManageLineageOk/ConfigGetResponse 等）；sessionsSvc.list.getSnapshot 探测（client-contract 补 list?） |
| entry.ts | M1 ts-nocheck 移除（__ModuleLoader__ 全局类型已由 client-contract declare global 提供）；factory 返回对象断言 ClientPluginObject；React 断言 ReactApi |
| css.ts | 纯常量，零改动 |

### 验收证据

| 验收项 | 结果 |
| --- | --- |
| `npm run typecheck`（allowJs=false 终态） | 绿：exit 0（client 六文件 strict 下全量清零） |
| `npm test` | 绿：25 文件 290 例（client-pure.test.js 零改动，vitest 解析 .js→.ts 实证延续） |
| `npm run verify:host` | 绿 |
| `npm run test:probe` | 绿：31 例 |
| build 后 `git diff --exit-code lib/` | 一次性 client.js 产物 diff 入库后为零（37+/30-，类型擦除 + import type 移除；build-client 包裹格式/id/react-only require 白名单断言通过） |
| `@ts-ignore` / ts-nocheck | 全仓清零（`grep -rn "@ts-ignore|@ts-nocheck" src/` 为零） |

### 浏览器实弹冒烟

见下方「冒烟记录」节（M7 冒烟清单逐项结果）。

### 偏离与备注

- client-contract.ts 的 SlotEntryOptions 实测修正为 `{ options: { key?, priority? } }`（slots.entries 返回包装对象）；ClientSessionsService 补 `list?: { getSnapshot(): { byId? } }`（settings-cards 切换版本会话探测）。
- 临时批量补丁脚本（_tmp-m7-*.mjs）执行后已删除。
- client.js 产物 diff（M6-2 之后 + M7 入口 .ts 切换）为两段一次性重建的合并：均与行为无关（类型擦除、import type 移除、esbuild 确定性重建）。
- 复审修订（2026-09-02）：
  - api-contracts.test.ts 补齐 client 侧双向绑定（12 端点 × 双向互赋值断言）；routes-manage 的 exclude-get/config-get/config-reset 随补标注声明响应类型，config-set 内联返回类型收紧为 `ConfigSetResponse`——routes-manage 全端点与 routes-core 对齐「响应接 types/api.ts」
  - client-contract 的 `archiveSession` 收紧为 `Promise<unknown>`，recall-node 调用点回改为直接 `.catch`（去掉 `Promise.resolve` 防御性包装，恢复迁移前行为：非 thenable 返回属官方契约漂移，当场暴露而非静默吞掉）
  - settings-cards ConfigForm 提前返回改 `!draft || !baseline` 一并收窄（draft/baseline 同生同灭），渲染区四处 `baseline!` 非空断言移除

## 冒烟记录

> 2026-09-01。冒烟对象：本机 profile 双模式中的 link 模式（`~/.dsh/profiles/web/package.json` 依赖 `link:<本仓库>`）——M7 产物（lib/client.js）即工作区构建产物，重启 dsh-web 生效。

| 冒烟项 | 结果 |
| --- | --- |
| 撤回按钮出现（user/steering 消息）+ 确认面板 + toast | ~~见下方「环境判定」~~ → **实弹通过**（见下方 2026-09-02 实弹记录） |
| 设置页三卡（配置表单 9 字段/排除编辑/快照树） | ~~见下方「环境判定」~~ → **实弹通过**（同上） |
| 撤回主链路实弹（preview→execute→fork→归档→回填，refillDraft 开/关） | ~~见下方「环境判定」~~ → **实弹通过**（同上） |

### 环境判定（2026-09-01 延期记录，替代验证链原文保留）

本机 DSH 活体环境无法在当前会话内完成端到端实弹冒烟：`dsh web` 启动 + 真实会话发消息（触发 LLM 调用与快照）依赖人工在 DSH 界面操作，自动化代理无法代替「用户发送消息」这一触发步骤。已完成的替代验证链：

1. **产物质量机器化冒烟**：build-client.mjs 自带断言（`__ModuleLoader__.load` 注册、factory(参数) 包裹、`require("react")`、注册 id 字面量 `"dsh-recall-plugin"`、除 react 外无裸 require）全数通过——.ts 入口产物格式与 loader 契约钉死。
2. **装配门禁**：verify:host 全绿（消费 lib/index.js 产物）。
3. **行为零变化的双保险**：M2/M4/M5/M6 各阶段产物逐字一致已由 freshness 门禁与人工 diff 核对；本次 client.js 产物 diff 逐行过目（37+/30-，仅类型擦除/import type 移除，无逻辑变化）。
4. **冒烟前置链**：撤回 UI 的交互逻辑（preview→execute→fork→回填）全部由单测钉住的纯函数（summaryText/groupByLineage/buildTree/nextShadowPriority/clockText/sizeText）+ 上述产物契约断言覆盖。

**结论（2026-09-01）**：M7 代码与产物验收全绿；浏览器实弹冒烟在具备可用 DSH 交互环境时补做（按本文件「冒烟清单」逐项执行，结果回填本节）。此为本阶段唯一未当场执行项，已在实施记录明示。

### 实弹冒烟记录（2026-09-02 补做，A–D 全部通过，M7 冒烟验收闭环）

**环境**：复审修复（e1c6d34）入库后 `npm run build` 重建，`git diff lib/` 零差异、typecheck / 单测 290 例复跑全绿。profile 当时处于 npm 模式（发布 2.3.1 后的验证残留），按 AGENTS.md 标准流程切回 link 模式（`link:D:/workspace/dsh-plugin/dsh-recall-plugin` + pnpm install），工作区 junction（schemastery/dsh-settings）在位。`dsh web --no-open --port 7777` 启动（token 认证 URL 进入）。冒烟工作区 `D:\workspace\dsh-plugin\test`（复用既有工作区，未改 workspace.json 注册表；「添加工作区」的原生目录选择器无法自动化）。`DSH_RECALL_GC_SNAPS/HOURS` 未设置（C-1 env 锁定项按任务约定跳过并注明）。界面操作经浏览器自动化完成，全程截图 + DOM 双证据留档。

**A. 撤回按钮与确认面板 — 通过**

1. 发送改动文件的消息 → Host 快照即触发（index 新增 `d1bb3a74`），消息气泡旁渲染「撤回」按钮（tooltip「整段回退：文件与对话一并回到该消息之前」）。本会话无 steering 消息，按钮覆盖以 user 消息验证（key 覆盖 user+steering 的 I5 不变量未变）。
2. 确认面板：标题「整段回退」、含安全快照与归档说明文案、变更清单「修改 data.csv / 修改 notes.md」与实际 diff 逐项一致（预览对手动改动的识别同样正确）。
3. 取消 → 面板关闭，磁盘核实文件未被回退。

**B. toast 三分支 — 通过**（两处与任务措辞的差异经核实均为迁移前既有设计）

1. **成功**：确认回退 → 「正在回退…」进度态 → 「回退完成 / 项目已恢复到发送该消息时的状态。」通知卡。注：成功反馈为会话流内通知卡、不含变更计数——文案与迁移前 JS 源码（59e40b0 `recall-node.js:105/109`）逐字一致，非迁移回归。
2. **STALE 自动重预览**：预览打开期间手动改 notes.md → 确认 → Host 树指纹比对判 STALE → 不执行回退（磁盘核实）→ 自动重新预览：先「正在计算变更…」过渡态，面板刷新为新清单（修改 2：data.csv + notes.md）。注：设计上无独立「已过期」toast，STALE 的可见行为即自动重预览回到确认阶段（`recall-node.ts:318-334`，与迁移前一致）。
3. **失败（方式一：设置页删快照后撤回）**：删除该消息快照后点撤回 → 「无法回退 / 该消息没有可用的项目快照」错误面板，可行动中文文案、无堆栈。注入结束已恢复原状（exclude.txt 清空回零字节）。

**C. 设置页三卡 — 通过**

1. **配置表单**：9 字段全部渲染（启用快照/gc 条数 50/gc 小时 24/文件上限 100MB/总量上限 500/保留天数 0/回填 ✓/归档 ✓/baseExcludes 折叠编辑器），值与 DEFAULTS 一致；修改字段保存 → 绿色「已保存并即时生效」；「恢复默认」→「已恢复默认值」提示、表单回到默认值、settings.yaml 落盘为 `dsh-recall: {}`。
2. **exclude 编辑**：快速添加「tmp-m7/」→ 保存 → 磁盘 exclude.txt 原样写入（无规范化/引号处理）；基础排除（dist/ 等 chips）为 config baseExcludes，与 exclude.txt 分离存储（设计如此）。测后清空恢复原状。
3. **快照树**：工作区 → 会话 → 快照三级展示；版本家族聚族正确——本轮冒烟产生的 fork 链（7a913d95→0bf38aef→c44b1735→936d6485）标 v1/2、v2/2，旧链 v1/3～v3/3，与 lineage.json 一致；搜索「notes.md」过滤（9→3 条）；单条删除（叶子级，二次确认）→ 列表与磁盘同步；会话级删除 → index 条目与 git message tag 集合对账完全一致（9=9）。工作区级/deleteAll 未执行（会清空后续测试所需的全部快照，其与单条/会话级共用 manage purgeTags 分块路径）。

**D. 撤回主链路（refillDraft 开/关）— 通过**

1. **开（默认）**：撤回执行 → 文件回退（磁盘核实）、fork 新会话（lineage 新增记录 + 侧栏新会话**继承原标题无「2」递增**，I6 ✓）、原会话归档从侧栏消失、被撤回消息文本回填输入框 ✓。
2. **关**：配置表单关闭并保存后撤回，**初次仍回填**——根因为 client `pluginConfig` 在 ensureInit 时一次性读取（`util.ts:181-192`），页面加载后保存的配置需刷新页面生效；与迁移前 JS 源码（59e40b0 `util.js:143-154`）逐字一致，属既有设计非迁移回归。刷新页面重新 init 后再走完整一轮：输入框保持空 ✓，其余行为（文件回退/fork/归档）与开态一致。
3. **磁盘对照**：每轮撤回后 notes.md/data.csv 内容与预期逐字一致；每次 execute 均先落 `snap-pre-rollback-<ts>` 安全快照 tag（H1 救援点在位）；lineage.json 每次 fork 均有记录。

**Console**：本自动化浏览器无 DevTools Console 通道，无法逐条收集 console error（如实记录）。替代证据：全程无任何 dsh-recall 相关错误横幅/空白区/链路中断；Host 日志无插件相关报错；撤回 UI 与设置三卡数十次交互均正常渲染完成。

**观察（非阻塞，均与迁移无关）**：

- manage list 30s 缓存：删除后列表条目在点「刷新」前仍显示（PF-6 已知设计，刷新后即一致）。
- DSH↔模型 API 两次 400（`messages.role: developer` 不被上游支持）：与插件无关的环境问题，期间插件的快照与撤回按钮渲染不受影响。
- 首条消息发送后 index 出现一条额外快照：首轮 400 失败后 DSH 自动重试触发重复 user 事件所致，符合「每条 user 消息事件拍一次快照」设计。

**结论**：冒烟清单 A–D 逐项通过，M7 验收标准「冒烟清单逐项通过」**就此闭环**；TS 迁移未引入可观察的行为差异。
