# P1 实施计划：工程补课

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：**已实施（2026-08-26，三项全部落地，93 个单测 + 9 个探针全绿）**
> 三项相互独立，可分别实施发版；建议顺序 P1-1 → P1-2 → P1-3（测试先行，后两项的新逻辑直接进测试）。

---

## P1-1 最小测试集 + CI

### 目标

结束纯手工冒烟：纯逻辑单测 + 官方 API 字段探针 + CI。把 AGENTS.md 合规清单 #8（禁字段假设）从纪律变成断言，拦住 issue #9（`loadImage` 不存在、守卫静默失效）这类事故。

### 任务分解

1. **引入 vitest（devDependency）**
   - [package.json](../../../package.json)：`devDependencies` 加 `vitest`；`scripts` 加 `"test": "vitest run"`。
   - vitest 只在开发/CI 用，运行时产物仍是纯 JS 直发 `lib/`。
2. **单元测试（tests/unit/，无 DSH 依赖，快）**
   - `config.test.js`：`createConfig` 的 env 覆盖优先级、非法值回退、`baseExcludes` 过滤（从 [lib/config.js](../../../lib/config.js) 导入——注意该文件 import schemastery，需确认测试环境可解析 profile 的 junction；若不行，把纯解析逻辑与 schema 声明拆开或用 vi.mock）。
   - `snapshots-logic.test.js`：`parseSkipped`（SNAP_SKIP 行解析）、`parseChanges` 平台分叉、`resolveCutSeq` 的 turn/end 解析逻辑（把可纯化的部分抽出或在测试里注入 mock 的 `rt`——`createSnapshots` 是工厂函数，注入假 `rt`/`ctx` 即可单测内部纯逻辑）。
   - `scripts-contract.test.js`：**两套脚本模板同名导出断言**（`scripts.pwsh.js` 与 `scripts.posix.js` 的导出键集合全等——AGENTS.md 重要约束的机器化）+ 关键模板结构断言（快照脚本含 `--ignore-errors`、失败兜底脚本含 `g='<store.git>'` 赋值约定与 `RECALL_CLEANUP` 哨兵——AGENTS.md 已知坑的回归钉）。
   - `client-pure.test.js`：client.js 中可纯化的辅助函数（若 client.js 依赖浏览器环境较多，只测导出的纯函数；必要时把纯逻辑抽到独立小模块——注意 800 行纪律与「不过度重构」的平衡，只抽测试确实需要的）。
3. **官方 API 字段探针（tests/probe/，依赖本机 dsh 安装）**
   - 原理：直接 import dsh 安装目录的真实包类型/实现，断言插件依赖的官方字段存在。与运行时同源，dsh 升级后探针先红——这正是想要的预警。
   - 探针清单（每条对应一个历史坑或现有调用点）：
     - `chat.node` slot props：`dsh-client-ui-conversation/lib/types/contract/slots.d.ts` 中存在 `renderMessageImages`、`node`、`cwd` 字段声明（issue #9 的机器化钉子）。
     - `sessions.fork` 签名：`dsh-session` 类型中 fork 接受 `{ atSeq }` 且**无强制** `increaseTitle`（1.6.x 行为回归钉）。
     - `sessionQuery.listSessions()` 记录结构：id 在 `header.id`（1.5.2 坑的钉子）。
     - `AgentRegistry`/`AgentStatus`（P0-1 依赖）、`fs/observed` 载荷（P0-2 依赖）——P0 调研已核验的字段固化为断言。
   - 运行条件：CI 里 dsh 包不可得（私有/未发布 npm），探针**只在本地跑**（`npm run test:probe`，单独 script）；CI 跑 `vitest run tests/unit`。文档写明「dsh 升级后本地必跑 test:probe」并进 AGENTS.md 开发与验证节。
4. **CI（.github/workflows/ci.yml）**
   - 触发：push + PR；runner ubuntu-latest，Node 22；步骤：`npm ci` → `npm test`。
   - 加 `npm pack --dry-run` 步骤并断言包内容（`lib/`、`cordis.patch.yml`、`README.md`、`LICENSE` 在 files 列表内）——借鉴 turn-rewind `package-layout.test.mjs`，可直接做成 `tests/unit/package-layout.test.js`（node:child_process 跑 pack --dry-run 断言输出），比 shell 步骤更可移植。
   - 不跑 publish（发布仍走现有手动流程，OIDC 是 P2-3）。
5. **README/AGENTS.md 增补**：开发与验证节加「跑测试 / 探针」小节。

### 测试与验收

- `npm test` 本地全绿；故意把探针里 `renderMessageImages` 改成 `loadImage` → 探针红（验证探针有效性后改回）。
- CI 在 GitHub Actions 绿（首次接入可能需修 package.json files/engines 等小问题）。
- 故意删 `scripts.posix.js` 一个导出 → 同名导出断言红。

### 风险与回退

- client.js/index.js 的模块级 ESM import 链可能拖入浏览器/cordis 依赖导致单测环境炸——缓解：工厂注入式测试（传 mock rt/ctx），不追求覆盖率数字，只钉关键逻辑。
- 探针依赖本机安装路径（`%APPDATA%\npm\...`），跨机器路径差异——缓解：探针用 `require.resolve`/环境变量 `DSH_ROOT` 定位，找不到时 skip（黄）而非 fail，避免没装 dsh 的贡献者被卡死。

---

## P1-2 快照跳过/失败记录持久化

### 目标

SNAP_SKIP 跳过与快照失败反馈落盘，重启后 `snapshot-info` 仍能解释「这条消息为什么没有/缺了快照」。现状：`state.snapFeedback` 内存 Map，重启即失（[lib/snapshots.js](../../../lib/snapshots.js) L154-160）。

### 任务分解

1. **存储设计（跟随现有 index.json，不引入新文件格式）**
   - index.json 条目扩展：`{ id, time, root, sessionId, feedback?: { failed?: true, error?: string, skipped?: string[] } }`——只对「需要解释」的消息写 feedback 字段，正常快照不带（省空间，老版本插件读新索引忽略未知字段，双向兼容——与 `root` 字段当年的兼容策略一致）。
   - 写入时机：`setFeedback` 里 keep 的分支之后，同一次 `saveIndex` 顺带落盘（`saveIndex` 已按 root 过滤 entries，把 feedback 从 `state.snapFeedback` 查表并入即可）。
   - 容量：沿用现有 200 条 FIFO 上限（内存 Map 已有），落盘天然继承同一上界；熔断状态（root 级）不落盘——它是瞬态环境状态，重启后熔断计数清零本来就合理。
2. **`loadIndex` 回填**：载入时把条目里的 feedback 写回 `state.snapFeedback`（`time` 用条目时间，保持 FIFO 序接近真实时间序）。
3. **`feedbackFor` 无改动**：查内存即可（loadIndex 已回填）。
4. **`snapshot-info` 端点无改动**：feedback 结构不变。
5. **client 无改动**：展示逻辑已消费 `{failed, error, skipped}` 形状。

### 测试与验收

- 单测（进 P1-1 框架）：saveIndex/loadIndex 的 feedback 往返一致；老格式索引（无 feedback 字段）正常载入。
- 冒烟：制造跳过（嵌套无提交仓库）→ 重启 dsh-web → 该消息撤回按钮处仍显示「已跳过未纳入的路径」。
- 兼容：用旧版插件创建的 index.json → 新版正常读取。

### 风险与回退

- index.json 体积略增（每异常消息一条 skipped 数组）——200 条上限封顶，可忽略。
- skip 路径含特殊字符进 JSON——JSON.stringify 天然处理，无手写转义。

---

## P1-3 存储总量上限策略

### 目标

防止快照无限累积（turn-rewind issue #11 实测膨胀 64MB 的前车之鉴）。加每工作区快照总数上限，超限清最旧。

### 任务分解

1. **Config 字段**（[lib/config.js](../../../lib/config.js)）
   - `maxSnapshotsPerWorkspace: Schema.number().default(500).description('每个工作区保留的最大快照数，超限删除最旧的')`。
   - **走 Config schema，不加 env**（合规清单 #3；与 DSH_RECALL_GC_* env 的历史张力不再扩大）。
   - `createConfig` 同步加解析（无 env 分支）；默认值镜像注释同步改。
   - 默认值取舍：500 ≈ 重度使用一周量级（每用户消息一快照）；太小会静默丢历史撤回点，太大失去保护意义。给用户大概率保留的值（合规清单 #4 语义）。
   - **0 或负值语义 = 不限制**（`pickNumber` min 放宽到 0，文档写明）——给想全保留的用户出口。
2. **清理逻辑**（[lib/maintenance.js](../../../lib/maintenance.js)）
   - 新函数 `enforceLimits(root)`：按 root 分组统计（内存 `state.snapshots` + 必要时 loadIndex），超限按 `time` 升序删最旧（复用现成的 tag 分块删除 + `saveIndex` 模式，`deleteSnapshotsByFilter` 与 `purgeSession` 已有同款实现，抽公共小函数或直接照抄结构——注意 800 行纪律，maintenance.js 当前 145 行，余量充足）。
   - **time=0 的孤儿条目**（rebuildOrphans 重建的）视为最旧优先清理。
   - 调用点：`runGc` 内（`sweepDeletedSessions` 之后、`gcScript` 之前）与 `runGcAll` 内——天然在串行队列里，与快照互斥，无 git 锁竞态。
   - 删除前 console.error 记一条（静默删历史撤回点必须留痕，与 purgeSession 同款）。
3. **设置页**：配置卡片自动出现新字段（schema 驱动，无 client 改动）；「快照管理」树不受影响（被清的快照自然消失）。
4. **归档会话保护**：不保护——被清理的最旧快照对应的撤回按钮在 client 会显示 `has:false`（消息还在但没有快照点），这是既有的降级语义，可接受；上限就是用来砍最旧的，不区分会话活跃度（区分会引入 turn-rewind 式复杂度，明确不做）。

### 测试与验收

- 单测：`enforceLimits` 的边界（恰好等于上限、超限 N 删 N 条最旧、0=不限、孤儿 time=0 最先删）。
- 冒烟：把上限调成 3 → 发 5 条消息出 5 快照 → 触发 gc → 剩最新 3 条；设置页快照树数量吻合。
- 回归：默认 500 下正常使用无感知。

### 风险与回退

- 误删用户想保留的早期撤回点——缓解：默认值宽松 + 0 可关 + 删除留痕；不做每会话保留窗口（明确砍掉的范围）。
- 与「会话删除联动清理」的交互：两者都在 gc 周期跑，purge 先行（会话都没了先清干净），enforce 后行，互不冲突。

---

## 发版与顺序

```
P1-1（测试框架 + CI）→ P1-2（feedback 持久化，带单测）→ P1-3（总量上限，带单测）
```

- P1-1 可单独发 patch（无功能变化）；P1-2/P1-3 合并发 minor（新 Config 字段、行为变化）；具体版本号发版时定。
- cordis.patch.yml 若默认值需进组合 base 层，按合规清单 #4 检查 insert 行是否需重述新键（maxSnapshotsPerWorkspace 有 schema 默认值，patch 层可不写；发布前复核）。

---

## 实施记录（2026-08-26）

全部三项已在 next 分支实施完毕，`npm test`（93 tests）与 `npm run test:probe`（9 tests）全绿。

### P1-1 落地差异

1. **vitest 引入**：devDependencies `vitest@^4.1.11`；scripts `test`（`vitest run tests/unit`）与 `test:probe`（`vitest run tests/probe`）分开——CI 只跑单测，探针仅本机。
2. **config.test.js**：`vi.mock('@deepseek-ai/schemastery')` 最小链式 mock（`.default().description()` 链）——单测不依赖 junction/真实 schemastery，CI 可跑。
3. **snapshots-logic.test.js**：`parseSkipped`/`parseChanges`/`scanCutSeq` 从工厂闭包**提为模块级导出**（行为不变），单测直接钉真实实现（vs 计划原写的「注入 mock rt」——提级更简单且钉得更死）。
4. **scripts-contract.test.js**：导出键集合全等 + 常数类型一致 + `--ignore-errors`/`RECALL_CLEANUP`/`g='<store.git>'` 结构断言（STORE_SCRIPTS 按每个函数签名单独构造调用）。**有效性验证**：临时删 posix 一个导出 → 3 条红，恢复后全绿。
5. **client-pure.test.js**：因 client.js 是 DSH 原样 serve 的 classic-script bundle（client-modules 直接读 `exports["./client"]` 文件、不能含顶层 import），不能拆独立模块。改为**从 client.js 真实源码按花括号配对提取纯函数体**，`new Function` 构造后在测试容器执行（零生产改动、零复制；改 client.js 语义即测红）。summaryText 闭包依赖 KIND_INFO 以参数注入。
6. **tests/probe/api-surface.test.js**：直接读 dsh 安装目录 `.d.ts` 断言。**路径与计划有出入**：`slots.d.ts` 实际在 `dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts`（计划写的 `lib/types/contract/` 不存在）；`sessions.fork` 契约在 `dsh-client-runtime` 而非 `dsh-session`（后者是 Host 侧 `fork(source, boundary?, childId?)` 签名，client 侧才是 `{sessionId, atSeq?, increaseTitle?}` 对象参数——**这正是探针的价值：不用探针核对就会写错包**）。定位用 env `DSH_ROOT` → `%APPDATA%\npm\node_modules\@deepseek-ai\dsh`，缺文件时 skip。
7. **CI**：ubuntu-latest + Node 22；`npm ci --legacy-peer-deps`（peerDeps 是私有包，CI 不可得，必须跳过）；`npm test`（内含 package-layout 测试跑 `npm pack --dry-run` 断言包内容，含 linux 上 spawn npm 不触发 DEP0190 的处理）。

### P1-2 落地差异

- saveIndex 落盘 feedback 时按 `{failed, error?}` / `{skipped[]}` 原样；loadIndex 回填时做形状清洗（error 非 string 丢弃、skipped 非数组丢弃、`failed:false` 且无 skipped 不入内存）——比计划描述的「原样回填」多一层防御（索引文件理论上可被手工编辑破坏）。
- 单测：`tests/unit/snapshots-persist.test.js`（5 例：写入/回填/旧格式/形状清洗/模拟重启往返）。
- **审查修正（2026-08-26，实施后代码审查发现）**：failed feedback 实际不落盘——`captureSnapshot` 失败路径只写 `snapFeedback`、不写 `state.snapshots`（索引条目在成功分支才 set），而 saveIndex 按索引条目遍历，failed 无从写入。**有意决策而非缺陷**：failed 与熔断状态同为瞬态内存态（重启即清，由重试自愈/熔断提示接管）；若为 failed 写无 tag 的幽灵条目，`manage` 树形会把不存在的快照当节点展示。目标语义据此收敛为：skipped（「为什么**缺了**快照」——成功快照+部分路径跳过）完整落盘往返；failed（「为什么**没有**快照」）仅进程内有效。单测首轮曾按「failed 落盘」断言——该状态组合在生产路径不存在（测试版字段假设，AGENTS.md #8 同类），已改钉真实形状：saveIndex 断言 failed 无条目不落盘、往返测试断言 failed 重启即失。

### P1-3 落地差异

- `selectOverLimitVictims(snapshots, limit)` 提为**模块级纯函数**导出（计划写的是工厂内直接实现），单测直接钉边界（恰好上限、超限删 N、孤儿 time=0 最优先、0/负=不限、多 root 独立）。
- 接线：`runGc` 在 `sweepDeletedSessions` 之后、`gcScript` 之前；`runGcAll` 在 sweep 之后——均在同一条串行队列，符合计划的互斥论证。
- `maxSnapshotsPerWorkspace`：Config schema 默认 500，createConfig 复用 pickNumber 风格但单独处理负值（0/负 = 不限制），config-get/config-set/client ConfigForm 同步新增字段（number 行 + 校验提示「0 表示不限制」）。
- 单测：`tests/unit/maintenance-limits.test.js`（纯逻辑 5 例 + 工厂级 4 例）。

### 遗留

- CI 首次运行可能暴露 actions/setup-node 的 npm cache 或 ubuntu pack 差异（本机无 ubuntu 环境无法预跑）；push next 后观察 Actions 结果。
- jsdom 不引入：client 组件级交互（STALE 重拉、fork 失败降级）不属于纯逻辑，仍靠 AGENTS.md 冒烟路径覆盖。
