// 磁盘持久化结构与跨域共享数据形状（事实来源：src/host/snapshots.js 读写路径、
// src/host/store.js state 块、tests/unit/snapshots-persist.test.js 钉住的形状、
// src/host/dump-parse.js 解析侧）。仅类型导出。
//
// 兼容字段建模纪律：读取侧字段全部可选化——旧版本插件读新索引要忽略未知字段
// （index.json/lineage.json 的既有兼容纪律）。

// 环境错误分类 kind 单一事实源在 src/host/diagnostics.ts（M4 起）
import type { EnvErrorKind, FeedbackKind } from '../host/diagnostics.js'
export type { EnvErrorKind, FeedbackKind }

// 逐消息快照反馈（issue #7 失败可见性）：failed / skipped 互斥，用联合建模。
// 事实来源：snapshots.js setFeedback 的写入侧——`{ failed: true, ...buildFeedbackError(..) }`
// （含 kind）与 `{ skipped: parseSkipped(out) }`；feedbackFor 熔断分支还产出
// `{ failed: true, error }`（无 kind），故 error/kind 均可选。
// 读取侧（saveIndex/loadIndex/setFeedback 的 `fb.failed`/`fb.skipped` 跨成员访问）
// 依赖互补的 `?: undefined` 字段：联合判别语义不变（运行时形状与互斥不变），
// 只是让不存在于本成员的字段以 undefined 类型显式建模、读取合法。
export type SnapshotFeedback =
  | { failed: true; error?: string; kind?: FeedbackKind; skipped?: undefined }
  | { skipped: string[]; failed?: undefined; error?: undefined; kind?: undefined }

// index.json 条目（snapshots-persist.test.js 钉住）。failed 条目可无对应 tag，
// feedback 与条目共存即可（类型上不强约束）。
export interface IndexEntry {
  id: string
  time: number
  root: string
  sessionId: string
  feedback?: SnapshotFeedback
}

// lineage.json 条目（snapshots.js recordLineage 写入侧，F1 fork 撤回链）
export interface LineageEntry {
  childId: string
  parentId: string
  time?: number
}

// root.txt 内容（store 级元数据：工作区绝对路径；store 目录名是 root 的
// 单向 SHA256，反解不了，跨工作区展示靠它映射回工作区名）
export interface RootRecord {
  root: string | null
}

// exclude.txt 行结构 / exclude-get 响应的文件形状（listExcludeFiles 装配 +
// parseExcludeDump 解析侧）
export interface ExcludeFile {
  path: string
  home: boolean
  roots: string[]
  content: string
}
