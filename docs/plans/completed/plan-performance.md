# 性能优化实施计划：撤回 / 快照列表 / 删除 / 设置页

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：已完成（2026-08-29 实施，实弹 9/9）
> 分析底稿：2026-08-29 全代码路径性能审查（lib/ 全部域模块 + src/client/ 逐文件过读；结论沉淀于本文「瓶颈模型」与各任务的「现状」小节，审查过程中的中间推演不另存文档）。
> 各项相互独立、可单独实施发版；PF-2 / PF-7 有探针前置（PF-7 的探针只影响 titles 半项，sweep 半项只依赖已钉住的 header.id 形状），探针不过则记录决策不改代码。
> 修订（2026-08-29 复审 + 终审）：修正 oversize 枚举计数（每脚本 ×1，一次撤回全程共 4 次）；速查表补 issue #12 attrsMigrateBlock（stamp 门控）与 lineage-record 行，估算模型限定 win32 口径；PF-5 补第四态 truncated 的 rebuild 守卫（现有隐患，见该节）；PF-1 补标记行解析前置与安全快照 tag 量级说明；PF-2 落盘写法定为 .NET 无 BOM WriteAllText（PS 5.1 Set-Content 必带 BOM，探针按此形态验证）并补 POSIX 写路径统一；PF-6 补后台刷新 in-flight 去重与 client 再拉仅一次；暂缓表补 execute 合并单脚本项；探针时机明确为开工即并行。

---

## 瓶颈模型

一切操作延迟的底层常数：**每条 `runShell` 都启动一个完整 shell 进程（win32 为 PowerShell，POSIX 为 bash）**——win32 侧 UTF8_PRELUDE + 脚本全文经 `-Command` 单 argv 元素 spawn，实测 0.3–1s/次（实证出处见 [../../../lib/scripts.pwsh.js](../../../lib/scripts.pwsh.js) `storesDumpScript` 注释：旧实现 20 个目录 40 次冷启动跑出「20 秒级」列表）；POSIX 侧 bash 进程启动低约一个量级，优化方向相同、绝对收益较小。所有优化归为三类杠杆：

1. **减少进程启动次数**——合并命令、缓存复用、跳过不必要的工作；
2. **减少单条命令的工作量**——避免全量枚举 / 全量重写；
3. **减少串行等待**——无关读操作并行化（注意：同一影子仓库的 git 写操作受 index.lock 互斥，只能靠串行队列保安全，不能并行）。

### 现状进程数速查（估算模型：进程数 × 0.3–1s + 命令内 git/枚举耗时，win32 口径）

| 场景 | 进程数（热态/冷态） | 主要构成 |
|---|---|---|
| 撤回 preview | 1 | `diffFor`：add -A + oversize 递归枚举 ×1 + 双清单 PS 逐行 diff |
| 撤回 execute | 3 | **重复 diffFor**（previewTotal 校验）+ 安全快照 + rollback；各含 add -A + oversize 枚举 ×1（一次撤回全程共 4 次全工作区枚举） |
| 每条消息快照 | 1 + (1+N) | snapshotScript（**脚本内 git 子进程常态 ×7**：ls-files ×3 / add / write-tree / commit-tree / tag，且 excludeSync 每次无条件重写 info/exclude；issue #12 新增的 attrsMigrateBlock 有 attrs-v1.stamp 门控——常态零子进程，仅存量仓库首迁 +1 次 add --renormalize）+ **saveIndex 全量 base64 分块重写**（N=索引 20000 字符块数） |
| gc 到期的那条消息快照 | 1 + (1+N) + **每冷会话 1 次日志冷读** | `sweepDeletedSessions`（[../../../lib/maintenance.js](../../../lib/maintenance.js)）对索引出现过的每个非 live 会话**串行 readSession 解压全日志**——在串行队列里，会话多的老工作区 gc 一到就把后续快照/撤回堵住 |
| 快照管理 list | 1 | storesDumpScript 全量读所有 index.json（已有 30s 缓存；每条消息失效） |
| 快照管理 lineage | **每 root 1 条，串行** | loadLineage 逐 root await——20 工作区 ≈ 20 次进程启动 |
| 快照管理 usage | 每 store 1 条，**串行** | `Get-ChildItem -Recurse` 全目录（含 .git 对象库）逐文件求和，GB 级库秒级；多 store 逐个 await 叠加 |
| 单条删除 | 1 + 1 + (1+N) | purgeTags + loadIndex（未载入时）+ saveIndex 分块重写 |
| 撤回后 fork 上报（lineage-record） | 1 读 + (1+N) 写 | loadLineage 全量读 + writeTextViaShell 全量重写 lineage.json；异步于 execute 不阻塞用户，但占进程（PF-2 落地后写侧降为 1 条；读侧可给 lineage 加 apply 级内存缓存——记录量少且 append-only，不列专项） |
| init（每会话每页面加载） | 2 + 1 + (1+N) | loadIndex + **rebuildOrphans 无条件 listTags + saveIndex**（即使索引健康）+ cleanupLegacy（旧 blobs 探测，几乎从不存在） |
| exclude-get 首开 | 4–6（单工作区口径） | homeDirFor + dirExists + 每 exclude 文件一条读取；每多一个未缓存工作区 +3~4（resolveStore 链：homeDirFor + mkdir + root.txt 写入） |

### 优先级总览

| # | 项 | 主要收益 | 改动面 | 风险 | 前置 |
|---|---|---|---|---|---|
| PF-1 | execute 用 tree hash 校验，消重复 diff | 撤回 execute -25%；校验更严 | snapshots/routes-core/scripts×2/client | 低 | — |
| PF-2 | win32 文本写入改 stdin 单进程 | 每条消息/每次删除省 N 条进程 | store.js + 脚本模板 | 中（编码行为） | 探针 |
| PF-3 | 全量枚举换 .NET + usage 并行 | 大工作区撤回/预览秒级→亚秒 | scripts.pwsh + routes-manage | 低 | — |
| PF-4 | lineage 并入 storesDump | 快照管理首开 10s 级 → 1s 内 | scripts×2 + index.js + routes-manage | 低 | — |
| PF-5 | rebuildOrphans 跳过 + cleanupLegacy 标记 | init/预热少 2+N 条进程 | snapshots.js + store.js | 低 | — |
| PF-6 | listCache 增量失效 + 批删复用 | 对话中刷新列表免全量 dump | index.js + routes-manage + client | 低-中 | — |
| PF-7 | listSessions 替代 readSession（titles + sweep） | 设置页标题秒回；gc 到期不再堵队列 | routes-manage + maintenance.js | 低 | 探针 |
| PF-8 | exclude-get 合并读取 | 排除配置首开 4-6 条 → 1-2 条 | scripts×2 + index.js | 低 | — |
| PF-9 | 快照脚本内 git 调用瘦身 | 每条消息常态省 1 次 git 子进程 + 1 次盘写；大排除/超大文件场景 N→N/100 | scripts×2 | 低 | — |

---

## 批次一：撤回主路径（用户最痛，先做）

### PF-1 execute 用 tree hash 校验，消掉重复 diff

**现状**：preview 跑一次完整 `diffFor`（[../../../lib/snapshots.js](../../../lib/snapshots.js) `diffFor`）；execute（[../../../lib/routes-core.js](../../../lib/routes-core.js) `execute`）带 `previewTotal` 时**再跑一次完整 diff** 仅为比对条目总数。一次撤回 = 4 条重型脚本，其中 2 条是内容几乎相同的 diff。

**方案**：`diffScript` 末尾（add -A 与 oversize 清理之后）追加 `write-tree`，输出 `TREE <hash>` 行——add -A 之后 index 的树 hash 就是当前工作区状态的精确指纹；增量成本 ≈ 一次 git 子进程（10–30ms），相对整条 diff 进程（0.3–1s）可忽略。preview 把 treeId 随响应返回；execute 透传 `previewTreeId`，安全快照脚本（本就要 write-tree）输出新 tree hash，Host 对比不一致 → 返回 STALE。校验从「条目总数一致」升级为「内容一致」，且省掉一整条 diff 进程（约 execute 耗时 25%）。

**深挖备选（实施时按实测取舍，不阻塞主案）**：`diffScript` 的清单生成本身可换 `git diff --cached --name-status --no-renames <tag>`——A/M/D 与 added/modified/restored **精确映射**（A=tag 无 index 有→added，D=tag 有 index 无→restored，M→modified），一条 git C 实现替代 ls-files + ls-tree + 双 PS 哈希表构建与双重遍历，几万文件时 PS 哈希对比的 CPU 开销整段消失。两个坑必须处理：
1. **`--no-renames` 必须显式传**：git 2.9+ `diff.renames` 默认 true，命中相似文件对会输出 `R100 <old> <new>`，不在 A/M/D 映射里，漏一条变更清单就错；
2. **gitlink 差集**：`--name-status` 输出不含 mode，无法像现在那样滤掉 tag 树里的历史 gitlink（`160000`）——D 条目会被 gitlink 污染成幻影 restored。解法：再用一条 `ls-tree -r <tag>` 只取 160000 行（常态为空）做差集剔除；若嫌两条命令，主案（手动对比）保留也完全成立——本备选属锦上添花。

顺带（与主案无依赖，可单独做）：diffScript 全量 `ConvertTo-Json`（PS 5.1 出名地慢）改为 PS 侧先输出 `TOTAL <n>` 再截断前 500 条——JS 侧 MAX_CHANGES 截断逻辑前移，stdout 传输与 JSON 序列化双双变小，`total` 语义不变。

**改动落点**：
- [../../../lib/scripts.pwsh.js](../../../lib/scripts.pwsh.js) / [../../../lib/scripts.posix.js](../../../lib/scripts.posix.js)（同名导出硬约束）：`diffScript` 加 `TREE <hash>` 输出行；`snapshotScript` 输出 `TREE <hash>`（commit-tree 前的 `$tree` 变量现成可用，加一行 Write-Output）。
- `diffFor`（snapshots.js）解析 TREE 行返回 `{treeId}`——**win32 侧必须先从输出中剥离 TREE（及上方顺带项的 TOTAL）标记行再交给 parseChanges**（其 win32 分支对整段文本 JSON.parse，标记行混入直接抛错）；POSIX 侧 diff 输出是 TSV 逐行（无 JSON），TREE 行按行前缀解析即可。
- `preview`（routes-core.js）响应加 `treeId`；`execute` 读 `args.previewTreeId`：有值 → 安全快照输出后比对，不一致返回 `E.RECALL_STALE`（此时安全快照已打下——无害，`isSafetySnapshotId` 本就让它不进索引，反而是额外的救援点）；无值 → 退回现有 `previewTotal` 校验（老 client / 直调 API 向后兼容，与 P0-3 同款可选语义）。
- client（[../../../src/client/recall-node.js](../../../src/client/recall-node.js)）`openPreview`/`executeRecall` 透传 treeId，STALE 重拉逻辑不变。

**验收**：单测钉 `TREE` 行解析与 STALE 比对分支（含「无 previewTreeId 走旧校验」兼容路径）；冒烟：预览后改文件再确认 → STALE 提示且工作区未被回退；预览后不改 → 正常回退。秒表对比优化前后「确认回退 → done」耗时。

**风险与回退**：低。校验语义只变严格；老 client 不传新字段行为不变。回退 = 移除透传字段。量级说明：diff 探测 write-tree 产生的无引用树对象由快照失败善后的 prune 与定期 gc 回收（每棵树数百字节，可忽略）；STALE 场景多打的 safety tag 与成功撤回同款、随撤回次数线性积累（现状已然的取舍——可达 tag 不被 gc 清理，保留即救援点）。

### PF-2 win32 文本写入改 stdin 单进程（探针前置）

**现状**：`writeTextViaShell`（[../../../lib/store.js](../../../lib/store.js)）win32 分支把 base64 按 20000 字符分块，**每块一个 PowerShell 进程**——索引几百条时 saveIndex = 6+ 条进程，而它在每条消息快照后、每次删除、每次 init 的 rebuildOrphans 后都会全量重写。POSIX 分支已用官方 `ShellExecRequest.stdin` 契约字段直写全文；runShellMeta 的实现里 stdin 对 pwsh 执行器同样透传（[../../../lib/store.js](../../../lib/store.js) `runShellMeta` 注释：「bash-local/pwsh 均实现」）。

**方案**：win32 分支改为 stdin 传全文 + pwsh 侧 `[Console]::In.ReadToEnd()` 读出后落 tmp 文件，N+1 条进程 → 1 条。落盘必须用 .NET 无 BOM 写法（`[IO.File]::WriteAllText($tmp, $text, [Text.UTF8Encoding]::new($false))`，与 UTF8_PRELUDE 同款编码对象）——PS 5.1 的 `Set-Content -Encoding utf8` 必带 BOM（本项目已多处钉过的坑：stripBom、excludeSync 首行空元素、心跳用 ascii），用它探针必挂。当年 base64 分块是为绕 argv 32767 上限与编码坑，stdin 不经命令行，两个问题天然消失——**前提是 pwsh 执行器 stdin 的编码行为可靠**。

**前置探针（先做，不过则终止）**：`tests/probe` 新增条目——stdin 传含中文/emoji 的 UTF-8 文本，pwsh 侧 `[Console]::In.ReadToEnd()` + `[IO.File]::WriteAllText`（无 BOM 重载）落盘，回读逐字节比对。验证点：无 BOM、无 GBK 代码页转码、`\r\n` 是否被篡改、全文长度一致。任一不过 → 本项废弃，决策记录在本文文末「实施记录」。

**改动落点**：`writeTextViaShell` win32 分支一处（scripts 模板加 `fileWriteStdinCmd`，两平台同名导出纪律）；saveIndex/writeExclude 调用方零改动。

**顺带（两平台写路径统一）**：POSIX 分支的 `'cat > ' + psq(tmp)` 目前内联在 store.js——`fileWriteStdinCmd` 两平台同名导出后 POSIX 分支一并改走模板（模板本体就是这条 cat），store.js 不再持有内联命令串；checkScriptParity 的 SKIP 集同步删掉 `fileWriteCmd`（随分块实现整体移除），stdin 形态由同名导出纪律与 scripts-contract 单测钉住。

**验收**：探针绿；不引入双路径——探针绿即整体切换，不留「stdin 失败回退分块」的运行时分支（回退手段是 git revert，不是代码分支）；回归跑 `npm test` + `scripts-contract`；冒烟：中文路径工作区快照 → 撤回 → 索引读回无损（messageText/feedback 正常）。

**风险与回退**：中（编码行为未知），探针先行把风险钉死在实施前。回退 = 恢复分块实现（git revert 即可，调用面无变化）。

### PF-3 win32 全量枚举类脚本换 .NET 实现（oversize 三处调用 + diskUsage）

**现状**：`oversizeBlock`（[../../../lib/scripts.pwsh.js](../../../lib/scripts.pwsh.js)）用 `Get-ChildItem -Recurse` 全工作区递归找超大文件，snapshot/diff/rollback 三条脚本各调一次——一次完整撤回（preview 的 diff + execute 的重复 diff + 安全快照 + rollback）共 4 次全工作区枚举；每文件走一遍 PowerShell 管道对象，几万文件时数秒。`diskUsageScript` 同款问题作用于快照库。

**方案**：换 .NET 手动栈遍历——`Stack<string>` + 逐目录 `EnumerateFiles` + 每目录 try/catch 跳过不可访问目录。**关键坑（直接决定实现形态）**：.NET 4.x（PS 5.1 可用范围）的 `EnumerateFiles(..., AllDirectories)` 遇 ACL 异常目录会**中断整个枚举**，没有 .NET 6 的 `SkipUnavailable`——不能一把梭递归枚举，必须手动栈逐目录容错，才能与 `Get-ChildItem -ErrorAction SilentlyContinue` 的逐项容错语义对齐（漏看个别文件 fail-open 的既有取舍保持）。

**改动落点**：`oversizeBlock`、`diskUsageScript`（[../../../lib/scripts.pwsh.js](../../../lib/scripts.pwsh.js)）。POSIX 侧 `find` 本就高效，不动（同名导出纪律不钉实现，`scripts-contract` 单测只钉导出名与约定哨兵）。

**顺带（usage 端点的两条低成本改进，与 .NET 遍历无依赖）**：
1. **多 store 并行**：usage 端点（[../../../lib/routes-manage.js](../../../lib/routes-manage.js) op='usage' 无 sessionId 分支）对全部 store **串行** await diskUsageScript，多工作区用户逐个叠加。并行化注意：读操作不碰 index.lock，但为防极端磁盘争抢仍走 `runLimited`（并发 4，index.js 已有现成实现）而不是裸 Promise.all。
2. **usage 结果缓存**：`usage` 与 `list` 不同——无 30s 缓存，每次 ManageCard refresh 都重算。加与 listCache 同款的 30s TTL（`usageCache`，gc/删除后失效），设置页二开免重扫。

**备选（量级展示优先于精确时）**：`countObjectsScript`（`count-objects -v` 的 size-pack）模板已写好但当前无人调用——gc 后基本准确、速度快一个量级。若 .NET 遍历在大库上仍慢，可做「默认 count-objects + 手动『重新计算』按钮精确遍历」的双层。语义差异（不算降级残留、pack 之外 loose 对象略少计）需在 UI 文案标注「约」。

**验收**：单测（纯逻辑部分如输出格式）；冒烟：大工作区（≥1 万文件）撤回 preview 秒表对比；含不可访问目录的工作区快照不 fatal（fail-open 语义回归）。

**风险与回退**：低。枚举语义逐目录对齐 SilentlyContinue；回退 = revert 脚本模板。

---

## 批次二：设置页与管理

### PF-4 lineage 并入 storesDumpScript（消串行放大）

**现状**：`manage op='lineage'`（[../../../lib/routes-manage.js](../../../lib/routes-manage.js)）对每个 root **串行** `await loadLineage(root)`，每 root 一条 PowerShell 进程——20 个工作区 ≈ 10s，版本家族标记（v1/v2）最后才亮。

**方案**：`storesDumpScript` 扩展：每个 `==DIR` 段内追加 `LINEAGEBEGIN/lineage.json 原文/LINEAGEEND` 段（与 INDEX 段同构）。`parseStoresDump`（[../../../lib/index.js](../../../lib/index.js)）状态机扩展解析；lineage 端点改为一次 dump 直接取，零新增进程。

**改动落点**：scripts 两侧 `storesDumpScript`、`parseStoresDump`（index.js，纯函数可单测）、routes-manage lineage 分支。**兼容**：无 LINEAGE 段的输出（理论不存在，脚本与 Host 同版本发布）按空 lineage 处理，parse 容错。

**验收**：`parseStoresDump` 单测补 LINEAGE 段（含缺失/损坏 JSON 容错）；冒烟：多工作区快照管理版本家族展示不回归，lineage 加载从秒级降到瞬时。

**风险与回退**：低。dump 体积增长 ≈ 每个 store 一行 JSON（lineage 条目本就少）。回退 = revert 三处。既有边界顺带记录：dumpStores 的 stdout 上限 8MB（未检测 truncated），多工作区 × 大索引场景超限后尾部 store 静默缺失——现状同然的 fail-open；lineage 并入后更接近上限，极端场景按现状语义接受。

### PF-5 rebuildOrphans 加跳过条件（init/预热提速）

**现状**：init（每会话每次页面加载）与启动预热都无条件跑 `rebuildOrphans`（[../../../lib/snapshots.js](../../../lib/snapshots.js)）：`listTagsWithTime` 1 条进程 + `saveIndex` 全量重写 1+N 条——即使索引已健康载入、零孤儿。

**方案**：`loadIndex` 终态区分三档：`healthy`（解析成功且已标记 indexLoaded）/ `empty`（无索引文件）/ `quarantined`（H2 损坏隔离）。state 加 `indexHealthy: Set`；`rebuildOrphans` 开头：`healthy && 该 root 索引条目 > 0 → 整个跳过`。**语义安全论证**：索引丢失/损坏的用户重启后，loadIndex 必落 empty 或 quarantined 档 → rebuild 照跑，自愈链路完整；进程内 healthy 是索引确实在场的强信号。唯一被省掉的场境是「进程内索引健康但磁盘上 tag 有而 index 无」——这只发生在 saveIndex 落盘失败且内存已 set 的窗口，该失败本身走 recordError 且下次 saveIndex 自然补写，可接受。

**三档之外的第四态——truncated（F-G3），本项必须顺带处理**：loadIndex 的 stdout 截断分支（index.json 超 4MB 读取上限，snapshots.js F-G3 注释）标记 indexLoaded、按空索引继续，并承诺「本次绝不写回（防用残缺内存覆盖好文件）」。但 init/预热链路紧接的无条件 rebuildOrphans 会把全部 tag 判成孤儿（内存为空）→ 全量 set → **saveIndex 全量重写，用残缺的孤儿集覆盖完好的大索引**（feedback 全丢、sessionId 全被记成当前会话；数万条索引在 win32 分块写下还是数百条进程的灾难）——这是现有代码就存在的隐患，PF-5 的三档模型不把它摆进来就依然漏。处理：truncated 分支把 root 记入「禁 rebuild」标记（如 `state.indexTruncated: Set`），rebuildOrphans 对该 root 整体跳过——磁盘索引本身完好且通常远全于 tag 反推结果，重建只产失真；后续自然 saveIndex 按 F-G3 既有语义覆盖的取舍不变。单测补 truncated × rebuild 行为（跳过，且不写盘）。

**改动落点**：state 定义（store.js `createRuntime`）加 `indexHealthy`/`indexTruncated` 两个 Set；`loadIndex` 仅解析成功分支标 healthy（空索引落 empty 档不标、损坏隔离落 quarantined 档不标、truncated 分支改记 indexTruncated）、`rebuildOrphans` 开头守卫（snapshots.js）；init/预热调用方零改动。

**顺带（init 路径的另一条白跑）**：`cleanupLegacy`（[../../../lib/store.js](../../../lib/store.js)）每次 init 都探测删除旧版 blobs 目录（`legacyRmScript` 一条进程）——该目录只存在于极早期版本用户的降级工作区，探测成功一次后不可能再出现。给 store 挂 `legacyCleaned` 内存标记（成功或确认不存在后不再跑），同 root 多次 init 只付一次；重置场景（DSH 重启）每进程一次，可接受。

**顺带（预热路径同步受益）**：启动预热的 per-root Promise 链（[../../../lib/index.js](../../../lib/index.js)）对每个已知工作区并发触发同一套 init 链，多工作区冷启动时 rebuildOrphans 的进程数按 root 数倍增——本项落地后冷启动预热每 root 省 1+N 条（rebuild 整条链），同进程二次 init 从 2+N 条降为 0 条；并发风暴总量随 root 数线性增长的大头被消掉，无需再为预热单设并发限制。

**验收**：单测钉四档终态 × rebuild 行为矩阵（healthy+非空→跳过；empty/quarantined→照跑；truncated→跳过且不写盘）；冒烟：重启 DSH → 打开页面（init）日志无多余 saveIndex（或秒表对比首消息快照前的静默期）。

**风险与回退**：低。最坏情形（上述窗口）退化为「下次写索引时自愈」，不丢数据（tag 恒为真相源）。

### PF-6 listCache 增量失效 + 批量删除复用缓存

**现状**：每条消息快照落地把 `listCache.items` 清空（[../../../lib/index.js](../../../lib/index.js) 事件接线），对话进行中每次打开快照管理都全量 dumpStores，30s TTL 形同虚设。另 `deleteSnapshotsByFilter`（[../../../lib/routes-manage.js](../../../lib/routes-manage.js)）无条件 `collectAllSnapshotRecords` → dumpStores，即使缓存新鲜。

**方案**：
1. 事件接线失效改为 `listCache.stale = true`（不清 items）；list 端点：缓存存在且（fresh 或 stale）→ **立即用旧 items 应答**并带 `stale: Boolean(...)` 字段，stale 时后台触发 dump 更新缓存（不阻塞响应）——**后台刷新必须 in-flight 去重**（stale 期间重复 list 复用同一进行中的 dump，不重复起进程，否则进程数反而放大）；缓存为空 → 现行为同步 dump。client `ManageCard.refresh` 收到 `stale: true` 时静默再拉一次替换列表（渐进补新快照）——**再拉仅一次、不循环**（响应仍 stale 时止步，等用户下次刷新，防抖动循环）。
2. `deleteSnapshotsByFilter`：缓存非空（含 stale）时直接由缓存 items 构造 records（缓存 stale 说明有新快照未入列表——删除操作以「用户当前所见」为准反而更符合预期；磁盘兜底 locateSnapshotOnDisk 保留）。

**改动落点**：index.js 事件接线与 list 分支、routes-manage delete 分支、[../../../src/client/settings-cards.js](../../../src/client/settings-cards.js) ManageCard.refresh。

**验收**：单测钉 list 端点 stale 语义（空缓存同步 / 非空先应答后台刷新）；冒烟：对话中连续两次打开快照管理，第二次立即出列表且新快照稍后补上；删除 → 刷新立即反映。

**风险与回退**：低-中。最坏情形 = 用户看到最多一条消息延迟的列表（stale 标记下二段刷新兜底）；删除语义以所见为准需在 PR 描述明示。

### PF-7 listSessions 替代逐会话 readSession 冷读（titles + gc 扫描；字段核验前置）

**现状（两条同源路径都在为「会话是否还存在」付日志冷读的钱）**：
1. `manage op='titles'`（[../../../lib/routes-manage.js](../../../lib/routes-manage.js)）对冷会话逐个 `readSession` 解压全日志（并发 4 已限制，仍是设置页二线等待）。
2. `sweepDeletedSessions`（[../../../lib/maintenance.js](../../../lib/maintenance.js)，gc 到期触发）对索引出现过的**每个非 live 会话**串行 `readSession`——在串行队列里，会话多的老工作区 gc 一到就把后续快照/撤回全堵在队尾。归档会话的日志仍在磁盘，readSession 成功而「幸存」，这个判定本质只查「日志文件在不在」。

而 `sessionQuery.listSessions()` 是「目录级 header 枚举、不触碰全量日志」（[../../../lib/store.js](../../../lib/store.js) resolveRoot 冷路径已在用），一次调用即得全部磁盘会话的 id 集。

**前置核验（合规清单 #8 纪律）**：探针确认 `listSessions()` 返回记录的 `record.header` 是否含 `title`（`tests/probe` 加条目）。有 → titles 与 sweep 两处都实施；无 → 只实施 sweep（判定只需要 id，`header.id` 形状已由 I8 钉住），titles 部分废弃并记录。

**方案**：
1. **sweep**：一次 `listSessions()` 建 id 集合，live 注册表命中或 id 在集合中 → 保留；不在集合 → 判定已删除，走 purgeSession。保守闸门保持：sessionQuery 服务不存在时整体跳过。**语义对比**：新判定「日志目录在不在」与旧判定「readSession 成败」等价，且更保守——旧路径下日志损坏但文件在会被误判已删除（purge 不可逆），新路径一律保留；归档会话仍在集合中，不被误清。
2. **titles**：同一次 `listSessions()` 建 `header.id → header.title` Map，live 缓存未命中的冷标题查 Map，零 readSession。**messages 端点不动**（messageTextFromEvents 必须读日志正文，无法绕过）。

**改动落点**：maintenance.js `sweepDeletedSessions`、routes-manage titles 分支、tests/probe 新条目（header.title 形状）。

**验收**：探针绿；单测钉 sweep 判定矩阵（live/集合中/集合外/服务缺失）；冒烟：gc 触发轮不再逐会话卡顿（会话多的工作区秒表对比）；已归档会话的快照不被 sweep 清掉（撤回后立即手动 gc 验证）；含已删除会话的快照树标题正常。

**风险与回退**：低。判定只会更保守（保留更多），方向上只降误删风险；探针钉字段假设。回退 = 恢复 readSession 判定。

### PF-8 exclude-get 探测链合并（顺手项）

**现状**：`exclude-get` 首开 = homeDirFor + dirExists + 每 exclude 文件一条读取（4–6 条进程）；30s 缓存已有。

**方案**：`dirExists` 探测并入读取脚本（`excludeGetScript`：枚举 + 逐文件输出定界段，同 storesDumpScript 思路）；或 PF-4 扩展 dump 时顺带读各 exclude.txt。任选其一，以「新增模板函数最少」为准。

**改动落点**：scripts 两侧新模板函数、index.js `listExcludeFiles`、routes-manage exclude-get。

**验收**：单测解析容错；冒烟：设置页排除配置首开秒表对比（4–6 条 → 1–2 条）。

**风险与回退**：低。exclude-set 路径白名单校验逻辑不动（安全边界）。

---

### PF-9 快照脚本内 git 子进程与写盘瘦身（每条消息的常态开销）

**现状**：`snapshotScript`（scripts 两侧）一条脚本内常态跑 **7 次 git 子进程**（同一 PowerShell/bash 内每次 `& $git` 仍是独立进程，每次 10–30ms 的 fork/exec + git 自举）：dropGitlinks 的 ls-files（add 前）→ excludeSync 的 ls-files -i -c →（attrsMigrateBlock，stamp 门控常态零子进程，见方案第 4 条）→ add -A → dropGitlinks 的 ls-files（add 后）→ write-tree → commit-tree → tag。其中 excludeSync **每条消息无条件重写 info/exclude**（Set-Content 落盘），其清理循环与 oversizeBlock 对**每个命中路径单独跑一次** `update-index --force-remove`——首次应用大排除表或多超大文件的工作区，子进程数以命中数计。

**方案**（三个独立小改动 + 一条「不动」声明，全部在脚本模板内）：
1. **exclude 重写条件化**：写 info/exclude 前先读旧文件全文比对（文件小，纯文本比对零成本），内容相同 → 跳过 Set-Content **并跳过** `ls-files -i -c` 清理循环。语义安全：exclude 未变时，上次快照已把命中条目移出 index，add -A 因排除先生效不会加回，index 保持干净；「首次应用新 exclude」仍走完整链路，「改排除即时生效」承诺（AGENTS.md 有钉）不变。常态净省 1 次 git 子进程 + 1 次盘写/条。
2. **update-index 合批**：excludeSync 与 oversizeBlock 的逐条 `update-index --force-remove` 改为多路径合参（update-index 原生接受 `-- p1 p2 …`），每批按 100 条（与 purgeTags 分块同款纪律，win32 argv 上限心智检查照做）。变更/首次场景 N 次子进程 → N/100。
3. **两次 dropGitlinks 保留不动**：add 前那次防遗留 gitlink 让 add fatal，add 后那次抓新引入的 gitlink——中间隔着 add，两次 ls-files 无法合并，这里明确「不省」避免实施时误判。
4. **attrsMigrateBlock（issue #12）不在瘦身范围**：该块位于 excludeSync 之后、add 之前，有 attrs-v1.stamp 门控——常态零子进程（仅一次 Test-Path/[ -f ]），仅存量仓库首迁 +1 次 add --renormalize；与上述三条改动无交互（renormalize 不看 exclude、不碰 update-index 合批路径），实施时保持其位置与门控原样即可。

**改动落点**：scripts 两侧 `excludeSyncBlock`/`oversizeBlock`（snapshot/diff/rollback 复用同块，同步受益）。

**验收**：scripts-contract 回归；单测（若块逻辑可纯化）；冒烟：改 exclude.txt 后下一条消息快照立即按新排除执行（即时生效不回归）；连续 20+ 条消息取均值对比快照耗时（单条收益在噪声以下，须均值口径）。

**风险与回退**：低。多路径合参需两平台引号纪律（路径含空格/中文）；回退 = revert 脚本块。

---

## 不做与暂缓（决策记录）

| 项 | 决定 | 理由 |
|---|---|---|
| 回退 zip 链路换 reset --hard / tar | 不做 | tar 在 GBK 代码页机器的中文文件名坑已实证（rollbackScript 注释）；zip 语义隔离 index 状态，正确性风险 > 性能收益 |
| 撤回在串行队列插队 | 不做 | 同仓库 git index 操作必须互斥，插队引入锁竞态；PF-1/PF-3 缩短各任务时长已等价缩短排队绝对时间 |
| purgeTags + saveIndex 合并单进程 | 暂缓 | 低频操作，PF-2 落地后 saveIndex 已降为 1 条，合并的边际收益小；观察 PF-2 后的实测量级再定 |
| execute 内部「安全快照 + rollback」合并单脚本 | 暂缓 | PF-1 落地后 execute 剩 2 条重脚本，且两条都跑 dropGitlinks/excludeSync/add -A/oversize 全链（对同一状态重复 add）；合并可共享一次 add，execute 再省约一半。代价：「安全快照失败不阻断回退」的语义要从脚本 throw 改成条件分支，SNAP_SKIP 与 ROLLBACK_OK 输出交织让哨兵解析复杂化——先按 PF-1/PF-3 落地后的实测队列时长决定值不值得 |
| diff 用 `git status` 替代 add -A | 不做 | rollback 依赖 add -A 后的 index 作为「当前状态」基准，status 方案语义耦合且同为全量扫描 |
| snapshot-info 轮询（1s × 20 次） | 保持 | HTTP 轻量、无推送通道可替代；按钮出现延迟的根因是快照本身（PF-1/PF-3 间接改善） |
| gc 与撤回争用串行队列 | 保持现状 + PF-7 缓解 | gcScript 全量 repack 无法拆段，但 50 拍/24h 节流已钉死频率；真正的堵点 sweep 逐会话日志冷读由 PF-7 消掉，剩余只是 gc 本体的常态代价 |

## 实施与发版

- 批次一（PF-1 → PF-3 → PF-2）优先；批次二各项可穿插，PF-9 建议最后做（收益最小、需要均值口径验证）。PF-2/PF-7 有探针前置，探针失败不影响其余各项。**探针是独立小实验：批次一开工当天即并行跑掉**（不等排到 PF-2/PF-7 才做）——结论早出，PF-2 的排期与取舍才能按结论调整。
- **先跑基线**：动手前对四个场景（撤回全链路 / 快照管理首开 / 单条删除 / init）各秒表 3 次取中位数记入本文「实施记录」——没有基线，「优化了多少」无从谈起，回退决策也无依据。
- 每项独立提交、独立可回退；动 scripts.*.js 的项（PF-1/2/3/4/8/9）两平台心智检查 + `scripts-contract` 单测回归（AGENTS.md 回归纪律）。
- 发版语义：PF-1/PF-6/PF-7 含行为变化与 client 改动 → minor；纯性能等价重构（PF-2/3/4/5/8/9——API 形状与语义不变，PF-2 换写路径、PF-4 合并读取）→ 可随 minor 顺带。版本号发版时确定（规范见 [../README.md](../../README.md)）。
- 实弹验收项完成后并入/对照 [smoke-checklist.md](./smoke-checklist.md) 冒烟路径执行。

## 实施记录

> 2026-08-29 全部 9 项（PF-1〜PF-9）实施完成，每项独立提交（8cf98cc 基线之后：PF-1 `feat:`、PF-3/2/4/5/6/7/8/9 `perf:` 八连）。
> 单测 227 → 283 例全绿；`verify:host` 装配门禁通过；client 产物已重跑 `npm run build`（PF-1/PF-6 各一次）。
> 实弹冒烟项已并入 [smoke-checklist.md](./smoke-checklist.md) 第七节（2026-08-29 实弹 9/9 通过，执行记录见同目录 smoke-checklist-records.md；随后本文件随清单移入 completed/）。

### 探针结论（开工日并行，2026-08-29）

- **PF-2 stdin 编码探针**（`tests/probe/stdin-write.test.js`，与 dsh-pwsh-local 同 argv 形态 spawn 实测）：
  - 文档字面形态 A（`[Console]::In.ReadToEnd()`）：**PS 5.1 上红**——重定向 stdin 按 `Console.InputEncoding`（中文机器 GBK 936）解码 UTF-8 字节 → 乱码 + 字节数漂移（223B→266B）；官方 `ENCODING_PREAMBLE` 与插件 `UTF8_PRELUDE` 均只设 OutputEncoding，救不了输入侧。
  - 形态 B（`[Console]::OpenStandardInput()` 循环读原始字节 + `UTF8Encoding($false).GetString` 解码）：**PS 5.1 与 pwsh 7.6.5 双解释器全绿**（无 BOM、CRLF 保持、长度一致、逐字节相等）。
  - 关键环境事实：本机 dsh 的 pwshPath 解析实际落到 **powershell.exe 5.1**——WindowsApps 的 pwsh 别名是 appexeclink reparse point，`lstatSync` 报 ENOENT，dsh 的 `candidateExists`（lstat+isFile/isSymlink）判否。
  - **决策：PF-2 实施，读取手法采用形态 B**（方案意图「stdin 单进程」不变；形态 A 在生产口径必挂）。探针保留形态 B 为回归钉。
- **PF-7 header.title 探针**（`tests/probe/api-surface.test.js` 负向断言）：`SessionHeader`（dsh-session/lib/types/types.d.ts）**无 `title` 字段**（标题住在事件日志的 `session/title` 事件里）→ **titles 半项废弃**（冷标题无法走 listSessions，维持 readSession 现状），仅实施 sweep 半项。探针钉住负向事实：未来官方加 title 时探针红，提示可重启 titles 优化。

### 实测数据（合成基准：真实脚本模板 + 与 dsh-pwsh-local 同形态 spawn，PS 5.1）

> 工作区 350 文件、索引 350 条（base64 分块口径 = 2 块）；每场景 3 次取中位数。进程数按文档「现状进程数速查」模型逐场景对齐。
> 口径局限：合成基准不含 dsh 执行器调度与 HTTP 层；小工作区 git 工作占比高，绝对值噪声约 ±10%；多工作区/大索引的真实场景收益更大（lineage 串行放大、rebuild N 条、saveIndex N 块随规模线性放大）。

| 场景 | 优化前（基线） | 优化后 | 进程数 | 主要受益项 |
|---|---|---|---|---|
| 撤回全链路 | 7.90s | 7.52s | 4 → 3 | PF-1（重复 diff 消除）；小工作区下 diff 脚本新增 write-tree 抵消部分收益，秒表口径噪声大 |
| 快照管理首开 | 1.16s | 0.35s（**-70%**） | 4 → 1 | PF-4（lineage 并入 dump，串行放大消除） |
| 单条删除 | 1.36s | 1.08s（-21%） | 5 → 3 | PF-2（saveIndex 分块 → stdin 单进程） |
| 每条消息快照 | 1.39s | 1.19s（-14%） | 3 → 2 | PF-2（同上） |
| init 冷启动 | 1.61s | 1.44s（-11%） | 6 → 4 | PF-5 + PF-2 |
| init 热（同进程二次 init） | 1.61s | ≈0s（**-100%**） | 6 → 0 | PF-5（healthy 跳过 rebuild + legacyCleaned） |
| 大工作区撤回/预览 | 数秒级（Get-ChildItem 枚举 ×4） | 亚秒级枚举 | — | PF-3（.NET 手动栈遍历；小工作区合成基准测不出差异，枚举收益随文件数线性放大） |
| gc 到期那条消息（多会话工作区） | 逐会话 readSession 全日志解压串行堵队 | 1 次 listSessions 目录枚举 | — | PF-7 sweep 半项 |
| 排除配置首开 | 4–6 条进程 | 2 条 | — | PF-8（excludeDumpScript base64 一条读全部） |
| 对话中打开快照管理 | 每次全量 dumpStores（TTL 形同虚设） | 旧列表立即应答 + 后台补新 | 1 → 0（同步路径） | PF-6（stale 增量失效 + in-flight 去重） |

### 各项实施要点与偏差

- **PF-1**：照方案实施 + 顺带项（TOTAL 行 + PS 侧截断，`MAX_CHANGES` 作为模板参数注入保持单一事实源；POSIX 无 ConvertTo-Json 开销不做 TOTAL/截断）。execute 的指纹比对放在安全快照**之后**（方案原文位置）：校验失败时安全快照已在场，成为额外救援点。深挖备选（`git diff --cached --name-status` 替代手动对比）按「不阻塞主案」未做，主案成立。
- **PF-2**：读取手法按探针结论改为字节流形态（见上）；win32 与 POSIX 统一走 `fileWriteStdinCmd` 同名导出，`fileWriteCmd` 分块实现整体移除（无运行时双路径）。实弹：600 条含中文/emoji/feedback 索引（66KB）写+rename 2 进程往返无损（旧实现 4 进程）。
- **PF-3**：.NET 手动栈遍历照方案（`Stack[string]` + 逐目录 `EnumerateFiles` + try/catch）；usage 并行走 `runLimited(4)` + 30s TTL `usageCache`（删除/gc 后失效，每条消息不失效——否则 TTL 形同虚设）。备选 count-objects 双层未做（.NET 遍历已达标）。
- **PF-4**：照方案实施。`parseStoresDump` 提为模块级导出并住 `lib/dump-parse.js`（PF-8 的 `parseExcludeDump` 同住——routes-manage 需要 parseExcludeDump，放 index.js 会循环依赖；index.js re-export 保持测试 import 路径稳定）。lineage 分支顺带免去对未知 root `resolveStore` 建目录的副作用。
- **PF-5**：四档守卫照方案（truncated 整体跳过且不写盘 / healthy+非空跳过 / empty、quarantined 照跑）。顺带项 `cleanupLegacy` 标记落地时发现配套前提：pwsh `legacyRmScript` 必须加 `-ErrorAction SilentlyContinue`——目标不存在是常态，不容错则 Remove-Item 抛错、永远走不到「成功」分支，标记失效（每次 init 仍白跑）。
- **PF-6**：照方案实施（stale 标记 + 立即应答 + in-flight 去重 + client 二段刷新仅一次）。删除类操作（delete/deleteAll/批删）仍置 `items = null` 同步失效——删除低频且准确性优先，只有事件接线改 stale。
- **PF-7**：sweep 半项照方案（判定更保守：日志损坏但文件在的也保留）。titles 半项废弃（探针结论）。
- **PF-8**：选「新增模板函数最少」的独立方案（`excludeDumpScript` 一条读全部，不扩展 storesDump——lineage 已并入 dump，exclude 若也并入会让「对话中 exclude-set 后 exclude-get 刷新」拖上全量 dump）。内容走 **base64 单行**传输：exclude.txt 是用户可编辑的任意文本，逐行定界会被内容行打乱（与 storesDump 的单行 JSON 不同）；也顺带规避 PS 5.1 中文代码页转码。实弹：中文/敌意内容（恰好像标记的行）/emoji 往返 PASS。
- **PF-9**：三条改动照方案（条件化 / 合批 100 / dropGitlinks 不省 / attrsMigrate 不动）。POSIX 合批用 `xargs -0` 自适应批次（规避 ARG_MAX 的本职设计，等价 win32 显式 100 条/批；GNU 空输入空跑一次 update-index 的 usage 退出由 `2>/dev/null || true` 兜住，BSD 空输入不执行）。实弹：条件化跳过（mtime 不变）/5 超大文件合批剔除/改 exclude 重新应用/新排除即时生效——全部 PASS。

### 暂缓表复核（PF-2 落地后）

- 「purgeTags + saveIndex 合并单进程」：PF-2 后 saveIndex 已是 1 条，维持暂缓（低频）。
- 「execute 内部安全快照 + rollback 合并」：PF-1/PF-3 后 execute 剩 2 条重脚本，维持暂缓，待实测量级再定。
