/**
 * dsh-recall-plugin — bash 脚本模板（纯函数，无 ctx 依赖，POSIX 平台专用）
 *
 * 职责：Linux/macOS 下所有 shell 命令的 bash 脚本文本。与 scripts.pwsh.js
 * 导出同名接口，由 store.js 按 process.platform 选择。
 *
 * 硬约束（写每一段前先过一遍）：
 * - macOS 系统 bash 是 3.2：禁用 declare -A / mapfile / ${var,,} 等 bash 4
 *   特性；关联数组需求全部下沉给 awk（POSIX awk 自带），排序交给 sort。
 * - 与 PowerShell 版不同，bash 按行解析时不存在「NUL 丢弃」问题，ls-files
 *   可以用 -z——但 diff/回退的清单对比仍走临时文件 + awk（bash 3.2 无映射
 *   结构），行内路径含 TAB/换行的极端情形与 Windows 版同为已知限制。
 * - 文件名比较、哈希输入全部按字节处理（LC_ALL=C，见 POSIX_PRELUDE），
 *   与 Node 侧 UTF-8 解码各司其职：bash 不转码，字节原样通过。
 */

// 单引号字面量转义：bash 单引号串里不能出现单引号，标准手法是
// 关闭引号 + \' 转义 + 重开（'…'\''…'），杜绝变量展开与注入。
export function psq(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'"
}

// POSIX 统一前导：LC_ALL=C 让 sort/awk 的路径排序按字节确定序（跨机器
// 一致），也避免部分环境 locale 缺失时 git/perl 打 warning。bash 本身
// 不转码 stdout，中文字节原样传给 Node 按 UTF-8 解码，无 Windows 侧
// 的代码页问题。
export const UTF8_PRELUDE = 'export LC_ALL=C'

// 超大文件跳过阈值（字节），默认值与 config.js 的 maxFileBytes 一致；
// 实际生效值以 store.maxFileBytes（用户 config 可调）经 oversizeBlock 注入为准
export const MAX_FILE_BYTES = 104857600

// 失败清扫的 stale 锁阈值（分钟，M3）：锁文件 mtime 超过该值才视为残留可清；
// 更新的锁视为「有 git 操作正在进行」让路。本插件单条快照/回退的超时是
// 10 分钟，阈值取其一半，保证本方超时遗留的锁（≥10 分钟）一定能被清。
// 与 pwsh 版必须同值（scripts-contract 钉）；属内部安全策略常量，与
// snapshots.js 的 FUSE_AFTER 同类，不走 Config。
export const STALE_LOCK_MIN = 5

// 心跳文件有效窗口（秒，M3）：超过该时长的心跳视为失效实例（崩溃/重启
// 遗留或长期空闲），不再阻止清扫。心跳随 ensureGit/快照刷新，活动中的
// 实例窗口内必然有新心跳；长 git 操作（≤10 分钟）期间心跳写于操作开头，
// 仍在窗口内。
export const HEARTBEAT_TTL_S = 900

// 影子仓库 info/attributes 固化内容（issue #12 字节保真）：与 pwsh 版同名
// 常量逐字同值（scripts-contract 钉），完整语义与逐项动机见 scripts.pwsh.js
// 同名常量注释。一句话：git archive/add 都会应用快照树里项目自己的
// .gitattributes（text=auto + 缺省 core.eol=native 的转换，仓库级
// autocrlf=false 挡不住），info/attributes 优先级最高、对全部路径一票否决，
// 快照 capture/restore 两侧逐字节保真。
export const FIDELITY_ATTRS = '* -text -filter -ident -export-ignore -export-subst -working-tree-encoding'

// bash/cat 输出无 BOM；保留同名导出维持两套模板接口一致（幂等无害）
export function stripBom(text) {
  return text.replace(/^\uFEFF/, '')
}

// 嵌套 git 仓库（工作区里的子项目自带 .git）会被 add -A 记成 gitlink
// （160000）；gitlink 残留在 index 时 add -A 会 fatal，且对文件回退毫无
// 意义——所以 add 前后各清一次，子仓库内容不进快照。
// 依赖外层脚本已定义的 $git/$g；被 snapshot/diff/rollback 三处复用。
function dropGitlinksBlock() {
  return [
    '"$git" --git-dir="$g" ls-files -z --stage | while IFS= read -r -d \'\' e; do',
    '  case "$e" in',
    "    160000\\ *) p=${e#*$'\\t'}; \"$git\" --literal-pathspecs --git-dir=\"$g\" update-index --force-remove -- \"$p\" ;;",
    '  esac',
    'done'
  ].join('\n')
}

// 剔除超大文件：find -print0 + read -d '' 按字节安全遍历（文件名含换行
// 也不怕）；2>/dev/null 容忍个别不可访问子目录（杀软锁定、异常 ACL），
// 漏看个别文件是 fail-open，可接受——与 pwsh 版同策略。
// 阈值按调用注入（store.maxFileBytes，config 可调），不读模块常量。
// 依赖外层已定义的 $git/$g/$root。
// PF-9 合批：find 命中经管道剥前缀后 xargs -0 多路径合参——xargs 自适应
// 批次（规避 ARG_MAX）等价 win32 侧显式 100 条/批；-0 保证路径不分裂；
// xargs 失败/空输入 || true 兜住（fail-open 语义与逐条版一致，残留条目
// 不进 index 的代价由下次快照幂等重试）。
function oversizeBlock(maxBytes) {
  return [
    'find "$root" -type f -size +' + String(maxBytes || MAX_FILE_BYTES) + 'c -print0 2>/dev/null | while IFS= read -r -d \'\' f; do',
    '  printf \'%s\\0\' "${f#"$root"/}"',
    "done | xargs -0 \"$git\" --literal-pathspecs --git-dir=\"$g\" update-index --force-remove -- 2>/dev/null || true",
  ].join('\n')
}

// 用户自定义排除同步：基础排除表 + 用户 exclude.txt 合并重写 info/exclude，
// 再用 ls-files -i -c --exclude-from 找出「已被跟踪但命中排除」的条目清掉。
// 与 pwsh 版同语义：只用 --exclude-from，不引入项目 .gitignore（--exclude-standard）
// 的语义；放在 add -A 之前让排除先生效。read 循环里做 trim + 注释过滤，
// 兼容 Windows 上编辑带 CRLF 的 exclude.txt。
// base 基础排除表按调用注入（config.baseExcludes 可调），不硬编码。
// 依赖外层已定义的 $git/$g。
// - PF-9 条件化：新旧内容比对（命令替换对两侧同样剥尾随换行，比对稳定）
//   相同则跳过重写**并跳过**清理循环（每条消息常态省 1 次 git 子进程 +
//   1 次盘写）；语义安全论证见 pwsh 版同注释（exclude 未变时 index 已净，
//   add -A 因排除先生效不会加回；「改排除即时生效」承诺不变）。
// - PF-9 合批：ls-files -z 命中经 xargs -0 多路径合参——xargs 自适应批次
//   本就是为规避 ARG_MAX 设计（等价 win32 侧显式 100 条/批的分块纪律），
//   -0 保证空格/中文路径不分裂；空输入时 GNU xargs 空跑一次 update-index
//   （usage 退出，2>/dev/null + || true 兜住，BSD xargs 空输入不执行）。
function excludeSyncBlock(excludeFile, base) {
  // 兜底含两种存储目录名：降级为 .dsh-recall-snapshots/，home 存储为
  // dsh-recall-snapshots/（root=HOME 时落入工作区，漏排除会自吞，issue #6）
  const baseList = Array.isArray(base) && base.length ? base : ['.git', 'node_modules/', '.dsh-recall-snapshots/', 'dsh-recall-snapshots/']
  const baseLines = baseList.join('\n') + '\n'
  return [
    'ex_file=' + psq(excludeFile),
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
    'fi',
    "new_exc=$(printf '\\n" + baseLines.replace(/\\/g, '\\\\').replace(/%/g, '%%') + "%b' \"$user_pats\")",
    'old_exc=$(cat "$exc" 2>/dev/null || true)',
    'if [ "$new_exc" != "$old_exc" ]; then',
    "  printf '%s\\n' \"$new_exc\" > \"$exc\"",
    '  "$git" -c core.quotePath=false --literal-pathspecs --git-dir="$g" ls-files -i -c --exclude-from="$exc" -z 2>/dev/null | xargs -0 "$git" --literal-pathspecs --git-dir="$g" update-index --force-remove -- 2>/dev/null || true',
    'fi',
  ].join('\n')
}

// 心跳写入（M3）：随 git 操作顺手把「宿主 PID + epoch 秒」写进 store 目录
// （store.dir = git-dir 上两级），供对方实例的失败清扫判定「另一个 DSH 实例
// 正在使用此快照库」。PID 在模板生成期取宿主进程的 process.pid，无需调用方
// 传参。fail-open（|| true，set -e 下安全）：心跳写失败绝不能连累快照本身
// ——最坏退化为无心跳，清扫只剩新锁分级保护。
// 依赖外层已定义的 $g；被 ensureGitScript / snapshotScript 复用。
function heartbeatBlock() {
  return [
    'hbf="$(dirname "$(dirname "$g")")/heartbeat"',
    'printf \'%s %s\\n\' ' + psq(String(process.pid)) + ' "$(date +%s)" > "$hbf" 2>/dev/null || true'
  ].join('\n')
}

// 解析 git 可执行文件路径：bash 从 PATH 找（POSIX 上 git 装了就在 PATH，
// 没有 Windows 那种四类安装位置的散装问题）
export function resolveGitScript() {
  return [
    'p=$(command -v git 2>/dev/null || true)',
    '[ -n "$p" ] && printf \'%s\\n\' "$p"',
    'exit 0'
  ].join('\n')
}

// 探测 bash 侧的 home 基底：只回显 bash env 里的 $DSH_HOME（可能为空）。
// 为什么不在这里回退 $HOME：DSH 的 bash 执行器会洗刷子进程的 DSH_* 变量
// （dsh-subprocess scrubbedParentEnv），用户导出的 DSH_HOME 在 bash 里
// 通常不可见——若在此回退 $HOME，Node 侧的字面量回退永远轮不到，
// 「DSH_HOME 指到哪、快照就存哪」会失效。优先级与 pwsh 版对齐：
// bash env 显式值 > Node 主进程 DSH_HOME > $HOME（os.homedir）。
export function probeHomeScript() {
  return 'printf \'%s\' "${DSH_HOME:-}"'
}

export function mkdirScript(dir) {
  return 'mkdir -p -- ' + psq(dir)
}

// 旧版迁移：把降级时代落在项目内的影子仓库整体搬回 home 并删源目录
export function migrateScript(src, dst) {
  return [
    'set -e',
    'src=' + psq(src),
    'dst=' + psq(dst),
    'if [ -e "$src/git" ]; then mv -f "$src/git" "$dst/git"; fi',
    'if [ -e "$src/index.json" ]; then mv -f "$src/index.json" "$dst/index.json"; fi',
    'rm -rf -- "$src"',
    'echo MIGRATE_OK'
  ].join('\n')
}

// 旧快照容器一次性迁移（POSIX 专属，I24 漂移修复的存量数据兜底，输出四态
// 由 store.js resolvePosixHomeBase 消费）：仅当「旧容器存在且新容器不存在」
// 才整容器 mv——同卷（home 内部）rename 原子，无部分移动状态；容器级整移
// 自然带上根级 exclude.txt，语义无损。BOTH_PRESENT（双容器并存）/MIGRATE_FAIL
// 输出后不动任何数据。无 set -e（要靠分支输出状态而非中途退出）；if 条件
// 内的 && 链豁免 I16 约束（该坑只针对循环体与裸列表）。非 git 命令，不适用
// g= 赋值 / RECALL_CLEANUP 哨兵约定。
export function legacyHomeMigrateScript(homedir) {
  return [
    'old=' + psq(homedir + '/dsh-recall-snapshots'),
    'new=' + psq(homedir + '/.dsh/dsh-recall-snapshots'),
    'if [ -d "$old" ] && [ ! -d "$new" ]; then',
    '  if mkdir -p -- "$(dirname "$new")" && mv -f -- "$old" "$new"; then echo MIGRATE_OK',
    '  else echo MIGRATE_FAIL; fi',
    'elif [ -d "$old" ]; then echo BOTH_PRESENT',
    'else echo OLD_ABSENT; fi'
  ].join('\n')
}

// 建立影子仓库 + 排除同步 + 回读 gc.stamp（语义与 pwsh 版一致，
// 见 scripts.pwsh.js 同名函数注释）
export function ensureGitScript(store, gitExe, base) {
  return [
    'set -e',
    'git=' + psq(gitExe),
    'repo=' + psq(store.repo),
    'g=' + psq(store.git),
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
    '    if [ ! -f "$g/HEAD" ]; then printf \'%s\\n\' "$init_log" >&2; exit 1; fi',
    '  }',
    'fi',
    '"$git" --git-dir="$g" config core.longpaths true',
    '"$git" --git-dir="$g" config core.autocrlf false',
    '"$git" --git-dir="$g" config advice.addEmbeddedRepo false',
    // 属性固化（issue #12，内容见 FIDELITY_ATTRS）：info/ 由 git init 自带
    // （info/exclude 模板，excludeSyncBlock 同样依赖），无需建目录；每次
    // ensureGit 重写幂等，存量仓库升级后首次 init 自然补上。
    'printf ' + psq(FIDELITY_ATTRS + '\n') + ' > "$g/info/attributes"',
    excludeSyncBlock(store.excludeFile, base),
    'stamp="$g/gc.stamp"',
    'if [ -f "$stamp" ]; then printf \'GIT_OK %s\\n\' "$(head -n1 "$stamp" 2>/dev/null)"; else echo GIT_OK; fi'
  ].join('\n')
}

// 存量归一化迁移（issue #12，语义与动机详见 pwsh 版 attrsMigrateBlock 注释）：
// 属性固化后旧索引条目仍指向归一化 blob（stat 缓存时序依赖地跳过重哈希），
// --renormalize 按当前属性重哈希一次；无 pathspec 是空操作，必须带 ':(top)'
// 顶层魔法 pathspec。标记文件每仓库至多跑一次；失败（老 git 无该选项等）
// 只跳过标记下条消息重试，不连累快照主流程（set -e 下 || rc=$? 捕获）。
// 依赖外层已定义的 $git/$g/$root；仅 snapshotScript 使用。
function attrsMigrateBlock() {
  return [
    'mig_stamp="$g/attrs-v1.stamp"',
    'if [ ! -f "$mig_stamp" ]; then',
    '  migrc=0',
    '  "$git" --git-dir="$g" --work-tree="$root" add --renormalize --ignore-errors -- \':(top)\' >/dev/null 2>&1 || migrc=$?',
    '  if [ "$migrc" -le 1 ]; then printf \'1\\n\' > "$mig_stamp" 2>/dev/null || true; fi',
    'fi',
  ].join('\n')
}

// 快照：add -A → write-tree → commit-tree（孤儿提交）→ tag（语义同 pwsh 版）。
// tag -f：事件重放/重发会产生重复 messageId，裸 tag 对已存在 tag fatal
// 导致整条快照失败；-f 把 tag 指到最新提交，语义为「同一条消息取最新状态」。
export function snapshotScript(root, store, gitExe, messageId, base) {
  return [
    'set -e',
    'git=' + psq(gitExe),
    'g=' + psq(store.git),
    'root=' + psq(root),
    heartbeatBlock(),
    dropGitlinksBlock(),
    excludeSyncBlock(store.excludeFile, base),
    attrsMigrateBlock(),
    // fail-open add（issue #7 加固，语义见 pwsh 版同款注释）：--ignore-errors
    // 下「无法索引的路径」以退出码 1 结束但索引已落盘；≥2 才是真 fatal，
    // 显式退出让 runShell 抛错（set -e 对 add 非零本会终止，但 || rc=$?
    // 捕获后必须自检，否则 tolerated/fatal 无法区分）。stderr 合并进变量
    // 供 fatal 时带回诊断与 SNAP_SKIP 提取。
    'addrc=0',
    'add_log=$("$git" --git-dir="$g" --work-tree="$root" add -A --ignore-errors 2>&1) || addrc=$?',
    'if [ "$addrc" -ge 2 ]; then printf \'%s\\n\' "$add_log" >&2; exit "$addrc"; fi',
    "printf '%s\\n' \"$add_log\" | sed -n \"s/^error: unable to index file '\\(.*\\)'$/\\1/p\" | sort -u | while IFS= read -r sk; do",
    // 循环体用 if/fi 而非 && 列表：&& 列表条件为假时整条管道退出码为 1，
    // set -e 会把脚本杀掉（if 语句天然豁免）
    '  if [ -n "$sk" ]; then printf \'SNAP_SKIP %s\\n\' "$sk"; fi',
    'done',
    dropGitlinksBlock(),
    oversizeBlock(store.maxFileBytes),
    'tree=$("$git" --git-dir="$g" --work-tree="$root" write-tree)',
    'commit=$("$git" --git-dir="$g" -c user.name=dsh-recall -c user.email=recall@dsh.local commit-tree "$tree" -m ' + psq('snapshot ' + messageId) + ')',
    '"$git" --git-dir="$g" tag -f ' + psq('snap-' + messageId) + ' "$commit" >/dev/null',
    // PF-1：TREE 行随 SNAP_OK 回传 add -A 之后的 index 树指纹（语义见 pwsh 版
    // 同名注释）——execute 与 preview 指纹比对判 STALE，免整条重复 diff
    'echo "TREE $tree"',
    'echo SNAP_OK'
  ].join('\n')
}

// 当前清单/目标树清单落临时文件：两处复用（diff 与 rollback）。
// 关键前置链与 pwsh 版对齐——gitlink 清理 → 排除同步 → add -A → 再清
// gitlink → 超大剔除——少了 add -A 的话 ls-files 读到的还是上一次快照的
// 旧 index，「当前清单」永远等于目标 tag，diff 恒空（调试踩过的坑）。
// 行格式：cur 为「mode sha stage<TAB>path」（取 sha=a[2]），target 为
// 「mode type sha<TAB>path」（取 sha=a[3]）；grep 滤掉 gitlink（160000）行，
// 无匹配时退出码 1，set -e 下统一 || true。
function collectListsBlock(store, gitExe, root, tag, base) {
  return [
    'git=' + psq(gitExe),
    'g=' + psq(store.git),
    'root=' + psq(root),
    dropGitlinksBlock(),
    excludeSyncBlock(store.excludeFile, base),
    // fail-open add（语义见 snapshotScript 同款注释）：diff/rollback 的当前
    // 清单来自这次 add 后的索引——被跳过的路径不进清单，diff 不显示、
    // rollback 删除清单也不会误删它们；≥2 显式退出防「旧索引假成功」
    'addrc=0',
    '"$git" --git-dir="$g" --work-tree="$root" add -A --ignore-errors || addrc=$?',
    '[ "$addrc" -le 1 ] || exit "$addrc"',
    dropGitlinksBlock(),
    oversizeBlock(store.maxFileBytes),
    'tmpc=' + psq(store.dir + '/diff-cur.$$'),
    'tmpt=' + psq(store.dir + '/diff-tgt.$$'),
    '"$git" -c core.quotePath=false --git-dir="$g" --work-tree="$root" ls-files --stage | grep -v \'^160000 \' > "$tmpc" || true',
    '"$git" -c core.quotePath=false --git-dir="$g" ls-tree -r ' + psq(tag) + ' | grep -v \'^160000 \' > "$tmpt" || true'
  ].join('\n')
}

// diff：awk 一趟对比 cur/target（cur 侧 "mode sha<TAB>path" 取 a[2]，
// target 侧 "mode type sha<TAB>path" 取 a[3]），输出 TSV「kind<TAB>path」
// 逐行打印，Node 侧解析（不在 bash 里拼 JSON——没有 jq 依赖、
// 转义路径的坑也一并消失）。sort -k2 按 path 确定序，与 pwsh 版对齐。
// PF-1：末尾追加 write-tree + TREE 行（add 后的 index 树指纹，语义见 pwsh
// 版同注释）。POSIX 侧 TSV 文本轻、无 ConvertTo-Json 序列化开销，不做
// TOTAL/截断——全量输出，截断仍由 JS 侧 slice（与既有语义一致）。
export function diffScript(root, store, gitExe, tag, base) {
  return [
    'set -e -o pipefail',
    collectListsBlock(store, gitExe, root, tag, base),
    "trap 'rm -f \"$tmpc\" \"$tmpt\"' EXIT",
    'awk -F\'\\t\' -v OFS=\'\\t\' \'',
    '  FNR==1 { fidx++ }',
    '  fidx==1 { split($1, a, " "); cur[$2]=a[2]; next }',
    '  { split($1, a, " "); tgt[$2]=a[3] }',
    '  END {',
    '    for (p in cur) {',
    '      if (p in tgt) { if (tgt[p] != cur[p]) print "modified", p }',
    '      else print "added", p',
    '    }',
    '    for (p in tgt) if (!(p in cur)) print "restored", p',
    '  }',
    "' \"$tmpc\" \"$tmpt\" | sort -t$'\\t' -k2,2",
    'tree=$("$git" --git-dir="$g" --work-tree="$root" write-tree)',
    'echo "TREE $tree"',
    'exit 0'
  ].join('\n')
}

// 回退：archive | tar 直接管到工作区（无需 Windows 的 zip 中转），
// 空目标跳过；再删除「当前有、目标无」的文件（awk 求差集）。
// pipefail 保证 git archive 失败时整条非零退出。
// 删除侧失败必须响亮（F-G2）：set -e 豁免 if 条件内的 rm 失败——若写成
// `rm ... && deleted++` 裸链，rm 失败（权限等）被静默跳过、脚本仍输出
// ROLLBACK_OK，半回退报成功、救援永不触发；改为 if/fi + 失败显式 exit 1，
// 与 pwsh 版「EAP=Stop 下 Remove-Item 抛终止错误」对齐「删除失败即失败」
// 的语义（见 scripts.pwsh.js rollbackScript 同位置注释）。
export function rollbackScript(root, store, gitExe, tag, base) {
  return [
    'set -e -o pipefail',
    collectListsBlock(store, gitExe, root, tag, base),
    "trap 'rm -f \"$tmpc\" \"$tmpt\"' EXIT",
    'restored=$(wc -l < "$tmpt" | tr -d \' \')',
    'if [ "$restored" -gt 0 ]; then',
    // -m（--touch）：解包不恢复归档成员的 mtime（文件 mtime = 解包时刻）。
    // 必须如此：tar 默认保留归档内 mtime，而快照→篡改→回滚常在数秒内
    // 完成，恢复出的 mtime 可能与 index 里旧条目的 stat 记录碰撞，下一次
    // add -A 的 stat 缓存误判「未变更」跳过 re-hash——工作区内容与快照
    // 从此脱钩（实测解包出篡改前内容的间歇性失败）。Windows 版的
    // Expand-Archive 天然把 mtime 设为解包时刻，无此问题；-m 让 tar 对齐。
    '  "$git" --git-dir="$g" archive ' + psq(tag) + ' | tar -x -m -C "$root"',
    'fi',
    'tmpd=' + psq(store.dir + '/diff-del.$$'),
    "trap 'rm -f \"$tmpc\" \"$tmpt\" \"$tmpd\"' EXIT",
    'awk -F\'\\t\' \'',
    '  FNR==1 { fidx++ }',
    '  fidx==1 { cur[$2]=1; next }',
    '  { tgt[$2]=1 }',
    '  END { for (p in cur) if (!(p in tgt)) print p }',
    "' \"$tmpc\" \"$tmpt\" > \"$tmpd\"",
    'deleted=0',
    'while IFS= read -r p; do',
    // 循环体禁裸 && 链（AGENTS.md 已知坑同款规矩）：&& 列表条件为假时整条
    // 退出码为 1，set -e 会把脚本杀掉；if 语句天然豁免。rm 失败必须响亮
    // exit 1——半回退假成功会让救援永不触发（F-G2）
    '  if [ -z "$p" ]; then continue; fi',
    '  if rm -f -- "$root/$p"; then deleted=$((deleted + 1)); else echo "RM_FAILED $p" >&2; exit 1; fi',
    'done < "$tmpd"',
    'echo "ROLLBACK_OK $deleted $restored"'
  ].join('\n')
}

// 回退失败救援（H1，语义见 pwsh 版同款注释）：reset --hard 回安全快照。
// 入参 tag 是完整 tag 名（snap- 前缀由调用侧 rescueRollback 拼齐）。
// set -e 下 git 非零退出自然终止脚本，与 pwsh 版 $LASTEXITCODE 显式自检
// 对齐「失败即抛」语义。
export function rescueScript(root, store, gitExe, tag) {
  return [
    'set -e',
    'git=' + psq(gitExe),
    'g=' + psq(store.git),
    'root=' + psq(root),
    '"$git" --git-dir="$g" --work-tree="$root" reset --hard ' + psq(tag),
    'echo RESCUE_OK'
  ].join('\n')
}

export function listTagsScript(store, gitExe) {
  return [
    'set -e',
    'git=' + psq(gitExe),
    'g=' + psq(store.git),
    // 仅创建过 store 目录、尚未产生过快照时没有 git/.git；把它视为
    // 空快照仓库而非错误，全部删除仍可顺便清空其陈旧 index.json。
    '[ -d "$g" ] || exit 0',
    '"$git" --git-dir="$g" tag -l \'snap-*\''
  ].join('\n')
}

// 孤儿重建用 tag 清单（带 creatordate）：rebuildOrphans 据此恢复快照
// 时间——只列 tag 名会让重建条目 time=0，管理列表时间前缀缺失、
// retention/limits 按「最旧」误清。lightweight tag 无 tag 对象，
// creatordate 即指向 commit 的提交日期。输出每行「<tag名> <秒级时间戳>」。
export function listTagsWithTimeScript(store, gitExe) {
  return [
    'set -e',
    'git=' + psq(gitExe),
    'g=' + psq(store.git),
    '[ -d "$g" ] || exit 0',
    '"$git" --git-dir="$g" for-each-ref --format=\'%(refname:short) %(creatordate:unix)\' \'refs/tags/snap-*\''
  ].join('\n')
}

// 定期 gc（语义同 pwsh 版）；date +%s 写秒级时间戳，JS 侧 ×1000
export function gcScript(store, gitExe) {
  return [
    'set -e',
    'git=' + psq(gitExe),
    'g=' + psq(store.git),
    '"$git" --git-dir="$g" gc --quiet --prune=now',
    'date +%s > "$g/gc.stamp"',
    'echo GC_OK'
  ].join('\n')
}

// 快照失败后的残骸清理（语义同 pwsh 版，动机详见其注释）：prune 以
// refs + 暂存 index 为根删无引用对象，只清失败 add 的残骸、不碰 tag 快照
export function pruneScript(store, gitExe) {
  return [
    'set -e',
    'git=' + psq(gitExe),
    'g=' + psq(store.git),
    '"$git" --git-dir="$g" prune',
    'echo PRUNE_OK'
  ].join('\n')
}

// 失败后的孤儿进程清扫 + stale 锁清理（issue #7 兜底 + issue #11 根因治理）。
// 三级出口（M3）：
// 1. CLEANUP_OTHER_INSTANCE <pid>——心跳文件（宿主 PID + epoch 秒）显示另一
//    个存活实例正在使用同一快照库：直接让路，不杀进程、不动锁。这是两个
//    DSH 实例并发互踩（一方清扫误杀另一方活跃 git → 对方也失败 → 循环）的
//    根治；心跳由 ensureGit/snapshotScript 随操作刷新，TTL 外视为失效。
// 2. CLEANUP_SKIPPED_FRESH_LOCK——存在 STALE_LOCK_MIN 分钟内的新锁（疑似有
//    git 操作正在进行）：同样让路，锁陈旧后下次失败自然进入第 3 级。
// 3. CLEANUP_DONE——两级保护均未命中，按原有行为清孤儿进程与 stale 锁。
// POSIX 版差异：pgrep -f 按扩展正则匹配整条命令行——路径元字符（[、+ 等）
// 会让模式失配，清扫静默失效，属安全降级（等价于本兜底加入前的行为）；
// 标记在运行期拼接，本脚本自身命令行里只有未展开的 $g 字面量，不会自杀。
// 全程无 set -e + 逐步容错：清扫自身的失败不能抛。mtime 判定用 find -mmin
// 而非 stat：GNU/BSD stat 参数不同（macOS bash 3.2 约束），find 的 -mmin
// 两平台语义一致。
export function killOrphansScript(gitDir) {
  return [
    '# RECALL_CLEANUP',
    'g=' + psq(gitDir),
    'hbf="$(dirname "$(dirname "$g")")/heartbeat"',
    'if [ -f "$hbf" ]; then',
    '  hbl=$(head -n1 "$hbf" 2>/dev/null | tr -d \'\\r\')',
    '  hbp=${hbl%% *}',
    '  hbt=${hbl#* }',
    "  case \"$hbp\" in ''|*[!0-9]*) hbp='' ;; esac",
    "  case \"$hbt\" in ''|*[!0-9]*) hbt=0 ;; esac",
    '  hbage=$(( $(date +%s) - hbt ))',
    '  if [ -n "$hbp" ] && [ "$hbp" != ' + psq(String(process.pid)) + ' ] && [ "$hbage" -ge 0 ] && [ "$hbage" -lt ' + HEARTBEAT_TTL_S + ' ]; then',
    '    if kill -0 "$hbp" 2>/dev/null; then',
    '      echo "CLEANUP_OTHER_INSTANCE $hbp"',
    '      exit 0',
    '    fi',
    '  fi',
    'fi',
    "fresh=$(find \"$g\" -maxdepth 1 -type f \\( -name '*.lock' -o -name 'gc.pid' \\) -mmin -" + STALE_LOCK_MIN + " 2>/dev/null; find \"$g/refs\" -type f -name '*.lock' -mmin -" + STALE_LOCK_MIN + ' 2>/dev/null)',
    'if [ -n "$fresh" ]; then',
    '  echo CLEANUP_SKIPPED_FRESH_LOCK',
    '  exit 0',
    'fi',
    'marker="--git-dir=$g"',
    'for p in $(pgrep -f -- "$marker" 2>/dev/null); do',
    '  [ "$p" = "$$" ] && continue',
    '  kill "$p" 2>/dev/null || true',
    'done',
    // 锁清单对齐 pwsh 版：index.lock 是 add/checkout 持久锁，其余是
    // gc/tag/pack 链路残留；refs 下 per-ref 锁用 find 兜底（只删陈旧锁，
    // 新锁已被上方分级保护拦下）
    'rm -f "$g/index.lock" "$g/config.lock" "$g/HEAD.lock" "$g/gc.pid" "$g/packed-refs.lock" "$g/shallow.lock" 2>/dev/null || true',
    'find "$g/refs" -type f -name "*.lock" -mmin +' + STALE_LOCK_MIN + ' -delete 2>/dev/null || true',
    'echo CLEANUP_DONE'
  ].join('\n')
}

// 删除指定快照 tag（会话已删联动清理用）：tag -d 对不存在 tag 非零退出，
// || true 吞掉——best-effort，残留 tag 由下次清理幂等收尾（同 pwsh 版）
export function purgeTagsScript(store, gitExe, tags) {
  return [
    'git=' + psq(gitExe),
    'g=' + psq(store.git),
    '"$git" --git-dir="$g" tag -d ' + tags.map((t) => psq(t)).join(' ') + ' >/dev/null 2>&1 || true',
    'echo PURGE_DONE'
  ].join('\n')
}

// 原子 rename（H2，语义见 pwsh 版同款注释）：mv -f 同卷 move 为 O(1) 元
// 数据操作；也用于 loadIndex 把损坏索引改名 .corrupt-<ts> 保留现场。
export function renameFileCmd(src, dst) {
  return 'mv -f -- ' + psq(src) + ' ' + psq(dst)
}

// 任意长度文本写入（PF-2，语义见 pwsh 版同名注释）：stdin 传全文 + 单进程
// 落盘。POSIX 原本就直写 stdin（cat > tmp 此前内联在 store.js，PF-2 起迁进
// 模板统一走同名导出），bash 无编码/长度问题，模板本体就是这条 cat。
export function fileWriteStdinCmd(file) {
  return 'cat > ' + psq(file)
}

// 索引读取（写入走 stdin：见 snapshots.js saveIndex 的 POSIX 分支，
// 不经命令行传参，天然没有 32767/128KB argv 上限问题）
export function indexReadCmd(dir) {
  return 'cat ' + psq(dir + '/index.json') + ' 2>/dev/null || true'
}

// fork lineage 读取（F1，语义见 pwsh 版同款注释）：lineage.json 与 index.json
// 同层、原子写；缺失文件输出空串。
export function lineageReadCmd(dir) {
  return 'cat ' + psq(dir + '/lineage.json') + ' 2>/dev/null || true'
}

// 旧版项目内 blobs 目录清理（仅 home 存储可用时调用）
export function legacyRmScript(path) {
  return 'rm -rf -- ' + psq(path)
}

// exclude.txt 原文读取（设置页编辑用）：缺失文件 cat 报错走 2>/dev/null ||
// true 吞掉输出空串——与 pwsh 版同语义，按「尚未配置」处理；写入不走
// 模板函数，调用方直接 cat > file + stdin（同 saveIndex 的 POSIX 分支）。
export function excludeReadCmd(file) {
  return 'cat ' + psq(file) + ' 2>/dev/null || true'
}

// 批量读全部 exclude 文件（PF-8，语义见 pwsh 版同注释）：内容 base64 单行
// 输出（任意文本免疫定界混淆）。GNU base64 默认 76 字符折行、BSD（macOS）
// 不折行且无 -w——统一 base64 | tr -d '\n' 兼容两侧；读失败输出空段。
export function excludeDumpScript(files) {
  const lines = []
  for (const f of files || []) {
    const q = psq(f)
    lines.push(
      "printf 'EXCLBEGIN %s\\n' " + q,
      'if [ -f ' + q + ' ]; then base64 ' + q + " 2>/dev/null | tr -d '\\n'; fi",
      "echo 'EXCLEND'"
    )
  }
  return lines.join('\n')
}

// 目录存在探测：YES/NO 定长标记与 pwsh 版逐字同语义（容器路径本身在
// JS 侧解析，POSIX 不需要 homeContainerScript 的 shell 版）。
export function dirExistsScript(dir) {
  return '[ -d ' + psq(dir) + ' ] && echo YES || echo NO'
}

// 影子仓库磁盘占用（设置页快照管理卡片用，语义同 pwsh 版）
export function countObjectsScript(store, gitExe) {
  return [
    'git=' + psq(gitExe),
    'g=' + psq(store.git),
    '"$git" --git-dir="$g" count-objects -v'
  ].join('\n')
}

// 目录总大小（字节）：du -sk 取 KiB 再 ×1024；macOS/BSD du 与 GNU du
// 对 -sk 的输出格式一致（"大小<TAB>路径"），awk 取首列最稳。
export function diskUsageScript(dir) {
  return 'du -sk ' + psq(dir) + ' 2>/dev/null | awk \'{print $1 * 1024}\''
}

// 列目录下所有一级子目录全路径：manage/list 枚举 home 容器下的所有
// 哈希子目录用（每个子目录是一个工作区的 store）。find -maxdepth 1
// 限定深度避免递归，2>/dev/null 容忍个别不可读条目。
export function listSubdirsScript(dir) {
  return 'find ' + psq(dir) + ' -maxdepth 1 -mindepth 1 -type d 2>/dev/null'
}

// 批量 dump 全部 store 元数据（与 pwsh 版 storesDumpScript 同格式、
// 同语义，见其注释）：一条 shell 拿全部目录的 root.txt + index.json +
// lineage.json（PF-4）。
// bash 3.2 兼容：数组 + += 均可用，glob 无匹配时字面量经 [ -d ] 过滤。
// root.txt 经 tr 去掉可能的 CRLF 再拼单行，防标记结构被打乱。
export function storesDumpScript(container, extraDirs) {
  const lines = ['set -e', 'dirs=()']
  if (container) {
    lines.push('base=' + psq(container))
    lines.push('if [ -d "$base" ]; then')
    lines.push('  for d in "$base"/*/; do')
    // if 而不是 [ ] && ：glob 无匹配时条件为假，&& 链返回非零会触发 set -e
    lines.push('    if [ -d "$d" ]; then dirs+=("${d%/}"); fi')
    lines.push('  done')
    lines.push('fi')
  }
  for (const d of extraDirs || []) lines.push('dirs+=(' + psq(d) + ')')
  lines.push(
    'for d in "${dirs[@]}"; do',
    '  [ -d "$d" ] || continue',
    '  echo "==DIR $d"',
    '  if [ -f "$d/root.txt" ]; then',
    '    printf "ROOT %s\\n" "$(cat "$d/root.txt" 2>/dev/null | tr -d \'\\r\\n\')"',
    '  else',
    '    echo "ROOT "',
    '  fi',
    '  echo INDEXBEGIN',
    '  cat "$d/index.json" 2>/dev/null',
    '  echo INDEXEND',
    '  echo LINEAGEBEGIN',
    '  cat "$d/lineage.json" 2>/dev/null',
    '  echo LINEAGEEND',
    'done',
    'exit 0'
  )
  return lines.join('\n')
}
