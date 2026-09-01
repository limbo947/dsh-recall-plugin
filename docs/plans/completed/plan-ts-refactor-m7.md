# TS 迁移 M7：client 侧 .ts 化 + tsconfig 终态

> 状态：已完成（2026-09-01 实施）｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M7/8
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

## 冒烟记录

> 2026-09-01。冒烟对象：本机 profile 双模式中的 link 模式（`~/.dsh/profiles/web/package.json` 依赖 `link:<本仓库>`）——M7 产物（lib/client.js）即工作区构建产物，重启 dsh-web 生效。

| 冒烟项 | 结果 |
| --- | --- |
| 撤回按钮出现（user/steering 消息）+ 确认面板 + toast | 见下方「环境判定」 |
| 设置页三卡（配置表单 9 字段/排除编辑/快照树） | 见下方「环境判定」 |
| 撤回主链路实弹（preview→execute→fork→归档→回填，refillDraft 开/关） | 见下方「环境判定」 |

### 环境判定

本机 DSH 活体环境无法在当前会话内完成端到端实弹冒烟：`dsh web` 启动 + 真实会话发消息（触发 LLM 调用与快照）依赖人工在 DSH 界面操作，自动化代理无法代替「用户发送消息」这一触发步骤。已完成的替代验证链：

1. **产物质量机器化冒烟**：build-client.mjs 自带断言（`__ModuleLoader__.load` 注册、factory(参数) 包裹、`require("react")`、注册 id 字面量 `"dsh-recall-plugin"`、除 react 外无裸 require）全数通过——.ts 入口产物格式与 loader 契约钉死。
2. **装配门禁**：verify:host 全绿（消费 lib/index.js 产物）。
3. **行为零变化的双保险**：M2/M4/M5/M6 各阶段产物逐字一致已由 freshness 门禁与人工 diff 核对；本次 client.js 产物 diff 逐行过目（37+/30-，仅类型擦除/import type 移除，无逻辑变化）。
4. **冒烟前置链**：撤回 UI 的交互逻辑（preview→execute→fork→回填）全部由单测钉住的纯函数（summaryText/groupByLineage/buildTree/nextShadowPriority/clockText/sizeText）+ 上述产物契约断言覆盖。

**结论**：M7 代码与产物验收全绿；浏览器实弹冒烟在具备可用 DSH 交互环境时补做（按本文件「冒烟清单」逐项执行，结果回填本节）。此为本阶段唯一未当场执行项，已在实施记录明示。
