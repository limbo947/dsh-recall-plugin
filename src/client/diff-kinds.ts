/**
 * 变更清单的 kind 单表与摘要（从 recall-node.ts 拆出）
 *
 * 拆出动机：recall-node.ts 长期贴着 800 行上限（issue #31 又要加分支），
 * 而这块是自包含的纯映射——「语义 → 词键 + 徽章类名」，与渲染和状态机无关。
 * recall-node 仍 re-export 同名符号，既有 import 路径（含单测）不变。
 */

import { zhTranslate } from './locales/index.js'
import type { Translate } from './locales/index.js'
import type { DiffCounts } from '../types/api.js'

// kind 语义单表承载（词键/徽章类名/汇总顺序）：新增 kind 时只改这一处。
// A4 起 label 换成 labelKey——文案归词典（kind.*），单表继续管「语义 → 词键
// + 类名」映射，渲染期再 t(labelKey)
export type ChangeKind = 'modified' | 'restored' | 'added'
export const KIND_INFO: Record<ChangeKind, { labelKey: string; cls: string }> = {
  modified: { labelKey: 'kind.modified', cls: 'modified' },
  restored: { labelKey: 'kind.restored', cls: 'restored' },
  added: { labelKey: 'kind.added', cls: 'added' }
}

// 计数形状与 Host 预览载荷里的 DiffCounts 是同一个契约：alias 而非另立一份，
// 免得 wire 字段增删时两处漂移（渲染侧仍用 ChangeCounts 这个名字）。
export type ChangeCounts = DiffCounts

// kind 白名单判定（A6）：计数只认 KIND_INFO 登记的三个 kind——payload 是 host
// 下发的宽松形状，未知/缺失 kind 原样跳过（不进任何计数桶）。判据派生自
// KIND_INFO 而非硬编码字面量，保住「新增 kind 只改这一处」的单表纪律。
export function isChangeKind(kind: unknown): kind is ChangeKind {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(KIND_INFO, kind)
}

export function summaryText(counts: ChangeCounts, t: Translate = zhTranslate): string {
  const parts: string[] = []
  for (const kind of Object.keys(KIND_INFO) as ChangeKind[]) {
    if (counts[kind] > 0) parts.push(t(KIND_INFO[kind].labelKey) + ' ' + counts[kind])
  }
  return parts.join(' · ')
}
