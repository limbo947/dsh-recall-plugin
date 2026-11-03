/**
 * dsh-recall-plugin — 环境错误诊断（纯函数模块，无 ctx 依赖）
 *
 * 环境类失败（锁冲突/磁盘满/权限等）的「识别 → 可行动提示」分层，仿
 * errors.js 的机器码与人文案分层：kind 供机器分流（recordError 富集、
 * status API、未来设置页过滤），提示文本在 Host 侧生成——client 的 toast
 * 运行时读 res.error（'快照失败：' + String(res.error).slice(0, 140)），
 * Host 换 error 字段文本即生效，client 零改动。
 *
 * 文案硬约束（ motivated by issue #11：锁路径就 100+ 字符，嵌进提示必被
 * 140 截断出残句）：提示不嵌原始路径，目标 ≤120 字符、硬上限 140；完整
 * 原文（含路径）由设置页「最近错误」承载。
 */

// 环境错误分类 kind（单一事实源）：成员以 classifyEnvError 实现与
// diagnostics.test.js 断言为唯一来源。读取侧（state.errors.kind）与反馈侧
// （snapFeedback.kind）的「未分类」表达本就不同——classifyEnvError 未命中
// 返回 null、buildFeedbackError 未命中补 'unknown'——故拆两个联合，不许
// 顺手统一（若把 unknown 塞进 EnvErrorKind，ENV_HINTS 的 Record 缺键即编译
// 报错，这正是拆联合的动机）。types/payloads.ts 与 types/state.ts 从本处
// import type 引用。
export type EnvErrorKind = 'git' | 'space' | 'permission' | 'lock' | 'mkdir' | 'pathTooLong'
// workspaceLimit（issue #24）不是环境失败而是设计性停用：工作区纳入总量或
// 扫描耗时超过护栏，快照被整体跳过。单列成员让客户端能按 kind 走提示分支，
// 不污染 EnvErrorKind（后者驱动 ENV_HINTS 的 Record 完整性）。
// scanFail（issue #29）同属设计性停用：预算扫描的 ls-files 失败，规模未知
// 故本次不建快照——与「超限」分开建模，排障时不至于让人去调上限。
export type FeedbackKind = EnvErrorKind | 'unknown' | 'workspaceLimit' | 'scanFail'

// 分类模式表，按根因优先级排列（同一文本命中多类时先命中者胜——
// 如 `Unable to create '…lock': No space left on device` 同时命中 lock 与
// space，磁盘满是根因，space 必须排在 lock 前面）。模式为不区分大小写的
// 正则，覆盖 git 两平台措辞（POSIX `command not found` / win32 `not
// recognized`）与常见 errno 文本。
const ENV_PATTERNS: Array<[EnvErrorKind, RegExp[]]> = [
  // pathTooLong 排最前：它既不是 git 缺失也不是权限问题，是 Windows 的
  // MAX_PATH 硬限制（工作区根 ≥260 字符时 git 直接拒绝索引，实测 259 已
  // 报 "must be run in a work tree"）。混进其他分类只会把人引去装 git
  ['pathTooLong', [/filename too long/i, /directory name is invalid/i, /path (?:is )?too long/i]],
  ['git', [/command not found/i, /not recognized/i, /git: not found/i, /is not a git command/i]],
  ['space', [/no space left on device/i, /disk quota exceeded/i, /enospc/i]],
  ['permission', [/permission denied/i, /operation not permitted/i, /not permitted/i, /access is denied/i]],
  ['lock', [/could not lock .*file exists/i, /unable to create .*\.lock/i, /fatal: cannot lock/i]],
  ['mkdir', [/fatal: cannot mkdir .*file exists/i, /mkdir: cannot create directory/i]],
]

// kind → 可行动中文提示（buildFeedbackError 与 status 端点 hint 共用同一
// 张表，保证 toast 与设置页看到同一套文案）。值都是静态短句，不带路径。
// Record<EnvErrorKind, string> 与 EnvErrorKind 编译期互锁：漏提示即报错
// （unknown 无提示文案，不入此表）。
export const ENV_HINTS: Record<EnvErrorKind, string> = {
  git: '未检测到 git CLI 或版本过旧：请安装或升级 git，完成后自动恢复',
  space: '磁盘空间已满，快照写入失败：清理磁盘空间后自动恢复',
  permission: '快照目录无写入权限：请检查目录权限后重试',
  lock: '疑似多个 DSH 实例并发使用同一快照库：请确认只启动了一个；确认后仍失败时，按「设置 · 插件配置 · 最近错误」中的路径删除锁文件',
  mkdir: '快照存储目录被同名文件占用：处理后自动恢复',
  // 实测边界：Windows 上工作区根 ≥260 字符时 git 拒绝索引（\\?\ 前缀只救
  // 工作区内的深文件，救不了根前缀本身），插件无法绕过——只能请用户挪路径
  pathTooLong: '工作区路径超过 Windows 260 字符上限，git 无法索引：请把项目移到更短的路径后重试',
}

// 环境错误分类：命中返回 kind，未命中返回 null（未识别错误保现状回落
// 原文，误判只影响 toast 文案不影响功能）。git > space > permission >
// lock > mkdir 的表序即根因优先级，勿按字母序重排。
export function classifyEnvError(text: string): EnvErrorKind | null {
  const s = String(text || '')
  for (const [kind, patterns] of ENV_PATTERNS) {
    for (const p of patterns) {
      if (p.test(s)) return kind
    }
  }
  return null
}

// 把原始错误文本转成 snapFeedback 的失败条目字段：命中 → error 为提示
// 文案（client toast 直显）；未命中 → error 为原文截断（保 issue #7 现状）、
// kind 标记 unknown。截断统一收在这里，调用方不再各写一遍 slice。
export function buildFeedbackError(raw: unknown): { error: string; kind: FeedbackKind } {
  const text = String(raw || '')
  const kind = classifyEnvError(text)
  if (!kind) return { error: text.slice(0, 300), kind: 'unknown' }
  return { error: ENV_HINTS[kind], kind }
}
