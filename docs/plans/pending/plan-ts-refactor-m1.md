# TS 迁移 M1：类型基础设施（tsconfig / typecheck / CI 门禁）

> 状态：待实施 ｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M1/8
>
> 一句话：源码原地不动，类型工具链上线，宽松基线 tsc 绿 + CI 类型门禁就位。

## 目标

`tsc --noEmit` 以宽松基线覆盖现状 JS 源码；`typecheck` 脚本与 CI 类型门禁落地；两个私有包的最小 ambient 声明兜底（CI 不装私有 peerDeps）。本阶段**不改任何源码行为、不移动任何文件**。

## 前置

无（首阶段）。

## 任务分解

### 1. 安装 devDependencies

```powershell
npm i -D typescript@^5 @types/node@^20 @types/react@^18 --legacy-peer-deps
```

`--legacy-peer-deps` 必须：peerDeps 是私有 `@deepseek-ai/*` 包，与 CI `npm ci --legacy-peer-deps` 同理由。`@types/react` 仅 M7 client 类型化使用（`import type`，运行时零依赖），本阶段一并装齐避免多次锁文件变更。

### 2. package.json 增脚本

```json
"typecheck": "tsc --noEmit"
```

其余 scripts 不动（`build` 语义变化在 M2）。

### 3. 新建 `tsconfig.json`（M1 过渡形态）

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowJs": true,
    "checkJs": true,
    "strict": false,
    "noImplicitAny": false,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["node"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["lib/**/*.js", "src/client/**/*.js", "src/types/**/*.d.ts"],
  "exclude": ["node_modules", "lib/client.js"]
}
```

要点与理由：

- `allowJs + checkJs` 仅 M1 过渡形态，让宽松基线覆盖现状源码；M2 起逐步退役（三阶段演进见上游 §4.2）。
- `verbatimModuleSyntax` 提前立上游 §2.3 的 `import type` 纪律，避免迁移期返工。
- `module/moduleResolution: NodeNext`：与产物 Node ESM 运行语义一致；TS 源码 `.js` 后缀互引（M4 起）正是靠它解析到 `.ts`。
- `types: ["node"]`：只显式引入 node 类型，避免 @types/react 提前渗入 host 侧。
- `"lib"` 补 DOM：client 源码消费 window/document（M7 转 .ts 后还需 HTMLElement 等 DOM 类型），不配则 checkJs 在 client 六文件逼出整排 ts-nocheck 豁免。host 侧不消费 DOM 全局，越界使用靠 review 纪律约束——为隔离 DOM 拆双 tsconfig 的维护成本大于收益。
- `exclude` 显式排除 `lib/client.js`：它是 esbuild 打包产物（CJS 包裹、含 require 调用）而非源码，且每次 rebuild 被重写，`// @ts-nocheck` 会被冲掉、豁免机制对其无效。「产物不进类型检查」是全程纪律，M2 include 改指 `src/**` 后本条目随 exclude 整体移除。注意显式写 exclude 会覆盖默认值，`node_modules` 必须重述。

### 4. 新建 `src/types/ambient.d.ts`（最小 ambient 占位）

```ts
// M1 最小占位：CI 不装私有 peerDeps，裸导入需 ambient 声明兜底。
// M3 由 dsh-contract.ts 的完整 declare module 取代，届时删除本文件。
declare module '@deepseek-ai/schemastery'
declare module '@deepseek-ai/dsh-settings'
```

全仓私有裸导入仅两处：`lib/config.js`（schemastery）、`lib/index.js`（dsh-settings），已逐文件核实无遗漏。

### 5. CI 增类型门禁

`.github/workflows/ci.yml` 在 `Unit tests` 步**之前**插入：

```yaml
      - name: Typecheck
        # 置于单测之前：tests/types 编译期断言（M3 起）漏跑即假绿，顺序写死
        run: npm run typecheck
```

### 6. 宽松基线跑通

产物与浏览器全局两大噪声源已分别由 `exclude`（lib/client.js）与 DOM lib 在 tsconfig 层消除；对 checkJs 暴露的其余存量噪声，只允许两种处置：明显的 JSDoc 类型标注补全（不改行为）；或个别文件临时 `// @ts-nocheck` + 注释注明「TS 迁移临时豁免，M4/M6/M7 对应阶段移除」。**禁止 `@ts-ignore`**（上游验收标准要求零残留，临时豁免必须可追踪）。豁免清单记录在本文件实施记录区。

## 验收标准

- `npm run typecheck` 绿（宽松基线）
- `npm test` 绿（25 文件全量）、本机 `npm run test:probe` 绿
- CI 绿，且 Typecheck 步先于 Unit tests

## 风险与回退

| 风险 | 对策 |
| --- | --- |
| checkJs 暴露存量隐式错误，处置不当改行为 | 只许标注补全或 ts-nocheck 建档，禁动逻辑 |
| `@types/node` 版本与 Node 20 运行时不符 | 钉 `^20`，与 engines `>=20`、build target `node20` 对齐 |

回退：整阶段单 commit，`git revert` 即还原（package.json/tsconfig/ci.yml/ambient.d.ts 均为新增或单行改）。

## 实施记录

> 2026-09-01 实施完成。基线 HEAD `2224bd8`（v3.2 计划族评审修订先于本阶段单独 commit 入库）。

### 豁免清单（M1 建档，对应阶段清零）

| 文件 | 处置 | 清零阶段 | 说明 |
| --- | --- | --- | --- |
| `lib/store.js` | `// @ts-nocheck` | M6（store.ts 迁移） | rt.scripts 为平台二选一模块联合，`homeDirScript`/`probeHomeScript` 平台专属成员在联合上不可达（store.js:305/325），属 scripts 契约已知形态，M5 类型侧锁死后 M6 以契约类型收口 |
| `src/client/entry.js` | `// @ts-nocheck` | M7（entry.ts 迁移） | `window.__ModuleLoader__` 全局未建档，M3 client-contract.ts `declare global` 补齐 |

另：`lib/diagnostics.js` ENV_PATTERNS 补 `/** @type {Array<[string, RegExp[]]>} */`（真实 JSDoc 标注，非豁免——异构数组字面量被推断为 `(string | RegExp)[]`，classifyEnvError 内 `p.test(s)` 报 TS2339）。

### 验收证据

| 验收项 | 结果 |
| --- | --- |
| `npm run typecheck` | 绿，退出码 0，零错误零警告（宽松基线） |
| `npm test` | 绿：25 文件 290 例全过（Test Files 25 passed / Tests 290 passed） |
| `npm run test:probe` | 绿：2 文件 31 例全过（本机可跑） |
| CI Typecheck 步先于 Unit tests | 已写入 ci.yml（Typecheck 置于 Unit tests 之前） |

### 环境备注

- `npm i -D typescript@^5 @types/node@^20 @types/react@^18 --legacy-peer-deps` 实际安装 typescript 5.9.3 / @types/node 20.19.43 / @types/react 18.3.31；npm 清理了 node_modules 下 `@deepseek-ai/{schemastery,dsh-settings}` junction，已按 AGENTS.md 命令重建（dsh 安装目录链接）。
- 红线复核：`grep -rn "@ts-ignore" src/ lib/` 为零；临时豁免仅上述两处 ts-nocheck 且均带清零阶段注释。
