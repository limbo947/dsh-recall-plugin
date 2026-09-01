# 竞品调研：dsh-rewind 与 dsh-turn-rewind

> 调研日期：2026-08-26 ｜ 调研对象：[SiriLee/dsh-rewind](https://github.com/SiriLee/dsh-rewind)（v0.4.1）、[Anionex/dsh-turn-rewind](https://github.com/Anionex/dsh-turn-rewind)（v0.1.1）
> 调研方式：源码 + 文档 + Issues + CI/发布配置全量核对，并对照本项目实现。
> 本文是 2026-08-26 改进计划的调研底稿（原载 improvement-plan.md，拆出独立归档）：结论已固化为各子计划的任务依据，本文为静态存档，不再随实施更新。计划索引见 [improvement-plan.md](./improvement-plan.md)。

## 一、三个项目的路线对比

同为 DSH「消息撤回 / 回退」插件，三者技术路线差异显著：

| 维度 | 本项目（dsh-recall-plugin） | dsh-rewind（SiriLee） | dsh-turn-rewind（Anionex） |
|---|---|---|---|
| 对话回退 | `sessions.fork(atSeq)` + 原会话归档 | surfaceOp marker 原窗口就地裁剪 | `sessions.fork(上轮 turn/end)`，同本项目 |
| 文件快照 | 影子 git 仓库 tag（每消息整树） | 写类工具 before-backup JSON | Change Ledger（v1 自建 blob / v2 私有 ref 入用户仓库） |
| 覆盖范围 | 全工作区（含外部改动） | 仅工具碰过的文件 | tracked + 非忽略 untracked（要求 git worktree） |
| 运行中 agent 处理 | **无**（调研时点；P0-1 后已有拦截） | cancel + waitForIdle（15s 超时） | WORKSPACE_IN_USE 拒绝（preview/execute 双处检查） |
| 回退前救援 | pre-rollback 时间戳 tag 安全快照 | — | 7 重门禁 + rescue point + operation journal |
| preview→execute 校验 | **无**（调研时点；P0-3 后已有 STALE） | — | plan TTL 15min + apply 时全树重捕获 + 写前单路径复查 |
| 工程底座 | 纯 JS 零构建，手工冒烟 | TS + vitest 11 套件 + 兼容探针 + verify-host + CI | TS + node:test 102 用例（真实临时 git 仓库）+ CI |
| 存储治理 | git gc + 会话删除联动 | 每会话最新 100 锚点组 | 每会话保留窗口，**无全局上限（issue #11 膨胀事故）** |

**路线结论（已验证）**：fork 路线、整树快照、影子仓库隔离、零构建、按文件 fail-open 跳过，这五项选型经竞品实证均为正确选择，理由见下文借鉴/规避清单与「明确不做的决策」。
> 修订（2026-08-26）：「零构建」一项已撤回——约束取消后引入构建/拆 client 文件不再被禁止（见 AGENTS.md「运行时形态」）。其余四项保持不动摇。

## 二、借鉴清单汇总（优点 → 去处）

| 竞品优点 | 去处 |
|---|---|
| running agent 检查（cancel 等待 / 拒绝两种实现） | P0-1 |
| fs/observed 还原后同步 | P0-2 |
| plan TTL + apply 时重捕获比对 + 写前单路径复查 | P0-3（轻量版） |
| 兼容性探针：真实包消费路径断言官方字段 | P1-1 |
| package-layout 可移植性测试 | P1-1 |
| skip 记录落盘、重启后可解释 | P1-2 |
| 容量上限 fail-loud / fail-visible | P1-3 |
| 键盘导航、机器通道与人文案分离、per-session in-flight 防双击 | P2-1 及后续 |
| FORMAT/SECURITY 公开文档 | P2-2 |
| OIDC 发布、npm pack 校验、peer 范围提醒 | P2-3〜P2-5 |

## 三、规避清单汇总（缺点 → 教训）

| 竞品踩坑 | 本项目对策 |
|---|---|
| dsh-rewind v0.2.4：marker turn 撞号，会话历史从 UI 整段消失，需离线修复工具 | **永远不向 append-only 日志追加合成事件**；坚持官方 `sessions.fork` |
| dsh-rewind v0.3.3：裸 marker 破坏 token-meter 重放，受影响会话 `/compact` 永久失效且无法在线修复 | 同上；日志形状必须一步到位是它的教训，我们干脆不写日志 |
| dsh-rewind R-OPENSTEP：崩溃残留未闭合 step 破坏 /compact，插件侧守卫误判被 revert | 不依赖 harness 内部不变量；fork 路线天然免疫 |
| dsh-rewind 只备份工具碰过的文件，外部改动回退不了 | 保持整树快照 |
| turn-rewind issue #11：存储无限膨胀（实测 64MB） | P1-3 总量上限 |
| turn-rewind issue #9：单文件超限致整轮无快照（fail-loud 过头） | 保持按文件 fail-open 跳过 + P1-2 可见性 |
| turn-rewind 复杂度失控（双格式、迁移 journal、70KB 单文件、构建产物入库） | 保持零构建与 800 行/文件纪律；P0-3 明确不做全套 plan 门禁 |
| dsh-rewind npm 包名被抢注被迫改名 | 名称已定，备忘生态风险 |

## 四、明确不做的决策（保持现状）

1. **不改用 surfaceOp marker 就地裁剪**——依赖反推的 harness 内部不变量，两个竞品事故均为前车之鉴；fork 虽换窗口但只走官方 API，长期维护成本可控。
2. **不做写前备份（before-backup）**——覆盖不了外部改动，与「全工作区回退」的产品定位冲突；影子仓库整树快照已覆盖且更简单。
3. **不把对象写进用户仓库（turn-rewind v2 私有 ref 路线）**——影子仓库实现了项目零污染，反向污染用户仓库不可接受。
4. **不引入构建链（TS/esbuild）**——零构建是低维护优势；P1-1 的 vitest 不改变运行时形态。（2026-08-26 修订：已撤回——零构建约束取消后，引入构建链/拆分 client 文件不再被禁止，代价与收益按需评估。）
5. **不做 turn-rewind 全套 7 重门禁**——pre-rollback 安全快照已是救援点等价物，P0-3 的轻量校验收口即可，避免企业级包袱。
6. **不跟踪子代理编辑的特殊处理**——影子仓库整树快照天然覆盖子代理改动，无需 per-tool 钩子。

---

## 附：2026-08-28 本地源码复核（含 DSH-EasyRewrite）

> 本节为追加存档：2026-08-28 将三个竞品完整源码下载至本地逐文件复核（初版调研基于 GitHub 采样），并首次纳入第三个项目 [Renzic-Stone/DSH-EasyRewrite](https://github.com/Renzic-Stone/DSH-EasyRewrite)。结论输入到 [plan-competitor-improvements.md](./completed/plan-competitor-improvements.md)。

### 复核方式

三项目全量源码本地通读（dsh-rewind src/ 13 文件 + tests/ 18 文件；dsh-turn-rewind src/ 14 文件 + lib/ 产物；DSH-EasyRewrite src/client.src.js 3263 行 + lib/index.js 412 行），按代码质量、模块设计、性能、可维护性、文档完整性、错误处理、扩展性、耦合度、冗余代码九维度评估。

### 与初版结论的差异（修订）

1. **初版结论全部成立**：fork 路线、整树快照、影子仓库隔离、按文件 fail-open 跳过四项选型经完整源码复核再次确认；「明确不做」六条无一需要翻案。
2. **dsh-rewind 评价上调**：初版聚焦其 marker 事故；完整源码显示其工程底座是三者最高——纯规划层零 I/O、I1-I8 不变量探针 + compat 审计台账、verify-host 15 项端到端断言、错误按可恢复性分级（journal 损坏 fail-loud / 条目损坏静默跳过）。marker 耦合深度比初版认知更甚（surfaceOp replace、幽灵 step 帧、turn 编号、空消息 derive-null 四条命系于 harness 未承诺内部行为），但其用探针矩阵对冲风险的做法是教科书级，「耦合深而管理优」两者并存。
3. **dsh-turn-rewind 过度工程量化**：store.ts 1696 行实现了分布式存储级语义（回收日志 + 32 层 owner 链 + 机器 GUID 子进程身份 + 双副本 store-id），远超单机插件威胁模型（O_EXCL 锁 + stale 检测约 400 行即可覆盖）；~350 行一次性迁移代码永久常驻核心路径；读路径同一文件被 SHA-256 3-4 遍，与自身 5s 检查点预算冲突（其 v2 git-native 模式绕开 legacy CAS，等于自我承认）。其 rescue point、plan fencing（expected tree 复核）、原子写（tmp+fsync+rename+目录 fsync）三件套仍是最值得借鉴的部分。
4. **DSH-EasyRewrite 首评：中偏差**。唯一差异化创意是「版本家族」（派生自官方 parentId lineage 的 fork 链聚族切换）。工程面为反面教材集中体：3263 行巨石单文件（纯函数/React/DOM/i18n 单闭包）、约 75 处静默 catch（含真实故障点）、aria-label 文案子串匹配发送按钮、fork 报错文案正则分流、localStorage 存草稿与图片 dataURL、同类逻辑复制 3-4 份、家族推导渲染期 O(N·64) 无缓存——「官方改文案/DOM 即静默失效零报错」与本项目合规清单 #8 血泪教训（issue #9）同款。

### 对计划项的输入关系

| 复核发现 | 输入到 |
|---|---|
| turn-rewind rescue point + journal 警告聚合 | H1（回退失败救援闭环；本项目 safety tag 已打不用，只做增量） |
| turn-rewind 原子写 + parseX 全量校验 | H2（index.json tmp+rename + 浅校验 + .corrupt 备份；读路径重哈希/逐字段重算判定为过度，不移植） |
| dsh-rewind RewindError 类型化错误码 | H3（lib/errors.js 常量表收拢；code 线上契约不改值只收拢） |
| EasyRewrite 巨石失控三件套（3263 行/75 吞错/复制 4 份） | R1/R2 的紧迫性佐证：本项目 client.js ~1480 行、index.js ~1130 行已超 800 行红线，趁未失控先拆 |
| dsh-rewind 构建冒烟断言 + loader 包裹格式 | R1 路线 B（esbuild）的参照实现 |
| EasyRewrite familyOfSession（创意）+ 其无缓存性能覆辙（教训） | F1（版本家族 spike：官方 parentId 能力核验前置，必须 memo 缓存） |
| dsh-rewind verify-host.mjs | E1（端到端装配验证脚本） |
| dsh-rewind docs/compat/audit.md I1-I8 台账 | D1（compat-audit.md 子系统×不变量矩阵） |
| turn-rewind 分布式锁/EasyRewrite 文案匹配/marker 机制 | 「明确不做」清单（plan-competitor-improvements.md 第 2/3/4 条） |
