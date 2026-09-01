# TS 迁移 M7：client 侧 .ts 化 + tsconfig 终态

> 状态：待实施 ｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M7/8
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
