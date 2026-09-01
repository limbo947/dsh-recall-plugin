# TS 迁移 M6：工厂与接线层 .ts 化 + strict 全量

> 状态：待实施 ｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M6/8
>
> 一句话：六个工厂/装配文件类型化，tsconfig 收紧 strict 全量，host 侧类型化收官。

## 目标

`store / snapshots / maintenance / routes-core / routes-manage / index` 六文件转 `.ts`（各文件整体迁移，含其模块级纯逻辑导出）；`strict: true` 全量开启；`verify:host` 装配门禁全绿。

## 前置

M4、M5 完成（被依赖的纯逻辑与模板已类型化）。tsconfig 此时仍为迁移期形态（`allowJs: true`，因 client 侧仍是 `.js`）。

## 任务分解

### 1. `types/state.ts` Runtime 接口定稿

按六文件实际消费面补齐 `Runtime`（rt）：`runShell(cmd: string): Promise<string>`、`scripts: PwshScripts | PosixScripts`、`state: SharedState`、`recordError(text: string): void`、`ensureGit` 及 store.js 其余导出（root/git 解析、selectPosixHomeBase 等纯函数单独标注）。`createRuntime` 返回类型即 `Runtime`，六文件签名统一消费它。

### 2. 六文件类型化（建议顺序：store → snapshots → maintenance → routes-core → routes-manage → index）

- `store.ts`：`createRuntime` 工厂 + 模块级纯逻辑（parseCleanupResult/isTmpConsumedError/selectPosixHomeBase/resolvePosixHomeBase）标注；`checkScriptParity` 的 SKIP 集合保持运行时值，类型侧已由 M5 锁死
- `snapshots.ts`：整文件迁移——模块级纯逻辑（parseSkipped/parseChanges/scanCutSeq/parseDiffOutput/parseTreeId/isSafetySnapshotId/parseTagsWithTime）与 `createSnapshots/rescueRollback` 工厂一次完成；payloads/state/scripts 类型全面接入；兼容分支（rebuildOrphans 守卫、indexTruncated 跳过重build）用可选字段/联合显式建模
- `maintenance.ts`：`createMaintenance` + selectOverLimitVictims/selectExpiredVictims 纯函数
- `routes-core.ts` / `routes-manage.ts`：端点 handler 接 `types/api.ts` 请求/响应类型；errBody 构造处 `code: ErrorCode` 锁死（动态构造对象以 errBody 形状为断言主体，上游 §4.2）
- `index.ts`：装配入口——`apply(ctx, config)` 的 ctx 用 dsh-contract.ts 依赖面接口（inject 声明的服务最小化建模）；`Config` re-export 保持；`name` 字面量不变

### 3. tsconfig 收紧 strict 全量

`"strict": true`（`allowJs` 保留至 M7）。strict 暴露的可空路径/隐式 any 逐处处置：显式联合/可选建模优先；非空断言必须注释理由；**禁止为消错改运行时行为**。

### 4. tests/types 补两个契约断言

- `parse-contracts.test.ts`：dump/parse 函数返回结构 `satisfies` payloads.ts（双向：解析器产出 ⊆ 类型，类型字段 ⊆ 解析器产出）
- `api-contracts.test.ts`：client util 请求/响应类型与 routes errBody 形状对偶绑定（client 侧 M7 才转 .ts，此处先绑 host 侧返回形状 + 类型对偶声明，M7 补 client 侧双向）

### 5. 清零 host 侧 M1 遗留豁免

M1 临时 `// @ts-nocheck` 清单（host 侧剩余文件）随各自文件迁移逐一移除；清零是本阶段验收项。

## 验收标准

- `npm run verify:host` 装配门禁全绿（inject 声明/端点注册/Config schema/settings 接入/卸载清零）
- `npm test` / `npm run typecheck`（strict 全量）/ 本机 `test:probe` 全绿
- `npm run build` 后 `git diff --exit-code lib/` 为零
- host 侧 ts-nocheck 清零、`@ts-ignore` 零新增

## 风险与回退

| 风险 | 对策 |
| --- | --- |
| strict 暴露存量可空路径，处置不当改行为 | 只许显式建模；每处非空断言注释理由，评审逐条过 |
| strict 全量开启回溯性波及 M4/M5 已类型化文件（它们在宽松基线下写成，strict 报错面不限于本阶段六文件） | 与六文件同批处置，纪律同上（显式建模、禁改行为）；报错量超出预期时，把 M4/M5 文件的 strict 修正拆成独立 commit 先行，保住六文件迁移的 commit 边界 |
| 旧版兼容分支（0.1.1-rc.2 ↔ 0.1.2-alpha.x）误删 | index.ts settings 接线分派等兼容注释标注处，类型用联合/可选表达，探针继续钉真实实例 |
| 六文件同阶段回归面偏大 | 按建议顺序小步提交（每文件一 commit），任一文件出问题单独 revert |

回退：按文件粒度 revert；tsconfig strict 开关本身单独 commit 便于回退。
