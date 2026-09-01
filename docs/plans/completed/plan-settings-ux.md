# 设置页体验优化实施计划

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：**已实施（2026-08-26，全部任务落地，104 单测 + 11 探针全绿）**
> 来源：2026-08-26 设置页审计（设置 → 插件配置 → dsh-recall「撤回插件」卡片全量走查：插件配置表单 / 排除配置 / 快照管理三段）。
> 纪律提醒（实施前重读 AGENTS.md 合规清单）：新 Config 字段一律走 schema、不加 env（#3）；本计划标记「须核验」的 API/变量在动手前先查官方 `.d.ts` 或构建产物（#8）；新增可纯化逻辑补单测、新增官方 API 调用点补探针（P1-1 义务）；新脚本模板两平台同名导出（已知约束）。

## 现状问题清单（审计结论）

| # | 问题 | 严重度 | 对应任务 |
|---|---|---|---|
| 1 | `maxFileBytes` 要求用户输字节数（改 50MB 得手算 52428800） | 高（可用性硬伤） | S1-1 |
| 2 | 快照列表 Host 侧截断 200 条，Client 用 `items.length` 计数——显示「共 200 条」而实际可能 500+，超出部分**看不到也删不掉** | 高（功能缺陷） | S1-2 |
| 3 | 没有「恢复默认」：官方 settings 模型支持 user 层清回组装层，本插件未接入 | 中 | S1-3 |
| 4 | 无快照总开关、无归档开关、无按时间保留 | 中（高频诉求） | S2-1〜S2-3 |
| 5 | 存储健康（git 可用性 / home 降级）只在消息流一次性 toast，设置页不可见 | 中 | S2-4 |
| 6 | 「全部删除」与普通按钮并排同样式；两个排除编辑器（baseExcludes / exclude.txt）无视觉区隔 | 低（UI） | S3-1 / S3-2 |

---

## S1 可用性缺陷（第一刀，先做）

### S1-1 maxFileBytes 单位化（MB 输入）

**目标**：用户以 MB 思考和输入，Host 存储与 schema 仍为字节（不动持久化格式与 cordis 层）。

**任务分解**

1. Client [lib/client.js](../../../lib/client.js) `ConfigForm`：
   - `load`：`maxFileBytes` 字节值换算为 MB 字符串（`(bytes / 1048576)` 四舍五入 2 位小数，去尾零）。
   - `save`：MB → 整数字节（`Math.round(n * 1048576)`）后再进 patch；校验改为 `n >= 0.01`（≈10KB，实用化原「≥1024 字节」下限），错误文案「文件大小上限至少 0.01 MB」。
   - 行 UI：input 后缀「MB」小标签（新增局部样式，复用 `.dsh-recall-cfg-tag` 规格或行内 span）；`type=number` 加 `min=0.01`、`step=0.5`。
   - hint 文案改为「超过该大小的文件不进快照、不被回退触碰（单位 MB，支持小数）」。
2. Host [lib/index.js](../../../lib/index.js) `config-get`/`config-set`：**零改动**（往返仍是字节）。存量用户 settings 里的字节值显示时自然换算，兼容。

**改动落点**：仅 client.js ConfigForm（约 20 行内）。

**验收**：默认值显示「100」；输入 0.5 保存 → config-get 回读 524288（0.5 MB）；输入 0.001 → 保存被拦并提示。

**风险与回退**：显示换算的舍入（如 150KB 显示 0.15）与保存值可能有 ±1 字节往返差——影响为零（阈值本就是粗粒度）。旧值非整 MB（如 50000 字节）显示 0.05 MB，属预期。

---

### S1-2 快照列表截断与计数修复

**目标**：计数真实（用 `total`），且超 200 条的快照可见、可删。

**任务分解**

1. Host [lib/index.js](../../../lib/index.js) `manage` op `list`：
   - 接受 `args.limit`（Number，默认 200，钳制 1..2000）。
   - `listCache` 改为缓存**全量排序后数组**（`{ at, items }`），请求时按 limit 切片返回 `{ ok, items: sliced, total }`；失效点（删除 / 新快照 / deleteAll）由 `listCache.payload = null` 统一改名 `listCache.items = null`——全仓替换引用，勿漏。
2. Client [lib/client.js](../../../lib/client.js) `ManageCard`：
   - 新增 state：`total`（默认 0）与 `limit`（默认 200）；`refresh()` 读 `res.total` 存入，标题行计数改用 `total`（现状两处 `items.length` 都要换）。
   - `total > items.length` 时标题行显示「共 N 条快照（当前显示最新 X 条）」+ actions 行加「加载更多」按钮：`limit = Math.min(total, 2000)` 后 `refresh()`。
   - 树默认全折叠（现状如此），2000 条只渲染工作区级行，DOM 压力可控；payload 体积增长可接受（每条约 200 字节，2000 条 ≈ 400KB JSON，一次性）。

**改动落点**：index.js（list 分支 + listCache 字段）、client.js ManageCard。

**验收**：造 250 条快照（或临时把 limit 调小验证）→ 标题显示「共 250 条（当前显示最新 200 条）」→ 点「加载更多」→ 250 条全部可见可删。回归：普通工作区列表、删除后刷新、titles/messages 异步补齐不受影响。

**风险与回退**：不做完整分页是有意决策（树形 + 默认折叠使全量加载无压力，分页与树形组装互斥）。上限 2000 由 `maxSnapshotsPerWorkspace`（500）× 工作区数决定，实际很难触顶；真触顶时提示文案已说明。

---

### S1-3 恢复默认

**目标**：用户改乱配置后可一键回到出厂值。

**任务分解（严格按序，第 1 步结论决定走 A 或 B）**

1. **核验（先做，不写产品代码）**：读 dsh-settings 包源码（junction `node_modules/@deepseek-ai/dsh-settings` 或 `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-settings`）与官方 [reference/12-cookbook-settings-card.md](../../../reference/12-cookbook-settings-card.md)，确认 Host 侧 settings 服务除 `update(ns, patch)` 外是否有「清除 user 层字段」的能力（client 侧 `scope.unset(field)` 背后对应的 Host API 形状——方法名、参数、是否按字段粒度）。结论写回本节。
2. **方案 A（存在 unset 类 API）**：
   - Host index.js 新端点 `config-reset`：入参 `{ fields?: string[] }`（缺省 = 全部本插件字段），调核验所得的清除 API，成功后 `applyResolvedConfig(readSettings())` 触发热更。
   - 若该 API 属于「新增官方 API 调用点」：**补一条探针**（tests/probe，钉方法存在与签名形状）。
3. **方案 B（不存在，降级）**：
   - `config-reset` 端点改为经现有 `settings.update` 把全部字段写回 schema 默认值。
   - 已知缺陷（可接受并文档化）：字段在 user 层仍「出现」，`已覆盖` 标签不消失，但值即默认值，行为等价。
4. Client ConfigForm：actions 行加「恢复默认」按钮（放「放弃修改」左侧）→ `api('config-reset', {})` → 成功后 `load()` 重载表单并提示「已恢复默认值」。不弹二次确认（默认值是安全值，且「放弃修改」已是即时操作惯例）。

**改动落点**：index.js 新端点 + 端点表注册；client.js ConfigForm。

**验收**：改掉若干字段并保存 → 点「恢复默认」→ 表单回到 schema 默认值且保存后 `config-get` 确认；方案 A 下「已覆盖」标签清空。

**风险与回退**：方案 B 的标签残留为纯观感问题；reset 与并发保存竞态由「reset 后强制 load()」消除。

---

## S2 新增配置项

> 每个新 Config 字段固定四处落点（P1-3 已验证的模式）：[lib/config.js](../../../lib/config.js) schema + `createConfig` 解析；[lib/index.js](../../../lib/index.js) `config-get` values + `config-set` 白名单清洗；[lib/client.js](../../../lib/client.js) ConfigForm 的 load/save/行 UI。下文只写各字段差异点。

### S2-1 snapshotEnabled 快照总开关

**目标**：临时禁用快照（磁盘紧张 / 演示环境），不必卸载插件。

**任务分解**

1. schema：`Schema.boolean().default(true).description('启用消息快照（关闭后不再新建，已有快照仍可撤回）')`；`createConfig` 布尔解析同 `refillDraft` 模式。
2. [lib/index.js](../../../lib/index.js) `session/event` 接线：快照链改为 `.then(() => cfg.snapshotEnabled ? snaps.captureSnapshot(...) : null)`——**只跳过捕获，`maybeMaintain` 照常**（gc/清理节流本就是 no-op 代价，保证已停增的存储仍被治理）。cfg 按调用时读取，热更即时生效。
3. 语义决策（写进 hint）：关闭 = 冻结新建；已有快照的撤回（preview/execute/STALE 链路）**不受影响**——这是特性不是 bug。
4. Client 无需感知：新消息无快照自然无按钮（`snapshot-info` 轮询终态），零 client 事件改动，仅 ConfigForm 加首行 checkbox「启用快照」。

**验收**：勾掉 → 发消息 → 无新 tag（`git tag` 核对）且旧消息撤回按钮仍在、可正常回退；重新勾上 → 新消息快照恢复；设置页改完不重启即生效。

**风险与回退**：无持久化/数据结构变化，回退 = 关开关。

### S2-2 archiveOriginal 撤回后归档开关

**目标**：想保留原会话对照的用户可关掉自动归档。

**任务分解**

1. schema：`Schema.boolean().default(true).description('撤回后归档原会话（关闭后原会话保留在列表中）')`；createConfig 同上。
2. index.js `init` 响应的 `config` 对象增补 `archiveOriginal`（与 `refillDraft` 同一通道下发）。
3. client.js：`pluginConfig` 初值加 `archiveOriginal: true`；`ensureInit` 读取；`executeRecall` 中 `workspacesSvc.archiveSession(...)` 调用包 `pluginConfig.archiveOriginal` 条件。
4. 已知限制（与 refillDraft 同款，可接受）：热更后需等下一次 init（切会话）才刷新 pluginConfig。

**验收**：关闭 → 撤回 → 侧栏原会话仍在（未归档）且新会话正常打开；开启 → 原会话归档（现行为回归）。

**风险与回退**：无。fork/open 链路不动，只挡 archive 一行。

### S2-3 retentionDays 按时间保留

**目标**：条数上限对高频/低频用户语义不同，按天数保留更直观；与 `maxSnapshotsPerWorkspace`（条数维度，P1-3）并存，各自独立触发。

**任务分解**

1. schema：`Schema.number().default(0).description('按天数保留快照，超期自动删除；0 表示不启用')`——**默认 0=关**：静默删历史撤回点必须显式 opt-in（与 P1-3「默认宽松」哲学一致）。
2. [lib/maintenance.js](../../../lib/maintenance.js)：
   - 模块级纯函数 `selectExpiredVictims(snapshots, retentionDays, now)`（仿 `selectOverLimitVictims`）：按 root 分组，`time > 0 && time < now - days*86400000` 的入选；`time=0` 孤儿视为最旧优先（与 P1-3 一致）。
   - `enforceRetention()`：purge 分块 + `saveIndex` + `console.error` 留痕，best-effort——结构照抄 `enforceLimits`。
   - 接线：`runGc` 与 `runGcAll` 内 `enforceLimits()` 之后追加 `await enforceRetention()`（同一条串行队列，无锁竞态）。
3. **单测（P1-1 框架，必补）**：`tests/unit/maintenance-limits.test.js` 同文件或新文件——边界：0=不限、恰好未过期/恰好过期（用固定 now 钉）、未来时间不受影响、孤儿最先、多 root 独立。
4. ConfigForm：number 行（`min=0`、`step=1`），hint「按天数保留快照，超期自动删除；0 表示不启用」。

**验收**：retentionDays=1 → 手造 time 偏旧的快照（或临时改阈值）→ 触发 gc 周期 → 过期者被删、留痕可见；设置页树数量吻合；默认 0 全程无感知。

**风险与回退**：误删用户想保留的早期撤回点——缓解：默认关 + 留痕 + 与条数上限语义互不干扰；回退 = 改回 0。

### S2-4 存储健康状态行

**目标**：git 可用性 / home 降级从「一次性 toast」变为设置页常驻可见。

**任务分解**

1. index.js `manage` op `usage`（无 sessionId 分支）响应扩展：`{ ok, bytes, gitAvailable: state.gitExe !== '', homeStores, fallbackStores }`（后两者数 `state.stores.values()` 的 `store.home` 布尔）。
2. client ManageCard：占用行下追加健康行——「git 可用｜home 存储 N 个工作区 / 降级 M 个」；`gitAvailable=false` 用现成 error 色（`--dsw-alias-state-error-primary`，CSS 里已用，无新变量假设）；`fallbackStores>0` 用警告文案标注。
3. 已知限制（可接受，与现状 usage 汇总同源）：冷启动未预热完成时 store 集合不全，健康行只反映内存已知部分。

**验收**：正常环境显示「git 可用 / home 存储 N」；断 git（PATH 移除）重启后显示不可用且标红；降级工作区存在时 M 计数正确。

**风险与回退**：纯只读展示，无。

### S2-5 排除规则测试器（可选，最后做）

**目标**：输入路径即时反馈「会进快照 / 被排除（命中哪条规则）」，排查误排除。

**任务分解（第 1 步不成立则整体放弃）**

1. **核验（先做）**：读 [lib/snapshots.js](../../../lib/snapshots.js) 与 `lib/scripts.*.js` 确认 exclude 实际生效机制（`baseExcludes` 写入 `.git/info/exclude`？exclude.txt 走 `core.excludesFile`？）——测试器必须测**同一套生效规则**，否则结果失真。
2. 新脚本模板 `checkIgnoreScript(store, gitExe, paths)`：**两平台同名导出**；跑 `git check-ignore -v --stdin`；注意已知坑——pwsh 对 native 非零退出不抛错且 check-ignore「无命中」退出码为 1，脚本内部必须归一化输出（每行 `path→rule/-
`）并强制 exit 0。`scripts-contract` 单测同步覆盖新导出（STORE_SCRIPTS 补签名）。
3. Host 新端点 `exclude-test`：入参 `{ paths: string[] }`（≤50 条）；store 选择——ExcludeCard 携带的 `roots[0]` 可解析则用之，否则取 `state.stores` 首个；输出 `{ results: [{ path, excluded, rule }] }`。
4. client ExcludeCard：快速添加行旁加「测试」按钮 + 结果行（badge「已排除：dist/」或「会进快照」）。

**验收**：exclude.txt 写 `dist/` → 测试 `dist/a.js` 显示已排除且规则命中；测试 `src/a.js` 显示会进快照。

**风险与回退**：跨平台脚本行为差异（已知坑区）——单测钉结构 + 冒烟双平台抽查；收益/成本比一般，优先级最低，可整项不做。

---

## S3 UI 打磨（批量小改，一个 PR）

| # | 内容 | 落点 | 备注 |
|---|---|---|---|
| S3-1 | 「全部删除」按钮改 danger 样式（复用 `.dsh-recall-btn-danger`），`renderDeleteAllConfirm` 的确认按钮同步；与「刷新」「立即 gc」视觉分离（danger 色 + title 说明） | client.js ManageCard | 纯样式 |
| S3-2 | `baseExcludes` 包进默认折叠的「高级：基础排除表」（复用 `SectionToggle`）；两个编辑器文案区隔——baseExcludes hint「内置规则，所有工作区共享，建议保持默认」；exclude.txt 卡片注「我的自定义排除规则」 | client.js ConfigForm / ExcludeCard | 消除「两个一样的 gitignore 框」的认知负担 |
| S3-3 | 表单细节：① 保存成功 message 用成功色——**须核验** dsw 主题成功色变量名（对照官方 ui-theme 构建产物；不存在则降级为「✓ 」前缀，不臆造变量）；② 全部 number input 补 `min`/`step`（gcSnaps/gcHours: min 1 step 1；retentionDays: min 0）；③ checkbox 补 `htmlFor`+`id`（如 `dsh-recall-cfg-refill`） | client.js ConfigForm | ③ 的 id 需跨字段唯一 |
| S3-4 | 快照树搜索框：ManageCard 标题行下加输入框，按工作区名/会话标题/消息文本/快照 ID 不区分大小写过滤（`buildTree` 前过滤 items）；无匹配显示「无匹配快照」空态 | client.js ManageCard | 纯客户端；只过滤已加载条目（与 S1-2 limit 正交） |
| S3-5 | 最近错误：Host `status` 端点支持 `{ op: 'clear' }` 清空 `state.errors`；client 加「展开全部/收起」（现状固定 5 条）与「清空」按钮 | index.js endpoints.status / client.js ManageCard | 清空只清页面可见缓冲，不影响 console 留痕 |
| S3-6 | 空状态引导：items 已加载且为空 → 显示「在任意工作区发送一条消息后，这里会出现快照。」（现状只有「共 0 条快照。」一行） | client.js ManageCard | 纯文案 |
| S3-7 | （可选）工作区节点显示各自磁盘占用：`usage` 无 session 分支增 `byRoot` 映射（每 store 一条 `diskUsageScript`）；workspace 行 meta 追加 `sizeText` | index.js / client.js | N 次 du 串行 shell，设置页打开才跑，秒级可接受；收益中低，可弃 |

---

## 明确不做（决策记录）

1. **per-workspace 配置粒度**（每工作区独立阈值/排除）：复杂度爆炸；「全局数值 + exclude.txt 分层」已覆盖主诉求。
2. **完整分页**：树形 + 默认折叠 + limit 提升已解决可见性，分页与树形组装互斥。
3. **合并两个排除编辑器**：生命周期与受众不同（baseExcludes 随配置版本管理，exclude.txt 是用户文件），只做视觉区隔不做合并。
4. **gc 参数收进「高级」折叠**：保守维持现状——治理入口可见性优先；S3-2 只折叠 baseExcludes。
5. **「全部删除」二次弹窗升级**：行内确认已够用，不引弹窗。

## 实施顺序与发版

```
第一刀（前次审计结论）：S1-1 → S1-2 → S2-1   ← 可用性缺陷 + 高频诉求，均不动核心快照链路
第二批：S1-3（核验先行）→ S2-2 → S2-4
第三批：S3 批量（一个 PR）
第四批：S2-3（带单测）
可选尾批：S2-5（核验先行，可整体放弃）
```

- 发版类型：minor（新 Config 字段 + UI 变化）；具体版本号发版时定，计划内不预先指定（P0/P1 若届时未单独发版，可合并一次发）。
- 每批合入前后跑 `npm test`；涉及脚本模板的 S2-5 须过 `scripts-contract`。
- 发布前复核：cordis.patch.yml 的 insert 行无需重述新键（新字段均有 schema 默认值，合规清单 #4 语义）；AGENTS.md「数据流速查」节如接口形状有变（config-reset、usage 扩展字段）同步一行。

## 冒烟路径（发版前）

1. 中文路径工作区回归：发消息 → 改文件 → 撤回（清单/恢复/对话回退/标题不变）。
2. 设置页全流程：表单各字段改-存-回读（含 MB 换算）→ 恢复默认 → 排除配置编辑保存 → 快照管理（搜索、加载更多、三级删除、全部删除、立即 gc）→ 存储健康行显示正确。
3. S2-1 专项：关开关发消息无新 tag；S2-2 专项：关归档撤回后原会话仍在列表。

---

## 实施记录（2026-08-26）

全部任务已实施，`npm test`（104 tests）与 `npm run test:probe`（11 tests）全绿，四个运行文件 `node --check` 通过。落地差异与核验结论：

### S1-3 核验结论（settings 恢复默认的官方通道）

- 官方 settings 域 RPC 契约在 `dsh-host-apiproxy/lib/types/api/settings.d.ts`：`describe` / `update` / `replace` / `mutate`（另有 `openDocument`）。**`replace(ns, section)` 是文档明说的「restoration/reset 路径」——`section: {}` 重置为组合默认并清空 user 覆盖层**；`mutate` 提供路径级 `{op:'unset', path:[field]}` 单字段清除。
- 实现走**方案 A**：`config-reset` 端点优先 `settings.replace('dsh-recall', {})`；老版本服务无 replace 时降级 `settings.update` 写 DEFAULTS（方案 B，user 层仍标覆盖，缺陷如计划所述）。
- **新增官方调用点 → 补 2 条探针**（`tests/probe/api-surface.test.js` settings RPC 契约组：replace 签名、mutate set/unset op）。
- `DEFAULTS` 从 [lib/config.js](../../../lib/config.js) 导出（含全部字段默认值），作为降级路径与 schema 的单一事实源；单测钉「DEFAULTS 与 createConfig({}) 全字段一致」防漂移。

### 落地差异（相对任务分解）

| 项 | 差异说明 |
|---|---|
| S1-1 | `maxFileBytes` display 层 MB 换算（`bytesToMb`，round 2 位去尾零），save 时 `Math.round(mb * 1048576)` 回字节；`numRow` 增加 `opts { suffix, min, step }`——顺带完成 S3-3 ② 的全部 number 输入 min/step |
| S1-2 | `listCache` 字段由 `payload` 改为 `items`（缓存全量排序数组），命中缓存按 limit 切片——「加载更多」零重扫磁盘；client 用 `total` 计数 + `limit` state，上限 2000 与 Host 钳制一致 |
| S2-1 | 冻结路径在 `session/event` 快照链 `.then(() => cfg.snapshotEnabled ? capture : null)`；`maybeMaintain` 照常——已停增的存储仍被治理 |
| S2-2 | `archiveOriginal` 经 init 下发 `pluginConfig`（与 refillDraft 同通道，非热更字段，重启后随下一次 init 刷新） |
| S2-3 | `selectExpiredVictims(snapshots, days, now)` 模块级纯函数（`now` 入参供单测钉时间边界）；`enforceRetention` 结构完全对齐 `enforceLimits`；两处接线（runGc 在 enforceLimits 后、runGcAll 独立 try 块）；新单测文件 `tests/unit/maintenance-retention.test.js`（7 例） |
| S2-4 | 健康行数据来自 `usage` 端点扩展字段（`gitAvailable`/`homeStores`/`fallbackStores`）；git 不可用用现成 error 色 `--dsw-alias-state-error-primary` |
| S3-1 | 「全部删除」与确认按钮改 `dsh-recall-btn-danger` |
| S3-2 | `baseExcludes` 收进「高级：基础排除表」`SectionToggle` 折叠；hint 改为「内置规则建议保持默认」与 exclude.txt 区隔 |
| S3-3 | ① 成功色变量 `--dsw-alias-state-success-primary` 已在 `dsh-client-ui-theme/lib/client.js` 核验（L1079），三处状态 message 共用 success 类；③ 三个 checkbox 补 `id`/`htmlFor`（`dsh-recall-cfg-*`） |
| S3-4 | 搜索框纯客户端过滤已加载条目（工作区/会话标题/消息文本/ID），与 limit 正交；空态分「引导（无快照）」与「无匹配」两态 |
| S3-5 | `status` 端点支持 `{ op: 'clear' }` 清空页面错误缓冲（不影响 console 留痕）；client 展开全部/收起/清空 |
| S3-7 | **未做**（计划标记可弃）——每工作区独立磁盘占用需额外 N 条 du shell，收益中低；健康行已覆盖全局汇总 |

### 遗留

- **client.js 有效代码超过 800 行纪律**（当前约 1380 行）：Client 侧是 DSH 原样 serve 的 classic-script bundle（不能含顶层 import，P1-1 已确认），无法按模块 import 拆分；本次未重构（超范围）。若未来 UI 继续膨胀，需与「client 拆文件」专项一并处理——引入 bundle 步骤即可解决（**「零构建」约束已于 2026-08-26 取消**，见 AGENTS.md「运行时形态」），届时按发版流程正常走。
- 冒烟未跑活体 dsh web（本机未起调试会话）；发版前按本计划冒烟路径走一遍（S1-1 MB 换算、S1-2 加载更多、S2-2 关归档、S3-4 搜索为新增交互重点）。
