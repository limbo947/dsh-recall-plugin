/**
 * dsh-recall-plugin — 执行与存储层（ctx 绑定的工厂，无模块级副作用）
 *
 * 职责：提供 runShell（宿主身份执行 + 统一编码保证）、会话根目录解析、
 * git 可执行文件探测、home/降级存储解析与迁移（真写探测，issue #36）、
 * 影子仓库初始化（ensureGit，含探测通过但写盘被拒时的一次性降级）。
 * 按 process.platform 选择脚本模板（scripts.pwsh.js / scripts.posix.js），
 * 两套模板导出同名接口，本文件用 rt.scripts 统一下发。
 * 产出共享 state（各 Map 缓存）供 snapshots.js / maintenance.js 复用；
 * 由 lib/index.js 在 apply(ctx) 里装配，插件卸载时随 Fiber 一起丢弃。
 */

import os from 'node:os'
import crypto from 'node:crypto'
import { spawn as childSpawn } from 'node:child_process'
import * as pwshScripts from './scripts.pwsh.js'
import * as posixScripts from './scripts.posix.js'
import { classifyEnvError } from './diagnostics.js'
import type { Runtime, SharedState, StoreInfo, ShellRunOptions, ErrorRecord, ShellDialect, EnsureGitResult } from '../types/state.js'
import type { PwshScripts, PosixScripts } from '../types/scripts.js'
import type { HostContext, SessionQueryEngine, ShellExecutor, ShellExecRequest, ShellRunResult } from '../types/dsh-contract.js'
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
    // 迁移探测失败不阻断启动：沿用旧位继续（已 recordError 告警）
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
  if (m) return { otherPid: parseInt(m[1] ?? '', 10), skippedFresh: false }
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

// ---- win32 直连执行通道（issue #15）----
// 官方 shell 是「提供方注册制」：一个 composition 恰好一个 ctx.shell 实现，宿主
// profile 可以在 win32 上把它配成 bash（如只启用 bash-sandbox）。此时 pwsh 模板
// 被 bash 执行，第一行编码前导即语法错误，快照从未成功、撤回按钮全死。官方
// ShellExecutor 公开面（resolve/run/start + sandboxMode）没有任何方言标识——不能
// 查询，只能行为探测；判成 bash 才改走 Node spawn 直连 powershell.exe，模板与
// 其余语义原样保留，只换执行通道。

// 探针命令：Write-Output 是 pwsh 语法，bash 下 command-not-found（exit 127）。
// 哨兵取罕见 ASCII 串防巧合命中。命令内联在本文件而不做成 scripts.pwsh.ts 新
// 导出——两套模板的「同名导出」契约（types/scripts.ts + scripts-contract 单测）
// 会因单侧新增导出而红，而探针只服务 win32 分流、不属于跨平台模板面。
export const SHELL_PROBE_SENTINEL = 'RCL_DIALECT_PROBE_9f4a2e'
export const SHELL_PROBE_COMMAND = 'Write-Output ' + SHELL_PROBE_SENTINEL

// 探针判定（模块级纯函数，单测直测）：exit 0 且回显哨兵 → pwsh；其余一律 bash
// （非零退出 / 无输出 / 未回显 / 探测 reject 折成的 null）。误判代价不对称但都低：
// 判成 pwsh 走官方通道（本就正确），判成 bash 走直连通道（pwsh 模板同样能跑）。
export function judgeShellDialect(res: ShellRunResult | null | undefined): ShellDialect {
  if (!res || res.exitCode !== 0) return 'bash'
  const text = (res.stdout && res.stdout.text) || ''
  return text.indexOf(SHELL_PROBE_SENTINEL) >= 0 ? 'pwsh' : 'bash'
}

// 凭证形状 env 名（与官方 dsh-subprocess SENSITIVE_ENV_PATTERN 同式）
const SENSITIVE_ENV = /KEY|PASSWORD|SECRET|TOKEN/i

// 显式快照根必须是绝对路径（issue #36 第三条出路）：相对路径会让 store 目录
// 随 cwd 漂移——同一工作区在两条命令里落到不同位置，快照与回退各看各的库，
// 比不配更糟。win32 认盘符与 UNC，POSIX 只认以 / 开头。
export function isAbsoluteDirPath(value: unknown, win: boolean): boolean {
  const s = String(value == null ? '' : value)
  if (!s) return false
  if (win) return /^[A-Za-z]:[\\/]/.test(s) || s.startsWith('\\\\')
  return s.startsWith('/')
}

// 工作区路径 → store 目录名（SHA256 十六进制）。win32 模板里的哈希用同一份
// UTF-8 字节，故 Node 侧算出的目录名与 shell 侧逐字节一致（storeRoot 走这里
// 时省掉一次 PowerShell 往返）。
export function hashRootPath(root: string): string {
  return crypto.createHash('sha256').update(String(root), 'utf8').digest('hex')
}

// 存储可写性探测的解析（issue #36；模块级纯函数，单测直测）：模板输出两行
// 'PROBE WRITABLE|NOWRITABLE' + 'REPO YES|NO'。缺行/截断一律按「不可写、
// 无仓库」判——误判成不可写只是降级到项目内存储（功能仍可用），误判成可写
// 则复现 issue #36 的静默失效，两者代价不对称。
export interface StoreProbe { writable: boolean; hasRepo: boolean }
export function parseStoreProbe(text: unknown): StoreProbe {
  let writable = false
  let hasRepo = false
  for (const raw of String(text == null ? '' : text).split(/\r?\n/)) {
    const line = raw.trim()
    if (line === 'PROBE WRITABLE') writable = true
    else if (line === 'REPO YES') hasRepo = true
  }
  return { writable, hasRepo }
}

// stderr 保留字节（错误消息只取尾部 1500 字符，留一个宽裕窗口避免多字节截断）
const STDERR_KEEP_BYTES = 65536

// 子进程 env 复刻官方清洗（dsh-subprocess scrubbedParentEnv + pwsh-local
// ENV_OVERRIDES）：剥掉凭证形状名与全部 DSH_*（不区分大小写——Windows 环境名
// 大小写不敏感，不等同处理会让父进程的 dsh_* 条目在子进程里读回成 $env:DSH_*），
// 再叠加 NO_COLOR/PAGER/GIT_PAGER。为什么值得：官方通道本就不把宿主凭证交给
// 子进程，直连通道原样继承就破了「安全模型不变」；而剥掉 DSH_* 后 homeDirScript
// 的 $env:DSH_HOME 分支在两通道恒为空、统一走 Node 侧传入的 envHome 字面量，
// 两条通道收敛到同一 store 根——存量快照库不会撕裂。
export function scrubChildEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(env)) {
    const value = env[key]
    if (value === undefined) continue
    if (SENSITIVE_ENV.test(key) || key.toUpperCase().indexOf('DSH_') === 0) continue
    out[key] = value
  }
  out.NO_COLOR = '1'
  out.PAGER = 'cat'
  out.GIT_PAGER = 'cat'
  return out
}

// stdout 收集（模块级纯函数，单测直测）：超 stdoutMaxBytes 保留尾部并置 truncated
// ——对齐官方 CollectedOutput 语义（F-G3：loadIndex 靠 truncated 区分「读截断」与
// 「内容损坏」，误判会把完好大索引当损坏覆盖）；恰等阈值不算截断。按字节切尾，
// 与官方一致：截断处落在多字节字符中间时由 utf8 解码兜底成替换字符。
export function collectStdout(chunks: Buffer[], maxBytes: number): { text: string; truncated: boolean } {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  if (total <= maxBytes) return { text: Buffer.concat(chunks).toString('utf8'), truncated: false }
  const all = Buffer.concat(chunks)
  return { text: all.subarray(all.length - maxBytes).toString('utf8'), truncated: true }
}

// 直连 spawn 的依赖注入面（默认 child_process.spawn）：单测以假 child 覆盖 stdin
// 字节透传与超时 kill 分支，无需真起进程，CI（ubuntu）也能覆盖全部分支。
export interface DirectChildLike {
  stdin: NodeJS.WritableStream | null
  stdout: NodeJS.ReadableStream | null
  stderr: NodeJS.ReadableStream | null
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'close', listener: (code: number | null) => void): unknown
  kill(): unknown
}
export type SpawnLike = (
  exe: string,
  argv: string[],
  options: { cwd: string; env: Record<string, string>; windowsHide: boolean }
) => DirectChildLike

export interface DirectShellRequest {
  command: string
  timeoutMs: number
  stdoutMaxBytes: number
  stdin?: string
  cwd: string
}

export interface DirectShellResult {
  text: string
  truncated: boolean
  exitCode: number | null
  stderr: string
  timedOut: boolean
}

// 直连可执行文件：PS 5.1 全平台自带（不赌 PS7 存在；插件模板本就按 5.1 兼容写，
// I14/I27 探针已钉），路径与官方 pwsh-local 的候选链末档同一处。
export function directPwshPath(env: Record<string, string | undefined>): string {
  return (env.SystemRoot || env.windir || 'C:\\Windows') + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
}

// 直连执行（模块级，spawn 由调用方注入）：四项官方语义一项不少——stdin 字节
// 透传（I27：PS 5.1 的 Console.In 按输入代码页解码，必须写原始字节）、stdout
// 截断标记、超时 kill、非零退出交回调用方走失败清扫。windowsHide：桌面端宿主是
// GUI 进程，不设会让每条快照闪一次控制台窗口。spawn 失败（如可执行文件缺失）
// reject，与官方通道「run 只对基础设施故障 reject」的语义一致。
export async function runViaSpawn(spawn: SpawnLike, req: DirectShellRequest): Promise<DirectShellResult> {
  const child = spawn(directPwshPath(process.env), ['-NoProfile', '-NonInteractive', '-Command', req.command], {
    cwd: req.cwd,
    env: scrubChildEnv(process.env),
    windowsHide: true,
  })
  return await new Promise<DirectShellResult>((resolve, reject) => {
    // 输出 sink：超预算即时丢头部（命令异常刷屏也不让宿主内存无界增长）。丢弃
    // 只在「剩余仍大于预算」时发生，故最终 total 要么是真总量（未丢过），要么
    // 大于预算（丢过）——collectStdout 的截断判定两种情形都正确。
    const sink = (maxBytes: number) => {
      const chunks: Buffer[] = []
      let total = 0
      return {
        push(chunk: unknown) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
          chunks.push(buf)
          total += buf.length
          // 头块长度落局部再判空（A6）：循环条件里的索引读取在类型层可能
          // undefined，先取头再一并校验「头存在且仍超预算」。
          while (chunks.length > 1) {
            const head = chunks[0]
            if (!head || total - head.length <= maxBytes) break
            total -= head.length
            chunks.shift()
          }
        },
        take() { return collectStdout(chunks, maxBytes) },
      }
    }
    const outSink = sink(req.stdoutMaxBytes)
    const errSink = sink(STDERR_KEEP_BYTES)
    let timedOut = false
    let settled = false
    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill() } catch (error) { /* 已退出或无权终止：交给 close 事件收口 */ }
    }, Math.max(1, req.timeoutMs))
    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const stdout = outSink.take()
      resolve({ text: stdout.text, truncated: stdout.truncated, exitCode: code, stderr: errSink.take().text, timedOut })
    }
    if (child.stdout) child.stdout.on('data', (chunk) => outSink.push(chunk))
    if (child.stderr) child.stderr.on('data', (chunk) => errSink.push(chunk))
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => finish(code === undefined ? null : code))
    if (child.stdin) {
      // 子进程已退出时的 EPIPE 不该冒成未捕获异常：写失败与否由退出码裁决
      child.stdin.on('error', () => {})
      child.stdin.end(Buffer.from(req.stdin === undefined ? '' : req.stdin, 'utf8'))
    }
  })
}

// ---- 官方执行通道的双代分流（0.1.7 shell 接缝）----
// 0.1.7 删掉了 ShellExecutor 的 run/start，改为 resolve + execute(spec) 返回
// 句柄、前台结果走 handle.result()。peer 保留 0.1.2–0.1.6 各线段（老用户仍可能
// 装），所以按**运行时方法探测**分流而非按包版本：宿主注入的是它自己的执行器
// 实例，插件 node_modules 里的 dsh-shell 版本与运行时无关。两分支共用同一 spec
// 构造与同一失败分级（result() 与 run() 的返回形状一致、失败语义一致）。
// 判据顺序先 run 后 execute：0.1.7 官方执行器已无 run，风险只在第三方执行器
// 同时提供两者时拿到旧语义——探针锚点（M3-1）绑定了这一判据，官方回退会先红。
export async function runViaExecutor(shell: ShellExecutor, spec: ShellExecRequest): Promise<ShellRunResult> {
  if (typeof shell.run === 'function') return await shell.run(spec)
  if (typeof shell.execute === 'function') {
    const handle = await shell.execute(spec)
    // result() 只在基础设施失败（spawn 未产出进程）时 reject；非零退出、超时
    // kill、abort kill 一律 resolve 并以 first-cause 标记回显（C1 语义）。
    // reject 原样上抛——与旧通道 run reject 的语义保持一致（失败分级只服务
    // resolve 出来的失败结果）。
    return await handle.result()
  }
  throw new Error('recall: ctx.shell 未提供 run 也未提供 execute，无法执行命令（dsh 执行接缝不兼容）')
}

export function createRuntime(ctx: HostContext, config: ResolvedConfig, deps?: { spawn?: SpawnLike }): Runtime {
  const shell = ctx.shell
  const sessions = ctx.sessions
  // 直连通道的 spawn（默认 Node 原生）：单测注入假 child 覆盖字节透传与超时分支
  const spawn: SpawnLike = (deps && deps.spawn) || (childSpawn as unknown as SpawnLike)

  const isWin = process.platform === 'win32'
  const SEP = isWin ? '\\' : '/'
  const scripts: PwshScripts | PosixScripts = isWin ? pwshScripts : posixScripts

  const state: SharedState = {
    roots: new Map(),
    stores: new Map(),
    snapshots: new Map(),
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
    // 空串＝按 $DSH_HOME 派生；与 config.storeRoot 比对即可发现热更
    storeBase: '',
    // win32 方言探针缓存（issue #15）：判定结果 + in-flight promise（并发首调
    // 只跑一次探针）；POSIX 不探测，两字段恒为 null
    shellDialect: null,
    shellDialectProbe: null,
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

  // 方言探针（issue #15；惰性 + 缓存 + in-flight 去重）：session/event 突发时
  // runShellMeta 会并发首调，探针本身只许跑一次。探测走独立路径（直调
  // ctx.shell.resolve/run，不经 runShellMeta）——既避免递归，也让探测失败
  // （判据本身，不是 git 失败）不触发 cleanupAfterGitFailure；不带 UTF8_PRELUDE
  // （探的是执行器方言，不是前导兼容性），30s 短超时（官方 clampTimeout 只 cap
  // 上限、不抬下限，卡住的探针不该拖住首条消息的快照）。reject 折成 null 判
  // bash：直连通道对 pwsh 模板同样兼容，误判不致命。
  function resolveShellDialect(): Promise<ShellDialect> {
    if (state.shellDialect) return Promise.resolve(state.shellDialect)
    if (!state.shellDialectProbe) {
      state.shellDialectProbe = (async () => {
        let res: ShellRunResult | null = null
        try {
          const sp = ctx.get<{ workspaceRoot?: string }>('sandboxPolicy')
          res = await runViaExecutor(shell, shell.resolve({
            command: SHELL_PROBE_COMMAND,
            timeoutMs: 30000,
            stdoutMaxBytes: 4096,
            sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: (sp && sp.workspaceRoot) || process.cwd() },
          }))
        } catch (error) {
          // 探针失败折 null → judgeShellDialect 判 bash 走直连通道（对 pwsh
          // 模板同样兼容、误判不致命，论证见上方注释）
          res = null
        }
        const dialect = judgeShellDialect(res)
        state.shellDialect = dialect
        // 一行启动期日志：冒烟验收靠它确认默认路径「从未触达 spawn 通道」，
        // 也是用户排障时唯一能看见方言判定的地方
        console.error('recall shell dialect probe: ' + dialect + (dialect === 'bash' ? '（ctx.shell 非 pwsh，改用直连 powershell.exe 通道）' : ''))
        return dialect
      })()
    }
    return state.shellDialectProbe
  }

  // 命令视角的方言（分流入口）：清扫脚本（RECALL_CLEANUP 哨兵）不触发探针、只用
  // 缓存。为什么：清扫只在一条真实命令失败后被调用——那条命令必然已跑过
  // runShellMeta 首调、方言早判定完，这里不需要再判；善后路径本已脆弱（残留锁/
  // 孤儿进程），再叠一条探测进程只会让它更重。缓存未判定时按 pwsh 走官方通道，
  // 判定责任留给后续真实命令（不在这里缓存，避免 stub/残缺执行器把假结论钉死）。
  async function shellDialectFor(command: string): Promise<ShellDialect> {
    if (command.indexOf('RECALL_CLEANUP') >= 0) return state.shellDialect || 'pwsh'
    return await resolveShellDialect()
  }

  // 失败收口（两个执行通道共用，错误形态与语义保持一致）：先 best-effort 清扫
  // （超时/失败的 git 命令可能留下孤儿进程与 stale 锁，见下方 runShellMeta 注释）
  // 再抛原始错误，清扫自身的失败不得掩盖它；stderr 截 1500 字符（设置页
  // 「最近错误」展示用）。
  async function throwShellFailure(command: string, stderr: string, exitCode: number | null | undefined): Promise<never> {
    await cleanupAfterGitFailure(command)
    const detail = String(stderr || '').trim() || ('exit ' + String(exitCode))
    throw new Error(detail.slice(0, 1500))
  }

  // 直连通道收口：保留官方四项语义（stdin 字节透传 / stdout 截断标记 / 超时
  // kill / 非零退出走失败清扫）。超时与非零退出都走 throwShellFailure——官方
  // 通道的 timeout 同样以非零结果返回并触发清扫，两条通道失败语义一致。
  async function runShellDirect(command: string, req: DirectShellRequest): Promise<{ text: string; truncated: boolean }> {
    const res = await runViaSpawn(spawn, req)
    if (res.timedOut) {
      await throwShellFailure(command, res.stderr + '\n直连 powershell.exe 超时（' + String(req.timeoutMs) + 'ms）', null)
    }
    if (res.exitCode !== 0) await throwShellFailure(command, res.stderr, res.exitCode)
    return { text: res.text, truncated: res.truncated }
  }

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
    const workspaceRoot = (sp && sp.workspaceRoot) || process.cwd()
    const timeoutMs = (opts && opts.timeoutMs) || 300000
    const stdoutMaxBytes = (opts && opts.stdoutMaxBytes) || 4194304
    // 编码前导：pwsh 侧统一 UTF-8 输出（中文机器 GBK 代码页不再乱码）；
    // bash 侧 LC_ALL=C 确定序。各模板自带，这里统一前置注入。
    const fullCommand = scripts.UTF8_PRELUDE + '\n' + command
    // 方言分流（issue #15）：win32 且 ctx.shell 是 bash 时官方通道跑不了 pwsh
    // 模板（第一行前导即语法错误），改走 spawn 直连；默认路径（ctx.shell 即
    // pwsh）与 POSIX 都不探测、不触达 spawn——这是「默认零回归」的第一性保证。
    if (isWin && (await shellDialectFor(command)) === 'bash') {
      return await runShellDirect(command, { command: fullCommand, timeoutMs, stdoutMaxBytes, cwd: workspaceRoot, stdin: opts && opts.stdin })
    }
    const spec = shell.resolve({
      command: fullCommand,
      timeoutMs,
      stdoutMaxBytes,
      // stdin 是官方 ShellExecRequest 契约字段（bash-local/pwsh 均实现），
      // POSIX 侧用它传 index.json 全文，绕开 argv 长度上限
      ...((opts && opts.stdin !== undefined) ? { stdin: opts.stdin } : {}),
      sandboxPolicy: { mode: 'danger-full-access', workspaceRoot }
    })
    const res = await runViaExecutor(shell, spec)
    if (res && res.exitCode !== 0) {
      // 失败分级：0.1.7 起 exitCode 可为 null（准备期超时 / 信号终止），旧的
      // `'exit ' + exitCode` 兜底文案对用户不可读、也命不中 diagnostics 的分类。
      // 准备期超时无法与「无输出的 abort」用 exitCode 区分，故只在无 stderr 时
      // 判超时（first-cause 标记 timedOut 在场时直接采用，它是强判据）；有
      // stderr 则按非零退出处理并回显 stderr 原文。超时文案含「超时」二字，
      // 非零退出文案含退出码，两类各自可读（验收由 M1-3 ④ 断言）。
      const stderr = (res && res.stderr && res.stderr.text) || ''
      const timedOut = res.timedOut === true || (res.exitCode === null && !String(stderr).trim())
      const detail = timedOut
        ? '命令准备期超时（' + String(timeoutMs) + 'ms，执行器未产出输出）'
        : stderr
      await throwShellFailure(command, detail, res.exitCode)
    }
    return {
      text: (res && res.stdout && res.stdout.text) || '',
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
    return m ? (m[1] ?? null) : null
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
      // 解析失败缓存空串：脚本侧 $git 回退裸 git 走 PATH，真正失败在执行时暴露
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
        // 探测失败按空串继续：三档选择退到进程 env/homedir（resolvePosixHomeBase）
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
    return base.replace(/\/+$/, '') + '/dsh-recall-snapshots/' + hashRootPath(root)
  }

  // 显式快照根（issue #36）：给了合法绝对路径就完全绕过 home 派生——沙箱可能
  // 连 $DSH_HOME 都建不出子项，而用户指定的目录通常可写。非法值（相对路径）
  // 忽略并告警：静默改道会让用户以为配置已生效，排查时反而找不到北。
  function configuredStoreBase(): string | null {
    const raw = config.storeRoot
    if (!raw) return null
    if (!isAbsoluteDirPath(raw, isWin)) {
      recordError('recall storeRoot is not an absolute path, ignored: ' + raw)
      return null
    }
    return raw
  }

  // storeRoot 热更（issue #36）：apply 期配置是就地 Object.assign 的，这里能
  // 直接读到新值；但 stores/容器缓存按 root 存的是旧基底的 store，不失效就会
  // 一直服务到下次重启（README 承诺的「保存即生效」落空）。git/gc 凭据按键
  // 存的是旧基底路径，不会再被寻址，一并清掉。
  function syncStoreBase(): void {
    const base = config.storeRoot || ''
    if (state.storeBase === base) return
    state.storeBase = base
    state.stores.clear()
    state.homeContainer = null
    state.gitReady.clear()
    state.gcLastAt.clear()
    state.gcCount.clear()
  }

  // 换根时的存量搬迁（issue #36）：新基底还没有仓库、而默认 home 位置有同
  // 工作区的 store 时整仓搬过去——不搬的话用户会以为「改了根目录，快照全没」。
  // 失败只告警并保持原位（数据留在旧库，快照管理仍看得到）。
  async function adoptHomeStore(root: string, targetDir: string): Promise<void> {
    let legacyDir: string | null = null
    try {
      legacyDir = isWin ? await homeDirForWin(root) : await homeDirForPosix(root)
    } catch (error) {
      legacyDir = null
    }
    if (!legacyDir || legacyDir === targetDir) return
    try {
      // 先确认旧目录存在：storeProbeScript 会顺手建目录，不该为了「检查」在
      // home 下留一个空壳
      const exists = scripts.stripBom(await runShell(scripts.dirExistsScript(legacyDir), { stdoutMaxBytes: 4096 })).trim() === 'YES'
      if (!exists) return
      if (!(await probeStore(legacyDir)).hasRepo) return
      await runShell(scripts.migrateScript(legacyDir, targetDir), { timeoutMs: 300000, stdoutMaxBytes: 4096 })
      recordError('recall moved existing snapshots into the configured storeRoot: ' + targetDir)
    } catch (error) {
      recordError('recall migrate to storeRoot failed (old snapshots kept in place): ' + String(error))
    }
  }

  async function homeDirFor(root: string): Promise<string | null> {
    const base = configuredStoreBase()
    if (base) {
      // 目录结构与 home 派生完全同构（<基>/dsh-recall-snapshots/<hash>）：
      // resolveHomeContainer 的 65 字符 slice 推导、dump 枚举、迁移与心跳
      // 都按这个形状工作，配了根目录不需要第二套布局
      const tail = base.endsWith(SEP) ? '' : SEP
      return base + tail + 'dsh-recall-snapshots' + SEP + hashRootPath(root)
    }
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
    syncStoreBase()
    if (state.homeContainer) return state.homeContainer
    let container = null
    try {
      const probeRoot = Array.from(state.roots.values())[0] || process.cwd()
      const homeDir = await homeDirFor(probeRoot)
      if (homeDir) container = homeDir.slice(0, homeDir.length - 65)
    } catch (error) {
      // 推导失败返回 null 且不缓存（下次调用自然重试，见函数头注释）
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
      // issue #24 快照护栏：与 maxFileBytes 同款 getter——设置页改完上限，
      // 下一次快照立即按新值判定，无需重启或重建 store 缓存
      get maxWorkspaceBytes() { return config.maxWorkspaceBytes },
      get scanBudgetMs() { return config.scanBudgetMs },
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
    // best-effort：root.txt 只是展示元数据，写失败不阻断主链（下次 resolveStore 自愈重写）
    writeTextViaShell(store.dir + SEP + 'root.txt', root).catch(() => {})
  }

  // 真写探测（issue #36）：先前的 mkdirScript 只证明「目录存在」，在 Windows
  // 沙箱拒 CREATE_CHILD 时它谎报成功，降级永不触发。探测命令自身失败按不可写
  // 处理——连探都跑不通时，后续写盘同样无法保证，降级是唯一活路。
  async function probeStore(dir: string): Promise<StoreProbe> {
    try {
      const out = scripts.stripBom(await runShell(scripts.storeProbeScript(dir), { timeoutMs: 60000, stdoutMaxBytes: 4096 }))
      return parseStoreProbe(out)
    } catch (error) {
      recordError('recall store probe failed: ' + String(error))
      return { writable: false, hasRepo: false }
    }
  }

  // 存储根：优先放 DSH home（保持项目目录干净）。可用性判据是「真的能建出
  // 子项」，不是「目录存在」——Windows 沙箱（restricted token / 低完整性）
  // 下 home 目录可能既存在又可读，却一个子项都建不出来（issue #36 实证），
  // 只有真写探测能区分。探不出可写就降级到项目内（功能优先于干净）。
  async function resolveStore(root: string): Promise<StoreInfo> {
    syncStoreBase()
    const cached = state.stores.get(root)
    if (cached) return cached
    let homeDir: string | null = null
    try {
      homeDir = await homeDirFor(root)
    } catch (error) {
      // 解析失败按「无 home」处理：直接走项目内降级 store（功能优先）
      homeDir = null
    }
    if (homeDir) {
      const probe = await probeStore(homeDir)
      if (probe.writable) {
        // 配了 storeRoot 且新基底还是空库时，把默认 home 下的同工作区快照搬来
        if (!probe.hasRepo && configuredStoreBase()) await adoptHomeStore(root, homeDir)
        const store = makeStore(homeDir, true)
        state.stores.set(root, store)
        persistRootHint(store, root)
        return store
      }
      recordError('recall home store not writable, falling back to workspace: ' + homeDir)
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
    syncStoreBase()
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
      // 解析失败按无 home：沿用降级 store，下轮重试（节流已记）
      homeDir = null
    }
    if (!homeDir) return store
    // 同一条真写探测（issue #36）：不可写就别把注定失败的迁移跑去占 5 分钟超时
    if (!(await probeStore(homeDir)).writable) {
      recordError('recall home store upgrade skipped (not writable): ' + homeDir)
      return store
    }
    try {
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
      // 迁移失败保留降级 store 继续服务；5min 节流（HOME_RETRY_MS）避免白试
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
      // ENOENT 容忍的安全论证见函数头注释（tmp 被并发写者消费 = 写语义已达成）
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

  // ensureGit 失败后的一次性降级（issue #36 兜底）：探测通过但写盘仍被拒时
  // （沙箱策略可能在两条命令之间变化，或探测命中了别的失败面）换到项目内
  // store 再试一次。只在 home store 里**连仓库都没有**时换——没有仓库就
  // 不可能有快照，换过去不丢任何可见历史；有仓库说明历史快照在这，换掉
  // 等于把它们从列表里换没，宁可按错误上抛。
  async function downgradeStore(root: string, from: StoreInfo, reason: string): Promise<StoreInfo | null> {
    if (!from.home) return null
    if ((await probeStore(from.dir)).hasRepo) {
      recordError('recall home store unwritable but holds a repo, keeping it: ' + reason)
      return null
    }
    const fallback = root + SEP + '.dsh-recall-snapshots'
    if (!(await probeStore(fallback)).writable) {
      recordError('recall workspace store not writable either: ' + fallback)
      return null
    }
    const next = makeStore(fallback, false)
    state.stores.set(root, next)
    // 旧 store 的就绪/节流凭据随它一并作废，避免新 store 误读
    state.gitReady.delete(from.git)
    state.gcLastAt.delete(from.git)
    state.gcCount.delete(from.git)
    // 旧 store 没有仓库 ⇒ 它的 tag 一个都不存在，内存里这些条目全都不可回退：
    // 清掉并重置索引缓存，让随后 loadIndex 从新 store 重读（降级到二级目录时
    // 那里可能本来就有合法条目，重读即可恢复，不丢数据）
    for (const [id, info] of state.snapshots) {
      if (info.root === root) state.snapshots.delete(id)
    }
    state.indexLoaded.delete(root)
    state.indexHealthy.delete(root)
    state.indexTruncated.delete(root)
    recordError('recall switched to workspace store (home store unwritable): ' + fallback)
    persistRootHint(next, root)
    return next
  }

  // 建立影子仓库（幂等：gitReady 命中后直接跳过，省掉每条消息一次的
  // config/exclude 重写）。同时回读 gc.stamp 种子化 gc 节流：让「上次 gc
  // 时间」跨重启续存，避免天天重启的机器每开机都来一次全量 gc。
  // 返回 {ok, error, store}（M1-D2）：失败原因必须传出——captureSnapshot 要把它
  // 分类成 snapFeedback 的可行动提示（此前吞成布尔，客户端空轮询 20 次、
  // 用户零感知，issue #11 主线缺口）。store 是本次实际生效的 store（issue #36
  // 降级后与入参不同），调用方必须改用它继续后续命令。
  async function ensureGit(root: string, store: StoreInfo, retried = false): Promise<EnsureGitResult> {
    if (state.gitReady.has(store.git)) return { ok: true, store }
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
      state.gcLastAt.set(store.git, m ? parseInt(m[1] ?? '', 10) * 1000 : Date.now())
      return { ok: true, store }
    } catch (error) {
      // 失败按未就绪返回（不抛）：已 recordError 告警，调用侧照常发命令、由命令自身报错
      recordError('recall ensureGit failed: ' + String(error))
      // issue #36：探测通过但写盘被拒（沙箱 token 只拒 CREATE_CHILD 就是这种
      // 形态），降级到项目内 store 再试一次；retried 保证只降一级、不递归。
      if (!retried) {
        const next = await downgradeStore(root, store, String(error))
        if (next) return await ensureGit(root, next, true)
      }
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
    // 清理失败不重试、不告警：残留只占磁盘无功能影响（理由见上方 legacyCleaned 注释）
  }

  return { state, isWin, scripts, recordError, runShell, runShellMeta, writeTextViaShell, resolveRoot, resolveGit, homeDirFor, resolveHomeContainer, resolveStore, storeFromDir, tryUpgradeToHome, ensureGit, cleanupLegacy, cleanupAfterGitFailure }
}
