# 更新日志

本文件格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [Unreleased]

### 修复

- **兼容 dsh-turn-fold 的用户消息渲染槽位**：`conversation.chat.node` 的 `user` key 改为在槽位回调实际执行时读取已占用的 priority，并自动选择当前最低 priority 再低一级，避免与 `dsh-turn-fold` 等第三方插件固定占用 `-1` 时发生冲突；其他插件继续占用更低 priority 时也会自动避让。

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
