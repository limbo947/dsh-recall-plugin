# TS 迁移 M5：scripts 双模板 .ts 化 + satisfies 契约锁死

> 状态：已完成（2026-09-01 实施）｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M5/8
>
> 一句话：双平台脚本模板接入 `types/scripts.ts` 契约，同名导出硬约束从「运行时兜底 + 单测」升级为「编译期保证」。

## 目标

`scripts.pwsh.ts` / `scripts.posix.ts` 类型化；`types/scripts.ts` 定稿消费；新增 `tests/types/scripts-parity.test.ts` 编译期断言；豁免集三处同源（类型为准，运行时兜底与单测注释回链）。

## 前置

M3 完成（types/scripts.ts 骨架）；M4 完成（哨兵解析侧已类型化）。

## 任务分解

### 1. `scripts.pwsh.ts` / `scripts.posix.ts` 类型化

- `git mv` 后逐函数标注签名：参数全 `string`（`base: string[]`、`maxChanges: number` 等例外照现状），返回全 `string`
- **模板体零改动**：字符串拼接风格保持，禁止顺手重排/插值改写——模板与解析函数逐字呼应，scripts-contract.test.js 的结构断言（`--ignore-errors`、`g=` 赋值约定、`:(top)` pathspec、哨兵行）是唯一权威，diff 中模板字符串内容不得出现任何变化
- macOS bash 3.2 兼容注释（posix）原样保留

### 2. `types/scripts.ts` 定稿

按 M3 骨架核对 28 个共享签名与 5 个共享常量，与两侧实际导出逐一相符（以 scripts-contract.test.js 的 key 集合断言为核对清单——该断言不过滤 typeof，键集含常量）；哨兵字面量类型与模板实际输出逐字核对。

### 3. 新增 `tests/types/scripts-parity.test.ts`

```ts
// 编译期契约断言（tsc --noEmit 消费，无运行时断言价值）：
// 两套模板必须完整满足各自契约——单侧漏导出/签名漂移在此即红，
// 不再只等 store.js 运行时兜底或另一平台用户机器暴雷。
import * as pwsh from '../../src/host/scripts.pwsh.js'
import * as posix from '../../src/host/scripts.posix.js'
import type { PwshScripts, PosixScripts } from '../../src/types/scripts.js'

const _pwsh: PwshScripts = pwsh
const _posix: PosixScripts = posix

// 豁免集结构化核对：平台专属导出恰为这三者，多一个少一个都报错。
// Record<键联合, true> + 对象字面量双向闭环——接口变大（多声明专属键）
// 字面量缺键报「缺少属性」，接口变小则触发新鲜字面量 excess property
// 检查；普通数组形式只证 ⊆，接口多声明时不报错
export type PwshOnly = keyof Omit<PwshScripts, keyof PosixScripts>   // 'homeDirScript'
export type PosixOnly = keyof Omit<PosixScripts, keyof PwshScripts>  // 'probeHomeScript' | 'legacyHomeMigrateScript'
const _pwshOnly: Record<PwshOnly, true> = { homeDirScript: true }
const _posixOnly: Record<PosixOnly, true> = { probeHomeScript: true, legacyHomeMigrateScript: true }
```

（`npm test` 不消费本文件——`vitest run tests/unit` 范围不变；它由 CI 的 typecheck 步守护，漏跑即假绿的对策已写死在 CI 顺序里。）

### 4. 豁免集三处同源收尾

- `src/host/store.js`（M6 才类型化）`checkScriptParity` 的 SKIP 集合旁加注释：`// 豁免集事实源：src/types/scripts.ts 平台专属接口；本集合是它的运行时镜像`
- `tests/unit/scripts-contract.test.js` 的 SKIP 旁加同款注释
- 运行时与单测的 SKIP 集合本阶段**不改值**，仅建立溯源关系

## 验收标准

- `npm run typecheck` 绿（含 tests/types 新断言）
- `tests/unit/scripts-contract.test.js` 全绿（结构断言零改动）
- `npm run build` 后 `git diff --exit-code lib/` 为零（pwsh/posix 两个产物除格式外无变化）

## 风险与回退

| 风险 | 对策 |
| --- | --- |
| 模板字符串在 TS 中可读性下降诱发改写冲动 | 红线：模板体 diff 必须为空；签名层是唯一改动面 |
| 签名与脚本-contract 单测漂移 | 以单测断言的 key 集合为核对清单，二者冲突时以运行现状为准修类型 |

回退：两文件 + 两注释 + 一新文件，revert 即还原。

## 实施记录

> 2026-09-01 实施完成。基线 HEAD `d0e97e0`（M4 收口）。两模板 `git mv` 后仅函数签名行加类型标注（精确行匹配批量替换），模板体 diff 为空（红线复核：diff 仅签名行 + import + 注释）。

### 逐项落地

| 项 | 结果 |
| --- | --- |
| scripts.pwsh.ts 签名标注 | 28 个共享函数签名全部标注（psq 起至 storesDumpScript；store 参数 `ScriptStore`、base/tags/files/extraDirs `string[]`、maxChanges `number`、其余 `string`，返回全 `string`）；`import type { ScriptStore }` |
| scripts.posix.ts 签名标注 | 30 个导出全部标注（28 共享 + probeHomeScript/legacyHomeMigrateScript）；diffScript 保持 5 参（契约声明 6 参，少参函数天然可赋值） |
| 模板体零改动 | `git diff -M src/host/` 逐 hunk 过目：仅签名行/import/注释变化，模板字符串内容零 diff；产物逐字一致实证（freshness=0） |
| types/scripts.ts 定稿核对 | 与 scripts-contract.test.js key 集合断言逐一相符：28 共享函数 + 5 共享常量 + 豁免集（pwsh 独有 homeDirScript、posix 独有 probeHomeScript/legacyHomeMigrateScript） |
| tests/types/scripts-parity.test.ts | 新建（计划原文落实）；typecheck 消费 |
| 豁免集三处同源 | store.js SKIP 旁 + scripts-contract.test.js SKIP 旁各加溯源注释（事实源 src/types/scripts.ts 平台专属接口），值未改 |

### 验收证据

| 验收项 | 结果 |
| --- | --- |
| `npm run typecheck`（含 tests/types 新断言） | 绿：exit 0；负例验证断言非空转——`Omit<PwshScripts,'homeDirScript'>` 赋给 PwshScripts 报 TS2741 |
| `tests/unit/scripts-contract.test.js` | 绿（结构断言零改动，含 `--ignore-errors`、`g=` 约定、`:(top)` pathspec、哨兵行） |
| `npm run build` 后 `git diff --exit-code lib/` | 退出码 0：pwsh/posix 产物从 .ts 转译输出与基线逐字一致 |
| `npm test` 全量 | 绿：25 文件 290 例 |

### 偏离与备注

- 无计划偏离。签名标注用临时批量脚本（精确行匹配 + 校验 NOT FOUND 计数 28/28、30/30）执行后删除，git diff 复核兜底模板体零改动。
