# TS 迁移 M4：纯逻辑文件 .ts 化（config/errors/diagnostics/dump-parse/session-info）

> 状态：待实施 ｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M4/8
>
> 一句话：五个纯逻辑文件转 `.ts`，DEFAULTS 双份同步与 errors 码表率先进入编译期锁死。

## 目标

`config / errors / diagnostics / dump-parse / session-info` 五文件类型化；行为零变化（只加类型与标注，不改逻辑）。

## 前置

M3 完成（types/ 可消费）。`snapshots` 不在本阶段——其工厂与模块级纯逻辑同文件，整体归 M6（上游 §五 裁决）。

## 任务分解（逐文件）

每文件统一流程：`git mv src/host/<name>.js src/host/<name>.ts` → 类型化 → 该文件涉及的 M1 临时 `// @ts-nocheck`（若有）移除。build-host.mjs 入口 `.ts` 优先解析，构建脚本零改动；单测 import 的 `.js` 后缀由 vitest 自动解析到 `.ts`（已实证），测试文件零改动。

### 1. `errors.ts`

- 18 个常量保持运行时值不变（线上契约），`ALL_CODES` 保持 frozen array
- 类型增量：`export type ErrorCode = (typeof ALL_CODES)[number]`，供 `types/api.ts` 的 errBody 引用
- errors.test.js 的一致性扫描断言保持全绿

### 2. `config.ts`

- `Config` schema 运行时零变化（cordis 入口校验与 settings 注册双角色，改构造方式即事故）
- **DEFAULTS 单源收敛**（上游决策表）：schemastery 实例无公共默认值遍历 API，派生不可行，采用类型镜像方案——`export const DEFAULTS: ResolvedConfig = { … }`，以 `ResolvedConfig`（types/config.ts）标注钉住形状；schema 增删字段时 `ResolvedConfig` 同步改，漏改 DEFAULTS 编译期报错。`createConfig(raw: RawConfig): ResolvedConfig`
- config.test.js（createConfig/DEFAULTS 断言）全绿兜底

### 3. `diagnostics.ts`

- 拆两个 kind 联合（现状实测：`classifyEnvError` 命中返回 5 类、未命中返回 **null**；`buildFeedbackError` 未命中时补 `kind: 'unknown'`——「未分类」在读取侧与反馈侧的表达本就不同，类型化不许顺手统一）：
  - `EnvErrorKind = 'git' | 'space' | 'permission' | 'lock' | 'mkdir'`——成员以 classifyEnvError 实现与 diagnostics.test.js 断言为唯一来源，先读实现再定联合，禁凭记忆
  - `FeedbackKind = EnvErrorKind | 'unknown'`——snapFeedback 条目的 kind 字段类型；types/payloads.ts 与 types/state.ts 中 M3 内联的 kind 字面量本阶段同步改为 `import type` 引用，单一事实源落本文件
- `ENV_HINTS: Record<EnvErrorKind, string>`——键集与 EnvErrorKind 编译期互锁，漏提示即报错（unknown 无提示文案，不入此表；若把 unknown 塞进 EnvErrorKind，Record 缺键即编译报错，这正是拆两个联合的原因）
- 签名标注：`classifyEnvError(text: string): EnvErrorKind | null`、`buildFeedbackError(raw: unknown): { error: string; kind: FeedbackKind }`

### 4. `dump-parse.ts`

- `parseStoresDump / parseExcludeDump` 返回类型 `satisfies` payloads.ts 的 RootRecord / ExcludeFile 形状
- 解析容错分支（脏行跳过、截断容忍）保持现状，类型用可选字段表达

### 5. `session-info.ts`

- `titleFromEvents / messageTextFromEvents` 的事件参数用 dsh-contract.ts 的会话事件信封类型；`createSessionInfo` 工厂签名（ctx 依赖面最小组化：只声明实际消费的 sessions/sessionQuery 字段）

## 验收标准

- 相关单测全绿（config / errors / diagnostics / stores-dump / exclude-dump / session-info，及间接引用方 snapshots-persist、routes-stale 等）
- `npm run typecheck` 绿；`npm run build` 后 `git diff --exit-code lib/` 为零
- 本阶段 host 侧 M1 临时豁免（ts-nocheck）清零

## 风险与回退

| 风险 | 对策 |
| --- | --- |
| DEFAULTS 与 schema 漂移死灰复燃 | ResolvedConfig 标注 + config.test.js 双锁；schema 改字段时类型报错即提醒 |
| EnvErrorKind 成员凭记忆遗漏 | 以 classifyEnvError 实现与 diagnostics.test.js 断言为唯一来源 |
| 类型化顺手「优化」逻辑 | 评审红线：diff 中除类型标注/ import type 外不得有逻辑变化 |

回退：五文件独立小步提交（每文件一个 commit 或域内单 commit 均可），revert 即还原。
