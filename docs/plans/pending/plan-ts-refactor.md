# dsh-recall-plugin 重构计划（JS → TypeScript）v3.2

> 状态：待实施（v3.2 评审修订版，评审通过即启动 M1） ｜ 上游文档：[improvement-plan.md](../improvement-plan.md)
>
> 事实基准：仓库 HEAD `10f5e61`（2.3.1），2026-09-01 逐文件复核。
>
> 目标形态：同形态复刻——功能与对外契约保持不变，将源码整体迁移为 TypeScript，用编译期类型锁死目前仅靠注释与测试维持的契约一致性。

---

## 修订记录

- **v1 → v2**：按仓库现状逐文件核对。测试规模更新为 25 个单测文件 + 2 个探针；`store.js` 保持原名（撤回 `runtime.ts` 改名）；client 改为 `.ts` + createElement 风格（撤回 `.tsx`）；构建方案改为逐文件转译以保住包布局零变化；删除 `.d.ts` 产出；里程碑重排为 M1–M7。
- **v2 → v3**（评审修订）：修正不变量 3 的 files 白名单表述、package-layout 断言的引用与措辞、`lib/` 文件构成描述；消解 M4/M6 对 `snapshots` 的归属矛盾；补 tsconfig 两阶段演进；vitest `.js`→`.ts` 解析风险经 spike 实证消解（2026-09-01，vitest 4.1.11）；新增 M8 文档同步；风险表补本地工作流条目；按 docs 规范归位 `plans/pending/` 并挂总索引。
- **v3 → v3.1**（实施文档拆分）：修正 tsconfig 演进细节——M2 必须保留 `allowJs`（否则 include 下无 TS 输入报 TS18003），`allowJs` 延至 M7 全部源文件 .ts 化后移除；里程碑拆出 M1–M8 实施文档（同目录 `plan-ts-refactor-m1..m8.md`）。
- **v3.1 → v3.2**（评审修订，2026-09-01）：M1 tsconfig 补 `exclude`（lib/client.js 产物，豁免机制对重建产物无效）与 DOM lib（client 浏览器全局，M7 必需）；M3/M5 共享函数计数 26→28（实测）并补 5 个共享常量入 scripts 契约（对齐 §七 承诺与 scripts-contract.test.js 键集口径）；diagnostics 拆 `EnvErrorKind`/`FeedbackKind` 双联合（`Record` 互锁与 `'unknown'` 冲突）；state.errors 的 kind 修正为 `EnvErrorKind | null`；M5 豁免集断言改 `Record<键联合, true>` 字面量双向闭环；M2 补中间 commit 非绿说明与 exclude 移除；M6 风险表补 strict 回溯性波及 M4/M5。

---

## 一、背景与目标

### 1.1 项目现状

[dsh-recall-plugin](https://github.com/limbo947/dsh-recall-plugin) 是 DeepSeek Harness（DSH）的官方消息撤回插件：在用户消息旁挂「撤回」按钮，用独立影子 git 仓库保存工作区快照，配合官方 `sessions.fork` 把文件与对话一起回退到消息发送之前。

全仓约 1.2 万行（实测 11838）。测试是回归主力：`tests/unit/` 25 个文件 + `tests/probe/` 2 个探针，合计约 3.6k 行。源码分两处：`lib/` 共 14 个文件——13 个 host 源文件（约 5.9k 行）加 `lib/client.js`（client 构建产物，随源码提交）；`src/client/` 6 个源文件（约 1.6k 行）。三层结构：

| 层 | 位置 | 技术约束 |
| --- | --- | --- |
| Host 服务端 | `lib/`（13 个源文件） | 必须是 cordis 4 插件（`apply(ctx)`），运行于 DSH 的 Node 进程 |
| Client 浏览器端 | `src/client/` | 必须走 `window.__ModuleLoader__.load` + React 单文件 CJS bundle |
| 跨平台执行层 | `lib/scripts.pwsh.js` / `lib/scripts.posix.js` | PowerShell/bash 脚本模板函数，与语言无关 |

### 1.2 重构动机

当前代码高度依赖「两处必须人工对齐」的不变量，全部只靠注释与测试维持：

- 双平台脚本模板必须导出同名接口（单侧漏导出只会在另一平台用户机器上暴雷；运行时靠 `checkScriptParity` 手工比对兜底，豁免集 `SKIP = {homeDirScript, probeHomeScript, legacyHomeMigrateScript}` 在 store.js 与 scripts-contract.test.js 两处各自维护——三者实为平台专属导出：pwsh 独有 `homeDirScript`，posix 独有 `probeHomeScript`/`legacyHomeMigrateScript`）
- 脚本哨兵字符串（`ROLLBACK_OK` / `RESCUE_OK` / `SNAP_SKIP` / `TREE` / `RECALL_CLEANUP` / `MIGRATE_OK` 四态等）与解析函数逐字呼应
- `index.json` / `lineage.json` / `exclude.txt` 的兼容字段结构（旧版本插件读新索引要忽略未知字段）
- DSH 各版本 API 依赖面字段（[dsh-contract.md](../../dsh-contract.md) 建档：Host 服务约 75 个、Client slot 52 个、会话事件 51 种）只活在注释里
- `config.js` 的 schema 默认值与 `DEFAULTS` 常量双份人工同步（其注释自认「改默认值两处同步改」）

类型化之后，这些约束从「靠测试发现」升级为「编译期保证」。

### 1.3 不变量（重构期间不可改变的事）

1. `package.json` 的 `main` / `exports`（`lib/index.js`、`lib/client.js`）路径不变
2. `cordis.patch.yml`、`peerDependencies` 不变
3. npm 发布 `files` 白名单（`lib` + `cordis.patch.yml` + 双语 README + `CHANGELOG.md` + `LICENSE`）不变，且 `lib/` 产物文件名与现状逐一相同（14 个文件同名同数，pack 文件集合逐一相同）
4. 既有 25 个单测 + 2 个探针全部保留为回归网
5. `docs/`、README 双语、CHANGELOG、LICENSE 原样保留——指既有内容不删不改写历史；其中涉及源码路径的描述（AGENTS.md/CODEBUDDY.md 文件地图等）在 M8 同步修订，CHANGELOG 按仓库规范追加本次工程变更条目
6. 行为零变化：快照/回退/维护/设置页功能与现状逐项一致

---

## 二、目标目录结构

文件粒度保持 1:1 迁移（含文件名），零新增抽象模块，最小化重构面。

```
dsh-recall-plugin/
├── src/
│   ├── types/                        # 跨域共享类型（本规划的核心增量，仅类型导出）
│   │   ├── dsh-contract.ts           # Host 依赖面（shell/sessions/sessionQuery/agents/
│   │   │                             #   webServer/settings/事件信封）+ schemastery 与
│   │   │                             #   dsh-settings 两个 ambient 模块声明
│   │   ├── client-contract.ts        # Client 依赖面：52 个 slot、__ModuleLoader__ 全局、
│   │   │                             #   loader 模块表、conversation/styles 可选探测降级
│   │   ├── scripts.ts                # ScriptsContract：共享接口 + 两侧平台专属扩展
│   │   │                             #   （豁免集的结构化建模）+ 哨兵字面量类型
│   │   ├── payloads.ts               # index.json / lineage.json / exclude.txt / root.txt 结构
│   │   ├── state.ts                  # 共享 state（stores/snapshots/queue/feedback/缓存 holder）
│   │   ├── api.ts                    # /api/recall/* 各端点请求/响应类型（含 errBody 形状）
│   │   └── config.ts                 # Config 全类型（schemastery schema 的运行时镜像）
│   ├── host/                         # 原 lib/ 13 个源文件，文件名 1:1
│   │   ├── index.ts                  # 装配入口（端点组装/事件接线/预热）
│   │   ├── store.ts                  # 执行与存储层（保持 store 原名）
│   │   ├── snapshots.ts              # 快照域（模块级纯逻辑 + createSnapshots 工厂）
│   │   ├── maintenance.ts            # 维护域（gc/条数上限/保留天数/会话清理）
│   │   ├── routes-core.ts            # init/snapshot-info/preview/execute/status/lineage-record
│   │   ├── routes-manage.ts          # exclude/config/manage 管理端点
│   │   ├── config.ts                 # schemastery schema + createConfig 解析
│   │   ├── diagnostics.ts            # buildFeedbackError/classifyEnvError/ENV_HINTS
│   │   ├── errors.ts                 # 错误码常量
│   │   ├── dump-parse.ts             # stores/exclude dump 解析
│   │   ├── session-info.ts           # 会话标题/消息文本两段式读取
│   │   ├── scripts.pwsh.ts           # PowerShell 模板（平铺命名，产物同名）
│   │   └── scripts.posix.ts          # bash 模板（macOS bash 3.2 兼容约束保留）
│   └── client/                       # 原 src/client/，全部 .ts，createElement 风格保持
│       ├── entry.ts                  # __ModuleLoader__ 注册（id 字面量不变）
│       ├── app.ts                    # 装配（CSS/两个 keyed slot/设置卡片挂钩）
│       ├── recall-node.ts            # 撤回按钮 + 确认面板
│       ├── settings-cards.ts         # 设置卡片（配置表单/排除表/快照管理树）
│       ├── util.ts                   # API client（返回类型绑 src/types/api.ts）
│       └── css.ts                    # 手写 CSS 常量（原样）
├── lib/                              # 纯产物目录：13 个 host 转译产物 + client.js，
│                                     #   文件名与现状逐一相同
├── scripts/
│   ├── build-host.mjs                # 新增：逐文件转译（bundle: false）
│   ├── build-client.mjs              # 入口改指 src/client/entry.ts，全部断言保留
│   ├── check-dsh-version.mjs         # 零改动
│   ├── check-upgrade.mjs             # 零改动（串联 check:dsh + test:probe + verify:host；
│   │                                 #   M8 评估是否纳入 typecheck）
│   └── verify-host.mjs               # 零改动（仍 import lib/index.js 产物）
├── tests/
│   ├── unit/                         # 25 个文件，import 路径 lib/ → src/host/
│   ├── probe/                        # 2 个探针，零改动
│   └── types/                        # 新增：编译期契约断言（tsc 消费，见 4.2）
├── tsconfig.json                     # strict + noEmit；include: src/**/* 与 tests/types/**/*
│                                     #   （终态；M1 过渡期形态见 4.2）
├── package.json                      # 增 typecheck、改 build；main/exports/files 零变化
└── .github/workflows/ci.yml          # 增类型门禁；新鲜度门禁统一覆盖全 lib/
```

初稿的 `src/host/scripts/` 子目录、`runtime.ts` 改名、client `.tsx`、`tsconfig.build.json` 均已移除，理由见第三节决策表。

### 2.1 布局裁决：逐文件转译（本次修订的核心裁决）

初稿的单入口 bundle 方案会让 `lib/store.js`、`lib/scripts.pwsh.js` 等文件在产物中消失，与 [package-layout.test.js:49-57](../../../tests/unit/package-layout.test.js) 的必需文件白名单断言（`lib/index.js`、`lib/store.js` 等 8 个运行时文件必须进包）、不变量 3 正面冲突。三案比较后采用 A：

- **方案 A（采用）**：`build-host.mjs` 以 13 个文件为独立入口、`bundle: false` 逐文件转译，输出文件名与现有 `lib/` 完全一致。package-layout 断言零改动，pack 文件集合逐一相同，cordis.patch.yml、verify-host、DSH 消费端零感知。
- 方案 B：单文件 bundle + 修改 package-layout 断言 + CHANGELOG 明示布局变化——显式推翻不变量 3，回归面放大。
- 方案 C：仅 scripts 子目录化破例——同一仓库并存两套布局规则，维护成本大于收益。

`bundle: false` 时 esbuild 原样保留 import 说明符：相对路径（`./config.js`）维持产物间互引，`@deepseek-ai/*` 裸导入逐字透传给 Node 运行时按 peerDependencies 解析，运行时依赖语义天然连续。

### 2.2 中间态的消除

初稿按域渐进迁移会产生「`lib/` 内一半源码一半产物」的中间态：已迁移域的转译产物与未迁移域的 `.js` 源码混居，已迁移文件要跨树 import 未迁移源码（`src/host/snapshots.ts` → `../../lib/store.js`），新鲜度门禁在此期间语义含混。修订为 **M2 一次性纯移动**：13 个源文件整体搬入 `src/host/`，`lib/` 自此始终是纯产物目录，门禁全程有效。移动与类型化严格分离成两类 commit：移动 commit 只做 rename（`git diff --stat` 呈现纯 R 记录），类型化 commit 才碰文件内容。

### 2.3 types/ 的类型专属纪律

逐文件转译下，`src/types/*` 若含运行时值导出，host 产物会出现指向 `../types/*.js` 的运行时 import，而 `lib/` 内无对应产物文件。因此立两条纪律，并由 tsconfig 的 `verbatimModuleSyntax` 在编译期强制：

1. `src/types/` 全部文件仅类型导出（interface / type / declare module / as const 字面量类型）；共享运行时常量继续住各域源文件
2. host/client 源码消费 `src/types/*` 一律 `import type`，转译后被整体擦除，产物零引用

---

## 三、关键设计决策

| 决策 | 理由 |
| --- | --- |
| 源码 `lib/` → `src/host/`，产物逐文件同名输出 `lib/` | 布局裁决见 §2.1、中间态消除见 §2.2；npm `files`/`main`/`exports` 与 package-layout 断言零变化，cordis patch 与 DSH 消费端零感知 |
| 文件 1:1 迁移（含 `store.ts` 保持原名） | 原域拆分健康且被 25 个单测直接钉住；本次目标是加类型保障，改名带来的测试与注释连带修改只会放大回归面 |
| scripts 契约住 `src/types/scripts.ts`，模板保持平铺命名 | 类型专属文件经 `import type` 消费、转译后零运行时引用，`lib/` 无需新增产物；平铺命名保住 package-layout 的 `scripts.pwsh.js`/`scripts.posix.js` 白名单断言 |
| 豁免集结构化建模 | 现状豁免集 `{homeDirScript, probeHomeScript, legacyHomeMigrateScript}` 散在 store.js 运行时兜底与 scripts-contract.test.js 两处；类型化为 `ScriptsCommon` + `PwshScripts`/`PosixScripts` 各自 extends 平台专属接口后，运行时兜底、单测、类型三处共享同一份事实 |
| client 全 `.ts` + createElement 风格 | 现状 client 全部为 `React.createElement` 手写调用、React 以参数逐层注入；保持该形态才是同形态复刻。`.tsx` 的 automatic runtime 产出 `require('react/jsx-runtime')`，会触发 build-client.mjs 的裸 require 白名单断言（该断言同时充当「client 未混入新运行时依赖」的机器化防线） |
| 删除 `.d.ts` 产出 | `exports` 无 types 条目且不变量 1 禁止修改，下游类型消费路径为 0；`files` 含 `lib` 会把 `.d.ts` 静默带进 npm 包。待出现真实下游类型需求，连同 exports types 条目一起补 |
| DEFAULTS 单源收敛 | config.js 现状 schema 默认值与 DEFAULTS 双份人工同步；类型化时以 Config schema 为唯一源派生 DEFAULTS（schema 遍历取 default），派生不可行时退化为 `Required<ResolvedConfig>` 类型镜像钉住形状，值漂移进编译期 |
| `@deepseek-ai/*` 走本地 ambient 声明 | CI 只装 devDependencies，私有 peerDeps 不可得；schemastery 与 dsh-settings 两处裸 import（config.js / index.js）由 `dsh-contract.ts` 的 `declare module` 提供类型，恰好把「依赖面」建档成单一类型源 |
| vitest 直消费 `src/` TS | vitest 内置 esbuild 转译，单测无需先构建，`npm test` 保持秒级迭代。`.js` 说明符解析已实证，见 §4.2 |

---

## 四、构建与测试流程变化

### 4.1 构建

- 新增 `scripts/build-host.mjs`：13 个入口逐文件转译。关键参数与原因：

```js
await build({
  // 逐文件转译（bundle: false）：产物文件名与 lib/ 现状逐一相同，
  // package-layout.test.js 的白名单断言与 npm 包布局零变化
  entryPoints: { index: 'src/host/index.ts', /* …13 个同名入口 */ },
  bundle: false,
  // import 说明符逐字透传：@deepseek-ai/* 裸导入交给 Node 运行时按
  // peerDependencies 解析，运行时依赖语义连续；相对 './config.js'
  // 维持产物间互引（TS 源码沿用 .js 后缀导入，nodenext 解析到 .ts）
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outdir: 'lib',
})
```

- `"build"` 脚本改为 `node scripts/build-host.mjs && node scripts/build-client.mjs`。
- `build-client.mjs` 仅入口改指 `src/client/entry.ts`；产物包裹格式、`__ModuleLoader__` 注册 id、react-only require 白名单断言原样保留。
- 一次性产物 diff 预期：M2 首次以 esbuild 重建时，13 个产物相对手写源码存在格式规整差异（build-client.mjs 注释已实证 esbuild 会规整引号），属预期的一次性成本，此后由新鲜度门禁保证输出确定性。

### 4.2 测试

- 既有 25 个单测 + 2 个探针全部保留；单测 import 从 `lib/` 改指 `src/host/`（12 个被引模块，纯机械替换：路径前缀替换、`.js` 后缀原样保留）。
- **`.js` 说明符解析已实证**（2026-09-01 spike，vitest 4.1.11）：JS 测试文件 `import './a.js'` 与 TS 源码内部 `import './b.js'` 均正确解析到磁盘上的 `.ts` 文件。因此单测机械替换后无需改后缀，`client-pure.test.js`（直指 `src/client/`，M7 后同源文件变 `.ts`）与 probe、package-layout 均零改动。若未来 vitest 升级破坏该行为，备选：`resolve.alias` 或测试 import 改 `.ts` 后缀。
- 新增 `tests/types/`，由 `tsc --noEmit` 消费（tsconfig include 覆盖），并新增 `"typecheck"` 脚本；`npm test`（`vitest run tests/unit`）执行范围与现状一致，tests/types 无运行时断言价值。三个文件按优先级：
  - `scripts-parity.test.ts`：两套模板分别 `satisfies PwshScripts` / `satisfies PosixScripts`（含平台专属豁免的结构化建模）
  - `parse-contracts.test.ts`：dump/parse 函数返回结构 `satisfies` payloads.ts 类型
  - `api-contracts.test.ts`：client util 请求/响应类型与 routes 返回的 errBody 形状双向绑定（routes 返回多为动态构造对象，字面量断言铺不开，故以类型对偶 + errBody 形状为断言主体）
- tsconfig include（终态）：`src/**/*` 与 `tests/types/**/*`；`tests/unit`、`tests/probe` 保持 `.js` 且退出类型检查范围（其职责是运行时回归网）；`scripts/*.mjs` 同样退出（构建工具链由 esbuild 运行时自校验）。
- **tsconfig 三阶段演进**（细节见各 M 实施文档）：M1 过渡形态——`allowJs + checkJs`、include `lib/**/*.js` 与 `src/client/**/*.js`、exclude 显式排除 `lib/client.js` 产物（重建会冲掉豁免注释，「产物不进类型检查」是全程纪律，M2 起由 include 边界自然承担）、`"lib"` 补 DOM（client 浏览器全局的类型来源，终态保留）、宽松基线；M2 迁移期形态——include 改指 `src/**/*`、关闭 checkJs、**保留 allowJs**（.js 文件仍需入程序：否则 include 下无 TS 输入报 TS18003，且模块解析断）；M6 收紧 `strict` 全量；M7 全部源文件 .ts 化后移除 `allowJs` 收终态。

### 4.3 CI 门禁与依赖

现 CI（.github/workflows/ci.yml）只有 client 产物新鲜度门禁。修订后：

1. **类型门禁**：`npm run typecheck`，置于单测之前——tests/types 的编译期断言依赖此步骤存在，漏跑即假绿，顺序写死在 ci.yml
2. **产物新鲜度统一门禁**：`npm run build && git diff --exit-code lib/`，覆盖 lib/ 全部 14 个文件（host/client 合并为一道门禁）
3. 其余 job 结构零改动

devDependencies 变更清单：`+ typescript`（^5）、`+ @types/node`（^20）、`+ @types/react`（^18，client 侧 React 参数类型 `typeof import('react')` 的唯一依赖；类型引用走 import type，运行时零依赖）。CI `npm ci --legacy-peer-deps` 只装 devDependencies，三项均可得。

---

## 五、迁移里程碑

| 阶段 | 内容 | 验收标准 |
| --- | --- | --- |
| M1 | `tsconfig.json` 过渡形态（allowJs + checkJs 宽松基线，include `lib/**` 与 `src/client/**`，noImplicitAny 起步关闭）+ `typecheck` 脚本 + CI 类型门禁 + devDeps 三项 + schemastery/dsh-settings 最小 ambient 声明；源码原地 `lib/` | tsc 通过（宽松基线）；现有单测 + 探针全绿 |
| M2 | 13 个源文件纯移动 `lib/` → `src/host/`（rename-only commit）+ `build-host.mjs` 上线 + 统一新鲜度门禁 + 单测 import 改指 `src/host/` + tsconfig 切迁移期形态（include 改指 `src/**`，关 checkJs 留 allowJs） | 移动 commit 为纯 R 记录；一次性产物 diff 入库后，`npm run build` 再次重建时 `git diff --exit-code lib/` 为零；全部测试绿；`verify:host` 绿（仍消费 lib/index.js 产物，脚本零改动） |
| M3 | `src/types/` 七个类型文件全建（自 dsh-contract.md 与现状反推，含 client-contract.ts 与两个 ambient 模块的完整契约化） | `tsc --noEmit` 通过 |
| M4 | 纯逻辑文件转 `.ts`：config/errors/diagnostics/dump-parse/session-info | 单测 1:1 通过 |
| M5 | scripts 双模板 `.ts` + `types/scripts.ts` satisfies 契约；scripts-contract.test.js 断言全保留 | 双平台模板类型锁死；豁免集三处同源 |
| M6 | 工厂与接线层 `.ts`：store/snapshots/maintenance/routes-core/routes-manage/index（各文件整体迁移，含其模块级纯逻辑导出）；tsconfig 收紧到 strict 全量 | `verify:host` 装配门禁全绿 |
| M7 | client 侧 `.ts`（createElement 风格）+ build-client 入口切换 + tsconfig 移除 allowJs 收终态 | 浏览器实弹冒烟（撤回按钮/确认面板/设置卡片） |
| M8 | 文档同步：AGENTS.md/CODEBUDDY.md 文件地图改指 `src/`（`lib/` 标注为纯产物目录）；dsh-contract.md 与计划族中源码路径引用核对；README 开发命令说明（`npm run build` 语义变化）；CHANGELOG 记工程变更条目；评估 `check:upgrade` 纳入 typecheck | 文档与代码现状一致；本计划移入 `docs/plans/completed/` 并同步三处链接（docs 规范生命周期约定第 2 条） |

每阶段独立 commit，回滚粒度到域；M2 的移动 commit 与类型化 commit 严格分离。

阶段实施文档（任务分解/改动落点/验收/风险逐阶段细化）：[M1 类型基础设施](./plan-ts-refactor-m1.md) ｜ [M2 纯移动与构建切换](./plan-ts-refactor-m2.md) ｜ [M3 types 类型文件](./plan-ts-refactor-m3.md) ｜ [M4 纯逻辑文件](./plan-ts-refactor-m4.md) ｜ [M5 scripts 模板](./plan-ts-refactor-m5.md) ｜ [M6 工厂与接线层](./plan-ts-refactor-m6.md) ｜ [M7 client 与终态](./plan-ts-refactor-m7.md) ｜ [M8 文档同步与归档](./plan-ts-refactor-m8.md)

---

## 六、验收标准与兼容性承诺

迁移完成的标志是三个零变化加一项提升：

1. **行为零变化**：快照/回退/维护/设置页功能与重构前逐项一致（对照 README 功能清单逐条走查）
2. **契约零变化**：`cordis.patch.yml` insert 行、npm 包布局（`package-layout.test.js` 断言零改动、pack 文件集合逐一相同）、DSH API 字段探针（`test:probe`）、装配门禁（`verify:host`）均与重构前一致
3. **工程质量提升**：`tsc --noEmit` 全绿；`@ts-ignore` 零残留（经评审的豁免逐个建档）
4. **文档一致**：M8 完成后 AGENTS.md/CODEBUDDY.md 文件地图、docs 引用与代码现状一致

---

## 七、风险与对策

| 风险 | 对策 |
| --- | --- |
| DSH 依赖面升级导致类型过期 | `dsh-contract.ts` + `client-contract.ts` 是唯一类型源，升级核查流程（dsh-contract.md 第七节）改为 diff 这两个文件 |
| 产物与源码脱节（改 src 忘 rebuild 流出） | 统一新鲜度门禁 M2 起覆盖 `lib/` 全部输出 |
| 本地开发假绿/假红：改 src 忘 build 时 `package-layout.test.js` 基于陈旧产物断言 | 本地工作流约定写进 M8 文档同步：「改 `src/` 后先 `npm run build` 再 `npm test`」；CI 新鲜度门禁兜底 |
| 迁移过程回归 | 25 个单测 + 2 个探针全程保持绿色，M2–M7 每阶段独立验收 |
| 旧版兼容分支（0.1.1-rc.2 ↔ 0.1.2-alpha.x）类型化时误删 | 双版本分支持续由兼容分支注释标注（index.js settings 接线分派、entry.js conversation/styles 探测降级），类型上用联合/可选字段显式建模，探针继续钉真实运行实例 |
| esbuild 首次重建产生大 diff 掩盖真问题 | M2 单独 commit 呈现该一次性 diff，类型化 commit 与移动 commit 分离，review 时按 commit 边界切割 |
| tests/types 编译期断言假绿（CI 漏跑 typecheck） | typecheck 为 CI 必经步骤且置于单测之前，门禁顺序写进 ci.yml |
| ~~vitest 无法解析 `.js` 说明符指向 `.ts` 文件~~（已消解） | 2026-09-01 spike 实证：vitest 4.1.11 下 JS 测试与 TS 内部互引的 `.js` 说明符均正确解析到 `.ts`。vitest 升级后若回归，备选 `resolve.alias` 或测试 import 改 `.ts` 后缀 |
| PowerShell/bash 模板字符串在 TS 中可读性下降 | 模板保持字符串拼接风格，`types/scripts.ts` 只声明签名；哨兵（ROLLBACK_OK 等）、`FIDELITY_ATTRS`、`STALE_LOCK_MIN`/`HEARTBEAT_TTL_S` 以字面量类型建档，实现侧逐字对照；scripts-contract.test.js 的结构断言（`--ignore-errors`、`g=` 赋值约定、`:(top)` pathspec 等）全数保留 |

---

## 八、开始条件与产物

开始条件：本计划（v3）评审通过。

阶段产物：

- M1 产出：`tsconfig.json`（过渡形态）、`typecheck` 脚本、CI 类型门禁、devDeps 三项、两个最小 ambient 声明
- M2 产出：`src/host/` 源码树（rename-only）、`scripts/build-host.mjs`、统一新鲜度门禁、tsconfig 迁移期形态（include 已为终态值）
- M3 产出：`src/types/` 七个类型文件
- M4–M7 产出：逐域迁移提交，每阶段一个独立 commit 便于回滚
- M8 产出：文档同步提交 + CHANGELOG 工程变更条目；本计划归档 `completed/`
- 最终产物：`npm run build` 可纯净重建 `lib/`（14 个文件同名）；`npm test` / `test:probe` / `verify:host` / `typecheck` 全绿
