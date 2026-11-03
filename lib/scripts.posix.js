function psq(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}
const UTF8_PRELUDE = "export LC_ALL=C";
const MAX_FILE_BYTES = 8388608;
const STALE_LOCK_MIN = 5;
const HEARTBEAT_TTL_S = 900;
const FIDELITY_ATTRS = "* -text -filter -ident -export-ignore -export-subst -working-tree-encoding";
function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}
function dropGitlinksBlock() {
  return [
    `"$git" --git-dir="$g" ls-files -z --stage | while IFS= read -r -d '' e; do`,
    '  case "$e" in',
    // --work-tree 不可省：影子仓库是 bare 仓库，裸 --git-dir 下 update-index 会
    // fatal "this operation must be run in a work tree"，set -e 直接终止整条快照
    `    160000\\ *) p=\${e#*$'\\t'}; "$git" --literal-pathspecs --git-dir="$g" --work-tree="$root" update-index --force-remove -- "$p" ;;`,
    "  esac",
    "done"
  ].join("\n");
}
function dirPruneArgsBlock() {
  return [
    "oversize_args=()",
    'while IFS= read -r line || [ -n "$line" ]; do',
    "  t=${line%$'\\r'}",
    '  t="${t#"${t%%[![:space:]]*}"}"; t="${t%"${t##*[![:space:]]}"}"',
    '  if [ -z "$t" ]; then continue; fi',
    '  case "$t" in \\#* | \\!*) continue ;; esac',
    '  t="${t%/}"',
    '  case "$t" in *\\** | *\\?* | *\\[* | */*) continue ;; esac',
    '  if [ ${#oversize_args[@]} -eq 0 ]; then oversize_args+=(-name "$t"); else oversize_args+=(-o -name "$t"); fi',
    'done <<< "$new_exc"',
    "oversize_prune=()",
    "if [ ${#oversize_args[@]} -gt 0 ]; then oversize_prune=('(' -type d '(' \"${oversize_args[@]}\" ')' ')' -prune -o); fi"
  ].join("\n");
}
function oversizeRemoveBlock() {
  return 'xargs -0 "$git" --literal-pathspecs --git-dir="$g" --work-tree="$root" update-index --force-remove -- < "$oversize_r" 2>/dev/null || true';
}
function oversizeListBlock(maxBytes) {
  return [
    dirPruneArgsBlock(),
    'oversize_p="$g/oversize-pathspec.$$"',
    'oversize_r="$g/oversize-rel.$$"',
    ': > "$oversize_p"',
    ': > "$oversize_r"',
    'find "$root" "${oversize_prune[@]}" -type f -size +' + String(maxBytes || MAX_FILE_BYTES) + "c -print0 2>/dev/null | while IFS= read -r -d '' f; do",
    '  oversize_rel="${f#"$root"/}"',
    `  printf '%s\\0' ":(top,exclude,literal)$oversize_rel" >> "$oversize_p"`,
    `  printf '%s\\0' "$oversize_rel" >> "$oversize_r"`,
    "done",
    oversizeRemoveBlock()
  ].join("\n");
}
function oversizeAddPrepBlock() {
  return [
    "pa_args=()",
    'if [ -s "$oversize_p" ]; then',
    `  if [ -f "$g/pathspec-from-file.ok" ] || "$git" add -h 2>&1 | grep -q -- '--pathspec-from-file'; then`,
    `    printf '1\\n' > "$g/pathspec-from-file.ok" 2>/dev/null || true`,
    '    pa_args=(--pathspec-from-file="$oversize_p" --pathspec-file-nul)',
    "  fi",
    "fi",
    'cd "$root"'
  ].join("\n");
}
function limitScanBlock(maxBytes, fileMaxBytes, budgetMs) {
  const limit = maxBytes > 0 ? String(maxBytes) : "0";
  const fileLimit = String(fileMaxBytes || MAX_FILE_BYTES);
  const budgetS = budgetMs > 0 ? String(Math.ceil(budgetMs / 1e3)) : "0";
  return [
    "limit_start=$(date +%s)",
    'limit_tmp="$g/limit-scan.$$"',
    'limit_err="$g/limit-scan-err.$$"',
    // set -e：条件位置豁免，失败由 else 分支显式处理（不许穿透到 add）
    'if "$git" -c core.quotePath=false --git-dir="$g" --work-tree="$root" ls-files -z -co --exclude-standard > "$limit_tmp" 2> "$limit_err"; then',
    "  :",
    "else",
    "  limit_rc=$?",
    // 压平成单行才能随哨兵回传；截 300 字符防一条巨长 stderr 撑爆错误环
    '  limit_msg=$(head -c 300 "$limit_err" 2>/dev/null | tr "\\n\\r" "  ")',
    '  rm -f "$limit_tmp" "$limit_err"',
    `  printf 'SNAP_SCAN_FAIL %s\\n' "$limit_rc"`,
    `  printf 'SNAP_SCAN_ERR %s\\n' "$limit_msg"`,
    "  exit 0",
    "fi",
    'rm -f "$limit_err"',
    'limit_sizes=""',
    'if [ -s "$limit_tmp" ]; then',
    // ls-files 输出相对 root 的路径，而脚本 cwd 是宿主工作目录：必须 cd 进去再 stat
    `  if find "$root" -maxdepth 0 -printf '' >/dev/null 2>&1; then`,
    `    limit_sizes=$(cd "$root" && xargs -0 stat -c '%s %F' -- < "$limit_tmp" 2>/dev/null || true)`,
    "  else",
    `    limit_sizes=$(cd "$root" && xargs -0 stat -f '%z %HT' -- < "$limit_tmp" 2>/dev/null || true)`,
    "  fi",
    "fi",
    'rm -f "$limit_tmp"',
    // 目录条目（嵌套仓库在 ls-files 里输出 `dir/`）不计入：add 侧同样不纳入它
    // 的内容（gitlink 被剔除 / 无提交时 unable to index）；越过单文件上限的也
    // 不计入——oversizeListBlock 随后会把它移出 index
    `limit_total=$(printf '%s\\n' "$limit_sizes" | awk -v lim=` + limit + " -v flim=" + fileLimit + ` '{ if (tolower($0) ~ /directory/) next; if ($1 <= flim) { s += $1; if (lim > 0 && s > lim) { print "OVER " s; exit } } } END { if (lim <= 0 || s <= lim) print s }')`,
    "limit_elapsed=$(( $(date +%s) - limit_start ))",
    'case "$limit_total" in',
    '  OVER\\ *) echo "SNAP_LIMIT bytes ${limit_total#OVER } ' + limit + '"; exit 0 ;;',
    "esac",
    "if [ " + budgetS + ' -gt 0 ] && [ "$limit_elapsed" -gt ' + budgetS + " ]; then",
    '  echo "SNAP_LIMIT time $((limit_elapsed * 1000)) $(( ' + budgetS + ' * 1000 ))"; exit 0',
    "fi"
  ].join("\n");
}
function excludeSyncBlock(excludeFile, base) {
  const baseList = Array.isArray(base) && base.length ? base : [".git", "node_modules/", ".dsh-recall-snapshots/", "dsh-recall-snapshots/"];
  const baseLines = baseList.join("\n") + "\n";
  return [
    "ex_file=" + psq(excludeFile),
    'exc="$g/info/exclude"',
    'user_pats=""',
    'if [ -f "$ex_file" ]; then',
    '  while IFS= read -r line || [ -n "$line" ]; do',
    "    t=${line%$'\\r'}",
    '    t="${t#"${t%%[![:space:]]*}"}"; t="${t%"${t##*[![:space:]]}"}"',
    '    if [ -z "$t" ]; then continue; fi',
    '    case "$t" in \\#*) continue ;; esac',
    '    user_pats="$user_pats$t\\n"',
    '  done < "$ex_file"',
    "fi",
    "new_exc=$(printf '\\n" + baseLines.replace(/\\/g, "\\\\").replace(/%/g, "%%") + `%b' "$user_pats")`,
    'old_exc=$(cat "$exc" 2>/dev/null || true)',
    'if [ "$new_exc" != "$old_exc" ]; then',
    `  printf '%s\\n' "$new_exc" > "$exc"`,
    // 影子仓库是 bare：写 index 必须显式 --work-tree，否则 update-index fatal
    // 并被 || true 吞成「排除对已跟踪条目从未生效」。ensureGitScript 也走本函数
    // 但没有 root（建仓不遍历工作区），那时退回原调用（命中通常为空，fail-open）
    '  if [ -n "${root:-}" ]; then',
    '    "$git" -c core.quotePath=false --literal-pathspecs --git-dir="$g" ls-files -i -c --exclude-from="$exc" -z 2>/dev/null | xargs -0 "$git" --literal-pathspecs --git-dir="$g" --work-tree="$root" update-index --force-remove -- 2>/dev/null || true',
    "  else",
    '    "$git" -c core.quotePath=false --literal-pathspecs --git-dir="$g" ls-files -i -c --exclude-from="$exc" -z 2>/dev/null | xargs -0 "$git" --literal-pathspecs --git-dir="$g" update-index --force-remove -- 2>/dev/null || true',
    "  fi",
    "fi"
  ].join("\n");
}
function heartbeatBlock() {
  return [
    'hbf="$(dirname "$(dirname "$g")")/heartbeat"',
    "printf '%s %s\\n' " + psq(String(process.pid)) + ' "$(date +%s)" > "$hbf" 2>/dev/null || true'
  ].join("\n");
}
function resolveGitScript() {
  return [
    "p=$(command -v git 2>/dev/null || true)",
    `[ -n "$p" ] && printf '%s\\n' "$p"`,
    "exit 0"
  ].join("\n");
}
function probeHomeScript() {
  return `printf '%s' "\${DSH_HOME:-}"`;
}
function mkdirScript(dir) {
  return "mkdir -p -- " + psq(dir);
}
function migrateScript(src, dst) {
  return [
    "set -e",
    "src=" + psq(src),
    "dst=" + psq(dst),
    'if [ -e "$src/git" ]; then mv -f "$src/git" "$dst/git"; fi',
    'if [ -e "$src/index.json" ]; then mv -f "$src/index.json" "$dst/index.json"; fi',
    'rm -rf -- "$src"',
    "echo MIGRATE_OK"
  ].join("\n");
}
function legacyHomeMigrateScript(homedir) {
  return [
    "old=" + psq(homedir + "/dsh-recall-snapshots"),
    "new=" + psq(homedir + "/.dsh/dsh-recall-snapshots"),
    'if [ -d "$old" ] && [ ! -d "$new" ]; then',
    '  if mkdir -p -- "$(dirname "$new")" && mv -f -- "$old" "$new"; then echo MIGRATE_OK',
    "  else echo MIGRATE_FAIL; fi",
    'elif [ -d "$old" ]; then echo BOTH_PRESENT',
    "else echo OLD_ABSENT; fi"
  ].join("\n");
}
function ensureGitScript(store, gitExe, base) {
  return [
    "set -e",
    "git=" + psq(gitExe),
    "repo=" + psq(store.repo),
    "g=" + psq(store.git),
    heartbeatBlock(),
    // 冷启动首消息快照与启动预热（或双实例）并发时，两个 git init 在空
    // repo 目录同跑，输家报 fatal: cannot mkdir <git>: File exists——窗口
    // 极小但首条消息的快照会因此丢失。git init 幂等：失败后 HEAD 已出现
    // 即同伴建成，视同成功继续；HEAD 也没有才是真失败，带错误退出（诊断
    // 不丢）。检查 HEAD 而非目录存在：半截目录也会被 init 补齐。pwsh 版
    // 无需同款改动——native 非零退出不抛（I14），输家继续跑 config 时
    // 同伴已建好 repo，竞态天然容忍，真失败由快照 add 的显式检查兜底。
    'if [ ! -f "$g/HEAD" ]; then',
    '  init_log=$("$git" init "$repo" 2>&1) || {',
    `    if [ ! -f "$g/HEAD" ]; then printf '%s\\n' "$init_log" >&2; exit 1; fi`,
    "  }",
    "fi",
    '"$git" --git-dir="$g" config core.longpaths true',
    '"$git" --git-dir="$g" config core.autocrlf false',
    '"$git" --git-dir="$g" config advice.addEmbeddedRepo false',
    // 属性固化（issue #12，内容见 FIDELITY_ATTRS）：info/ 由 git init 自带
    // （info/exclude 模板，excludeSyncBlock 同样依赖），无需建目录；每次
    // ensureGit 重写幂等，存量仓库升级后首次 init 自然补上。
    "printf " + psq(FIDELITY_ATTRS + "\n") + ' > "$g/info/attributes"',
    excludeSyncBlock(store.excludeFile, base),
    'stamp="$g/gc.stamp"',
    `if [ -f "$stamp" ]; then printf 'GIT_OK %s\\n' "$(head -n1 "$stamp" 2>/dev/null)"; else echo GIT_OK; fi`
  ].join("\n");
}
function attrsMigrateBlock() {
  return [
    'mig_stamp="$g/attrs-v1.stamp"',
    'if [ ! -f "$mig_stamp" ]; then',
    "  migrc=0",
    `  "$git" --git-dir="$g" --work-tree="$root" add --renormalize --ignore-errors -- ':(top)' >/dev/null 2>&1 || migrc=$?`,
    `  if [ "$migrc" -le 1 ]; then printf '1\\n' > "$mig_stamp" 2>/dev/null || true; fi`,
    "fi"
  ].join("\n");
}
function snapshotScript(root, store, gitExe, messageId, base) {
  return [
    "set -e",
    "git=" + psq(gitExe),
    "g=" + psq(store.git),
    "root=" + psq(root),
    heartbeatBlock(),
    dropGitlinksBlock(),
    excludeSyncBlock(store.excludeFile, base),
    // issue #24：总量/预算护栏先于 add——超限时连 add 都不跑
    limitScanBlock(store.maxWorkspaceBytes, store.maxFileBytes, store.scanBudgetMs),
    // issue #29：大文件清单先于 add——add 带 exclude 后不再为它们写对象
    oversizeListBlock(store.maxFileBytes),
    attrsMigrateBlock(),
    oversizeAddPrepBlock(),
    // fail-open add（issue #7 加固，语义见 pwsh 版同款注释）：--ignore-errors
    // 下「无法索引的路径」以退出码 1 结束但索引已落盘；≥2 才是真 fatal，
    // 显式退出让 runShell 抛错（set -e 对 add 非零本会终止，但 || rc=$?
    // 捕获后必须自检，否则 tolerated/fatal 无法区分）。stderr 合并进变量
    // 供 fatal 时带回诊断与 SNAP_SKIP 提取。
    "addrc=0",
    'add_log=$("$git" --git-dir="$g" --work-tree="$root" add -A --ignore-errors "${pa_args[@]}" 2>&1) || addrc=$?',
    `if [ "$addrc" -ge 2 ]; then printf '%s\\n' "$add_log" >&2; exit "$addrc"; fi`,
    `printf '%s\\n' "$add_log" | sed -n -e "s/^error: unable to index file '\\(.*\\)'$/\\1/p" -e "s/^error: unable to add '\\(.*\\)' to index$/\\1/p" | sort -u | while IFS= read -r sk; do`,
    // 循环体用 if/fi 而非 && 列表：&& 列表条件为假时整条管道退出码为 1，
    // set -e 会把脚本杀掉（if 语句天然豁免）
    `  if [ -n "$sk" ]; then printf 'SNAP_SKIP %s\\n' "$sk"; fi`,
    "done",
    dropGitlinksBlock(),
    // 兜底：旧 git 走裸 add 时大文件仍会被重新索引，这里按清单再清一次
    oversizeRemoveBlock(),
    'rm -f "$oversize_p" "$oversize_r"',
    'tree=$("$git" --git-dir="$g" --work-tree="$root" write-tree)',
    'commit=$("$git" --git-dir="$g" -c user.name=dsh-recall -c user.email=recall@dsh.local commit-tree "$tree" -m ' + psq("snapshot " + messageId) + ")",
    '"$git" --git-dir="$g" tag -f ' + psq("snap-" + messageId) + ' "$commit" >/dev/null',
    // PF-1：TREE 行随 SNAP_OK 回传 add -A 之后的 index 树指纹（语义见 pwsh 版
    // 同名注释）——execute 与 preview 指纹比对判 STALE，免整条重复 diff
    'echo "TREE $tree"',
    "echo SNAP_OK"
  ].join("\n");
}
function collectListsBlock(store, gitExe, root, tag, base) {
  return [
    "git=" + psq(gitExe),
    "g=" + psq(store.git),
    "root=" + psq(root),
    dropGitlinksBlock(),
    excludeSyncBlock(store.excludeFile, base),
    // issue #29：与 snapshotScript 同形——大文件不进 add（否则 preview 一次
    // 也要为它们写对象），清单随 add 后的兜底剔除一起收口
    oversizeListBlock(store.maxFileBytes),
    oversizeAddPrepBlock(),
    // fail-open add（语义见 snapshotScript 同款注释）：diff/rollback 的当前
    // 清单来自这次 add 后的索引——被跳过的路径不进清单，diff 不显示、
    // rollback 删除清单也不会误删它们；≥2 显式退出防「旧索引假成功」
    "addrc=0",
    '"$git" --git-dir="$g" --work-tree="$root" add -A --ignore-errors "${pa_args[@]}" || addrc=$?',
    '[ "$addrc" -le 1 ] || exit "$addrc"',
    dropGitlinksBlock(),
    oversizeRemoveBlock(),
    "tmpc=" + psq(store.dir + "/diff-cur.$$"),
    "tmpt=" + psq(store.dir + "/diff-tgt.$$"),
    `"$git" -c core.quotePath=false --git-dir="$g" --work-tree="$root" ls-files --stage | grep -v '^160000 ' > "$tmpc" || true`,
    '"$git" -c core.quotePath=false --git-dir="$g" ls-tree -r ' + psq(tag) + ` | grep -v '^160000 ' > "$tmpt" || true`
  ].join("\n");
}
function diffScript(root, store, gitExe, tag, base) {
  return [
    "set -e -o pipefail",
    collectListsBlock(store, gitExe, root, tag, base),
    `trap 'rm -f "$tmpc" "$tmpt" "$oversize_p" "$oversize_r"' EXIT`,
    "awk -F'\\t' -v OFS='\\t' '",
    "  FNR==1 { fidx++ }",
    '  fidx==1 { split($1, a, " "); cur[$2]=a[2]; next }',
    '  { split($1, a, " "); tgt[$2]=a[3] }',
    "  END {",
    "    for (p in cur) {",
    '      if (p in tgt) { if (tgt[p] != cur[p]) print "modified", p }',
    '      else print "added", p',
    "    }",
    '    for (p in tgt) if (!(p in cur)) print "restored", p',
    "  }",
    `' "$tmpc" "$tmpt" | sort -t$'\\t' -k2,2`,
    'tree=$("$git" --git-dir="$g" --work-tree="$root" write-tree)',
    'echo "TREE $tree"',
    "exit 0"
  ].join("\n");
}
function rollbackScript(root, store, gitExe, tag, base) {
  return [
    "set -e -o pipefail",
    collectListsBlock(store, gitExe, root, tag, base),
    "tmpr=" + psq(store.dir + "/diff-restore.$$"),
    `trap 'rm -f "$tmpc" "$tmpt" "$tmpr" "$oversize_p" "$oversize_r"' EXIT`,
    // 恢复集 = 目标有、当前无或 sha 不同（awk 结构与 diffScript 同款：
    // cur 侧 "mode sha stage<TAB>path" 取 a[2]，target 侧 "mode type sha<TAB>path" 取 a[3]）
    "awk -F'\\t' '",
    "  FNR==1 { fidx++ }",
    '  fidx==1 { split($1, a, " "); cur[$2]=a[2]; next }',
    '  { split($1, a, " "); tgt[$2]=a[3] }',
    "  END { for (p in tgt) if (!(p in cur) || cur[p] != tgt[p]) print p }",
    `' "$tmpc" "$tmpt" > "$tmpr"`,
    `restored=$(wc -l < "$tmpr" | tr -d ' ')`,
    `total=$(wc -l < "$tmpt" | tr -d ' ')`,
    'if [ "$restored" -gt 0 ]; then',
    '  if [ $((restored * 2)) -ge "$total" ]; then',
    // -m（--touch，两处 tar 调用同款）：解包不恢复归档成员的 mtime（文件
    // mtime = 解包时刻）。必须如此：tar 默认保留归档内 mtime，而快照→篡改→
    // 回滚常在数秒内完成，恢复出的 mtime 可能与 index 里旧条目的 stat 记录
    // 碰撞，下一次 add -A 的 stat 缓存误判「未变更」跳过 re-hash——工作区
    // 内容与快照从此脱钩（实测解包出篡改前内容的间歇性失败）。Windows 逐条
    // 解压也会显式 touch，两侧语义由各自的回退冒烟测试锁定。
    '    "$git" --git-dir="$g" archive ' + psq(tag) + ' | tar -x -m -C "$root"',
    "  else",
    "    batch=()",
    "    while IFS= read -r p; do",
    '      if [ -z "$p" ]; then continue; fi',
    '      batch+=("$p")',
    '      if [ "${#batch[@]}" -ge 100 ]; then',
    '        "$git" --literal-pathspecs --git-dir="$g" archive ' + psq(tag) + ' -- "${batch[@]}" | tar -x -m -C "$root"',
    "        batch=()",
    "      fi",
    '    done < "$tmpr"',
    '    if [ "${#batch[@]}" -gt 0 ]; then',
    '      "$git" --literal-pathspecs --git-dir="$g" archive ' + psq(tag) + ' -- "${batch[@]}" | tar -x -m -C "$root"',
    "    fi",
    "  fi",
    "fi",
    "tmpd=" + psq(store.dir + "/diff-del.$$"),
    `trap 'rm -f "$tmpc" "$tmpt" "$tmpr" "$tmpd" "$oversize_p" "$oversize_r"' EXIT`,
    "awk -F'\\t' '",
    "  FNR==1 { fidx++ }",
    "  fidx==1 { cur[$2]=1; next }",
    "  { tgt[$2]=1 }",
    "  END { for (p in cur) if (!(p in tgt)) print p }",
    `' "$tmpc" "$tmpt" > "$tmpd"`,
    "deleted=0",
    "while IFS= read -r p; do",
    // 循环体禁裸 && 链（AGENTS.md 已知坑同款规矩）：&& 列表条件为假时整条
    // 退出码为 1，set -e 会把脚本杀掉；if 语句天然豁免。rm 失败必须响亮
    // exit 1——半回退假成功会让救援永不触发（F-G2）
    '  if [ -z "$p" ]; then continue; fi',
    '  if rm -f -- "$root/$p"; then deleted=$((deleted + 1)); else echo "RM_FAILED $p" >&2; exit 1; fi',
    'done < "$tmpd"',
    'echo "ROLLBACK_OK $deleted $restored"'
  ].join("\n");
}
function rescueScript(root, store, gitExe, tag) {
  return [
    "set -e",
    "git=" + psq(gitExe),
    "g=" + psq(store.git),
    "root=" + psq(root),
    '"$git" --git-dir="$g" --work-tree="$root" reset --hard ' + psq(tag),
    "echo RESCUE_OK"
  ].join("\n");
}
function listTagsScript(store, gitExe) {
  return [
    "set -e",
    "git=" + psq(gitExe),
    "g=" + psq(store.git),
    // 仅创建过 store 目录、尚未产生过快照时没有 git/.git；把它视为
    // 空快照仓库而非错误，全部删除仍可顺便清空其陈旧 index.json。
    '[ -d "$g" ] || exit 0',
    `"$git" --git-dir="$g" tag -l 'snap-*'`
  ].join("\n");
}
function listTagsWithTimeScript(store, gitExe) {
  return [
    "set -e",
    "git=" + psq(gitExe),
    "g=" + psq(store.git),
    '[ -d "$g" ] || exit 0',
    `"$git" --git-dir="$g" for-each-ref --format='%(refname:short) %(creatordate:unix)' 'refs/tags/snap-*'`
  ].join("\n");
}
function gcScript(store, gitExe) {
  return [
    "set -e",
    "git=" + psq(gitExe),
    "g=" + psq(store.git),
    'if [ -z "$("$git" --git-dir="$g" for-each-ref --count=1 refs)" ] && [ -n "$("$git" --git-dir="$g" ls-files)" ]; then',
    '  "$git" --git-dir="$g" read-tree --empty',
    "fi",
    '"$git" --git-dir="$g" gc --quiet --prune=now',
    'date +%s > "$g/gc.stamp"',
    "echo GC_OK"
  ].join("\n");
}
function pruneScript(store, gitExe) {
  return [
    "set -e",
    "git=" + psq(gitExe),
    "g=" + psq(store.git),
    '"$git" --git-dir="$g" prune',
    "echo PRUNE_OK"
  ].join("\n");
}
function killOrphansScript(gitDir) {
  return [
    "# RECALL_CLEANUP",
    "g=" + psq(gitDir),
    'hbf="$(dirname "$(dirname "$g")")/heartbeat"',
    'if [ -f "$hbf" ]; then',
    `  hbl=$(head -n1 "$hbf" 2>/dev/null | tr -d '\\r')`,
    "  hbp=${hbl%% *}",
    "  hbt=${hbl#* }",
    `  case "$hbp" in ''|*[!0-9]*) hbp='' ;; esac`,
    `  case "$hbt" in ''|*[!0-9]*) hbt=0 ;; esac`,
    "  hbage=$(( $(date +%s) - hbt ))",
    '  if [ -n "$hbp" ] && [ "$hbp" != ' + psq(String(process.pid)) + ' ] && [ "$hbage" -ge 0 ] && [ "$hbage" -lt ' + HEARTBEAT_TTL_S + " ]; then",
    '    if kill -0 "$hbp" 2>/dev/null; then',
    '      echo "CLEANUP_OTHER_INSTANCE $hbp"',
    "      exit 0",
    "    fi",
    "  fi",
    "fi",
    `fresh=$(find "$g" -maxdepth 1 -type f \\( -name '*.lock' -o -name 'gc.pid' \\) -mmin -` + STALE_LOCK_MIN + ` 2>/dev/null; find "$g/refs" -type f -name '*.lock' -mmin -` + STALE_LOCK_MIN + " 2>/dev/null)",
    'if [ -n "$fresh" ]; then',
    "  echo CLEANUP_SKIPPED_FRESH_LOCK",
    "  exit 0",
    "fi",
    'marker="--git-dir=$g"',
    'for p in $(pgrep -f -- "$marker" 2>/dev/null); do',
    '  [ "$p" = "$$" ] && continue',
    '  kill "$p" 2>/dev/null || true',
    "done",
    // 锁清单对齐 pwsh 版：index.lock 是 add/checkout 持久锁，其余是
    // gc/tag/pack 链路残留；refs 下 per-ref 锁用 find 兜底（只删陈旧锁，
    // 新锁已被上方分级保护拦下）
    'rm -f "$g/index.lock" "$g/config.lock" "$g/HEAD.lock" "$g/gc.pid" "$g/packed-refs.lock" "$g/shallow.lock" 2>/dev/null || true',
    'find "$g/refs" -type f -name "*.lock" -mmin +' + STALE_LOCK_MIN + " -delete 2>/dev/null || true",
    "echo CLEANUP_DONE"
  ].join("\n");
}
function purgeTagsScript(store, gitExe, tags) {
  return [
    "git=" + psq(gitExe),
    "g=" + psq(store.git),
    '"$git" --git-dir="$g" tag -d ' + tags.map((t) => psq(t)).join(" ") + " >/dev/null 2>&1 || true",
    "echo PURGE_DONE"
  ].join("\n");
}
function renameFileCmd(src, dst) {
  return "mv -f -- " + psq(src) + " " + psq(dst);
}
function fileWriteStdinCmd(file) {
  return "cat > " + psq(file);
}
function indexReadCmd(dir) {
  return "cat " + psq(dir + "/index.json") + " 2>/dev/null || true";
}
function lineageReadCmd(dir) {
  return "cat " + psq(dir + "/lineage.json") + " 2>/dev/null || true";
}
function fileReadCmd(file) {
  return "cat " + psq(file) + " 2>/dev/null || true";
}
function legacyRmScript(path) {
  return "rm -rf -- " + psq(path);
}
function excludeReadCmd(file) {
  return "cat " + psq(file) + " 2>/dev/null || true";
}
function excludeDumpScript(files) {
  const lines = [];
  for (const f of files || []) {
    const q = psq(f);
    lines.push(
      "printf 'EXCLBEGIN %s\\n' " + q,
      "if [ -f " + q + " ]; then base64 " + q + " 2>/dev/null | tr -d '\\n'; fi",
      // issue #30 同族：tr -d '\n' 之后内容没有行尾，直接 echo 会把 EXCLEND 粘在
      // base64 尾上；payload 字节数为 3 的倍数（无 '=' padding）时这截尾巴会被一起
      // 解码成垃圾字节，回显到设置页再写回就污染 exclude.txt。
      'printf "\\n"',
      "echo 'EXCLEND'"
    );
  }
  return lines.join("\n");
}
function dirExistsScript(dir) {
  return "[ -d " + psq(dir) + " ] && echo YES || echo NO";
}
function countObjectsScript(store, gitExe) {
  return [
    "git=" + psq(gitExe),
    "g=" + psq(store.git),
    '"$git" --git-dir="$g" count-objects -v'
  ].join("\n");
}
function diskUsageScript(dir) {
  return "du -sk " + psq(dir) + " 2>/dev/null | awk '{print $1 * 1024}'";
}
function listSubdirsScript(dir) {
  return "find " + psq(dir) + " -maxdepth 1 -mindepth 1 -type d 2>/dev/null";
}
function storesDumpScript(container, extraDirs) {
  const lines = ["set -e", "dirs=()"];
  if (container) {
    lines.push("base=" + psq(container));
    lines.push('if [ -d "$base" ]; then');
    lines.push('  for d in "$base"/*/; do');
    lines.push('    if [ -d "$d" ]; then dirs+=("${d%/}"); fi');
    lines.push("  done");
    lines.push("fi");
  }
  for (const d of extraDirs || []) lines.push("dirs+=(" + psq(d) + ")");
  lines.push(
    'for d in "${dirs[@]}"; do',
    '  [ -d "$d" ] || continue',
    '  echo "==DIR $d"',
    // STATE 供空仓回收判定（present/absent/quarantined/foreign）：判据留在
    // 脚本侧是因为只有这里能看文件系统——absent 表示「从没拍过快照的真仓」
    // （git/ 或 root.txt 在），foreign 表示不是我们的目录，两者不能混。
    '  if [ -f "$d/index.json" ]; then',
    "    echo 'STATE present'",
    '  elif ls "$d"/index.json.corrupt-* >/dev/null 2>&1; then',
    "    echo 'STATE quarantined'",
    '  elif [ -d "$d/git" ] || [ -f "$d/root.txt" ]; then',
    "    echo 'STATE absent'",
    "  else",
    "    echo 'STATE foreign'",
    "  fi",
    '  if [ -f "$d/root.txt" ]; then',
    `    printf "ROOT %s\\n" "$(cat "$d/root.txt" 2>/dev/null | tr -d '\\r\\n')"`,
    "  else",
    '    echo "ROOT "',
    "  fi",
    "  echo INDEXBEGIN",
    // issue #30：这两个 json 是可选文件（刚建仓没拍过快照就没有），缺席必须放行——
    // set -e 下裸 cat 会把「无文件」升级成整条 dump 失败。另外落盘内容无尾换行
    // （writeTextViaShell = cat > file），cat 后紧接 echo 会把段尾标记粘到内容行尾，
    // JS 侧按整行匹配 INDEXEND 就永远收不到段尾，所以内容后显式补一个换行。
    '  cat "$d/index.json" 2>/dev/null || true',
    '  printf "\\n"',
    "  echo INDEXEND",
    "  echo LINEAGEBEGIN",
    '  cat "$d/lineage.json" 2>/dev/null || true',
    '  printf "\\n"',
    "  echo LINEAGEEND",
    "done",
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
  indexReadCmd,
  killOrphansScript,
  legacyHomeMigrateScript,
  legacyRmScript,
  lineageReadCmd,
  listSubdirsScript,
  listTagsScript,
  listTagsWithTimeScript,
  migrateScript,
  mkdirScript,
  probeHomeScript,
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
