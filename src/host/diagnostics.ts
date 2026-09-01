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
export type EnvErrorKind = 'git' | 'space' | 'permission' | 'lock' | 'mkdir'
export type FeedbackKind = EnvErrorKind | 'unknown'

// 分类模式表，按根因优先级排列（同一文本命中多类时先命中者胜——
// 如 `Unable to create '…lock': No space left on device` 同时命中 lock 与
// space，磁盘满是根因，space 必须排在 lock 前面）。模式为不区分大小写的
// 正则，覆盖 git 两平台措辞（POSIX `command not found` / win32 `not
// recognized`）与常见 errno 文本。
const ENV_PATTERNS: Array<[EnvErrorKind, RegExp[]]> = [
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
