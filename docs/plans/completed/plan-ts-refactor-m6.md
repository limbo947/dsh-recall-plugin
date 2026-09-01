# TS 迁移 M6：工厂与接线层 .ts 化 + strict 全量

> 状态：已完成（2026-09-01 实施）｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M6/8
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

## 实施记录

> 2026-09-01 实施完成。基线 HEAD `ea65fed`（M5 收口）。六文件 `git mv` 后整体类型化 + strict 全量开启 + tests/types 补两个契约断言；host 侧 M1 豁免清零（store.ts 的 ts-nocheck 随迁移移除）。

### Commit 边界（M6 两个独立 commit）

| commit | 内容 |
| --- | --- |
| M6-1 | 六文件 .ts 化（store/snapshots/maintenance/routes-core/routes-manage/index）+ types/ 接入修正 + tsconfig strict 全量 + tests/types 两个契约断言 + 6 个 host 产物 diff |
| M6-2 | lib/client.js esbuild 重建一次性 diff（当前 esbuild 输出 vs 存量产物：`"use strict"` 前缀 + TDZ 作用域处理的 dismiss 重命名；src/client 未动，与 M6 无关的确定性重建，M7 预期 client 产物 diff 提前发生） |

### 逐文件落地

| 文件 | 类型化要点 |
| --- | --- |
| store.ts | Runtime 接口定稿（state.ts）；模块级纯逻辑（selectPosixHomeBase/resolvePosixHomeBase/parseCleanupResult/isTmpConsumedError）标注；平台专属成员断言 `(scripts as PwshScripts).homeDirScript` / `(scripts as PosixScripts).probeHomeScript`（豁免集结构化收口）；checkScriptParity 的 Object.keys 断言回 Record 读取 |
| snapshots.ts | 纯逻辑 9 函数 + 工厂全部标注；`DiffResult`/`RollbackResult`（判别联合）/`RescueDeps`/`RescueOpts`/`SnapshotsApi` 接口；SnapshotFeedback 联合读取侧靠 payloads.ts 互补 `?: undefined` 字段（见下） |
| maintenance.ts | selectOverLimitVictims/selectExpiredVictims + MaintenanceApi；Map 守卫后非空断言 |
| routes-core.ts | RoutesCoreDeps 接口；六端点 args/响应接 types/api.ts；execute 内 enqueue 回调显式返回联合（`{ok:true,count} | ErrBody`）；errBody 断言读取 message |
| routes-manage.ts | RoutesManageDeps 接口（list/exclude/usage cache holder 精确类型）；manage 端点 args 接 ManageArgs、响应 ManageResponse；settings ctx.get<SettingsService> 断言；deleteSnapshotsByFilter 的 match 谓词类型 |
| index.ts | apply(ctx: HostContext, config: ResolvedConfig)；enqueue<T> 泛型（state.queue 链尾哨兵断言回 Promise<void>）；readJsonBody/sendJson 接 HttpRequest/HttpResponse；agentBusy/listExcludeFiles/collectCwds/dumpStores/locateSnapshotOnDisk/collectAllSnapshotRecords 标注 |

### types/ 接入修正（M6 期间随接入调整）

- `payloads.ts`：SnapshotFeedback 联合成员补互补 `?: undefined` 字段（saveIndex/loadIndex/setFeedback 的 `fb.failed`/`fb.skipped` 跨成员读取在 strict 下需要显式 undefined 建模；运行时形状与互斥不变）
- `scripts.ts`：ScriptStore 改为全必填（storeFromDir/makeStore 恒全量具备，宽松可选反而掩盖漂移）
- `api.ts`：ErrorCode 改引 errors.ts 派生（M4 as const 补全）；InitResponse.config 可选（unsupported 分支缺省）；新增 ManageDeleteAllPartial（deleteAll 部分完成的 deleted 随错误体回传）
- `dsh-contract.ts`：新增 HttpRequest/HttpResponse（webServer 前缀路由实际消费面）；SettingsService 补 describe/update/replace/writable
- `state.ts`：Runtime 定稿 + EnsureGitResult + cutSeqCache 值含 null

### strict 关键处置（每处均行为等价，diff 红线复核通过）

- `gitExe: string | null` → 脚本调用处 `|| ''`：等价依据是 ensureGit 前置拦截使 null 不可达——即便走到，旧代码插值 `'null'`（psq 不特殊处理 null）与新代码 `''` 都只是必败命令的文案差异，不改变结果。（复审修订：原论证「psq(null) 与 psq('') 同为空串」有误，特此更正）
- store 可空路径：`state.stores.get(root) || null` + 守卫 continue（原 JS 已是守卫语义）
- errBody/rescueError/error.message 读取：`as { message?: string } | null | undefined` 断言（未命中保持 String(error) 原文）
- `resolvePosixHomeBase` 参数解构外提（deps/inputs 两参显式化，行为等价）
- `liveMessageTextFast(sessionId || '', id)` 等调用点补 `|| ''`：等价依据是 Map 键 `"null\0id'`（旧代码 String 化拼接）与 `"\0id"` 同样查无此键、走同一兜底路径。（复审修订：原论证「String 化亦为空」有误——String(null) 是 "null"，特此更正）
- 三处控制流守卫经复审（2026-09-02）回改为非空断言 + 注释，保持迁移前控制流：routes-core init 的 `ensureGit(root, store!)`、index 预热链的 `ensureGit(cwd, store!)`、routes-manage 删除分支的 `finalRoot = snapRoot!`。原 `if (store)`/`finalRoot &&` 守卫会把「null 时 ensureGit 内抛错中断、后续步骤跳过」的旧语义改为静默继续，虽因 resolveStore 恒返 store 而不可达，仍按「禁改运行时行为」红线回改
- routes-core 的 `rescueRollback` 经复审改为 `typeof import('./snapshots.js').rescueRollback` 类型查询（原运行时导入仅为 typeof 服务，产物留死导入并迫使解构改名 rescueRollback2）

### 验收证据

| 验收项 | 结果 |
| --- | --- |
| `npm run typecheck`（strict 全量） | 绿：exit 0（113 处 strict 报错全部显式建模清零，`@ts-ignore` 零新增） |
| `npm test` | 绿：25 文件 290 例（captureSnapshot 两失败入口测试在 store 断言收口后恢复通过） |
| `npm run verify:host` | 绿：装配断言全部通过（消费 lib/index.js 产物） |
| `npm run test:probe` | 绿：2 文件 31 例 |
| host 侧 ts-nocheck 清零 | `grep "@ts-nocheck" src/` 为零（M1 的 store.ts 豁免随迁移移除）；`@ts-ignore` 零 |
| lib/ 产物 | M6-1 后 host 6 产物 diff 为类型收口对应形态（行为等价逐条核对）；M6-2 client.js 重建 diff 单独 commit |
| tests/types | 新增 parse-contracts.test.ts（IndexEntry/LineageEntry 与 StoreDumpInfo 双向互赋值）+ api-contracts.test.ts（rescueRollback 返回落 ErrBody、ErrorCode 对偶） |

### 偏离与备注

- M5 期间 types/scripts.ts 的 ScriptStore 曾改必填，但 scripts 内部辅助函数（oversizeBlock/excludeSyncBlock/collectListsBlock 等）的返回类型标注在 M5 提交时未完全持久化，M6 strict 下补齐为 `string`/`string[]` 精确形态（模板体零改动，仅函数签名行）。
- 临时批量补丁脚本（_tmp-m6-patch-*.mjs）执行后已全部删除，git diff 复核兜底。
- M6-2 的 client.js 差异与 M6 host 迁移无因果关系：`src/client` 未动，纯 esbuild 重建输出（存量产物与当前 esbuild 的一次性迁移成本），确定性已验证（连续两次 build hash 一致）。
