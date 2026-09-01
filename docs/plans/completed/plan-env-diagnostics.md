# 环境错误主动诊断计划（issue #11）

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：**已完成（2026-08-28，M1/M2 与 M3 实施记录见文末）**
> 背景：[issue #11](https://github.com/limbo947/dsh-recall-plugin/issues/11)（WSL2，`recall ensureGit failed: error: could not lock config file … File exists` 刷屏）暴露环境类错误的三重缺口：**不可识别**（原始 git stderr 直接透传，用户读不懂也无法行动）、**不可见**（ensureGit 失败静默 return，不进 snapFeedback，聊天界面零提示，客户端空轮询 20 次后放弃）、**不可止**（recordError 的 20 条环形缓冲被同一错误刷满，其他诊断信息全被挤掉，console.error 同步刷屏）。本计划把环境错误升级为「识别 → 可行动提示 → 用户可见」，并顺手修复排查中发现的 POSIX home 回退漂移（快照落 `~/dsh-recall-snapshots` 而非 `~/.dsh/dsh-recall-snapshots`）。
> 范围：M1（错误分类 + ensureGit/快照失败可见化）、M2（POSIX home 漂移修复 + 旧容器迁移）、M3（并发实例探测 + stale 锁分级）。三者均已实施（2026-08-28）。

## 关键设计决策

| 决策 | 理由 |
|---|---|
| 全程不改 Client 源码、不重跑 `npm run build` | toast 运行时读 `res.error`（[src/client/recall-node.js](../../../src/client/recall-node.js) L203：`'快照失败：' + String(res.error).slice(0, 140)`），Host 把 `error` 字段换成提示文本即生效；`snapshot-info` 端点的 `...feedback` spread（[lib/routes-core.js](../../../lib/routes-core.js) L50）天然透传新增字段，旧 client 忽略未知字段。M1/M2 均为纯 Host 侧改动。 |
| ensureGit 失败不接入 snapFailures 熔断 | 环境类失败（锁冲突等）常可自愈，保持按消息重试；刷屏由 recordError 尾部去重（M1-D3）+ toast 10min 文本节流（[src/client/util.js](../../../src/client/util.js) L129-137）缓解。多实例互踩的根治属 M3。 |
| resolveRoot 为 null 的静默 return（[lib/snapshots.js](../../../lib/snapshots.js) L341-342）不加 feedback | 冷启动时 root 解析可能暂时失败（已知坑 I9），此时弹「快照失败」是误报；该分支最终有 workspaceRoot 兜底，真解析不到的场景极罕见。 |
| 错误分类做成独立纯函数模块 `lib/diagnostics.js` | 仿 [lib/errors.js](../../../lib/errors.js) 的「机器码与人文案分层」：kind 供机器分流（status API、未来设置页过滤），提示文本在 Host 侧生成——client 零改动即可展示。 |

---

## M1 错误分类 + ensureGit/快照失败可见化

### M1-D1 新增 `lib/diagnostics.js`（纯函数，无 ctx 依赖）

导出：

- `classifyEnvError(text)` → `'lock' | 'mkdir' | 'permission' | 'space' | 'git' | null`（不区分大小写）
- `ENV_HINTS`：kind → 可行动中文提示（常量表，供 buildFeedbackError 与 status 端点共用）
- `buildFeedbackError(raw)` → `{ error, kind }`：命中时 `error` 为提示文案；未命中时 `error` 为原文截断（保现状）、`kind: 'unknown'`

分类模式与提示方向（**按根因优先级 git > space > permission > lock > mkdir**，同一文本命中多个时取更接近根因者——如 `Unable to create '…lock': No space left on device` 同时命中 lock 与 space，磁盘满是根因）：

| kind | 模式 | 用户提示方向 |
|---|---|---|
| git | `command not found`、`not recognized`、`git: not found`、`is not a git command` | 未检测到 git CLI 或版本过旧，安装/升级后自动恢复 |
| space | `No space left on device`、`Disk quota exceeded`、`ENOSPC` | 磁盘已满，清理空间后自动恢复 |
| permission | `Permission denied`、`Operation not permitted`、`not permitted`、`Access is denied` | 无写入权限，检查快照目录权限 |
| lock | `could not lock .*File exists`、`Unable to create .*\.lock`、`fatal: cannot lock` | 疑似多个 DSH 实例并发使用同一快照库，请确认只启动了一个；确认后仍失败时，按「设置 · 插件配置 · 最近错误」中的路径删除锁文件 |
| mkdir | `fatal: cannot mkdir .*File exists`、`mkdir: cannot create directory` | 快照目录被同名文件/非目录占用，处理后自动恢复 |

提示文案硬约束（客户端 toast 只显示 `error` 字段、不显示原文，见设计决策第一条）：

- **不嵌原始路径**——#11 的锁路径就 100+ 字符（`/home/kevin/dsh-recall-snapshots/4073…/git/.git/config`），嵌进提示必被 140 截断出残句；详情（含完整路径）由设置页「最近错误」承载
- 目标 ≤120 字符，硬上限 140（客户端 slice(0,140) 前还有「快照失败：」5 字前缀）

### M1-D2 ensureGit 返回值改造：`true/false` → `{ ok, error }`

现状（[lib/store.js](../../../lib/store.js) L409-423）：内部 catch 吞掉错误文本，只 `recordError` 后返回 `false`——`captureSnapshot` 拿到的只有布尔值，分类器无输入。改造：

- 成功路径（含 `gitReady` 命中早退）→ `{ ok: true }`
- **git 缺失分支（L412）**：现状 `return false` 连 recordError 都没有（「git 缺失零提示」盲区，截图用户重启也查不到原因），改为 `{ ok: false, error: '未检测到 git CLI，快照不可用' }` 并 recordError——靠 M1-D3 去重天然免刷屏
- catch 分支 → `{ ok: false, error: String(error) }`（recordError 保留）
- 调用点共 3 处，仅 `captureSnapshot`（[lib/snapshots.js](../../../lib/snapshots.js) L349）解构 error；init 路由（[lib/routes-core.js](../../../lib/routes-core.js) L26）与启动预热（[lib/index.js](../../../lib/index.js) L419）本就忽略返回值，零改动

### M1-D3 recordError 尾部去重 + kind/count 富集

现状（[lib/store.js](../../../lib/store.js) L56-61）：每条消息 push 一条相同错误，20 条环形缓冲几条消息就被刷满（#11 截图症状），console.error 同步刷屏。改造：

- **尾部去重**：新 message 与缓冲末条相同 → 只更新 `time`、`count++`，不重复 push、不重复 console.error；相隔其他错误的重复仍新建条目（保留时序，不全局合并）
- 条目形状 `{ time, message, count, kind }`：`message` 保持原文（去重键 + 宿主日志），`kind = classifyEnvError(message)` 供机器分流
- status 端点返回时服务端拼展示文本：`message + (count > 1 ? '（×' + count + '）' : '')`——现有设置页按 message 渲染，直接显示「××（×47）」，零 Client 改动

### M1-D4 captureSnapshot 打通 toast（两个失败入口都接分类器）

[lib/snapshots.js](../../../lib/snapshots.js) L349-360：

- **ensureGit 失败**（原静默 return）：`const g = await rt.ensureGit(root, store)` → `if (!g.ok) { setFeedback(messageId, { failed: true, ...buildFeedbackError(g.error || '未知原因') }); return }`——客户端轮询到 `failed` 即弹提示并停止空轮询
- **snapshotScript 失败**（L359-360）：`setFeedback(messageId, { failed: true, ...buildFeedbackError(String(error)) })`，替换现在的 `{ failed: true, error: String(error).slice(0, 300) }`（截断统一收进 buildFeedbackError）
- 持久化：saveIndex 对 feedback 条目整体写 `rec.feedback`（[lib/snapshots.js](../../../lib/snapshots.js) L144-151），`kind` 随对象自动落盘，loadIndex 回填复用 setFeedback，重启后仍可见——实施时验证一遍序列化是整体对象而非字段白名单

### M1-D5 status 端点（[lib/routes-core.js](../../../lib/routes-core.js) L121-128）

- errors 条目自动多出 `count`/`kind`（JSON 直出，逻辑零改动）
- 可选增强（一行 map）：每条附 `hint = ENV_HINTS[kind]`，API 自描述；本次无客户端消费，设置页未来展示零成本

### M1-D6 测试

1. **`tests/unit/diagnostics.test.js`**（纯函数）：各 kind 模式命中（含 #11 原文样本 `error: could not lock config file /home/…/git/.git/config: File exists` → lock）、跨平台措辞（`Permission denied` vs `Access is denied`）、多模式重叠按根因优先级取值、未识别 → null、buildFeedbackError 命中时提示非空且 ≤140 / 未命中回落原文
2. **接线单测**（工厂级，仿 [tests/unit/maintenance-limits.test.js](../../../tests/unit/maintenance-limits.test.js) L63-85 的 fakeSetup 模式）：mock `rt.ensureGit` 返回 `{ ok: false, error: 'could not lock config file …File exists' }` → 断言 `state.snapFeedback` 中该 messageId 条目 `failed === true`、`kind === 'lock'`、error 为提示文案——钉住 M1 主线「ensureGit 失败 → 分类 → feedback」，这是纯函数测试覆盖不到的组装层
3. **recordError 去重单测**：同文本连发 3 次 → errors 长度 1、count 3、console.error 只 1 次；间隔不同错误 → 两条目各自计数

### M1 改动落点汇总

| 文件 | 改动 |
|---|---|
| `lib/diagnostics.js`（新增） | classifyEnvError / ENV_HINTS / buildFeedbackError |
| [lib/store.js](../../../lib/store.js) | ensureGit 返回值形状（L409-423，含 git 缺失分支）；recordError 去重+富集（L56-61） |
| [lib/snapshots.js](../../../lib/snapshots.js) | captureSnapshot 两个失败入口接 buildFeedbackError（L349-360） |
| [lib/routes-core.js](../../../lib/routes-core.js) | status 拼展示文本 + 可选 hint（L121-128） |
| `tests/unit/diagnostics.test.js`（新增）+ 现有接线测试文件 | 见 M1-D6 |

### M1 风险与回退

- ensureGit 返回值形状变化：仅 3 个调用点、2 个忽略返回值，接线单测即覆盖；revert 即回现状
- 分类误判：buildFeedbackError 未命中始终回落原文，误判仅影响 toast 文案不影响功能
- 去重改变 errors 缓冲形状：status 消费方（settings-cards）按 message 渲染，新增字段向后兼容

---

## M2 POSIX home 回退漂移修复 + 旧容器迁移

### M2-D1 base 拼接对齐 win32（[lib/store.js](../../../lib/store.js) L227-238）

POSIX 第三档回退 `os.homedir()` 直接拼 `/dsh-recall-snapshots`（store 落 home 根，issue #11 截图实证），而 win32 版第三档是 `Join-Path $env:USERPROFILE ".dsh"`（[lib/scripts.pwsh.js](../../../lib/scripts.pwsh.js) L115）。修复：第三档 base 改为 `os.homedir() + '/.dsh'`，仅当前两档（bash env `$DSH_HOME` / Node 主进程 `DSH_HOME`）都为空才触发。win32 侧无漂移、不动。

抽模块级纯函数 `selectPosixHomeBase({ probed, envHome, homedir })` → `{ base, third }`（third 标记是否走了第三档），供单测直测分支。

### M2-D2 旧容器一次性迁移（POSIX 专属，best-effort）

存量用户数据在 `~/dsh-recall-snapshots`，直接改 base 会「遗忘」全部历史快照。在 `posixHomeBaseResolve` 命中第三档时执行一次容器级迁移：

- 新增 `legacyHomeMigrateScript(homedir)` 到 [lib/scripts.posix.js](../../../lib/scripts.posix.js)（bash 3.2 兼容、`if/fi` 规避 I16 已知坑；非 git 命令，不适用 `$g=`/`RECALL_CLEANUP` 约定）：

```bash
old='<homedir>/dsh-recall-snapshots'
new='<homedir>/.dsh/dsh-recall-snapshots'
if [ -d "$old" ] && [ ! -d "$new" ]; then
  if mkdir -p -- "$(dirname "$new")" && mv -f -- "$old" "$new"; then echo MIGRATE_OK
  else echo MIGRATE_FAIL; fi
elif [ -d "$old" ]; then echo BOTH_PRESENT
else echo OLD_ABSENT; fi
```

- JS 侧按输出四态选 base：
  - `MIGRATE_OK` / `OLD_ABSENT` → base = `homedir + '/.dsh'`（全新装机与迁移成功的存量都落规范位置）
  - `BOTH_PRESENT`（极罕见：用户手动建过或历史中断残留）→ base = `homedir`（**数据所在优先**，旧容器继续用）+ recordError 记录并存事实，不删不迁
  - `MIGRATE_FAIL` → base = `homedir`（沿用旧位，数据不丢）+ recordError 告警——与 tryUpgradeToHome 的非致命迁移哲学一致
- `mv` 同卷（home 内部）是原子 rename，无部分移动状态；容器级整移自然带上根级 `exclude.txt`，语义无损
- `resolveHomeContainer` 的 `slice(0, -65)` 推导只依赖 hash 固定布局（64 hex + 1 斜杠），base 变化发生在 hash 之前，不受影响
- **parity 三处同步**（POSIX 专属导出的既定成本）：`tests/unit/scripts-contract.test.js` 的 SKIP 集合与「平台专属导出各自存在且互不越界」断言、[lib/store.js](../../../lib/store.js) `checkScriptParity` 的 SKIP 集合，均加入 `legacyHomeMigrateScript`

### M2-D3 status 暴露 store 位置（[lib/routes-core.js](../../../lib/routes-core.js) L121-128）

返回值增加 `storeBase: await rt.resolveHomeContainer()`（POSIX/win32 通用，失败为 null）。服务端一行，供设置页未来展示「快照存在哪里」；本次不做 Client 展示（不改 Client 的总决策）。

### M2-D4 测试与台账

- **`tests/unit/store-path.test.js`**（新增）：selectPosixHomeBase 三分支纯函数断言；迁移编排四态（mock runShell 控制输出 → 断言 base 选择与 recordError 调用，fakeSetup 模式）
- [docs/compat-audit.md](../../compat-audit.md)：新增 **I24**「POSIX home 三级回退第三档缺失 `.dsh` 子目录」（依赖行为/出处：store.js L235 vs scripts.pwsh.js L115；探针/单测：store-path.test.js；失效症状：POSIX 快照落 `~/dsh-recall-snapshots`）；同步更新 **I18** 的「复查动作」加入 `.dsh` 层级核对

---

## M3 并发实例探测 + stale 锁分级（已于 2026-08-28 实施）

issue #11 的根因（两个 dsh 进程实例并发快照互踩）与放大器（killOrphansScript 不分活跃/stale 锁、误杀对方活跃 git）的治理，实施形态：

- **心跳文件**：`heartbeatBlock`（两套模板各自内部助手）随 ensureGitScript / snapshotScript 顺手把「宿主 PID + epoch 秒」写进 store 目录（ASCII 单行，pwsh 侧显式 `-Encoding ascii` 防 BOM 破坏 POSIX 侧解析）；PID 在模板生成期取 `process.pid`，零签名变更。diff/rollback 不写心跳是有意的：回退前必有安全快照刷新心跳，预览窗口由新锁分级兜底。
- **killOrphansScript 三级出口**（双侧同语义）：① 心跳显示另一存活实例（`kill -0` / `Get-Process -Id` 探活、PID ≠ 自身、TTL 900s 内）→ 输出 `CLEANUP_OTHER_INSTANCE <pid>` 让路；② 存在 `STALE_LOCK_MIN`（5 分钟，本方单操作超时 10 分钟的一半）内的新锁 → 输出 `CLEANUP_SKIPPED_FRESH_LOCK` 让路；③ 保护未命中 → 原有清孤儿 + 清锁（refs 递归删除加 `-mmin +5` 限定）。mtime 判定用 `find -mmin` 而非 stat（GNU/BSD stat 参数不同，macOS bash 3.2 约束）。
- **JS 侧消费**：`parseCleanupResult`（store.js 模块级纯函数）解读输出，`cleanupAfterGitFailure` 对让路情形 recordError——多实例从 lock hint 的「疑似」升级为「确认（PID n）」；STALE_LOCK_MIN / HEARTBEAT_TTL_S 双侧同值由 scripts-contract 钉。
- 阈值定性：内部安全策略常量（与 snapshots.js FUSE_AFTER 同类），不走 Config。

---

## 验收标准

1. `npm test` 全绿：新增 diagnostics / store-path / 接线 / 去重单测通过，原有契约测试（scripts-contract 含 SKIP 集合更新）不回归
2. ensureGit 失败不再静默：客户端在近 5 分钟消息上弹出「快照失败：<可行动提示>」而非原始 git stderr；提示 ≤140 字符、不含原始路径
3. git 缺失场景：status 错误列表出现「未检测到 git CLI」条目且去重计数，不再零痕迹
4. 设置页「最近错误」条目显示「××（×N）」重复计数（服务端拼文本，零 Client 改动）
5. POSIX 新装机 store 落 `~/.dsh/dsh-recall-snapshots/`；仅有旧容器 `~/dsh-recall-snapshots` 的机器首次启动自动迁移；双容器/迁移失败时沿用旧位且数据不丢
6. `status` 返回 `storeBase`；`npm run test:probe` / `npm run check:dsh`（本机 dsh 可用时）无新增红——本次未新增官方 API 调用点

## 风险与回退

- **迁移**：仅「旧存在且新不存在」触发；`mv` 同卷原子操作；失败/并存均回落旧位（数据安全优先），revert 代码后旧位数据仍完整可用
- **分类器**：未命中回落原文（保现状），误判只影响 toast 文案
- **去重**：只合并缓冲尾部相邻重复，错误时序信息不丢失；形状变化向后兼容（JSON 直出新字段）
- 若本机 `test:probe` / `check:dsh` 不可跑，以 `npm test` 为主验证并在交付说明标注

---

## 实施记录（2026-08-28）

**结果**：M1-D1〜D6 与 M2-D1〜D4 全部落地，M3 保持登记待拆。单测 200/200 绿、verify:host 绿（生产装配路径，装配探针里 ensureGit 缺 git 分支的错误记录正常输出一次）、check:dsh 全部一致。本机未跑 test:probe（本次未新增官方 API 调用点，与验收第 6 条一致）。

**改动落点**（与计划一致，另有两处实施中发现）：

| 文件 | 改动 |
|---|---|
| `lib/diagnostics.js`（新增） | classifyEnvError / ENV_HINTS / buildFeedbackError |
| `lib/store.js` | ensureGit → `{ok, error}`（git 缺失分支 recordError + 提示）；recordError 尾部去重 + count/kind 富集；selectPosixHomeBase / resolvePosixHomeBase 模块级导出；posixHomeBaseResolve 委托；checkScriptParity SKIP 加 legacyHomeMigrateScript |
| `lib/scripts.posix.js` | legacyHomeMigrateScript（四态输出） |
| `lib/snapshots.js` | captureSnapshot 两个失败入口接 buildFeedbackError；**loadIndex 的 feedback 回填是字段白名单（计划 M1-D4 的验证指令命中）——补 kind 回填，否则重启后分类丢失、status hint 失效** |
| `lib/routes-core.js` | status 拼展示文本「（×N）」+ hint + storeBase（clear 分支同形状） |
| 测试 | `tests/unit/diagnostics.test.js`（新增 16 例，含 #11 原文样本、根因优先级、去重时序）、`tests/unit/store-path.test.js`（新增 10 例，三分支 + 迁移四态 + 模板形状）、snapshots-persist 接线 2 例 + 回填 kind 钉、scripts-contract SKIP/平台专属断言同步 |

**实施中微调**：

- ENV_HINTS 的 git/mkdir 文案改为不含 `/` 的写法（「安装或升级」「同名文件占用」）——让「提示零斜杠」成为 diagnostics.test.js 里可持久化的硬断言（原文案「安装/升级」「文件/非目录」会误触），「不嵌原始路径」约束由此钉死。
- resolvePosixHomeBase 对「迁移探测命令自身失败」按 MIGRATE_FAIL 同策略处理（沿用旧位 + recordError）——计划未明示该分支，按「数据安全优先」原则补齐（此刻无法判断旧容器是否存在，选新位会让存量用户看不到历史快照）。

**验收对照**：第 1/2/4/5/6 条由单测与巡检直接验证；第 3 条（git 缺失进错误环）与 toast 实弹显示（第 2 条的界面侧）待下次冒烟在 link 模式下确认。

---

## M3 实施记录（2026-08-28，追加）

**结果**：并发实例探测 + stale 锁分级全部落地（形态见上方 M3 章节，较登记稿的落地细化：心跳写入点收敛为 ensureGit/snapshot 两个模板、PID 取 `process.pid` 免传参、`find -mmin` 替代 stat 跨 BSD）。单测 212/212 绿、verify:host 绿。台账新增 **I25**。

**改动落点**：

| 文件 | 改动 |
|---|---|
| `lib/scripts.posix.js` / `lib/scripts.pwsh.js` | STALE_LOCK_MIN / HEARTBEAT_TTL_S 常量（导出，scripts-contract 钉同值）；heartbeatBlock 内部助手插入 ensureGitScript / snapshotScript；killOrphansScript 重写为三级出口 |
| `lib/store.js` | parseCleanupResult 模块级纯函数；cleanupAfterGitFailure 捕获输出并记录让路情形；导出 cleanupAfterGitFailure（接线测试用） |
| 测试 | diagnostics.test.js（parseCleanupResult 4 例 + cleanupAfterGitFailure 接线 4 例，假 shell 回灌脚本输出）；scripts-contract.test.js（常量同值 / 三级出口标记 / 心跳接线含 diff 不写心跳的负断言） |

**设计取舍**：

- **STALE_LOCK_MIN=5 / HEARTBEAT_TTL_S=900 为内部常量不走 Config**：与 FUSE_AFTER 同类的安全策略时序（阈值取本方单操作超时 10 分钟的一半，保证本方超时遗留锁必能被清）；合规清单 #3 的「可调参数」判定针对用户按工作区调优的偏好项（尺寸/数量/排除表/开关），算法时序不在此列。
- **保护向「不清扫」fail-safe**：两级保护各有盲区（心跳 TTL 外的空闲实例、操作刚开始未建锁的毫秒窗口），但互为补位——空闲实例无运行中 git 进程可杀、新锁一旦落盘即触发分级；最坏退化为本方失败锁延迟 ≤5 分钟自愈，好过误杀对方活跃 git 的互踩死循环。
- **让路也 recordError**：失败清扫让路不是静默——设置页「最近错误」会出现「另一个 DSH 实例（PID n）正在使用此快照库」的确认级诊断，配合 M1 的去重不刷屏。
