# P0 实施计划：安全洞堵补

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：已实施（待发版）
> 进度（2026-08-26）：P0-1、P0-3 已在 next 分支实现并通过活体 DSH web 全链路冒烟（冒烟发现 P0-1 一处 cordis inject 缺陷并修复，见 [P0-1](#p0-1-回退前检查同工作区运行中的-agent) 状态节）；P0-2 已完成组件级复现，结论：按计划思路修复不可行，关闭并记录结论（见 [P0-2](#p0-2-验证并修复-fsobserved-观察层失配) 末尾）。
> 前提：本计划中的官方 API 事实已于 2026-08-26 对照本机 dsh 安装目录 `.d.ts` 与构建产物核验，路径见各任务小节。实施时若 dsh 版本已升级，须重新核验。

## 已核验的官方 API 事实（实施依据）

| 事实 | 出处 |
|---|---|
| `Context` 上有 `agents: AgentRegistry` 与 `agent?: Agent` | `dsh-agent/lib/types/index.d.ts` L26-39 |
| `AgentStatus = 'idle' \| 'running'`（只有两值） | `dsh-agent/lib/types/runtime-types.d.ts` L39-45 |
| `Agent` 有 `status`、`id`、`session`、`ctx`、`cancel(...)` | 同上 L59-80 |
| `AgentRegistry` 继承 cordis `Service`，内部 `Map` 存 agent，typert 注册 `resolve(sessionId) => this.get(sessionId)` | `dsh-agent/lib/index.js` L404-438（构建产物） |
| `fs/observed` 事件签名：`(target: FsTarget, observation: FsObservation, actor: object \| undefined) => void` | `dsh-fs/lib/types/index.d.ts` L19-53 |
| `FsObservation = { kind: 'present'; version: FsVersion } \| { kind: 'absent' }` | `dsh-fs/lib/types/types.d.ts` L37-47 |
| `dsh-fs-observation-policy` 注册 `fs/observed` listener 并调 `gate.observe(...)`——**插件 emit 该事件会被采信** | `dsh-fs-observation-policy/lib/index.js` L80-94 |

（`dsh-agent` 等包位于 `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\` 下。）

---

## P0-1 回退前检查同工作区运行中的 agent

### 状态：已实现并通过活体 DSH web 全链路冒烟（2026-08-26）

实施要点（2026-08-26，相对原文任务分解的落地差异）：

- 第 1 步核验结论：`AgentRegistry.get(id)`、`list()` 均在 `dsh-agent/lib/types/index.d.ts` 公开面（L349/L363），`Agent.status ∈ 'idle'|'running'`（runtime-types.d.ts L45），`Agent.session.header.cwd` 存在（dsh-session types.d.ts L52 `readonly cwd?: string`）。`ctx.agents` 已由模块增强挂到 Context（index.d.ts L28）。无需走 `resolveRoot` 降级路径。
- 实现：`agentBusy(sessionId, root)` 内部函数（[lib/index.js](../../../lib/index.js)），`list()` 枚举全部 live agent：同会话 id 命中（覆盖最常见场景）或 `session.header.cwd` 与快照 root 同工作区命中（覆盖跨会话）；`agents.get` 作为无 `list()` 时的降级路径。
- 接线：`preview` handler 入口检查（快照存在时叠加跨会话同工作区比对）；`execute` 在 enqueue 任务内**第一步**检查（互斥队列内检查后紧接执行，无窗口）。
- Client 零改动：preview/execute 失败路径已统一展示 `res.message`，`AGENT_BUSY` 文案直接可见。
- **冒烟发现的缺陷与修复**：第一轮全链路冒烟中 agent 明明在运行，撤回预览却直接放行。活体插桩证实抛错 `cannot get property "agents" without inject`——cordis 4 要求服务在插件 `inject` 里声明才能经 `ctx.agents` 访问，漏声明时守卫式 `try` 只是静默 fail-open（与 #8「运行时守卫不能补救 API 形状假设」同类）。修复：`inject` 增补 `'agents'`（dsh-base 对每个 profile 无条件装配该服务，无兼容性风险）。修复后插桩确认 `reg.list()` 可见运行中 agent：`[{"id":"session-…","status":"running","cwd":"D:\\workspace\\test"}]`，拦截生效。

### 测试与验收

- 手工冒烟（AGENTS.md 冒烟路径扩展，2026-08-26 活体 dsh web 全链路已过）：
  1. agent 正在跑（长任务）→ 点撤回 → 出现「Agent 正在运行中」提示，无文件被改动。→ **通过**：面板出现「无法回退：Agent 正在运行中，请先停止后再撤回」，确认面板未打开，文件未动。
  2. agent 空闲 → 同一消息撤回 → 流程正常。→ **通过**：空闲状态下打开确认面板（预览/回退/STALE 各场景均在此状态跑通）。
  3. agent 运行中直接调 `execute` API（绕过 UI）→ 返回 `AGENT_BUSY`。→ **通过**：`Invoke-RestMethod` 直调返回 `{"ok":false,"code":"AGENT_BUSY","message":"Agent 正在运行中，请先停止后再撤回"}`。
- 回归：正常撤回冒烟路径（中文路径工作区 → 发消息 → 改文件 → 撤回）不受影响。→ **通过**：`D:\workspace\测试工作区冒烟` 工作区快照/预览（`修改 中文文件.txt`，中文文件名正常渲染）/恢复（内容回 V1）全链路正常，首条消息仅回退文件、不 fork 对话。

### 风险与回退

- 最大风险：`agents.get` 在未来版本改名。缓解：守卫式访问 + 失败视为「不忙」（fail-open，不阻断主流程，只损失保护）。这与核验纪律不冲突：当前版本已实证，未来版本由 P1-1 的探针测试兜住。

---

## P0-2 验证并修复 fs/observed 观察层失配

### 目标

确认「回退后 agent 写被还原/被删文件会被 `FS_STALE_VERSION` 拒绝」这一问题是否真实存在；存在则在 `execute` 成功后同步权威观察，不存在则记录结论关闭此项。

### 任务分解（严格按序，第 1 步不成立则终止）

1. **复现验证**（先做，不写任何产品代码）
   - 场景 A（还原）：让 agent 用 write 工具改文件 `a.txt` → 撤回到 `a.txt` 修改前的快照（文件内容被 reset 回旧版）→ 再让 agent 写 `a.txt` → 观察是否被拒（`FS_STALE_VERSION` / `replaceIfVersion` 冲突）。
   - 场景 B（删除）：快照后新建文件 `b.txt`（agent 建）→ 撤回（`b.txt` 被 reset 删除）→ 让 agent 重新创建 `b.txt` → 观察是否被拒。
   - 结论三选一：①两场景都正常（问题不存在，关闭）；②被拒（进入第 2 步）；③部分场景被拒（只修被拒部分）。
2. **若需修复：实现观察同步**
   - 落点：[lib/index.js](../../../lib/index.js) `execute` handler，在 `rollbackFor` 成功后、返回前。
   - 需要回退的变更清单：`rollbackFor` 当前返回 `count`——需扩展为同时返回逐路径动作（`restore/delete` 列表，diff 数据已有，`snaps.diffFor` 的 changes 就是这个形状，复用之）。
   - 对每个被删路径 emit：`ctx.emit('fs/observed', target, { kind: 'absent' }, actor)`；对每个被还原路径 emit `{ kind: 'present', version: <新鲜 version> }`。
   - **`FsVersion` 的生成方式**：从 `dsh-fs-local` 构建产物中取观察时生成 version 的同款逻辑（实施时读取源码移植，不许猜结构——这是本任务唯一的未知项）。
   - `FsTarget` 构造：同上，从 `dsh-fs`/`dsh-fs-local` 源码确认（`path`/`displayPath`/`sessionId` 等字段）。
   - `actor` 传 `undefined`（第三方观察者语义）或参照 policy 源码中其他调用方的传法。
   - emit 批量做，单条失败只记日志不阻断 execute 返回。
3. **client 无需改动**。

### 测试与验收

- 第 1 步的两个场景在修复后（或确认无问题后）均正常：agent 在回退后可正常写被还原文件、重建被删文件，无 stale 拒绝。
- 回归：正常撤回流程不受影响；`fs/observed` emit 不产生控制台报错。

### 风险与回退

- emit 错误形状可能污染 observation-policy 的记录（把好状态记坏）。缓解：只在 P0-2 第 1 步实证问题存在后才动手；emit 逻辑独立成小函数，异常全捕获；冒烟覆盖「回退后立即正常写文件」路径。

### 状态：已复现，结论关闭（2026-08-26）

组件级复现（临时脚本，直接用 dsh 安装目录官方包：cordis `new Context()` + `LocalFileSystem` + `fs-observation-policy.apply`，模拟「读→外部改写/删除→再写」），6/6 断言通过：

| 复现项 | 结果 |
|---|---|
| 场景 A：读后文件被外部改写（等价 git reset 回旧版）→ 以 `replaceIfVersion(旧版)` 写 → **`FS_STALE_VERSION` 拒绝** | 复现 ✓ |
| 场景 B：读后文件被外部删除（等价 git reset 删掉）→ 再写重建 → **`FS_STALE_VERSION` 拒绝** | 复现 ✓ |
| 按计划修复：`ctx.emit('fs/observed', target, { present, 新版本 }, undefined)` →  gate 仍返回旧版本 -> 拒绝依旧 | **计划修复无效** ✓ |
| 对照组：emit 带「真 agent actor + 新鲜版本」→ `replaceIfVersion(新版本)` → 写成功；被删文件 emit `{ absent }` → 变 `createIfAbsent` → 重建成功 | 仅此方式有效 ✓ |

结论与决定：

1. 问题**真实存在**（结论②被拒），但**原计划的修复方式不可行**：`dsh-fs-observation-policy` 的观察 gate 以 `actor.agent.session` 为 owner（lib/index.js L29-30），`observe()` 对无 agent 的 actor 直接忽略（L72-74）——emit 传 `undefined`（或「第三方观察者」语义）不会写进任何会话的观察态。这正属于本仓库纪律里最忌讳的「对官方 API 形状做假设」（#8 / issue #9 同类）：读 policy 源码即可证伪，若按计划动手必白费一轮。
2. 唯一有效的修复需要：逐路径 `ctx.fs.stat` 取新鲜版本（依赖插件 ctx 上存在 `fs` 服务，未核验）+ 对工作区内**每个** live agent 伪造 `{ agent }` actor 逐个 emit——本质是向 agent 私有观察态写入「模型已见过新版本」的假事实。这把 DSH 的 CAS 保护（`FS_STALE_VERSION` 本意即「未重读不得覆盖」）绕过，存在静默覆盖模型未曾见过内容的可能，属于**安全负向**改造，拒绝。
3. 实际影响评估为**轻量且自愈**：stale 拒绝只在「读过不重读直接写」的组合下发生一次，模型收到错误后重读即有新鲜观察、重试即成功；fork 新会话观察态天然为空（新 session 对象），写前必读是工具层系统提示的硬要求，行为与普通 fork 一致；「agent 正在跑时用户撤回」这一最危险窗口已被 P0-1 挡住。
4. 据此按第 1 步「结论三选一」规则归档：**已复现但修复方向被推翻，问题按设计行为保留，P0-2 关闭，不写产品代码**。若将来该 transient 错误成为真实痛点，正解应在 DSH 工具层（写前重观察/失败重读），而非插件伪造观察。

（复现脚本为临时文件已删除；证据链：policy gate owner 过滤 → `dsh-fs-observation-policy/lib/index.js`；CAS 校验 → `dsh-fs-local/lib/index.js` writeText/editText；写工具不重读直接取 intent → `dsh-tool-fs/lib/index.js` write 工具 execute。）

---

## P0-3 preview→execute 失效校验

### 状态：已实现并通过活体 DSH web 全链路冒烟（2026-08-26）

实施要点（2026-08-26，差异说明）：

- Client `executeRecall` 发送 `previewTotal` 用 **`recall.total`**（完整计数）而非 `changes.length`（500 条截断值）——Host 端比对的是 `diffFor` 的完整 `total`，用截断值会在大变更清单上必然误报 STALE（原任务分解的 `changes.length` 有误，已纠正）。`previewAt` 以 `Date.now()` 随行下发（本轮 Host 只做 total 比对，未做时间窗）。
- Host `execute` 在 enqueue 内、**安全快照之前**执行 STALE 校验：仅当 `args.previewTotal` 为 number（新版 client）时重跑 `diffFor(id)` 比对 `total`；不一致返回 `STALE`（此时连安全快照都不打）。
- Client STALE 分支：`stage:'loading'` → 重新 `preview` → 回到 `confirm`（展示新清单与 total），而非停在 error。

### 任务分解

1. **Client 端携带预览摘要**（[lib/client.js](../../../lib/client.js)）
   - `executeRecall`（L471 附近）调 `api('execute', ...)` 时附加 `previewTotal: changes.length`（changes 来自 `preview` 响应、已存于组件 state，L459 `stage: 'confirm'` 一并存的字段）。
   - 同时附带 `previewAt: Date.now()`（发起 preview 的时间戳，host 端做过期判断用，可选项）。
2. **Host 端校验**（[lib/index.js](../../../lib/index.js) `execute` handler）
   - 位置：enqueue 任务内，**pre-rollback 安全快照之前**（顺序：校验 → 安全快照 → rollback。校验失败连安全快照也不该打，省一次全量 add）。
   - 逻辑：
     - client 传了 `previewTotal`（number）→ 重新 `snaps.diffFor(id)` 取 `total`，与 `previewTotal` 不等 → 返回 `{ ok: false, code: 'STALE', message: '预览后项目文件发生了变化，请重新预览确认' }`。
     - client 没传（老版本 client / 直接调 API）→ 跳过校验（向后兼容，不强制）。
   - 成本：多跑一次 `git status` 类 diff（秒级，队列内互斥，可接受）。
3. **Client 端 STALE 处理**
   - `execute` 失败路径（L478）统一走 `stage: 'error'` 展示 message——对 `STALE` 特殊处理：提示之外自动重新拉一次 `preview`（回到 confirm 阶段让用户看新清单），而不是停在 error。小改动：error 分支里 `if (res.code === 'STALE') return loadPreview()`。
4. **不做的事**（写明防止范围蔓延）：不校验逐文件内容一致、不做 plan TTL、不做确认码。total 比对已覆盖「文件集发生变化」的主要情形；同数不同文件的边缘情形留给「pre-rollback 安全快照」兜底（真回退错了可从 safety tag 恢复）。

### 测试与验收

- 冒烟：预览 → 手改一个文件 → 确认 → 面板回到新预览（total 已变），不执行回退。→ **通过**：预览后新增 `echo3.txt`（变更集 1→2：修改 1 · 删除 1），确认回退被 STALE 拦截，面板自动回到新预览，磁盘文件未动（echo2 仍 V-B、echo3 仍存在）。
- 冒烟：预览 → 不动 → 确认 → 正常回退。→ **通过**：确认后 echo2.txt 恢复快照值 V-A、echo3.txt 删除；对话回退（消息 6 从视图消失）、标题不变；pre-rollback 安全快照与 fork 归档均落盘。
- 兼容：不带 `previewTotal` 直调 API（旧 client 语义）→ 照常执行。→ **通过**：`Invoke-RestMethod` 直调返回 `{"ok":true,"count":3,"cutSeq":null}`，按消息 1 快照恢复（echo2.txt 被删，首条消息不 fork 对话）。

### 风险与回退

- `diffFor` 在队列内跑两次（preview 一次、execute 一次）理论上有性能代价，但 execute 本身就是重操作（安全快照 + reset），增量可忽略。
- 极端抖动场景（用户确认瞬间文件变化）依旧存在窗口——接受，安全快照兜底，不过度设计。

---

## 发版与顺序

```
P0-1 → P0-3 → P0-2（P0-2 第 1 步验证可与前两项并行做，不写产品代码）
```

- 实现进度（2026-08-26，next 分支）：P0-1 ✅（代码+冒烟通过，含 inject 修复）→ P0-3 ✅（代码+冒烟通过）→ P0-2 ⚠️ 复现完成、关闭（见 P0-2 状态节，**修复方向被推翻，不写修复代码**）。
- 合并一次发版（minor：新行为、新错误码 `AGENT_BUSY`/`STALE`）。P0-2 不改代码，不占用发版内容；具体版本号发版时定。
- 发版前必经：AGENTS.md 冒烟路径 + 本计划三处「测试与验收」（已过：2026-08-26 活体 dsh web 全链路，见各节 `→通过` 标注）。
- 发版流程按 AGENTS.md：bump version → commit/push（代理）→ npm publish → GitHub Release → 本机 `pnpm update dsh-recall-plugin` 验证。
- 每项实施前过一遍 AGENTS.md 合规清单；重点：#8（新增 API 调用点已核验）、#3（无新硬编码——错误文案不算可调参数，无需进 Config）。
