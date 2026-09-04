# 竞品评估优化计划：交互补强与可靠性钉子（第三轮竞品改进）

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：待实施
> 调研底稿：2026-09-04 三竞品评估（SiriLee/dsh-rewind、Anionex/dsh-turn-rewind、Renzic-Stone/DSH-EasyRewrite，仓库快照 `%TEMP%\dsh-compare\`）。
> 七项相互独立，可按需挑选；实施顺序建议见文末汇总表。前两轮竞品改进见 [plan-competitor-improvements.md](../completed/plan-competitor-improvements.md) 与 [plan-competitor-fixes.md](../completed/plan-competitor-fixes.md)。

## 背景：评估结论摘要

三竞品评估（2026-09-04）核心结论：**本项目工程质量与可靠性四者最强**（唯一全量 TS + typecheck 门禁、290 单测 + 31 探针、四层 CI 门禁、串行队列/原子写/救援/心跳/熔断全套可靠性机制），**短板在产品交互丰富度**——对手已验证的真实需求（草稿备份、模式拆分、版本翻页器）本项目均未覆盖。

各竞品可借鉴点与必须规避的坑：

| 竞品 | 核心机制 | 值得借鉴 | 必须规避 |
|---|---|---|---|
| dsh-rewind | marker + surfaceOp.replace 同窗口 in-place 回退 | crash-safety 测试场景、restore journal 留痕 | **依赖 harness 内部语义**（surfaceOp 等，合规清单 #8 禁区） |
| dsh-turn-rewind | Change Ledger + agent/pre-step turn checkpoint | 「只回溯消息不碰文件」三模式、plan TTL 过期保护 | engine.ts 1090 行巨石文件、inspect/plan/apply 重复 capture |
| DSH-EasyRewrite | client 算边界 + sessions.fork + 归档（与本项目同路线） | 草稿持久化备份、版本翻页器交互 | client.src.js 1900 行无类型、**localStorage 版本树双源状态**、无 CI 无测试 |

路线决策：**坚守 fork 路线不动摇**（surface 替换体验更优雅但押注未公开契约，issue #9 已实证静默失败风险）；交互创意用本项目的架构纪律（host 单一事实源、TS、门禁）重新实现。

## 任务总览

| 项 | 主题 | 来源 | 优先级 | 前置依赖 |
|---|---|---|---|---|
| U1 | 撤回场景草稿保护 | EasyRewrite | 高 | 探针先行（InputHub 读取 API） |
| U2 | execute scope：仅回退对话模式 | dsh-turn-rewind | 高 | 无 |
| U3 | crash-safety 测试补强 | dsh-rewind | 高 | 先核对现有覆盖 |
| S1 | settings-cards.ts 预防性拆分 | 引以为戒 | 中 | 无（U1/U5 的前置） |
| U5 | preview TTL 过期保护 | dsh-turn-rewind | 中 | S1 |
| U4 | 还原过程 journal 留痕 | dsh-rewind | 低 | 无（建议随 U2 顺带） |
| U6 | 版本翻页器 | EasyRewrite | 调研先行 | 探针核验官方恢复会话 API |

---

## U1 撤回场景草稿保护

### 目标

撤回链路补上「用户未发送草稿」这一最后缺口：现状 [executeRecall](../../../src/client/recall-node.ts) fork 后 `fillDraft` 回填被撤回消息文本，**覆盖丢失**用户撤回前正在输入框写的草稿。

### 现状缺口（为什么做）

- 撤回场景：`fillDraft(fillTarget, text)` 回填的是被撤回消息内容；输入框里写了一半的新草稿被直接顶掉，无任何提示或恢复途径。
- 异常场景：dsh 重启/刷新输入框清空——**需先核验官方是否已有草稿持久化**（若有则此场景砍掉，只做撤回场景）。

### 任务分解

1. **探针先行**（合规 #8）：核验 `conversation.input.shell(sessionId).actions` 是否有读取草稿的 API（`getDraft`/`draft`/受控 state）。`tests/probe` 加条目；结论决定形态：
   - 有读取 API → 全方案（下述 2-3）；
   - 无读取 API → 撤回场景降级为「仅异常备份场景」（写侧 `setDraft` 已实证存在，读侧缺失则撤回时拿不到旧草稿），或整体搁置——探针结论为准，不硬做。
2. **撤回场景**（读 API 存在时）：`executeRecall` 前（`openPreview` 打开确认面板时更佳——给用户「草稿将保留」的确定预期）捕获当前会话草稿，若非空且 ≠ 被撤回消息文本：存 localStorage（按 sessionId 键控）；fork 后主行为不变（`fillDraft` 回填撤回文本），toast 提示「原草稿已备份」+ 一键恢复（恢复即再次走官方 `setDraft` 通道覆盖输入框）。
   - 优先级明确：被撤回消息文本是主回填（现状语义不动），用户草稿是次恢复途径——不做自动合并（合并策略是产品味觉问题，先给确定性）。
3. **异常场景**（若官方无草稿持久化）：输入变化 debounce（约 3s）备份到 localStorage；页面加载时输入框为空且备份较新 → toast 提示恢复。备份条目按会话数设上限（如 50 条 LRU），防 localStorage 无界膨胀。
4. **配置项**：`draftBackup`（boolean，默认 true）走 Config——[config.ts](../../../src/host/config.ts) Schema 与 `DEFAULTS` 两处同步（编译期已由 `ResolvedConfig` 钉住）、[types/config.ts](../../../src/types/config.ts) 同步、设置卡片加表单项（S1 拆分后加）。
5. **改动落点**：[src/client/recall-node.ts](../../../src/client/recall-node.ts)（撤回链捕获点）、[src/client/util.ts](../../../src/client/util.ts) 或新拆 `src/client/draft.ts`（备份序列化/LRU/过期纯函数，模块级导出供单测）、config 链四文件。

### 验收

- 探针记录草稿读取 API 存在性结论（进 compat-audit 台账）。
- 单测：备份序列化、LRU 上限、恢复判重（草稿=撤回文本时不提示）纯函数。
- 实弹：写一半草稿 → 撤回 → 新会话回填撤回文本 + toast 可恢复原草稿；`draftBackup: false` → 行为与现状完全一致。

### 风险与回退

- **最大风险是读 API 不存在**（探针前置决策，避免 issue #9 式静默失败重演）。
- localStorage 属浏览器存储，dsh 清缓存即失效——定位为「尽力兜底」而非保证，toast 文案不承诺持久。
- 回退：`draftBackup: false` 一键退回现状；新文件 `draft.ts` 独立可整体摘除。

---

## U2 execute scope：仅回退对话模式

### 目标

确认面板支持二选一：「回退文件与对话」（默认，现状）／「仅回退对话」——文件保持当前状态，只 fork 回退对话。覆盖「只想重来对话、保留文件改动」场景（对生成结果不满意的追问调整），dsh-turn-rewind 三模式弹窗已验证该需求真实存在。

### 任务分解

1. **契约**：[types/api.ts](../../../src/types/api.ts) `ExecuteArgs` 加 `scope?: 'both' | 'session-only'`（缺省 `both`，老 Host/Client 双向兼容——各自忽略未知字段/缺省字段）。
2. **Host 分支**（[routes-core.ts](../../../src/host/routes-core.ts) `execute`）：`scope === 'session-only'` 时——
   - `agentBusy` 拦截**保留**（对话回退时 agent 运行中同样危险）；
   - 跳过 `enqueue`（无 git 操作不入串行队列，队列是为 git 锁互斥而设）；
   - 跳过 previewTotal/previewTreeId 校验、安全快照、`rollbackFor`、`rescueRollback` 全链；
   - 直接 `resolveCutSeq` 返回（`count: 0`，语义为回退文件数）；
   - `NO_SNAPSHOT` 检查保留（按钮可见性以有快照为前提，检查无害且防御直调 API）。
3. **Client UI**（[recall-node.ts](../../../src/client/recall-node.ts) 确认面板）：radio 二选一，默认 both；选 session-only 时文案明确「文件保持当前状态，不会被回退」；execute 请求带 `scope`。preview 不改——diff 清单照常展示，session-only 下作为「当前文件与快照差异」的参考信息。
4. **lineage-record 照常**（fork 关系与文件无关，版本家族不受模式影响）。

### 验收

- 单测：execute `scope` 分支——session-only 路径断言**零 git 命令调用**（复用 routes-stale.test.js 的 mock 模式）；非法 scope 值回退 both。
- 实弹：改文件 → 撤回选「仅回退对话」→ 文件保持改动后状态、对话回退、原会话归档、版本家族记录正常；默认模式与现状逐项一致（回归）。
- agent 运行中选 session-only 仍被 AGENT_BUSY 拦截。

### 风险与回退

- 确认面板复杂度上升（recall-node.ts 345 行 +约 50 行，可控；若超 700 行预警线则同步小拆）。
- scope 缺省 both 保证零迁移成本；回退 = Client 不传 scope 即回到现状。

---

## U3 crash-safety 测试补强

### 目标

把「崩溃窗口期」场景钉进单测。现状可靠性机制（tmp+rename 原子写、H1 救援、孤儿重建、熔断）的单测多为纯逻辑验证，缺「进程在 X 步骤崩溃后重启」的钉子——dsh-rewind 专门有断电/半写/中断恢复测试，是四者中最值得抄的工程实践。

### 任务分解

1. **先核对现有覆盖**（[index-load](../../../tests/unit/index-load.test.js)、[rescue](../../../tests/unit/rescue.test.js)、[snapshots-persist](../../../tests/unit/snapshots-persist.test.js)、[routes-stale](../../../tests/unit/routes-stale.test.js)），列出已覆盖/未覆盖矩阵，只补缺口。
2. **预期缺口场景**（全部可纯逻辑单测：构造文件状态 → 调载入/重建函数 → 断言）：
   - rename 前崩溃：`index.json.tmp` 残留 + 旧 index 完整 → 载入旧 index、tmp 残留不影响后续写入；
   - index 半写损坏 → `.corrupt-<ts>` 隔离 + fail-loud 告警（核对是否已覆盖，无则补）；
   - **tag 已建但 index 未落盘**（快照中断窗口）→ `rebuildOrphans` 从 tag 名反推、时间从 creatordate 恢复；
   - lineage.json 损坏 → 按无处理不隔离（与 index 的 fail-loud 语义差异是**有意设计**，钉住防误改）。
3. 新增 `tests/unit/crash-safety.test.js`（或并入各域既有文件，按核对结果定）。

### 验收

- 每个窗口期场景有断言；故意破坏机制（如 mock 掉 rename 步骤）→ 对应测试红。
- `npm test` 全绿，无新增依赖。

### 风险与回退

- 无（纯测试，零生产代码改动）。

---

## S1 settings-cards.ts 预防性拆分

### 目标

[src/client/settings-cards.ts](../../../src/client/settings-cards.ts) 现 748 行，逼近 800 行红线；U1（draftBackup 表单项）与 U5（previewTtl 表单项）都会再推高——**先拆再加**，避免带着利息超限（dsh-turn-rewind engine.ts 1090 行、EasyRewrite client.src.js 1900 行是前车之鉴）。

### 任务分解

1. 按域拆分（纯移动，零行为变化）：
   - `settings-cards.ts`：装配 + 共享 UI 原子（卡片容器、字段行等）；
   - `config-card.ts`：插件配置表单（9 字段 + 恢复默认）；
   - `exclude-card.ts`：exclude 编辑卡片；
   - `snapshot-manager.ts`：快照树管理（版本家族聚族、搜索、分级删除）——预估约 400 行，若仍超 700 预警线再二拆（树渲染 / 操作逻辑）。
2. 拆分后各文件 < 700 行（800 红线减 100 预警余量，给后续表单项留位）。

### 验收

- `npm run build && npm test` 全绿、CI 产物新鲜度门禁通过；
- client 行为零变化（纯拆分，设置页三卡片逐项冒烟对照）。

### 风险与回退

- 纯移动风险低；唯一注意 esbuild 打包入口不变（[src/client/app.ts](../../../src/client/app.ts) 引用路径更新）。

### 实施记录（2026-09-04）

- 按域拆为四文件（纯移动，零行为变化）：
  - `src/client/settings-cards.ts`（861 → 74 行）：装配层 + SectionToggle 共享原子 + RecallSettingsCard 外壳；
  - `src/client/snapshot-manager.ts`（444 行）：快照树管理整卡 + `groupByLineage`/`FamilyInfo`（F1 纯函数随域归属本文件）；
  - `src/client/config-card.ts`（270 行）：插件配置表单（9 字段 + 恢复默认）；SectionToggle 经工厂参数注入避免反向依赖装配层成环（`SectionToggleProps` 结构类型契约）；
  - `src/client/exclude-card.ts`（144 行）：exclude 编辑卡片 + 分区拉取。
- 引用路径更新两处：`app.ts` 的 `buildSettingsCards` 导入面不变（装配层仍是 settings-cards.ts）；`tests/unit/client-pure.test.js` 的 `groupByLineage` 导入改指 snapshot-manager.js。
- 验收：typecheck + build + 单测 296 例全绿；产物新鲜度由 CI 门禁兜底。三卡片行为零变化（纯移动，冒烟对照并入后续 UI 批次冒烟）。
- 后续注：本文件拆分后各仓 < 500 行，为 U1（draftBackup）与 U5（previewTtlMinutes）表单项预留了充足空间。

---

## U5 preview TTL 过期保护

### 目标

execute 拒绝「距 preview 过久」的执行——STALE 树指纹防**内容漂移**，但 preview 面板挂起数小时后执行，文件没变就不报 STALE，而会话上下文可能已经历多轮，纯**时间维度**过期目前无防线。dsh-turn-rewind 的 `planTtlMs`（15min）已验证此设计。

### 任务分解

1. **Config 加 `previewTtlMinutes`**（默认 30，0 = 不启用）：[config.ts](../../../src/host/config.ts) Schema + `DEFAULTS` + [types/config.ts](../../../src/types/config.ts) 三处同步（`ResolvedConfig` 编译期钉住，漏改即报错）；设置卡片加表单项（S1 之后）。
2. **Host 校验**（routes-core.ts `execute` 队列内、git 操作前）：`cfg.previewTtlMinutes > 0 && args.previewAt && now - previewAt > TTL` → 返回 `RECALL_STALE`。
   - client **已经在传** `previewAt: Date.now()`（recall-node.ts execute 请求，透传但 Host 未消费）——本项是补消费端，零 client 契约改动。
   - 复用 STALE 码而非新错误码：client 已有 STALE → 自动重拉 preview 回确认阶段的闭环（recall-node.ts L319-338），过期提示**自动获得**「刷新预览」体验，零 client 改动。
3. 无 `previewAt`（直调 API / 老 client）跳过校验——与 P0-3 可选校验同款语义。

### 验收

- 单测：过期 → STALE；`0` 禁用；无 previewAt 跳过；TTL 边界值（恰好等于）。
- 实弹：env 或临时配置缩短 TTL → 过期执行返回 STALE、面板自动刷新回确认阶段。

### 风险与回退

- 客户端与服务端同机，时钟漂移可忽略；`previewTtlMinutes: 0` 一键退回现状。
- 依赖 S1 先拆（表单项落点）。

---

## U4 还原过程 journal 留痕（可选，低优先级）

### 目标

execute 文件回退过程留痕：H1 救援覆盖主路径，但**救援也失败**时用户只拿到一段手动命令，无从知道「到底恢复到哪一步」。dsh-rewind 的 restore journal 把还原逐步记录，可给出精确的中断点。

### 任务分解

1. store 目录追加式 `journal-<ts>.log`：安全快照 tag、reset 开始/结束、验证结果、救援动作各记一行。
2. 救援失败的手动命令提示中附 journal 路径。
3. **写失败 `recordError` 告警**（不静默——规避 dsh-rewind journal best-effort 的弱点）；journal 写入不阻断回退主流程。
4. 生命周期：随 store 删除自然清理，不额外治理。

**值得做的时机**：下次动 execute 主链路（U2）时顺带，不单独开工。

### 验收

- 实弹撤回后 journal 存在且步骤完整；模拟救援失败时提示含 journal 路径。

### 风险与回退

- 极低（只读旁路日志，append-only 小文件）。

---

## U6 版本翻页器（调研先行，暂缓立项）

### 目标

会话内 `< X/N >` 版本切换——EasyRewrite 验证过的交互，但**必须以 host lineage.json 为单一事实源**（F1 版本家族数据已存在），严禁 EasyRewrite 式 localStorage 版本树（双源必有失同步的一天，这是它最重的架构债）。

### 前置调研（不写代码，结论决定立项与否）

1. **探针核验**官方 sessions/workspaces 服务是否提供「恢复归档会话」（unarchive/restore）与按 id 打开会话的 API——翻页器切旧版本 = 反归档 + open。**若无恢复 API，翻页器只能单向（只能切到更新版本），价值大幅打折，可能不做。**
2. lineage 数据充足性：`manage lineage` 返回的边（childId ↔ parentId）能否构建「同 parent 兄弟版本有序列表」——F1 家族树聚族逻辑（snapshot-manager）已有现成算法，评估直接复用。
3. 调研结论追加为本计划新节（或独立 research 文档），API 依赖变化同步 compat-audit 台账。

### 验收（调研阶段）

- 探针条目 + 调研结论落档；明确「立项 / 搁置」判定及理由。

### 风险与回退

- 官方 API 依赖面扩大（archiveSession 之外新增恢复/打开）——探针先行是硬前置，不做字段假设。

---

## 汇总：依赖关系与推进建议

| 项 | 依赖 | 建议时机 | 量级 |
|---|---|---|---|
| U3 crash-safety 测试 | 无（先核对现有覆盖） | **随时可做，纯收益** | 小 |
| U2 仅回退对话模式 | 无 | 高优，独立发版价值明确 | 中 |
| U1 草稿保护 | 探针先行（读 API 存在性） | 探针结论 favorable 即做 | 中 |
| S1 settings-cards 拆分 | 无 | U1/U5 之前 | 小 |
| U5 preview TTL | S1 | S1 后 | 小 |
| U4 journal | 建议随 U2 顺带 | 动 execute 主链路时 | 小 |
| U6 版本翻页器 | 探针核验恢复会话 API | 调研先行，暂缓立项 | 调研 |

推进建议：**U3（纯测试零风险）与 U2（用户价值最明确）先行**；U1 探针结论出来再定形态；S1 → U5 顺序做；U6 保持调研态。各项独立，均可单独并入当期 minor（U2/U1 含新功能）或 patch（U3/S1/U5）发版。

每项实施前过一遍 AGENTS.md 官方文档合规清单（尤其 #3 Config 新字段两处同步、#8 新增官方 API 调用点探针先行）；涉及 client 改动后 `npm run build` 再 `npm test`（本地工作流约定）。
