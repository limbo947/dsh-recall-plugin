# 冒烟测试待办清单

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：**第一〜七节均已执行通过（2026-08-29：Windows + WSL + v2.1.1 本机验证 + PF 批次实弹；执行记录见 [smoke-checklist-records.md](./smoke-checklist-records.md)）**
> 范围：必须在真实 DSH web 环境实弹验证的项。单测（212 项）、`verify:host`、`check:dsh` 已覆盖的逻辑正确性与装配正确性不在此重复；本清单 = AGENTS.md 常规回归路径 + 各已实施计划（`completed/`）验收标准中「需活体验证」的项。
> 环境准备：Windows 侧确认 `~/.dsh/profiles/web/package.json` 的 `dsh-recall-plugin` 依赖处于 **link 模式**（改代码联调，工作区 `lib/` 即已装代码，改完重启 dsh-web 生效）；npm 模式下跑的是 registry 旧版，验证新版前须 `pnpm update dsh-recall-plugin` 或切 link 模式。**WSL 侧前置准备见第五节**（POSIX 分支实弹，阻塞环境诊断批次随 minor 发版）。
> 全部通过后：本文件与 `smoke-checklist-records.md` 一起移入 `completed/`，并按 docs/README.md 生命周期约定同步总索引链接。

## 一、常规回归（Windows 侧，每版必跑，来源 AGENTS.md 冒烟路径）

- [x] 中文路径工作区：发消息出快照 → 改文件 → 撤回——清单正确、文件恢复、对话回退、标题不变（无「xxx 2」递增，I6 回归钉）✅ 清单「修改 1 · 恢复 1 · 删除 1」与影子 git diff 完全一致；文件三态恢复；fork 后对话正确截断、消息文本回填输入框（refillDraft）；标题继承不递增；回退前自动安全快照（snap-pre-rollback-*）
- [x] 设置页快照管理：树形展开/折叠、叶子消息内容、三级/批量删除、立即 gc ✅ 树两层 toggle 正常；叶子消息文本补齐；快照级/会话级/全部删除三级确认面板文案各自正确（会话级实删 5 条、Host 侧 tag 清零核对）；「gc 完成」且占用 2.1→1.9 MB；「最近错误」面板可见
- [x] 冷启动：撤回按钮出现（I22 ensureInit 时序）；快照管理列表冷会话标题/消息两段式补齐（I19）✅ 重启后撤回按钮 5 个出现；冷会话标题与全部叶子消息文本补齐。注：corrupt 重建条目 time=0 导致叶子时间前缀缺失（见执行记录改进项 2）
- [x] 回退保护：agent 运行中预览/撤回被拒（AGENT_BUSY）；预览后改文件再 execute → STALE 提示重新预览（P0-1/P0-3 回归）✅ sleep 45 工具运行中 API 直调 preview/execute 双双返回 AGENT_BUSY「Agent 正在运行中，请先停止后再撤回」；预览后改文件再确认 → 未用过期数据执行，面板自动重新预览（清单 1 文件 → 2 文件刷新）

## 二、竞品改进批次（Windows 侧，[plan-competitor-improvements](../completed/plan-competitor-improvements.md) + [plan-competitor-fixes](../completed/plan-competitor-fixes.md)）

- [x] **H1 救援实弹**：人为制造 rollback 失败（回退期间占用文件锁等）→ 工作区自动恢复到回退前状态，提示含「已自动恢复」；status「最近错误」可见 rescue tag 记录 ✅ 目录占位法（同名目录挡住恢复文件）→ rollback Expand-Archive 失败 → rescueScript reset 成功；工作区跟踪文件全部恢复回退前；status 记录「recall rollback failed, rescued to safety tag: snap-pre-rollback-*」；message 含「已自动恢复到回退前的安全快照，请重新预览后重试」
- [x] **rescue 失败兜底**：继续制造让救援也失败的场景 → 手动恢复命令可直接复制执行成功（含**空格路径**工作区验证，fixes F-S1 第 2 条）✅ 文件锁法（FileShare.None 锁住 conf.txt）→ rollback 与 rescue 双失败 → message 返回「自动恢复也失败，请手动执行：git --git-dir=... --work-tree=... reset --hard <tag>」路径全带引号；空格+中文路径工作区释放锁后实弹执行该命令 exit=0、文件恢复
- [x] **H2 索引损坏演练**：手工破坏 index.json（写半截 JSON）→ 重启插件 → 快照/撤回仍工作，设置页错误列表出现「recall index corrupt」告警，坏文件保留为 `.corrupt-<ts>`，孤儿重建恢复快照列表 ✅ 两次实弹：①意外真实触发（根因见执行记录缺陷 1）②手工半截 JSON 标准演练——告警、`.corrupt-<ts>` 隔离、manage list 重建（39 条）、后续快照正常且索引重新落盘，全链通过
- [x] **H3 错误文案三场景**：无快照撤回 / STALE / AGENT_BUSY 的 client 文案与按钮行为正确 ✅ NO_SNAPSHOT「该消息没有可用的项目快照」（API 实弹 + snapshot-info has:false）；AGENT_BUSY 文案（preview/execute 双拒绝）；STALE 防护自动重新预览；另有首条消息文案「该消息是本会话中第一条用户消息，无法回退对话；确认后仅回退项目文件」与实际行为一致
- [x] **R2 API 直调**：全部端点（init/snapshot-info/preview/execute/exclude-\*/config-\*/manage/status/lineage-record）直调返回形状正常 + 撤回全链路 ✅ 13 端点全验（init notice.config、exclude-get/set、config-get/set、manage list/titles/messages、lineage-record、unknown endpoint 404）；撤回全链路在多个会话多次实弹

## 三、环境诊断批次（Windows 侧，[plan-env-diagnostics](../completed/plan-env-diagnostics.md) M1/M2，验收标准第 2/3/4/6 条）

- [△] **git 缺失可见化**：临时隐藏 git（改 PATH）后发消息 → status 错误列表出现「未检测到 git CLI」条目且重复计数（×N）；init notice.gitMissing=true、撤回按钮不出现；恢复 PATH 后下一条消息自动恢复 —— **无法构造真缺失**：resolveGitScript 除 PATH 外含标准安装位置兜底（`%ProgramFiles%\Git\cmd\git.exe` 等），改 PATH 无效（设计使然，兜底逻辑本次实弹命中验证 ✓）。逻辑层（ensureGit 失败 → 分类 → feedback/recordError）由单测钉（diagnostics/snapshots-persist）；gitMissing=true 的 UI 表现未实弹，留待有可控环境时补
- [x] **锁冲突 toast**：制造 config.lock 后发消息 → 近 5 分钟消息上弹「快照失败：疑似多个 DSH 实例并发使用同一快照库…」，文案 ≤140 字符、不含原始路径（界面侧实弹，单测已钉文案内容）✅ toast 实弹捕捉成功；同时验证新锁让路（CLEANUP_SKIPPED_FRESH_LOCK 记录 + 锁保留）
- [△] **重复计数展示**：设置页「最近错误」同错误显示「××（×N）」，其他错误条目不被同一错误挤掉（issue #11 刷屏症状回归）—— 去重逻辑由单测钉（相邻重复只更新 count）；实弹中锁错误与「让路」记录**交错**出现导致各自 count=1（相邻去重的已知局限，见执行记录观察 3）；纯重复场景依赖 git 缺失构造，同上未实弹
- [x] **status 新字段**：响应含 `storeBase`（快照存储根）与每条错误 `hint`（curl /api/recall/status 即可）✅ storeBase 常在；hint 在 lock 类错误实弹返回（ENV_HINTS.lock 原文）

## 四、M3 并发治理（Windows 侧，[plan-env-diagnostics](../completed/plan-env-diagnostics.md) M3）

- [x] **双实例互不误杀**：两个 dsh 实例开同一工作区 → 制造锁冲突 → 一方 status 出现「另一个 DSH 实例（PID n）正在使用此快照库，失败清扫已让路」，确认双方 git 进程均存活、锁未被对方删除 ✅ 核心目标达成：第二实例（:3081）同工作区并发快照竞态，双方各记录 lock 失败、锁从未被对方删除、双方宿主进程存活、失败后各自自动恢复。「另一个 DSH 实例（PID n）」特定文案未实弹命中——心跳为单值文件且 snapshotScript 开头自写覆盖，快照失败清扫实际总落 FRESH_LOCK 分支（同样达成不清扫对方；见执行记录观察 4）
- [x] **心跳刷新**：store 目录下 `heartbeat` 文件存在，内容「宿主 PID + epoch 秒」，随每条消息快照刷新 ✅ 多次验证（PID 与 dsh 宿主 node 进程一致；安全快照/新实例预热也刷新）
- [x] **分级不清扫正常路径**：制造 >5 分钟陈旧锁 + 无另一实例 → 失败清扫照常杀孤儿、清锁（CLEANUP_DONE，分级不挡正常清理）✅ 6 分钟前时间戳的锁 → 快照失败 → 锁被清扫删除 → 下一条消息快照成功

## 五、WSL 必测（POSIX 分支实弹，阻塞环境诊断批次随 minor 发版）

> **为什么必须**：M1/M2/M3 新增的 POSIX 代码（旧容器迁移脚本、心跳写入、分级清扫 bash 版）从未实弹执行——单测只钉文本形状与纯函数（CI ubuntu 已跑逻辑层），bash 的真实行为（coreutils/进程/文件系统语义）只有实弹能暴露，I16/I18 都是实弹踩出来的。win32 与 POSIX 是**完全不同的两套脚本模板**，Windows 侧一〜四节覆盖不了本节，反之亦然。

### 前置准备（WSL 侧环境独立搭建，Windows 的 profile 机制不跨 WSL）

1. **WSL 内安装 DSH**：报障环境即 WSL2 内运行 DSH。WSL 内 `npm i -g @deepseek-ai/dsh`，版本与 Windows 侧（及 reference 镜像归档版本）保持一致；注意 WSL 的 `~/.dsh` 与 Windows 互不相通。
2. **插件接入 link 模式**：建议先把本仓库 clone 进 WSL ext4（`/mnt/d/...` 走 9p 文件系统，IO 慢且权限语义与 ext4 不同，git/shell 密集型插件验证会明显失真）；在 WSL 的 `~/.dsh/profiles/web/package.json` 把 `dsh-recall-plugin` 依赖配为 `link:<仓库路径>` 后 pnpm install。
3. **link 安装自备 `@deepseek-ai` 链接**（I11：Host import 按模块真实路径解析，Linux 的 link: 安装不会自动带 junction/symlink）：从 WSL 的 dsh 安装目录把 `@deepseek-ai/schemastery`、`@deepseek-ai/dsh-settings` symlink 进插件工作区的 `node_modules/@deepseek-ai/`。
4. **测试工作区**：WSL 本地路径（如 `~/ws/smoke-中文路径`，中文路径一并覆盖）；重启 dsh-web 生效。

### 测试项

- [x] **常规回归主链路（bash 模板实弹）**：中文路径工作区发消息出快照 → 改文件 → 撤回——ensureGit/snapshot/diff/rollback 的 POSIX 模板整条链路、排除同步、SNAP_SKIP 提取、对话回退与标题不变 ✅（中文路径容器 `eecc4753…` root.txt 映射正确；创建 hello.txt → 撤回：预览「删除 1」、文件回删、对话回退、`snap-pre-rollback` 安全快照、tag 全保留；SNAP_SKIP 无超大文件场景未触发提取路径——单测已钉，实弹留待有场景补；sessionTitle 环境本身「unavailable」，I6 无标题可递增，记录局限）
- [x] **M2 三档回退（全新装机，I24）**：清掉 WSL 内 `~/.dsh/dsh-recall-snapshots` 与旧容器后发消息 → store 落 `~/.dsh/dsh-recall-snapshots/<hash>`，不落 `~/dsh-recall-snapshots`（可选：`export DSH_HOME=...` 验证前两档仍优先于第三档）✅（全新装机状态天然成立；`~/dsh-recall-snapshots` 确认不存在；DSH_HOME 前两档可选验证未做）
- [x] **M2 迁移 MIGRATE_OK**：预置旧容器 `~/dsh-recall-snapshots`（含历史快照）且新容器不存在 → 首次启动整容器自动迁移，历史快照仍在管理列表，根级 exclude.txt 语义无损 ✅（新容器整体 mv 为旧容器后重启：一次性搬回规范位、3 tag 全保留、旧容器消失、管理列表 2 条历史快照在、无错误）
- [x] **M2 迁移 BOTH_PRESENT**：双容器并存 → 沿用旧位、数据不丢、「最近错误」记录并存事实 ✅（storeBase 指向旧位、错误文案「新旧容器并存…沿用旧位，未做任何改动」、新容器 git/index.json 原封未动；旧位按需新建空容器属正常行为）
- [x] **M3 心跳 POSIX 版**：发消息后 store 目录 `heartbeat` 文件内容为「PID + epoch 秒」且随消息刷新（bash printf/date 写入路径）✅（`315 1787950531` → `299 1787952014`，随消息刷新）
- [x] **M3 双实例互不误杀（kill -0 探活路径）**：两个 dsh 实例开同一工作区 → 制造锁冲突 → 一方 status 出现「另一个 DSH 实例（PID n）…让路」，双方 git 进程存活、锁未被对方删除 ✅（**[△] 命中路径说明**：`CLEANUP_OTHER_INSTANCE` 分支以直弹模板实弹验证（心跳=活 PID → bash `kill -0` 命中 → 让路且锁保留，PASS）；UI 消息路径因心跳单值文件被 snapshotScript 开头自写覆盖，实际由 `CLEANUP_SKIPPED_FRESH_LOCK` 承担保护——与 Windows 侧结论一致，效果等价（锁未被清、A/B 双实例进程均存活、B 侧 status 零错误））
- [x] **M3 陈旧锁正常清理**：制造 >5 分钟陈旧锁且无另一实例 → 失败清扫照常清理（find -mmin 分级不挡 CLEANUP_DONE）✅（直弹：10 分钟前 `config.lock` + `refs/heads/x.lock` → `CLEANUP_DONE` 且两锁均删净；find -mmin 分级 + 陈旧 per-ref 锁 find -delete 实弹）
- [x] **M1 锁冲突实弹（issue #11 原始场景）**：报障同款环境复现——toast 显示可行动提示（≤140、不含原始路径）+「最近错误」去重计数 ✅（**[△] 去重计数部分**：`index.lock` 撞锁 → 消息上 toast「快照失败：疑似多个 DSH 实例并发使用同一快照库…」命中（约 76 字符、无路径、含可行动指引）、status 错误 `kind=lock` + hint 正常；两次撞锁 count 各=1 未合并——lock 失败与 FRESH_LOCK 让路记录成对交替打断相邻去重，与 Windows 侧观察同款已知权衡）
- [x] **API 抽查**：curl /api/recall/status 确认 storeBase / hint 字段在 POSIX 侧返回正常 ✅（storeBase 全程正确含 BOTH_PRESENT 场景；hint 随 kind 附带）

### 局限（WSL 覆盖不了的部分）

- WSL2 = GNU coreutils + bash 4/5，**不代表 macOS**：BSD find/date 语义与 bash 3.2 约束是设计期核对（模板按 bash 3.2 约束编写），darwin 侧待有 macOS 环境再补实弹。
- WSL 内 dsh 版本须与本机 reference 镜像/目标发布版本对齐，否则字段类结论不外推。

## 六、issue #12 换行符字节保真（Windows 侧必测，发版前置；POSIX 抽查可选）

> 修复：影子仓库固化 `info/attributes`（FIDELITY_ATTRS，I26）+ snapshotScript 一次性 renormalize 迁移（attrs-v1.stamp）。实验矩阵与真实模板端到端（2026-08-29）已 16 项全过，本节是真实 DSH 链路的活体验收。环境注意：本机 system gitconfig `core.autocrlf=true`（Git for Windows 默认）正是复现环境，无需构造。

- [x] **存量仓库迁移**：升级前先用带 `* text=auto` 的 `.gitattributes` 工作区发消息出快照（CRLF 文件在影子仓库 blob 里是 LF）→ 升级插件重启 → 再发一条消息 → 检查影子仓库 `git/.git/attrs-v1.stamp` 已生成、新快照 blob 与磁盘字节一致（`git cat-file` CRLF 文件仍为 CRLF）✅ 2.1.0 造存量（快照 13dccca3，crlf.txt blob=LF 归一化）→ `pnpm add dsh-recall-plugin@^2.1.1` + 重启 → 消息 2（65e4b016）自动迁移：attributes 固化、stamp 生成、crlf.txt blob=CRLF 原始字节
- [x] **回退字节保真（issue #12 原始症状回归钉）**：LF 文件改坏（转 CRLF / 追加内容）→ 撤回到 LF 快照 → 文件逐字节恢复为 LF；CRLF 文件走同流程恢复后仍为 CRLF（修复前 LF 文件回退后变 CRLF）✅ 改坏 lf.txt(CRLF)/crlf.txt(追加)/删 secret.txt → API execute 回退到 65e4b016：lf.txt=LF、crlf.txt=CRLF、secret.txt 恢复，逐字节一致；再回退到旧快照 13dccca3（LF blob）：lf.txt 恢复为 LF（修复前此处 archive 会转 CRLF——原始症状回归钉通过），crlf.txt=LF 属已知限制（旧 blob 已归一化）
- [x] **export-ignore 不再漏恢复**：工作区 `.gitattributes` 加 `<某文件> export-ignore` → 快照 → 删除该文件 → 撤回 → 文件恢复（修复前会从归档静默消失、零报错）✅ secret.txt（export-ignore 声明）删除后回退恢复，preview 清单正确列出 restored
- [△] **POSIX 侧抽查（WSL，可选）**：同款 `text=auto` 工作区发消息 → 撤回 → 解包字节一致（POSIX 的 `git archive | tar` 路径与 win32 的 zip 路径共享同一修复，理论自动生效）——未在 WSL 实弹（可选项）；POSIX 模板已在本机 Git Bash 实弹全生命周期 14 项通过（发版前 final-e2e），attributes 固化与迁移同代码路径

## 七、性能优化批次（Windows 侧必测，发版前置；[plan-performance.md](./plan-performance.md) PF-1〜PF-9）

> 2026-08-29 实施：单测 283 例全绿 + 合成基准（真实模板 + 同形态 spawn）已出前后对比（实施记录节），本节是真实 DSH 链路的活体验收。探针结论：PF-2 落盘走 `OpenStandardInput` 字节流（`Console.In` 在 PS 5.1 按 GBK 解码必挂，I27）；PF-7 titles 半项废弃（SessionHeader 无 title，I28）。

- [x] **PF-1 树指纹校验（秒表）**：预览后不改文件 → 确认回退正常；预览后改文件 → STALE 自动重新预览；秒表对比「确认回退 → done」耗时（基线口径见 plan-performance.md 实施记录，预期约 -1 条重进程）✅ API：preview 返回 treeId；带指纹 execute 通过（3.36s）；改文件后旧指纹 execute → 内容级 STALE（1.48s，免旧版重复 diff 进程）；重预览新指纹恢复。UI：确认→面板卸载 2527ms（execute+fork+归档+回填全链）、回填文本正确
- [x] **PF-2 索引写盘回归**：中文路径工作区连发 10+ 条消息 → 撤回/设置页快照树读取正常（messageText/feedback 无乱码、无丢条目）；重启 DSH 后索引读回无损（stdin 写路径 + PS 5.1 读路径回归）✅ 中文路径 22 条消息连发：index.json 经 stdin 路径落盘、中文 root/messageText 无乱码（messages 端点 23/23 命中）；重启后 63 条索引无损读回；设置页树计数一致
- [x] **PF-3 大工作区预览**：≥1 万文件工作区预览/撤回秒表对比（预期枚举从秒级降亚秒）；含不可访问目录（ACL 异常）的工作区快照不 fatal（fail-open 语义回归）✅ 万文件工作区（10002 文件 + Everyone-deny 目录）：首条快照 event→完成 52s（10k 新 blob 固有 git 成本）；增量快照 2-3s；preview 3.03s；locked-dir 0 文件入树、status 零 fatal（fail-open）
- [x] **PF-4 lineage 秒开**：多工作区快照管理版本家族标记（v1/v2）几乎立即出现（原最后才亮）；撤回 → 版本家族展示不回归 ✅ UI 撤回（fork+lineage 落地）后版本家族 v1/2（父 23 条）+v2/2（子 2 条）正确渲染、标题继承；manage list 首开 372ms；lineage 一次 dump 0.77-0.87s（8 店）
- [x] **PF-5 init 静默**：重启 DSH → 打开页面（init）→ 第二次刷新页面后快照/撤回仍正常（healthy 跳过 rebuild 的回归）；手工把索引改坏（.corrupt 演练）→ 重启后孤儿重建仍恢复（empty/quarantined 档照跑）✅ init ×2（13.5s 冷/1.7s 热）零错误、快照完好；corrupt 演练：`.corrupt-1788011911274` 隔离 +「recall index corrupt」告警 + 孤儿重建 2 条（time 从 tag creatordate 恢复）+ 索引重新落盘
- [x] **PF-6 stale 渐进刷新**：对话进行中连续两次打开快照管理——第二次立即出列表、新快照稍后补上（无全量 dump 等待）；删除 → 刷新立即反映；删除语义以所见为准（stale 期间的新快照不在删除范围内）✅ stale 窗口 list 2-9ms 秒回旧视图（stale:true）、~4s 后台刷新补上新快照；stale 窗口内按会话删除归档会话 2 条快照精确命中、期间新快照（216705da）不被误删；删除后刷新立即反映。异常观察：一次约 29 分钟 stale 未自愈（未复现，详见执行记录发现 1，已补失败留痕）
- [x] **PF-7 sweep 不堵队**：多会话老工作区 gc 触发轮不再逐会话卡顿（秒表对比）；已归档会话（撤回产生）的快照不被 sweep 误清（撤回后立即手动 gc 验证）✅ UI 撤回产生归档会话后立即手动 gc（全 8 店 12.5s）：归档会话 2 条快照保留（gc 前 41 → gc 后 41）、sweep 确认在 runGcAll 路径（maintenance.js sweepDeletedSessions）、status 零错误
- [x] **PF-8 exclude 秒开**：设置页排除配置首开秒表对比（4-6 条 → 1-2 条进程）；中文内容 exclude.txt 编辑保存 → 读回无乱码（base64 链路）✅ 中文 exclude 字节级回环（写→磁盘 UTF-8→base64 dump 读回全等）；热路径 1.6ms；冷读 1.30s 由 8 店 resolveStore 链主导（本环境仅 1 个 exclude 文件，合并读收益不显著——base64 免疫与进程合并本身已验证）
- [x] **PF-9 改排除即时生效（回归钉）**：改 exclude.txt → 下一条消息快照立即按新排除执行；连续 20+ 条消息取均值对比快照耗时（单条收益在噪声以下，须均值口径）✅ 阶段A（未排除）树含 冒烟排除-pf9.txt、阶段B（恢复排除）树无——改排除下一条消息立即生效；20 条消息均值 3782ms（min 3546/max 4176）：主项为 dsh 管线 click→事件分发（≈3.8s），插件段（事件→tag 完成）≈0.6-1.6s 与合成基线 1.19s 同量级，单条收益在噪声以下与文档预判一致

---

> 各节执行记录（日期、环境、结果、发现与发版判定）见 [smoke-checklist-records.md](./smoke-checklist-records.md)；本文件只保留测试项，逐项 ✅/△ 结果注在对应条目上。

