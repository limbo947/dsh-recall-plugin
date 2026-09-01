/**
 * dsh-recall-plugin — PowerShell 脚本模板（纯函数，无 ctx 依赖，win32 专用）
 *
 * 职责：集中拼装所有发给 shell 的 PowerShell 脚本文本。只做字符串构造，
 * 不执行、无状态；执行侧（runShell）见 store.js，调用侧见
 * snapshots.js / maintenance.js。集中在这里是为了：
 * 1) PS 5.1 / pwsh 7 双版本兼容的坑只在一处处理；
 * 2) 脚本片段（gitlink 清理、超大文件排除、用户排除同步）在多个
 *    流程里逐字复用，散落各处必然改漏。
 * POSIX（Linux/macOS）对应模板见 scripts.posix.js，两者导出同名接口，
 * 由 store.js 按 process.platform 选择。
 */

// 单引号字面量转义：PS 单引号串里只有 '' 表示一个单引号，且不展开变量，
// 是把 JS 值安全嵌进命令串的唯一可靠方式（杜绝 $、反引号注入）。
export function psq(value) {
  return "'" + String(value).replace(/'/g, "''") + "'"
}

// 统一 UTF-8 输出前导：中文等非 ASCII 机器的默认代码页（如 GBK）下，
// PowerShell 重定向 stdout 按 [Console]::OutputEncoding 编码，而 DSH 按
// UTF-8 解码——不强制时含中文的用户名/路径会变乱码。PS 5.1 / 7 均支持。
export const UTF8_PRELUDE = '$OutputEncoding = [Text.UTF8Encoding]::new($false)\ntry { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch {}'

// 超大文件跳过阈值：git 对象库对大文件极不友好，回退语义也不该被一个
// 200MB 的构建产物拖垮。默认值与 config.js 的 maxFileBytes 一致；实际
// 生效值以 store.maxFileBytes（用户 config 可调）经 oversizeBlock 注入为准。
export const MAX_FILE_BYTES = 104857600

// 失败清扫的 stale 锁阈值（分钟，M3）与心跳有效窗口（秒，M3）：语义、取值
// 理由与「不走 Config」的定性见 scripts.posix.js 同名常量注释，两侧必须
// 同值（scripts-contract 钉）。
export const STALE_LOCK_MIN = 5
export const HEARTBEAT_TTL_S = 900

// 影子仓库 info/attributes 固化内容（issue #12 字节保真，两套模板同值，
// scripts-contract 钉）。为什么必须：回退恢复走 git archive、捕获走 add，
// 两者都会应用「快照树里项目自己的 .gitattributes」——text=auto（极常见）
// + 缺省 core.eol=native（Windows 即 CRLF）会让 archive 把 LF 转 CRLF，
// 仓库级 core.autocrlf=false 挡不住（属性驱动的转换看 core.eol，不看
// autocrlf，实测）。info/attributes 是优先级最高的属性源，对全部路径
// 无条件关闭内容转换，capture/restore 两侧逐字节保真；也顺带治掉
// ensureGit 的 git config 写入静默失败（I14：pwsh 对 native 非零不抛）
// 后裸露 system autocrlf 的帮凶路径。逐项语义：
// -text                    关闭全部 EOL 转换（含 autocrlf/text/eol 全部语义）
// -filter                  关闭 clean/smudge 外部过滤命令（LFS 类，防内容被改写/存指针）
// -ident                   关闭 $Id$ 展开
// -export-ignore           防归档静默丢文件（回退恢复缺文件零报错，实测）
// -export-subst            防归档内容 $Format:$ 替换
// -working-tree-encoding   防编码转码
// 快照是备份/还原不是 VCS：字节保真优先于用户在 .gitattributes 里声明的
// 任何转换策略——那是给 git 仓库的，不是给影子快照库的。
export const FIDELITY_ATTRS = '* -text -filter -ident -export-ignore -export-subst -working-tree-encoding'

// 去除 PS 5.1 Set-Content -Encoding utf8 写出的 BOM：JSON 解析前必须剥掉，
// 否则 JSON.parse 把 BOM 当正文首字符直接抛错。
export function stripBom(text) {
  return text.replace(/^\uFEFF/, '')
}

// 嵌套 git 仓库（工作区里的子项目自带 .git）会被 add -A 记成 gitlink（160000）；
// gitlink 残留在 index 时 add -A 会 fatal "in unpopulated submodule"，
// 且 gitlink 对文件回退毫无意义——所以 add 前后各清一次，子仓库内容不进快照。
// 依赖外层脚本已定义的 $git/$g；被 snapshot/diff/rollback 三处复用。
function dropGitlinksBlock() {
  return [
    "& $git --git-dir=$g ls-files --stage | Where-Object { $_ -like '160000*' } | ForEach-Object {",
    "  $p = ($_ -split \"`t\")[1]",
    '  & $git --literal-pathspecs --git-dir=$g update-index --force-remove -- $p',
    '}'
  ].join('\n')
}

// 剔除超大文件：.NET 手动栈遍历（PF-3）替代 Get-ChildItem -Recurse——后者
// 每文件走一遍 PowerShell 管道对象，几万文件时数秒，且 snapshot/diff/rollback
// 三条脚本各调一次（一次完整撤回 4 次全工作区枚举）。手动栈是 .NET 4.x
// （PS 5.1 可用范围）的唯一逐目录容错形态：EnumerateFiles(..., AllDirectories)
// 遇 ACL 异常目录会中断整个枚举（没有 .NET 6 的 SkipUnavailable），必须
// 逐目录 try/catch 才能与 Get-ChildItem -ErrorAction SilentlyContinue 的
// 逐项容错语义对齐——本扫描只用于排除超大文件，漏看个别文件是 fail-open，
// 可接受。DirectoryInfo.EnumerateFiles 返回全部文件（含隐藏/系统），等价
// Get-ChildItem -Force；阈值按调用注入（store.maxFileBytes，config 可调）。
// PF-9 合批：命中路径先收进 List 再多路径合参（每批 100，与 purgeTags
// 分块同款纪律），update-index 子进程数 N → N/100。
// 依赖外层已定义的 $git/$g/$root。
function oversizeBlock(maxBytes) {
  return [
    '$oversizeStack = [System.Collections.Generic.Stack[string]]::new()',
    '$oversizeStack.Push($root)',
    '$oversizeRel = [System.Collections.Generic.List[string]]::new()',
    'while ($oversizeStack.Count -gt 0) {',
    '  $dir = $oversizeStack.Pop()',
    '  try {',
    '    $di = [System.IO.DirectoryInfo]::new($dir)',
    '    foreach ($f in $di.EnumerateFiles()) {',
    '      if ($f.Length -gt ' + String(maxBytes || MAX_FILE_BYTES) + ') {',
    "        $oversizeRel.Add($f.FullName.Substring($root.Length + 1).Replace('\\','/'))",
    '      }',
    '    }',
    '    foreach ($d in $di.EnumerateDirectories()) { $oversizeStack.Push($d.FullName) }',
    '  } catch {}',
    '}',
    'for ($i = 0; $i -lt $oversizeRel.Count; $i += 100) {',
    '  $batch = $oversizeRel.GetRange($i, [Math]::Min(100, $oversizeRel.Count - $i))',
    '  & $git --literal-pathspecs --git-dir=$g update-index --force-remove -- $batch',
    '}'
  ].join('\n')
}

// 用户自定义排除同步：把基础排除表与用户 exclude.txt 合并重写进 info/exclude，
// 再用 ls-files -i -c 找出「已被跟踪但命中排除」的条目从 index 清掉。
// - 只用 --exclude-from 指 info/exclude，不用 --exclude-standard：后者会
//   连带项目自己的 .gitignore 语义（后加 ignore 的已跟踪文件会被悄悄移出
//   快照），行为超出用户配置的本意。
// - 放在 add -A 之前：排除表先生效，新增的排除路径根本不会被暂存，
//   已跟踪的旧条目由 ls-files -i -c 补刀，两条路径一次覆盖。
// - 首行留空元素吸收 PS 5.1 utf8 BOM（BOM 粘在首行会废掉第一条模式），
//   与下方 ensureGitScript 的老技巧一致。
// - base 基础排除表按调用注入（config.baseExcludes 可调），不硬编码。
// - 依赖外层已定义的 $git/$g；被 ensureGit/snapshot/diff/rollback 复用，
//   因此 exclude.txt 的改动在下一次快照/diff/回退时即时生效，无需重启。
// - PF-9 条件化：写 info/exclude 前逐行比对旧文件（按行比较天然免疫
//   BOM/行尾差异——Get-Content -Encoding UTF8 剥 BOM、剥行尾），内容相同
//   则跳过重写**并跳过**清理循环（每条消息常态省 1 次 git 子进程 + 1 次
//   盘写）。语义安全：exclude 未变时上次快照已把命中条目移出 index，
//   add -A 因排除先生效不会加回；首次应用新 exclude 或改动后仍走完整
//   链路，「改排除即时生效」承诺（AGENTS.md 钉）不变。
// - PF-9 合批：清理循环逐条 update-index 每次 fork 一个 git 子进程，改为
//   多路径合参（每批 100，与 purgeTags 分块同款纪律）N 次 → N/100。
function excludeSyncBlock(excludeFile, base) {
  // 兜底含两种存储目录名：降级为 .dsh-recall-snapshots/，home 存储为
  // dsh-recall-snapshots/（root=HOME 时落入工作区，漏排除会自吞，issue #6）
  const baseList = (Array.isArray(base) && base.length ? base : ['.git', 'node_modules/', '.dsh-recall-snapshots/', 'dsh-recall-snapshots/']).map(psq).join(',')
  return [
    "$exFile = " + psq(excludeFile),
    '$userPats = @()',
    "if (Test-Path -LiteralPath $exFile) { $userPats = @(Get-Content -LiteralPath $exFile -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $t = $_.Trim(); $t -and -not $t.StartsWith('#') }) }",
    "$lines = @('') + @(" + baseList + ") + $userPats",
    "$exc = Join-Path $g 'info\\exclude'",
    '$excOld = @(Get-Content -LiteralPath $exc -Encoding UTF8 -ErrorAction SilentlyContinue)',
    '$same = ($excOld.Count -eq $lines.Count)',
    'if ($same) {',
    '  for ($i = 0; $i -lt $lines.Count; $i++) {',
    '    if ($excOld[$i] -ne $lines[$i]) { $same = $false; break }',
    '  }',
    '}',
    'if (-not $same) {',
    '  Set-Content -LiteralPath $exc -Value $lines -Encoding utf8',
    '  $hit = @(& $git -c core.quotePath=false --literal-pathspecs --git-dir=$g ls-files -i -c --exclude-from=$exc | Where-Object { $_ })',
    '  for ($i = 0; $i -lt $hit.Count; $i += 100) {',
    '    $batch = @($hit[$i..([Math]::Min($i + 99, $hit.Count - 1))])',
    '    & $git --literal-pathspecs --git-dir=$g update-index --force-remove -- $batch',
    '  }',
    '}',
  ].join('\n')
}

// 心跳写入（M3，语义见 scripts.posix.js 同名注释）：Set-Content 用 ascii
// 编码——内容纯数字，关键是绝不能带 BOM（POSIX 侧按空白分词解析首字段，
// 5.1 的 utf8 默认编码会写 BOM 破坏首字段）；-ErrorAction SilentlyContinue
// 让心跳写失败不连累外层 EAP=Stop 的快照主流程（与 POSIX 的 || true 对齐）。
// 依赖外层已定义的 $g；被 ensureGitScript / snapshotScript 复用。
function heartbeatBlock() {
  return [
    "$hbf = Join-Path (Split-Path -Parent (Split-Path -Parent $g)) 'heartbeat'",
    "Set-Content -LiteralPath $hbf -Value ('" + String(process.pid) + " ' + [DateTimeOffset]::Now.ToUnixTimeSeconds()) -Encoding ascii -ErrorAction SilentlyContinue"
  ].join('\n')
}

// 解析 git 可执行文件路径：DSH 进程 PATH 可能不含 git，脚本里用绝对路径调用。
// 逐项判空再 Join-Path：个别 env 在特殊环境（32 位系统无 ProgramFiles(x86)）
// 取到 null，EAP=Stop 下 Join-Path 抛错会让整个探测失败、误报 gitMissing。
export function resolveGitScript() {
  return [
    '$candidates = @()',
    '$g = (Get-Command git -ErrorAction SilentlyContinue).Source',
    'if ($g) { $candidates += $g }',
    "if (${env:ProgramFiles}) { $candidates += (Join-Path ${env:ProgramFiles} 'Git\\cmd\\git.exe') }",
    "if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Git\\cmd\\git.exe') }",
    "if (${env:LocalAppData}) { $candidates += (Join-Path ${env:LocalAppData} 'Programs\\Git\\cmd\\git.exe') }",
    "$g = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1",
    'if ($g) { Write-Output $g }'
  ].join('\n')
}

// 计算项目对应的 home 存储目录（DSH_HOME 优先，否则 ~/.dsh）。
// 哈希用 Create()+ComputeHash+BitConverter 而不是 HashData+ToHexString：
// 后两者是 .NET 5+（仅 PS 7）API，别人机器的 shell 若是 Windows PowerShell
// 5.1 会抛错，导致 home 存储永远降级到项目内；前者两个版本都可用。
export function homeDirScript(root, envHome) {
  return [
    '$r = ' + psq(root),
    "$h = if ($env:DSH_HOME) { $env:DSH_HOME } elseif (" + psq(envHome) + ") { " + psq(envHome) + " } else { Join-Path $env:USERPROFILE \".dsh\" }",
    '$sha = [Security.Cryptography.SHA256]::Create()',
    "$hex = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($r))) -replace '-','').ToLower()",
    "Write-Output (Join-Path $h ('dsh-recall-snapshots\\' + $hex))"
  ].join('\n')
}

export function mkdirScript(dir) {
  return 'New-Item -ItemType Directory -Force -Path ' + psq(dir) + ' | Out-Null'
}

// 旧版迁移：把降级时代落在项目内的影子仓库整体搬回 home 并删源目录
export function migrateScript(src, dst) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$src = ' + psq(src),
    '$dst = ' + psq(dst),
    "if (Test-Path -LiteralPath (Join-Path $src 'git')) { Move-Item -LiteralPath (Join-Path $src 'git') -Destination (Join-Path $dst 'git') -Force }",
    "if (Test-Path -LiteralPath (Join-Path $src 'index.json')) { Move-Item -LiteralPath (Join-Path $src 'index.json') -Destination (Join-Path $dst 'index.json') -Force }",
    'Remove-Item -Recurse -Force -LiteralPath $src -ErrorAction SilentlyContinue',
    "Write-Output 'MIGRATE_OK'"
  ].join('\n')
}

// 建立影子仓库：普通 init（index 留在仓库内跨快照复用，git add 的 stat 缓存
// 让未变文件近乎零成本），core.longpaths 放开 Windows 深路径。
// autocrlf=false：按原始字节入快照（回退时逐字节还原），也避免用户全局
// autocrlf=true 时的 LF/CRLF stderr 警告；addEmbeddedRepo=false：嵌套仓库
// hint/warning 走 stderr，在 DSH shell（EAP=Stop）下会让整条脚本非零退出，
// 必须在仓库级配置里静默掉。
// info/attributes 固化（issue #12，内容见 FIDELITY_ATTRS）：info/ 由 git init
// 自带（info/exclude 模板，excludeSyncBlock 同样依赖），无需建目录；每次
// ensureGit 重写幂等，存量仓库升级后首次 init 自然补上。
// 结尾回读 gc.stamp（maintenance.js 上次 gc 时间戳）：让重启后的 gc 节流
// 不归零——没有它，天天重启 DSH 的用户每次开机第一条消息都会触发一次
// 全量 gc，纯浪费。
export function ensureGitScript(store, gitExe, base) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$git = ' + psq(gitExe),
    '$repo = ' + psq(store.repo),
    '$g = ' + psq(store.git),
    heartbeatBlock(),
    'if (-not (Test-Path -LiteralPath $g)) {',
    '  & $git init $repo | Out-Null',
    '}',
    '& $git --git-dir=$g config core.longpaths true',
    '& $git --git-dir=$g config core.autocrlf false',
    '& $git --git-dir=$g config advice.addEmbeddedRepo false',
    "$attrDir = Join-Path $g 'info'",
    "Set-Content -LiteralPath (Join-Path $attrDir 'attributes') -Value '" + FIDELITY_ATTRS + "' -Encoding ascii",
    excludeSyncBlock(store.excludeFile, base),
    "$stamp = Join-Path $g 'gc.stamp'",
    "if (Test-Path -LiteralPath $stamp) { Write-Output ('GIT_OK ' + [String](Get-Content -LiteralPath $stamp -TotalCount 1 -ErrorAction SilentlyContinue)) } else { Write-Output 'GIT_OK' }"
  ].join('\n')
}

// 存量归一化迁移（issue #12）：属性固化后，索引里的旧条目仍指向归一化
// blob 的哈希——stat 缓存让裸 add -A 时序依赖地跳过重哈希（racy 复查只在
// 「add 与文件同秒写入」时触发，实测不可靠），归一化残留会一直潜伏进新
// 快照。--renormalize 对全部跟踪文件按当前属性（无转换）重哈希一次；
// 无 pathspec 时它是空操作（实测「Nothing specified, nothing added」），
// 必须带 ':(top)' 顶层魔法 pathspec（cwd 无关），也不能加
// --literal-pathspecs（会废掉魔法解析）。标记文件保证每仓库至多跑一次；
// 失败（老 git 无该选项退出 129、偶发锁冲突等）只跳过标记、下条消息重试，
// 不 throw——迁移是 best-effort，不能让老 git 机器的快照从此全挂。
// 依赖外层已定义的 $git/$g/$root；仅 snapshotScript 使用（execute 的救援
// 安全快照在回退前必先跑一次快照，回退链路天然被覆盖）。
function attrsMigrateBlock() {
  return [
    "$migStamp = Join-Path $g 'attrs-v1.stamp'",
    'if (-not (Test-Path -LiteralPath $migStamp)) {',
    "  & $git --git-dir=$g --work-tree=$root add --renormalize --ignore-errors -- ':(top)'",
    '  if ($LASTEXITCODE -le 1) { Set-Content -LiteralPath $migStamp -Value 1 -Encoding ascii -ErrorAction SilentlyContinue }',
    '}',
  ].join('\n')
}

// 快照：git add -A 增量同步 index（.gitignore/exclude 语义由 git 统一处理），
// write-tree 生成树、commit-tree 生成无父孤儿提交、tag 保对象可达。
// 不做 parent 链、不修剪：像 TraeWork 一样保留全量历史，tag 永远可查。
// tag -f：事件重放/重发会产生重复 messageId，裸 tag 对已存在 tag fatal
// 导致整条快照失败；commit-tree 每次生成新对象，-f 把 tag 指到最新提交，
// 与「同一条消息重快照取最新状态」的语义一致。
export function snapshotScript(root, store, gitExe, messageId, base) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$git = ' + psq(gitExe),
    '$g = ' + psq(store.git),
    '$root = ' + psq(root),
    heartbeatBlock(),
    dropGitlinksBlock(),
    excludeSyncBlock(store.excludeFile, base),
    attrsMigrateBlock(),
    // fail-open add（issue #7 加固）：--ignore-errors 让「个别路径无法索引」
    // （无提交的嵌入式仓库、不可读文件等）以退出码 1 结束但索引照常落盘，
    // 快照缺个别路径可接受，好过整条快照 fatal。退出码 ≥2 才是真 fatal
    // （磁盘满、index.lock 等），必须显式 throw：pwsh 对原生命令非零退出
    // 不抛（EAP 不作用于 native），不检查就会带着未更新的旧索引走完
    // write-tree/commit/tag，产出「空树假成功」快照（实测 PS 5.1/pwsh 7
    // 均如此）。add 输出临时降到 Continue 再 2>&1 捕获：合并进管道会把
    // native stderr 包装成 ErrorRecord，EAP=Stop 下直接抛 NativeCommandError，
    // 而 PS 5.1 的 SilentlyContinue 会把合并流里的记录整个丢弃（实测 LOG
    // 为空）——Continue 是两个版本下唯一都能拿到 stderr 文本的取值。捕获
    // 后按 "unable to index file 'X'" 提取被跳过的路径，以 SNAP_SKIP 行
    // 回传 JS 侧做用户可见提示。
    "$ErrorActionPreference = 'Continue'",
    "$addLog = (@(& $git --git-dir=$g --work-tree=$root add -A --ignore-errors 2>&1) | ForEach-Object { [string]$_ }) -join \"`n\"",
    '$addRc = $LASTEXITCODE',
    "$ErrorActionPreference = 'Stop'",
    'if ($addRc -ge 2) { throw ("git add fatal (exit " + $addRc + "): " + $addLog) }',
    "foreach ($m in [regex]::Matches($addLog, \"unable to index file '([^']+)'\") ) { Write-Output ('SNAP_SKIP ' + $m.Groups[1].Value) }",
    dropGitlinksBlock(),
    oversizeBlock(store.maxFileBytes),
    '$tree = (& $git --git-dir=$g --work-tree=$root write-tree).Trim()',
    "$commit = (& $git --git-dir=$g -c user.name=dsh-recall -c user.email=recall@dsh.local commit-tree $tree -m ('snapshot ' + " + psq(messageId) + ")).Trim()",
    '& $git --git-dir=$g tag -f ' + psq('snap-' + messageId) + ' $commit | Out-Null',
    // PF-1：TREE 行随 SNAP_OK 回传 add -A 之后的 index 树指纹——execute 用它与
    // preview 时的指纹比对即可判定「预览后文件是否变化」（STALE），免掉 execute
    // 侧整条重复 diff。安全快照（pre-rollback）同样输出，比对点见 routes-core。
    "Write-Output ('TREE ' + $tree)",
    "Write-Output 'SNAP_OK'"
  ].join('\n')
}

// diff：把当前状态 add 进 index 后用 ls-files --stage 取当前清单，
// 与目标 tag 的 ls-tree 对比——ignore/exclude 语义两侧一致，不会把
// node_modules 等误报为“新增”。
// 不用 -z：PowerShell 捕获原生命令输出会丢弃含 NUL 的行（实测整段变 null），
// 改用 core.quotePath=false 让非 ASCII 路径原样输出，逐行按 TAB 解析。
// 代价是文件名含换行的极端情况会解析错乱——概率可忽略，记录为已知限制。
// （UTF-8 输出编码由 runShell 注入的 UTF8_PRELUDE 统一保证，此处不再重复设置。）
// 输出协议（PF-1，JS 侧 parseDiffOutput 解析）：
//   TOTAL <全量条数> / 前 maxChanges 条的 JSON / TREE <index 树指纹>
// 全量 ConvertTo-Json 在 PS 5.1 上慢且几万条目时 stdout 白胖——截断前移到
// 脚本侧，total 语义由 TOTAL 行保持。write-tree 探测指纹（add 后的 index 树
// 即工作区精确状态），preview 回传、execute 与安全快照比对判 STALE，省掉
// execute 的整条重复 diff；无引用树对象由 prune/定期 gc 回收（每棵数百字节）。
export function diffScript(root, store, gitExe, tag, base, maxChanges) {
  // 截断数由调用侧注入（snapshots.js MAX_CHANGES 单一事实源），模板不硬编码
  const take = Math.max(1, Math.trunc(Number(maxChanges) || 500))
  return [
    "$ErrorActionPreference = 'Stop'",
    '$git = ' + psq(gitExe),
    '$g = ' + psq(store.git),
    '$root = ' + psq(root),
    dropGitlinksBlock(),
    excludeSyncBlock(store.excludeFile, base),
    // fail-open add：语义同 snapshotScript（--ignore-errors 跳过无法索引的
    // 路径、≥2 显式 throw 防「旧索引假成功」）；此处不提取 SNAP_SKIP——
    // 被跳过的路径不进索引，diff 天然不显示、rollback 的删除清单来自当前
    // 索引也天然不会误删它们
    '& $git --git-dir=$g --work-tree=$root add -A --ignore-errors',
    'if ($LASTEXITCODE -ge 2) { throw ("git add fatal (exit " + $LASTEXITCODE + ")") }',
    dropGitlinksBlock(),
    oversizeBlock(store.maxFileBytes),
    '$curOut = & $git -c core.quotePath=false --git-dir=$g --work-tree=$root ls-files --stage',
    // 旧 tag 的树里可能仍有 gitlink（修复前留下的），从目标侧一并剔除，
    // 否则 diff 会报出“恢复 dsh-recall-plugin”这类幻影条目
    "$targetOut = @(& $git -c core.quotePath=false --git-dir=$g ls-tree -r " + psq(tag) + " | Where-Object { -not $_.StartsWith('160000') })",
    '$curMap = @{}',
    'foreach ($r in @($curOut)) {',
    '  if (-not $r) { continue }',
    '  $tab = $r.IndexOf("`t"); $path = $r.Substring($tab + 1)',
    '  $sha = ($r.Substring(0, $tab) -split " ")[1]',
    '  $curMap[$path] = $sha',
    '}',
    '$targetMap = @{}',
    'foreach ($r in @($targetOut)) {',
    '  if (-not $r) { continue }',
    '  $tab = $r.IndexOf("`t"); $path = $r.Substring($tab + 1)',
    '  $sha = ($r.Substring(0, $tab) -split " ")[2]',
    '  $targetMap[$path] = $sha',
    '}',
    '$result = @()',
    'foreach ($k in $curMap.Keys) {',
    '  if (-not $targetMap.ContainsKey($k)) { $result += [pscustomobject]@{ rel = $k; kind = "added" } }',
    '  elseif ($targetMap[$k] -ne $curMap[$k]) { $result += [pscustomobject]@{ rel = $k; kind = "modified" } }',
    '}',
    'foreach ($k in $targetMap.Keys) {',
    '  if (-not $curMap.ContainsKey($k)) { $result += [pscustomobject]@{ rel = $k; kind = "restored" } }',
    '}',
    '$sorted = @($result | Sort-Object rel)',
    "Write-Output ('TOTAL ' + $sorted.Count)",
    'Write-Output (ConvertTo-Json -InputObject @($sorted | Select-Object -First ' + take + ') -Depth 3 -Compress)',
    '$tree = (& $git --git-dir=$g --work-tree=$root write-tree).Trim()',
    "Write-Output ('TREE ' + $tree)"
  ].join('\n')
}

// 回退：恢复侧走 git archive --format=zip + Expand-Archive，删除侧按
// 清单移除「当前有、目标无」的文件。曾尝试 tar 优先（bsdtar 性能更好），
// 实测否决：System32\bsdtar 在 GBK 活动代码页（ACP=936）机器上把 tar
// 流里的 UTF-8 文件名按 ANSI 解码——中文文件名解包成「璇存槑.txt」式的
// 乱码新文件，原路径反而丢失；且 tar -m 才是必需的（stat 缓存碰撞），
// Expand-Archive 天然把 mtime 设为解包时刻，zip 链路反而更稳。
// 空树跳过 archive（空 zip 会让 Expand-Archive 报错），只执行删除。
// 回退后保留快照 tag 与索引：git delta 空间便宜，保留历史可再次
// 用该快照恢复（幂等），也避免误回退后无法找回。
export function rollbackScript(root, store, gitExe, tag, base) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$git = ' + psq(gitExe),
    '$g = ' + psq(store.git),
    '$root = ' + psq(root),
    dropGitlinksBlock(),
    excludeSyncBlock(store.excludeFile, base),
    // fail-open add：语义同 snapshotScript 同款注释（diff/rollback 复用）
    '& $git --git-dir=$g --work-tree=$root add -A --ignore-errors',
    'if ($LASTEXITCODE -ge 2) { throw ("git add fatal (exit " + $LASTEXITCODE + ")") }',
    dropGitlinksBlock(),
    oversizeBlock(store.maxFileBytes),
    // 同 diffScript：-z 的 NUL 输出会被 PowerShell 捕获丢弃，改为逐行 + quotePath=false
    '$curOut = & $git -c core.quotePath=false --git-dir=$g --work-tree=$root ls-files --stage',
    "$targetOut = @(& $git -c core.quotePath=false --git-dir=$g ls-tree -r " + psq(tag) + " | Where-Object { -not $_.StartsWith('160000') })",
    '$targetMap = @{}',
    'foreach ($r in @($targetOut)) {',
    '  if (-not $r) { continue }',
    '  $tab = $r.IndexOf("`t"); $path = $r.Substring($tab + 1)',
    '  $targetMap[$path] = $true',
    '}',
    '$restored = $targetMap.Count',
    'if ($restored -gt 0) {',
    '  $zip = ' + psq(store.dir + '\\restore-tmp.zip'),
    '  & $git --git-dir=$g archive --format=zip --output=$zip ' + psq(tag),
    '  Expand-Archive -LiteralPath $zip -DestinationPath $root -Force',
    '  Remove-Item -LiteralPath $zip -Force',
    '}',
    // 删除失败语义与 POSIX 版对齐（F-G2）：本侧 EAP=Stop 下 Remove-Item
    // 失败直接抛终止错误、pwsh 以非零码退出；POSIX 侧 rm 在 set -e 的 if
    // 条件里失败不会自动终止，须显式 exit 1（见 scripts.posix.js rollbackScript）。
    // 任何一侧半回退都不许报 ROLLBACK_OK——假成功会让救援永不触发（H1）。
    '$deleted = 0',
    'foreach ($r in @($curOut)) {',
    '  if (-not $r) { continue }',
    '  $tab = $r.IndexOf("`t"); $path = $r.Substring($tab + 1)',
    '  if (-not $targetMap.ContainsKey($path)) {',
    "    $full = Join-Path $root ($path.Replace('/','\\'))",
    '    if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Force; $deleted++ }',
    '  }',
    '}',
    "Write-Output ('ROLLBACK_OK ' + $deleted + ' ' + $restored)"
  ].join('\n')
}

// 回退失败救援（H1）：rollback 脚本未输出 ROLLBACK_OK（工作区可能半回退）
// 时，用 execute 预先打下的安全快照把工作区 reset 回「回退前」状态。
// 入参 tag 是完整 tag 名（snap-pre-rollback-<ts>，snap- 前缀由调用侧
// rescueRollback 拼齐——snapshotScript 打 tag 无条件加前缀，本模板保持
// 通用只接受完整名）。命令与 rollbackScript 同款 --git-dir/--work-tree 形态；
// pwsh 对 native 非零退出不抛（EAP 不作用于 native），必须显式查
// $LASTEXITCODE 并 throw，否则救援失败被静默吞掉、工作区停在半回退状态。
export function rescueScript(root, store, gitExe, tag) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$git = ' + psq(gitExe),
    '$g = ' + psq(store.git),
    '$root = ' + psq(root),
    '& $git --git-dir=$g --work-tree=$root reset --hard ' + psq(tag),
    'if ($LASTEXITCODE -ne 0) { throw ("git reset --hard failed (exit " + $LASTEXITCODE + ")") }',
    "Write-Output 'RESCUE_OK'"
  ].join('\n')
}

export function listTagsScript(store, gitExe) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$git = ' + psq(gitExe),
    '$g = ' + psq(store.git),
    // 仅创建过 store 目录、尚未产生过快照时没有 git/.git；把它视为
    // 空快照仓库而非错误，全部删除仍可顺便清空其陈旧 index.json。
    'if (-not (Test-Path -LiteralPath $g -PathType Container)) { exit 0 }',
    '& $git --git-dir=$g tag -l "snap-*"'
  ].join('\n')
}

// 孤儿重建用 tag 清单（带 creatordate）：语义同 POSIX 版同名导出——
// rebuildOrphans 据此恢复快照时间，time=0 会让管理列表时间前缀缺失、
// retention/limits 按「最旧」误清。lightweight tag 的 creatordate 即
// 指向 commit 的提交日期。输出每行「<tag名> <秒级时间戳>」。
export function listTagsWithTimeScript(store, gitExe) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$git = ' + psq(gitExe),
    '$g = ' + psq(store.git),
    'if (-not (Test-Path -LiteralPath $g -PathType Container)) { exit 0 }',
    '& $git --git-dir=$g for-each-ref --format="%(refname:short) %(creatordate:unix)" "refs/tags/snap-*"'
  ].join('\n')
}

// 定期 gc：全量保留策略下对象只增不减，且默认 loose 存储（每对象一个
// 小文件，NTFS 最小簇 4KB）非常浪费；gc 压 pack + 跨版本 delta 通常省一半
// 以上。--prune=now 让「会话删除联动清理」删掉的 tag 立即真正释放空间
// （默认 2 周宽限期内对象仍占盘）——安全前提是 gc 与快照在同一条串行
// 队列里执行（见 maintenance.js），不存在并发竞态。
// 结尾写 gc.stamp：跨重启的节流凭据（ensureGit 回读）。
export function gcScript(store, gitExe) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$git = ' + psq(gitExe),
    '$g = ' + psq(store.git),
    '& $git --git-dir=$g gc --quiet --prune=now',
    "Set-Content -LiteralPath (Join-Path $g 'gc.stamp') -Value ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()) -Encoding ascii",
    "Write-Output 'GC_OK'"
  ].join('\n')
}

// 快照失败后的残骸清理（issue #7 实测：失败重试一个下午可积累 127GB
// dangling 对象）。失败的 add 已把部分 blob 写进对象库，但 write-tree/
// commit/tag 未发生——这些对象无引用可达；git prune 以 refs + 暂存 index
// 为根做可达性删除，正好只清掉这批无主对象，不碰任何 tag 快照。不做 gc：
// gc 是全量 repack 重活，失败重试场景下对象库往往已被残骸撑大，代价过高。
// 调用点在 captureSnapshot 的 catch 里，与快照同走一条串行队列，无锁竞态。
export function pruneScript(store, gitExe) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$git = ' + psq(gitExe),
    '$g = ' + psq(store.git),
    '& $git --git-dir=$g prune',
    "Write-Output 'PRUNE_OK'"
  ].join('\n')
}

// 失败后的孤儿进程清扫 + stale 锁清理（issue #7 实测：超时被杀的 shell 留下
// 孤儿 git 继续持有 index.lock 30+ 分钟）。M3 三级出口（语义与动机见
// scripts.posix.js 同名函数注释）：另一活实例心跳让路（CLEANUP_OTHER_INSTANCE）
// → 新锁让路（CLEANUP_SKIPPED_FRESH_LOCK）→ 原有清扫（CLEANUP_DONE）。
// DSH 的 subprocess 服务本身已做树级终止（taskkill /T /F），这里是竞态窗口
// 与旧版本漏网的兜底：按「命令行含 --git-dir=<本仓库>」定位孤儿——该标记只
// 出现在本插件派生的 git 进程参数里，编辑器等无关进程不会命中。
// 全程 SilentlyContinue + best-effort：调用点在 runShell 的失败路径上，
// 清扫自身再抛错只会掩盖原始错误。首行哨兵注释供 runShell 识别本脚本、
// 防止「清扫失败 → 再清扫」的递归。
export function killOrphansScript(gitDir) {
  return [
    '# RECALL_CLEANUP',
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$g = ' + psq(gitDir),
    // —— 第 1 级保护：另一活实例心跳（store.dir 是 git-dir 上两级）——
    "$hbf = Join-Path (Split-Path -Parent (Split-Path -Parent $g)) 'heartbeat'",
    'if (Test-Path -LiteralPath $hbf -PathType Leaf) {',
    '  $hl = Get-Content -LiteralPath $hbf -TotalCount 1',
    '  if ($hl) {',
    "    $hp = ('' + $hl).Trim() -split '\\s+'",
    '    $a = [int64]0; $b = [int64]0',
    '    if (($hp.Count -ge 2) -and [int64]::TryParse($hp[0], [ref]$a) -and [int64]::TryParse($hp[1], [ref]$b)) {',
    '      $age = [DateTimeOffset]::Now.ToUnixTimeSeconds() - $b',
    '      if (($a -gt 0) -and ($a -ne ' + String(process.pid) + ') -and ($age -ge 0) -and ($age -lt ' + HEARTBEAT_TTL_S + ')) {',
    '        if (Get-Process -Id $a -ErrorAction SilentlyContinue) {',
    "          Write-Output ('CLEANUP_OTHER_INSTANCE ' + $a)",
    '          exit 0',
    '        }',
    '      }',
    '    }',
    '  }',
    '}',
    // —— 第 2 级保护：新锁（有 git 操作可能正在进行）——
    "$cutoff = (Get-Date).AddMinutes(-" + STALE_LOCK_MIN + ')',
    '$fresh = $false',
    "foreach ($n in @('index.lock','config.lock','HEAD.lock','gc.pid','packed-refs.lock','shallow.lock')) {",
    '  $lp = Join-Path $g $n',
    '  if (Test-Path -LiteralPath $lp -PathType Leaf) {',
    '    if ((Get-Item -LiteralPath $lp).LastWriteTime -gt $cutoff) { $fresh = $true; break }',
    '  }',
    '}',
    'if (-not $fresh) {',
    "  $fl = @(Get-ChildItem -LiteralPath (Join-Path $g 'refs') -Recurse -File -Filter '*.lock' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $cutoff })",
    '  if ($fl.Count -gt 0) { $fresh = $true }',
    '}',
    'if ($fresh) {',
    "  Write-Output 'CLEANUP_SKIPPED_FRESH_LOCK'",
    '  exit 0',
    '}',
    // —— 保护未命中：原有清扫（杀孤儿 + 清 stale 锁）——
    // 标记用变量拼接而非字面量：本脚本进程的命令行（-Command 全文）只有
    // 未展开的 '$g'，Where-Object 不会匹配到自己
    "$marker = '--git-dir=' + $g",
    "Get-CimInstance Win32_Process -Filter 'CommandLine IS NOT NULL' | Where-Object { $_.CommandLine.Contains($marker) } | ForEach-Object {",
    '  & taskkill /T /F /PID $_.ProcessId | Out-Null',
    '}',
    // 锁清单：index.lock 是 add/checkout 的持久锁，其余是 gc/tag/pack 链路
    // 可能残留的；refs 下的 per-ref 锁用递归兜底（能走到这里说明锁已陈旧）
    "foreach ($n in @('index.lock','config.lock','HEAD.lock','gc.pid','packed-refs.lock','shallow.lock')) {",
    '  Remove-Item -LiteralPath (Join-Path $g $n) -Force',
    '}',
    "Get-ChildItem -LiteralPath (Join-Path $g 'refs') -Recurse -File -Filter '*.lock' | Remove-Item -Force",
    "Write-Output 'CLEANUP_DONE'"
  ].join('\n')
}

// 删除指定快照 tag（会话已删联动清理用）。best-effort：个别 tag 已不存在时
// git 非零退出，但其余 tag 已被删除——所以显式 exit 0 吞掉退出码，
// 残留的由下一次清理幂等地收尾；JS 侧无论脚本结果都会同步索引。
export function purgeTagsScript(store, gitExe, tags) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$git = ' + psq(gitExe),
    '$g = ' + psq(store.git),
    '& $git --git-dir=$g tag -d ' + tags.map((t) => psq(t)).join(' '),
    "Write-Output 'PURGE_DONE'",
    'exit 0'
  ].join('\n')
}

// 任意长度文本写入（index.json / exclude.txt / lineage.json / root.txt 共用，
// PF-2）：stdin 传全文 + 单进程落盘——旧实现按 base64 20000 字符分块内联
// （规避 -Command 单 argv 元素的 32767 上限），每块一条 PowerShell 进程，
// 索引几百条时 saveIndex = 6+ 条进程，而它在每条消息快照后、每次删除、每次
// init 都全量重写。stdin 不经命令行，长度上限与编码坑天然消失。
// 读取手法是探针（tests/probe/stdin-write.test.js，2026-08-29）钉死的形态：
// [Console]::In.ReadToEnd() 在 PS 5.1 按输入代码页（中文机器 GBK）解码
// UTF-8 字节必挂——必须走 OpenStandardInput 读原始字节再显式 UTF8 解码，
// 与代码页无关；落盘必须用 .NET WriteAllText 无 BOM 重载（PS 5.1 的
// Set-Content -Encoding utf8 必带 BOM）。目录创建归调用方（writeExclude 的
// mkdirScript 兜底 / index.json 的父目录在建仓时已存在）。
export function fileWriteStdinCmd(file) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$tmp = ' + psq(file),
    '$stream = [Console]::OpenStandardInput()',
    '$ms = New-Object System.IO.MemoryStream',
    '$buf = New-Object byte[] 8192',
    'while (($n = $stream.Read($buf, 0, $buf.Length)) -gt 0) { $ms.Write($buf, 0, $n) }',
    '$text = [Text.UTF8Encoding]::new($false).GetString($ms.ToArray())',
    '[IO.File]::WriteAllText($tmp, $text, [Text.UTF8Encoding]::new($false))'
  ].join('\n')
}

// 原子 rename（H2）：同卷 move 是 O(1) 元数据操作，把「已完整写完的 tmp」
// 一步替换成目标文件，杜绝分块写中途崩溃留下的截断 JSON；也用于 loadIndex
// 把损坏索引改名 .corrupt-<ts> 保留现场（见 snapshots.js quarantineCorruptIndex）。
export function renameFileCmd(src, dst) {
  return "$ErrorActionPreference = 'Stop'\nMove-Item -Force -LiteralPath " + psq(src) + ' -Destination ' + psq(dst)
}

// 显式 -Encoding UTF8：写侧（writeTextViaShell base64 解码落盘）产出的是
// 无 BOM UTF-8，PS 7 默认即按 UTF-8 读，但 PS 5.1 兜底（pwsh-local 解析链
// 降级）按 ANSI 活动代码页解码——中文 root 乱码 → JSON.parse 失败 → 误走
// H2 隔离分支。与 excludeReadCmd 等同文件其他读取处的既有写法对齐。
export function indexReadCmd(dir) {
  return 'Get-Content -LiteralPath ' + psq(dir + '\\index.json') + ' -Raw -Encoding UTF8 -ErrorAction SilentlyContinue'
}

// fork lineage 读取（F1）：lineage.json 记录 childId↔parentId 撤回链，
// 与 index.json 同层、原子写（writeTextViaShell）。文件不存在时输出空串。
export function lineageReadCmd(dir) {
  return 'Get-Content -LiteralPath ' + psq(dir + '\\lineage.json') + ' -Raw -Encoding UTF8 -ErrorAction SilentlyContinue'
}

// 旧版项目内 blobs 目录清理（仅 home 存储可用时调用，见 store.js cleanupLegacy）。
// -ErrorAction SilentlyContinue（PF-5）：目标不存在是常态（极早期版本才有），
// 不容错的话 Remove-Item 抛错 → cleanupLegacy 永远走不到「成功」分支，
// legacyCleaned 标记失效，每次 init 都白跑一条进程。
export function legacyRmScript(path) {
  return 'Remove-Item -Recurse -Force -LiteralPath ' + psq(path) + ' -ErrorAction SilentlyContinue'
}

// exclude.txt 原文读取（设置页编辑用）：-Raw 保留换行与空行结构，让用户
// 看到的就是落盘原文；文件不存在时 SilentlyContinue 输出空串，JS 侧按
// 「尚未配置」处理——设置页在快照存储刚建好、exclude.txt 还没写过时也会打开。
export function excludeReadCmd(file) {
  return 'Get-Content -LiteralPath ' + psq(file) + ' -Raw -Encoding UTF8 -ErrorAction SilentlyContinue'
}

// 批量读全部 exclude 文件（PF-8，一条脚本替代每文件一条进程——设置页
// 排除配置首开 4-6 条进程链里的大头）。内容按 base64 单行输出：exclude.txt
// 是用户可编辑的任意文本（可含空行/注释/任意字符串），逐行定界会被内容
// 行打乱，base64 天然免疫；也顺带规避 PS 5.1 下中文内容的代码页转码。
// 文件不存在输出空段（JS 侧按「尚未配置」处理，与 excludeReadCmd 一致）。
// 输出协议（JS 侧 parseExcludeDump 解析）：
//   EXCLBEGIN <文件路径> / <base64 单行，可为空> / EXCLEND
export function excludeDumpScript(files) {
  const lines = ["$ErrorActionPreference = 'SilentlyContinue'"]
  for (const f of files || []) {
    const q = psq(f)
    lines.push(
      "Write-Output ('EXCLBEGIN ' + " + q + ')',
      'if (Test-Path -LiteralPath ' + q + ' -PathType Leaf) { Write-Output ([Convert]::ToBase64String([IO.File]::ReadAllBytes(' + q + '))) }',
      "Write-Output 'EXCLEND'"
    )
  }
  return lines.join('\n')
}

// 目录存在探测：输出定长 YES/NO 标记（与 posix 版逐字同语义），
// JS 侧统一按 'YES' 判定，不依赖退出码——runShell 对非零退出直接抛错。
export function dirExistsScript(dir) {
  return "if (Test-Path -LiteralPath " + psq(dir) + " -PathType Container) { Write-Output 'YES' } else { Write-Output 'NO' }"
}

// 影子仓库磁盘占用（设置页快照管理卡片用）：git 自带的 count-objects -v
// 输出含 size-pack（KiB 单位，pack 文件总大小），足够向用户展示量级，
// 不需要逐文件累加的慢扫描。
export function countObjectsScript(store, gitExe) {
  return [
    '$git = ' + psq(gitExe),
    '$g = ' + psq(store.git),
    '& $git --git-dir=$g count-objects -v'
  ].join('\n')
}

// 目录总大小（字节）：.NET 手动栈遍历（PF-3，容错语义同 oversizeBlock——
// 逐目录 try/catch 跳过不可访问目录）替代 Get-ChildItem -Recurse 逐文件
// 管道求和，GB 级快照库从秒级降到亚秒。$sum 初始化 [long]0 防溢出，目录
// 为空/全跳过时输出 0（旧实现的 .Sum 为 null，JS 侧 parseInt||0 兜底等价）。
export function diskUsageScript(dir) {
  const q = psq(dir)
  return [
    '$usageStack = [System.Collections.Generic.Stack[string]]::new()',
    '$usageStack.Push(' + q + ')',
    '$sum = [long]0',
    'while ($usageStack.Count -gt 0) {',
    '  $dir = $usageStack.Pop()',
    '  try {',
    '    $di = [System.IO.DirectoryInfo]::new($dir)',
    '    foreach ($f in $di.EnumerateFiles()) { $sum += $f.Length }',
    '    foreach ($d in $di.EnumerateDirectories()) { $usageStack.Push($d.FullName) }',
    '  } catch {}',
    '}',
    'Write-Output $sum'
  ].join('\n')
}

// 列目录下所有一级子目录全路径：manage/list 枚举 home 容器下的所有
// 哈希子目录用（每个子目录是一个工作区的 store）。SilentlyContinue
// 容忍个别不可读条目。输出每行一个全路径，JS 侧按换行拆分。
export function listSubdirsScript(dir) {
  return "Get-ChildItem -LiteralPath " + psq(dir) + " -Directory -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_.FullName }"
}

// 批量 dump 全部 store 的元数据：一条 shell 拿「容器下所有子目录 +
// 额外降级目录」的 root.txt、index.json 与 lineage.json 全文。为什么批量：
// 旧实现每个目录 2 条 shell（读 index + 读 root.txt）串行跑，20 个目录就是
// 40 次 PowerShell 冷启动（每次 0.3-1s）——快照管理列表 20 秒级慢的
// 根因。PF-4 起段内再带 lineage.json（manage lineage 原本对每个 root 串行
// 一条进程，并入后零新增）。输出定界格式（JS 侧 parseStoresDump 状态机解析）：
//   ==DIR <目录>
//   ROOT <工作区路径或空>
//   INDEXBEGIN / index.json 原文 / INDEXEND
//   LINEAGEBEGIN / lineage.json 原文 / LINEAGEEND
// 标记行不会与内容混淆：root 路径不含换行（Windows 非法字符），JSON
// 单行以 [ 或 { 起头、内部路径同样不含换行。
export function storesDumpScript(container, extraDirs) {
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    '$dirs = @()'
  ]
  if (container) {
    lines.push('$base = ' + psq(container))
    lines.push("$dirs += @(Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })")
  }
  for (const d of extraDirs || []) lines.push('$dirs += ' + psq(d))
  lines.push(
    'foreach ($d in $dirs) {',
    '  if (-not $d) { continue }',
    '  if (-not (Test-Path -LiteralPath $d -PathType Container)) { continue }',
    '  Write-Output ("==DIR " + $d)',
    "  $rt = Join-Path $d 'root.txt'",
    "  if (Test-Path -LiteralPath $rt -PathType Leaf) {",
    "    $rv = (Get-Content -LiteralPath $rt -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)",
    // 先规整成单行再拼接：root 是单行路径，但用户手改文件可能带 CRLF，
    // 直接拼会把标记结构打乱
    "    if ($rv) { $rv = $rv.Trim() }",
    "    Write-Output ('ROOT ' + $rv)",
    '  } else {',
    "    Write-Output 'ROOT '",
    '  }',
    "  Write-Output 'INDEXBEGIN'",
    "  $ix = Join-Path $d 'index.json'",
    "  if (Test-Path -LiteralPath $ix -PathType Leaf) {",
    '    $j = Get-Content -LiteralPath $ix -Raw -Encoding UTF8 -ErrorAction SilentlyContinue',
    '    if ($j) { Write-Output $j.TrimEnd() }',
    '  }',
    "  Write-Output 'INDEXEND'",
    "  Write-Output 'LINEAGEBEGIN'",
    "  $lg = Join-Path $d 'lineage.json'",
    "  if (Test-Path -LiteralPath $lg -PathType Leaf) {",
    '    $l = Get-Content -LiteralPath $lg -Raw -Encoding UTF8 -ErrorAction SilentlyContinue',
    '    if ($l) { Write-Output $l.TrimEnd() }',
    '  }',
    "  Write-Output 'LINEAGEEND'",
    '}',
    'exit 0'
  )
  return lines.join('\n')
}
