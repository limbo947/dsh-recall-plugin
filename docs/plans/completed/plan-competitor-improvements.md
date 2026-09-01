# 竞品改进实施计划：健壮性补强与结构拆分

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 调研底稿：[research-competitors.md](../research-competitors.md)（2026-08-28 本地源码复核一节）｜ 状态：已实施（2026-08-28 代码落地：H1-H3/R1（路线 B：esbuild）/R2/F1/E1/D1 全部实现；实施后审查发现的 1 严重 + 6 一般问题已由 [plan-competitor-fixes.md](./plan-competitor-fixes.md) 于同日全数修复闭环，单测 172/172 绿）
> 前提：本计划中的现状事实已于 2026-08-28 对照本仓库当前代码逐条核验（出处见下表）；官方 API 相关项（F1、R1 spike）实施时须先核验本机 dsh 安装目录 `.d.ts` 与构建产物，dsh 升级后须重新核验。

## 背景与去重

2026-08-28 对三个同类项目（dsh-rewind / dsh-turn-rewind / DSH-EasyRewrite）完成本地源码级评估（九维度对比，见 [research-competitors.md](../research-competitors.md)）。评估产出的建议清单与已实施的 P0/P1/设置页计划存在重叠，**先按代码事实去重，只对增量缺口立项**，避免重复建设与范围蔓延。

### 已核验的现状事实表（不重复立项的依据）

| 评估建议 | 现状（代码出处） | 结论 |
|---|---|---|
| preview→execute 漂移检测 | P0-3 已实现 STALE total 比对（[lib/index.js](../../../lib/index.js) L606-611），client STALE 分支自动重新预览 | 已覆盖；tree-hash 全量 fencing 被 plan-p0 显式拒绝（「同数不同文件边缘情形由安全快照兜底，不过度设计」），见「明确不做」 |
| 回退前救援快照 | P0 已实现 pre-rollback 安全快照 tag（[lib/index.js](../../../lib/index.js) L617-623，`pre-rollback-<ts>` 前缀，不进 index.json） | 快照「打」已覆盖；缺口是「用」——见 H1 |
| 运行中 agent 拦截 | P0-1 已实现 AGENT_BUSY（[lib/index.js](../../../lib/index.js) L601，preview/execute 双处） | 已覆盖 |
| host↔client 结构化机器通道 | snapFeedback 已为结构化字段；端点已携带 `code`（STALE/NO_SNAPSHOT/NO_STORE/AGENT_BUSY 等） | 通道形态已覆盖；缺口是 code 散布无单一事实源——见 H3 |
| 错误码化 | 各端点内联 code 字符串，client 直接展示 `res.message` | 部分覆盖；缺口是收敛与文案映射——见 H3 |
| index.json 原子写 | win32 走 base64 分块写（[lib/store.js](../../../lib/store.js) L372-386 `writeTextViaShell`），首块覆盖、续块追加——**多块序列中途崩溃即留截断 JSON** | 未覆盖——见 H2 |
| index.json 载入校验 | `loadIndex`（[lib/snapshots.js](../../../lib/snapshots.js) L113-147）解析失败静默当空历史 | 未覆盖——见 H2 |
| 回退失败自动恢复 | `rollbackFor`（[lib/snapshots.js](../../../lib/snapshots.js) L284-294）失败直接抛错，工作区可能半回退；safety tag 只打不用 | 未覆盖——见 H1 |
| 单文件 ≤800 行纪律 | [lib/client.js](../../../lib/client.js) ~1480 行、[lib/index.js](../../../lib/index.js) ~1130 行，双双超线 | 未覆盖——见 R1/R2 |
| 端到端装配验证 | 现有 vitest 纯逻辑单测 + test:probe 字段探针 + check:dsh 版本巡检，无「真实 cordis context 起插件」层 | 未覆盖——见 E1 |
| 耦合点台账 | AGENTS.md「已知坑」为散文列表，无「子系统×不变量×探针」矩阵 | 未覆盖——见 D1 |
| 版本家族入口 | 无；EasyRewrite 的 familyOfSession 是唯一有用户价值的差异化功能创意 | 待 spike——见 F1 |

---

## H1 回退失败救援闭环（rescue reset）

### 目标

`rollbackFor` 失败（git reset 中途错误、锁、进程被杀）时工作区处于半回退状态，当前仅 toast 报错，用户无一键恢复路径。利用已有的 `pre-rollback-<ts>` safety tag（P0 起每次 execute 都打），在失败时**自动 reset 回 safety tag**，并把救援过程的警告聚合进错误消息，堵上「唯一的不可逆操作缺口」的最后一环。

### 任务分解

1. **rollbackFor 返回值细化**（[lib/snapshots.js](../../../lib/snapshots.js) L284-294）：保持 `{ ok, count }` 成功形状不变；失败路径不再裸抛，区分「reset 未开始」（工作区未动）与「reset 部分完成」（半回退）。双平台 rollback 脚本已输出 `ROLLBACK_OK` 哨兵——无哨兵即失败，失败时工作区状态不可知，一律按「可能半回退」处理。
2. **execute 失败分支执行救援**（[lib/index.js](../../../lib/index.js) L591-630）：`snaps.rollbackFor(id)` 返回非 ok（或抛错被 enqueue 捕获）时，若本次已打 safety tag，则执行 rescue reset 到该 tag；救援结果（成功/失败及原因）聚合进返回给 client 的 `message`，并 `recordError` 落盘。
3. **双平台新增 rescueScript 模板**（[lib/scripts.pwsh.js](../../../lib/scripts.pwsh.js) / [lib/scripts.posix.js](../../../lib/scripts.posix.js)）：`git --git-dir=<store.git> --work-tree=<root> reset --hard <safetyTag>`。必须遵守：
   - 两文件**同名导出**（scripts-contract 单测钉住）；
   - 脚本内维持 `g='<store.git>'` 赋值约定（runShell 失败兜底按 `$g` 清孤儿/锁）与 `RECALL_CLEANUP` 哨兵语义；
   - pwsh 对 native 非零退出不抛错——显式查 `$LASTEXITCODE` 并 throw；POSIX 注意 `set -e` 与 `if/fi` 约定。
4. **safetyId 传递**：execute 内 safetyId 已生成（L617），将其传入救援分支；`rollbackFor` 失败形状需携带足够上下文（或在 execute 层捕获后自行组织救援——倾向后者，rescue 属编排职责，snapshots.js 保持单职责）。
5. **rescue 也失败时**：消息中明确给出 safety tag 名与手动恢复命令（`git --git-dir=... reset --hard pre-rollback-<ts>`），recordError 记录完整上下文——fail-loud，不静默。

### 改动落点

- [lib/snapshots.js](../../../lib/snapshots.js)：`rollbackFor` 失败形状细化（error 字段携带脚本输出摘要）
- [lib/index.js](../../../lib/index.js)：`execute` handler 失败分支 + 救援编排
- [lib/scripts.pwsh.js](../../../lib/scripts.pwsh.js) / [lib/scripts.posix.js](../../../lib/scripts.posix.js)：新增 `rescueScript(store, gitExe, root, tag)` 同名导出
- tests/：scripts-contract 补 rescueScript 条目；新增 rescue 编排的纯逻辑单测（mock runShell）

### 测试与验收

- 单测：rescue 触发/救援成功/救援失败三分支；scripts-contract 同名导出与 `$g=` 约定不回归。
- 冒烟：制造 rollback 失败（如回退期间人为占用文件锁）→ 确认工作区自动恢复到回退前状态，错误提示含救援结果与 tag 名。
- 回归：正常撤回冒烟路径（中文路径工作区 → 发消息 → 改文件 → 撤回）不受影响。

### 风险与回退

- 风险：safety 快照本身失败（L620-622 记录后继续）时无救援点——此时 rescue 分支跳过并在消息中声明「无可用救援快照」，行为退化为现状，不更差。
- 风险：rescue reset 与半截 rollback 并发——同一 enqueue 队列内串行，无并发窗口。
- 回退：功能集中在 execute 失败分支，revert 即恢复现状。

---

## H2 index.json 原子写 + 载入校验

### 目标

win32 的 base64 分块写（首块覆盖、续块追加）在多块序列中途崩溃时留下截断 JSON；`loadIndex` 解析失败静默当空历史，索引损坏零信号。改为 **tmp 写 + rename** 双平台原子替换，载入做浅校验，损坏时 fail-loud 并保留现场。

### 任务分解

1. **双平台原子写模板**（[lib/scripts.pwsh.js](../../../lib/scripts.pwsh.js) / [lib/scripts.posix.js](../../../lib/scripts.posix.js)，同名导出 `fileWriteAtomicCmd` 或扩展 `fileWriteCmd`）：
   - pwsh：分块写 `<file>.tmp`（沿用 base64 分块规避 32767 argv 上限）→ `Move-Item -Force <file>.tmp <file>`（同卷 rename 为 O(1) 元数据操作）；每块查 `$LASTEXITCODE`。
   - POSIX：stdin 写 `<file>.tmp` → `mv -f`；注意 `set -e` 下禁用 `cond && cmd` 裸链。
   - 写模板维持 `$g=` 赋值约定的适用性评估：该约定服务于「带 store 的 git 脚本」清孤儿，纯文件写模板不带 store 语境则不需要——以 scripts-contract 单测现有钉法为准，新增模板同步补条目。
2. **writeTextViaShell 切换**（[lib/store.js](../../../lib/store.js) L372-386）：index.json 与 exclude.txt 共用此函数，一并受益；exclude.txt 损坏代价低，不额外区分。
3. **loadIndex 浅校验 + fail-loud**（[lib/snapshots.js](../../../lib/snapshots.js) L113-147）：
   - JSON.parse 失败 → 将坏文件改名 `index.json.corrupt-<ts>` 保留现场 → `recordError('recall index corrupt: ...')` → 按空索引继续（孤儿重建 `rebuildOrphans` 可从 tag 名反推重建，数据不丢）；
   - 解析成功但形状非法（非数组、条目缺 id/root/time 或类型错）→ 逐条过滤非法条目并 recordError 计数，整体不判死；
   - client 经 `status` 端点的 errors 通道可见（现状已通），无需新通道。
4. **性能评估**：rename 为 O(1)；tmp 写比分块直写多一次 rename 系统调用，索引写频率为每消息一次，可忽略。

### 改动落点

- [lib/scripts.pwsh.js](../../../lib/scripts.pwsh.js) / [lib/scripts.posix.js](../../../lib/scripts.posix.js)：原子写模板
- [lib/store.js](../../../lib/store.js)：`writeTextViaShell` 接线
- [lib/snapshots.js](../../../lib/snapshots.js)：`loadIndex` 校验与 `.corrupt` 备份
- tests/：loadIndex 损坏/形状非法/正常三分支单测；scripts-contract 同步

### 测试与验收

- 单测覆盖：截断 JSON → `.corrupt-<ts>` 生成 + recordError + 按空索引继续；非数组/缺字段条目 → 过滤 + 计数告警。
- 冒烟：手工截断 index.json → 重启插件 → 设置页错误列表可见告警，orphan 重建后快照列表恢复。
- 两平台心智检查：路径引号、编码、argv 上限（pwsh 分块逻辑不变，仅改最终 rename）。

### 风险与回退

- 风险：`.tmp` 残留（rename 前崩溃）——无害，下次写覆盖；可在 ensureGit/启动预热时顺手清理 `*.tmp`，作为可选子项。
- 风险：POSIX rename 跨卷——tmp 与目标同目录，必然同卷，无此风险。
- 回退：写路径与读路径独立，分别可 revert。

---

## H3 错误码收敛（lib/errors.js）

### 目标

端点 `code` 字符串（STALE/NO_SNAPSHOT/NO_STORE/AGENT_BUSY/INDEX_CORRUPT（H2 新增）等）散布各 handler，无单一事实源；client 直接展示 host 文案，机器码与人文案未分层。新建常量表收拢，client 按 code 映射文案（保留 host message 兜底）。

### 任务分解

1. **新建 [lib/errors.js](../../../lib/errors.js)**：导出错误码常量表（如 `RECALL_STALE`/`RECALL_NO_SNAPSHOT`/... 或保持现有字符串值不变仅集中导出——倾向后者，code 是 client 已消费的线上契约，**不改值只收拢**）+ 每条语义注释（触发条件、client 预期行为）。
2. **index.js 全部端点替换引用**：errBody（[lib/index.js](../../../lib/index.js) L338-342）与各 handler 内联字符串改为常量引用。
3. **client 按 code 映射文案**（[lib/client.js](../../../lib/client.js)）：撤回流程的错误展示点（openPreview/executeRecall 失败分支、STALE 自动重新预览）改为 `code → 文案` 映射，未命中回退 `res.message`；为将来 locale 分层留口（当前插件无 i18n 层，不预建）。
4. 与 H1/H2 协同：新增 code（救援结果、INDEX_CORRUPT）直接进常量表。

### 改动落点

- 新建 [lib/errors.js](../../../lib/errors.js)
- [lib/index.js](../../../lib/index.js)、[lib/client.js](../../../lib/client.js)、[lib/snapshots.js](../../../lib/snapshots.js)（feedback 相关 code）
- tests/：常量表与端点返回的一致性单测（扫描 endpoints 返回的 code 都在表内）

### 测试与验收

- 单测：任意端点错误响应的 code ∈ 常量表。
- 冒烟：STALE / AGENT_BUSY / 无快照 三场景 client 文案正确。
- 契约不回归：直调 API 返回的 code 字符串值与收敛前完全一致（grep 比对）。

### 风险与回退

- 风险极低：纯重构，不改值；误改值由「code 字符串值 grep 比对」验收兜住。

---

## R1 拆 lib/client.js（~1480 行）—— 前置 spike 定路线

### 目标

对齐 ≤800 行纪律。拆分为入口装配 + 撤回核心 + 设置卡片 + 工具层四块。**浏览器加载契约是最高风险点，先 spike 再动手。**

### 前置 spike（不成立则换路线）

读本机 dsh 安装目录（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh`）的 web client 加载器（`window.__ModuleLoader__`）源码，确认：
1. 插件 client 入口是单文件 CJS 风格 factory，是否支持加载 ESM 多文件（相对 import）；
2. 若不支持 → 引入 esbuild 打包（devDeps 已有；AGENTS.md「运行时形态」已取消零构建硬约束，产物仍直发 lib/，package.json `files` 含整个 lib/ 目录无需改）。

结论两选一：**A. 直接拆 ESM 多文件**（loader 支持）；**B. src/client/ 多文件 + esbuild 打包出单文件 lib/client.js**（loader 不支持，参照 dsh-rewind build.mjs 的 loader 包裹格式）。spike 结论记录在本文档状态节。

> **spike 结论（2026-08-28 已核验，路线 B）**：本机 dsh 的 `window.__ModuleLoader__`（`dsh-client-modules`）实现为「lazy CJS table」，不支持 ESM 多文件相对 import：
> - 插件 bundle 由 `ClientModuleRegistry.serveBundle` 直接 `readFile` 原文 serve 为 `text/javascript`，浏览器以 classic `<script>` 执行（`defaultLoadBundle` 用 `document.createElement("script")`）——顶层 `import` 会整包 SyntaxError 拒载；
> - factory 收到的 `require(spec)` 只按「包名」粒度解析（seed word → loadCache → 已注册 factory），不认相对路径，未命中即 throw（`bundle purity gate`，`makeRequire` 的 miss 分支）；
> - 每个 package 只有一个 client 入口文件（`exports["./client"]`，`clientExportOf`），graph row 粒度是包名。
>
> 因此走 **src/client/ 多文件 + esbuild 打包单文件 lib/client.js**：`react` 标记 external，由 factory 的 `require("react")` 在运行时从平台模块表提供。注意：计划撰写时称「devDeps 已有 esbuild」，实际本仓库 devDeps 仅 vitest（esbuild 未声明、未安装），实施时需先 `npm i -D esbuild`。

### 任务分解（按现状符号边界，拆法两路线通用）

- `util`：api（L30-36）、ensureInit（L180-208）、mountToast/showNotice/showThrottledToast（L127-179）、writeClipboard（L226-249）、clockText/bytesToMb 等纯函数
- `recall-node`：UserRecallNode（L359-630）+ recallPanel（L287-358）+ KIND_INFO/summaryText + icons
- `settings-cards`：ExcludeCard（L639-726）、ManageCard（L727-1107）、ExcludeFilesSection（L1108-1155）、ConfigForm（L1156-1379）、SectionToggle/RecallSettingsCard（L1380-1439）、EXCLUDE_SUGGESTIONS
- `client.js` 入口：css、slot 注册（chat.node L1443-1468 含 priority 冲突递减重试、settings.plugin.item L1469-1480）——**已知坑不得回归**：keyed key 覆盖 `['user','steering']`、负值 priority、settings key=namespace `dsh-recall`。

### 改动落点

- [lib/client.js](../../../lib/client.js)（及新子文件；路线 B 则新增 src/client/ 与 build 脚本、package.json scripts/files 同步）
- tests/：可纯化部分（summaryText、buildTree、时间/字节格式化）补单测

### 测试与验收

- 冒烟全路径：撤回按钮出现/预览/确认/STALE/回退/回填/图片渲染；设置页三卡片 + 树形管理全功能。
- 路线 B 额外：构建产物 loader 包裹格式断言（对照 dsh-rewind 的构建冒烟断言做法）；`npm pack --dry-run` 确认 files 覆盖。

### 风险与回退

- **本期最高风险项**：loader 契约误判导致插件白屏。缓解：spike 先行；拆分与行为变更不同 commit，纯搬运先行，逐块迁移逐块冒烟。
- H3 的 client 文案映射改动与 R1 有文件级冲突——顺序上 H3 先行（改动小），R1 拆分在后。

---

## R2 拆 lib/index.js（~1130 行）

### 目标

按现有符号边界分四块，纯模块拆分，无加载契约风险（Node ESM 相对 import 原生支持）。

### 任务分解

- `lib/session-info.js`：titleFromEvents / liveTitleFast / liveMessageTextFast / messageTextFromEvents（L94-167）——纯函数为主，顺手补单测
- `lib/routes-core.js`：init / snapshot-info / preview / execute / status 端点 + errBody/readJsonBody/sendJson/runLimited（L157-167、L338-373、L538-630、L1040-1047）
- `lib/routes-manage.js`：exclude-get/set、config-get/set/reset、manage（L632-1039）+ 删除辅助 deleteSnapshotsByFilter/deleteAllSnapshots（L419-537）
- `lib/index.js` 入口：Config schema、inject、apply 装配、enqueue/agentBusy、store 发现（collectCwds/parseStoresDump/dumpStores/locateSnapshotOnDisk/collectAllSnapshotRecords/listExcludeFiles，L168-337、L374-418）、session/event 与预热（L1049-1130）

### 改动落点

- [lib/index.js](../../../lib/index.js) 及三个新文件；端点表结构保持单一 `endpoints` 对象供 webServer 注册（组装处合并）

### 测试与验收

- 现有 vitest 全绿；test:probe / check:dsh 不受影响。
- 冒烟：全部 API 端点直调（init/snapshot-info/preview/execute/exclude/config/manage/status）+ 撤回全链路。
- 拆分后每文件 ≤800 行（含注释空行外的有效行数按用户规则核算）。

### 风险与回退

- 低风险：纯搬运 + import 接线；与 H1-H3 同文件的改动按「H1→H2→H3 先落地，R2 最后拆」排序，避免在搬家途中改逻辑。

---

## F1 版本家族入口 —— 前置核验官方 lineage 能力

### 目标

撤回多次后给用户「版本家族」切换入口（创意源自 EasyRewrite 的 familyOfSession，但其 O(N·64) 无缓存渲染期计算与 localStorage 依赖不移植）。**官方 API 是否暴露 parentId lineage 未核验，先 spike，无能力则关闭此项并记录结论**（先例：P0-2 复现后关闭）。

### 任务分解（严格按序，第 1 步不成立则终止）

1. **核验**（不写产品代码）：查官方 `.d.ts`（`dsh-client-runtime/lib/types/client/contract/` 的 sessions 契约、`@deepseek-ai/dsh-session` 类型）与构建产物——sessions 记录是否带 parentId/forkedFrom 类字段；有则补探针条目（tests/ 探针文件），无则记录结论关闭。

> **spike 结论（2026-08-28 已核验，能力存在但假设有缺口）**：
> - 官方 API **暴露 lineage**：`SessionSummary.parentId?: SessionId`（`dsh-client-runtime/.../sessions/service.d.ts` L43）、`SessionListEntry.parentSessionId` + `depth` + `flattenLineage()`（`sessions/lineage.d.ts`）、`fork({sessionId, atSeq?, increaseTitle?}) → Promise<SessionId>`（`contract/sessions.d.ts` L90，与本插件已用签名一致）。client 侧可经 `ctx.sessions.list.getSnapshot().byId[id].parentId` 同步读取。
> - **假设缺口**：计划定位「client-only、host 无需改动（数据走官方 sessions 服务）」，但 `archiveSession` 的语义是「hidden from grouping surfaces」（`contract/workspaces.d.ts` L89-94）——撤回后原会话被归档即从 `sessions.list` 隐藏，**中间版本的 parentId 链断裂**：撤回两次形成 A→B→C 时，A、B 已归档、仅 C 在 list，纯 client 侧只能读到「C.parentId=B」这一层，无法还原完整 A→B→C 链，与验收「撤回两次 A→B→C 正确聚族」不符。
> - 完整家族需 Host 侧在 fork 时持久化 childId↔parentId 关系（超出「client-only」假设）；纯 client-only 只能覆盖「仍在 list 的会话」的一层 lineage。
2. **若有能力**：设置页快照管理树按 lineage 分组展示（fork 链聚族），提供「切换到该版本会话」入口（打开对应 sessionId）；家族推导结果 **memo 缓存**（会话列表不变不重算），渲染期零重复扫描。
3. client-only 功能，host 无需改动（数据走官方 sessions 服务）。

### 测试与验收

- 第 1 步结论记录在本文档状态节；有能力的场景：撤回两次形成 A→B→C 链 → 设置页正确聚族 → 切换入口打开正确会话。
- 探针条目纳入 `npm run test:probe`。

### 风险与回退

- 字段假设风险（合规清单 #8）：探针钉住字段形状，dsh 升级后探针变红即降级隐藏入口。
- 回退：纯增量 UI，关闭开关即退回现状。

---

## E1 verify-host.mjs 端到端装配验证

### 目标

现有测试层缺「真实 cordis context 起插件」一环：字段探针钉官方 API 形状、单测钉纯逻辑，但 inject 漏声明（P0-1 冒烟实证过的缺陷类）、端点未注册、Config schema 无效等装配层错误只能靠活体冒烟发现。新增 `scripts/verify-host.mjs` 把装配断言变成本地可跑的门禁（参照 dsh-rewind verify-host.mjs 15 项断言的做法）。

### 任务分解

1. 新建 `scripts/verify-host.mjs`：用 dsh 安装目录的 cordis 真实 `new Context()` + 最小服务桩（webServer/sessions/settings/agents 等 inject 声明的全集）apply 插件，断言：
   - apply 不抛（inject 声明完整——漏声明在此即红，不再等活体冒烟）；
   - 全部预期端点已注册（init/snapshot-info/preview/execute/exclude-*/config-*/manage/status/messages）；
   - Config schema 为活 Schemastery schema 且默认值合法（合规清单 #3）；
   - 卸载后注册清零（合规清单 #2/#5）。
2. 接入 package.json scripts（与 `test`、`test:probe`、`check:dsh` 并列；是否串入统一 `check` 门禁实施时定，不预写）。
3. 定位说明：**不替代活体冒烟**（不起真 git/真会话），只做装配层断言；CI 可跑（依赖 dsh 安装目录存在，CI 无 dsh 时 skip 而非 fail，参照 test:probe 现有处理）。

### 测试与验收

- 故意从 inject 删掉 `'agents'` → 脚本变红；恢复 → 变绿。
- `npm run verify:host`（或定名）本地通过。

### 风险与回退

- 服务桩形状假设风险：桩只实现插件实际调用的方法面，从 probe 探针文件复用已核验的字段事实；脚本失败信息需能区分「插件缺陷」与「桩缺陷」。

---

## D1 compat 台账（docs/compat-audit.md）

### 目标

把 AGENTS.md「已知坑」散文列表升级为「子系统 × 不变量 × 探针」矩阵（参照 dsh-rewind docs/compat/audit.md 的 I1-I8 台账），每条耦合点标注：依赖的官方行为、出处（.d.ts/构建产物行号）、对应探针/单测条目、失效症状、dsh 升级时的复查动作。dsh 升级后按表定点复查，替代全文重读 AGENTS.md。

### 任务分解

1. 新建 `docs/compat-audit.md`（长期规范文档，按 docs 规范放 docs/ 根）：矩阵覆盖 chat.node slot（key/priority/props 字段）、renderMessageImages、sessions.fork（increaseTitle 语义）、sessionQuery（header.id）、cordis inject 门禁、settings namespace 分发、ModuleLoader 契约（R1 spike 结论并入）等现有「已知坑」全部条目。
2. AGENTS.md「已知坑」节保留但精简为一行一条 + 指向台账；漂移控制节补「dsh 升级后过 compat-audit 矩阵」。
3. 与 E1 协同：装配断言条目在矩阵中标注对应 verify-host 断言。

### 测试与验收

- 矩阵每条都能回答「这条坏了哪个测试先红」；回答不出的条目即为测试缺口，列入补测清单（不阻塞本文档落地）。

### 风险与回退

- 纯文档，零风险；注意与 AGENTS.md 单一事实源关系——细节住台账，AGENTS.md 只留索引，避免双写漂移。

---

## 明确不做（防范围蔓延）

1. **不做 tree-hash 全量 fencing**——plan-p0 P0-3 已决策：total 比对 + 安全快照兜底，「同数不同文件」边缘情形接受风险，不过度设计。
2. **不引入 marker/幽灵 step 帧机制**（dsh-rewind 路线）——4 处依赖 harness 未承诺内部行为，两起线上事故为前车之鉴；fork 路线不动摇。
3. **不引入分布式级锁/owner 链/机器 GUID、一次性迁移代码常驻、读路径全量重哈希**（turn-rewind 过度工程三件套）——单机插件威胁模型用不上。
4. **不用 aria-label/报错文案正则匹配、不用 localStorage 存配置**（EasyRewrite 耦合反例）——官方改文案即静默失效，与合规清单 #8 冲突。
5. **不在本期做 i18n**——H3 的 code→文案映射只留分层口，插件当前单语，不预建立即用不到的抽象。
6. **不为 R1 强行上马构建链**——spike 结论支持 ESM 多文件就走路线 A，esbuild 仅在 loader 不支持时引入。

## 全局实施顺序与验收

```
H1 → H2 → H3（host 健壮性，同文件小步落地）
  → R1 spike → R1 拆分（含 spike 结论门禁）
  → R2（host 纯搬运，与 R1 可并行，但同仓建议串行避冲突）
  → F1 spike →（有能力则）F1
  → E1 → D1（工程化收尾，E1 先行让 D1 台账有断言可引）
```

- 顺序理由：H 系改动小收益直接且集中在 execute/snapshots，先行；R1/R2 是纯搬运，在逻辑变更安定后进行，避免「搬家途中改逻辑」；F1/E1 各自带 spike 前置门禁。
- 每项实施前过 AGENTS.md 合规清单；重点：#8（F1/R1 spike 字段核验）、#3（无新硬编码，新参数走 Config）、#5（HMR 无 module 级可变状态）。
- 总验收：vitest 全绿 + scripts-contract 不回归 + test:probe 通过 + AGENTS.md 冒烟路径（中文路径工作区 → 发消息 → 改文件 → 撤回 → 设置页管理）+ 本计划各项「测试与验收」。
- 发版语义：H1/H2/H3 为修复（patch）；R1/R2 重构无行为变化（patch）；F1 新功能（minor）；E1/D1 工程项可随行。具体版本号发版时定。
