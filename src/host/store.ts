/**
 * dsh-recall-plugin — 执行与存储层（ctx 绑定的工厂，无模块级副作用）
 *
 * 职责：提供 runShell（宿主身份执行 + 统一编码保证）、会话根目录解析、
 * git 可执行文件探测、home/降级存储解析与迁移、影子仓库初始化（ensureGit）。
 * 按 process.platform 选择脚本模板（scripts.pwsh.js / scripts.posix.js），
 * 两套模板导出同名接口，本文件用 rt.scripts 统一下发。
 * 产出共享 state（各 Map 缓存）供 snapshots.js / maintenance.js 复用；
 * 由 lib/index.js 在 apply(ctx) 里装配，插件卸载时随 Fiber 一起丢弃。
 */

import os from 'node:os'
import crypto from 'node:crypto'
import * as pwshScripts from './scripts.pwsh.js'
import * as posixScripts from './scripts.posix.js'
import { classifyEnvError } from './diagnostics.js'
import type { Runtime, SharedState, StoreInfo, ShellRunOptions, ErrorRecord } from '../types/state.js'
import type { PwshScripts, PosixScripts } from '../types/scripts.js'
import type { HostContext, SessionQueryEngine } from '../types/dsh-contract.js'
import type { ResolvedConfig } from '../types/config.js'

// home 不可写时迁移重试的节流间隔：避免每条消息都白试一次注定失败的迁移
const HOME_RETRY_MS = 300000

// 最近错误环形缓冲容量：设置页排障用，20 条足够回溯一轮快照/gc 的失败
const ERROR_BUFFER_MAX = 20

// ---- POSIX home 基底解析（模块级纯逻辑，单测直测；工厂内 posixHomeBaseResolve
// 委托到这里）。放模块级而非工厂闭包：分支行为要在 win32 CI 上可测，而
// posixHomeBaseResolve 只在 POSIX 运行时被触达。----

// 三档回退选择：bash env $DSH_HOME → Node 主进程 DSH_HOME → os.homedir()。
// 第三档必须补 /.dsh 子目录（I24）：win32 版第三档是 Join-Path USERPROFILE .dsh
// （scripts.pwsh.js homeDirScript），POSIX 版曾直接用裸 homedir，快照落
// ~/dsh-recall-snapshots 而非 ~/.dsh/dsh-recall-snapshots（issue #11 实证）。
// 返回 third 标记是否走了第三档——只有第三档才涉及旧容器迁移（存量用户
// 的数据在旧位，改 base 前要先搬）。
export interface PosixHomeInputs {
  probed: string
  envHome: string
  homedir: string
}
export function selectPosixHomeBase({ probed, envHome, homedir }: PosixHomeInputs): { base: string; third: boolean } {
  if (probed) return { base: probed, third: false }
  if (envHome) return { base: envHome, third: false }
  return { base: homedir + '/.dsh', third: true }
}

// 第三档命中时的一次性旧容器迁移编排（best-effort，数据安全优先）：
// legacyHomeMigrateScript 只在「旧容器存在且新容器不存在」时整容器 mv，
// 输出四态由这里裁决——MIGRATE_OK / OLD_ABSENT 落规范位置（~/.dsh/…）；
// BOTH_PRESENT（双容器并存）/ MIGRATE_FAIL（mv 失败）沿用旧位并 recordError，
// 与 tryUpgradeToHome 的非致命迁移哲学一致：数据不丢永远优先于路径规范。
// 探测命令自身失败按同策略回落旧位——此刻无法判断旧容器是否存在，选新位
// 会让存量用户「看不到」历史快照，选旧位对新装机只是维持修复前的行为。
export async function resolvePosixHomeBase(
  deps: { runShell(cmd: string, opts?: ShellRunOptions): Promise<string>; scripts: PosixScripts; recordError(text: string): void },
  inputs: PosixHomeInputs
): Promise<string> {
  const { probed, envHome, homedir } = inputs
  const sel = selectPosixHomeBase({ probed, envHome, homedir })
  if (!sel.third) return sel.base
  try {
    const out = String(await deps.runShell(deps.scripts.legacyHomeMigrateScript(homedir), { timeoutMs: 300000, stdoutMaxBytes: 4096 })).trim()
    if (out === 'MIGRATE_OK' || out === 'OLD_ABSENT') return sel.base
    deps.recordError(
      out === 'BOTH_PRESENT'
        ? 'recall home store 新旧容器并存（' + homedir + '/dsh-recall-snapshots 与 ' + homedir + '/.dsh/dsh-recall-snapshots），沿用旧位，未做任何改动'
        : 'recall 旧快照容器迁移失败（MIGRATE_FAIL），沿用旧位 ' + homedir + '/dsh-recall-snapshots'
    )
    return homedir
  } catch (error) {
    deps.recordError('recall 旧快照容器迁移探测失败，沿用旧位: ' + String(error))
    return homedir
  }
}

// 失败清扫脚本输出解读（M3 纯逻辑，供单测；cleanupAfterGitFailure 消费）。
// killOrphansScript 的三级出口：CLEANUP_OTHER_INSTANCE <pid> = 检测到另一个
// 活实例正在使用同一快照库（心跳有效且进程存活），清扫已让路；
// CLEANUP_SKIPPED_FRESH_LOCK = 存在 5 分钟内的新锁（疑似 git 操作进行中），
// 清扫未触碰；CLEANUP_DONE = 原有清扫路径执行完毕。解析按标记行匹配，
// 与模板输出逐字对应（改标记必须两侧同步）。
export function parseCleanupResult(out: unknown): { otherPid: number | null; skippedFresh: boolean } {
  const m = String(out || '').match(/CLEANUP_OTHER_INSTANCE\s+(\d+)/)
  if (m) return { otherPid: parseInt(m[1], 10), skippedFresh: false }
  if (String(out || '').indexOf('CLEANUP_SKIPPED_FRESH_LOCK') >= 0) return { otherPid: null, skippedFresh: true }
  return { otherPid: null, skippedFresh: false }
}

// rename 步 ENOENT 判定（模块级纯逻辑，单测直接覆盖）：POSIX mv 与
// pwsh Move-Item 的「目标不存在」文案集合，且错误必须提到 tmp 文件名
//（basename）——只认 rename 步的错误形态，误吞面最小。
export function isTmpConsumedError(error: unknown, basename: string): boolean {
  const s = String(error || '')
  if (!basename || s.indexOf(basename) < 0) return false
  return /No such file/i.test(s) || /does not exist/i.test(s) || /cannot find path/i.test(s)
}

export function createRuntime(ctx: HostContext, config: ResolvedConfig): Runtime {
  const shell = ctx.shell
  const sessions = ctx.sessions

  const isWin = process.platform === 'win32'
  const SEP = isWin ? '\\' : '/'
  const scripts: PwshScripts | PosixScripts = isWin ? pwshScripts : posixScripts

  const state: SharedState = {
    roots: new Map(),
    stores: new Map(),
    snapshots: new Map(),
    queue: Promise.resolve(),
    indexLoaded: new Set(),
    // PF-5 索引终态三/四档标记（rebuildOrphans 守卫的数据源）：
    // - indexHealthy：磁盘索引解析成功且在场（loadIndex 正常载入分支）——
    //   rebuildOrphans 对 healthy 且条目非空的 root 整体跳过（省 1+N 条进程）
    // - indexTruncated：读截断（F-G3，内存是残缺视图）——rebuildOrphans
    //   必须跳过：否则全部 tag 被判孤儿、用残缺孤儿集覆盖完好的大索引
    //   （feedback 全丢、数万条索引按 win32 分块写下是数百条进程的灾难）
    // empty（无索引文件）/quarantined（损坏隔离）不标记 → rebuild 照跑，
    // 自愈链路完整
    indexHealthy: new Set(),
    indexTruncated: new Set(),
    gitReady: new Set(),
    cutSeqCache: new Map(),
    homeRetryAt: new Map(),
    gcLastAt: new Map(),
    gcCount: new Map(),
    gitExe: null,
    posixHomeBase: null,
    homeContainer: null,
    errors: [],
    // 逐消息的快照反馈（issue #7 失败可见性）：失败 {failed,error} 或
    // fail-open 跳过 {skipped:[...]}，由 snapshot-info 端点下发给客户端
    // 弹 toast。放共享 state 而非 snapshots.js 闭包：端点在 index.js，
    // 与索引/根缓存同层取用。
    snapFeedback: new Map()
  }

  // 最近错误环形缓冲：Host 侧所有失败原本只进 console.error（宿主进程
  // 日志，用户在页面上不可见），这里留最近 20 条经 /api/recall/status
  // 下发给设置页展示。同时转发 console.error 保持原有宿主日志不变。
  // 尾部去重（issue #11）：环境性错误随每条消息重复抛出，逐条 push 会把
  // 20 条环形缓冲刷成同一条目、console.error 同步刷屏，其他诊断信息全被
  // 挤掉。相邻重复只更新 time/count——间隔其他错误的重复仍新建条目，错误
  // 时序不丢；kind 随条目富集（classifyEnvError），供 status 端点机器分流。
  function recordError(text: string) {
    const message = String(text)
    const last = state.errors[state.errors.length - 1]
    if (last && last.message === message) {
      last.time = Date.now()
      last.count += 1
      return
    }
    const rec: ErrorRecord = { time: Date.now(), message, count: 1, kind: classifyEnvError(message) }
    state.errors.push(rec)
    if (state.errors.length > ERROR_BUFFER_MAX) state.errors.splice(0, state.errors.length - ERROR_BUFFER_MAX)
    console.error(message)
  }

  // 两套脚本模板的「命令函数」同名导出是跨平台正确性的硬约束（store.js
  // 按平台单选 rt.scripts，调用方统一 S.*）：单侧漏导出只会在另一平台
  // 用户机器上以「不是函数」的怪异方式暴雷。装配时比对一次。豁免项：
  // 平台专属导出（homeDirScript 的 $h 链只在 pwsh 侧需要——POSIX 的 home
  // 基底走 probeHomeScript + Node 侧推导；常量与转义工具不承载命令）。
  ;(function checkScriptParity() {
    // fileWriteStdinCmd 两平台同名（PF-2 起两平台统一走 stdin 单进程落盘，
    // 编码行为由探针钉死）；legacyHomeMigrateScript 仅 posix 版存在：
    // 旧容器迁移是 POSIX 漂移（I24）专属的存量数据兜底，win32 无此问题
    const SKIP = new Set(['homeDirScript', 'probeHomeScript', 'legacyHomeMigrateScript'])
    // 豁免集事实源：src/types/scripts.ts 平台专属接口（PwshScripts/PosixScripts
    // extends 差分）；本集合是它的运行时镜像，M5 起由 tests/types satisfies 编译期锁死
    const pwshKeys = Object.keys(pwshScripts).filter((k) => !SKIP.has(k) && typeof (pwshScripts as Record<string, unknown>)[k] === 'function')
    const posixKeys = Object.keys(posixScripts).filter((k) => !SKIP.has(k) && typeof (posixScripts as Record<string, unknown>)[k] === 'function')
    const missing = pwshKeys.filter((k) => posixKeys.indexOf(k) < 0)
    if (missing.length) recordError('recall script parity: posix 缺少导出 ' + missing.join(', '))
  })()

  // 所有 shell 调用都以宿主身份（danger-full-access）执行，不借用会话沙箱。
  // 为什么安全：DSH 沙箱约束的是「模型驱动」的文件效果，而本插件的命令全部
  // 是宿主侧固定模板（建仓/快照/索引/回退），命令串里唯一变量是插件自己
  // 推导的路径（会话 cwd、哈希出的 store 路径、消息 ID），模型无法注入任何
  // 内容；快照落盘的也只是会话本就有权读取的工作区文件副本，不扩大能力。
  // 为什么必须如此：若按会话解析策略，workspace-write/read-only 会话写不了
  // home，快照被迫降级进项目目录（污染）；read-only 会话连项目都写不了，
  // 回退恢复直接失败。pwsh-sandbox / bash-sandbox 对 danger-full-access
  // 直接不约束（等价本地执行器），无沙箱后端的部署则忽略该字段，两边都成立。
  // F-G3：runShell 的元数据变体——stdout 截断可判定（官方 ShellRunResult.stdout
  // 是 CollectedOutput{text, truncated, spillPath?}，见 dsh-shell 与
  // dsh-subprocess 的 lib/types/types.d.ts；截断时 text 只剩流尾部）。需要
  // 「解析完整 stdout」的调用方（loadIndex）用它区分「读截断」与「内容损坏」；
  // 其余调用方继续用 runShell 拿纯文本，签名不变。
  async function runShellMeta(command: string, opts?: ShellRunOptions): Promise<{ text: string; truncated: boolean }> {
    const sp = ctx.get<{ workspaceRoot?: string }>('sandboxPolicy')
    const spec = shell.resolve({
      // 编码前导：pwsh 侧统一 UTF-8 输出（中文机器 GBK 代码页不再乱码）；
      // bash 侧 LC_ALL=C 确定序。各模板自带，这里统一前置注入。
      command: scripts.UTF8_PRELUDE + '\n' + command,
      timeoutMs: (opts && opts.timeoutMs) || 300000,
      stdoutMaxBytes: (opts && opts.stdoutMaxBytes) || 4194304,
      // stdin 是官方 ShellExecRequest 契约字段（bash-local/pwsh 均实现），
      // POSIX 侧用它传 index.json 全文，绕开 argv 长度上限
      ...((opts && opts.stdin !== undefined) ? { stdin: opts.stdin } : {}),
      sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: (sp && sp.workspaceRoot) || process.cwd() }
    })
    const res = await shell.run(spec)
    const out = (res && res.stdout && res.stdout.text) || ''
    if (res && res.exitCode !== 0) {
      // 失败兜底（issue #7）：超时/失败的 git 命令可能留下孤儿进程与
      // stale 锁——subprocess 服务的树级终止有竞态窗口，且 git 被硬杀时
      // 不回收 index.lock，残留锁会让后续每条快照持续 fatal。best-effort
      // 清扫后再抛原始错误，清扫自身的失败不得掩盖它。
      await cleanupAfterGitFailure(command)
      const err = ((res && res.stderr && res.stderr.text) || '').trim() || ('exit ' + String(res.exitCode))
      throw new Error(err.slice(0, 1500))
    }
    return {
      text: out,
      truncated: Boolean(res && res.stdout && res.stdout.truncated),
    }
  }

  async function runShell(command: string, opts?: ShellRunOptions): Promise<string> {
    return (await runShellMeta(command, opts)).text
  }

  // 从脚本文本提取影子仓库 git-dir：两套模板的 git 命令脚本都以
  // `$g = '<store.git>'` / `g='<store.git>'` 开头（凡带 store 的脚本全遵守
  // 此约定），取首个带引号字面量赋值即得。resolveGitScript 等对 $g 的
  // 非字面量赋值天然不匹配；含单引号的罕见路径会让 psq 的 '' 转义截断
  // 提取结果——清扫脚本对错误路径只是 no-op（杀不到进程、删不到锁），
  // 安全降级为本兜底加入前的行为。
  function extractGitDir(command: string): string | null {
    const m = String(command).match(/(?:^|\n)[ \t]*(?:\$g|g)[ \t]*=[ \t]*'([^']+)/)
    return m ? m[1] : null
  }

  async function cleanupAfterGitFailure(command: string): Promise<void> {
    // 哨兵识别清扫脚本自身：它也定义 $g 且可能失败（如 taskkill 缺失），
    // 不拦住会「清扫失败 → 再清扫」无限递归
    if (!command || String(command).indexOf('RECALL_CLEANUP') >= 0) return
    const gitDir = extractGitDir(command)
    if (!gitDir) return
    try {
      const out = await runShell(scripts.killOrphansScript(gitDir), { timeoutMs: 60000, stdoutMaxBytes: 4096 })
      // M3：清扫让路的两种情形都值得一条记录——前者把 issue #11 的「疑似
      // 多实例」升级为「确认」（点名 PID），后者解释了环境为何没有被自动
      // 清理。recordError 的尾部去重保证逐消息重复失败不会刷屏。
      const r = parseCleanupResult(out)
      if (r.otherPid !== null) recordError('recall 检测到另一个 DSH 实例（PID ' + r.otherPid + '）正在使用此快照库，失败清扫已让路：未杀进程、未动锁')
      else if (r.skippedFresh) recordError('recall 检测到 5 分钟内的新锁文件，疑似 git 操作正在进行，失败清扫已让路（锁陈旧后会自动清理）')
    } catch (error) { /* best-effort：清扫失败不影响原始错误的抛出 */ }
  }

  async function resolveRoot(sessionId: string | null): Promise<string | null> {
    const key = sessionId ? String(sessionId) : 'fallback'
    const cached = state.roots.get(key)
    if (cached) return cached
    let root = null
    // 是否为「真实会话来源」的解析结果（live header / 持久化 header）：
    // 只有这类结果才允许进缓存。回退到 sandboxPolicy.workspaceRoot 的临时
    // 结果不缓存——它通常是 harness 启动目录而非会话真实 cwd，一旦缓存，
    // 会话稍后变 live/持久化后仍被旧错误根遮蔽，撤回按钮永不出现。
    let authoritative = false
    if (sessionId) {
      const session = sessions.get(sessionId)
      if (session && session.header && session.header.cwd) {
        root = session.header.cwd
        authoritative = true
      }
    }
    if (!root && sessionId) {
      // 冷会话（尚未 live，如页面先于会话注册就绪加载）从持久化 header
      // 解析真实 cwd，避免回退 workspaceRoot（harness 启动目录）查错
      // store。listSessions 是目录级 header 枚举，不触碰全量日志；解析
      // 失败静默走回退，不阻断主流程。
      try {
        const query = ctx.get<SessionQueryEngine>('sessionQuery')
        if (query && typeof query.listSessions === 'function') {
          const records = await query.listSessions()
          const rec = (records || []).find((r) => r && r.header && r.header.id === sessionId)
          if (rec && rec.header && rec.header.cwd) {
            root = rec.header.cwd
            authoritative = true
          }
        }
      } catch (error) { /* 冷元数据不可用则走回退 */ }
    }
    if (!root) {
      const sp = ctx.get<{ workspaceRoot?: string }>('sandboxPolicy')
      if (sp && sp.workspaceRoot) root = sp.workspaceRoot
    }
    if (root) {
      // 尾分隔符归一（win32 保 "D:\" 三字符盘根；POSIX 保 "/" 根）：
      // cwd 是否带尾斜杠由上游决定，不归一会让哈希输入不一致（换 store
      // 目录），也会让排除扫描的 ${f#"$root"/} 前缀剥离错一位。
      root = root.replace(/[\\/]+$/, '') || (isWin ? root : '/')
      if (isWin && root.length === 2) root += '\\'
      if (authoritative) state.roots.set(key, root)
    }
    return root
  }

  // 解析 git 可执行文件路径：求值一次并缓存，脚本里用绝对路径调用，
  // 避免每条命令依赖 PATH（DSH 进程 PATH 可能不含 git）。
  async function resolveGit(): Promise<string> {
    if (state.gitExe !== null) return state.gitExe
    try {
      const path = scripts.stripBom(await runShell(scripts.resolveGitScript(), { stdoutMaxBytes: 4096 })).trim()
      state.gitExe = path || ''
    } catch (error) {
      state.gitExe = ''
    }
    return state.gitExe
  }

  // win32：哈希在 PowerShell 里算（SHA256 Create 兼容 PS 5.1），连带
  // $env:DSH_HOME / $env:USERPROFILE 的解析都在 shell 侧完成。
  // scripts 是按平台二选一的联合，homeDirScript 仅 pwsh 侧存在——本方法
  // 只在 isWin 分支被触达，显式断言到 PwshScripts（豁免集事实源见 types/scripts.ts）
  async function homeDirForWin(root: string): Promise<string | null> {
    const envHome = (process.env && process.env.DSH_HOME) || ''
    const text = scripts.stripBom(await runShell((scripts as PwshScripts).homeDirScript(root, envHome), { stdoutMaxBytes: 4096 })).trim()
    if (!text) return null
    // 折叠 Join-Path 可能带出的连续反斜杠；开头的双反斜杠是 UNC 前缀
    // （DSH_HOME/主目录指到网络盘），折叠掉会把 \\server\share 变成无效
    // 的 \server\share，必须原样保留。
    if (/^\\\\/.test(text)) return '\\\\' + text.slice(2).replace(/\\{2,}/g, '\\')
    return text.replace(/\\{2,}/g, '\\')
  }

  // POSIX：shell 侧只探 bash env 里显式的 $DSH_HOME（DSH 执行器洗刷
  // DSH_* 变量后通常为空）；为空时依次回退 Node 主进程的 DSH_HOME
  // （宿主进程 env，用户导出可见）与 os.homedir()（补 /.dsh 层，见
  // selectPosixHomeBase 的 I24 注释）。哈希用 Node crypto 统一算，规避
  // Linux sha256sum / macOS shasum 的二选一移植成本。三档选择与旧容器
  // 迁移编排都委托模块级纯函数（resolvePosixHomeBase），本方法只负责探测
  // 输入与结果缓存（迁移随缓存每进程至多跑一次）。
  async function posixHomeBaseResolve(): Promise<string> {
    if (state.posixHomeBase === null) {
      let probed = ''
      try {
        // probeHomeScript 仅 posix 侧存在，本方法只在 POSIX 运行时被触达
        probed = (await runShell((scripts as PosixScripts).probeHomeScript(), { stdoutMaxBytes: 4096 })).trim()
      } catch (error) {
        probed = ''
      }
      state.posixHomeBase = await resolvePosixHomeBase(
        { runShell, scripts: scripts as PosixScripts, recordError },
        { probed, envHome: (process.env && process.env.DSH_HOME) || '', homedir: os.homedir() }
      )
    }
    return state.posixHomeBase
  }

  async function homeDirForPosix(root: string): Promise<string> {
    const base = await posixHomeBaseResolve()
    const hash = crypto.createHash('sha256').update(root, 'utf8').digest('hex')
    return base.replace(/\/+$/, '') + '/dsh-recall-snapshots/' + hash
  }

  async function homeDirFor(root: string): Promise<string | null> {
    return isWin ? homeDirForWin(root) : homeDirForPosix(root)
  }

  // 快照容器目录（<homeBase>/dsh-recall-snapshots，不含哈希子目录）：
  // 设置页 exclude-get 的磁盘兜底用——冷启动时会话注册表为空（惰性
  // 载入），但容器目录可能早已存在，此时共享 exclude.txt 仍应可编辑。
  // 目录结构固定 <base>/dsh-recall-snapshots/<hash>，所以容器就是
  // homeDirFor 结果的父目录：JS 侧 slice 推导，不再走第二条 shell 解析链
  // （旧实现里 homeDirScript 与 homeContainerScript 的 $h 链靠注释人工
  // 对齐，存在漂移风险）。失败返回 null 且不缓存，下次调用自然重试。
  async function resolveHomeContainer() {
    if (state.homeContainer) return state.homeContainer
    let container = null
    try {
      const probeRoot = Array.from(state.roots.values())[0] || process.cwd()
      const homeDir = await homeDirFor(probeRoot)
      if (homeDir) container = homeDir.slice(0, homeDir.length - 65)
    } catch (error) {
      container = null
    }
    if (container) state.homeContainer = container
    return container
  }

  // store 形态装配：exclude.txt 是用户自定义排除文件，home 存储时放在
  // dsh-recall-snapshots 根（所有项目共享一份全局配置）；降级存储时放
  // store 目录内部——降级目录本身已被排除规则覆盖，不再往项目根塞文件。
  // git init <dir> 会把真实 git-dir 建在 <dir>/.git，所以 repo 是仓库
  // 工作目录、git 是真实 git-dir——冒烟测试踩过的坑。
  // maxFileBytes 从 config 注入 store：脚本模板（snapshot/diff/rollback
  // 的超大文件剔除）按调用时从 store 读取，用户改 config 后下一条命令
  // 即生效，无需重启——因此用 getter 跟随 config 热更新，而不是创建时
  // 快照（settings 卡片改 maxFileBytes 后 store 缓存不重建）。
  function makeStore(dir: string, home: boolean): StoreInfo {
    const excludeFile = home
      ? dir.slice(0, dir.lastIndexOf(SEP)) + SEP + 'exclude.txt'
      : dir + SEP + 'exclude.txt'
    return {
      dir,
      repo: dir + SEP + 'git',
      git: dir + SEP + 'git' + SEP + '.git',
      home,
      excludeFile,
      get maxFileBytes() { return config.maxFileBytes },
    }
  }

  // 将磁盘枚举出的 store 目录临时包装成 store 对象。全部删除必须覆盖
  // `root.txt`/`index.json` 已失步的历史仓库：这时无法安全地用 root 调
  // `resolveStore`（它可能新建另一个目录），所以直接以已枚举的 dir 为准。
  // home 参数只影响 excludeFile；删除 tag/index 不依赖它，因而未知时用
  // false 也安全。
  function storeFromDir(dir: string, home: boolean): StoreInfo {
    return makeStore(dir, Boolean(home))
  }

  // store 级元数据 root.txt：内容为工作区绝对路径。store 目录名是 root 的
  // 单向 SHA256，反解不了——「快照管理」跨工作区展示时靠它把哈希目录映射
  // 回工作区名。best-effort（失败不阻断主流程），旧 store 在 resolveStore
  // 再次被调用（重启后首个 init/快照/管理列表）时自然补写，存量自愈。
  function persistRootHint(store: StoreInfo, root: string): void {
    writeTextViaShell(store.dir + SEP + 'root.txt', root).catch(() => {})
  }

  // 存储根：优先放 DSH home（保持项目目录干净）。shell 以宿主身份执行，
  // 受限会话（workspace-write/read-only）也能写 home；只有 home 本身不可写
  // （如 DSH_HOME 指向只读/网络盘）才降级到项目内（功能优先于干净）。
  async function resolveStore(root: string): Promise<StoreInfo> {
    const cached = state.stores.get(root)
    if (cached) return cached
    let homeDir: string | null = null
    try {
      homeDir = await homeDirFor(root)
    } catch (error) {
      homeDir = null
    }
    if (homeDir) {
      try {
        await runShell(scripts.mkdirScript(homeDir), { stdoutMaxBytes: 4096 })
        const store = makeStore(homeDir, true)
        state.stores.set(root, store)
        persistRootHint(store, root)
        return store
      } catch (error) {
        recordError('recall home store unavailable, falling back to workspace: ' + String(error))
      }
    }
    const fallback = root + SEP + '.dsh-recall-snapshots'
    await runShell(scripts.mkdirScript(fallback), { stdoutMaxBytes: 4096 })
    const store = makeStore(fallback, false)
    state.stores.set(root, store)
    persistRootHint(store, root)
    return store
  }

  // 旧版迁移：宿主身份执行前的版本在受限会话里会把影子仓库降级到项目内，
  // 这里在下一条消息快照前把它整体迁回 home 并删除项目内目录，恢复
  // 「项目目录干净」。失败节流 5 分钟，避免 home 不可写时每条消息白试。
  async function tryUpgradeToHome(root: string): Promise<StoreInfo | null> {
    const store = state.stores.get(root)
    if (!store || store.home) return store || null
    const now = Date.now()
    const last = state.homeRetryAt.get(root) || 0
    if (now - last < HOME_RETRY_MS) return store
    state.homeRetryAt.set(root, now)
    let homeDir: string | null = null
    try {
      homeDir = await homeDirFor(root)
    } catch (error) {
      homeDir = null
    }
    if (!homeDir) return store
    try {
      await runShell(scripts.mkdirScript(homeDir), { stdoutMaxBytes: 4096 })
      await runShell(scripts.migrateScript(store.dir, homeDir), { timeoutMs: 300000, stdoutMaxBytes: 4096 })
      const upgraded = makeStore(homeDir, true)
      state.stores.set(root, upgraded)
      persistRootHint(upgraded, root)
      state.gitReady.delete(store.git)
      // 旧 store 的 gc 节流凭据随之作废，清掉避免新 store 误读
      state.gcLastAt.delete(store.git)
      state.gcCount.delete(store.git)
      console.error('recall store upgraded to home:', root)
      return upgraded
    } catch (error) {
      recordError('recall home upgrade failed: ' + String(error))
      return store
    }
  }

  // 任意长度文本落盘（index.json / exclude.txt / lineage.json / root.txt
  // 共用），原子写（H2）：先写 <file>.tmp 再 rename 替换目标——写中途崩溃
  // 最多留一个无害的 .tmp 残留（下次写覆盖），绝不会留下截断 JSON。
  // PF-2：两平台统一「stdin 传全文 + 单进程落盘」（fileWriteStdinCmd，同名
  // 导出纪律）。win32 曾按 base64 20000 字符分块——每块一条 PowerShell 进程，
  // 索引几百条时 saveIndex = 6+ 条进程，而它在每条消息快照后、每次删除、
  // 每次 init 都全量重写；POSIX 的 cat > tmp 内联命令一并迁进模板。stdin
  // 不经命令行，argv 32767 上限与编码坑天然消失；pwsh 侧读取手法由探针
  // 钉死（OpenStandardInput 字节流——Console.In 在 PS 5.1 按 GBK 解码必挂，
  // 见 tests/probe/stdin-write.test.js 与 plan-performance.md 实施记录）。
  // 空内容也落一次写（清空配置/空索引是合法状态），stdin 空串照常发送。
  // rename 是同卷 O(1) 元数据操作，索引写频率为每消息一次，额外开销可忽略。
  // rename 步的 ENOENT 容忍（WSL 双实例实弹发现）：每实例写同一个
  // <file>.tmp 路径，并发时一方 rename 把 tmp 消费掉，另一方 rename 报
  // 「No such file / does not exist」。容忍是安全的，因为能走到 rename
  // 的前提是写侧（stdin 写）已完整成功——任一写步失败都在写侧直接抛
  // （POSIX set -e 对 cat 失败终止 / pwsh EAP=Stop 对 WriteAllText 抛），
  // 进不到这里；所以此刻 tmp 消失只可能是同伴先把完整内容 rename 到了
  // 目标——本侧写语义已被达成。Windows 侧「偶发一次 Move-Item:
  // index.json.tmp does not exist」即同根。不进 recordError（用户错误列表
  // 刷屏正是要消除的症状），console.error 留诊断痕迹；其余错误原样抛出。
  async function renameTmpQuietly(tmp: string, file: string): Promise<void> {
    try {
      await runShell(scripts.renameFileCmd(tmp, file), { stdoutMaxBytes: 4096 })
    } catch (error) {
      const basename = tmp.slice(tmp.lastIndexOf(SEP) + 1)
      if (isTmpConsumedError(error, basename)) {
        console.error('recall writeTextViaShell: ' + basename + ' 已被并发写者 rename 消费，视同成功')
        return
      }
      throw error
    }
  }

  async function writeTextViaShell(file: string, text: string): Promise<void> {
    const body = String(text == null ? '' : text)
    const tmp = file + '.tmp'
    await runShell(scripts.fileWriteStdinCmd(tmp), { stdin: body, stdoutMaxBytes: 4096 })
    await renameTmpQuietly(tmp, file)
  }

  // 建立影子仓库（幂等：gitReady 命中后直接跳过，省掉每条消息一次的
  // config/exclude 重写）。同时回读 gc.stamp 种子化 gc 节流：让「上次 gc
  // 时间」跨重启续存，避免天天重启的机器每开机都来一次全量 gc。
  // 返回 {ok, error}（M1-D2）：失败原因必须传出——captureSnapshot 要把它
  // 分类成 snapFeedback 的可行动提示（此前吞成布尔，客户端空轮询 20 次、
  // 用户零感知，issue #11 主线缺口）；init/预热调用方忽略返回值，不受形状
  // 变化影响。
  async function ensureGit(root: string, store: StoreInfo): Promise<{ ok: boolean; error?: string }> {
    if (state.gitReady.has(store.git)) return { ok: true }
    const gitExe = await resolveGit()
    if (!gitExe) {
      // git 缺失分支：原先静默 return false，连 recordError 都没有（用户
      // 重启也查不到原因的盲区）。进错误环靠上方尾部去重天然免刷屏。
      const error = '未检测到 git CLI，快照不可用'
      recordError('recall ensureGit: ' + error + '：请安装 git 或检查其是否在 PATH 中')
      return { ok: false, error }
    }
    try {
      const out = scripts.stripBom(await runShell(scripts.ensureGitScript(store, gitExe, config.baseExcludes), { stdoutMaxBytes: 4096 }))
      state.gitReady.add(store.git)
      const m = out.match(/GIT_OK\s+(\d+)/)
      state.gcLastAt.set(store.git, m ? parseInt(m[1], 10) * 1000 : Date.now())
      return { ok: true }
    } catch (error) {
      recordError('recall ensureGit failed: ' + String(error))
      return { ok: false, error: String(error) }
    }
  }

  // 迁移收尾：删除旧版 blobs 格式的项目内 .dsh-recall-snapshots 目录，
  // 仅在 home 存储可用时执行——降级场景下该目录就是新 store，不能删。
  // PF-5 顺带：legacyCleaned 内存标记——该目录只存在于极早期版本用户的
  // 降级工作区，探测成功一次后不可能再出现，同 root 多次 init 只付一条
  // 进程；失败（环境性）也标记不重试：残留只占磁盘无功能影响，重置场景
  // （DSH 重启）每进程一次可接受（文档 PF-5 顺带节的取舍）。
  // pwsh 侧 legacyRmScript 已加 -ErrorAction SilentlyContinue：「目录本就
  // 不存在」（常态）不再抛错中断，而是以成功返回被标记——否则常态下每次
  // init 都白跑一条进程，标记就失去了意义。
  const legacyCleaned = new Set<string>()
  function cleanupLegacy(root: string): void {
    const store = state.stores.get(root)
    if (!store || !store.home) return
    if (legacyCleaned.has(root)) return
    legacyCleaned.add(root)
    runShell(scripts.legacyRmScript(root + SEP + '.dsh-recall-snapshots'), { timeoutMs: 120000, stdoutMaxBytes: 4096 }).catch(() => {})
  }

  return { state, isWin, scripts, recordError, runShell, runShellMeta, writeTextViaShell, resolveRoot, resolveGit, homeDirFor, resolveHomeContainer, resolveStore, storeFromDir, tryUpgradeToHome, ensureGit, cleanupLegacy, cleanupAfterGitFailure }
}
