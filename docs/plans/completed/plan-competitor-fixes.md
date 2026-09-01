# 竞品改进实施审查修复计划

> 上游文档：[plan-competitor-improvements.md](./plan-competitor-improvements.md) ｜ 状态：**已完成（2026-08-28，实施记录见文末）**
> 背景：竞品改进专项（H1-H3/R1/R2/F1/E1/D1）代码已落地并通过单测 159/159 与 verify:host，但实施后审查发现 1 个严重缺陷（H1 救援链路从未生效）与 6 个一般问题。本计划将其落地为可执行修复项。审查方法：三路并行深度审查 + 关键发现逐条人工核实（引用处均为 2026-08-28 当前代码）。
> 实施结果：F-S1/G1/G2/G3/G4/G5/G6 全部落地，A1/A3/A4/A5/A6/A7/A8 完成、A2 经评估不采纳；单测 172/172 绿、verify:host 绿（生产装配路径）、check:dsh 全部一致。

## 审查结论摘要（修复依据）

- 客观验证：单测 159/159 绿、verify:host 绿、行数红线达标、R1 已知坑全数在位、错误码零漂移、双平台脚本契约正确——主体实施合格。
- 致命缺陷：S1 rescue tag 前缀错位，救援 100% 落入「救援也失败」分支。
- 结构性测试缺口：rescue 单测用假脚本模板，从未触达真实模板（S1 因此漏网）；errors 防呆扫描与值钉不完整；CI 无产物新鲜度门禁。

---

## F-S1 rescue tag 前缀契约修复（严重，必须）

### 目标

`snapshotScript` 打 tag 时无条件加 `snap-` 前缀（[lib/scripts.pwsh.js](../../../lib/scripts.pwsh.js) L202、[lib/scripts.posix.js](../../../lib/scripts.posix.js) L181），故 execute 的 safety 快照实际 tag 是 `snap-pre-rollback-<ts>`；而 `rescueRollback` 把裸 `safetyId` 传给 `rescueScript`（[lib/snapshots.js](../../../lib/snapshots.js) L76），reset 目标 `pre-rollback-<ts>` 必然 unknown revision——救援从未生效，且手动恢复命令同样缺前缀。修复后救援链路真正闭环。

### 任务分解

1. **rescueRollback 构造完整 tag**（[lib/snapshots.js](../../../lib/snapshots.js) L68-85）：内部 `const tag = 'snap-' + safetyId`，传给 `rescueScript`；`rescueScript` 参数语义改为「完整 tag 名」（改参数名与注释）。选择在调用侧补前缀而非 rescueScript 内部补：rescueScript 保持通用（接受完整 tag），前缀知识留在唯一知道 safetyId 语义的编排层。
2. **手动恢复命令修正**（[lib/snapshots.js](../../../lib/snapshots.js) L80）：tag 用完整名，`--git-dir`/`--work-tree` 路径加引号（含空格路径可复制执行）。
3. **跨函数契约测试**（tests/unit/scripts-contract.test.js）：断言 `snapshotScript(root, store, git, id, base)` 的 tag 命令与 `rescueScript(root, store, git, 'snap-' + id)` 的 reset 目标指向同一 tag 名——正是 S1 漏网口（假模板测试测不到的跨函数约定）。
4. **rescue.test.js 钉真实模板**：现有测试保留（三分支编排），另补一条「用真实 scripts 模板 + 假 runShell」的接线测试：捕获 runShell 收到的命令串，断言含 `reset --hard` 且目标含 `snap-pre-rollback-`。
5. **rescueRollback 补 `RESCUE_OK` 哨兵校验**（与 rollbackFor 的 `ROLLBACK_OK` 对称，防脚本执行成功但 git 静默未生效）。

### 改动落点

- [lib/snapshots.js](../../../lib/snapshots.js)：rescueRollback（前缀/引号/哨兵）
- [lib/scripts.pwsh.js](../../../lib/scripts.pwsh.js) / [lib/scripts.posix.js](../../../lib/scripts.posix.js)：rescueScript 参数注释（实现不变）
- tests/unit/scripts-contract.test.js、tests/unit/rescue.test.js

### 测试与验收

- 新契约测试红→修→绿；现有 159 单测不回归。
- 冒烟：人为制造 rollback 失败（占用文件锁等）→ 工作区自动恢复回退前状态，提示含「已自动恢复」；rescue 失败场景的手动命令可直接复制执行成功（含空格路径工作区验证）。

### 风险与回退

- 风险低：改动集中在救援分支（现状本来 100% 走失败分支，不可能更差）。revert 即回现状。

---

## F-G1 rebuildOrphans 过滤 pre-rollback 条目

### 目标

孤儿重建对 `snap-*` 全量 strip 前缀入索引（[lib/snapshots.js](../../../lib/snapshots.js) L274-278），safety tag 被 rebuild 成 `time: 0` 的索引条目：进快照管理列表、占 maxSnapshotsPerWorkspace 配额、被 retention/limits 当「最旧」优先清掉——H1 依赖的救援点在重度使用下可能被 purge，与「不进 index.json、列表不展示」的设计承诺相悖。

### 任务分解

1. rebuildOrphans 循环内 strip `snap-` 后跳过 `pre-rollback-` 前缀（与 [lib/routes-core.js](../../../lib/routes-core.js) L87-91 注释承诺对齐），并注释说明「安全 tag 只作救援锚点，不进索引」。
2. 磁盘上可能已存在的污染条目（此前 rebuild 已落盘的 `pre-rollback-*`）：不主动迁移清理（一次性数据、代价收益不划算），但 manage list 的树构建侧对 `pre-rollback-` 前缀 id 做展示过滤（防御性，清存量可见性）。
3. 单测：rebuild 输入含 `snap-pre-rollback-123` 与 `snap-abc` → 索引只收 `abc`；manage 树含 pre-rollback 条目时不渲染。

### 改动落点

- [lib/snapshots.js](../../../lib/snapshots.js)：rebuildOrphans
- [lib/routes-manage.js](../../../lib/routes-manage.js)：list 树构建过滤
- tests/unit/snapshots-persist.test.js（或新条目）

### 测试与验收

- 单测两条钉住；冒烟：执行一次撤回（产生 safety tag）→ 重启预热（触发 rebuild）→ 设置页快照树无 `pre-rollback` 条目、count 不含它。

### 风险与回退

- 风险：过滤过宽误伤真实消息 ID 为 `pre-rollback-` 开头的快照——消息 ID 为系统生成 GUID，前缀碰撞概率为零，可接受。

---

## F-G2 POSIX rollback 删除侧裸 `&&` 链改 if/fi

### 目标

`lib/scripts.posix.js` L269 `rm -f -- "$root/$p" && deleted=$((deleted+1))`：`set -e` 下表中非末位命令失败被豁免，rm 失败（权限等）静默跳过、脚本仍输出 ROLLBACK_OK——半回退报成功，rescue 永不触发，与 H1「失败必须响亮」直接矛盾。作者自己在 snapshotScript 已立「循环体禁 `cond && cmd`、用 if/fi」的规矩（AGENTS.md 已知坑末条），此处漏网。`:268` 的 `[ -z "$p" ] && continue` 语义安全但同属裸链风格，一并统一。

### 任务分解

1. 删除循环改 `if rm -f -- "$root/$p"; then deleted=$((deleted+1)); else echo "RM_FAILED $p" >&2; exit 1; fi`（失败响亮退出，rollbackFor 即收到非 ok 触发救援）。
2. 空路径守卫改 if/fi 同款。
3. 对照检查 pwsh 侧对应循环（`lib/scripts.pwsh.js` rollbackScript）：Remove-Item 在 EAP=Stop 下已抛错（L305 附近），确认无需改动，并在脚本模板注释里点明两平台语义对齐方式。
4. scripts-contract 单测：POSIX 模板文本断言「rollbackScript 循环体内不存在 ` && ` 裸链」（防回归的字面契约）。

### 改动落点

- [lib/scripts.posix.js](../../../lib/scripts.posix.js)：rollbackScript 删除循环
- tests/unit/scripts-contract.test.js

### 测试与验收

- 单测：模板文本无裸 `&&` 链断言绿；159 单测不回归。
- 两平台心智检查（AGENTS.md 回归注意）：路径引号、`set -e` 交互。

### 风险与回退

- 风险：rm 失败现在会终止整个 rollback（原来静默继续）——这是**期望的行为变更**（失败响亮才能触发救援），冒烟需覆盖「正常路径删除成功」确认无误伤。

---

## F-G3 loadIndex 读上限与截断区分

### 目标

loadIndex 的 `stdoutMaxBytes: 4194304`（[lib/snapshots.js](../../../lib/snapshots.js) L146）超限时输出被截断 → JSON.parse 报错 → 健康索引被当损坏隔离成 `.corrupt-<ts>`，索引记录（time/sessionId/feedback）全丢（rebuild 后变 time=0 条目，又触发 G1 的清理链）。需区分「真损坏」与「读截断」。

### 任务分解

1. 先核验 runShell 截断信号的可判定性（读 [lib/store.js](../../../lib/store.js) runShell 实现：stdoutMaxBytes 截断是否有可观察标记——异常、标志位或 stdout 长度恰等于上限的启发式）。
2. 可判定：截断 → 不隔离、recordError（`recall index read truncated`）+ 按空索引继续但**不写回 saveIndex**（防覆盖好文件）——等下次写索引自然覆盖；不可判定：上限提高到 16MB（按 maxSnapshotsPerWorkspace=0 不限 + 长期使用估算）并在注释记录「上限即天花板」的取舍。
3. 单测钉住所选分支（截断/损坏二分）。

### 改动落点

- [lib/snapshots.js](../../../lib/snapshots.js)：loadIndex
- tests/unit/index-load.test.js

### 测试与验收

- 单测：截断场景不生成 `.corrupt`、不覆盖原文件；损坏场景行为不变（隔离+recordError）。

### 风险与回退

- 风险低：只收紧「误判好文件为坏」的方向。

---

## F-G4 errors 测试门禁补强

### 目标

[tests/unit/errors.test.js](../../../tests/unit/errors.test.js) 两处失效：L56 防呆扫描清单停留在 R2 前（只扫 index.js/snapshots.js，不扫 routes-core.js/routes-manage.js 这 25 处 `E.RECALL_*` 引用主战场）；L64-77 值钉只覆盖 12/18，漏的 6 个（UNKNOWN_PATH/BAD_TYPE/EMPTY_PATCH/NO_ROOT/NO_SESSION/UNKNOWN_OP）恰是无人消费、漂移无声的。

### 任务分解

1. 扫描清单改为 `['index.js','snapshots.js','routes-core.js','routes-manage.js']`，头注释同步。
2. 值钉补齐全部 18 个 code。
3. 补一条更强不变量：扫描 `lib/**/*.js` 断言不存在 `code:\s*['"]` 内联字面量（把「全仓零内联」从人肉 grep 固化为测试）。

### 改动落点

- tests/unit/errors.test.js

### 测试与验收

- 自证：故意在 routes-manage.js 写 `E.RECALL_STALEE`（typo）→ 测试红；改回绿。

---

## F-G5 verify-host 复刻生产装配路径

### 目标

verify-host 直接 `apply(ctx, {})` 作用于 root Context（[scripts/verify-host.mjs](../../../scripts/verify-host.mjs) L94），而 cordis 4 的 `cannot get property ... without inject` 门禁发生在 `ctx.plugin()` 包装路径——漏声明 inject 在此可能依然全绿，「漏声明即红」的 E1 承诺落空（P0-1 曾真实踩过的缺陷类）。

### 任务分解

1. 先实证：在有 dsh 的本机，临时从 inject 删 `'agents'` 跑 verify:host——若仍绿即坐实（record 结论于本文档状态节）。
2. 坐实则改装配方式为 `ctx.plugin({ name, apply, inject }, {})` 复刻生产路径；不可行（ctx.plugin 形状限制）则头部注释如实降级断言覆盖范围，并另设「inject 声明表 vs 代码内 `ctx.<svc>` 访问点」的静态一致性检查（grep 级，probes/单测可承载）。
3. 顺带：端点断言加 `body && typeof body === 'object' && 'ok' in body`（现状 status=200 被插件自身错误映射遮蔽，只能证明端点名已注册）；settings 桩接入至少断言 `recordError` 未记录 settings skip。

### 测试与验收

- 删 inject `'agents'` → verify:host 红（或静态检查红）；恢复 → 绿。

---

## F-G6 R1 产物新鲜度门禁

### 目标

改 `src/client/` 忘 rebuild 时 `lib/client.js` 陈旧：client-pure 测 src、package-layout 只断言产物存在、CI 无 build 步骤——陈旧产物可静默合入并随发布流出。

### 任务分解

1. `.github/workflows/ci.yml` 加一步：`node scripts/build-client.mjs && git diff --exit-code lib/client.js`（esbuild 在 devDependencies，CI 可装；bundle 格式需确定性——esbuild 同版本输出确定性可依赖）。
2. 顺带 build-client.mjs 加固：`outfile` 用 `import.meta.url` 锚定（对齐 verify-host 做法，非根目录运行不写错位）；冒烟断言补「id 字面量 `'dsh-recall-plugin'` 未漂移」与「除 `require("react")` 外无其他裸 require」（防未来误 import react-dom/第三方包被静默打进 bundle 的 React 双副本隐患）。

### 改动落点

- .github/workflows/ci.yml、scripts/build-client.mjs

### 测试与验收

- 本地改 src/client/util.js 一行（加注释）→ rebuild → `git diff lib/client.js` 非空；不改 src 时 diff 为空。

---

## 建议项（择要采纳，不阻塞）

| # | 内容 | 落点 |
|---|---|---|
| A1 | `deps.readSettings` 改传活绑定 `() => readSettings()`（现按值捕获 `let` 闭包，settings 晚挂载时副本停在旧引用；当前可观察影响为零） | lib/index.js:340 |
| A2 | win32 分块写跨块边界多字节字符 U+FFFD 替换：改字节追加（`[IO.File]::AppendAllBytes`+`FromBase64String`），免边界/BOM | lib/store.js、scripts.pwsh.js |
| A3 | `routes-manage.js` L322/L346 重复 `if (!supported)` 死代码清理（L258 已短路） | lib/routes-manage.js |
| A4 | routes-core.js L11 `ctx` 解构后未用，删或注释留由 | lib/routes-core.js |
| A5 | quarantine 失败路径 recordError 节流（避免同一条目刷屏 20 条错误环） | lib/snapshots.js |
| A6 | loadIndex 空字符串 id 通过校验，补 `!entry.id` 拒绝 | lib/snapshots.js |
| A7 | client-pure 补 groupByLineage 成环输入一例（钉 seen 防死循环） | tests/unit/client-pure.test.js |
| A8 | compat-audit I13 出处写全包名（dsh-client-modules 的 lib/client.js，避免与本仓库产物混淆） | docs/compat-audit.md |

## 实施顺序与验收

```
F-S1 → F-G2 → F-G1（救援可靠性链路一批，S1 必须首发）
  → F-G3 → F-G4（索引与测试门禁）
  → F-G5 → F-G6（装配与产物门禁，各带实证前置）
  → A1-A8 顺路清理（与所在文件同批改动时一并做）
```

- 发版语义：F-S1/G1/G2 为缺陷修复（patch）；G4-G6 为测试/CI 门禁（不占发版内容）；具体版本号发版时定。
- 总验收：159+ 单测全绿（含新增契约/门禁条目）、`npm run verify:host` 绿、两平台心智检查过 AGENTS.md 回归注意、冒烟路径含「制造 rollback 失败 → 自动救援成功」新场景。
- 完成后同步：plan-competitor-improvements.md 各任务状态节、本计划改「已完成」、improvement-plan.md 索引表更新。

---

## 实施记录（2026-08-28）

全部按计划顺序落地；单测 159 → 172（新增 13 条契约/门禁/边界条目），`npm run verify:host` 与 `npm run check:dsh` 绿。

| 项 | 结果 | 与计划的偏差/要点 |
|---|---|---|
| F-S1 | ✅ | rescueRollback 调用侧拼 `snap-` 前缀、手动命令路径加引号、RESCUE_OK 哨兵缺失走救援失败分支；scripts-contract 新增跨函数 tag 名一致断言；rescue.test.js 新增真实 pwsh/posix 模板接线测试 |
| F-G2 | ✅ | 删除循环 if/fi + rm 失败 `RM_FAILED` + exit 1；pwsh 侧确认 Remove-Item EAP=Stop 已抛、只补对齐注释。**偏差**：契约断言 `not.toContain(' && ')` 同时抓出 excludeSyncBlock 内两处裸链（`[ -z "$t" ] && continue`、`[ -n "$p" ] && git …`）——语义安全但违反 I16 循环体规矩，一并改 if/fi |
| F-G1 | ✅ | rebuildOrphans 跳过 `pre-rollback-` 前缀 + manage list push() 展示过滤；谓词 `isSafetySnapshotId` 从 snapshots.js 模块级导出供两处共用（防判定漂移）；存量污染不迁移，仅挡可见性 |
| F-G3 | ✅ | **可判定分支坐实**：官方 `ShellRunResult.stdout` 为 `CollectedOutput{text, truncated, spillPath?}`（dsh-shell/dsh-subprocess `.d.ts`，截断时 text 只剩流尾部）。store.js 拆出 `runShellMeta` 暴露 truncated 标志（runShell 签名不变）；loadIndex 截断 → 不隔离/不写回/recordError + 标记 indexLoaded 防重试刷错误环 |
| F-G4 | ✅ | 扫描清单升级为**全 lib/*.js 动态枚举**（固定清单会随路由拆分再次失效）；18 code 全量值钉；`code:\s*['"]` 零内联固化为测试。自证：routes-manage.js 注入 `E.RECALL_STALEE` typo → 红，撤销 → 绿 |
| F-G5 | ✅ | **实证坐实**：删 inject 'agents' 裸 apply 仍全绿（agents 访问点 try/catch 守卫吞掉 cordis 抛错）。修复走两步：①装配改 `ctx.plugin({name,apply,inject,Config},{})`；②桩拓扑改「兄弟提供者插件」（ctx.provide）——cordis 属性访问沿祖先链 fiber store 上溯，root 直接 provide 会让未声明服务也命中（实测仍绿），兄弟 fiber 提供才与生产一致（声明进 inject 快照、未声明即抛）。行为级断言「preview 触达 agents 桩」删 agents → 红、恢复 → 绿。另加端点 body `'ok' in body` 断言（snapshot-info 白名单豁免）与 settings skip 无记录断言 |
| F-G6 | ✅ | CI 加 build + `git diff --exit-code lib/client.js`；build-client.mjs 路径 import.meta.url 锚定 + id 字面量断言（esbuild 规整为双引号，按 `\"dsh-recall-plugin\"` 断言）+ react 外零裸 require 断言。**补充事实**：esbuild 剥注释 + tree-shake 未用导出，注释级/未用导出级变更不改变产物哈希——门禁天然只对语义变更敏感（实测：被消费函数体变更 → 哈希变，还原 → 复原，两次构建确定性成立） |
| A1 | ✅ | deps.readSettings 改活绑定 `() => readSettings()` |
| A2 | ❌ 不采纳 | `[IO.File]::AppendAllBytes` 是 .NET 6+ API，Windows PowerShell 5.1（.NET Framework 4.x）没有——直接违反 pwsh 5.1 兼容硬约束（I21 同款教训）；字节级追加需 FileStream 重写发布关键路径，而收益仅限「文本跨多块 + 边界恰截半多字节字符」的极低概率 U+FFFD，症状有界。保持现状 |
| A3 | ✅ | manage titles/messages 重复 `if (!supported)` 死代码删除 |
| A4 | ✅ | routes-core.js 未用 ctx 解构删除（留注释说明分层动机） |
| A5 | ✅ | quarantine 失败告警按 store 5min 节流（工厂闭包 Map，无模块级状态） |
| A6 | ✅ | loadIndex 拒绝空字符串 id（与 F-G3 同批落地，逐条过滤计入 invalid） |
| A7 | ✅ | groupByLineage 成环输入测试（seen 防回溯死循环 + assigned 防 BFS 收敛）钉住 |
| A8 | ✅ | compat-audit I13 出处写全 `dsh-client-modules/lib/client.js` 并注明与本仓库产物同名之别 |

遗留提醒（发版前）：冒烟需覆盖「制造 rollback 失败 → 自动救援成功」与「含空格路径工作区手动救援命令可复制执行」两场景——单测已钉命令形状，活体路径待冒烟确认。
