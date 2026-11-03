function psq(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}
const UTF8_PRELUDE = "$OutputEncoding = [Text.UTF8Encoding]::new($false)\ntry { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch {}";
const MAX_FILE_BYTES = 8388608;
const STALE_LOCK_MIN = 5;
const HEARTBEAT_TTL_S = 900;
const WIN_RESERVED_EXCLUDES = [
  "nul",
  "nul.*",
  "aux",
  "aux.*",
  "con",
  "con.*",
  "prn",
  "prn.*",
  "com[1-9]",
  "com[1-9].*",
  "lpt[1-9]",
  "lpt[1-9].*",
  "com\xB9",
  "com\xB9.*",
  "com\xB2",
  "com\xB2.*",
  "com\xB3",
  "com\xB3.*",
  "lpt\xB9",
  "lpt\xB9.*",
  "lpt\xB2",
  "lpt\xB2.*",
  "lpt\xB3",
  "lpt\xB3.*"
];
const FIDELITY_ATTRS = "* -text -filter -ident -export-ignore -export-subst -working-tree-encoding";
function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}
function dropGitlinksBlock() {
  return [
    "& $git --git-dir=$g ls-files --stage | Where-Object { $_ -like '160000*' } | ForEach-Object {",
    '  $p = ($_ -split "`t")[1]',
    "  & $git --literal-pathspecs --git-dir=$g --work-tree=$root update-index --force-remove -- $p",
    "}"
  ].join("\n");
}
function dirSkipSetBlock(name) {
  return [
    "$" + name + " = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)",
    "foreach ($p in $lines) {",
    '  $t = "$p".Trim()',
    "  if (-not $t -or $t.StartsWith('#') -or $t.StartsWith('!')) { continue }",
    "  $t = $t -replace '/$', ''",
    "  if ($t -notmatch '[*?\\[\\]/\\\\]') { [void]$" + name + ".Add($t) }",
    "}"
  ].join("\n");
}
function reparseDirsBlock() {
  return [
    dirSkipSetBlock("reparseSkip"),
    "$reparseRel = [System.Collections.Generic.List[string]]::new()",
    "if ($root) {",
    "$reparseStack = [System.Collections.Generic.Stack[string]]::new()",
    "$reparseStack.Push($root)",
    "while ($reparseStack.Count -gt 0) {",
    "  $dir = $reparseStack.Pop()",
    "  try {",
    "    $di = [System.IO.DirectoryInfo]::new($dir)",
    "    foreach ($d in $di.EnumerateDirectories()) {",
    "      if ($reparseSkip.Contains($d.Name)) { continue }",
    "      if (($d.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {",
    "        $rel = $d.FullName.Substring($root.Length + 1).Replace('\\','/')",
    '        $rel = $rel -replace "\\[", "\\["',
    '        if ($rel.StartsWith("#") -or $rel.StartsWith("!")) { $rel = "\\" + $rel }',
    "        $reparseRel.Add($rel + '/')",
    "        continue",
    "      }",
    "      $reparseStack.Push($d.FullName)",
    "    }",
    "  } catch {}",
    "}",
    "}",
    "$reparseRel.Sort()"
  ].join("\n");
}
function oversizeRemoveBlock() {
  return [
    "for ($i = 0; $i -lt $oversizeRel.Count; $i += 100) {",
    "  $batch = $oversizeRel.GetRange($i, [Math]::Min(100, $oversizeRel.Count - $i))",
    // --work-tree 不可省：bare 影子仓库下裸 update-index 会 fatal，pwsh 不抛
    // → 大文件静默留在 index 里，maxFileBytes 的承诺形同虚设
    "  & $git --literal-pathspecs --git-dir=$g --work-tree=$root update-index --force-remove -- $batch",
    "}"
  ].join("\n");
}
function oversizeListBlock(maxBytes) {
  return [
    dirSkipSetBlock("oversizeSkip"),
    '$oversizeP = Join-Path $g ("oversize-pathspec." + $PID)',
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
    "    foreach ($d in $di.EnumerateDirectories()) {",
    "      if ($oversizeSkip.Contains($d.Name)) { continue }",
    "      if (($d.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }",
    "      $oversizeStack.Push($d.FullName)",
    "    }",
    "  } catch {}",
    "}",
    // 清单必须存在（--pathspec-from-file 指错会让 add fatal）：无大文件时写空文件，
    // 后续按长度 0 判定「不传该参数」
    "if ($oversizeRel.Count -gt 0) {",
    "  $oversizeSb = [System.Text.StringBuilder]::new()",
    '  foreach ($r in $oversizeRel) { [void]$oversizeSb.Append(":(top,exclude,literal)").Append($r).Append([char]0) }',
    "  [System.IO.File]::WriteAllText($oversizeP, $oversizeSb.ToString(), (New-Object System.Text.UTF8Encoding($false)))",
    "} else {",
    '  Set-Content -LiteralPath $oversizeP -Value "" -NoNewline -Encoding ascii -ErrorAction SilentlyContinue',
    "}",
    oversizeRemoveBlock()
  ].join("\n");
}
function oversizeAddPrepBlock() {
  return [
    "$paArgs = @()",
    "if ((Test-Path -LiteralPath $oversizeP) -and ((Get-Item -LiteralPath $oversizeP).Length -gt 0)) {",
    "  $paOk = Join-Path $g 'pathspec-from-file.ok'",
    "  $paDetect = Test-Path -LiteralPath $paOk",
    "  if (-not $paDetect) {",
    "    $paHit = @()",
    "    $paEap = $ErrorActionPreference",
    "    $ErrorActionPreference = 'Continue'",
    "    try {",
    "      $paHit = @(& $git add -h 2>&1 | Select-String -SimpleMatch '--pathspec-from-file')",
    "    } finally { $ErrorActionPreference = $paEap }",
    "    if ($paHit.Count -gt 0) {",
    "      Set-Content -LiteralPath $paOk -Value 1 -Encoding ascii -ErrorAction SilentlyContinue",
    "      $paDetect = $true",
    "    }",
    "  }",
    '  if ($paDetect) { $paArgs = @(("--pathspec-from-file=" + $oversizeP), "--pathspec-file-nul") }',
    "}",
    "Set-Location -LiteralPath $root"
  ].join("\n");
}
function oversizeCleanupBlock() {
  return "Remove-Item -LiteralPath $oversizeP -ErrorAction SilentlyContinue";
}
function limitScanBlock(maxBytes, fileMaxBytes, budgetMs) {
  const limit = maxBytes > 0 ? String(maxBytes) : "0";
  const fileLimit = String(fileMaxBytes || MAX_FILE_BYTES);
  const budget = budgetMs > 0 ? String(budgetMs) : "0";
  return [
    "$limitSw = [Diagnostics.Stopwatch]::StartNew()",
    "$limitBytes = [long]0",
    "$limitHit = ''",
    "$limitRc = 0",
    "$limitFiles = @()",
    // 临时文件名带 $PID：脚本每次都是新进程，避免同一 store 上的残留互相覆盖
    '$limitErrFile = Join-Path $g ("limit-scan-err." + $PID)',
    // PS 5.1：native stderr 在 EAP=Stop 下会被包成 ErrorRecord 直接抛（pwsh 7
    // 不抛），一条 warning 就能让整条快照挂掉——与下方 add 段同款临时降级
    "$limitEap = $ErrorActionPreference",
    "$ErrorActionPreference = 'Continue'",
    "try {",
    // -z：路径含换行也不分裂（实测 PS 5.1/7 的 @() 都保留 NUL）；stderr 落文件
    // 而不是 $null——失败原因是 issue #29 的第一诉求，不能再吞掉
    "  $limitFiles = @(((& $git -c core.quotePath=false --git-dir=$g --work-tree=$root ls-files -z -co --exclude-standard 2>$limitErrFile) -join '').Split([char]0))",
    "  $limitRc = $LASTEXITCODE",
    "} finally { $ErrorActionPreference = $limitEap }",
    "if ($limitRc -ne 0) {",
    "  $limitMsg = ''",
    // 只取首个非空行：PS 5.1 把 native stderr 写成 ErrorRecord（后续行是
    // 调用点/脚本路径上下文），整段压平会把噪声塞进「最近错误」
    "  try {",
    "    $limitLines = @(Get-Content -LiteralPath $limitErrFile -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $_.Trim() })",
    "    if ($limitLines.Count -gt 0) { $limitMsg = ($limitLines[0] -replace '\\s+', ' ').Trim() }",
    "  } catch {}",
    "  Remove-Item -LiteralPath $limitErrFile -ErrorAction SilentlyContinue",
    "  if ($limitMsg.Length -gt 300) { $limitMsg = $limitMsg.Substring(0, 300) }",
    "  Write-Output ('SNAP_SCAN_FAIL ' + $limitRc)",
    "  Write-Output ('SNAP_SCAN_ERR ' + $limitMsg)",
    "  exit 0",
    "}",
    "Remove-Item -LiteralPath $limitErrFile -ErrorAction SilentlyContinue",
    "foreach ($limitRel in $limitFiles) {",
    // 两道守卫吸收两类异常条目：5.1 的 Split 会留尾部空串；目录条目（嵌套仓库
    // 输出 `dir/`）的 Length 为空或抛——两者都不该计入（add 侧同样不纳入）
    "  if (-not $limitRel) { continue }",
    "  if (" + budget + " -gt 0 -and $limitSw.ElapsedMilliseconds -gt " + budget + ") { $limitHit = 'time'; break }",
    "  try { $limitLen = [System.IO.FileInfo]::new($root + '/' + $limitRel).Length } catch { $limitLen = [long]0 }",
    // 口径 = 实际会进快照的字节：超过单文件上限的文件随后被 oversizeListBlock
    // 移出 index，不该计入总量（否则一个 300MB 视频就能把干净项目误判超限）
    "  if ($limitLen -gt 0 -and $limitLen -le " + fileLimit + ") { $limitBytes += $limitLen }",
    "  if (" + limit + " -gt 0 -and $limitBytes -gt " + limit + ") { $limitHit = 'bytes'; break }",
    "}",
    "if ($limitHit -eq 'bytes') { Write-Output ('SNAP_LIMIT bytes ' + $limitBytes + ' ' + " + limit + "); exit 0 }",
    "if ($limitHit -eq 'time') { Write-Output ('SNAP_LIMIT time ' + $limitSw.ElapsedMilliseconds + ' ' + " + budget + "); exit 0 }"
  ].join("\n");
}
function excludeSyncBlock(excludeFile, base) {
  const configuredBase = Array.isArray(base) && base.length ? base : [".git", "node_modules/", ".dsh-recall-snapshots/", "dsh-recall-snapshots/"];
  const baseList = [...configuredBase, ...WIN_RESERVED_EXCLUDES].map(psq).join(",");
  return [
    "$exFile = " + psq(excludeFile),
    "$userPats = @()",
    "if (Test-Path -LiteralPath $exFile) { $userPats = @(Get-Content -LiteralPath $exFile -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $t = $_.Trim(); $t -and -not $t.StartsWith('#') }) }",
    "$lines = @('') + @(" + baseList + ") + $userPats",
    reparseDirsBlock(),
    // 写盘顺序 base + reparse + userPats（评审 P3 逃生口）：gitignore 后写胜出，
    // 用户行垫底才可用 !path/ 反选重纳良性 junction（指向工作区外、非自引用）；
    // 自引用 junction 切勿反选（爆炸根因，见 reparseDirsBlock）。上方 $lines
    //（base+userPats）先供 reparseDirsBlock 构目录名剪枝集，判据语义不变。
    "$lines = @('') + @(" + baseList + ") + @($reparseRel) + $userPats",
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
    "  if ($hit.Count -gt 10000) {",
    "    & $git --git-dir=$g read-tree --empty",
    "    if ($LASTEXITCODE -ne 0) { throw ('git read-tree --empty failed (exit ' + $LASTEXITCODE + ')') }",
    "  } else {",
    "    for ($i = 0; $i -lt $hit.Count; $i += 100) {",
    "      $batch = @($hit[$i..([Math]::Min($i + 99, $hit.Count - 1))])",
    // 影子仓库是 bare：写 index 必须显式 --work-tree，否则 update-index fatal。
    // ensureGitScript 也走本函数但没有 $root（建仓不遍历工作区）——那时保留
    // 原样调用，命中列表通常为空，最坏是清理静默跳过（fail-open）
    "      if ($root) {",
    "        & $git --literal-pathspecs --git-dir=$g --work-tree=$root update-index --force-remove -- $batch",
    "      } else {",
    "        & $git --literal-pathspecs --git-dir=$g update-index --force-remove -- $batch",
    "      }",
    "    }",
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
    // issue #24：总量/预算护栏先于 add——超限时连 add 都不跑
    limitScanBlock(store.maxWorkspaceBytes, store.maxFileBytes, store.scanBudgetMs),
    // issue #29：大文件清单先于 add——add 带 exclude 后不再为它们写对象
    oversizeListBlock(store.maxFileBytes),
    attrsMigrateBlock(),
    oversizeAddPrepBlock(),
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
    // 后按 "unable to index file 'X'" / "unable to add 'X' to index" 提取
    // 被跳过的路径，以 SNAP_SKIP 行回传 JS 侧做用户可见提示。
    "$ErrorActionPreference = 'Continue'",
    '$addLog = (@(& $git --git-dir=$g --work-tree=$root add -A --ignore-errors @paArgs 2>&1) | ForEach-Object { [string]$_ }) -join "`n"',
    "$addRc = $LASTEXITCODE",
    "$ErrorActionPreference = 'Stop'",
    'if ($addRc -ge 2) { throw ("git add fatal (exit " + $addRc + "): " + $addLog) }',
    `foreach ($m in [regex]::Matches($addLog, "unable to (?:index file|add) '([^']+)'") ) { Write-Output ('SNAP_SKIP ' + $m.Groups[1].Value) }`,
    dropGitlinksBlock(),
    // 兜底：旧 git 走裸 add 时大文件仍会被重新索引，这里按清单再清一次；
    // pathspec 生效时它是空操作（清单条目本就不在 index）
    oversizeRemoveBlock(),
    oversizeCleanupBlock(),
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
    // issue #29：与 snapshotScript 同形——大文件不进 add（否则 preview 一次
    // 也要为它们写对象），清单随 add 后的兜底剔除一起收口
    oversizeListBlock(store.maxFileBytes),
    oversizeAddPrepBlock(),
    // fail-open add：语义同 snapshotScript（--ignore-errors 跳过无法索引的
    // 路径、≥2 显式 throw 防「旧索引假成功」）；此处不提取 SNAP_SKIP——
    // 被跳过的路径不进索引，diff 天然不显示、rollback 的删除清单来自当前
    // 索引也天然不会误删它们
    "& $git --git-dir=$g --work-tree=$root add -A --ignore-errors @paArgs",
    'if ($LASTEXITCODE -ge 2) { throw ("git add fatal (exit " + $LASTEXITCODE + ")") }',
    dropGitlinksBlock(),
    oversizeRemoveBlock(),
    oversizeCleanupBlock(),
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
    "$nMod = 0; $nRes = 0; $nAdd = 0",
    "foreach ($k in $curMap.Keys) {",
    '  if (-not $targetMap.ContainsKey($k)) { $result += [pscustomobject]@{ rel = $k; kind = "added" }; $nAdd++ }',
    '  elseif ($targetMap[$k] -ne $curMap[$k]) { $result += [pscustomobject]@{ rel = $k; kind = "modified" }; $nMod++ }',
    "}",
    "foreach ($k in $targetMap.Keys) {",
    '  if (-not $curMap.ContainsKey($k)) { $result += [pscustomobject]@{ rel = $k; kind = "restored" }; $nRes++ }',
    "}",
    "$sorted = @($result | Sort-Object rel)",
    // 分类计数必须在截断前出：面板摘要若按前 N 条统计，大变更时「修改 448」
    // 会与总数 3054 并列展示，读起来像清单丢了条目（实测事故形态）
    "Write-Output ('COUNTS ' + $nMod + ' ' + $nRes + ' ' + $nAdd)",
    "Write-Output ('TOTAL ' + $sorted.Count)",
    "Write-Output (ConvertTo-Json -InputObject @($sorted | Select-Object -First " + take + ") -Depth 3 -Compress)",
    "$tree = (& $git --git-dir=$g --work-tree=$root write-tree).Trim()",
    "Write-Output ('TREE ' + $tree)"
  ].join("\n");
}
function expandZipBlock() {
  return [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "function Expand-ZipTo {",
    "  $now = [DateTime]::UtcNow",
    "  $made = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)",
    "  $za = [System.IO.Compression.ZipFile]::Open($zip, 'Read', [System.Text.Encoding]::UTF8)",
    "  try {",
    "    foreach ($e in $za.Entries) {",
    "      $t = $lpRoot + '\\' + ($e.FullName -replace '/','\\')",
    "      if ($e.Name) {",
    "        $d = $t.Substring(0, $t.LastIndexOf('\\'))",
    "        if ($d -and $made.Add($d)) { [System.IO.Directory]::CreateDirectory($d) | Out-Null }",
    "        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $t, $true)",
    "        [System.IO.File]::SetLastWriteTimeUtc($t, $now)",
    "      }",
    "    }",
    "  } finally { $za.Dispose() }",
    "}"
  ].join("\n");
}
function rollbackScript(root, store, gitExe, tag, base) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$git = " + psq(gitExe),
    "$g = " + psq(store.git),
    "$root = " + psq(root),
    // PS5.1 的 .NET Framework 不认清单级长路径；\\?\ 前缀绕过 MAX_PATH 且不再
    // 规范化路径，必须先把 / 归一为 \，UNC 再改写为 \\?\UNC\。解压与删除共用。
    "$lpRoot = $root.Replace('/','\\')",
    String.raw`$lpRoot = if ($lpRoot.StartsWith('\\?\')) { $lpRoot } elseif ($lpRoot.StartsWith('\\')) { '\\?\UNC\' + $lpRoot.Substring(2) } else { '\\?\' + $lpRoot }`,
    "$lpRoot = $lpRoot.TrimEnd('\\')",
    dropGitlinksBlock(),
    excludeSyncBlock(store.excludeFile, base),
    // issue #29：同 snapshotScript（回退前的当前清单同样不该为大文件写对象）
    oversizeListBlock(store.maxFileBytes),
    oversizeAddPrepBlock(),
    // fail-open add：语义同 snapshotScript 同款注释（diff/rollback 复用）
    "& $git --git-dir=$g --work-tree=$root add -A --ignore-errors @paArgs",
    'if ($LASTEXITCODE -ge 2) { throw ("git add fatal (exit " + $LASTEXITCODE + ")") }',
    dropGitlinksBlock(),
    oversizeRemoveBlock(),
    oversizeCleanupBlock(),
    // 同 diffScript：-z 的 NUL 输出会被 PowerShell 捕获丢弃，改为逐行 + quotePath=false
    "$curOut = & $git -c core.quotePath=false --git-dir=$g --work-tree=$root ls-files --stage",
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
    // 恢复集 = 目标有、当前无或 sha 不同（与 diffScript 的 modified+restored 同集合）
    "$restoreRel = [System.Collections.Generic.List[string]]::new()",
    "foreach ($k in $targetMap.Keys) {",
    "  if (-not $curMap.ContainsKey($k) -or $curMap[$k] -ne $targetMap[$k]) { $restoreRel.Add($k) }",
    "}",
    "$restored = $restoreRel.Count",
    "if ($restored -gt 0) {",
    "  $zip = " + psq(store.dir + "\\restore-tmp.zip"),
    expandZipBlock(),
    "  if ($restoreRel.Count * 2 -ge $targetMap.Count) {",
    "    & $git --git-dir=$g archive --format=zip --output=$zip " + psq(tag),
    "    if ($LASTEXITCODE -ne 0) { throw ('git archive failed (exit ' + $LASTEXITCODE + ')') }",
    "    Expand-ZipTo",
    "    Remove-Item -LiteralPath $zip -Force",
    "  } else {",
    "    for ($i = 0; $i -lt $restoreRel.Count; $i += 100) {",
    "      $batch = $restoreRel.GetRange($i, [Math]::Min(100, $restoreRel.Count - $i))",
    "      & $git --literal-pathspecs --git-dir=$g archive --format=zip --output=$zip " + psq(tag) + " -- $batch",
    "      if ($LASTEXITCODE -ne 0) { throw ('git archive failed (exit ' + $LASTEXITCODE + ')') }",
    "      Expand-ZipTo",
    "      Remove-Item -LiteralPath $zip -Force",
    "    }",
    "  }",
    "}",
    // 删除失败语义与 POSIX 版对齐（F-G2）：本侧 EAP=Stop 下 File.Delete 失败
    // 直接抛终止错误、pwsh 以非零码退出；POSIX 侧 rm 在 set -e 的 if
    // 条件里失败不会自动终止，须显式 exit 1（见 scripts.posix.js rollbackScript）。
    // 任何一侧半回退都不许报 ROLLBACK_OK——假成功会让救援永不触发（H1）。
    "$deleted = 0",
    "foreach ($r in @($curOut)) {",
    "  if (-not $r) { continue }",
    '  $tab = $r.IndexOf("`t"); $path = $r.Substring($tab + 1)',
    "  if (-not $targetMap.ContainsKey($path)) {",
    "    $full = $lpRoot + '\\' + ($path.Replace('/','\\'))",
    "    if ([System.IO.File]::Exists($full)) {",
    "      $attrs = [System.IO.File]::GetAttributes($full)",
    "      if (($attrs -band [System.IO.FileAttributes]::ReadOnly) -ne 0) { [System.IO.File]::SetAttributes($full, [System.IO.FileAttributes]::Normal) }",
    "      [System.IO.File]::Delete($full); $deleted++",
    '    } elseif ([System.IO.Directory]::Exists($full)) { throw ("cannot remove directory at tracked file path: " + $path) }',
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
    "$gcRefs = & $git --git-dir=$g for-each-ref --count=1 refs",
    "$gcFiles = & $git --git-dir=$g ls-files",
    "if (-not $gcRefs -and $gcFiles) { & $git --git-dir=$g read-tree --empty }",
    "& $git --git-dir=$g gc --quiet --prune=now",
    'if ($LASTEXITCODE -ne 0) { throw ("git gc failed (exit " + $LASTEXITCODE + ")") }',
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
function fileReadCmd(file) {
  return "if (Test-Path -LiteralPath " + psq(file) + ") { Get-Content -LiteralPath " + psq(file) + " -Raw -Encoding UTF8 -ErrorAction SilentlyContinue }";
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
    // STATE 供空仓回收判定（present/absent/quarantined/foreign）：判据留在脚本侧
    // 是因为只有这里能看文件系统——absent 是「从没拍过快照的真仓」，foreign 是
    // 别人的目录，两者必须分开（否则会删掉不是我们的东西）。
    "  $ix = Join-Path $d 'index.json'",
    "  if (Test-Path -LiteralPath $ix -PathType Leaf) { Write-Output 'STATE present' }",
    "  elseif (@(Get-ChildItem -LiteralPath $d -Filter 'index.json.corrupt-*' -ErrorAction SilentlyContinue).Count -gt 0) { Write-Output 'STATE quarantined' }",
    "  elseif ((Test-Path -LiteralPath (Join-Path $d 'git') -PathType Container) -or (Test-Path -LiteralPath (Join-Path $d 'root.txt') -PathType Leaf)) { Write-Output 'STATE absent' }",
    "  else { Write-Output 'STATE foreign' }",
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
  fileReadCmd,
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
