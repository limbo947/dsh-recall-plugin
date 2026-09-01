# TS 迁移 M3：src/types/ 七个类型文件全建

> 状态：已完成（2026-09-01 实施）｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M3/8
>
> 一句话：把目前只活在注释里的契约（DSH 依赖面、payloads、共享 state、scripts 契约、API 形状）建档成唯一类型事实源。

## 目标

`src/types/` 七个文件全部建成，仅类型导出（上游 §2.3 纪律，`verbatimModuleSyntax` 编译期强制）；每个文件头注释注明事实来源。本阶段纯增量，不触碰任何运行时代码。

## 前置

M2 完成（`src/host/` 就位，tsconfig 迁移期形态）。

## 通用纪律

- 全部文件仅 interface / type / declare module / 字面量类型导出；共享运行时常量继续住各域源文件。
- 消费侧（M4 起）一律 `import type`，转译后零运行时引用。
- 兼容字段建模原则：读取侧字段全部可选化——旧版本插件读新索引要忽略未知字段（payloads 的既有兼容纪律）。
- 事实来源优先级：`docs/dsh-contract.md` > 源码现状 > 单测钉住的形状（如 snapshots-persist.test.js 的索引条目形状）。

## 任务分解（七文件）

### 1. `config.ts`（来源：src/host/config.js）

```ts
export interface ResolvedConfig {
  gcSnaps: number; gcHours: number; maxFileBytes: number
  maxSnapshotsPerWorkspace: number; baseExcludes: string[]
  refillDraft: boolean; snapshotEnabled: boolean; archiveOriginal: boolean
  retentionDays: number
}
export type RawConfig = Partial<ResolvedConfig>
```

### 2. `payloads.ts`（来源：snapshots.js 读写路径 + snapshots-persist.test.js 钉住的形状）

- `SnapshotFeedback`：failed/skipped 互斥，用联合建模：`{ failed: true; error?: string; kind?: FeedbackKind } | { skipped: string[] }`。`FeedbackKind = 'git' | 'space' | 'permission' | 'lock' | 'mkdir' | 'unknown'`（前五 = classifyEnvError 命中值，unknown = buildFeedbackError 未命中回落）——事实源在 diagnostics.js，M4 在 diagnostics.ts 定义 EnvErrorKind/FeedbackKind 后本处改 `import type` 引用；本阶段先内联字面量并注释回链
- `IndexEntry`：`{ id: string; time: number; root: string; sessionId: string; feedback?: SnapshotFeedback }`（failed 条目无快照这一现状钉子：feedback.failed 条目可无对应 tag，类型上 feedback 与条目共存即可）
- `LineageEntry`：fork 关系持久化形状（来源 snapshots.js lineage-record 写入侧）
- `RootRecord`：root.txt 内容（stores dump 解析侧 parseStoresDump 的元素形状）
- `ExcludeFile`：exclude.txt 行结构

### 3. `state.ts`（来源：store.js state 块，字段一一对应）

`SharedState`：`roots/stores/snapshots: Map<string, …>`（stores 值 `{ dir: string; git: string }`，snapshots 值 `{ root: string; time: number; sessionId: string }`）、`queue: Promise<void>`、`indexLoaded/indexHealthy/indexTruncated/gitReady: Set<string>`、`cutSeqCache/homeRetryAt/gcLastAt/gcCount: Map<string, number>`、`gitExe/posixHomeBase/homeContainer: string | null`、`errors: Array<{ time: number; message: string; count: number; kind: EnvErrorKind | null }>`（recordError 直存 classifyEnvError 返回值，未命中即 null——建模不许滤掉）、`snapFeedback: Map<string, SnapshotFeedback>`。kind 联合的内联与回链策略同 payloads.ts。
另立 `Runtime`（rt）接口骨架：`runShell / scripts / state / recordError / ensureGit` 等，M6 定稿。

### 4. `scripts.ts`（来源：两套模板导出名单，已逐文件核实）

- `ScriptsCommon`：28 个共享函数签名（psq/stripBom/resolveGitScript/mkdirScript/migrateScript/ensureGitScript/snapshotScript/diffScript/rollbackScript/rescueScript/listTagsScript/listTagsWithTimeScript/gcScript/pruneScript/killOrphansScript/purgeTagsScript/fileWriteStdinCmd/renameFileCmd/indexReadCmd/lineageReadCmd/legacyRmScript/excludeReadCmd/excludeDumpScript/dirExistsScript/countObjectsScript/diskUsageScript/listSubdirsScript/storesDumpScript——已逐文件核实：pwsh 29 函数去 homeDirScript、posix 30 函数去 probeHomeScript/legacyHomeMigrateScript），返回全部 `string`，参数按现状。两侧形参个数不一时以多者为准（少参函数天然可赋值给多参类型）：diffScript 即此例——pwsh 6 参（maxChanges 控制 TOTAL 截断）、posix 5 参（TSV 全量输出，截断由 JS 侧 slice），调用方恒传 6 参（snapshots.js MAX_CHANGES），故契约声明 `diffScript(root, store, gitExe, tag, base: string[], maxChanges: number): string` 两侧同时满足
- 共享常量 5 个同名导出随契约一并锁定（上游 §七 承诺的字面量建档）：`UTF8_PRELUDE: string`、`MAX_FILE_BYTES: 104857600`、`STALE_LOCK_MIN: 5`、`HEARTBEAT_TTL_S: 900`、`FIDELITY_ATTRS: string`——scripts-contract.test.js 的 key 比对不过滤 typeof、键集含常量，类型侧若缺席会让 M5 的编译期断言比既有单测宽松
- `PwshScripts extends ScriptsCommon`：+ `homeDirScript(root: string, envHome: string): string`
- `PosixScripts extends ScriptsCommon`：+ `probeHomeScript(): string`、`legacyHomeMigrateScript(homedir: string): string`
- 哨兵字面量类型：`'SNAP_OK' | 'SNAP_SKIP' | 'TREE' | 'ROLLBACK_OK' | 'RESCUE_OK' | 'RECALL_CLEANUP' | 'CLEANUP_OTHER_INSTANCE' | 'CLEANUP_SKIPPED_FRESH_LOCK' | 'CLEANUP_DONE'` + MIGRATE_OK 四态

### 5. `dsh-contract.ts`（来源：docs/dsh-contract.md 建档的 Host 依赖面约 75 个字段）

- Host 服务接口：shell / sessions（`fork({ atSeq })`、`get`）/ sessionQuery / agents / webServer（路由注册）/ settings namespace / 会话事件信封（`{ seq, type, ... }`，51 种事件类型联合）
- 两个 ambient 模块的完整 `declare module`：schemastery（`Schema.object/number/string/array/boolean` 链式 + `.default()/.description()` 最小可用面）、dsh-settings（installSettingsSection 等 index.js 实际消费面）
- 建成后删除 M1 的 `src/types/ambient.d.ts`

### 6. `client-contract.ts`（来源：dsh-contract.md Client 依赖面 52 个 slot + src/client 现状）

52 个 slot 类型表、`__ModuleLoader__` 全局（`declare global`）、loader 模块表、conversation/styles 可选探测降级的联合类型（旧版兼容分支建模，上游风险表）。

### 7. `api.ts`（来源：routes-core/routes-manage 端点表 + errors.js）

- 端点请求/响应类型：init / snapshot-info / preview / execute / status / lineage-record / exclude-get / exclude-set / config-get / config-set / config-reset / manage
- `errBody`：`{ code: ErrorCode; message: string }`（ErrorCode 自 errors 常量派生，M4 落地 `as const` 后此处引用）

## 验收标准

- `tsc --noEmit` 绿（types 被 include 覆盖，至少通过解析与自洽检查）
- 全部文件零运行时值导出（grep `export const` 应只命中 M4 后的 errors `as const` 演进，本阶段为零）
- ambient.d.ts 已删除，dsh-contract.ts 接管

## 风险与回退

| 风险 | 对策 |
| --- | --- |
| 契约反推与真实 dsh 漂移 | 字段逐一回链 dsh-contract.md；探针（test:probe）钉真实运行实例 |
| 类型过宽（到处 any）失去意义 | 评审 checklist：unknown 优于 any；any 出现处必须注释理由 |

回退：纯新增目录，`git rm -r src/types` 即还原，零运行时面。

## 实施记录

> 2026-09-01 实施完成。基线 HEAD `339f4ba`（M2 收口）。纯增量：`src/types/` 七文件 + `ambient-modules.d.ts`，`ambient.d.ts` 删除，零运行时代码触碰。

### 七个类型文件（事实来源逐一回链）

| 文件 | 事实来源 | 备注 |
| --- | --- | --- |
| `config.ts` | src/host/config.js Config schema + DEFAULTS | ResolvedConfig/RawConfig；M4 起标注 createConfig/DEFAULTS |
| `payloads.ts` | snapshots.js 读写路径 + snapshots-persist.test.js + dump-parse.js | SnapshotFeedback 联合（failed/skipped 互斥）、IndexEntry、LineageEntry、RootRecord、ExcludeFile；EnvErrorKind/FeedbackKind 内联占位（M4 改 import type） |
| `state.ts` | store.js createRuntime state 块（字段一一对应）+ index.js rt 消费面 | SharedState + StoreInfo/SnapshotInfo/ErrorRecord + Runtime 骨架（M6 定稿） |
| `scripts.ts` | 两模板导出名单逐文件核实 | 28 共享函数 + 5 共享常量 + 哨兵字面量；PwshScripts(+homeDirScript)/PosixScripts(+probeHomeScript/legacyHomeMigrateScript) |
| `dsh-contract.ts` | docs/dsh-contract.md §1/§3/§4 | Host 服务接口 + 51 事件类型联合 + 事件信封；schemastery/dsh-settings ambient 见下 |
| `client-contract.ts` | dsh-contract.md §二（52 slot）+ src/client 现状 | SlotName 联合、ChatNodeProps（node/renderMessageImages/sessionId）、__ModuleLoader__ declare global、conversation/styles 可选探测、ClientContext |
| `api.ts` | routes-core/routes-manage 端点表 + errors.js | 12 端点请求/响应 + errBody；ErrorCode 内联 18 码（M4 as const 后改引用） |

### 偏离（1 项，已在文档结构落实）

- **ambient 拆独立文件**：`declare module` 在带顶层 import 的模块文件（dsh-contract.ts 有 `import type`）里是 module augmentation，TS 禁在其内 export 新符号（TS2666，实测报错）。两个私有 peer 包的环境模块声明因此移入全局脚本文件 `src/types/ambient-modules.d.ts`（无 import/export），dsh-contract.ts 保留全部类型面并在注释中回链该文件。计划原文「ambient.d.ts 已删除，dsh-contract.ts 接管」落实为「ambient.d.ts 删除、ambient-modules.d.ts 接管 + dsh-contract.ts 类型面」，语义不变（依赖面仍单一类型源）。

### 验收证据

| 验收项 | 结果 |
| --- | --- |
| `tsc --noEmit` | 绿：exit 0（修正 TS2666/TS2300 后；两处报错均为 declare module 迁移所致，见偏离） |
| 零运行时值导出 | `grep "export const" src/types/` 为零；仅 ambient-modules.d.ts 内 `declare module` 块含 `export function`（环境声明，非运行时导出） |
| ambient.d.ts 已删除 | 已删，被 ambient-modules.d.ts + dsh-contract.ts 取代 |
| `npm test` | 绿：25 文件 290 例（连续 4 次复跑稳定） |
| build 新鲜度 | `npm run build` 后 `git diff --exit-code lib/` 退出码 0（类型文件不参与 host 构建，产物零变化） |

### 环境备注

- 首次合并跑「npm test + npm run build」时单测出现过一次瞬时 1 文件失败/3 skipped（该次运行耗时 14.8s，为正常 3 倍，疑似系统负载），其后 4 次复跑全绿（290/290）。本阶段零运行时代码改动，判定为环境性 flake，非回归。若后续复现，排查方向：package-layout 的 npm pack 在重负载下偶发超时。
