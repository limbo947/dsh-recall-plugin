function psq(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}
const UTF8_PRELUDE = "$OutputEncoding = [Text.UTF8Encoding]::new($false)\ntry { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch {}";
const MAX_FILE_BYTES = 104857600;
const STALE_LOCK_MIN = 5;
const HEARTBEAT_TTL_S = 900;
const FIDELITY_ATTRS = "* -text -filter -ident -export-ignore -export-subst -working-tree-encoding";
function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}
function dropGitlinksBlock() {
  return [
    "& $git --git-dir=$g ls-files --stage | Where-Object { $_ -like '160000*' } | ForEach-Object {",
    '  $p = ($_ -split "`t")[1]',
    "  & $git --literal-pathspecs --git-dir=$g update-index --force-remove -- $p",
    "}"
  ].join("\n");
}
function oversizeBlock(maxBytes) {
  return [
    "$oversizeStack = [System.Collections.Generic.Stack[string]]::new()",
    "$oversizeStack.Push($root)",
    "$oversizeRel = [System.Collections.Generic.List[string]]::new()",
    "while ($oversizeStack.Count -gt 0) {",
    "  $dir = $oversizeStack.Pop()",
    "  try {",
    "    $di = [System.IO.DirectoryInfo]::new($dir)",
    "    foreach ($f in $di.EnumerateFiles()) {",
    "      if ($f.Length -gt " + String(maxBytes || MAX_FILE_BYTES) + ") {",
    "        $oversizeRel.Add($f.FullName.Substring($root.Length + 1).Replace('\\','/'))",
    "      }",
    "    }",
    "    foreach ($d in $di.EnumerateDirectories()) { $oversizeStack.Push($d.FullName) }",
    "  } catch {}",
    "}",
    "for ($i = 0; $i -lt $oversizeRel.Count; $i += 100) {",
    "  $batch = $oversizeRel.GetRange($i, [Math]::Min(100, $oversizeRel.Count - $i))",
    "  & $git --literal-pathspecs --git-dir=$g update-index --force-remove -- $batch",
    "}"
  ].join("\n");
}
function excludeSyncBlock(excludeFile, base) {
  const baseList = (Array.isArray(base) && base.length ? base : [".git", "node_modules/", ".dsh-recall-snapshots/", "dsh-recall-snapshots/"]).map(psq).join(",");
  return [
    "$exFile = " + psq(excludeFile),
    "$userPats = @()",
    "if (Test-Path -LiteralPath $exFile) { $userPats = @(Get-Content -LiteralPath $exFile -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $t = $_.Trim(); $t -and -not $t.StartsWith('#') }) }",
    "$lines = @('') + @(" + baseList + ") + $userPats",
    "$exc = Join-Path $g 'info\\exclude'",
    "$excOld = @(Get-Content -LiteralPath $exc -Encoding UTF8 -ErrorAction SilentlyContinue)",
    "$same = ($excOld.Count -eq $lines.Count)",
    "if ($same) {",
    "  for ($i = 0; $i -lt $lines.Count; $i++) {",
    "    if ($excOld[$i] -ne $lines[$i]) { $same = $false; break }",
    "  }",
    "}",
    "if (-not $same) {",
    "  Set-Content -LiteralPath $exc -Value $lines -Encoding utf8",
    "  $hit = @(& $git -c core.quotePath=false --literal-pathspecs --git-dir=$g ls-files -i -c --exclude-from=$exc | Where-Object { $_ })",
    "  for ($i = 0; $i -lt $hit.Count; $i += 100) {",
    "    $batch = @($hit[$i..([Math]::Min($i + 99, $hit.Count - 1))])",
    "    & $git --literal-pathspecs --git-dir=$g update-index --force-remove -- $batch",
    "  }",
    "}"
  ].join("\n");
}
function heartbeatBlock() {
  return [
    "$hbf = Join-Path (Split-Path -Parent (Split-Path -Parent $g)) 'heartbeat'",
    "Set-Content -LiteralPath $hbf -Value ('" + String(process.pid) + " ' + [DateTimeOffset]::Now.ToUnixTimeSeconds()) -Encoding ascii -ErrorAction SilentlyContinue"
  ].join("\n");
}
function resolveGitScript() {
  return [
    "$candidates = @()",
    "$g = (Get-Command git -ErrorAction SilentlyContinue).Source",
    "if ($g) { $candidates += $g }",
    "if (${env:ProgramFiles}) { $candidates += (Join-Path ${env:ProgramFiles} 'Git\\cmd\\git.exe') }",
    "if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Git\\cmd\\git.exe') }",
    "if (${env:LocalAppData}) { $candidates += (Join-Path ${env:LocalAppData} 'Programs\\Git\\cmd\\git.exe') }",
    "$g = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1",
    "if ($g) { Write-Output $g }"
  ].join("\n");
}
function homeDirScript(root, envHome) {
  return [
    "$r = " + psq(root),
    "$h = if ($env:DSH_HOME) { $env:DSH_HOME } elseif (" + psq(envHome) + ") { " + psq(envHome) + ' } else { Join-Path $env:USERPROFILE ".dsh" }',
    "$sha = [Security.Cryptography.SHA256]::Create()",
    "$hex = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($r))) -replace '-','').ToLower()",
    "Write-Output (Join-Path $h ('dsh-recall-snapshots\\' + $hex))"
  ].join("\n");
}
function mkdirScript(dir) {
  return "New-Item -ItemType Directory -Force -Path " + psq(dir) + " | Out-Null";
}
function migrateScript(src, dst) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$src = " + psq(src),
    "$dst = " + psq(dst),
    "if (Test-Path -LiteralPath (Join-Path $src 'git')) { Move-Item -LiteralPath (Join-Path $src 'git') -Destination (Join-Path $dst 'git') -Force }",
    "if (Test-Path -LiteralPath (Join-Path $src 'index.json')) { Move-Item -LiteralPath (Join-Path $src 'index.json') -Destination (Join-Path $dst 'index.json') -Force }",
    "Remove-Item -Recurse -Force -LiteralPath $src -ErrorAction SilentlyContinue",
    "Write-Output 'MIGRATE_OK'"
  ].join("\n");
}
function ensureGitScript(store, gitExe, base) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$git = " + psq(gitExe),
    "$repo = " + psq(store.repo),
    "$g = " + psq(store.git),
    heartbeatBlock(),
    "if (-not (Test-Path -LiteralPath $g)) {",
    "  & $git init $repo | Out-Null",
    "}",
    "& $git --git-dir=$g config core.longpaths true",
    "& $git --git-dir=$g config core.autocrlf false",
    "& $git --git-dir=$g config advice.addEmbeddedRepo false",
    "$attrDir = Join-Path $g 'info'",
    "Set-Content -LiteralPath (Join-Path $attrDir 'attributes') -Value '" + FIDELITY_ATTRS + "' -Encoding ascii",
    excludeSyncBlock(store.excludeFile, base),
    "$stamp = Join-Path $g 'gc.stamp'",
    "if (Test-Path -LiteralPath $stamp) { Write-Output ('GIT_OK ' + [String](Get-Content -LiteralPath $stamp -TotalCount 1 -ErrorAction SilentlyContinue)) } else { Write-Output 'GIT_OK' }"
  ].join("\n");
}
function attrsMigrateBlock() {
  return [
    "$migStamp = Join-Path $g 'attrs-v1.stamp'",
    "if (-not (Test-Path -LiteralPath $migStamp)) {",
    "  & $git --git-dir=$g --work-tree=$root add --renormalize --ignore-errors -- ':(top)'",
    "  if ($LASTEXITCODE -le 1) { Set-Content -LiteralPath $migStamp -Value 1 -Encoding ascii -ErrorAction SilentlyContinue }",
    "}"
  ].join("\n");
}
function snapshotScript(root, store, gitExe, messageId, base) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$git = " + psq(gitExe),
    "$g = " + psq(store.git),
    "$root = " + psq(root),
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
    '$addLog = (@(& $git --git-dir=$g --work-tree=$root add -A --ignore-errors 2>&1) | ForEach-Object { [string]$_ }) -join "`n"',
    "$addRc = $LASTEXITCODE",
    "$ErrorActionPreference = 'Stop'",
    'if ($addRc -ge 2) { throw ("git add fatal (exit " + $addRc + "): " + $addLog) }',
    `foreach ($m in [regex]::Matches($addLog, "unable to index file '([^']+)'") ) { Write-Output ('SNAP_SKIP ' + $m.Groups[1].Value) }`,
    dropGitlinksBlock(),
    oversizeBlock(store.maxFileBytes),
    "$tree = (& $git --git-dir=$g --work-tree=$root write-tree).Trim()",
    "$commit = (& $git --git-dir=$g -c user.name=dsh-recall -c user.email=recall@dsh.local commit-tree $tree -m ('snapshot ' + " + psq(messageId) + ")).Trim()",
    "& $git --git-dir=$g tag -f " + psq("snap-" + messageId) + " $commit | Out-Null",
    // PF-1：TREE 行随 SNAP_OK 回传 add -A 之后的 index 树指纹——execute 用它与
    // preview 时的指纹比对即可判定「预览后文件是否变化」（STALE），免掉 execute
    // 侧整条重复 diff。安全快照（pre-rollback）同样输出，比对点见 routes-core。
    "Write-Output ('TREE ' + $tree)",
    "Write-Output 'SNAP_OK'"
  ].join("\n");
}
function diffScript(root, store, gitExe, tag, base, maxChanges) {
  const take = Math.max(1, Math.trunc(Number(maxChanges) || 500));
  return [
    "$ErrorActionPreference = 'Stop'",
    "$git = " + psq(gitExe),
    "$g = " + psq(store.git),
    "$root = " + psq(root),
    dropGitlinksBlock(),
    excludeSyncBlock(store.excludeFile, base),
    // fail-open add：语义同 snapshotScript（--ignore-errors 跳过无法索引的
    // 路径、≥2 显式 throw 防「旧索引假成功」）；此处不提取 SNAP_SKIP——
    // 被跳过的路径不进索引，diff 天然不显示、rollback 的删除清单来自当前
    // 索引也天然不会误删它们
    "& $git --git-dir=$g --work-tree=$root add -A --ignore-errors",
    'if ($LASTEXITCODE -ge 2) { throw ("git add fatal (exit " + $LASTEXITCODE + ")") }',
    dropGitlinksBlock(),
    oversizeBlock(store.maxFileBytes),
    "$curOut = & $git -c core.quotePath=false --git-dir=$g --work-tree=$root ls-files --stage",
    // 旧 tag 的树里可能仍有 gitlink（修复前留下的），从目标侧一并剔除，
    // 否则 diff 会报出“恢复 dsh-recall-plugin”这类幻影条目
    "$targetOut = @(& $git -c core.quotePath=false --git-dir=$g ls-tree -r " + psq(tag) + " | Where-Object { -not $_.StartsWith('160000') })",
    "$curMap = @{}",
    "foreach ($r in @($curOut)) {",
    "  if (-not $r) { continue }",
    '  $tab = $r.IndexOf("`t"); $path = $r.Substring($tab + 1)',
    '  $sha = ($r.Substring(0, $tab) -split " ")[1]',
    "  $curMap[$path] = $sha",
    "}",
    "$targetMap = @{}",
    "foreach ($r in @($targetOut)) {",
    "  if (-not $r) { continue }",
    '  $tab = $r.IndexOf("`t"); $path = $r.Substring($tab + 1)',
    '  $sha = ($r.Substring(0, $tab) -split " ")[2]',
    "  $targetMap[$path] = $sha",
    "}",
    "$result = @()",
    "foreach ($k in $curMap.Keys) {",
    '  if (-not $targetMap.ContainsKey($k)) { $result += [pscustomobject]@{ rel = $k; kind = "added" } }',
    '  elseif ($targetMap[$k] -ne $curMap[$k]) { $result += [pscustomobject]@{ rel = $k; kind = "modified" } }',
    "}",
    "foreach ($k in $targetMap.Keys) {",
    '  if (-not $curMap.ContainsKey($k)) { $result += [pscustomobject]@{ rel = $k; kind = "restored" } }',
    "}",
    "$sorted = @($result | Sort-Object rel)",
    "Write-Output ('TOTAL ' + $sorted.Count)",
    "Write-Output (ConvertTo-Json -InputObject @($sorted | Select-Object -First " + take + ") -Depth 3 -Compress)",
    "$tree = (& $git --git-dir=$g --work-tree=$root write-tree).Trim()",
    "Write-Output ('TREE ' + $tree)"
  ].join("\n");
}
function rollbackScript(root, store, gitExe, tag, base) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$git = " + psq(gitExe),
    "$g = " + psq(store.git),
    "$root = " + psq(root),
    dropGitlinksBlock(),
    excludeSyncBlock(store.excludeFile, base),
    // fail-open add：语义同 snapshotScript 同款注释（diff/rollback 复用）
    "& $git --git-dir=$g --work-tree=$root add -A --ignore-errors",
    'if ($LASTEXITCODE -ge 2) { throw ("git add fatal (exit " + $LASTEXITCODE + ")") }',
    dropGitlinksBlock(),
    oversizeBlock(store.maxFileBytes),
    // 同 diffScript：-z 的 NUL 输出会被 PowerShell 捕获丢弃，改为逐行 + quotePath=false
    "$curOut = & $git -c core.quotePath=false --git-dir=$g --work-tree=$root ls-files --stage",
    "$targetOut = @(& $git -c core.quotePath=false --git-dir=$g ls-tree -r " + psq(tag) + " | Where-Object { -not $_.StartsWith('160000') })",
    "$targetMap = @{}",
    "foreach ($r in @($targetOut)) {",
    "  if (-not $r) { continue }",
    '  $tab = $r.IndexOf("`t"); $path = $r.Substring($tab + 1)',
    "  $targetMap[$path] = $true",
    "}",
    "$restored = $targetMap.Count",
    "if ($restored -gt 0) {",
    "  $zip = " + psq(store.dir + "\\restore-tmp.zip"),
    "  & $git --git-dir=$g archive --format=zip --output=$zip " + psq(tag),
    "  Expand-Archive -LiteralPath $zip -DestinationPath $root -Force",
    "  Remove-Item -LiteralPath $zip -Force",
    "}",
    // 删除失败语义与 POSIX 版对齐（F-G2）：本侧 EAP=Stop 下 Remove-Item
    // 失败直接抛终止错误、pwsh 以非零码退出；POSIX 侧 rm 在 set -e 的 if
    // 条件里失败不会自动终止，须显式 exit 1（见 scripts.posix.js rollbackScript）。
    // 任何一侧半回退都不许报 ROLLBACK_OK——假成功会让救援永不触发（H1）。
    "$deleted = 0",
    "foreach ($r in @($curOut)) {",
    "  if (-not $r) { continue }",
    '  $tab = $r.IndexOf("`t"); $path = $r.Substring($tab + 1)',
    "  if (-not $targetMap.ContainsKey($path)) {",
    "    $full = Join-Path $root ($path.Replace('/','\\'))",
    "    if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Force; $deleted++ }",
    "  }",
    "}",
    "Write-Output ('ROLLBACK_OK ' + $deleted + ' ' + $restored)"
  ].join("\n");
}
function rescueScript(root, store, gitExe, tag) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$git = " + psq(gitExe),
    "$g = " + psq(store.git),
    "$root = " + psq(root),
    "& $git --git-dir=$g --work-tree=$root reset --hard " + psq(tag),
    'if ($LASTEXITCODE -ne 0) { throw ("git reset --hard failed (exit " + $LASTEXITCODE + ")") }',
    "Write-Output 'RESCUE_OK'"
  ].join("\n");
}
function listTagsScript(store, gitExe) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$git = " + psq(gitExe),
    "$g = " + psq(store.git),
    // 仅创建过 store 目录、尚未产生过快照时没有 git/.git；把它视为
    // 空快照仓库而非错误，全部删除仍可顺便清空其陈旧 index.json。
    "if (-not (Test-Path -LiteralPath $g -PathType Container)) { exit 0 }",
    '& $git --git-dir=$g tag -l "snap-*"'
  ].join("\n");
}
function listTagsWithTimeScript(store, gitExe) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$git = " + psq(gitExe),
    "$g = " + psq(store.git),
    "if (-not (Test-Path -LiteralPath $g -PathType Container)) { exit 0 }",
    '& $git --git-dir=$g for-each-ref --format="%(refname:short) %(creatordate:unix)" "refs/tags/snap-*"'
  ].join("\n");
}
function gcScript(store, gitExe) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$git = " + psq(gitExe),
    "$g = " + psq(store.git),
    "& $git --git-dir=$g gc --quiet --prune=now",
    "Set-Content -LiteralPath (Join-Path $g 'gc.stamp') -Value ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()) -Encoding ascii",
    "Write-Output 'GC_OK'"
  ].join("\n");
}
function pruneScript(store, gitExe) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$git = " + psq(gitExe),
    "$g = " + psq(store.git),
    "& $git --git-dir=$g prune",
    "Write-Output 'PRUNE_OK'"
  ].join("\n");
}
function killOrphansScript(gitDir) {
  return [
    "# RECALL_CLEANUP",
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$g = " + psq(gitDir),
    // —— 第 1 级保护：另一活实例心跳（store.dir 是 git-dir 上两级）——
    "$hbf = Join-Path (Split-Path -Parent (Split-Path -Parent $g)) 'heartbeat'",
    "if (Test-Path -LiteralPath $hbf -PathType Leaf) {",
    "  $hl = Get-Content -LiteralPath $hbf -TotalCount 1",
    "  if ($hl) {",
    "    $hp = ('' + $hl).Trim() -split '\\s+'",
    "    $a = [int64]0; $b = [int64]0",
    "    if (($hp.Count -ge 2) -and [int64]::TryParse($hp[0], [ref]$a) -and [int64]::TryParse($hp[1], [ref]$b)) {",
    "      $age = [DateTimeOffset]::Now.ToUnixTimeSeconds() - $b",
    "      if (($a -gt 0) -and ($a -ne " + String(process.pid) + ") -and ($age -ge 0) -and ($age -lt " + HEARTBEAT_TTL_S + ")) {",
    "        if (Get-Process -Id $a -ErrorAction SilentlyContinue) {",
    "          Write-Output ('CLEANUP_OTHER_INSTANCE ' + $a)",
    "          exit 0",
    "        }",
    "      }",
    "    }",
    "  }",
    "}",
    // —— 第 2 级保护：新锁（有 git 操作可能正在进行）——
    "$cutoff = (Get-Date).AddMinutes(-" + STALE_LOCK_MIN + ")",
    "$fresh = $false",
    "foreach ($n in @('index.lock','config.lock','HEAD.lock','gc.pid','packed-refs.lock','shallow.lock')) {",
    "  $lp = Join-Path $g $n",
    "  if (Test-Path -LiteralPath $lp -PathType Leaf) {",
    "    if ((Get-Item -LiteralPath $lp).LastWriteTime -gt $cutoff) { $fresh = $true; break }",
    "  }",
    "}",
    "if (-not $fresh) {",
    "  $fl = @(Get-ChildItem -LiteralPath (Join-Path $g 'refs') -Recurse -File -Filter '*.lock' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $cutoff })",
    "  if ($fl.Count -gt 0) { $fresh = $true }",
    "}",
    "if ($fresh) {",
    "  Write-Output 'CLEANUP_SKIPPED_FRESH_LOCK'",
    "  exit 0",
    "}",
    // —— 保护未命中：原有清扫（杀孤儿 + 清 stale 锁）——
    // 标记用变量拼接而非字面量：本脚本进程的命令行（-Command 全文）只有
    // 未展开的 '$g'，Where-Object 不会匹配到自己
    "$marker = '--git-dir=' + $g",
    "Get-CimInstance Win32_Process -Filter 'CommandLine IS NOT NULL' | Where-Object { $_.CommandLine.Contains($marker) } | ForEach-Object {",
    "  & taskkill /T /F /PID $_.ProcessId | Out-Null",
    "}",
    // 锁清单：index.lock 是 add/checkout 的持久锁，其余是 gc/tag/pack 链路
    // 可能残留的；refs 下的 per-ref 锁用递归兜底（能走到这里说明锁已陈旧）
    "foreach ($n in @('index.lock','config.lock','HEAD.lock','gc.pid','packed-refs.lock','shallow.lock')) {",
    "  Remove-Item -LiteralPath (Join-Path $g $n) -Force",
    "}",
    "Get-ChildItem -LiteralPath (Join-Path $g 'refs') -Recurse -File -Filter '*.lock' | Remove-Item -Force",
    "Write-Output 'CLEANUP_DONE'"
  ].join("\n");
}
function purgeTagsScript(store, gitExe, tags) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$git = " + psq(gitExe),
    "$g = " + psq(store.git),
    "& $git --git-dir=$g tag -d " + tags.map((t) => psq(t)).join(" "),
    "Write-Output 'PURGE_DONE'",
    "exit 0"
  ].join("\n");
}
function fileWriteStdinCmd(file) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$tmp = " + psq(file),
    "$stream = [Console]::OpenStandardInput()",
    "$ms = New-Object System.IO.MemoryStream",
    "$buf = New-Object byte[] 8192",
    "while (($n = $stream.Read($buf, 0, $buf.Length)) -gt 0) { $ms.Write($buf, 0, $n) }",
    "$text = [Text.UTF8Encoding]::new($false).GetString($ms.ToArray())",
    "[IO.File]::WriteAllText($tmp, $text, [Text.UTF8Encoding]::new($false))"
  ].join("\n");
}
function renameFileCmd(src, dst) {
  return "$ErrorActionPreference = 'Stop'\nMove-Item -Force -LiteralPath " + psq(src) + " -Destination " + psq(dst);
}
function indexReadCmd(dir) {
  return "Get-Content -LiteralPath " + psq(dir + "\\index.json") + " -Raw -Encoding UTF8 -ErrorAction SilentlyContinue";
}
function lineageReadCmd(dir) {
  return "Get-Content -LiteralPath " + psq(dir + "\\lineage.json") + " -Raw -Encoding UTF8 -ErrorAction SilentlyContinue";
}
function legacyRmScript(path) {
  return "Remove-Item -Recurse -Force -LiteralPath " + psq(path) + " -ErrorAction SilentlyContinue";
}
function excludeReadCmd(file) {
  return "Get-Content -LiteralPath " + psq(file) + " -Raw -Encoding UTF8 -ErrorAction SilentlyContinue";
}
function excludeDumpScript(files) {
  const lines = ["$ErrorActionPreference = 'SilentlyContinue'"];
  for (const f of files || []) {
    const q = psq(f);
    lines.push(
      "Write-Output ('EXCLBEGIN ' + " + q + ")",
      "if (Test-Path -LiteralPath " + q + " -PathType Leaf) { Write-Output ([Convert]::ToBase64String([IO.File]::ReadAllBytes(" + q + "))) }",
      "Write-Output 'EXCLEND'"
    );
  }
  return lines.join("\n");
}
function dirExistsScript(dir) {
  return "if (Test-Path -LiteralPath " + psq(dir) + " -PathType Container) { Write-Output 'YES' } else { Write-Output 'NO' }";
}
function countObjectsScript(store, gitExe) {
  return [
    "$git = " + psq(gitExe),
    "$g = " + psq(store.git),
    "& $git --git-dir=$g count-objects -v"
  ].join("\n");
}
function diskUsageScript(dir) {
  const q = psq(dir);
  return [
    "$usageStack = [System.Collections.Generic.Stack[string]]::new()",
    "$usageStack.Push(" + q + ")",
    "$sum = [long]0",
    "while ($usageStack.Count -gt 0) {",
    "  $dir = $usageStack.Pop()",
    "  try {",
    "    $di = [System.IO.DirectoryInfo]::new($dir)",
    "    foreach ($f in $di.EnumerateFiles()) { $sum += $f.Length }",
    "    foreach ($d in $di.EnumerateDirectories()) { $usageStack.Push($d.FullName) }",
    "  } catch {}",
    "}",
    "Write-Output $sum"
  ].join("\n");
}
function listSubdirsScript(dir) {
  return "Get-ChildItem -LiteralPath " + psq(dir) + " -Directory -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_.FullName }";
}
function storesDumpScript(container, extraDirs) {
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    "$dirs = @()"
  ];
  if (container) {
    lines.push("$base = " + psq(container));
    lines.push("$dirs += @(Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })");
  }
  for (const d of extraDirs || []) lines.push("$dirs += " + psq(d));
  lines.push(
    "foreach ($d in $dirs) {",
    "  if (-not $d) { continue }",
    "  if (-not (Test-Path -LiteralPath $d -PathType Container)) { continue }",
    '  Write-Output ("==DIR " + $d)',
    "  $rt = Join-Path $d 'root.txt'",
    "  if (Test-Path -LiteralPath $rt -PathType Leaf) {",
    "    $rv = (Get-Content -LiteralPath $rt -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)",
    // 先规整成单行再拼接：root 是单行路径，但用户手改文件可能带 CRLF，
    // 直接拼会把标记结构打乱
    "    if ($rv) { $rv = $rv.Trim() }",
    "    Write-Output ('ROOT ' + $rv)",
    "  } else {",
    "    Write-Output 'ROOT '",
    "  }",
    "  Write-Output 'INDEXBEGIN'",
    "  $ix = Join-Path $d 'index.json'",
    "  if (Test-Path -LiteralPath $ix -PathType Leaf) {",
    "    $j = Get-Content -LiteralPath $ix -Raw -Encoding UTF8 -ErrorAction SilentlyContinue",
    "    if ($j) { Write-Output $j.TrimEnd() }",
    "  }",
    "  Write-Output 'INDEXEND'",
    "  Write-Output 'LINEAGEBEGIN'",
    "  $lg = Join-Path $d 'lineage.json'",
    "  if (Test-Path -LiteralPath $lg -PathType Leaf) {",
    "    $l = Get-Content -LiteralPath $lg -Raw -Encoding UTF8 -ErrorAction SilentlyContinue",
    "    if ($l) { Write-Output $l.TrimEnd() }",
    "  }",
    "  Write-Output 'LINEAGEEND'",
    "}",
    "exit 0"
  );
  return lines.join("\n");
}
export {
  FIDELITY_ATTRS,
  HEARTBEAT_TTL_S,
  MAX_FILE_BYTES,
  STALE_LOCK_MIN,
  UTF8_PRELUDE,
  countObjectsScript,
  diffScript,
  dirExistsScript,
  diskUsageScript,
  ensureGitScript,
  excludeDumpScript,
  excludeReadCmd,
  fileWriteStdinCmd,
  gcScript,
  homeDirScript,
  indexReadCmd,
  killOrphansScript,
  legacyRmScript,
  lineageReadCmd,
  listSubdirsScript,
  listTagsScript,
  listTagsWithTimeScript,
  migrateScript,
  mkdirScript,
  pruneScript,
  psq,
  purgeTagsScript,
  renameFileCmd,
  rescueScript,
  resolveGitScript,
  rollbackScript,
  snapshotScript,
  storesDumpScript,
  stripBom
};
