/**
 * dsh-recall-plugin — P2-5 dsh 版本巡检脚本（本地/发布前动作，不进 CI）
 *
 * 为什么做：dsh 迭代快，插件 peer 范围与 docs/reference/ 官方文档镜像都可能和
 * 运行环境漂移，且漂移是静默的——升级 dsh 后插件照常加载，直到字段假设
 * 违反才炸（AGENTS.md 合规清单 #8 的教训）。脚本做三层比对，把「按
 * AGENTS.md 漂移控制节重拉镜像、过合规清单」从记忆义务变成可执行哨兵：
 *
 *   1. 本地已装 dsh 版本 vs docs/reference/README.md「归档 dsh 版本」——镜像
 *      漂移哨兵（重拉镜像后该字段必须同步更新，见 docs/reference/README.md）；
 *   2. 本地已装 dsh 版本 vs docs/dsh-contract.md「对应版本」——契约文档
 *      漂移哨兵（升级后契约文档未同步即此处报红，逼人按文档第七节重核）；
 *   3. npm 最新 @deepseek-ai/dsh 版本 vs package.json peerDependencies
 *      范围——peer 兼容性提醒（最新版越界即该扩范围/重核验）；
 *   4. npm 最新 vs 本地已装——提示有新版可升（升级后镜像基准自然漂移，
 *      由第 1 层在下次运行捕获）。
 *
 * 一致时安静退出（exit 0，一行确认）；任一差异输出 ✓/⚠/✗ 行并 exit 1。
 * 纯函数全部导出供 vitest 单测（tests/unit/check-dsh-version.test.js），
 * 避免"巡检脚本自身逻辑无测试"的二次漂移。环境变量 DSH_CHECK_LOCAL /
 * DSH_CHECK_MIRROR / DSH_CHECK_CONTRACT / DSH_CHECK_LATEST 可覆盖对应输入
 * （演示/测试用，见脚本头注释），不修改任何文件。
 *
 * 范围解析只支持本项目 peer 实际使用的 `^x.y.z[-pre]`、`~x.y.z[-pre]` 与
 * 精确 `x.y.z[-pre]` 三种形态（package.json 现状全为 ^）；遇到不认识的范围
 * 输出警告并跳过该项（fail-open——提醒脚本宁可漏报也不该因解析器抛错
 * 挡住主流程）。不引入 semver 依赖：脚本不进 CI、形态单一，自实现约 40 行
 * 且有单测钉住语义，保持 devDependencies 只有 vitest。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---- 版本解析与比较（纯函数，单测直接钉） ----

/**
 * 解析 x.y.z[-pre] 版本字符串；pre 形如 rc.2 / alpha.1.beta。
 * 返回 {major, minor, patch, pre}，pre 为 null 表示正式版；非法输入返回 null。
 * 为何自己解析而非依赖 semver：仅需比较与 ^/~ 区间判定，语义子集很小，
 * 且 prerelease 需要特殊处理（正式版 > 同序号的 prerelease）。
 */
export function parseVersion(str) {
  if (typeof str !== 'string') return null
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z][0-9A-Za-z.-]*))?$/.exec(str.trim())
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] || null }
}

/**
 * prerelease 标识符分段比较：数字段按数值、非数字段按字典序、数字 < 非数字
 * （npm semver 规则：数字标识符排在非数字之前）。a 前于 b 返回负数。
 */
function comparePre(a, b) {
  if (a === b) return 0
  if (a === null) return 1 // 无 prerelease 的版本更大
  if (b === null) return -1
  const pa = String(a).split('.')
  const pb = String(b).split('.')
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = pa[i]
    const y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      if (Number(x) !== Number(y)) return Number(x) - Number(y)
    } else if (xn !== yn) {
      return xn ? -1 : 1 // 数字段 < 非数字段
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** 比较两个已解析版本，a < b 返回负数，a === b 返回 0。 */
export function compareVersions(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  return comparePre(a.pre, b.pre)
}

/**
 * 解析 ^ / ~ / 精确三种范围形态，返回 {op, base}；base 为已解析版本。
 * 其他形态（>=、||、通配等）返回 null——调用方输出警告并跳过该项。
 */
export function parseRange(range) {
  if (typeof range !== 'string') return null
  const text = range.trim()
  const m = /^([~^])?\s*v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z][0-9A-Za-z.-]*))?$/.exec(text)
  if (!m) return null
  const base = { major: Number(m[2]), minor: Number(m[3]), patch: Number(m[4]), pre: m[5] || null }
  return { op: m[1] || '=', base }
}

/**
 * 版本是否落在范围内；范围无法解析时返回 null（fail-open）。
 * ^ 语义按 npm：主版本 >0 时锁定主版本，0.x 线锁定次版本（^0.1.1 → <0.2.0），
 * ^0.0.x 锁定补丁——与本项目 peer 全为 ^0.1.1-rc.2 的现状一致。
 */
export function satisfiesRange(version, range) {
  const parsed = typeof version === 'string' ? parseVersion(version) : version
  const r = parseRange(range)
  if (!parsed || !r) return null
  const { op, base } = r
  if (compareVersions(parsed, base) < 0) return false
  if (op === '=') return compareVersions(parsed, base) === 0
  let upper
  if (op === '~') {
    upper = { major: base.major, minor: base.minor + 1, patch: 0, pre: null }
  } else { // ^
    if (base.major > 0) upper = { major: base.major + 1, minor: 0, patch: 0, pre: null }
    else if (base.minor > 0) upper = { major: 0, minor: base.minor + 1, patch: 0, pre: null }
    else upper = { major: 0, minor: 0, patch: base.patch + 1, pre: null }
  }
  return compareVersions(parsed, upper) < 0
}

// ---- 环境探测（文件系统 / npm 子进程） ----

/** win32 上 npm 是 .cmd 批处理，直接 execFile 会 ENOENT——复用 package-layout
 * 测试同款手法：探测 npm-cli.js 用 node 直跑，失败再 shell 回退。 */
function runNpm(args, timeoutMs) {
  let cmd = 'npm'
  let argv = args
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ]
    const cli = candidates.find((c) => fs.existsSync(c))
    if (cli) { cmd = process.execPath; argv = [cli, ...args] }
  }
  try {
    const out = execFileSync(cmd, argv, { encoding: 'utf8', timeout: timeoutMs || 15000, shell: cmd === 'npm' })
    return out.trim()
  } catch {
    return null
  }
}

/** npm 全局安装根：优先问 npm 自己（跨平台最准），失败回退平台默认目录。
 * 结果按进程缓存（buildPeers 会对每个 peer 重复探测，npm 子进程约百毫秒级，
 * 不缓存会让巡检变慢且无意义地重复询问）。 */
let cachedGlobalRoot
export function npmGlobalRoot() {
  if (cachedGlobalRoot !== undefined) return cachedGlobalRoot
  let result = null
  const asked = runNpm(['root', '-g'], 8000)
  if (asked && fs.existsSync(asked)) result = asked
  else if (process.platform === 'win32') {
    const defaults = [
      process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules'),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs', 'node_modules'),
    ].filter(Boolean)
    result = defaults.find((d) => fs.existsSync(d)) || null
  } else {
    const defaults = ['/usr/lib/node_modules', '/usr/local/lib/node_modules']
    result = defaults.find((d) => fs.existsSync(d)) || null
  }
  cachedGlobalRoot = result
  return result
}

/** 本机 profile 树（~/.dsh/profiles/<名称>/node_modules）：插件实际运行
 * 环境，peer 子包可能只装在这里（link 模式更是在工作区而非全局树）。 */
export function profileRoots() {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir()
  const dir = path.join(home, '.dsh', 'profiles')
  if (!fs.existsSync(dir)) return []
  try {
    return fs.readdirSync(dir)
      .map((p) => path.join(dir, p, 'node_modules'))
      .filter((d) => fs.existsSync(d))
  } catch {
    return []
  }
}

/** 在候选安装树里找 @deepseek-ai/<name> 的已装版本；找不到返回 null
 * （best-effort——peer 包没装全局很正常，不报错只跳过）。 */
export function findPackageVersion(pkgName) {
  const globalRoot = npmGlobalRoot()
  const roots = new Set([
    ...profileRoots(),
    globalRoot && path.join(globalRoot, '@deepseek-ai', 'dsh', 'node_modules'),
    globalRoot,
  ].filter(Boolean))
  for (const root of roots) {
    const file = path.join(root, pkgName, 'package.json')
    if (!fs.existsSync(file)) continue
    try {
      const version = JSON.parse(fs.readFileSync(file, 'utf8')).version
      if (typeof version === 'string' && version) return version
    } catch { /* 损坏的 package.json 当未找到，继续探测下一个根 */ }
  }
  return null
}

/** 本地已装 dsh 主包版本（@deepseek-ai/dsh），找不到返回 null。 */
export function findDshVersion() {
  return findPackageVersion('@deepseek-ai/dsh')
}

/** npm 最新 @deepseek-ai/dsh 版本；离线/失败返回 null（调用方降级注明）。 */
export function fetchLatestDshVersion() {
  const out = runNpm(['view', '@deepseek-ai/dsh', 'version', '--json'], 15000)
  if (!out) return null
  try {
    const parsed = JSON.parse(out)
    return typeof parsed === 'string' && parsed ? parsed : null
  } catch {
    return null
  }
}

/** 从 docs/reference/README.md 头部文本提取「归档 dsh 版本：x.y.z」；字段缺失
 * 返回 null。纯函数（单测直接钉）；readMirrorVersion 负责读文件后复用。
 * 为何读 README 而非建独立文件：重拉镜像本来就要更新 README 头（归档日期），
 * 版本字段跟着它走，单一更新点、不会被忘。 */
export function parseMirrorVersion(text) {
  if (typeof text !== 'string') return null
  const m = /归档\s*dsh\s*版本[:：]\s*([0-9][0-9A-Za-z.\-]*)/.exec(text)
  return m ? m[1] : null
}

/** 读 docs/reference/README.md 并提取归档 dsh 版本；文件不存在/读取失败返回 null
 * （CI 等无 docs/reference/ 镜像的环境自然降级，由巡检提示补写字段）。 */
export function readMirrorVersion() {
  const file = path.join(ROOT, 'docs', 'reference', 'README.md')
  if (!fs.existsSync(file)) return null
  try {
    return parseMirrorVersion(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** 从 docs/dsh-contract.md 头部文本提取「对应版本：dsh x.y.z」；字段缺失
 * 返回 null。纯函数（单测直接钉）；readContractVersion 负责读文件后复用。
 * 为何放头部：契约文档第七节把版本重核写成了「升级后必做」，但缺一个可执行
 * 哨兵——头部版本字段停在旧版时下文随手改、没人发现。版本字段跟着契约文档
 * 修订走，单一更新点，check:dsh 捕获漂移后逼人按第七节流程重核。 */
export function parseContractVersion(text) {
  if (typeof text !== 'string') return null
  const m = /对应版本[:：]\s*[*]*\s*dsh\s*(v?\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?)/.exec(text)
  return m ? m[1] : null
}

/** 读 docs/dsh-contract.md 并提取「对应版本」；文件不存在/读取失败返回 null
 * （文档尚未创建的早期形态自然降级，由巡检提示补写字段）。 */
export function readContractVersion() {
  const file = path.join(ROOT, 'docs', 'dsh-contract.md')
  if (!fs.existsSync(file)) return null
  try {
    return parseContractVersion(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// ---- 报告组装（纯函数，单测直接钉） ----

/**
 * 组装巡检报告。peers 元素：{name, range, installed}（installed 可为 null）。
 * 返回 {ok, lines, exitCode}——ok=false 时 exitCode=1（提醒可见/可接脚本）。
 */
export function buildReport({ local, mirror, contract, latest, peers }) {
  const lines = []
  let ok = true
  lines.push('[dsh-recall-plugin] dsh 版本巡检（npm run check:dsh）')

  if (local) {
    lines.push(`  ✓ 本地已装 dsh: ${local}`)
  } else {
    lines.push('  ✗ 未找到本地已装 dsh（@deepseek-ai/dsh），无法做漂移比对')
    ok = false
  }

  if (mirror) {
    if (local && local !== mirror) {
      lines.push(`  ⚠ 镜像漂移: 本地 dsh ${local} ≠ reference 记录 ${mirror}`)
      lines.push('      → 按 AGENTS.md 漂移控制节重拉 docs/reference/ 镜像、同步合规清单与已知坑、跑 npm run test:probe')
      ok = false
    } else if (local) {
      lines.push(`  ✓ reference 镜像记录: ${mirror}（漂移一致）`)
    } else {
      // 本地 dsh 未找到时也要展示镜像记录，否则 mirror 行静默消失、
      // 用户看不到比对基准是什么
      lines.push(`  ✓ reference 镜像记录: ${mirror}（本地 dsh 未找到，无法比对漂移）`)
    }
  } else {
    lines.push('  ⚠ docs/reference/README.md 未记录「归档 dsh 版本」字段（重拉镜像后请补写）')
    ok = false
  }

  if (contract) {
    if (local && local !== contract) {
      lines.push(`  ⚠ 契约文档漂移: 本地 dsh ${local} ≠ dsh-contract.md 记录 ${contract}`)
      lines.push('      → 按 docs/dsh-contract.md 第七节指引重核契约（类型源 diff 核对法），同步「对应版本」字段')
      ok = false
    } else if (local) {
      lines.push(`  ✓ docs/dsh-contract.md 记录: ${contract}（与本地 dsh 一致）`)
    } else {
      // 本地 dsh 未找到时也要展示契约记录，否则 contract 行静默消失、
      // 用户看不到比对基准是什么（与 mirror 分支同款取舍）
      lines.push(`  ✓ docs/dsh-contract.md 记录: ${contract}（本地 dsh 未找到，无法比对漂移）`)
    }
  } else {
    lines.push('  ⚠ docs/dsh-contract.md 未记录「对应版本」字段（升级后请按第七节补写）')
    ok = false
  }

  for (const peer of peers || []) {
    const r = parseRange(peer.range)
    if (!r) {
      lines.push(`  ⚠ ${peer.name} 范围 ${peer.range} 无法解析（脚本只认 ^ / ~ / 精确），请人工核验`)
      continue
    }
    const installedOk = peer.installed == null ? null : satisfiesRange(peer.installed, peer.range)
    // npm 最新 dsh 版本只能代表 dsh 版本线（@deepseek-ai/dsh-* 子包与主包
    // 同步发版）；cordis / schemastery 是独立版本线，其 peer 范围不能用
    // dsh 主包版本号比对（否则 ^4.0.1 / ^3.18.1 永远误报越界），只做本地
    // 实装校验。react 在 buildPeers 已按 @deepseek-ai/ 前缀过滤，不在此列。
    const latestOk = !latest || !peer.name.startsWith('@deepseek-ai/dsh-')
      ? null
      : satisfiesRange(latest, peer.range)
    // 实装版本字符串无法解析（坏包等异常环境）：显式警告而不是静默落入
    // 下方 else 分支误报「在范围内」——版本巡检的信任前提是版本号可解析。
    if (peer.installed != null && installedOk === null) {
      lines.push(`  ⚠ ${peer.name} 本地实装版本 ${peer.installed} 无法解析，跳过该校验`)
      continue
    }
    if (installedOk === false) {
      lines.push(`  ✗ ${peer.name} 本地已装 ${peer.installed} 不在 peer 范围 ${peer.range} 内`)
      ok = false
    } else if (latestOk === false) {
      lines.push(`  ✗ ${peer.name} peer 范围 ${peer.range} 不覆盖 npm 最新 dsh ${latest}`)
      lines.push('      → 按 AGENTS.md「发布前重点复核」扩 peer 范围或核验兼容性（新功能 bump minor）')
      ok = false
    } else if (peer.installed == null) {
      lines.push(`  ✓ ${peer.name}: ${peer.range}（本地未装于全局/profile 树，跳过实装校验）`)
    } else {
      lines.push(`  ✓ ${peer.name}: ${peer.range}（本地 ${peer.installed} 在范围内）`)
    }
  }

  if (latest) {
    // 解析失败（npm view 返回异常值）时按无新版本处理并另起警告，不崩脚本
    const pvLatest = parseVersion(latest)
    const pvLocal = local ? parseVersion(local) : null
    const cmp = pvLatest && pvLocal ? compareVersions(pvLatest, pvLocal) : 0
    if (!pvLatest) {
      lines.push(`  ⚠ npm 返回的版本 ${latest} 无法解析，跳过新版本比对`)
    } else if (cmp > 0) {
      lines.push(`  ⚠ npm 最新 dsh ${latest} > 本地 ${local}：升级后请重跑本脚本并重拉 docs/reference/ 镜像`)
    } else {
      lines.push(`  ✓ npm 最新 dsh: ${latest}（无新版本）`)
    }
  } else {
    lines.push('  ⚠ 无法获取 npm 最新 dsh（离线？）——peer 越界检查降级为仅本地实装比对')
  }

  lines.push(ok ? '  ✔ 全部一致' : '  ✘ 发现差异，请按上方提示处理')
  return { ok, lines, exitCode: ok ? 0 : 1 }
}

/** 从 package.json 收集 @deepseek-ai/* peerDependencies 及本地实装版本。 */
export function buildPeers() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const peers = pkg.peerDependencies || {}
  return Object.keys(peers)
    .filter((name) => name.startsWith('@deepseek-ai/'))
    .map((name) => ({ name, range: peers[name], installed: findPackageVersion(name) }))
}

export function main() {
  // env 覆盖是给演示/测试用的注入点（文档见文件头），不写回任何文件
  const local = process.env.DSH_CHECK_LOCAL || findDshVersion()
  const mirror = process.env.DSH_CHECK_MIRROR || readMirrorVersion()
  const contract = process.env.DSH_CHECK_CONTRACT || readContractVersion()
  const latest = process.env.DSH_CHECK_LATEST || fetchLatestDshVersion()
  const peers = buildPeers()
  const { lines, exitCode } = buildReport({ local, mirror, contract, latest, peers })
  for (const line of lines) console.log(line)
  process.exitCode = exitCode
}

// CLI 入口判定：vitest import 本模块时 process.argv[1] 是 vitest 自身，不会触发
const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isCli) main()
