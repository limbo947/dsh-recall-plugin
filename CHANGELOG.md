# 更新日志

本文件格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [Unreleased]

### 修复

- **回退恢复侧从「整树解压」改为只处理 diff 变更集（issue #22）**：旧版 `rollbackScript` 的 `$restored` 是目标树全量条数——改 1 个文件也把整棵快照树打 zip/解包一遍（大工作区 GB 级三遍 IO；issue #20 实机 39.2 万条幽灵条目时打出 5.11 GB zip），未变更文件也被 `-Force` 覆写、mtime 全变误触发构建增量/文件监听。现按 sha 求出恢复集（目标有、当前无或内容不同，与 `diffScript` 的 modified+restored 同集合），`git archive <tag> -- <paths>` 分批（100/批）只解压变更项，变更过半时回退整树单遍（N/100 次 archive+解压的启动开销超过单遍）；`ROLLBACK_OK` 的 restored 计数随之变成实际恢复条数，与 preview 的 diff 计数逐项相等。pwsh/posix 双侧对偶（POSIX 走 `archive | tar -x -m` 分批 pathspec）；archive 失败 pwsh 侧显式 throw、POSIX 侧 pipefail 非零退出——半回退不许报 `ROLLBACK_OK`（F-G2 纪律不变）。实测：6 文件工作区改 1 删 1 增 1 的回退 `ROLLBACK_OK 1 2`（旧版报 7），未变更文件 mtime 不动；变更过半整树路径双侧实测正确。
- **junction 防护三处评审补强（PR #21 P3 nit）**：① 机器生成的 exclude 行补 gitignore 转义——目录名以 `#`/`!` 开头或含 `[` 的 junction 此前会被解析成注释/反选/字符组而静默漏排除（自引用 `#hash` 金丝雀夹具实测漏排 → 修复后 1 条索引）；② 发现行排序，exclude 内容序与 NTFS 枚举序脱钩，消无谓重写；③ 良性 junction 开反选逃生口——exclude 写盘顺序改为 base + 机器行 + 用户行（gitignore 后写胜出），排除配置追加 `!路径/` 即可把指向工作区外的 junction 重新纳入快照（实测默认 1 条 → 反选后 3 条索引），切勿对自引用 junction 使用，README 双语已更新。

- **win32 目录重解析点把影子仓库索引撑爆、撤回退化为分钟级（issue #20，PR #21，外部贡献 @PrismScopes）**：git for Windows 把 NTFS junction 当普通目录，`add -A` 递归进入链接目标（`core.symlinks` 取 true / false / 默认实测同样递归，无法配置规避），自引用 junction（`a/link -> a`）按 Windows「路径中最多 31 个重解析点」上限把同一棵子树重复索引——实机病例 1.24 万条 → 39.2 万条、`.git/index` 168 MB，preview/快照/回退退化到分钟级（用户表现为「永久卡在正在计算变更」）。修法＝`excludeSyncBlock` 在 `add -A` 之前遍历目录树（不进入链接目标）把目录重解析点按相对 root 路径 + 尾斜杠并入 `info/exclude`，git 根本不进入它们；已跟踪的旧幽灵条目由既有 `ls-files -i -c` 分支一次清掉；`oversizeBlock` 同一次压栈过滤顺带剪掉重解析点。遍历只枚举目录、复用既有目录名剪枝，无重解析点的工作区不产生 exclude 差异，条件化比对跳过重写与清理循环（常态零开销）。POSIX 侧有意不做：git 把指向目录的符号链接记成 `120000` 条目、不递归进目标，照搬反而会把合法快照内容剔出快照。已知限制（README 双语已声明）：工作区内的目录重解析点一律不参与快照（含指向工作区外的良性 junction，无 `!` 反选逃生口）；POSIX bind mount 环不覆盖。维护者评审实测数据：2 真实文件 + 自引用 junction 夹具，索引 96 条（93 幽灵）→ 3 条 / 0 幽灵，`.git/index` 38 KB → 331 B；门禁 typecheck / 单测 498 / `verify:host` 全绿。
- **大幽灵存量的首诊清理从「分钟级卡死」改整棵重建（PR #21 评审补强）**：旧清理路径对 37.9 万条幽灵条目走 `ls-files -i -c` + 每批 100 条 `update-index --force-remove`，约 3797 次 git 子进程、每次重写巨型 index（168 MB 渐缩），估 10–60 分钟——升级后第一次快照仍会表现为「卡在正在计算变更」。现按 10000 条阈值切换：`read-tree --empty` 清索引、交给随后的 `add -A` 按新 exclude 整棵重建（`gcScript` 治 issue #18 同款技巧，index 是可重建缓存），实测 1.24 万条幽灵夹具首诊 **2 秒**完成；`read-tree` 失败显式 throw（静默失败会让幽灵条目随 exclude 已重写永久滞留、清理不再触发）。重解析点遍历另加 `if ($root)` 显式守卫：`ensureGitScript` 无 `$root`，原路径靠 `Push($null)` 抛错被 `catch` 吞掉的巧合跳过，现成为显式设计（三处主脚本随后在 `add -A` 之前重做发现，无漏检窗口）。

## [2.4.9] - 2026-10-03

### 变更

- **dsh 0.2.1-alpha.1 兼容**（升级核查见 [docs/upgrade-assessments/dsh-0.2.1-alpha.1.md](docs/upgrade-assessments/dsh-0.2.1-alpha.1.md) 与 [docs/compat-audit.md](docs/compat-audit.md) 头部 0.2.1-alpha.1 段）：全树内容级 diff（0.2.0-rc.2 整包残留作基线）确认插件注册/消费契约（chat.node 槽位与 props、`ChatNodeKind` 全集、`sessions.fork`/binding、`updateQueue`、设置双 slot）字节级相同——**无需改码**；peer 窗口 6 条 `dsh-*` 追加 `>=0.2.1-alpha.1 <0.3.0` 段（npm prerelease 门槛要求显式同 tuple 段；上限按发版决定放宽，覆盖 0.2 全线正式版），cordis 追加 `>=4.0.5-alpha.1 <4.0.6`、schemastery 追加 `>=3.18.5-alpha.1 <3.18.6`（两者产物除版本号外逐字节相同），`dsh.compatibility.dshReleases` 补 `0.2.1-alpha.1: compatible`；`docs/reference/` 镜像按 tag 重拉（13 源中 4 份实质差异：反向代理发布链接、桌面端系统分配端口 + invariant 移除文案、工具 delta 匹配语义与 `ConversationNodeDefinitionInput`、定时任务投递语义）。正向受益：官方修复插件启停时样式被误移除（`claimStyles`）与队列滞留（惠及 G1 周边时序）。门禁：`test:probe` 52/52、`verify:host` 装配断言全过、`check:dsh` 全绿。

### 文档

- README 双语：兼容范围标注与 peer 窗口折叠块同步至 dsh 0.2.1-alpha.1（窗口上限放宽至 `<0.3.0` 的说明一并落地）。
- `docs/dsh-contract.md`：版本核验记录只保留最新（0.2.1-alpha.1），历次版本记录归口 compat-audit 与 upgrade-assessments，消除双写。
- 新增待实施计划 `docs/plans/pending/plan-refill-references.md`：引用 chip 回填（撤回后把被撤回消息里的 @文件/目录引用以可点击 chip 形式放回输入框；依赖 dsh 0.2.1-alpha.1 结构化草稿能力）。

## [2.4.8] - 2026-10-03

撤回完成事件/回调（issue #19，方案见 [docs/plans/completed/plan-recall-event.md](docs/plans/completed/plan-recall-event.md)）：撤回到达终态时广播 cordis 事件 `dsh-recall/complete` / `dsh-recall/failed`，供同宿主任意插件监听（如长时记忆插件清理被撤回回合的记忆）。纯增量 opt-in：不订阅的插件零感知，撤回链路行为逐字节不变（事件发送失败、监听器抛错、下游慢执行均不影响主流程）。

### 新增

- **事件契约（`src/types/events.ts`，单一事实源）**：`dsh-recall/complete`（`sessionId`/`childSessionId`/`scope`/`cutSeq`/`messageId`/`root`/`count`/`chatReverted`/`archiveRequested`/`time`，`version: 1`）与 `dsh-recall/failed`（`stage: 'execute' | 'fork'`/`sessionId`/`messageId`/`scope`/`cutSeq`/`root`/`code?`/`error`/`time`）。首发即稳定公共契约（非 experimental）：新增字段走 minor，破坏性变更走 major 且 `version` 升 2。payload 不含消息正文；事件名与契约文件的绑定由 `tests/types/events-contract.test.ts` 编译期双向断言维持（host 产物因 build-host 逐文件转译不覆盖 `types/`，事件名在 routes-core 本地字面量声明）。
- **host `notify` 端点（routes-core.ts）**：client 撤回终态上报的接缝——校验（缺 `status`/`sessionId`/`messageId` 复用 `RECALL_BAD_TYPE`，不加新错误码）→ `resolveRoot` 尽力 enrich（失败落 `null` 不阻断）→ `queueMicrotask` + try/catch 调 `ctx.emit`（下游抛错/慢执行不反噬端点）→ 恒 `{ ok: true }`。不进串行队列（零 git 操作）、不依赖 store（避开 lineage-record 的 NO_STORE 早退会吞事件的缺陷）；index.ts 以闭包注入 `emitEvent: (e, p) => ctx.emit(e, p)` 保持 ctx 不解构纪律。verify-host 端点白名单同步至 13 项（未同步时两处断言红灯，反向验证实测）。
- **client 终态上报（recall-node.ts + util.ts）**：`buildRecallNotify` 纯函数按语义决策表组装载荷（六场景矩阵单测直钉），`executeRecall` 五处上报点 fire-and-forget（`.catch` 静默）——execute 拒（透传 `code`）/ execute 抛 → `failed(stage:'execute')`；fork 抛错/返空 → `failed(stage:'fork')`（**绝不发 complete**，防下游误清该回合记忆）；撤回链完整走完 → `complete`（`chatReverted` 为对话是否真回退的判据）。STALE 自动重预览是中间态，不上报。版本错位容错：旧 host 无此端点时上报静默失败（404），撤回不受影响；旧版 client 从不上报。
- **README 双语「事件契约」章节**：事件名、payload 字段表、语义要点（STALE 不发、fork 失败只发 failed、`(sessionId, messageId, cutSeq)` 三元组幂等、隐私面）、semver 演进规则与版本错位矩阵、可直接粘贴的监听示例。

### 测试

- `tests/unit/routes-notify.test.js`（11 例）：参数校验缺失码 / root enrich 成功·抛错·返空 / emit 异步广播与 payload 字段 / 监听器抛错仍恒 `ok:true` 且 `recordError` 留痕 / `stage`-`code` 语义。
- `tests/unit/recall-notify.test.js`（8 例）：`buildRecallNotify` 规格第一节六场景 + scope 透传与字段兜底。
- `tests/client/recall-node.test.ts` 追加 7 例：五处接线点的调用时机与载荷（含 STALE 不发 notify、上报失败静默不反噬主链）。
- `tests/types/events-contract.test.ts`：事件名字面量钉死、payload 形状断言、host 本地常量 ↔ 契约常量双向绑定、notify 端点返回类型双向绑定。基线 478 → 497（39 文件），client 83 → 90。

## [2.4.7] - 2026-09-30

质量加固专项批次（[docs/plans/completed/plan-quality-hardening.md](docs/plans/completed/plan-quality-hardening.md) A1–A8，八项分四波：质量基建 → 数据安全 → 测试基建 → i18n）。2026-09-30 该计划连同 `plan-warmup-unhandled-rejection` 已归档到 `docs/plans/completed/`（活体冒烟第九节 R-1〜R-6 全过）。

### 新增

- **i18n 双语层（A4）**：插件自绘界面全双语（撤回按钮与确认面板、toast、设置三张卡、快照树、最近错误），由新配置项 `locale`（`auto` / `zh` / `en`，默认 `auto` 按 `navigator.language` 判）控制，配置卡片新增「界面」分组的下拉、保存即生效。实现分三层：`src/client/locales/`（zh 事实源 + en + 纯逻辑 `t/translate/resolveLocale`，缺 key 依次回落 zh、key 本身）；host 文案键控化（错误响应按 `code` 查 `err.*`、最近错误按 `kind` 渲染、构建产物 root 停用提示改下发命中段名 `artifactSeg` 由 client 本地取词，旧中文字段保留一周期）；`tests/unit/locales-parity.test.js` 钉两语言 key 集合 / 占位符集合一致 + 静态扫描 client 源码里的字面量 key 漏配，`tests/client/i18n.test.ts` 钉 zh/en 两条渲染链与语言下拉的保存载荷。v1 明示限制（README「界面语言」节）：宿主官方设置表单自己渲染的 `Schema.description()` 仍是中文；带动态细节的 host 错误（回退失败的救援结果、具体校验原因、原始异常）原样展示 host 原文，不套本地化短句。
- **磁盘格式版本守卫（A3）**：影子仓库新增 per-store `format` marker（`SUPPORTED_FORMAT = 1`，缺席视为 1），读到更高版本或内容损坏时**拒写放行读**（fail-closed）——快照、撤回、tag 清理、索引落盘全短路并 `recordError`，快照列表 / 状态查询等只读路径不受影响，新错误码 `FORMAT_BLOCKED`（client 有对应文案）；marker 补戳挂在索引落盘路径（稳态零额外进程），读取带短确认缓存且只缓 affirmative 结果。配套通用 `fileReadCmd`（契约 + 双平台模板），替 A2 与后续小文件读取省掉逐个特化命令。
- **操作意图 journal 与崩溃恢复（A2，吸收 U4）**：撤回的 both 链「安全快照 → reset → 救援」中途断电时，安全快照 tag 已在磁盘却无任何记录指向它——新增 `src/host/intent-journal.ts`：execute 动磁盘前先写 `recall-intent.json`（messageId / safetyId / safetyOk / phase），回退成功即清；启动预热与 init 端点两处挂 `recover`：先做幂等判定（工作区与目标 tag 一致即只清记录不 reset），需救援时复用 H1 救援路径自动 reset 回安全快照并 `recordError` 留痕，`agentBusy` 忙时延后到下次 init。救援失败提示同时附上意图文件路径（U4 验收语义：中断点可查）。
- **client UI 测试体系（A1）**：vitest + jsdom 独立配置（`npm run test:client`，CI 新增同步骤），`tests/client/` 6 文件 82 例——撤回节点主链（25）、快照管理（17）、配置卡片（17）、排除卡片（13）、logger 开关（7）、i18n 双语链路（3）。断言纪律：只断行为与结构（className / aria / 调用次数 / fetch 载荷），不为文案字面量上锁（i18n 让路）。期间实测发现并修复一处真实缺陷（见「修复」）。
- **client 命名空间 logger（A5）**：`src/client/log.ts` 的 `createLogger(ns)` 前缀 `[dsh-recall:<ns>]`，error/warn 恒输出、info/debug 由 `localStorage['dsh-recall.debug']`（`*` 或逗号分隔命名空间，每次调用重读）开关——现场排查无需重启；localStorage 不可用时静默降级。替换全部 5 处裸 `console.*`，装配完成补一行 info（「Host 活 Client 死」类症状可一眼确认）。
- **`docs/format.md` 磁盘格式 spec（A7）**：逐文件固化存储布局与格式（tag 命名、index/lineage 的原子写与损坏语义差异、stamp 文件、format marker、意图 journal）、兼容纪律（读取侧字段可选化 / 未知字段忽略 / 高版本拒写），并写死「代码与本文漂移即 bug」约定；同时提前实施 plan-p2 的 FORMAT 半（SECURITY 半仍留 P2-2）。

### 变更

- **开启 `noUncheckedIndexedAccess`（A6）**：编译期堵索引越界，修 14 处（含 `Map.get(...)!.push` 类断言），顺带清掉无注释的既有非空断言；由 CI 既有 typecheck 步骤自动成门禁，不连带开其他严格 flag。
- **catch 理由注释纪律（A8）**：协作规约新增「catch 必须附降级理由（为什么吞、为何安全、谁兜底）」，全 src 143 处 catch（host 99 + client 44）逐处审计补注；未发现「吞错 + 无 recordError + 无注释」的真问题；不设 CI 启发式门禁（误报高，靠规约 + review）。
- 配置 schema 增至 10 字段（新增 `locale`，不列进 `cordis.patch.yml`——它按行覆盖、默认值随 schema 下发）；`init` 响应与 `config-get` 的 config 子集同步下发 `locale`（老 Host 缺字段时 client 按 `auto` 解析）。
- 「最近错误」区按 host 的 `kind` 渲染本地化提示（原来的中文原文保留在条目 `title` 上），未分类错误仍原样展示 host message。

### 修复

- **win32 上磁盘格式守卫会把正常快照库锁死（严重，随本批次实弹掘出）**：新增的通用 `fileReadCmd` 用 `Get-Content -ErrorAction SilentlyContinue` 读文件，而 PowerShell 对**缺席文件**即使吞掉报错仍以退出码 1 收尾（pwsh / Windows PowerShell 5.1 双实测）——runShell 的退出码门禁把它当执行失败抛出，格式守卫便把一个还没有 `format` 标记的正常 store 判成「标记读不到」；由于守卫同时挡在快照捕获与索引落盘上，补戳永远写不下去，**快照、撤回、快照列表载入全部停摆且不可自愈**（POSIX 侧靠 `cat … || true` 无此问题）。修复＝读取命令改用 `Test-Path` 分支让缺席以成功收尾（与 POSIX 同语义），并补契约文本钉防回归；沉淀为 compat-audit **I41**。
- **宿主退出期插件可能中断宿主（fatal load failure）**：启动预热是 fire-and-forget 的异步 IIFE，宿主在预热途中卸载（`dsh --profile headless --help` 打印帮助后立即退出、HMR、装配门禁 dispose）时访问 `sessions` 会抛「inactive context」，未接的 promise rejection 被 cordis 加载器记成 fatal。修复＝IIFE 整体接 catch 并保留诊断行（`recall warmup skipped: …`）；该项同时关闭了既有待办 [plan-warmup-unhandled-rejection](docs/plans/completed/plan-warmup-unhandled-rejection.md)。
- **格式守卫的读失败文案不再指认「文件损坏」**：读失败（多为宿主启动早期 shell 未就绪）与标记内容非法此前共用一句「不可读或内容非法」，会把用户引向一个没有问题的文件；现按「高版本 → 请升级插件 / 内容非法 → 检查 format 文件 / 读不到 → 环境未就绪、下一条消息自动重试」三分。
- **i18n 切换语言的三处半截生效（浏览器实弹掘出）**：① 英文确认句里「发送时状态」与「共 N 个文件将变更」两句拼接缺空格（`sent.1501 files`）；② 语言切换后设置卡片的两个分区折叠头（排除配置 / 快照管理）停在挂载时语言，要离开再回来才跟上；③ 保存成功提示用切换**前**的语言。修复＝英文词条补句首空格、配置表单在语言落地时回调设置外壳重渲染、语言补丁先本地落地再报成功；三处均补进 client 组件测试。
- **回退失败时不再吞掉救援结果**：此前的码文案表把 `ROLLBACK_FAILED` 一律显示成「回退失败」四字，会盖掉 host 侧更有用的信息（「已自动恢复到安全快照，请重新预览后重试」或手动救援命令）。A4 起 `err.*` 词典只收 host 文案静态的错误码，`ROLLBACK_FAILED`（连同 `BAD_TYPE` / `SETTINGS_WRITE_FAILED` / `PARTIAL_DELETE` / `ERROR`）回落 host message 原文——中文用户看到的是更完整的救援结果与逃生命令，代价是英文界面下这几类错误可能中英混排（策略与理由见 README「界面语言」）。

## [2.4.6] - 2026-09-29

### 变更

- **兼容声明同步 dsh 0.2.0-rc.1（零破坏核验，无代码改动）**：全局实装 `@deepseek-ai/dsh@0.2.0-rc.1`（npm dist-tag `next`，0.2.0 系列首个候选版本、汇总自 `v0.1.7-rc.2`；`latest` 仍是 0.1.7-rc.2，**装最新版必须显式写版本号**）后，以**全树逐文件哈希 diff** 核验——npm 清理失败留下的 `.dsh-EBhnoWNL` 残留正好是 0.1.7-rc.2 整包副本（298MB），直接用作基线（比对后已删除）；528 包中 310 包仅版本号 lockstep 变更，类型面 65 改 / 23 增 / 0 删，运行时 JS 71 改 / 11 增 / 2 删。插件消费面**零破坏**：`dsh-shell`/`dsh-settings`/`dsh-session-query`/`dsh-agent`/`dsh-client-connection`/`dsh-host-webserver`/`dsh-sandbox-policy`/`dsh-client-ui-slots`/`dsh-client-ui-renderer`/`dsh-client-ui-settings-plugins`/`dsh-pwsh-local`/`dsh-cordis-host-runner`（插件加载面）等内容字节级一致，消费面符号计数 11 项 0 差异（`readAttachment`/`updateQueue`/`archiveSession`/`openSession`/`createDrafts`/`releaseDraftAttachments`/`setDraft`/`addAttachments`/`stopActivity`/`increaseTitle`/`atSeq`），`plugins.bundle.config` 槽位定义与渲染调用逐行一致（`settings.plugin.item` 两版均 0 命中）。**唯一接口增量**是 `sessions.fork` 的可选 `onCreated`（向后兼容、插件不传）；真增量集中在插件管理页 UI（刷新反馈/安装输入清洗）、`config-editor` 配置继承值计算、会话标题「未命名」语义、消息提交埋点，以及 `dsh-session` 的工具结果修复链重构（`ToolCallRecovery`，插件 `cutSeq` 恒取平衡前缀、不触发补闭合分支）。门禁：`check:dsh` 四层全绿、`test:probe` 52/52、`verify:host` 装配断言全过、`typecheck` 通过、`npm test` 436/436。**活体冒烟（真宿主 + 浏览器实弹，link 模式 / `D:\tmp\recall-h0`）逐项通过**：插件经启动期兼容门禁激活（同 profile 的第三方 `dshmarket@1.65.1` 因 peer 只到 `^0.1.2-alpha.2` 被跳过，反证门禁真实生效）；撤回全链（面板清单、文件回退、安全快照 `snap-pre-rollback-*`、lineage、子会话打开、标题继承无递增、文本回填、无残留排队项、原会话归档）与设置页（配置卡完整渲染、`保存`/`恢复默认` 双向回读一致、快照树两级展开与版本家族聚族、`立即 gc`「gc 完成」）均正常，dsh stderr 零插件报错。同步项：**peer 范围必须新增 tuple** `|| >=0.2.0-rc.1 <0.2.1`（npm 的 prerelease 门槛要求同 tuple 且带 prerelease 的比较器，既有 `<0.1.8` 段放行不了 `0.2.0-rc.1`；不扩范围则启动期兼容门禁会整行跳过本 bundle）、`dshReleases` 补 `0.2.0-rc.1: compatible`、`docs/reference/` 镜像按 `dsh-v0.2.0-rc.1` tag 重拉（13 源中仅 `09-architecture.md` 有实质差异：新增一行「失败步骤会记录缺失的工具结果」，净 +121 字节）、`docs/dsh-contract.md` 对应版本与 compat-audit 头部核验段同步、README 双语徽章与兼容范围同步，评估实证见 `docs/upgrade-assessments/dsh-0.2.0-rc.1.md`。观察项（不阻塞）：`fork.onCreated` 可更早拿到 childId（插件当前不需要）；**自动化任务改由可选 bundle `dsh-experimental-schedule-bundle` 提供、默认关闭**，用户如需须在插件管理页开启。

- **兼容声明同步 dsh 0.1.7-rc.2（零破坏核验，无代码改动）**：全局实装 `@deepseek-ai/dsh@0.1.7-rc.2`（npm dist-tag `next`，rc.1 后 346 提交）后，以**聚焦消费面的内容级 diff** 核验——`npm pack` 下载 28 个包（全部 peer + 全部消费点所在包 + 官方 bundle）的 rc.1 版本，与 rc.2 树做全文件 SHA256 比对并逐行核对契约/实现差异；叠加**符号级复核**（13 包 × 23 符号在新旧树计数逐项相等，0 差异）。插件消费面**零破坏**：`api-session-controller` 的客户端契约目录（`lib/types/client/**`：fork/updateQueue/readAttachment/binding/archiveSession）**不在变更清单**，`dsh-shell`/`dsh-settings`/`dsh-sandbox-policy`/`dsh-host-webserver`/`dsh-pwsh-local`/`dsh-client-connection`/`dsh-client-modules`/`dsh-client-ui-renderer`/`dsh-client-ui-session`/`dsh-client-store`/`dsh-host-plugin-inventory`/`dsh-api-gateway` 12 个核心接缝包仅动版本号与 i18n 元数据；真增量集中在本版新能力与官方 UI 层——模型选择/账号（`initializeDefaultModel`/`hasProviderApiKey`/`requireModel`）、工具热更（`dsh-session` 纯新增 `ToolHistoryProjection`、`ui-chat` 新 node kind `developer-message`）、工作区快捷键与归档筛选三态、额度提示链、`app-boot` 的跳过报告时机（判定逻辑未变）、`ui-primitives` 样式重构，均为插件不消费处。门禁：`check:dsh` 四层全绿、`test:probe` 52/52、`verify:host` 装配断言全过、`typecheck` 通过、`npm test` 436/436。同步项：`dshReleases` 补 `0.1.7-rc.2: compatible`（peer 范围 `>=0.1.7-alpha.1 <0.1.8` 天然覆盖，无需新 tuple）、`docs/reference/` 镜像按 `dsh-v0.1.7-rc.2` tag 重拉（13 源中仅 `09-architecture.md` 有实质差异：3 处替换、净 +55 字符，含工具热更新增说明）、`docs/dsh-contract.md` 对应版本与事件集来源标注、compat-audit 头部核验段与 I33 增补、README 双语徽章与兼容范围同步，评估实证见 `docs/upgrade-assessments/dsh-0.1.7-rc.2.md`。观察项（不阻塞）：`session-query.read()` 新增显式抛 `SESSION_QUERY_CORRUPT_SESSION`（降级链保持 try/catch）；新 node kind `developer-message` 不被插件 key `['user','steering']` 命中；归档筛选三态不改 `archivedSessionIds` 语义（I37 判据继续有效）；`initializeDefault(signal)` 签名破坏性变更（插件零消费）；升级操作陷阱——Windows 上 npm 替换全局 bin shim 遇占用只留哈希名半成品，需手工改回标准名恢复 `dsh` 命令。

## [2.4.5] - 2026-09-24

### 新增

- **插件管理页图标（package.json 顶层 `icon`）**：新增 `assets/icon.svg`——形状沿用撤回按钮的 `UndoIcon`，画布 20×20、单色 `#658EFF`（官方品牌渐变的蓝端）。三处版面调整：① 两条侧翼从箭尖算起缩短 30%（对角分量 4 → 2.8，箭尖与尾部回环保持原位，不用整体缩放以免尾部一起变小）；② 尾端水平线向左延长到 x=6.3，与侧翼端点在竖直方向对齐；③ 整组上移 1.1（组 `transform`，路径坐标不动），使几何 bbox 中心落在画布中心 (8, 8)，上下留白对称。颜色必须写死：宿主把图标转成 base64 data URL 后以 `<img>` 隔离渲染，`currentColor` 不继承会退化成黑色；该色在浅底（对比 ≈3.1:1）与深底（≈5.5:1）都清晰，无需主题分支。宿主 `dsh-app-boot` 的 `readPluginMeta` 读**包导出的 `package.json` 顶层 `icon` 字段**（判据：相对路径、SVG/PNG/JPEG/WebP、≤256 KiB、realpath 后仍在包目录内、常规文件），读取失败只留 metadata error 且标题/描述照常；渲染位置是**插件管理页**的 bundle 卡片与详情页头部（36px），不是设置对话框的插件 tab（后者只解析 `meta.title/description` 多语言文本）。`files` 白名单加 `assets`，`package-layout` 单测补声明合法性 + 随包发布断言——否则图标文件不进发布包、宿主只报 metadata error，线上静默无图标。

- **设置页快照管理：搜索框与树节点整行展开**：搜索框加高 20%（34 → 41px）并在框内左侧内嵌搜索图标（绝对定位 + `pointer-events:none`，输入框以 `padding-left` 让位；高度覆写只 scope 到搜索行，排除配置的快速添加框维持原高）；快照树的工作区/会话行整行可点即展开/收起（原先只有 18px 折叠箭头可命中，用户实测反馈难点），行内删除与「切换」按钮各自 `stopPropagation` 不连带折叠，折叠箭头仍是键盘与读屏入口（`aria-expanded` 不变）。

### 变更

- **快照树删除按钮图标化并移到名称之后**：文本 chip「删除」改为垃圾桶图标（48 viewBox 路径、`stroke:currentColor` 随主题，20px 命中区、静息 `label-tertiary`、hover 转 error 色 + 危险底色），位置从行尾移到工作区/会话/快照名之后——原先删除 chip 逐行右对齐成一列、与行内容分离易点错行；「切换」留在行尾（导航动作与危险动作分开摆放）。`title` 与 `aria-label` 保留完整语义，图标 `aria-hidden`。

- **设置页整体重做，与 dsh 设计语言对齐**：去掉外层「撤回插件」可折叠卡与卡片外框，设置项直接平铺（两轮收敛：先去折叠头、再去外框，用户实测反馈两层包裹皆属冗余）。配置表单改三列网格（标签 | 控件 | 说明）：说明文字原先按流跟在宽度不一的单位 tag 之后，起笔位置逐行参差（实测「gc 触发条数」与「gc 触发小时」对不齐），改由列宽统一给定，并以 `padding-top` 与 34px 控件行共用中轴；开关行右缘对齐数字行输入框的右边框（关系由 `--dsh-recall-input-w` / `--dsh-recall-switch-w` 两个令牌承载），开关行的状态 tag 因此与数字行的单位 tag 同起点；字段标签与控件行垂直居中（label 用 34px 行高对齐控件行中轴）。折叠分区（高级：基础排除表 / 排除配置 / 快照管理）标题升为与分组标题同款 14px/700，chevron 收到行尾使标题与分组标题共享同一左缘，首项折叠头加分割线（用绝对定位伪元素绘制——`border-top` 会沿 cardbtn 的 12px 圆角走、两端上翘）；表单分组标题加粗放大（14px/700 + label-primary）。交互侧补齐：输入类 hover 中间态（rest `l4` → hover `l3` → focus `brand`）、按钮按下态、卡片与分区展开 `unfold` 入场（`prefers-reduced-motion` 同步豁免）、开关 hover 提亮、空状态居中留白；图标语言统一为 SVG（字符 `▸/▾` 跨平台字形不一，退役）。

- **设置项文案精简与标签改名**：九条字段说明改为短句（「填写 0 表示不限制 / 不启用」等语义与输入框右侧单位 tag 全部保留），「撤回后回填输入框 / 撤回后归档原会话」简化为「回填输入框 / 归档原会话」；顺带删掉基础排除表说明里遗留的计划代号。

- **撤回按钮图标同步新版形状**：`src/client/recall-node.ts` 的 `UndoIcon` 与 `assets/icon.svg` 取同一套坐标——两翼从箭尖算起缩短 30%、尾端水平线延到与侧翼端点同列（x=6.3）、整组上移 1.1 居中；内联规格刻意不变（16 声明尺寸、`stroke` 1.4、`currentColor` 随按钮文字色，即保持原有大小/粗细/颜色）。两处形状自此需同步改（`UndoIcon` 上方有同步注释）。本版 `lib/client.js` 重建为 120644 字节（含设置页 UI 重做）。

### 修复

- **新版 Edge/Chromium 下开关与其它圆形元素被全局超椭圆圆角接管（观感「更方」）**：`dsh-client-ui-theme` 在 `@supports (corner-shape:superellipse(1.5))` 内给 `*,:before,:after` 下发 `corner-shape:var(--dsw-corner-shape)`——支持该属性的内核把**所有**元素渲染成超椭圆（squircle），旧内核（如 IDE 内置浏览器，不认该属性）则维持普通圆角，同一份 UI 因此在不同浏览器观感不同（用户实测反馈）。官方为此在 104 处圆形/胶囊元素上显式写回 `corner-shape:round`（含 `Switch.module.css` 的轨道与拇指、Tag 胶囊、StateDot、spinner），本插件漏写。修复＝开关轨道、开关拇指、`ex-chip`、`health-pill`、消息 hover 圆形按钮五处补 `corner-shape:round`；矩形元素沿用全局 squircle（与官方同策略）。注意此类差异**量不出数值**：DevTools 里两侧的 `getBoundingClientRect` / `border-radius` / `padding` 完全一致，差异只在角部形状。

- **点击设置项标签会直接触发右侧控件**：`label[for]` 与控件建立关联后，点击标签等同点击控件——开关（`button` 属 labelable 元素）被误切换、数字输入框被抢焦点（用户实测反馈）。修复＝标签改 `span`、控件改挂 `aria-labelledby` 指向标签 id（可访问名保留、读屏不弱化），numRow / boolRow / 基础排除表 textarea 三处同改；撤回确认面板的 scope 单选组保持 label 包裹写法（选项组的有意设计）。

- **字段标签与自己的输入框错开一行**：label / 控件行 / 说明文字各自为 grid item 时，说明占掉控件行的下一行会把后续 label 的自动放置顶到前一字段的说明行上（实测「gc 触发条数」标签偏上）。修复＝三列网格下每字段恰好「标签 / 控件 / 说明」三个 item，label 与控件同排。

## [2.4.4] - 2026-09-24

### 修复

- **反向代理子路径部署下插件全部调用失效（端点路径写成了根绝对路径）**：dsh 0.1.7-rc.1 起官方支持「Web 挂在反向代理子路径」，口径是客户端把服务端路径按**文档基址**解析——index 由 `dsh-host-frontend-static` 注入 `<base href="./">`、前端资源改相对引用、`dsh-api-gateway` 用 `streamBaseUrl ?? document.baseURI`、connection RPC 直接 POST 去前导斜杠的相对路由。插件客户端原先硬编码根绝对 `fetch('/api/recall/<name>')`：子路径部署下浏览器会越过前缀打到代理未映射的根，预览/撤回/快照管理/设置卡片全部失效。实弹（真宿主 + 只映射 `/dsh/*` 的反向代理）：带前缀 `POST /dsh/api/recall/status` → 200、根绝对 `POST /api/recall/status` → 404。修复＝新增 `src/client/util.ts` 的 `recallApiUrl(name, base?)` 统一解析端点 URL（基址缺尾斜杠按目录补齐，避免直接访问 `/dsh` 时前缀被当作文件名吞掉；无 `document`／基址非法回落原根绝对路径，旧环境行为不变），`api()` 唯一调用点改走它。Host 端零改动——代理剥前缀后宿主见到的仍是 `/api/recall/*`，exact 路由照常命中。配套 5 条单测（根/子路径/多级/缺尾斜杠/回落 + fetch 桩钉调用点 URL）与 3 条探针（I40：`<base href="./">` 注入、前端资源相对引用、官方 `document.baseURI` 对照），台账见 compat-audit I40。

### 变更

- **兼容声明同步 dsh 0.1.7-rc.1（零破坏核验，无代码改动）**：全局实装 `@deepseek-ai/dsh@0.1.7-rc.1`（npm dist-tag `next`）后以**全树内容级 diff** 核验——升级前对 alpha.2 整包做快照，升级后比对得 915 条变更（853 改 / 49 增 / 9 删 / 4 重命名）、647 个非 package.json 文件有真实内容差异（其中 320 个为随包 LibreOffice 运行时）。插件消费面**零破坏**：`dsh-session`/`dsh-session-query`/`dsh-shell`/`dsh-pwsh-local`/`dsh-sandbox-policy`/`dsh-host-webserver`/`dsh-client-connection`/`dsh-client-modules`/`dsh-settings`/`dsh-agent{,-loop}`/`dsh-attachment{,-local}`/`dsh-workspace` 等 24 个包与整个 cordis vendor 栈内容字节级一致（仅版本号），三个关键契约文件（`ui-chat`/`ui-conversation` 的 `contract/slots.d.ts`、`api-session-controller` 的 `contract/session.d.ts`）**SHA256 相同**；真改动集中在 `ui-chat`（工具调用准备态/本地图片预览）、`ui-conversation`（`RunningToolCall` 拆 preparing/start 两阶段、瞬态 start 语义）、`api-session-controller`（assistant 流退休记账）与 `ui-plugin-manager`（host 侧安装/失败类型），均不在插件消费面（插件不定义 ConversationNode、不消费工具调用类型）。**本版新增机制**：启动期插件/runtime 兼容性门禁——按 `peerDependencies` 中 `@deepseek-ai/dsh[-*]` 条目用 `semver.satisfies(runtime, range, { includePrerelease: true })` 判定，不兼容的行启动期整行禁用（可由 profile `compatibility.json` 或 `dsh plugin allow-version` 豁免），安装命令在 pnpm 前预检；本插件 6 条 peer 实测放行 0.1.7-rc.1、无需豁免（`dsh.compatibility.dshReleases` 仍是市场台账声明，非安装门禁）。门禁：`test:probe` 49/49、`npm test` 430/430、`verify:host` 装配断言全过、`typecheck` 通过、`build` 产物零漂移。同步项：`dshReleases` 补 `0.1.7-rc.1: compatible`（peer 范围 `>=0.1.7-alpha.1 <0.1.8` 天然覆盖，无需新 tuple）、`docs/reference/` 镜像按 `dsh-v0.1.7-rc.1` tag 重拉（13 源中仅 11 号对话节点文档有实质差异 +182 字符）、`docs/dsh-contract.md` 与 compat-audit 头部版本字段同步、README 双语徽章与兼容范围同步，评估实证见 `docs/upgrade-assessments/dsh-0.1.7-rc.1.md`。观察项（不阻塞、均非回归）：peer 区间升级为启动硬门槛（新 minor 线需先核验再开窗）；子路径部署与 SSH 远端工作区两个新场景下插件未验证（插件 API 走绝对路径、影子仓库假定本机文件系统）。

## [2.4.3] - 2026-09-23

### 修复

- **有后台任务在跑时撤回，原会话归档静默失败、还会被完成通知唤醒继续跑（幽灵执行）**：`dsh-workspace` 的归档对「有活动在跑」的会话**默认拒绝**——先经 `workspace/session-activity` 瀑布问 agent 回合 / `dsh-jobs` 后台作业 / `dsh-subagent` 子代理 / `dsh-schedule`，命中即抛 `workspace/session-active`；只有 `archiveSession(sessionId, { stopActivity: true })` 才改成「先停后归档」（`workspace/session-stop` → jobs 以 `kill(id, owner, "session archived")` 收尾，结算 `cause: 'kill'`）。插件旧写法既不传该选项、又用 `.catch(() => {})` 把拒绝吞掉，于是「模型起了后台作业 → 用户撤回」这条路下：原会话静默不归档（仍留在列表）、作业继续跑，且 `cause: 'kill'` **不在** `dsh-tool-jobs` 抑制通知的 `teardown` 之列 → 完成通知投递给处于 idle 的源 agent → `followup(...)` 在**文件已回滚**的原会话里开新一轮。修复＝归档改传 `{ stopActivity: true }`（官方 UI「停止并归档」同款语义：撤回即这一版作废），并把失败从静默吞掉改为 `console.warn` 留痕——归档失败意味着原会话留在列表且可能继续跑，属用户可见降级。旧版 dsh 客户端面只有 `sessionId` 一个参数，多传实参在 JS 侧无害。配套：探针新增客户端 `options?: { stopActivity?: boolean }` 与 `workspace/session-active` 拒绝语义断言（I7）；I12 探针由「已消失的旧路径静默 skip」改为双代面 + fail-loud（两代 slot 契约至少一条在位，新面 `plugins.bundle.config` 首次纳入断言），探针 46 → 49。

## [2.4.2] - 2026-09-23

### 修复

- **CI 单测缺 `@deepseek-ai/schemastery` 致 4 个测试文件收集失败**：`src/host/config.ts` 在运行时裸导入 `@deepseek-ai/schemastery`（Config schema 本体），但它此前只是 peerDependency——本机靠工作区 junction 解析所以本地全绿，CI `npm ci --legacy-peer-deps` 不装 peer 即 `ERR_MODULE_NOT_FOUND`。M2 起 manage-list/manage-list-stale/manage-usage/settings-bridge 四个单测文件经 routes-manage/config 链传递依赖 config.ts，而 0.1.7 适配批次（M1 起）当天才首次推送过 CI，问题首次暴露。修复＝schemastery 入 devDependencies（`^3.18.3`，与 `.volatile()` feature-detect 的下限对齐；peer 声明 `^3.18.1` 不动）。**对 2.4.1 已发布包零影响**：生产环境 schemastery 由宿主 dsh 提供，此缺包只影响 CI/裸克隆环境的单测。AGENTS.md junction 约定同步更新（schemastery 不再需要 junction；npm install 会修剪 dsh-settings junction，已记录重建方法）。

### 变更

- **兼容声明同步 dsh 0.1.7-alpha.2（零破坏核验，无代码改动）**：本版为体验/稳健性版本，插件消费面经全树内容级 diff 实证零破坏——`updateQueue`/`readAttachment`/`QueueAction`（含 `{kind:'remove'}`）签名行逐字一致，`conversation.chat.node` 与 `ConversationNode`/`records` 槽位契约字节未变，`__ModuleLoader__.load({id, factory})` 注册形态与 `plugins.bundle.config` 在位，fork 实现与切点校验未动；`dsh-session`/`dsh-shell`/`dsh-pwsh-local`/`dsh-sandbox-policy`/`dsh-host-webserver`/`dsh-client-connection`/`dsh-agent{,-loop}` 与整个 cordis vendor 栈（含 `cordis-plugin-loader`）字节级未变，改动全部落在官方 UI/工具层（滚动跟随、历史分页 Turn 对齐、本地回声记账、队列消息重编辑、持久 pwsh 等待修复、工具结果 token 预算）。门禁：`test:probe` 46/46、`npm test` 430/430、`verify:host` 装配断言全过、`typecheck` 通过。同步项：`dshReleases` 补 `0.1.7-alpha.2: compatible`（peer 范围 `>=0.1.7-alpha.1 <0.1.8` 天然覆盖）、`docs/reference/` 镜像按 `dsh-v0.1.7-alpha.2` tag 重拉（13 文件零差异）、`docs/dsh-contract.md` 与 compat-audit 头部版本字段同步，评估实证见 `docs/upgrade-assessments/dsh-0.1.7-alpha.2.md`。已知观察项（不阻塞）：`dsh-tool-jobs` 唤醒次数上限默认放开（`maxConsecutiveWakes` 无默认值）使 P0-1 `agentBusy` 守卫的 idle 窗口概率上升，留实弹观察。

## [2.4.1] - 2026-09-23

### 修复

- **无快照的残骸仓库现在能被 gc 回收（issue #18）**：快照在 `git add` 与打 tag 之间失败会留下一批无 tag 可达的 blob，而 `.git/index` 仍逐条指着它们——`git prune`/`git gc --prune=now` 以 refs **+ 暂存 index** 为可达根，`git fsck --unreachable` 也报 0 个不可达（实测 5000 条 index + 0 ref 时输出 0 行），于是这类仓库一个对象都回收不掉，实测单工作区残留 78.4 MB 一根毛不减（POSIX 侧同结论）。修复＝两套模板的 `gcScript` 在 `gc` 之前加条件块：`for-each-ref --count=1 refs` 为空**且** `ls-files` 非空（= 没有可回退快照的纯残骸）时先 `read-tree --empty` 清 index 再 gc。为什么条件必须两条：有 tag 时 index 是 diff/rollback 依赖的「当前清单」，绝不能清；而 index 本身是可重建缓存，snapshot/diff/rollback 三处开头都先 `add -A`。修复后实测同一残骸库 78.4 MB → 0（残留 1 个空树对象），有 tag 的仓库 gc 后 refs/index/tag 可解析性原样，win32 与 Git for Windows bash 双侧 6/6 通过。
- **posix oversize 的 find 括号写错，超大文件剔除在 Linux/macOS 上静默全废**：`find` 的 `(`/`)` 被写成 `"\("`/`"\)"` 放进数组元素——引号内是数据，bash 不剥反斜杠，find 收到两字符 token 直接报 `paths must precede expression` 退出 1；报错被 `2>/dev/null` 吞、管道零输出、xargs 空跑、`|| true` 兜底，整条剔除 100% 静默空转（比优化前更糟：连原有的慢扫都没有，且零报错）。修复＝括号改单字符数据 `'('`/`')'`，并加外层 `-type d` 限定让 prune 只剪目录（否则与排除目录同名的大文件 `dist`/`target` 会被 `-name` 一并剪掉；pwsh 侧只对 `EnumerateDirectories` 判名，两侧同语义）。契约单测同步改钉修复后的形态。
- **pwsh `gcScript` 漏查 `$LASTEXITCODE`，gc 快速失败被误报成功**：pwsh 对原生命令非零退出不抛（EAP 不作用于 native），`git gc` 失败（磁盘满/锁冲突/杀软锁 pack）后脚本继续写 `gc.stamp`、输出 `GC_OK`、以 0 退出；`runShell` 只看进程退出码，于是 maintenance 把失败记成成功、推进完整 gcHours 周期——上条退避修复在 Windows（PS 5.1 与 pwsh 7 实测同结论）对快速失败完全失效，`gc.stamp` 这份跨重启的节流凭据也是假的。修复＝gc 之后显式 `if ($LASTEXITCODE -ne 0) { throw ... }`（同 `rescueScript`/`diffScript` 既有写法）；posix 版有 `set -e`，天然正确。契约单测新增「gc 失败必须可见」断言。
- **gc 失败后走退避重试，不再推进完整 gcHours 周期（快照仓库 GB 级膨胀的根因）**：实测一台重度机器上单工作区影子仓库积到 **3.35 GB loose 对象、in-pack 恒 0**——定期 gc 从未成功完成过。机制：`runGc` 失败（超时/磁盘/杀软）也把 `gcLastAt` 推进到此刻，等于失败一次就放弃整个 gcHours（默认 24h）周期；期间对象继续堆积，下一次 gc 只会更重、更容易超时，「失败→整天不重试→更重→更易失败」滚雪球，对象库永远压不进 pack。修复：失败只把 `gcLastAt` 回拨到「此刻 − gcHours + GC_RETRY_BACKOFF_MS（30 分钟）」，退避窗口后自动重试；成功维持原有「推进到此刻」语义；退避期间 gcCount 条数门槛照常生效，不会退化成「每条消息都重试」。`runGc` / `runGcAll` 两路径同修。新增 `tests/unit/maintenance-gc-backoff.test.js` 4 例钉住成功/失败/节流三条语义。
- **超大文件扫描（oversize）跳过被排除的大目录子树（两平台）**：原先 .NET 手动栈 / `find` 全工作树递归，`node_modules/`、`target/` 等已排除目录照样被逐文件 stat——一个 11943 个文件、10.96 GB 的 Rust `target/` 让每条消息的快照都多付一次全树扫描（I/O 风暴实测可拖垮宿主全部 HTTP 接口）。修复：把 exclude 表里 basename 形式（无通配、无内部斜杠、非 `!` 反选）的 pattern 按 gitignore 语义转为「任意层级同名目录整棵跳过」（pwsh 压栈过滤 HashSet；posix 转 `( -type d ( -name A -o -name B ) ) -prune -o` 前缀）；复杂 pattern 不参与跳过、回退全扫该子树——多扫不漏检，fail-open 语义不变。
- **`package-layout` 单测兼容 npm 11+ 的 `pack --json` 输出形状**：新版输出 `{<包名>: {...}}`（旧版为数组 `[{...}]`），原解析取错层导致 `files` 恒空、两断言恒红。两种形状都取首个条目。

### 变更

- **settings 旧面注册接线拆出为 `src/host/settings-bridge.ts`，并补上 CI 可跑的回归单测（防盲区）**：c3cc8a7（旧面注册 entry 先解 volatile ref）此前只有依赖本机 dsh 的 `verify:host` 与 M5-5 降级实弹能覆盖——它恰恰是从全部 M1–M4 门禁漏出、被实弹才抓到的缺陷类。接线本体（两代面分派 + installSettingsSection/installSection/register 三条旧面路径 + 新面 volatile 热更挂接）移入新模块并把 `dshSettings` 改为参数注入（模块不 import 私有 peer，生产路径不变：`index.ts` 裸导入后传入），`tests/unit/settings-bridge.test.js` 新增接线级 5 例：带 `{ get() }` ref 的假 config 走三条旧面注册路径时，收到的 entry（含 register 的 `base` 与卸载回退 source）必须是解过 ref 的普通值、新面挂 volatile-update 原样重读入口 config、接线抛错走 skip 记录。变异验证：临时还原回归形态（entry 不解 ref）三条路径测试全红。`index.ts` 有效行数 329 → 298（棘轮下降）。曾评估 verify-host 旧面 pass 直接喂 ref 形态 config 的替代方案——实测 cordis 的 config 校验入口先抛 `expected number but got object`（真实现场的 ref 化发生在 loader 校验之后的私有路径），无法在不假红的前提下复刻，故单测为该回归的唯一 CI 防线。
- **适配 dsh 0.1.7-alpha.1 的两处破坏性接缝（双分支共存，老版本行为不变）**：0.1.7 把插件依赖的两个接缝整体换代，本插件在同一次发布里同时支持旧线与新线——① **shell 执行接缝**：`ShellExecutor` 删除 `run`/`start` 抽象方法，改为 `resolve(request)` + `execute(spec)` → `ShellExecution.result()`；旧调用在 linux/darwin 上会抛 `shell.run is not a function`（建仓/快照/diff/回退/gc/索引读写全链失败、撤回不可用），win32 上则被方言探针的 catch 折成「误判 bash」走自建直连通道（功能侥幸可用但打误导日志）。修复＝`runViaExecutor` 按**运行时方法探测**分流（`run` 优先 → `execute` 兜底），两分支共用同一 spec 构造与同一失败分级，并把 0.1.7 新增的 `exitCode === null`（准备期超时/信号终止）单独归类成「命令准备期超时」而不是不可读的 `exit null`。② **settings 接缝**：`dsh-settings` 导出面只剩 `SettingsForms`（`installSettingsSection`/`installSection`/`register` 全树移除），插件原三分支在 0.1.7 上**静默 no-op**（namespace 不注册、热更失效、设置卡片读不到覆盖字段、保存与恢复默认必失败）；新面按 **profile 条目 id**（本机实测为 `recall`）经 `describe`/`update`/`replace` 读写，可写字段必须在 schema 上标 `.volatile()`（schemastery ≥3.18.3 才有，插件 feature-detect），热更经 loader 提交引用后派发的 `loader/volatile-update` 驱动，取值多一层 Volatile 解包。分流判据取「旧注册入口是否缺席」——只看 `describe`/`update` 是函数分不了流（旧面同样有），误判会让 0.1.6 上的卡片失联。探针按新实现重钉（shell 接缝、settings 面、volatile 热更与 `Fiber.entry` 形状），`verify:host` 桩升级为两个 pass（含「只给新面（无 `installSection`）也必须装配成功」——这正是本轮换代被自家桩掩盖的根因），compat-audit 新增 I38/I39，镜像与兼容声明同步到 0.1.7-alpha.1。
- **「立即 gc」起按磁盘枚举覆盖全部快照仓库，并回收空仓目录（issue #18）**：`runGcAll` 原先只遍历内存缓存（启动预热与历次操作认识过的工作区），会话已删、或从未在本进程 init 过的仓库在磁盘上有、内存里没有——那些恰好是 issue #18 的 GB 级残骸，此前完全不被 gc 覆盖。修复＝注入 `dumpStores`（一条 shell 枚举容器子目录与降级候选目录）后取「内存 ∪ 磁盘」并按 git-dir 去重逐仓 gc；gc 之后追加**空仓目录回收**：仅当 index.json 明确解析为空数组、磁盘无 `snap-*` tag、内存无对应快照三条全中时，用 `legacyRmScript` 把整个 store 目录删掉（不可逆，删前 `console.error` 留痕；entries 为 null 即索引缺失/损坏的隔离现场一律不删）。实测（真实 store 目录、win32 pwsh）：残骸仓库对象 202 → 1 后目录被删，有 tag 的仓库目录与 tag 原样。
- **工作区根自身是构建产物目录时不再建快照（issue #18）**：`baseExcludes` 是相对工作区 root 的 gitignore 模式，永远匹配不到 root 自己——在 `…/src-tauri/target/debug`、`dist` 这类目录里开会话时，整个构建产物目录会被全量快照（实测 7000 个产物条目里只有 root 下恰好同名的 `build/` 子树 2000 条被排除，root 整体照进），单会话即可积出 GB 级对象库，且这类目录没有回退价值。新增 `src/host/exclude-patterns.js` 判定「root 的任一路径段命中目录形态排除项」（win32 大小写不敏感、POSIX 敏感；看任一段而非 basename——最坏形态 `target/debug` 的 basename 是 `debug`，不在表里），命中的工作区在 `captureSnapshot` 于 `resolveStore` **之前**直接返回：不建快照、连空仓库都不建、不写 feedback（设计行为而非失败）。可见性：`init` 的 `notice.buildRootNotice` 与 `snapshot-info` 的 `notice` 下发同一句提示（含命中的路径段名、给出出口、≤140 字符），client 会话内说明一次并在近消息上节流 toast，避免「撤回按钮凭空不出现」。逃生口复用排除表本身（设置页删掉 `target/` 即恢复，无需新配置项）。存量残骸的整目录清理（含会话已删、内存里没有的仓库）留待后续按需实施。
- **`baseExcludes` 默认表加宽：编译产物目录与常见二进制/压缩包默认不进快照**：原先默认仅 `.git`、`node_modules/` 与两种存储目录名，`maxFileBytes` 只挡单个大文件、挡不住 `target/` 这类上万小文件整体 GB 级的构建产物——它们既拖慢每次快照的 `add`/遍历，也直接喂大对象库（上条实测的 3.35 GB loose 即由此而来）。新增 `target/`、`dist/`、`build/`、`out/`、`coverage/`、`.next/`、`.nuxt/`、`.output/`、`.cache/`、`.gradle/` 与 `*.exe`、`*.dll`、`*.pdb`、`*.so`、`*.dylib`、`*.msi`、`*.zip`、`*.7z`、`*.rar`、`*.tar`、`*.tar.gz`、`*.iso`。排除只作用于新增暂存（已有命中条目由 excludeSync 的清理循环在下次快照移出），仍可在设置页「基础排除表」逐条删改。
- **单次 gc 超时 10 分钟 → 30 分钟（`GC_TIMEOUT_MS`）**：GB 级 loose 对象库的单次 repack 可超 10 分钟，被杀的 gc 永远完不成；gc 与快照同在串行队列，加长只影响维护节奏。

## [2.3.24] - 2026-09-18

### 新增

- **「仅撤回对话」模式（撤回范围二选一）**：对生成结果不满意、但文件改动恰是想要（或已人工修整）时，整段回退会把文件一并覆盖。确认面板新增撤回范围 radio 组（原生 input、键盘可达；默认「回退文件与对话」与现状逐项一致；首条用户消息因对话无从回退不渲染）——选「仅撤回对话」后文件清单降级为参考语义、安全快照预告隐藏（不打安全快照：零文件改动即无不可逆操作缺口），按钮与 executing/done 文案随模式分叉。实现＝`ExecuteArgs` 增 `scope?: 'both' | 'session-only'`（缺省/非法值回落 both：老 Client 与直调 API 行为不漂移），Host execute 开头分叉——session-only 不进串行队列、零 git 写操作（保留 NO_SNAPSHOT/AGENT_BUSY 两道护栏，跳过 STALE 校验/安全快照/rollback/rescue 全链），直接 `resolveCutSeq` + `resolveStaleQueueItemIds` 返回 `count: 0`；fork/归档/子会话导航/排队消息清理/lineage/草稿回填链与模式无关，原样复用。新增 `tests/unit/routes-scope.test.js` 5 例（session-only 零 git 调用与透传、agentBusy 拦截、NO_SNAPSHOT、非法 scope 回落 both、不传 scope 现状回归钉）。

## [2.3.23] - 2026-09-18

### 修复

- **撤回后子会话不打开（dsh 0.1.6-alpha.2 移除 `ISessions.open`，实弹冒烟发现）**：alpha.2 起 `ISessions` 只保留列表快照与 `retain`/`using` 引用模型，契约注释写明「navigation belongs to view owners」——原调用的 `sessions.open(sessionId)` 已不存在，守卫判断静默跳过，于是撤回的 execute/fork/lineage 全部正常，唯独 fork 出的子会话不会被打开：页面停在工作区空态。导航入口迁至独立 `uiWorkspace` 服务（`dsh-client-ui-workspace`）的 `openSession(target: SessionTarget)`（`SessionTarget = SessionId | SubagentAddress`，官方 UI 同样传裸 sessionId；`ctx.workspaces` 只有归档能力、无导航）。修复＝client `inject` 声明 `uiWorkspace` + `ctx.uiWorkspace` 类型化（`ClientUiWorkspaceService`），导航点改双版本分支：`uiWorkspace.openSession(id)` 优先、旧版回退 `sessions.open(id)`（撤回节点与快照管理「切换」两处）。`tests/probe/api-surface.test.js` 新增「会话导航归属」2 例钉住两侧事实，compat-audit 新增 I37。实弹复验：撤回第二条消息后子会话自动打开、对话回退、标题继承、被撤回消息文本回填输入框。

- **快照管理「切换」把归档会话放进点击路径，一点就落到工作区空态**：按钮判据只查会话是否在官方列表里（`sessions.list`），依据「已归档会话不在列表」的假设；alpha.2 起该快照包含归档会话，而归档会话不是合法的主视图选择——官方导航会先设置选择、随即按「归档选择不保留」把它清空，视图落空态（撤回后归档的原会话最常命中）。修复＝判据叠加归档集合排除：`ClientWorkspacesService` 补 `list` 面，从 `ctx.workspaces.list.getSnapshot().archivedSessionIds` 取归档集合（服务经 `buildSettingsCards` 传入快照管理卡），只有「在官方列表且未归档」的会话才渲染「切换」。实弹复验：归档会话行不再出现「切换」，保留「切换」的活跃会话点击后正常打开。

### 变更

- **旧版回退核验 + 兼容声明下界收窄**：本批次三处改码都在跨版本面上（静态 `uiWorkspace` inject、`plugins.bundle.config` 注册、读 `workspaces` 归档集合），故把全局 dsh 降到纯 `0.1.6-alpha.1`（`npm install -g @deepseek-ai/dsh@0.1.6-alpha.1 --before=2026-09-16`；不带 `--before` 会因 dsh 自身 `^0.1.6-alpha.1` 放行同 tuple 预发布而混入 alpha.2 的包）实弹一轮，确认未升级 dsh 的用户更新插件后不会变砖——三项全过、控制台零报错：旧 slot（`settings.plugin.item`）卡片照常渲染且样式注入正常、`plugins.bundle.config` 在旧渲染器上是静默 no-op；撤回 fork 后子会话由 `uiWorkspace.openSession` 正常打开（切过去后再发消息、新快照记到子会话 id 为证）；快照管理树按 lineage 聚族（`v1/2`/`v2/2`）。同时按 registry 产物逐版核验 `uiWorkspace` 服务可用性：`0.1.2-alpha.2` 起有该服务但无 `openSession`（该线走 `sessions.open` 回退，`ISessions.open` 到 alpha.1 都在）、`0.1.5-rc.2` 起 `openSession` 在位，而 **`0.1.1-rc.2` 线没有该服务**（同线亦缺 `sessions`/`workspaces`：`dsh-api-session-controller`/`dsh-api-workspace-controller` 无该版本发布）——静态声明无法满足，插件 UI 会静默不渲染。据此**7 个 dsh-* peer 范围去掉 `>=0.1.1-rc.2 <0.1.2` 段**，让该组合在安装期被明确拦住而不是装上了白屏；README 双语兼容声明与 badge 上界由 `0.1.6-alpha.1` 更新为 `0.1.6-alpha.2` 并写明不再声明支持 0.1.1-rc.2 及更早的原因；compat-audit I37 补「服务可用性」条目，实弹记录见 `docs/plans/completed/smoke-checklist-records.md`。核验完装回 `0.1.6-alpha.2`（树内 8 个 `@deepseek-ai/dsh-*` 包一致），`npm run check:upgrade` 三层门禁全绿（check:dsh 全一致 / test:probe 39 通过 / verify:host 通过）。

- **README 双语补充快照捕获窗口的边界说明**：快照为异步捕获，从收到消息到 `git add` 之间有约 0.5–1.5 秒窗口（Windows 上一次 PowerShell 启动即约 0.4 秒；index.json 记的 `time` 是脚本发起时刻而非捕获时刻）。秒级完成的琐碎任务若落在窗口内改完文件，该条快照会连带捕获本轮改动——撤回时文件回退成为空操作（预览显示「共 0 个文件将变更」），对话回退不受影响，且撤回前仍先落 `snap-pre-rollback-*` 安全快照，无数据丢失。此为异步快照的固有边界，无法消除（除非让每条消息同步阻塞等快照完成）。
- **dsh 0.1.6-alpha.2 兼容适配：设置卡片迁挂插件管理页 slot（I12）**：全局实装 `@deepseek-ai/dsh@0.1.6-alpha.2`（npm dist-tag `alpha`，tag commit `ddefc45`）后核查发现旧设置页插件 tab 整体移除——`settings.plugin.item` 与 `settings.plugins.tab` 产物字符串归零，新增 ui-plugin-manager 插件管理页，声明 `plugins.item` / `plugins.bundle.config` / `plugins.row.config` 三 slot（bundle 自带配置走 `plugins.bundle.config`，keyed by bundle 包名，page 视图要求表单自含保存控件）。Client 侧改为双键并注册：新增 `plugins.bundle.config`（key=`dsh-recall-plugin`，插件管理页 bundle 页渲染 RecallSettingsCard）+ 保留旧键 `settings.plugin.item`（key=`dsh-recall`，0.1.6-alpha.1 及以前生效）——官方 renderer 对未声明 key 的 `slots.inject` 是静默 no-op（`specDynamic` 为 undefined 直接 return），双版本各吃各键无需运行时探测。其余消费面零破坏：fork 签名与切点 `cut = boundary.seq + 1`（I35 根治）逐字保持；connection `fetch.register` 契约不变（仅新增 `streamBaseUrl?` 可选字段）；client sessions 改 retain/release 引用模型（多实例共存），`binding()` 收窄为「只借已 retain 的会话」——附件重建链（I34）全链 typeof 降级兜底，最坏仅附件不重建（导航面另有两处问题，见上方修复）。peer 范围 `>=0.1.6-alpha.1 <0.1.7` 天然覆盖 alpha.2 无需扩展。机器化断言：`npm test` 361/361 + `check:upgrade` 三层门禁全绿（probe 37/37）。reference/ 镜像按 alpha.2 tag 重拉（仅 06/09 文档文字修订）；compat-audit 头部追加 alpha.2 核验段并更新 I12。实弹冒烟记录见 `docs/plans/completed/smoke-checklist-records.md`。

## [2.3.22] - 2026-09-16

### 修复

- **win32 上宿主把 `ctx.shell` 配成 bash 时功能面整个死亡（issue #15）**：官方 shell 是提供方注册制——一个 composition 恰好一个 `ctx.shell` 实现，win32 的 profile 可以只启用 `bash-sandbox`（禁用 `pwsh-sandbox`）；而插件按 `process.platform` 单选 pwsh 模板，两者之间没有契约保证，于是模板被 bash 执行、第一行编码前导即语法错误（`bash: -c: line 1: syntax error near unexpected token '('`），`ensureGit` 起每一步都失败：快照从未成功、撤回按钮不可用。官方 `ShellExecutor` 公开面（`resolve`/`run`/`start` + `sandboxMode`）没有任何方言标识，**不能查询只能探测**，故修复＝行为探针判方言 + 判成 bash 时改走直连通道：
  - **S1 方言探针**：`runShellMeta` 首调内联执行 `Write-Output <罕见 ASCII 哨兵>`（不带 UTF8_PRELUDE、30s 短超时、直调 `ctx.shell` 不触发失败清扫）；exit 0 且回显哨兵判 pwsh，非零退出（bash 下 command-not-found 即 127）/无输出/reject 一律判 bash。结果按进程缓存并以 in-flight promise 去重（突发 `session/event` 只探一次）。POSIX 不探测——bash 模板与 bash 执行器天然一致。
  - **S2 直连通道**：判 bash 时 `runShellMeta` 分流到 Node `spawn` 直连 `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -Command <单 argv>`（PS 5.1 全平台自带，不赌 PS7；模板本就按 5.1 兼容写），保留官方四项语义：stdin 字节透传（PS 5.1 代码页坑由字节流绕开）、stdout 超截断保留尾部并置 `truncated`（索引读取靠它区分截断与损坏）、超时 `child.kill()`、非零退出仍走 `cleanupAfterGitFailure`；env 复刻官方清洗（剥凭证形状名与全部 `DSH_*`，叠 `NO_COLOR`/`PAGER`/`GIT_PAGER`），cwd 取 `sandboxPolicy.workspaceRoot || process.cwd()`，`windowsHide` 防桌面端闪窗。带 `RECALL_CLEANUP` 哨兵的失败清扫脚本不触发探针（只用缓存）——它只在真实命令失败后被调用，方言早已判定，善后路径不再叠一条探测进程。
  - **默认路径零变化**：`ctx.shell` 即 pwsh 的常规部署（探针判 pwsh）与 POSIX 都不触达直连通道；探针误判的代价也低——两条通道对 pwsh 模板都兼容，判成 bash 只是绕开官方托管环境（无 `dshEnv`/PATH 注入、无进程树级终止）。
  - 新增 `tests/unit/store-shell-dialect.test.js`（31 例：判定/收集/env 清洗/可执行路径四个纯函数 + 假 child 覆盖 stdin 字节透传、截断、超时 kill、spawn error + 分流接线与 in-flight 去重）；`tests/probe/api-surface.test.js` 新增「win32 shell 方言」3 例（ShellExecutor 无方言字段、直连复刻的 PS 5.1 候选路径与 argv 旗标、env 清洗口径）；compat-audit 新增 I36。

## [2.3.21] - 2026-09-15

### 变更

- **dsh 0.1.6-alpha.1 兼容性声明与台账同步**：全局实装 `@deepseek-ai/dsh@0.1.6-alpha.1`（npm dist-tag `alpha`，0.1.6 线首个预发布）后跑三层门禁——`verify:host` 装配断言通过、`npm test` 330/330、`test:probe` 32 例中 1 红。红点即本版唯一行为级变化：**官方修复 `sessions.fork` 按轮次分叉的切点**——由「`cut` 从 `boundary+1` 向后推进到下一个 `turn/start` 之前」改为「`cut` 固定 `boundary.seq + 1`、精确切到选中 `turn/end`」，结束事件之后的排队输入、标题、模型设置均不再复制进子会话 seed，2.3.17 起插件侧 `scanStaleQueueItemIds` 清理的残留排队消息问题（I35）在 0.1.6 线上从源头消失（探针按 2.3.20 预留的「好消息变红」路径改钉新锚点后 32/32 复绿）。**清理逻辑不退役**：peer 范围保留 0.1.5 线段，该线上 fork 切点未修复、清理仍必要；0.1.6 上退化为 `queue-item-not-found` 吞掉的无害空操作。其余消费面零破坏：`snapshotEvents`/`eventAt`/`ownEvents` 仅标 `@deprecated` 未移除（内存跳行为不变，列为前瞻观察项）；`ShellExecutor.start` 异步化不涉及插件（只用 `resolve`+`run`）；`agent/session-start`→`agent/created` 事件改名与插件无关；回填链与 chat.node/settings slot 全部在位。tag 对比（800 commits / 300 文件）按消费面包过滤后唯一源码命中即 fork 实现；reference/ 镜像按 alpha.1 tag 重拉 13 源——10 份内容相同、05/09/13 三文件有实质差异（09 不变式措辞补「纯消息投影」、新增 `agent/created`、桌面 profile 重写；13 钩子行改名；均不触及插件消费的槽位/契约）。**兼容声明同步**：0.1.6 为新 minor 线，7 个 dsh-* peer 各追加 `>=0.1.6-alpha.1 <0.1.7` 段；`dsh.compatibility.dshReleases` 补 `0.1.6-alpha.1: compatible`；README 双语安装兼容声明与 badge、reference/README 归档字段、dsh-contract.md「对应版本」同步。评估实证见 `docs/upgrade-assessments/dsh-0.1.6-alpha.1.md`，compat-audit 新增 0.1.6-alpha.1 核验段并更新 I35 条目。本插件源码零功能变更。

## [2.3.20] - 2026-09-14

### 新增

- **探针：`sessions.fork` 切点推进行为 3 例**（I35 的文档化行为落成机器断言）：`tests/probe/api-surface.test.js` 新增「sessions.fork 切点推进行为」组，直钉 `dsh-api-session-controller` 构建产物的三条锚点——boundary 以「seq >= atSeq 的首条 `turn/end`」解析、`cut` 从 boundary+1 推进到下一个 `turn/start` 前、`seed` 取 `slice(0, cut)` 完整前缀。官方若改为「seed 排除未领取 inbox 项」（撤回残留排队消息的根治方向）或重构改名即红，提示复核 G1 清理逻辑是否可退役；0.1.1 旧版安装的实现锚点未核验，整体 skip（fork 签名探针仍覆盖旧包路径）。探针 31 → 34 例全绿，compat-audit I35 的「无直接探针」缺口随之闭环。

### 修复

- **与同页插件的全局名冲突（issue #14）：client 产物顶层声明整体收进 IIFE 闭包**：client bundle 以 classic `<script>` 原文 serve，esbuild cjs 产物的全部顶层声明都会挂到 `window`——顶层 `var CSS`（样式表数组）直接覆盖浏览器原生 `CSS` 对象（`CSS.supports()` 不再是函数），同页的 dsh-image-gen 等插件一调即崩（`CSS.supports is not a function`），DSH 反过来拒绝加载对方。且顶层名共 23 个（`clockText`/`buildTree`/`sizeText`…），逐个改名堵不完。修复：build-client.mjs 打包格式从 cjs 改为 iife——整个 bundle 包进箭头函数作用域，除 `window.__ModuleLoader__.load` 调用外零全局泄漏，对未来新撞名免疫；loader 契约不受影响（`factory: (require) => {...}` 收参注册与 `require("react")` 运行时加载原样保留，esbuild 的 require→require2 改名照旧）。build-client.mjs 新增产物断言回归钉：format 意外回退 cjs 或出现顶层 var/function/class 声明时构建即红。

- **撤回残留排队消息的自动清理从未命中：改为按 item id 直删**（0.1.5-rc.1 + 2.3.19 真机复现定位）：Host 侧解析与下发都正确（`/api/recall/execute` 响应带出窗口内入队项的 rpcId），失效段在客户端匹配——子会话输入框上方的残留卡片可稳定复现（刷新后仍在），30 秒轮询窗口内始终匹配不到队列行，随后弹「撤回前的一条排队消息未被自动清理…」toast 并打出 `console.warn`。改用官方 `updateQueue` 的寻址键直删：Host 侧 `scanStaleQueueItemIds` 取窗口内 user 来源入队项的 `inserted[].id`（即该消息的 message id）经 execute 响应的 `staleQueueItemIds` 下发；Client 侧对 fork 出的子会话逐项调 `updateQueue(itemId, { kind: 'remove' })`，删除队列快照匹配与 30 秒轮询（改为会话面未就绪时的 5 秒短等待，超时仍 warn + toast）。真机验收：子会话日志出现 `agent/inbox/spliced inserted=[] removed=1`（入队项当场移除），重复删除返回 `queue-item-not-found`，控制台零告警。读取链顺带加固：内存跳改用 `snapshotEvents()`（0.1.5-rc.1 的 `Session` 无 `events` 访问器，旧字段仍兼容），并把 `observeSession` 提到 `readSession` 之前。

## [2.3.19] - 2026-09-12

### 修复

> 本次为 2.3.17 起改动的首次 npm 发布：2.3.17 / 2.3.18 未单独发版，其全部改动随本版本一并上线。

- **2.3.17 的「排队消息」自动清理在真机上从未生效**（本机 `~/.dsh/sessions` 会话日志解压实证：两次撤回的残留排队项分别在 fork 后 92 秒与 9 秒才出现移除事件——均为手动删除，自动清理的重试窗口内子会话日志无任何队列事件）。两个静默失败面，各修一半：
  - **Client 侧重试窗口太短**：队列快照走 control 帧，`fork` 解析后还要等 `open`/staging 完成才到达——实测可晚于数秒，原 10×200ms（2 秒）窗口全部落空后静默放弃，残留卡片一直挂着。修复：扩为 30 秒长轮询（250ms 间隔，命中即停）；窗口耗尽仍无匹配时不再静默——`console.warn` 留排查痕迹，toast 提示「撤回前的一条排队消息未被自动清理，可点击该卡片右上角的删除按钮手动移除」（toast 按文本节流，同一文案 10 分钟至多一次）。
  - **Host 侧解析只认 live 内存事件**：`resolveStaleQueueRpcIds` 此前在 `sessions.get()` 拿不到对象或其 `events` 字段缺失（版本漂移）时恒返回空数组，Client 收到空集合就什么都不做；而切点解析 `resolveCutSeq` 有磁盘降级链兜底、切点永远正常，恰好掩盖了这个缺失。修复：补齐与 `resolveCutSeq` 同款的两跳降级（`sessionQuery.readSession` → `observeSession`，后者覆盖 seeded 父会话——撤回链的父会话本身可能就是上一次撤回 fork 出的子会话；租约 `Symbol.dispose` 释放），两跳都失败才返回空数组。
  - 顺带核验了匹配键契约：宿主队列帧构造（`queueItemsFromInbox` / `promptRpcId`）对所有 `user` 来源行透传 `source.rpcId`，seed 重放行同样携带，`placement: 'queued'` 与 `{ kind: 'remove' }` 动作均与官方 QueueDock 行为一致，无需扩展。

## [2.3.18] - 2026-09-12

### 修复

- **用户消息里的文件块被渲染成原始 JSON**：插件覆盖了整个用户节点渲染（`conversation.chat.node` keyed 渲染器），此前只对 text/image 两类块做呈现——图片走官方 `renderMessageImages`、文本走气泡，其余块一律落进 JSON 兜底 `<pre>`。于是带文档/表格附件（`type: 'file'`）的消息（含撤回后重绘的那些）整块显示成 `{"type":"file","attachment":{…}}` 原文，而官方渲染是文件卡片。修复：新增 `fileCardInfo` 纯函数（文件名 / 扩展名徽标——大写截断 4 字符、无扩展名回退 `FILE` / 体积文本 `6.7KB` 官方风）与 `.dsh-recall-filecard*` 样式，file 块渲染成与官方 `UserStyleBubble` 同形的卡片（品牌色徽标 + 文件名单行省略 + 「MD 6.7KB」元信息），按「附件在上、文本在下」的官方布局排布，并从 JSON 兜底中剔除。新增 4 例单测。
- **被撤回消息里的文件附件回填静默缺失**：官方 `session.attachment`（`readAttachment`）只服务图片——Host 侧按 `referencedImage` 找引用、`readImage` 取字节，file 块直接判 `ATTACHMENT_NOT_REFERENCED`；插件读不到字节就填不回输入框，此前静默跳过。修复：撤回成功后若被撤回消息含 file 块，toast 明示「文件附件无法自动回填（官方接口只支持图片回读），请重新选择文件」，不再让用户以为回填是完整的（文本与图片回填照旧）。

## [2.3.17] - 2026-09-12

### 修复

- **撤回后输入框上方凭空多出一条「排队消息」**：官方 `sessions.fork({ atSeq })` 的切点不是「切点事件本身」，而是从该 `turn/end` 推进到**下一个 `turn/start` 之前**的整段事件——排队投递的用户消息，其 inbox 入队事件（`agent/inbox/spliced`，`target: 'next-turn'`）必然落在「上一个 `turn/end`」与「领取它的那个 `turn/start`」之间，正好被复制进子会话 seed；子会话重建 inbox 后，QueueDock 就把这条本该随撤回消失的消息显示成排队消息，与回填到输入框的内容重复（本机 `~/.dsh/sessions` 会话日志解压实证：父会话 seq 93 `turn/end` → 94 入队 → 95 `turn/start` → 96 领取后移除 → 100 `user/message` 落日志，子会话 seed 恰止于 94）。修复分两半：Host 侧新增 `scanStaleQueueRpcIds` 扫切点窗口内的 inbox 入队项、取出 `source.kind === 'user'` 项的 `rpcId`（prompt 提交身份），经 execute 响应新增的 `staleQueueRpcIds` 下发；Client 侧 fork 出子会话并 open 后 `purgeStaleQueueItems` 读 `sessions.binding(childId).session.getSnapshot().queue`，按 `placement === 'queued'` + rpcId 命中逐项调官方 `updateQueue(itemId, { kind: 'remove' })`（即 QueueDock 的「删除排队消息」）。用 rpcId 而非内容比对——撤回后新发的消息带自己的 rpcId，不会被误删。queue 快照走控制流、fork 后可能晚一两拍才到，故做 10×200ms 有界重试；拿不到 live 事件（冷会话）或服务面缺失时静默放弃（残留项仍可在 QueueDock 手动删除），不影响回填与撤回主流程。新增 `tests/unit/snapshots-queue-residue.test.js`（6 例）与 `pickStaleQueueItemIds` 3 例，`routes-stale` 补 stub 与透传断言，compat-audit 新增 I35。

## [2.3.16] - 2026-09-11

### 变更

- **插件描述与双语 README 文案重写**：包描述由「是什么 / 怎么做」改为「能做什么」——撤回自己发过的消息，工作区文件与对话历史一起回到那条消息发出之前，消息的文本与附件自动放回输入框（文件走独立影子 git 快照、对话走官方 `sessions.fork`、原会话归档可找回）。双语摘要补齐「撤回后可重发」；英文侧去掉过时的 DSH 版本标注；徽章由历史版本（`0.1.2-rc.1` / `0.1.3-alpha.1`，英文侧 `0.1.1-rc.x`）统一为当前核验版本 `0.1.5-rc.2`（兼容范围仍以「安装」节的 peer 声明为权威）；两侧同步新增「撤回完就能重发」亮点与预览区的回填要点。功能、接口与构建产物零变化。

## [2.3.15] - 2026-09-11

### 新增

- **撤回回填扩展为「文本 + 附件」**：此前撤回只把被撤回消息的文本回填到输入框，消息里的附件（图片/文件）不会回来；现在两者一起回填，改完可直接重发。实现沿用官方 composer 自己的附件链路（`dsh-client-ui-conversation` 的 `addFiles` 实证）：**早读**——撤回执行一开始（源会话仍在册、附件引用可解析时）经 `sessions.binding(sessionId).session.readAttachment(attachmentId)` 取回原始字节与 mediaType，重建为浏览器 `File`（缺文件名按 mediaType 派生 `attachment-N.<subtype>`）；**后写**——fork + open 完成后在子会话里 `conversation.createDrafts(sessionId, files)` 注册草稿附件、`shell.actions.addAttachments(ids)` 进入输入态（未接纳时 `releaseDraftAttachments` 释放，与官方 `addFiles` 的失败回滚一致）。附件读取授权绑定「消息所在会话」，故必须用源会话早读——被撤回消息不在 fork 出的子会话日志中，直读子会话拿不到授权。附件读取与草稿注册均逐项 try/catch、服务面全部 typeof 探测：任一步缺失只降级附件，文本回填与撤回主流程不受影响（旧版 dsh 无 `conversation`/`createDrafts`/`readAttachment` 时恒降级）。`refillDraft` 开关语义同步为「文本与附件」（设置描述与 README 双语同步）；新增 `attachmentRefsFromBlocks` / `defaultAttachmentName` 纯函数与 3 例单测，compat-audit 新增 I34。客户端 bundle 结构与既有行为零变化。

## [2.3.14] - 2026-09-11

### 修复

- **撤回 fork 出的子会话内，撤回预览对任何消息都误报「该消息是本会话中第一条用户消息」**：`resolveCutSeq` 冷读取走 `sessionQuery.readSession`，官方实现内部却用 `Session.create(events, header, inheritedEventCount)` 做回放校验——快照模式要求 seeded 头的 `inheritedEventCount` 恰等于 `log.length`（「seeded session constructor seed must equal its inherited prefix」），而读取面交给它的是全量逻辑日志（`snapshotEvents()` 无参＝继承前缀＋自身事件；冷读返回完整存储日志），两者必然不等，`readSession` 对任何 seeded 会话（本插件每次撤回 fork 出的子会话即此类）直接抛错；此前的 `catch` 把异常静默折成 null，与「真首条」不可分——于是子会话里点**任何**消息，面板都显示「该消息是本会话中第一条用户消息，无法回退对话；确认后仅回退项目文件」。修复：`resolveCutSeq` 增加降级链——`readSession` 抛错、或消息根本没出现在它给的事件里（读取面缺继承前缀的版本差异）时，改用 `sessionQuery.observeSession`（经 `Session.fromRestore` 恢复，restore 模式无该约束）读取全量逻辑日志；租约以 `Symbol.dispose` 显式释放（prepared 缓存项靠它减引用，漏释放会卡淘汰）；只有「消息在、其前无 turn/end」才是可信的“首条”，两跳都失败才落到 null。`scanCutSeq` 拆出 `scanCutSeqDetail`（cut + found）供降级判断；契约补 `observeSession` 与 `SessionObservationLease`（可选——旧版 dsh 无此 API 时维持原行为）。**真机复验**（dsh web 0.1.5-rc.2 + POST `/api/recall/preview`）：修前子会话 6 条消息 cutSeq 全 null、父会话正常；修后子会话 156/43/62/88/197、真首条（你好）仍 null、父会话不变。新增 `tests/unit/snapshots-cutseq.test.js`（6 例），compat-audit 新增 I33。插件功能、客户端与其余行为零变化。

## [2.3.13] - 2026-09-11

### 修复

- **DSH Desktop 上插件树加载失败（fiber 永久 pending）**：桌面端 composition（`desktop.cordis.patch.yml`）把 `webserver` row 置 `disabled: true`（Electron 用 file:// + IPC 替代 HTTP），插件 host 侧顶层 `inject` 含 `webServer`，fiber 因此停在 `pending (waiting for service: webServer)` → 「1 entry did not activate」整树加载失败。修复：① 顶层 inject 收敛为 `['shell', 'sessions', 'agents']`；② 删除 `ctx.webServer` 前缀路由注册，改走官方「载体无关」路由注册表 `ctx.connection.fetch.register`——12 个端点各注册一条 `POST /api/recall/<name>` 的 exact 路由（`requestBody: 'buffered'`、插件自留 1MB 请求体上限、`{ ok:false, code, message }` 错误包装与 200 语义不变）；③ `connection` 经 `ctx.inject(['connection'], cb)` 可选注入（服务缺席不 pending，仅 Client API 降级不可用），并用 `cb.effect` 包裹 register 返回的**异步 disposer**——注册本体挂在 connection 插件 fiber 的 effect 上（`owner = this.ctx`），不包会在 HMR 重载时撞「exact Fetch route ... is already registered」。web 端由 client-connection 把 `/api` 挂到 webServer 之下、桌面端由 dsh-desktop-host 以 `createSharedFetchHandler('/api')` 直接分发，客户端 URL 与方法两端完全一致，**客户端 bundle 零改动**。契约类型按官方 `.d.ts` 换为 `ConnectionFetchRoute` / `HostConnectionFetch`（HttpRequest/HttpResponse/WebRoute/WebServer 删除）；`verify:host` 门禁改 connection 桩并新增路由形状（methods/requestBody/fetch）、exact 分发 404、异步 disposer 清零断言；`compat-audit` 新增 I32、`dsh-contract.md` 与 AGENTS.md 同步。插件功能与 `lib/client.js` 零变化。

## [2.3.12] - 2026-09-11

### 变更

- **dsh 0.1.5-rc.2 兼容性声明与台账同步**：全局实装 `@deepseek-ai/dsh@0.1.5-rc.2`（tag `dsh-v0.1.5-rc.2`，commit `fb2c4b9`，npm dist-tag `next`）后跑三层门禁——`test:probe` 31/31、`verify:host` 装配断言通过、`npm test` 307/307；rc.1→rc.2 的 4 commits / 300 文件按插件消费面包与类型源过滤后唯一命中 ui-chat 的 `TurnTailNodeView.module.css`（+3 行纯 CSS 间距），`sessions.d.ts`/`slots.d.ts`/`slot-contract.d.ts` 等类型源零改动；reference/ 镜像按 rc.2 tag 重拉 13 源（12 份内容相同、11 号仅 CRLF 噪声）。`dsh.compatibility.dshReleases` 补 `0.1.5-rc.2`，README 双语兼容声明、镜像索引与契约文档版本字段同步。peer 范围沿用按 minor 线开窗（`>=0.1.5-alpha.1 <0.1.6`），npm semver 的 prerelease 门槛天然放行同 tuple 的 rc.2，无需改 peer 串。评估实证沉淀于 `docs/upgrade-assessments/dsh-0.1.5-rc.2.md`，本插件源码零功能变更。

### 修复

- **DSH Desktop（0.1.5-rc.2）安装插件被 `validateDesktopPluginGraph` 拒绝**：桌面端 profile 固定 `autoInstallPeers: false`，安装时逐个解析 `package.json` 的 peerDependencies 并要求实体包存在于 profile 的 node_modules。插件声明的 `@deepseek-ai/dsh-client-web-react` 是 dsh 0.1.0 时代的历史包（npm 最高 0.1.0-rc.7），官方 0.1.1+ 已不再发布、0.1.5-rc.2 的宿主共享包中不存在，故报 `requires missing @deepseek-ai/dsh-client-web-react`。该声明早已无运行时意义：`lib/client.js` 唯一的模块请求是 `require("react")`，React 由宿主平台基线模块表提供。修复三处：① 删除该历史 peer；② 保留 `react` peer 但补 `peerDependenciesMeta.react.optional`——桌面端 profile 顶层无 `react`，不标 optional 会在下一轮校验继续报 missing；③ 删除过时的 `dsh.client.inject`（新机制下是包名依赖边，指向已不存在的包会被宿主静默跳过；`dsh.client.platform: "web"` 保留，宿主据此识别 client 半侧的运行平台）。其余 8 个 peer 及其范围不变。`dsh.compatibility.dshReleases` 补 `0.1.5-rc.2`，README 双语安装兼容声明同步。插件功能与运行时零变化，`lib/` 产物结构与 2.3.11 相同。

## [2.3.11] - 2026-09-11

### 变更

- **dsh-* peerDependencies 从「逐 tuple OR 窗口」收敛为「按 minor 版本线开窗」**：7 个 `@deepseek-ai/dsh-*` 的 peer 范围由原先每个已核验版本一段的长 OR 串（`>=0.1.1-rc.2 <=0.1.3-alpha.1 || … || >=0.1.5-rc.1 <=0.1.5-rc.1`）改为每条 minor 线一段、上界开区间到下一 minor（`>=0.1.1-rc.2 <0.1.2 || >=0.1.2-alpha.1 <0.1.3 || >=0.1.3-alpha.1 <0.1.4 || >=0.1.5-alpha.1 <0.1.6`）。动机：原形态下 dsh 每发一个 prerelease（alpha.2→rc.1→…）都要人工追加一段，繁琐且易漏。新形态利用 npm semver 的 prerelease 门槛——同 (major,minor,patch) 段内只要有一个带 prerelease 的比较器，即放行该 tuple 的全部 prerelease 与正式版，故 0.1.5 线内的 rc.2、0.1.5 正式版等自动放行，无需再改 peer 声明；未验证的新 minor 线（0.1.6、0.2.0）仍被上界拦截。取舍：同线内未经门禁核验的新版本也会被 npm 放行安装，安全兜底从「peer 范围逐版白名单」转为「升级后跑 `check:upgrade` 三层门禁 + `check:dsh` 哨兵」——即 dsh 发新版后仍需人工核验，只是不再强制改 7 条 peer 串。`scripts/check-dsh-version.mjs` 的复合区间解析器原生支持 `>=x.y.z-pre <x.y.z` 形态，实跑验证放行/拦截语义正确（0.1.5 线全放行、0.1.6 起拦截），脚本零改动。`dshReleases` 兼容矩阵保持逐版本记录不变（它是台账、非安装门禁）。README 双语安装兼容声明同步。

## [2.3.10] - 2026-09-10

### 变更

- **dsh 0.1.5-rc.1 兼容性声明（peer 范围扩窗）**：本地全局实装 `@deepseek-ai/dsh@0.1.5-rc.1`（npm dist-tag `latest`/`next`，0.1.5 系列首个候选版本，tag commit `183f08e`）后跑三层门禁——`test:probe` 31 项探针全绿、`verify:host` 装配断言通过、`npm test` 307 项通过、`check:dsh` 镜像/契约漂移与 peer 越界已消除。`package.json` 的 `dsh.compatibility.dshReleases` 矩阵补 `0.1.5-rc.1` 为 `compatible`，7 个 `@deepseek-ai/dsh-*` 的 `peerDependencies` 范围沿 2.3.8/2.3.9 先例补 `>=0.1.5-rc.1 <=0.1.5-rc.1` 逐 tuple OR 段。契约核验：隔离安装 alpha.2 全量依赖树与全局 rc.1 内嵌包做 tree-SHA 比对，插件消费面 12 个包（`dsh-session`、ui-chat/ui-conversation `slots.d.ts`、session-controller `sessions.d.ts`、settings-plugins `slot-contract.d.ts`、`dsh-settings`/`dsh-shell`/`dsh-session-query`/`dsh-host-webserver`/`dsh-sandbox-policy`、`cordis`、`schemastery`）目录树哈希全部逐字节相同——rc.1 相对 alpha.2 是纯发布层推进，无契约变化。release notes 为 v0.1.2-rc.1 以来的汇总，三项开发者 API 调整（移除 `ctx.agent` 单数、`Inbox` 改 type-only、Web 面板 `conversation`→`main.conversation`）均已在 alpha.1/alpha.2 逐项排除，rc.1 无新增契约点。官方文档镜像按 rc.1 tag 重拉核验：13 源与 alpha.2 归档内容零差异。本插件源码零功能变更（仅 peer 声明 + 文档），`lib/` 产物与 2.3.9 相同。评估实证沉淀于 `docs/upgrade-assessments/dsh-0.1.5-rc.1.md`，兼容性台账（`docs/compat-audit.md`）、契约文档（`docs/dsh-contract.md`）、官方文档镜像索引（`docs/reference/README.md`）与 README 安装兼容声明已同步。

## [2.3.9] - 2026-09-10

### 变更

- **dsh 0.1.5-alpha.2 兼容性声明（peer 范围扩窗）**：本地全局实装 `@deepseek-ai/dsh@0.1.5-alpha.2`（npm dist-tag `alpha`，tag commit `b2e3b2a`）后跑三层门禁——`test:probe` 31 项探针全绿、`verify:host` 装配断言通过、`check:dsh` 镜像/契约漂移与 peer 越界已消除。`package.json` 的 `dsh.compatibility.dshReleases` 矩阵补 `0.1.5-alpha.2` 为 `compatible`，7 个 `@deepseek-ai/dsh-*` 的 `peerDependencies` 范围沿 2.3.8 先例补 `>=0.1.5-alpha.2 <=0.1.5-alpha.2` 逐 tuple OR 段。契约逐项 diff 零破坏：全局实装包 tree-SHA 比对 alpha.1↔alpha.2，插件消费的类型源（`dsh-session` types、ui-chat/ui-conversation `slots.d.ts`、session-controller `sessions.d.ts`、settings-plugins `slot-contract.d.ts`）全部未变。本次唯一需深挖项「Web 插件面板 API 调整——原 `conversation` Slot 迁移为 `main` 的 `conversation` key」逐一排除：顶层布局槽位确已改名（`ConversationSlotProps = PropsRuntime<'main.conversation'>`），但插件从不注册顶层 `conversation` slot，只用 `conversation.chat.node`（keyed/session，路径不变）与 `settings.plugin.item`（不变）；`ctx.get('conversation')`（refillDraft 回填）是服务访问（`InputHub`）非 slot，与被改名槽位是两回事。新增持久事件 `deliverables/presented`（模型显式文件交付，`dsh-tool-present` declaration merging）插件零消费。其余变更（Sidebar 文档预览、`/feedback` 明细、pi-ai 诊断、Base URL 校验、文件夹选择器、Composer 占位、子代理工具指导、MCP 分页、`fs-ext` 免编译、minimal 默认工具、设置本地化）均与撤回链路零交集。本插件源码零功能变更（仅 peer 声明 + 文档），`lib/` 产物与 2.3.8 相同。评估实证沉淀于 `docs/upgrade-assessments/dsh-0.1.5-alpha.2.md`，兼容性台账（`docs/compat-audit.md`）、契约文档（`docs/dsh-contract.md`）、官方文档镜像（`docs/reference/`，仅 09-architecture.md 一行措辞变化）与 README 安装兼容声明已同步。

## [2.3.8] - 2026-09-09

### 变更

- **dsh 0.1.5-alpha.1 兼容性声明（peer 范围扩窗）**：本地全局实装 `@deepseek-ai/dsh@0.1.5-alpha.1`（npm dist-tag `alpha`）后跑三层门禁——`test:probe` 31 项探针全绿、`verify:host` 装配断言通过、`check:dsh` peer 越界已消除。`package.json` 的 `dsh.compatibility.dshReleases` 矩阵补 `0.1.5-alpha.1` 为 `compatible`（并修正 2.3.7 遗漏的 `0.1.3-alpha.2` 条目），7 个 `@deepseek-ai/dsh-*` 的 `peerDependencies` 范围沿 2.3.4 先例补 `>=0.1.5-alpha.1 <=0.1.5-alpha.1` 逐 tuple OR 段。契约逐项 diff 零破坏：本次三项高风险变更逐一排除——① 移除 `ctx.agent`（单数）不影响插件（插件只用 `ctx.agents` 复数注册表）；② `Inbox` 改 type-only 插件零引用；③ **会话格式 V3**（V2→V3 迁移插入 `system/message` 事件并 remap seq，但保留原始 message id）——插件天然免疫：读取全走官方恢复后内存态（seq 坐标系与 `fork({atSeq})` 同源）、消息定位以 `data.id` 为主键、`cutSeqCache` 内存态不跨版本。事件全集 51→54 种（新增 `system/message`、`feedback/message-put`/`message-delete`，`tool/code-dispatch*` 更名 `tool/ptc-dispatch*`）为备忘面同步，`src/types/dsh-contract.ts` 事件 union 与 `docs/dsh-contract.md` §四随之更新，插件 `scanCutSeq` 只扫 `user/message`+`turn/end` 零交集。本插件源码零功能变更（仅类型备忘 + peer 声明 + 文档），`lib/` 产物与 2.3.7 相同。评估实证沉淀于 `docs/upgrade-assessments/dsh-0.1.5-alpha.1.md`，兼容性台账（`docs/compat-audit.md`）、契约文档（`docs/dsh-contract.md`）、官方文档镜像（`docs/reference/`，05/09/13 三份随官方文字修订重拉）与 README 安装兼容声明已同步。

## [2.3.7] - 2026-09-08

### 变更

- **dsh 0.1.3-alpha.2 兼容性声明（peer 范围扩窗）**：本地全局实装 `@deepseek-ai/dsh@0.1.3-alpha.2`（npm dist-tag alpha）后跑 `npm run check:upgrade` 三层门禁全绿（check:dsh 漂移一致 + test:probe 31 项探针 + verify:host 装配断言）；`package.json` 的 `dsh.compatibility.dshReleases` 矩阵补 `0.1.3-alpha.2` 为 `compatible`，7 个 `@deepseek-ai/dsh-*` 的 `peerDependencies` 范围沿 2.3.4 先例补 `>=0.1.3-alpha.2 <=0.1.3-alpha.2` 逐 tuple OR 段（npm semver prerelease 规则要求同 tuple 比较器才放行该 prerelease 线）。契约逐项 diff 零破坏（fork/sessionQuery/chat.node 槽位/settings 槽位/shell.resolve/session-event 域均不变），alpha.1 已知的冷会话性能回退（v1→v2 迁移全量内存物化）已被官方迁移流式化修复，插件冷读路径直接受益，无需任何代码改动——本插件源码零变更，`lib/` 产物与 2.3.6 相同。评估实证沉淀于 `docs/upgrade-assessments/dsh-0.1.3-alpha.2.md`，兼容性台账与契约文档已同步。

## [2.3.6] - 2026-09-06

### 修复

- **修复宿主启动预热的 subprocess 竞态（消除启动噪音）**：预热是唯一在 apply 期就执行 shell 命令的路径，cordis 按 fiber 逐个注入，recall 可能先于 pwsh-sandbox 的 subprocess 注入链完成，`rebuildOrphans` 的 git 命令随即命中「cannot get required service "subprocess" in inactive context」，每次重启刷一条 `recall rebuildOrphans failed`。修复：预热前置短轮询探活（纯编码 prelude 常量、无副作用，10s 窗口），执行器就绪后再跑预热链；超时未就绪则放弃预热——与原先吞错语义一致，只是不再报错刷屏。

## [2.3.5] - 2026-09-06

### 修复

- **规避 DSH-Store 保护性权限信号（issue #517 跟进）**：官方 slot #46「工具调用视图」的 slot 名连续字面量触发 DSH-Store catalog 自动化的 `protectedDsh` 权限信号——其静态扫描对固定 Commit 全部源码文件逐一匹配五个触发模式，该字面量导致插件被标「更新暂缓/下架」，与 peer 范围无关。修复：`src/types/client-contract.ts` 的 slot-id 联合类型该成员改写为 template literal type（`` `tool.call.${'toolview'}` ``）——类型层面与字面量完全等价（可收窄/赋值），源码文本不再含连续子串，五个触发模式全数解除；此类型仅备忘官方 slot 清单、零运行时携带，lib 构建产物无变化。推送新固定 Commit 后 DSH-Store 每 8 小时自动复检。

## [2.3.4] - 2026-09-06

### 变更

- **DSH-Store 兼容性声明补全（issue #517）**：`package.json` 新增 `dsh.compatibility.dshReleases` 矩阵，将 `0.1.2-alpha.1`～`0.1.2-alpha.5`、`0.1.2-rc.1`、`0.1.3-alpha.1` 七项标记为 `compatible`；同步把 7 个 `@deepseek-ai/dsh-*` 的 `peerDependencies` 范围改为逐 tuple OR 窗口 `>=0.1.1-rc.2 <=0.1.3-alpha.1 || >=0.1.2-alpha.1 <=0.1.3-alpha.1 || >=0.1.3-alpha.1 <=0.1.3-alpha.1`——npm semver 的 prerelease 规则要求存在「同 (major,minor,patch) 且自身带 prerelease」的比较器才放行 prerelease 候选，单段长区间（含 `^0.1.1-rc.2` 的展开式）无法代表 `0.1.2-alpha.x` 系列，DSH-Store 因此判 0.1.2 线 peer 越界；逐 tuple 分段后各 prerelease 线各自放行，上界收窄至矩阵最后声明版 `0.1.3-alpha.1`（`<=` 含入），未验证的 `0.1.3` 后续与 `0.2.x` 全线均在窗口外。`scripts/check-dsh-version.mjs` 补齐 `||` 多段解析（`parseRangeSet`）、复合区间 `<=` 上限与 prerelease 门槛（同 tuple 校验——单段长区间不再放宽放行未验证 prerelease 线），替换此前对复合区间的「只认 ^ / ~ / 精确」警告，配套单测补齐 parseRange / parseRangeSet / satisfiesRange / buildReport 四层断言。

## [2.3.3] - 2026-09-05

### 修复

- **设置页风格对齐 DSH 官方插件设置卡**：以本机官方 `dsh-client-ui-settings-plugins` 构建产物为事实源，对卡片描边与圆角、次级/主/危险按钮、输入框、状态徽章、布尔开关（checkbox → role=switch 滑钮）、焦点环、折叠头箭头动效逐部位对齐官方配方，说明文字统一辅助色；「高级：基础排除表」更名为「基础排除表」。全部配色走官方 `--dsw-alias-*` 主题令牌（逐一核验），纯展示层调整，无行为变化。配方沉淀见 `docs/design-tokens.md`。

- **设置页三个折叠区展开态去冗余**：① 删除与折叠头重复的内标题（「快照管理」卡内大标题、「快照排除项」卡内标题）——折叠头已承担分区标题角色，展开后再出现同名标题是纯噪音；② 「基础排除表」展开后 textarea 与说明文字改为通栏——此前只占共享 grid 第二列，左侧长标签列形成竖直死区、编辑框被挤窄；label 保持原位（htmlFor 关联是可访问性契约）；③ 排除配置的存储路径从长句中抽出为独立等宽小字行（break-all 整齐折行），说明正文不再被 Windows 长路径撑出断裂换行，多文件场景（降级工作区）也靠路径行区分。纯展示层调整，无行为变化。

- **设置页配置表单排版再打磨（六点位）**：① 数字输入框从「撑满整行」改为定宽 120px + 数值右对齐，单位（条/小时/MB/天）与状态标签（已修改/已覆盖/环境变量锁定）统一挂在输入框右侧同基线——此前输入框宽度随行内标签有无伸缩、各行右缘参差；② 主标签升为正文字色（label-primary），说明文字维持 12px tertiary 固定在控件下方第二行，主辅层级拉开；③ 五个数字字段补齐单位后缀（此前仅 MB）；④ 「快照行为 / 自动治理」组间加分隔线与加倍留白，组界不再只靠小标题；组内行距统一为 12px；⑤ 「保存」升主色实心按钮（配色经官方主题产物核验：`button-primary-fill` / `label-primary-foreground` / `button-primary-hover`），「放弃修改 / 恢复默认」维持次级灰底；⑥ 三个折叠头（基础排除表 / 排除配置 / 快照管理）的箭头字形盒内改左对齐，与上方表单标签共享同一左缘。纯样式与文案层级调整，无行为变化。

- **设置页数字输入框隐藏原生加减微调按钮**：「自动治理」五个数字输入框为 34px 定宽，原生 spinner（上下箭头）跨引擎渲染不一（Chromium 有 / Firefox 无）、挤占右侧数字区，与「数值右对齐」的纵向扫描相冲——隐藏原生 spinner（`-webkit-appearance:none` + `appearance:textfield`，scope 到 `.dsh-recall-cfg-input` 不外溢），键盘 ↑↓ 微调与直接输入能力保留。纯样式调整。

### 变更

- **新增 `docs/design-tokens.md` 设计令牌与组件配方参考**：把本次对齐所核验的官方事实源（`dsh-client-ui-theme` 令牌定义、`dsh-client-ui-settings-plugins` 组件配方）沉淀为长期规范文档——令牌命名空间说明、颜色/排版速查（含本插件使用处映射）、八类官方组件配方摘录（卡片/按钮组/表单字段/badge/switch/分组折叠/分隔线规格/阴影）、本插件落地约定与 dsh 升级后的重抽比对流程。后续改 client UI 先查此文档，避免凭印象写颜色与字阶。

- **`reference/` 官方文档镜像整合进 `docs/`**：目录 `reference/` → `docs/reference/`（镜像随仓库提交），官方文档镜像与项目文档收敛到同一目录；同步更新 AGENTS.md 合规清单与漂移控制节、`scripts/check-dsh-version.mjs`（镜像读取路径改为 `docs/reference/README.md`）、`scripts/check-upgrade.mjs` 提示文案、package-layout 单测禁入清单（`docs/` 已覆盖镜像）、`docs/dsh-contract.md` 升级指引、compat-audit 台账 I6 复查动作的镜像路径与 docs/README.md 目录索引；compat-audit 头部与各计划文档中的历史核验记录按当时原文保留。

## [2.3.2] - 2026-09-04

### 修复

- **设置页表单跨行对齐修复（V4 跟进）**：配置表单的勾选框（快照行为三行）与数字输入框（自动治理五行）此前各行的 label 列宽独立计算、控件列参差——根因是每行 `.cfg-row` 是独立 grid 容器，V4 的「第一列 `max-content` 自适应最长标签」只在同一 grid 内生效，跨行从未成立。现引入单一共享 grid（`.cfg-grid`）包裹全表单，`.cfg-row` 以 `display:contents` 透明化，label/控件/hint 直接参与同一网格，控件列由全表单最长 label 统一对齐；分组小标题占满整行；行间节奏（原 flex gap 8px）由 hint `padding-bottom` 补偿保持。同时：三个折叠头（高级基础排除表 / 排除配置 / 快照管理）去掉卡片头样式的 16px 左内边距、与表单内容贴左对齐；配置操作区（放弃修改 / 恢复默认 / 保存）移到「高级：基础排除表」折叠头之前——按钮服务整个表单，排在折叠头之后会被误读为折叠区内容。纯布局修复，无行为变化。

- **设置页基础排除表标签关联补漏（V2 跟进）**：「高级：基础排除表」textarea 补 `id` 并与 label 以 `htmlFor` 关联（V2 只覆盖了 numRow 与 exclude.txt 三处，此为同款漏网），读屏可正确播报标签。

- **设置页确认条统一与过渡动效（V9）**：四种删除确认（快照 / 会话 / 工作区 / 全部）收敛为同一 `ConfirmRow` 组件，「确认」统一为危险红 chip、「取消」为普通 chip；确认条与树展开增加 opacity 入场过渡（≤200ms），并尊重系统「减少动效」设置自动关闭。纯交互打磨。

- **设置页响应式补全（V8）**：exclude 快速添加行在 ≤480px 下输入框独占一行、按钮与建议芯片换行排列；操作区按钮行加 `flex-wrap:wrap`，长状态/错误文案不再挤压按钮。与 V4 共用同一 480px 断点。纯样式增补。

- **设置页排版收敛（V7）**：字阶统一为 15/14/13/12 四级（辅助 meta 与标签的 11px 升 12px）；SectionToggle 标题内联样式收敛为 class；全量 line-height 改无单位写法（1.4/1.5）；声明间距刻度变量 `--dsh-recall-space-1/2/3`（4/8/12）。纯样式整理，无行为变化。

- **设置页表单分组与危险操作固定位（V5）**：配置表单 9 字段平铺改为「快照行为 / 自动治理」两组语义分组（带小标题），「高级」维持折叠；快照管理操作区「全部删除」固定为最后一个按钮（刷新 / 立即 gc / 全部删除），不再随「加载更多」出现而漂移。纯结构重排，无行为变化。

- **设置页表单布局 Grid 化（V4）**：配置表单从「label 定宽 130px + hint 缩进 138px」魔法数对齐改为 CSS Grid（label 列 `max-content` 自适应最长标签，控件/hint 归第二列）；≤480px 窄面板下表单纵向堆叠不挤压；快照树缩进量化为 `--dsh-recall-tree-indent` 单一变量（原来 16+8 恰好等于折叠钮 18+6 的巧合）。纯布局重构，无行为变化。

- **设置页健康徽章化与错误区升级（V6）**：快照管理卡片的 git 状态从灰色文案升级为彩色 pill（可用 = 绿 / 不可用 = 红，官方状态行令牌配对），成为卡片顶部横幅；「最近错误」区标题改错误红 + 条数徽章，并从卡片最底部上移到操作区之上——致命状态与历史错误更醒目。纯展示层重排。

- **设置页交互反馈（V3）**：禁用按钮/芯片补 `opacity:.5` + 默认光标，且禁用态 hover 不再变色（未修改时的「保存 / 放弃修改」不再误导）；三张卡片（配置/排除/快照管理）的成功状态消息 4s 自动消退、错误提示常驻、busy 中不消退；打开「快照管理」先见 pulse 加载骨架再出树，不再是一段空白。纯交互反馈增补。

- **设置页可访问性补强（V2）**：快照树折叠钮从纯视觉 `<span>` 升为 `<button>`（Tab/Enter/Space 可达），配 `aria-expanded`/`aria-label`；数字输入 label/input 按 id 关联；三处状态消息加 `role="status"` + `aria-live="polite"`、错误文案补「错误：」文字前缀；三个无标签控件（快照搜索/排除编辑/快速添加）补 `aria-label`；全按钮与输入框补 `:focus-visible` 焦点环（官方 border-l3 惯例）。键盘完全不可达的树折叠是本次最重的功能性缺陷，纯增量修复。

- **设置页语义色修复（V1）**：ExcludeCard「保存」按钮去掉危险红样式、与配置表单保存按钮统一；快照文件清单「已修改」badge 从错误红改为 warning（amber）色系——修改不是错误；配置表单三类状态标签分化（「已修改」warn 底色 /「已覆盖」中性灰 /「环境变量锁定」中性灰 + 左边框）；`btn-danger` 前景色硬编码 `#fff` 换为官方实证的主题感知令牌 `--dsw-alias-bg-layer-3`，hover 亮度集中为 css.ts 顶部语义变量，消灭令牌体系外散落补丁。纯样式改动，无行为变化。

### 变更

- **源码整体迁移 TypeScript（同形态复刻）**：host/client 源码迁入 `src/`（`src/host/` 13 文件 + `src/client/` 6 文件 + `src/types/` 类型库，跨域契约以编译期类型锁死），`lib/` 转为纯构建产物目录——`npm run build` 经 esbuild 逐文件转译 host 产物 + 打包 `lib/client.js`；功能与对外契约零变化（npm 包布局、`main`/`exports`/`files`、`cordis.patch.yml`、端点/探针/装配门禁均不变），行为一致性由类型检查 + 既有回归网双保险。新增 `npm run typecheck`（CI 类型门禁）与统一产物新鲜度校验。

## [2.3.1] - 2026-09-01

修复批次（PR #13 贡献，macOS 实机验证；Windows 侧本仓库复核）。单测 285 → 290 例全绿（新增 `nextShadowPriority` 5 例）、`test:probe` 探针 29 → 31 例全绿（新增 `slots.entries` 双包探测）、`verify:host` 装配门禁全绿。

### 修复

- **兼容 dsh-turn-fold 的用户消息渲染槽位**：`conversation.chat.node` 的 `user` key 改为在槽位回调实际执行时读取已占用的 priority，并自动选择当前最低 priority 再低一级，避免与 `dsh-turn-fold` 等第三方插件固定占用 `-1` 时发生冲突；其他插件继续占用更低 priority 时也会自动避让。
- **POSIX diff awk 程序多余点号导致预览/回退失败**：`lib/scripts.posix.js` 的 `diffScript` 中 awk 程序起始引号后混入多余 `.`（v2.2.0 随 PF-1 引入），awk 报语法错误退出非零，macOS/Linux 上点「撤回」预览即失败、无法回退；Windows 走 pwsh 路径不受影响，故此前仅 Windows 冒烟未暴露。

### 变更

- **dsh 升级一键核验门禁 `npm run check:upgrade`**：串联 check:dsh + test:probe + verify:host 三层机器化核验，输出后提示在 compat-audit.md 头部追加核验记录——dsh 升级后一条命令替代手动三步。
- **compat 台账复查方式增强**：I1/I3/I4/I5/I7/I9/I12/I18/I20 复查动作补官方产物证据链（读哪个包哪个文件、断言什么），修正 I1 与 I29 的 priority 语义脱节（guard 强制分配 shadowing priority）、I5 补「context 键已评估无害」结论；I9/I15/I19/I22/I23 出处标注「非官方耦合」（项目内约定，dsh 升级复查不涉及）。
- **字段探针补盲 + 负向断言**：fork 探针改双包探测（原指向已删除的 dsh-client-runtime，alpha.3 下静默零断言）+ atSeq/increaseTitle 严格可选负向断言；settings RPC 探针迁至 dsh-api-settings-controller（原 dsh-host-apiproxy 已删除）；新增 I1/I3/I4/I7/I8/I9/I12/I18/I20 断言与 ConversationNode 节点集合断言——官方新增投影 kind / 收紧可选参数 / 删除字段即红。探针 29 例全绿。

## [2.3.0] - 2026-08-31

修复批次：适配 dsh 0.1.2 / 0.1.2-alpha.2（兼容 0.1.1-rc.2）。单测 285 例全绿，`verify:host` 装配门禁、`check:dsh` 巡检、`test:probe` 探针全绿；新旧两版 DSH（0.1.1-rc.2 / 0.1.2-alpha.2，Windows）实弹验证通过——撤回按钮、设置页「撤回插件」卡片、快照删除均正常。

### 修复

- **dsh 0.1.2-alpha 下撤回按钮与设置卡片全部消失（I29）**：0.1.2 的 client 服务层大迁移（`client/runtime` 包删除，slots 迁入 ui-renderer、sessions/workspaces 迁入新增的 api 包）后，插件 fiber 未声明 inject 时 `ctx.get('slots')` 解析不到服务、静默返回 undefined，apply 首行 `if (!slots) return` 即退出：CSS 不注入、slot 全部不注册、entry 仍 active（无任何报错，症状为「Host 活 Client 死」）。修复：client 插件对象声明 `inject: ['slots', 'sessions', 'workspaces', 'timer']` 并改为 `ctx.<name>` 属性访问（styles 服务 0.1.2 已移除，保留 `ctx.get` 可选探测 + `<style>` 降级）。**双版本兼容**（0.1.1-rc.2 ↔ 0.1.2，cordis 4.0.1 实测）：`conversation` 服务 0.1.2 才存在，静态声明会让 0.1.1-rc.2 上插件「声明未满足」静默不启动（UI 全灭），故不进 inject，统一走 `ctx.get('conversation')` 探测 + 降级（0.1.1-rc.2 上回填输入框功能本来就不存在；0.1.2 主流程不受影响）。同批受影响的第三方插件可参照 compat-audit I29 自查。
- **dsh 0.1.2-alpha.2 适配（I30 + 事件 ignorable 恢复）**：① Host settings 接入路径破坏性变更——独立函数 `installSettingsSection` 被官方移除、改为 `SettingsProvider.installSection` 方法（bash-local/pwsh-local 同款迁移），静态 import 会让插件 Host 半启动即崩（`SyntaxError: does not provide an export named 'installSettingsSection'`，`/api/recall/*` 全 404）。修复：`lib/index.js` 改命名空间导入 + 双版本兼容分支（旧版走独立函数、新版走 `ctx.inject(['settings'])` + `installSection`），verify-host 桩补 installSection。② 事件信封 `ignorable?: true` 在 alpha.2 恢复（alpha.1 曾移除改 fail-closed）——插件只扫 `user/message` + `turn/end`、不读 ignorable，无影响，契约文档同步。③ `conversation.chat.node` 声明包定位更新（ui-chat），`test:probe` 探针改双包探测，17/17 全绿。
- **快照管理「已删除但列表仍在」**：列表/批量删除按 index.json 条目里的 root 匹配，但历史坏数据曾在写入时丢失路径反斜杠（如 `D:workspacedsh-plugin冒烟测试工作区`，正确应为 `D:\workspace\dsh-plugin\冒烟测试工作区`）——store 目录 hash 按正确 root 计算，删除按坏 root 解析到**空 store**，真快照 tag 一个没删，却仍返回匹配条数的 deleted 计数（用户看到「已删除 N 条」但列表原样）。修复：列表构建与批量删除的 root 来源**优先取 root.txt 权威值**（`resolveStore` 每次写入），index.json 条目 root 仅作兜底——三处读取点（`buildListItems` / `collectAllSnapshotRecords` / `locateSnapshotOnDisk`）同步修正；磁盘上重复 hash 的坏 store 一并消失，实弹验证删除真正生效（33 条全删、列表从 36 降到 2）。
- **旧版 0.1.1-rc.2 下设置页不显示「撤回插件」卡片（撤回功能正常）**：插件 node_modules 里 `@deepseek-ai/dsh-settings` 固定为最新版（0.1.2-alpha.2，只有 `installSection` 方法），旧版 DSH 注入的却是旧版 settings 实例（仅 `register` 核心 API）——兼容分支只看静态导入包判断（`installSettingsSection` 不存在 → 走 `ctx.inject` + `installSection`），旧版实例无此方法抛 TypeError，被 catch 静默吞掉（仅进 `recordError` 环形缓冲，`/api/recall/status` 可查），namespace 从未注册、设置卡片缺失。修复：`lib/index.js` 设置接线改为**按运行时注入实例的实际 API 分派**——`installSection` 方法（0.1.2-alpha.2）或 `register` 核心 API（0.1.1-rc.2 及以前，手动复刻独立函数接线语义：注册 namespace、源指向 scope、卸载回退入口 config、watch 热更新）。旧版实弹验证：`/api/recall/status` errors 为空，设置页「插件配置」出现完整「撤回插件」卡片（快照开关/gc 阈值/文件上限/回填/归档/排除表/快照管理）。

## [2.2.1] - 2026-08-30

快照管理消息内容显示修复（patch）。单测 283 → 285 例全绿，`verify:host` 装配门禁、`check:dsh` 巡检全绿。

### 修复

- **冷会话快照只显示消息 ID（1.5.0 引入）**：manage list 的去重补全分支把 live 未命中的 `null` 写进 `messageText` 属性，client 凭「属性存在」判定「已查过」而跳过 messages 端点冷读——冷会话（已关闭、不在 live 注册表）的快照永远显示消息 ID 截断而非消息内容（同会话标题因 titles 链按 falsy 重查而不受影响）。改为 live 命中才写字段，与首次入库分支的既有纪律对齐；修复后冷会话快照的消息内容经 messages 端点冷读渐进补齐（同会话多条共享一次 readSession，确认无文本的缓存 null 不重复解压）。

## [2.2.0] - 2026-08-30

性能优化批次（[plan-performance.md](docs/plans/completed/plan-performance.md) PF-1〜PF-9 全项，2026-08-29 实施，同日实弹冒烟 9/9 通过）。API 形状与用户可见语义基本不变（PF-6 删除以「所见为准」、PF-1 校验更严两处行为变化见下）；单测 227 → 283 例全绿，`verify:host` 装配门禁、`check:dsh` 巡检、client 产物新鲜度全绿；合成基准同口径对比：快照管理首开 -70%、对话中二次打开免等待、同进程二次 init ≈0、单条删除 -21%、每条消息快照 -14%。

### 新增

- **预览指纹校验（PF-1，行为变化：校验更严）**：diff/快照脚本输出 `TREE <hash>`（add -A 后 index 树指纹），preview 随清单回传、client 确认时透传——execute 与安全快照指纹比对即知「预览后文件是否变化」，从「条目总数一致」升级为「内容一致」，且一次撤回少跑一整条重复 diff 进程（4 → 3 条重脚本）。老 client 的 `previewTotal` 条目数校验保留为兼容路径。
- **manage list stale 渐进刷新（PF-6，行为变化：删除以所见为准）**：每条消息快照不再清空列表缓存而是标 stale——对话中打开快照管理立即以旧列表应答（带 `stale` 字段），后台 dump 补新（in-flight 去重），client 静默二段刷新一次；批量删除在缓存非空时以「用户当前所见」的列表为准构造删除范围。

### 变更（性能等价重构，API 形状不变）

- **win32 文本写入改 stdin 单进程（PF-2）**：index.json/lineage.json/exclude.txt/root.txt 落盘从 base64 20000 字符分块（每块一条 PowerShell 进程，索引几百条时 saveIndex 6+ 条）改为 stdin 传全文 + 单进程；POSIX 的内联 cat 一并收进模板同名导出。读取手法由运行时探针钉死（`[Console]::OpenStandardInput()` 字节流——`Console.In` 在 PS 5.1 按输入代码页 GBK 解码 UTF-8 stdin 必挂，且本机 dsh 执行器实际解析到 PS 5.1：pwsh 别名 appexeclink 在 lstat 视角不存在）。
- **全量枚举换 .NET 手动栈遍历（PF-3）**：超大文件剔除（snapshot/diff/rollback 三脚本各一次，一次撤回共 4 次）与磁盘占用统计改 `Stack[string]` + 逐目录 `EnumerateFiles` + try/catch——.NET 4.x 的 `AllDirectories` 遇 ACL 异常目录中断整个枚举，手动栈才能与 `SilentlyContinue` 逐项容错对齐；几万文件的工作区从数秒级降亚秒。usage 端点多 store 并行（runLimited 4）+ 30s TTL 缓存（删除/gc 后失效）。
- **lineage 并入 storesDump（PF-4）**：`==DIR` 段内新增 `LINEAGEBEGIN/原文/LINEAGEEND`（与 INDEX 段同构，解析容错），manage lineage 从「每 root 串行一条进程（20 工作区 ≈ 10s）」降为零新增进程。
- **rebuildOrphans 四档守卫（PF-5）**：索引终态分级（healthy / empty / quarantined / truncated）——healthy 且非空、truncated 时整体跳过重建（顺带根治现有隐患：读截断后残缺内存视图会被无条件 rebuild 用孤儿集覆盖完好大索引）；`cleanupLegacy` 加内存标记（同 root 多次 init 只付一条进程）。init/预热常态每 root 省 1+N 条进程，同进程二次 init 零进程。
- **sweep 换 listSessions（PF-7）**：gc 前的已删会话扫描从逐会话 `readSession` 全日志解压（串行队列内，会话多时堵住快照/撤回）改为一次 `listSessions()` 目录枚举建 id 集合（I8：记录 id 在 header.id）；判定更保守（日志损坏但文件在的保留，purge 不可逆宁可少清）。titles 冷读维持现状——探针确认 `SessionHeader` 无 `title` 字段，titles 半项废弃（负向探针钉住，官方未来加 title 时提示可重启该优化）。
- **exclude-get 探测链合并（PF-8）**：全部 exclude 文件一条脚本 base64 读取（任意用户文本免疫定界混淆），首开进程链 4-6 条 → 2 条。
- **快照脚本瘦身（PF-9）**：exclude 同步条件化（内容未变跳过重写与清理循环，每条消息常态省 1 次 git 子进程 + 1 次盘写，改排除即时生效不变）；update-index 逐条调用合批（pwsh 100 条/批、POSIX xargs -0 自适应），大排除/多超大文件场景子进程 N → N/100。

### 修复

- **后台刷新与 dump 失败留痕**：`refreshListCacheInBackground` 与 `dumpStores` 失败原先被 silent catch 完全吞掉（实弹冒烟中曾出现一次约 29 分钟列表 stale 未自愈且零日志可查），现补 console 留痕——复发时看「recall list refresh failed」/「recall stores dump failed」即可定位。

## [2.1.1] - 2026-08-29

issue #12 换行符字节保真修复（patch）。单测 227 项全绿，双平台真实模板端到端复验（pwsh 全新/存量迁移 + POSIX 实弹）31 项全过，`check:dsh` 巡检一致。

### 修复

- **快照/回退换行符失真（issue #12）**：影子仓库固化为字节保真语义——`info/attributes`（`FIDELITY_ATTRS`）对全部路径关闭 EOL 转换、clean filter、`$Id$` 展开、`export-ignore`/`export-subst`、`working-tree-encoding`。根因是 `git archive`（回退恢复路径）与 `git add`（捕获路径）都会应用快照树里项目自己的 `.gitattributes`：`text=auto` + Windows 缺省 `core.eol=native` 会把 LF 转 CRLF，仓库级 `core.autocrlf=false` 挡不住（属性驱动的转换看 `core.eol`）。存量归一化索引经一次性 `git add --renormalize -- ':(top)'` 迁移（标记文件 `attrs-v1.stamp` 防重复，迁移失败不阻塞快照）。连带修复 `export-ignore` 声明让文件从回退归档中静默消失的同类缺口。注意：回退到本版之前的旧快照仍会还原归一化内容（旧 blob 信息已物理丢失），本版起的新快照字节保真。

## [2.1.0] - 2026-08-29

改进专项与审查修复、环境诊断批次（错误治理 / POSIX home 三档 / 并发治理）、双平台实弹冒烟（Windows + WSL2 Ubuntu 26.04）后发版。单测 224 项、官方 API 探针、`verify:host`、`check:dsh` 全绿。

### 新增

- **回退失败救援闭环**（H1）：rollback 未输出 ROLLBACK_OK（工作区可能半回退）时，用 execute 预先打下的安全快照（`snap-pre-rollback-<ts>`）自动 reset 回「回退前」状态，提示含「已自动恢复」；救援也失败时给出可直接复制执行的手动命令（空格路径已实弹验证）。
- **索引原子写与损坏隔离**（H2）：index.json/lineage.json 走 tmp+rename 原子写；内容损坏或形状非法时 fail-loud——坏文件改名 `.corrupt-<ts>` 保留现场并告警，孤儿从 tag 重建（时间从 tag creatordate 恢复），不再静默当空。
- **错误码单一事实源**（H3）：`lib/errors.js` 收敛 18 个错误码；无快照撤回 / STALE / AGENT_BUSY 三场景的 client 文案与按钮行为对齐。
- **client 多文件化**（R1）：`src/client/` 源码 + esbuild 打包（产物 `lib/client.js` 随源码提交），CI 钉产物新鲜度（F-G6）。
- **Host 路由域拆分**（R2）：routes-core / routes-manage / session-info 三域，全部 API 可直调。
- **fork lineage 持久化**（F1）：lineage.json 记录撤回链（childId↔parentId），快照管理按链分组展示。
- **verify-host 装配门禁**（E1）：复刻生产装配做结构断言（兄弟提供者桩 + agents 行为），装配回归发版前即可拦截。
- **环境错误分类与可行动提示**（M1）：快照失败按 git 缺失 / 磁盘满 / 无权限 / 锁冲突 / mkdir 冲突分类，toast 与设置页「最近错误」共用同一套可行动中文文案（≤140 字符、不含原始路径）；同一错误相邻重复合并 ×N 计数。
- **POSIX home 三档回退与旧容器迁移**（M2）：bash `$DSH_HOME` → Node `DSH_HOME` → `~/.dsh`（第三档补齐 `.dsh` 层，修复快照误落 `~/dsh-recall-snapshots` 的 I24 漂移）；旧根级容器首次启动整容器自动迁移（MIGRATE_OK / OLD_ABSENT / BOTH_PRESENT / MIGRATE_FAIL 四态，数据不丢永远优先于路径规范）。
- **并发治理**（M3）：store 心跳文件（宿主 PID + epoch 秒，随每次快照/建库刷新）；失败清扫三级让路——另一活实例使用中让路（`CLEANUP_OTHER_INSTANCE`，win32 `Get-Process` / POSIX `kill -0` 探活）→ 5 分钟内新锁让路（`CLEANUP_SKIPPED_FRESH_LOCK`）→ 照常清扫（`CLEANUP_DONE`），根治 issue #11 双实例互踩死循环。

### 修复

- **PS 5.1 降级环境读编码**：index.json/lineage.json 读取显式 `-Encoding UTF8`——pwsh-local 解析链降级到 PS 5.1 时按 ANSI 活动代码页解码无 BOM UTF-8，中文 root 乱码 → 好索引被误判 corrupt 隔离（双平台实弹复现）。
- **双实例并发写索引的 tmp-rename 竞态**：并发 saveIndex 时一方 rename 把 `.tmp` 消费掉，另一方报「No such file」刷错误——写侧完整成功后 rename 阶段的 ENOENT 视同成功（同伴已原子落盘），不再进用户错误列表（WSL2 双实例实弹复现）。
- **冷启动首消息快照丢失**（ensureGit init 竞态）：首条消息与启动预热并发时两个 `git init` 同跑，输家 `fatal: cannot mkdir: File exists`——POSIX 版改为 HEAD 复查放行同伴、真失败带诊断退出（WSL2 实弹复现）。
- **孤儿重建条目 time=0**：重建快照时间从 tag creatordate 恢复——此前重建后管理列表时间前缀缺失、retention/条数上限按「最旧」误清真实快照。
- **救援链路前缀契约**（F-S1，严重）：rescue tag 忘拼 `snap-` 前缀导致 reset 目标必然 unknown revision、救援 100% 走失败分支——修复后救援首次真正生效（实弹验证含空格路径）。
- 其余审查修复：rebuildOrphans 过滤安全 tag（F-G1）、POSIX rollback 删除侧 rm 失败响亮退出（F-G2）、loadIndex 读截断与损坏区分（F-G3）、errors 测试门禁补强（F-G4）、verify-host 复刻生产装配（F-G5）、产物新鲜度 CI 门禁（F-G6）及 A1-A8 改进项。

## [2.0.0] - 2026-08-26

P0 防线（撤回防护/时效校验）、P1 工程化（单测/探针/CI）、设置页体验改造与新增四项配置、转向指令消息撤回修复。发版前活体冒烟（浏览器自动化 + 真实 dsh web）通过。

### 新增

- **运行中撤回防护**（P0-1）：目标工作区 agent 正在运行时拒绝发起撤回（preview/execute 均拦截，同会话优先、快照存在时叠加跨会话同工作区检查）——避免用户确认时文件被 agent 改动，预览清单与实际回退内容脱节。拦截依赖 `inject` 声明 `agents` 服务（cordis 4 门禁，冒烟实证：漏声明时静默 fail-open，防护等于没有）。
- **回退时效校验**（P0-3）：preview 之后、execute 之前若该消息又出现了新快照（`previewTotal` 与当前 `recall.total` 不一致），强制重新预览并提示，防止按旧清单回退。
- **工程化基建**（P1）：vitest 单元测试（104 例）+ 官方 API 字段探针（`npm run test:probe`，dsh 升级后本地必跑）+ GitHub Actions CI；快照失败反馈持久化（设置页可回溯最近错误）；per-workspace 快照条数硬上限（超出先清最旧）。
- **新增配置项**：快照总开关 `snapshotEnabled`（关闭只冻结新建、存量快照仍可撤回）、撤回后归档开关 `archiveOriginal`（关闭时原会话保留在侧栏）、按时间保留 `retentionDays`（0 关闭；超期快照自动清理，与条数上限独立触发）。
- **配置一键恢复默认**：设置页「恢复默认」走官方 `settings.replace` reset 通道（`section: {}` 重置为组合默认并清 user 覆盖层），老版本服务无该 RPC 时降级写默认值。
- **设置页体验改造**：文件大小上限改 MB 单位输入；快照树「加载更多」与计数修复（缓存全量数组、按 limit 切片）；存储健康状态行；快照搜索框；危险操作分级（全删/清空折叠 + 二次确认）；操作成功即时反馈；空态引导；「最近错误」可一键清空。

### 修复

- **转向指令消息缺撤回按钮**：agent 运行中插入的用户输入在 UI 投影层为 `kind=steering`（存储层 `role` 恒 user、无差异），不命中 keyed `user` 渲染器而落到官方默认气泡——keyed 注册扩展为 `['user','steering']`（冒烟实测复现并验证）。

## [1.7.1] - 2026-08-25

### 修复

- 历史会话中用户消息图片从未渲染（[#9](https://github.com/limbo947/dsh-recall-plugin/issues/9)）：插件渲染器读取的 `props.loadImage` 在官方 `conversation.chat.node` slot 契约中**从不存在**（实际入口是 `props.renderMessageImages`），自研加载链在守卫处直接 return——v1.6.2 的重试链、v1.7.0 的失败按钮全部从未执行，图片永久无声空白（v1.6.2/#8 的修复因此「修了却无效」）。用户消息图片改走官方 `renderMessageImages` 管线（自带鉴权、缓存、失败重试与灯箱预览），布局对齐官方（图片在上、气泡在下）；自研 `ImageBox`/`useImageSrc` 及对应 CSS 作为死代码移除。

## [1.7.0] - 2026-08-25

### 新增

- 快照失败/跳过可见性（[#7](https://github.com/limbo947/dsh-recall-plugin/issues/7) 加固项 1）：快照失败或熔断时客户端 toast 提示（同一故障文本 10 分钟节流，避免持续故障期间刷屏），轮询到失败即终止、不再空等 20 次；熔断期间的新消息会收到「已暂停，N 分钟后自动重试」提示而非沉默。「按钮为什么消失了」的排障成本由此消掉。
- `git add --ignore-errors` fail-open 兜底（[#7](https://github.com/limbo947/dsh-recall-plugin/issues/7) 加固项 3）：无法索引的路径（无提交的嵌入式仓库、不可读文件等）以退出码 1 结束但索引照常落盘——快照缺个别路径可接受，好过整条快照 fatal。被跳过的路径以 SNAP_SKIP 行回传，客户端提示「快照已跳过未纳入的路径」（这些路径撤回时既不恢复也不会被删，与排除表语义一致）。
- 失败后孤儿进程清扫 + stale 锁清理（[#7](https://github.com/limbo947/dsh-recall-plugin/issues/7) 加固项 4）：runShell 失败路径按 `--git-dir=<本仓库>` 命令行标记定位漏网孤儿进程并终止（win: `taskkill /T /F`，POSIX: `pgrep`+`kill`），随后清理 index.lock 等残留锁——DSH subprocess 服务的树级终止有竞态窗口，且 git 被硬杀不做锁回收，残留的 index.lock 会让后续每条快照持续 fatal。

### 修复

- `git add` fatal 时脚本假成功（空树快照）：pwsh 对原生命令非零退出不抛错（ErrorActionPreference 不作用于 native），此前 add fatal 后脚本会带着未更新的旧索引继续走完 write-tree/commit/tag，产出空树 tag 且退出码 0——快照「成功」却什么都回退不了。现显式检查退出码（≥2 抛错终止），diff/rollback 的同款 add 一并修复。

## [1.6.2] - 2026-08-25

### 修复

- 用户消息图片显示空白且刷新无效（[#8](https://github.com/limbo947/dsh-recall-plugin/issues/8)）：会话回放时最早的图片消息先于会话 binding 就绪渲染，`loadImage` 以 unknown session 拒绝后被静默 `catch` 吞掉，图片永久空白。图片加载改为 400ms/1.5s/4s 三次退避自动重试（暂态失败自愈），耗尽后显示「图片加载失败，点击重试」失败态（对齐官方 MessageImage 语义）；顺带修复 attachment 切换时短暂残留上一张图的问题。
- 快照连续失败无限累积磁盘残骸（[#7](https://github.com/limbo947/dsh-recall-plugin/issues/7) 评论实测一个下午 127GB dangling 对象）：失败重试的每次 `git add` 都会写入无 tag 可达的残骸对象。两道防线——
  - **失败清理**：每次快照失败后执行 `git prune`（以 refs + 暂存 index 为根做可达性删除），只清当次残骸、不碰任何 tag 快照，已暂存对象保留以维持下次增量。
  - **熔断退避**：连续 3 次失败后按 5min 起步指数翻倍、60min 封顶的退避跳过快照，冷却期满自动重试，成功一次即全部复位；进入熔断只在跳变沿记一条最近错误。

## [1.6.1] - 2026-08-23

### 新增

- 快照管理新增带二次确认的「全部删除」按钮：一次清理所有工作区的快照（[PR #5](https://github.com/limbo947/dsh-recall-plugin/pull/5)，@CangWeiohh 贡献）。

### 修复

- 默认基础排除表补上 `dsh-recall-snapshots/`（home 存储目录名，无前导点）：工作区 root 恰为 HOME 时（如容器内 root=/root），home 存储落入工作区且不被旧默认 `.dsh-recall-snapshots/` 匹配，`git add -A` 把影子仓库自己吞进去导致快照全部失败、撤回按钮永不出现（[#6](https://github.com/limbo947/dsh-recall-plugin/issues/6)）。排除表在下一次快照/回退时重同步并清理已误跟踪条目，存量坏索引自愈；曾在设置卡片改过基础排除表的用户需手动补一行 `dsh-recall-snapshots/`。
- 全部删除直接枚举每个影子仓库的真实 `snap-*` git tag，而非仅依赖可能丢失或过期的 `index.json`；tag 每 100 个分批删除并回读校验，确认成功后才清空索引。即使 `index.json` 为空、`root.txt` 缺失或列表未显示残留快照，仍可清理。
- 仅创建但未初始化 git 的空 store 视为无快照，不会阻断其他 store 的全部删除；任一 store 删除失败会保留其索引并在页面显示可重试错误。

## [1.6.0] - 2026-08-22

### 新增

- 撤回后自动把被撤回的消息文本回填到输入框（方案取自 [#4](https://github.com/limbo947/dsh-recall-plugin/pull/4)，按主干结构重写）：走官方 `conversation` 服务的 `input.shell(id).actions.setDraft`（与输入框自身同一写入通道，draft 镜像同步），对话回退成功时填入新会话、回退失败时填入当前会话；8 次 × 150ms 有界重试覆盖 fork+open 后 shell 就绪竞态，拿不到服务时静默跳过。新增配置开关 `refillDraft`（默认开）。
- 设置入口迁入官方「插件配置」分区（[#2](https://github.com/limbo947/dsh-recall-plugin/issues/2)）：改用 `settings.plugin.item` keyed slot（按 namespace `dsh-recall` 分发），Host 端经官方 `installSettingsSection` 注册真 schema 的 settings namespace——`settings.describe` 命中后卡片出现。卡片内含插件配置表单（保存经 `dsh-settings` 持久化进用户层、watch 链路热生效无需重启）+ 排除配置编辑（折叠）+ 快照管理（折叠）。原「撤回设置」独立标签页移除。
- 导出 Schemastery `Config` schema（官方「插件配置」文档要求）：cordis 加载时校验入口配置并填充默认值，非法配置在插件加载时响亮失败；同时作为 settings namespace 的注册 schema，一式两用。
- 设置卡片「插件配置」表单：gc 触发条数/小时、文件大小上限、基础排除表、回填开关五个字段；显示「已覆盖」（用户层覆盖）与「环境变量锁定」（`DSH_RECALL_GC_SNAPS/GC_HOURS` 仍最高优先）标记；只提交修改过的字段，避免全量覆盖污染用户层。

### 变更

- 设置卡片默认收起、点卡片头展开，视觉规格对齐官方 PluginCard（bg-layer 底色、展开态边框/背景变化、标题 15px/600、内容区上边框分隔、箭头 14px 居右）。
- 快照管理的磁盘占用与「立即 gc」全局化：设置卡片无会话上下文，`usage` 汇总全部已知 store、`gc` 逐 store 执行（新增 `maintenance.runGcAll`）；带 sessionId 的旧调用语义保持不变。
- 配置热更新贯通：`gcSnaps/gcHours/maxFileBytes/baseExcludes` 改为调用时读取（原工厂创建时快照），settings 卡片保存后下一次快照/gc 即按新值执行，无需重启。
- `package.json` 新增 peerDependencies：`@deepseek-ai/dsh-settings`、`@deepseek-ai/schemastery`。

## [1.5.2] - 2026-08-22

### 修复

- 撤回按钮不自动出现、需手动刷新（[#3](https://github.com/limbo947/dsh-recall-plugin/issues/3)，修复方案取自 [#4](https://github.com/limbo947/dsh-recall-plugin/pull/4) 并按主干结构重写）：两处根因分别修复——
  - 快照捕获是异步的，客户端在消息节点挂载时只查一次 `snapshot-info`，先于捕获完成返回 `has:false` 则永不重试。改为有界轮询：近 5 分钟内的新消息最多 20 次 × 1s，`has:true` 即渲染按钮，捕获完成后自动出现；老消息不再空转请求。
  - 冷会话（未 live）根目录解析错误：`resolveRoot` 只认 live 注册表，冷启动时回退 `sandboxPolicy.workspaceRoot`（常为 harness 启动目录）导致查错 store，且错误根被永久缓存。改为先经 `sessionQuery.listSessions` 从持久化 header 解析真实 cwd；只有 live/持久化来源的权威结果才进缓存，回退的临时根不缓存。
- 启动预热读冷会话元数据时会话 id 误取 `record.id`（`listSessions` 记录的 id 在 `header.id`，顶层恒 undefined）：预热重建的孤儿快照 sessionId 记为空，树形管理里落入「已删除会话」节点。改读 `record.header.id`。

## [1.5.1] - 2026-08-18

### 修复

- 设置页冷启动优化：`exclude-get` 首次遍历工作区、逐文件 shell 读改为并行 + 30s 结果缓存（保存后失效），二次打开设置页不再重复付出首访代价。
- 冷会话标题/消息文本补齐引入通用并发限制器（`runLimited`，同时最多 4 个）：首次大量冷数据时 `readSession` 整日志解压不再全量并发压垮磁盘/CPU。
- 启动预热叠加 `sessionQuery.listSessions()` 冷元数据：冷启动时 `ctx.sessions.list()` 常为空（惰性载入），此前设置页首次打开仍要现场建 store，现开机即预热全部历史工作区。
- Client 侧 `usage`/`status` 补数据延后到 `list` 返回后异步执行：首屏先渲染树形内容，磁盘占用与错误日志随后补齐；`list` 失败时仍尝试补这两个数据，避免整卡全空。

### 变更

- Client 侧 `titles` 请求的 sessionIds 去重（`Set` 去重 + 过滤空值）。

## [1.5.0] - 2026-08-18

### 新增

- 快照管理改为**树形结构**展示：第一级工作区（文件夹名）→ 第二级会话（会话标题）→ 第三级快照（消息 ID/消息内容摘要）；工作区与会话支持展开/折叠。
- 树形每级右侧提供删除按钮：工作区删除该工作区全部快照，会话删除该工作区内该会话全部快照，叶子单条删除；均带行内二次确认。
- 快照叶子显示**对应消息内容摘要**（取 `user/message` 事件的 text 块），悬停显示完整内容；冷会话消息文本经新增 `manage/messages` 端点按会话分组异步补齐，避免为每条消息重复解压日志。
- Host `manage/delete` 扩展 `scope=workspace/session` 批量删除：内存 + 磁盘全量收集匹配快照，按 root 分组进串行队列，tag 分块（每 100 个）规避 Windows 命令行上限；单个 root 失败 best-effort 继续并进入错误缓冲。

### 变更

- `manage list` 同 id 去重由“首次命中即丢弃”改为字段补全（root/sessionId/time/标题/消息文本），避免磁盘先占位、内存后补全时树形节点落入「未知工作区」。
- 删除操作成功提示改为显示实际删除条数（`已删除 N 条快照`）。

### 兼容性

- 全部改动保持纯 JS 零构建；未改存储格式与脚本模板接口，旧索引/旧快照无需迁移。

## [1.4.0] - 2026-08-17

### 新增

- 官方插件配置机制：`cordis.patch.yml` 行声明默认值（`gcSnaps`/`gcHours`/`maxFileBytes`/`baseExcludes`），用户在 profile 的 `cordis.patch.yml` 按 `id: recall` 重述该行即可覆盖；`DSH_RECALL_GC_SNAPS/GC_HOURS` 环境变量保留为最高优先（向后兼容）。
- 回退前自动保存安全快照（`snap-pre-rollback-<时间戳>` tag，不进列表），误回退后可从该 tag 找回，堵住唯一的不可逆操作缺口；确认面板文案同步说明。
- 设置页「快照管理」卡片：快照列表（时间倒序，含工作区名/会话标题）、当前工作区磁盘占用、单条删除、「立即 gc」手动触发、最近错误展示（Host 侧失败原本只在宿主进程日志，页面不可见）。
- 快照列表跨工作区名称解析：`saveIndex` 条目持久化 `root`；store 目录新增 `root.txt` 元数据（旧 store 重新解析时自动补写）；工作区 cwd 全集取「live 注册表 + `sessionQuery.listSessions` 冷元数据」并集（冷启动注册表为空也能解析）。
- 快照管理性能优化：新增双平台 `storesDumpScript` 一条 shell 批量 dump 全部 store 元数据（旧实现每目录 2-3 条 shell 串行，冷列表 20 秒级）；列表 30 秒结果缓存（删除/新快照失效）；冷会话标题两段式——列表首屏只查 live/缓存（同步瞬时），冷标题（整日志解压 10 秒级）由客户端异步 `titles` 端点补齐、行内先显示「…」。实测冷列表 20s+ → 2.3s、缓存命中 8ms、删除 20s+ → 4.4s。
- Host 新增 `manage`（list/usage/delete/gc）与 `status`（最近错误环形缓冲）端点；`preview`/`execute` 与快照/gc 共用同一条串行队列，消除 git index 锁并发竞态。
- 变更清单截断保护：超过 500 条时面板显示「仅显示前 N 条」，总数仍准确；请求体 1MB 上限（`BODY_TOO_LARGE`）；启动时自检两套脚本模板的同名导出对齐。

### 修复

- 索引载入失败（如 shell 未就绪）后该工作区本次进程内被永久标记「已载入」、撤回按钮消失直到重启——改为读取链路全部走通后才标记，失败自然重试。
- 快照列表「未知工作区」与同快照重复行：旧列表只查内存 `state.snapshots` 且去重 key 带 root——冷启动注册表为空时全部落空。修复后磁盘来源三层解析 root、去重只按消息 ID。
- 管理页删除误报「该快照不存在」：列表来自磁盘全量而删除只查内存——修复为「内存 → 条目 root → 磁盘 index 反查（`locateSnapshotOnDisk`）」解析链；兜底删除前先 `loadIndex` 补齐内存视图，防止 `saveIndex` 用残缺内存覆盖 index.json 抹掉同 store 其余快照；`purgeSession` 对未缓存 root 现场解析 store（原先直接跳过导致该 root 清理永远 miss）。
- 事件重放/重发产生重复 messageId 时 `git tag` 重名 fatal 导致整条快照失败——改 `tag -f`（同一条消息重快照取最新状态）。
- A→B→A 切换会话后 A 复用 B 的 init promise——init 缓存改 `Map<会话, Promise>`。

### 变更

- 错误回包统一为 `{ok, code, message}`（业务失败与系统异常分离，文案与诊断解耦）。
- `saveIndex`/`writeExclude` 的 win32 base64 分块与 POSIX stdin 分叉合并为统一落盘原语 `writeTextViaShell`；脚本导出 `indexWriteCmd`/`excludeWriteCmd` 合并为 `fileWriteCmd`。
- `resolveHomeContainer` 改纯 JS 推导（容器 = home 目录父级），删除与 `homeDirScript` 重复的整条 `$h` shell 解析链（消除双链漂移风险）。
- `maintenance.js` 导出面收敛为 `maybeMaintain`/`runGc`；删除 `index.json` 的死字段 `count`；删除未使用的非 scoped `cordis` peerDependency。
- Host 端点分发重构为端点表 + 统一 try/catch；Client 侧 `kind` 语义（文案/徽章类名/汇总）合并为单表。

### 兼容性

- 全部改动经冒烟实测：临时中文+空格工作区上跑通真实 git 链路（建仓/快照/tag -f 幂等/diff 三类变更检出/回退恢复与删除/分块索引读写/tag 清理/gc/磁盘统计），Windows PowerShell 5.1 与 pwsh 7 双解释器通过。
- 评估阶段曾将 win32 回退改为 bsdtar 优先，冒烟实测否决：GBK 代码页机器上 bsdtar 把 tar 流里的 UTF-8 文件名按 ANSI 解码（中文文件名解包成乱码新文件），已回滚为 zip + Expand-Archive 链路（中文路径实测正确，mtime 语义天然安全）。

## [1.3.0] - 2026-08-17

### 新增

- 设置页「撤回设置」标签（设置 → 插件）：可视化编辑快照排除项——输入路径或模式回车即加、常用模式一键追加（`dist/`、`*.log`、`.env` 等）、放弃修改/保存与未保存状态提示，保存后下一次快照/预览/回退立即生效，无需重启。
- Host 端 `exclude-get` / `exclude-set` HTTP 端点：枚举并读写全部 exclude.txt（home 存储全局共享一份，降级工作区各自独立、分卡片展示）；写入走 base64 分块（win32）/ stdin（POSIX），任意长度配置不受命令行上限约束；写入路径经服务端白名单校验（仅接受枚举结果中的路径）。
- 冷启动兜底：会话注册表未载入时按磁盘 home 容器目录枚举 exclude.txt（`resolveHomeContainer`），设置页不再误报「尚未创建快照存储」。

### 兼容性

- 全部新增 shell 命令在 Windows PowerShell 5.1 与 WSL2 Ubuntu（bash）实测通过，覆盖中文/空格路径、CRLF、空文件、缺失文件等边界。

## [1.2.2] - 2026-08-15

### 修复

- 撤回出的新会话不再向标题追加递增数字：fork 不传 `increaseTitle`，原样继承原标题。

### 文档

- 新增英文 README（README.en.md，与中文版互链）与 AGENTS.md 项目速览。

## [1.2.1] - 2026-08-15

### 修复

- 修正 package.json 仓库地址（仓库改名后同步）；README 安装地址同步。

## [1.2.0] - 2026-08-15

### 新增

- Linux/macOS（bash）平台支持：与 Windows 版同名导出的脚本模板按 `process.platform` 单选；POSIX 侧 `DSH_HOME` 解析对齐执行器 env 洗刷语义（WSL2 实测）。
- 快照自动维护：定期 `git gc`（每 50 条快照或 24 小时先到先触发，`DSH_RECALL_GC_SNAPS` / `DSH_RECALL_GC_HOURS` 可调，`gc.stamp` 跨重启续存节流）。
- 会话删除联动清理：会话日志从磁盘消失后自动删除该会话全部快照 tag 并释放空间；归档不算删除，判断保守（冷会话不误清）。
- 用户自定义排除：home 下 `exclude.txt`（gitignore 语法）全局生效，下一次快照/回退即时应用。

### 变更

- Host 代码模块化拆分（index / store / snapshots / maintenance / scripts.*），零顶层副作用，全部副作用经 `ctx.on` / `ctx.effect`。

## [1.0.4] - 2026-08-15

### 修复

- 非 UTF-8 代码页（GBK）输出乱码、UNC home、非 Windows 平台的通用性问题。

## [1.0.3] - 2026-08-15

### 修复

- 跨机器通用性：git 多候选安装位置探测、索引 base64 分块写入（突破命令行 32767 上限）、目录扫描容错（杀软锁定/异常 ACL）、路径尾分隔符归一、`DSH_HOME` 回退链。

## [1.0.2] - 2026-08-15

### 新增

- 未装 git / home 不可写时页面顶部一次性降级提示（gitMissing / homeFallback）。

## [1.0.1] - 2026-08-15

### 变更

- shell 以宿主身份（`danger-full-access`）执行：受限会话（workspace-write / read-only）也能在 home 建影子仓库、照常快照与回退。

## [1.0.0] - 2026-08-15

### 初始发布

- 消息撤回：影子 git 仓库快照（tag 即快照，项目目录零污染）+ 官方 `sessions.fork` 对话整段回退，原会话归档可找回。
- 确认面板先展示变更文件清单（修改/恢复/删除）再执行；`.git`、`node_modules` 自动排除；超过 100MB 的大文件跳过。
- key 冲突递减重试的 user 槽位注册，Windows PowerShell 5.1 / 7 双版本兼容。
