# PR #17 审查：gc 失败退避 / oversize 跳过排除目录 / baseExcludes 加宽

> 状态：审查完成（Linux 侧已实机验证）；待作者修复 P0/P1 + 待 Windows 侧实弹复核（末节清单）
> 对象：[PR #17](https://github.com/limbo947/dsh-recall-plugin/pull/17)（`fix/snapshot-io-storm` → `main`，1 commit，14 文件 +266/-43，2026-09-22）
> 审查环境：Linux x86_64（bash 5.2.21 / GNU find 4.9.0），PR 分支 worktree 实跑

## 总结论

问题诊断、实测数据与修复方向均成立；**两个必须修**（P0 让 posix 侧核心优化静默全废，P1 让退避修复在 Windows 主战场对快速失败不生效），修完再合。P2 为顺手项与待确认项。

## 已验证通过（Linux 实机）

| 验证项 | 结果 |
| --- | --- |
| `npm ci --legacy-peer-deps` | 通过——package-lock 改动实为修复 main 上的陈旧锁（lock 停在 2.3.3/旧 peer 范围，package.json 已是 2.3.24/新范围），正当的随行修复 |
| `npm run typecheck` | 通过 |
| `npm test` | 371/371 全绿，与 PR 声明一致 |
| `npm run build` 后 `git diff lib/` | 为空（产物新鲜度合规） |
| 生成的 posix snapshot 脚本 `bash -n` | 语法通过 |
| 退避数学 | 失败后 `gcLastAt = now − gcHours + 30min` → 正好 30 分钟后时间门槛放行；`gcCount` 条数门槛在退避窗口内照常生效，与 PR 描述一致 |
| 块间依赖顺序 | pwsh `$lines` / posix `$new_exc` 均由前置 `excludeSyncBlock` 无条件定义；snapshot/diff/rollback 三条链路中 excludeSync → oversize 的顺序全部正确 |

## P0（阻塞）：posix oversize 目录跳过静默全废

**位置**：`src/host/scripts.posix.ts` `oversizeBlock`，生成的脚本行：

```bash
oversize_prune=("\(" "${oversize_args[@]}" "\)" -prune -o)
```

**根因**：`\(`/`\)` 出现在数组赋值的引号内，是**数据**而非 shell 源码——bash 不剥反斜杠，find 实际收到 2 字符 token `\(`。命令行里直接写 `\(` 之所以可用，是 shell 分词阶段剥掉反斜杠后 find 收到单字符 `(`；两种形态不可混用。

**实测**（GNU find 4.9.0 + bash 5.2.21，数组展开逐字复刻生成脚本）：

```
find: paths must precede expression: `\)'
# find 退出码 1，stdout 零输出
```

**影响放大链**：find 报错被 `2>/dev/null` 吞掉 → 管道零输出 → xargs 空跑 → 末端 `|| true` 兜住 → **整个 oversize force-remove 步骤在 Linux/macOS 上静默什么都不做**。baseExcludes 恒含 `.git`/`node_modules/`，`oversize_args` 必非空，此路径 100% 触发。这不是「跳过失效退回全扫」，而是连原有的慢扫都没了——比 PR 之前更糟，正是合规清单 #8 警告的「静默死掉且零报错」形态。macOS 的 BSD find 同样只认单字符 `(`（转义是 shell 层约定，find 本身不认 `\(` token）。

**修法**（括号是数据，无需转义）：

```bash
oversize_prune=('(' "${oversize_args[@]}" ')' -prune -o)
```

**必须同步改**：`tests/unit/scripts-contract.test.js` 新增断言 `toContain('"\\(" "${oversize_args[@]}" "\\)" -prune -o')` 把 bug 形态钉成了契约，修复时一并更新。

**对照警示**：`killOrphansScript` 里的 `\(` 是**正确**的——那是脚本源码内联转义（shell 会剥），与本处「引号内数据」性质不同，不要以「统一风格」为由误改它。

**测试补强建议**：模板形状断言拦不住这类 bug。建议给 oversize 块补一条 posix 实弹单测（生成脚本片段在真实 bash + find 下跑，断言排除目录未被遍历、超大文件仍被剔除），把工作流第 3 条「脚本模板改动双平台实弹复验」机器化。

复现脚本（Linux/macOS 可直接跑）：

```bash
oversize_args=(-name .git -o -name node_modules)
oversize_prune=("\(" "${oversize_args[@]}" "\)" -prune -o)
find /tmp "${oversize_prune[@]}" -type f -print   # → find: paths must precede expression: `\)'
oversize_prune=('(' "${oversize_args[@]}" ')' -prune -o)
find /tmp "${oversize_prune[@]}" -type f -print   # → 正常遍历
```

## P1（阻塞）：pwsh `gcScript` 缺 `$LASTEXITCODE` 检查，gc 快速失败被误报成功

**位置**：`src/host/scripts.pwsh.ts` `gcScript`：

```powershell
& $git --git-dir=$g gc --quiet --prune=now
Set-Content -LiteralPath (Join-Path $g 'gc.stamp') ...
Write-Output 'GC_OK'
```

**推理链**（基于仓库既有结论 I14）：pwsh 对 native 非零退出不抛（`EAP=Stop` 不作用于 native 命令）→ git gc 失败（磁盘满 / 锁冲突 / 杀软锁 pack）后脚本继续执行 → stamp 照写、GC_OK 照出 → 进程 exit 0 → `runShell` 按进程退出码判成败 → Host 认为 gc 成功。

**后果**：

1. 本 PR 的退避修复在 Windows（pwsh 方言）对**快速失败**不生效——`gcLastAt` 仍被推进完整 gcHours 周期，照样 24h 不重试；
2. `gc.stamp` 被假性刷新，跨重启后的节流凭据也是假的；
3. 超时被杀的场景由「1800s 新超时 + runShell 超时抛错」覆盖，漏的只有快速失败半区；
4. issue #18 的事故机正是 Windows 11 + PS 5.1——Windows 恰是本修复的主战场。

posix 版有 `set -e`，天然正确，无需改。

**修法**（同文件 `rescueScript`/`diffScript` 已有同款 pattern）：

```powershell
& $git --git-dir=$g gc --quiet --prune=now
if ($LASTEXITCODE -ne 0) { throw ("git gc failed (exit " + $LASTEXITCODE + ")") }
```

**待 Windows 实弹复核**：上述为静态推断，需在 Windows + PS 5.1 实机确认「git gc 非零退出 → 脚本进程 exit code 确为 0」（步骤见末节 W1）。

## P2 / 顺手项与待确认

1. **posix prune 未限 `-type d`**：`\( -name dist … \) -prune` 会把**同名文件**一并跳过；pwsh 侧 `EnumerateDirectories()` 只对目录生效，两平台不对称。后果仅是一个 >100MB 且文件名恰为 `dist`/`target`/`.git` 的文件不再被移出快照——fail-open 方向、极罕见。建议 `\( -type d \( -name … \) \) -prune -o` 对齐（随 P0 一起修）。
2. **README 未同步**：`README.md` / `README.en.md` 的 `baseExcludes` 默认值仍是旧 4 项（仓库工作流：行为变更同步 README 双语）。
3. **`cordis.patch.yml` 注释示例陈旧**：`# baseExcludes: ['.git', 'node_modules/', '.dsh-recall-snapshots/']` 缺 `dsh-recall-snapshots/`；用户照抄 uncomment 会整行覆盖加宽后的默认表，并重新打开 issue #6 的自吞口子（root=HOME 场景）。建议更新或删除该示例行。
4. **新常量未走 Config**：`GC_RETRY_BACKOFF_MS`/`GC_TIMEOUT_MS` 硬编码，对照合规清单 #3「新参数一律走 Config 字段」。仓库有先例（`STALE_LOCK_MIN` 以注释论证「内部安全策略常量不走 Config」）——建议补同款论证注释或加 Config 字段，维护者拍板即可。
5. **存量用户触达待确认**：加宽的 `baseExcludes` 只惠及「从未保存过设置」的用户；若 dsh-settings 会把解析后的旧默认物化进用户层，老用户升级后仍用旧表（excludeSync 的清理循环也不会因内容变化而触发）。取决于 settings 持久化行为，建议作者在 PR 里补一句实测结论。
6. **版本号未 bump**：按仓库惯例由维护者发版时处理，仅记录。

## 范围确认

PR 声明不覆盖 [issue #18](https://github.com/limbo947/dsh-recall-plugin/issues/18)（root 自身即构建产物目录 + index 引用致 gc 空转），属实——那是另一条堆积路径，本 PR 合入后 #18 仍需单独修。其建议 3「gc 前清 index」与 P1 修的是同一块 `gcScript`，可考虑一并处理。

## Windows 实弹复核清单（移交 Windows 侧 agent）

> 本机为 Linux，以下 3 项只能在 Windows 实机验证。仓库已知坑 I14/I27/I36 均为 Windows 侧实证结论，复核前先对照 [compat-audit 台账](../../compat-audit.md) 对应条目。

### W1（对应 P1，必做）：pwsh 下 gc 快速失败是否被误报成功

1. 环境：Windows 11 + PowerShell 5.1（与事故机同构），另测 pwsh 7 对照。
2. 用 PR 分支构建产物取 `gcScript` 输出文本，人为制造 git gc 非零退出：目标影子仓库持锁（预置 `index.lock` / 占用 objects 句柄）或对 objects 目录拒绝写入。
3. 观察三点：脚本进程退出码、是否输出 GC_OK、`gc.stamp` 是否被刷新。
4. 判定：未修复时预期「exit 0 + 输出 GC_OK + stamp 刷新」= 误报成功实锤；修复后（加 `$LASTEXITCODE` 检查）应为「非零退出 + 无 GC_OK + stamp 不动」。

### W2（对应 oversize pwsh 半，必做）：PS 5.1 / pwsh 7 下目录跳过功能正常

1. 构造工作区：`node_modules/dep/big.bin`、`target/debug/big.bin`、`src/big.bin`（均超过 maxFileBytes，测试时可把阈值调小），外加一个名为 `dist` 的**大文件**（同名文件对照组）。
2. 跑 PR 版 `snapshotScript`（或单独抽出 oversize 块），断言：
   - `node_modules`/`target` 子树未被遍历（遍历计数或耗时可佐证）；
   - `src/big.bin` 被正常 force-remove（index 中消失）；
   - 名为 `dist` 的文件**仍被处理**（pwsh 侧 `EnumerateDirectories` 天然只跳目录；预期与 P2-1 修复后的 posix 语义对齐）；
   - PS 5.1 下 `[System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)` 构造可用（.NET 4.x API，理论支持，需实机确认）。

### W3（I36 交叉影响，建议）：win32 + bash 方言组合同样踩 P0

win32 profile 可把 shell 配成 bash 执行器（I36），此时跑的是 **posix 模板**——Git for Windows 自带的 find 是 GNU find，P0 的 `\(` token 问题同样成立。请在该组合下复跑 P0 复现脚本确认；这也意味着 P0 修复是所有平台的前置条件，不纯是 Linux/macOS 问题。
