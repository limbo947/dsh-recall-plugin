# 冒烟测试执行记录

> 配套文档：[smoke-checklist.md](./smoke-checklist.md)（测试项清单；逐项 ✅/△ 结果注在对应条目上）｜ 本文件只登记**会话级执行记录**：日期、环境、结果、发现与发版判定。
> 约定：每次执行后追加一节（日期 + 范围）；出现失败的记 issue 并回链；清单全部通过后与 checklist 一起移入 `completed/`。
> 状态总览：第一〜七节均已执行通过（2026-08-29：Windows 侧 + WSL 侧 + 修复实施 + v2.1.1 本机验证 + PF 性能批次实弹）。

## 2026-08-29 Windows 侧（第一〜四节）

- **环境**：Windows 10 22H2 ｜ dsh 0.1.1-rc.2（与 reference 镜像一致，`check:dsh` 全绿）｜ dsh-recall-plugin link 模式（工作区 2.0.0 未提交改动，含 M1/M2/M3）｜ dsh web 127.0.0.1:3080
- **结果**：22 项通过（19 完整通过 + 2 部分通过[三.1/三.3 无法构造场景] + H2 双重实弹）；测试产物留有两个测试工作区（`D:\workspace\dsh-plugin\冒烟测试工作区`、`smoke space 测试 工作区`）与 store 容器，供复验，可随时清理
- **执行方式**：浏览器实弹（IAB 自动化）+ API 直调 + Host 侧 git/tag/文件核对；三次重启 dsh-web（无 git PATH 试验 / 恢复 + 冷启动 / H2 演练）

**发现（按严重度）**：

1. **[缺陷·中] PS 5.1 降级环境读编码不安全**：dsh-pwsh-local 的可执行解析链为「`Program Files\PowerShell\7\pwsh.exe` → PATH 各项 → **PS 5.1 兜底**」。当 pwsh 7 不在 PATH（如 Store 版安装 + 精简 PATH 启动）时降级 PS 5.1，其 `Get-Content -Raw` 对 UTF-8 **无 BOM** 的 index.json 按 ANSI(GBK) 解码 → 中文 root 乱码 → JSON.parse 失败 → 走 H2 隔离分支 → **误判 corrupt**（tag 数据无损，索引明细 time 丢失、重建为 0）。本次意外真实触发并完整复现因果。修复建议（小改）：`indexReadCmd`/`lineageReadCmd` 显式 `-Encoding utf8`，或 UTF8_PRELUDE 统一 `$PSDefaultParameterValues['Get-Content:Encoding']='utf8'`。附带观察：PS 5.1 写侧文件带 BOM（读侧 `stripBom` 已兼容，无害）；曾偶发一次的「saveIndex Move-Item: index.json.tmp does not exist」与降级环境同窗出现，疑同根，修复后观察。
2. **[改进·低] rebuildOrphans 重建条目 time=0**：索引丢失重建后快照时间信息丢失（快照管理叶子时间前缀缺失、预览目标时间不可用）。tag 指向的 commit 自带时间戳，可从 commit 读回恢复。
3. **[观察] recordError 相邻去重的交错局限**：错误 A 与 B 交替出现（如 lock 失败与「新锁让路」记录成对交替）时，A 的重复不合并计数。设计权衡是只合并相邻防跨类挤占，保持现状可接受；如需改进可按「同 kind+归一化消息」聚合。
4. **[观察] CLEANUP_OTHER_INSTANCE 分支难命中**：心跳是单值文件且 snapshotScript 开头自写（自己 PID），快照失败清扫读到「最后写者=自己」→ 实际保护由 FRESH_LOCK（5 分钟新锁让路）承担——保护效果等价（不清扫对方的锁），但「另一个 DSH 实例（PID n）」文案在快照路径几乎不可达。若想让该分支可观测，可考虑心跳按「实例实例表」或多值化（成本收益待评估，不阻塞发版）。
5. **[UI 可选] 管理列表删除后不即时刷新**：「已删除」toast 后需手动点「刷新」。可用性可接受。

**发版判定**：Windows 侧一〜四节通过，**阻塞项仅剩第五节 WSL**（POSIX 分支实弹）。缺陷 1 建议随环境诊断批次修复后一起发（属同批次质量范围，改动极小）。

## 2026-08-29 WSL 侧（第五节，同日续）

- **环境**：WSL2 Ubuntu 26.04（GNU coreutils + bash 5）｜ node v22.22.1 / pnpm 11.23.0 / git 2.53.0 ｜ dsh 0.1.1-rc.2（用户级安装 `~/.npm-global`，与 Windows 侧及 reference 镜像一致）｜ 插件以**工作区复制**方式放 WSL ext4 `~/src/dsh-recall-plugin`（tar 复制，排除 node_modules/.git——9p 排除项见清单前置准备），profile link 模式 + 自备 `@deepseek-ai/{schemastery,dsh-settings}` symlink（I11）｜ dsh web 127.0.0.1:3090（双实例测试临时加 3091）｜ 测试工作区 `~/ws/smoke-中文路径`
- **结果**：9 项通过（7 完整 + 2 带说明[双实例 OTHER_INSTANCE 直弹替代 UI 命中路径；M1 ×N 交错局限复现]）+ 四级清扫出口直弹实弹全 PASS；执行方式：浏览器实弹（IAB 自动化）+ API 直调 + WSL 侧 node 直弹 POSIX 模板（`killOrphansScript` 生成 bash 后以真实 bash 执行断言四级出口）+ 三次重启 dsh-web（MIGRATE_OK / BOTH_PRESENT / 双实例）
- **前置搭建备忘**（复验用）：WSL 内 sudo 需密码 → npm 用户级 prefix（`~/.npm-global`，bash -lc 读 `~/.profile` 的 PATH）；凭证从 Windows `~/.dsh/.credentials.yaml` 复制（两侧 `~/.dsh` 互不相通）；headless 会话（`dsh --profile headless`）在目标 cwd 跑一次即可把工作区注册进 web 工作区树

**发现（按严重度）**：

1. **[缺陷·中] 双实例并发 saveIndex 的 tmp-rename 竞态（POSIX 实锤，Windows 同根）**：A/B 双实例启动预热并发 saveIndex → `recall saveIndex failed: mv: cannot stat '…/index.json.tmp': No such file or directory`——一方 rename 把 tmp 消费掉，另一方 rename 落空报错。Windows 侧执行记录「曾偶发一次 Move-Item: index.json.tmp does not exist」即同根，本轮复现实锤。影响有限（内存索引仍在、下次写索引自然自愈），但双实例常态下会反复刷错误。修复方向（小改）：rename 对 ENOENT 容忍为成功（tmp 已被同伴 rename 走 = 索引已落盘，目标语义已达成）；pwsh 版 `Move-Item` 同理。
2. **[观察] UI 消息路径的 OTHER_INSTANCE 不可达性 POSIX 与 win32 完全一致**：心跳单值文件 + snapshotScript 开头自写宿主 PID → 失败清扫永远读到「自己」→ 实际保护由 FRESH_LOCK 承担（锁未被清、双进程存活、B 侧零错误，效果等价）；`CLEANUP_OTHER_INSTANCE` 分支（bash `kill -0` 探活 + TTL）以直弹模板实弹验证通过。Windows 侧发现 4 的结论在 POSIX 侧原样成立。
3. **[观察] 快照主链路对 config.lock 免疫**：`git add/write-tree/commit-tree/tag` 均不读 config 写锁，config.lock 只影响 ensureGit 的 `git config` 写（重启后首条消息窗口）。环境演练造锁必须用 `index.lock`（add 写索引必撞）——本轮先用 config.lock 撞了个寂寞（快照正常成功），换 index.lock 后才命中。
4. **[观察] ×N 相邻去重交错局限 POSIX 复现**：lock 失败与 FRESH_LOCK 让路记录成对交替，两组 lock 错误 count 各=1 未合并——与 Windows 侧发现 3 同款设计权衡，非新问题。
5. **[观察] ensureGit 冷启动首消息与预热并发的 mkdir 瞬态错误**：首条消息 `git init` 与启动预热并发时输家报 `fatal: cannot mkdir …/git: File exists`（两个 init 竞态），下一消息自动恢复。窗口极小（冷启动首消息才可能撞），自愈无损；如需根治可让 init 对已存在目录的 EEXIST 容忍（`git init` 本身幂等，竞态在 mkdir 检查链）。

**发版判定**：第五节 WSL 全部通过，冒烟清单**无剩余阻塞项**。随批次建议修复两个小改缺陷：缺陷 1（PS 5.1 读编码，已修复待发）+ WSL 发现 1（saveIndex tmp-rename 竞态，未修）；其余均为观察项不阻塞。测试产物（WSL `~/src/dsh-recall-plugin`、`~/ws/smoke-中文路径`、store 容器 `eecc4753…`）保留供复验。

## 2026-08-29 修复实施（同日，测试发现问题的代码修复）

- **修 1（WSL 发现 1，saveIndex tmp-rename 竞态）**：`store.js` 新增模块级 `isTmpConsumedError`（POSIX mv / pwsh Move-Item 的 ENOENT 文案 + 必须 tmp basename），`writeTextViaShell` 的 rename 步经 `renameTmpQuietly` 容忍——**安全性依据**：能走到 rename 前提是写侧已完整成功（POSIX set -e / pwsh EAP=Stop 任一写步失败直接抛），tmp 消失只能是同伴把完整内容 rename 到目标，本侧写语义已达成；不进 recordError（消除刷屏），console.error 留诊断。单测 `store-write.test.js` 6 项（三平台文案/短文案/非 ENOENT/空值边界）。
- **修 2（WSL 发现 5，ensureGit init 竞态）**：`scripts.posix.js` ensureGitScript 的 `[ -d "$g" ] || git init` 改为「HEAD 不在才 init，init 失败复查 HEAD——同伴建成则继续，否则带 stderr exit 1」；检查 HEAD 而非目录（半截目录由 init reinit 补齐）。pwsh 版有意不动：native 非零不抛（I14）下竞态天然容忍、真失败由快照 add 显式检查兜底（模板注释已写明，防未来误「对称」）。WSL 直弹 4 场景 PASS（空 repo/幂等重跑/半截 repo 补齐），重启实例后首条消息端到端快照成功零错误。契约钉入 scripts-contract。
- **修 3（Windows 侧发现 2，rebuildOrphans time=0）**：两平台新增同名 `listTagsWithTimeScript`（`for-each-ref --format='%(refname:short) %(creatordate:unix)'`，lightweight tag 的 creatordate 即 commit 日期），`snapshots.js` 新增 `parseTagsWithTime` 纯函数，重建条目 time 从 tag creatordate 恢复（解析失败回退 0 保留旧行为）。WSL 直弹对真实容器验证 5 tag 全部带正确时间戳。契约钉 + parse 纯测 + rebuild time 恢复工厂级断言入 `snapshots-persist.test.js`。
- **不修（查实或维持现状）**：「删除后不即时刷新」查实机制已在位（client `run()` 成功即 `refresh()` + Host 删除后 `listCache.items = null`）——现象为异步列表重取的感知问题，不改码；OTHER_INSTANCE UI 路径不可达（心跳机制重设计，成本高收益低，两轮判定不阻塞）；×N 交错去重（设计权衡防跨类挤占）；config.lock 免疫（认知记录，非缺陷）。
- **验证**：`npm test` 224 项全绿（新增 12）；修复文件同步 WSL 副本 + 重启 dsh web 回归（status 零错误、管理列表 4 条、安全 tag 不在列表、新消息快照成功）。

## 2026-08-29 v2.1.1 本机验证（第六节，issue #12 换行符字节保真）

- **环境**：Windows 10 22H2 ｜ dsh 0.1.1-rc.2 ｜ dsh-recall-plugin **npm 模式** 2.1.0 → 2.1.1（`pnpm add dsh-recall-plugin@^2.1.1`；注意 `pnpm update` 未在 ^ 范围内自动跟进新版本、下载 0，须显式 add）｜ dsh web 127.0.0.1:3080（v2.1.1 已发布：commit 9f216f5 + npm + GitHub Release）｜ 测试工作区 `D:\workspace\dsh-plugin\issue12-verify`（.gitattributes `* text=auto` + `secret.txt export-ignore`；lf.txt=LF / crlf.txt=CRLF / secret.txt），本机 system gitconfig `core.autocrlf=true` 即复现环境
- **结果**：第六节 3 项必测全过 + POSIX 抽查 △（可选项未跑 WSL；POSIX 模板已在发版前 Git Bash 实弹 final-e2e 14 项通过，同一修复路径）。链路：2.1.0 造存量（消息 1 快照 13dccca3：crlf.txt blob=LF 归一化、无 info/attributes——预修复状态复现）→ 升级 2.1.1 重启 → 消息 2（快照 65e4b016）自动迁移：`info/attributes` 固化、`attrs-v1.stamp` 生成、crlf.txt blob 恢复原始 CRLF → API 直调 preview/execute 两轮回退：① 回退到 65e4b016 三文件逐字节还原（lf.txt=LF、crlf.txt=CRLF、secret.txt 恢复——export-ignore 不再静默漏文件）；② 回退到旧快照 13dccca3：lf.txt 恢复为 LF（**原始症状回归钉**——修复前 archive 会转 CRLF），crlf.txt=LF 属已知限制（旧 blob 已归一化，信息在捕获时已丢失）。全程 `status` 零错误；2 消息快照 + 2 安全快照（snap-pre-rollback-*，H1 救援机制正常）齐全；迁移标记持久。
- **发现（过程性，不影响发版）**：
  1. `TaskStop`/杀 bash 包装停 dsh-web 会留孤儿 node 进程占 3080（EADDRINUSE），须 `netstat -ano` 找 PID 后 `taskkill /F` 再重启。
  2. web UI 输入区/发送按钮的 Playwright click 全部超时（疑似透明覆盖层拦截指针），fill 正常；改用页面内 `evaluate` 对发送按钮触发 `.click()` 成功发送。headless profile 不挂 recall 插件，造消息只能在 web UI（headless 会话仅用于把工作区注册进工作区树）。
  3. AGENTS.md「发布后 npm 模式跑 `pnpm update dsh-recall-plugin` 验证新版」实测不生效（pnpm 元数据缓存或解析策略，`^2.1.0` 范围内不跟进 2.1.1）——验证新版请用 `pnpm add dsh-recall-plugin@^<新版>`。

## 2026-08-29 PF 批次实弹（第七节，同日续）

- **环境**：Windows 10 22H2 ｜ dsh 0.1.1-rc.2 ｜ dsh-recall-plugin **link 模式**（profile 改 `link:D:/workspace/dsh-plugin/dsh-recall-plugin` + pnpm install，工作区即运行代码，commit 3b1867b + 诊断留痕 2fb4ad3）｜ dsh web 127.0.0.1:3080（本轮重启 3 次：link 生效 / PF-2 重启读回+PF-5 init / corrupt 演练）｜ 测试工作区：冒烟测试工作区（中文路径，30 条消息）、pf3-large-ws（新建，10002 文件 + Everyone-deny 目录）、issue12-verify（复用）
- **执行方式**：API 直调（curl/页面内 fetch）+ 浏览器实弹（UI 撤回、30 条消息连发、设置页快照管理树）+ 影子仓库 git ls-tree/for-each-ref 磁盘对账
- **结果**：9/9 通过（各项结果已注在清单第七节；PF-8 冷读口径环境受限已注明）。**发版判定：冒烟清单无剩余阻塞项，PF 批次可发版（minor 语义：PF-1/PF-6/PF-7 含行为变化与 client 改动）**。

**发现（按严重度）**：

1. **[异常·中，未复现] stale 一次约 29 分钟未自愈**：21:06 家族消息快照落盘后，manage list 连续多次调用持续返回 stale:true + 旧视图（31 条，不含新快照），21:35 自行恢复为 fresh（63 条）。期间 lineage/preview（同队列或同 dumpStores 链路）均秒级正常，dsh-web 日志零输出——`refreshListCacheInBackground` 与 `dumpStores` 的 silent catch 把一切失败/挂起吞掉，无法定位根因（疑方向：某次 dump shell 挂起占住后台刷新 in-flight promise 或串行队列）。**已修复观测性**（2fb4ad3）：两处 catch 补 console 留痕，复发时看「recall list refresh failed」/「recall stores dump failed」。健康路径复验正常（stale 窗口 2-9ms 秒回、~4s 刷新补上、790ms 完成日志）。
2. **[口径备忘] index `time` = 消息事件时间，非快照完成时间**：`captureSnapshot(sessionId, messageId, time)` 的 time 由事件侧传入；完成时间看 tag creatordate（秒级）。因此外部分解口径：click→事件（dsh 管线，实测均值 ≈3.8s）+ 事件→脚本起点（Host 准备 ≈0.6s）+ 脚本→tag（插件段 ≈0.6-1.6s，与合成基线 1.19s 同量级）。
3. **[备忘] manage messages 端点入参形态**：`{op:'messages', requests:[{sessionId,messageId},…]}`（数组，非裸 sessionId），返回 `{messageTexts:{<mid>:text}}`。
4. **[观察] pf3 store 出现 root.txt.tmp 残留**：与 WSL 发现 1（saveIndex tmp-rename 竞态）同族的 tmp 边角——headless 注册与 web 实例并发写同 store 时的输家残件；无害（读侧忽略 tmp），不阻塞。
5. **[备忘] 首条万文件快照 ≈52s**（10k 新 blob 哈希+写对象的固有 git 成本），增量快照 2-3s、preview 3.03s——大工作区首开慢是 git 行为，非插件回归。
6. **[操作备忘] web UI 大量按钮有透明覆盖层拦截 Playwright click**：全程用页面内 evaluate 触发 click（发送/设置/树展开均如此）；headless profile 会话（`dsh --profile headless "…"` 在目标 cwd 跑一次）可注册新工作区进 web 工作区树，弥补「添加工作区」原生文件夹选择框无法自动化。

**测试产物**：冒烟测试工作区（含 PF-9 文件 冒烟排除-pf9.txt）、pf3-large-ws（10k 文件 + store 2 快照）、issue12-verify，供复验，可随时清理；exclude.txt 已恢复为空、pf3 locked-dir ACL deny 已移除。

## 2026-08-30 发版（v2.2.0）与发版后快照清理事件

- **v2.2.0 发布**：提交 3f55da4（版本号+CHANGELOG 定版）+ tag v2.2.0 + npm publish + GitHub Release；发版前四道门禁全绿；发布后本机 npm 模式验证通过（status 零错误、list 正常）。
- **发版后快照清理事件（01:56）**：除「有活跃会话的工作区」外的快照店发生 tag purge + index 清空（sweep 签名：safety tag 保留、消息快照清光）。代码取证：设置页「立即 gc」→ runGcAll → sweepDeletedSessions 无条件执行（runGc 消息路径的 50 拍/24h 门控与 gc.stamp 跨重启加载均正常，runGcAll 无门控），对「不在 live 注册表且不在 listSessions」的会话逐一 purge。**待用户确认**：若测试会话是用户在 UI 里删的，purge 属「会话删除联动清 tag」设计行为（会话日志已从磁盘消失，与该假设吻合）；若用户未删过会话，则为 2.2.0 误清 bug（listSessions 冷态漏报），需 2.2.1 热修（sweep 对候选补 readSession 复核）。
- **恢复**：冒烟测试工作区 33/33、smoke space 1/1 快照从不可达 commit 抢救（commit message 内嵌 messageId），tag 重建 + index 回写（sessionId 置 null，sweep 免疫，树中落「已删除会话」组）+ 全量 bundle 固化于 `~/.dsh/recall-incident-backup-20260830/`（含事件档案 README.md）。pf3 的 2 条测试快照在恢复窗口内被后续 gc 剪除（不可恢复，可弃）；issue12 的 2 条为 PF-6 验证时有意删除，未恢复。
- **教训**：①联动清理的破坏半径 = 「立即 gc」按钮一键触达全部 store 的已删会话快照，且 purge 前无二次确认——UX 层面值得加确认或让 runGcAll 的 sweep 跳过最近 N 分钟仍被索引引用的会话；②影子库 commit message 内嵌 messageId 是最后的数据恢复通道（tag 名丢失后仍可从 `git fsck --unreachable` 完整重建映射），这个设计救了 34 条快照。

## 2026-09-04 设置页 UI 批次冒烟（第八节）

- **环境**：Windows 10 ｜ dsh 0.1.2-rc.1 ｜ dsh-recall-plugin **link 模式**（profile 依赖临时改 `link:D:/workspace/dsh-plugin/dsh-recall-plugin` + pnpm install --no-frozen-lockfile；冒烟后已还原 npm 模式 `^2.3.1`，切换前备份 `package.json.bak-20260904`）｜ dsh web 127.0.0.1:12789（`--no-open --port 12789` + 一次性 token URL，browser-trust 围栏须带 token）｜ 测试数据：既有工作区「test」7 会话 9 快照（含 v1/v2/v3 版本家族，实数据覆盖树/确认条/操作区路径）
- **执行方式**：浏览器自动化（browser_use 子代理两轮）+ DOM/CSS 计算样式求值 + 注入等价 `@media(max-width:480px)` 样式模拟窄屏（工具无 CDP 视口仿真、`window.resizeTo` 被主窗口拦截）；功能回归走真实改-存-回读链路；浏览器控制台零报错
- **结果**：V1–V9 全部核验通过（含一轮「疑似不通过」经复核澄清为设计差异）；浅色/深色双主题对照通过；剩余 3 项人工复核（真实窄视口终验 / 真实键盘 Enter/Space / 读屏播报）

**逐项结论**：

1. **V1 语义色 — 通过**：改为 config-form 保存按钮普通样式、badge-modified 为 warn tert 底 + 浅/深主题色值随令牌正确翻转。
2. **V2 键盘结构 — 通过（真实键触发待人工）**：树折叠钮为原生 `<button class="dsh-recall-tree-toggle">` + `aria-expanded`/`aria-label`；Tab 可聚焦（activeElement 命中）、点击可折叠展开；`:focus-visible` 焦点环规则已注入。自动化合成的 Enter/Space 无 isTrusted 无法触发原生激活，真实键盘需人工复核一次。
3. **V3 禁用态 — 通过（澄清）**：排除配置未修改保存按钮 `disabled=true` + `opacity:.5` + hover 无色变（css 规则级证据）；配置表单保存按钮未修改可点、点击提示「没有修改」——**既定设计差异**（ConfigForm 未用 dirty 禁用，与 ExcludeCard 不一致，V3 计划未要求改），代理一度误判「不通过」，复核确认非缺陷。
4. **V4 Grid — 通过**：`.dsh-recall-cfg-row` computed `display:grid`、双列 52px/462px，label/控件分列对齐，卡片与页面均无横向溢出。
5. **V5 顺序 — 通过**：操作区按钮实测 刷新 → 立即 gc → 全部删除（danger 末位、在立即 gc 之后）。
6. **V6 健康/错误 — 通过**：`dsh-recall-health-pill-ok`「git 可用」绿色实测 rgb(34,197,94)；「最近错误」区当前无错误不渲染（有则显示，规则与逻辑均在）。
7. **V7 排版 — 通过**：无溢出、树行 ellipsis 正常，字级微调在双主题视觉对照内无回归。
8. **V8 窄屏 — 通过（模拟等价，真实视口待人工）**：注入等价 480px 样式后表单单列（522px）、快速添加输入 `flex:1 1 100%` 独占一行、无横向溢出；运行时改真实视口受工具限制。
9. **V9 确认条 — 通过**：点叶子「删除」原位出确认条，确认=`dsh-recall-ex-chip-danger`、取消=普通 chip；点取消关闭且未误删（计数归 0）。

**发现（按严重度）**：

1. **[观察·不阻塞] 浏览器自动化能力边界**：无 CDP 设备仿真/真实视口调整，合成键盘事件无 isTrusted——窄屏 400px 终验、Enter/Space 真实键触发、读屏（Narrator/NVDA）播报均留人工复核（环境受限，非产品缺陷）。
2. **[观察（设计差异，非缺陷）] ConfigForm 保存按钮未做 dirty 禁用**：与 ExcludeCard 的模式不一致（其 dirty 判定 → disabled）；计划 V3-1 只要求 disabled 态 css 可识别。如未来统一，可给 ConfigForm 补 dirty 判定（复用 ExcludeCard 现成模式），超本期范围。
3. **[过程备忘] 浏览器自动化工具无法直接点击被透明覆盖层拦截的按钮**与上轮（第八节外）一致：全程用页面内 evaluate 触发 click；dsh settings 页「通用」外观切浅色/深色可用（本轮浅色对照已还原深色）。

**发版判定**：设置页 UI 批次（V1–V9）冒烟基本通过（自动化全覆盖 + 双主题 + 功能回归零报错）；剩余 3 项人工复核（真实窄视口、真实键盘 Enter/Space、读屏播报）不阻塞代码质量，随发版前人工冒烟补齐。计划文档保持「已实施（待冒烟）」留 pending/，人工项完成后移入 completed/（按 docs 生命周期第 2 条同步三处链接）。
