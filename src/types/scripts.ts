// scripts 双模板契约（事实来源：src/host/scripts.pwsh.js / scripts.posix.js 导出名单
// 逐文件核实，2026-09-01；scripts-contract.test.js 的 key 集合断言为核对清单）。
// 仅类型导出。
//
// 硬约束：两套模板必须导出同名接口（单侧漏导出只会在另一平台用户机器上暴雷，
// store.js checkScriptParity 运行时兜底 + 本契约 M5 起编译期锁死 + tests/types
// satisfies 断言三重保证）。豁免集（平台专属导出）恰为：
//   pwsh 独有 homeDirScript；posix 独有 probeHomeScript / legacyHomeMigrateScript
// ——此处结构化建模为 PwshScripts/PosixScripts 各自 extends ScriptsCommon，
// 运行时兜底（store.js SKIP）、单测（scripts-contract SKIP）、类型三处共享同一份事实。

// 模板参数里的 store 形状（模板实际消费字段：dir/git/repo/excludeFile/maxFileBytes；
// 宽松可选以兼容 storeFromDir 等临时包装）
export interface ScriptStore {
  dir: string
  repo?: string
  git: string
  excludeFile?: string
  maxFileBytes?: number
}

// 哨兵/标记字面量（模板输出与解析函数逐字呼应，M5 起编译期锁死）
export type MigrateStatus = 'MIGRATE_OK' | 'OLD_ABSENT' | 'BOTH_PRESENT' | 'MIGRATE_FAIL'
export type CleanupStatus = 'CLEANUP_OTHER_INSTANCE' | 'CLEANUP_SKIPPED_FRESH_LOCK' | 'CLEANUP_DONE'
export type Sentinel =
  | 'SNAP_OK'
  | 'SNAP_SKIP'
  | 'TREE'
  | 'ROLLBACK_OK'
  | 'RESCUE_OK'
  | 'RECALL_CLEANUP'
  | CleanupStatus

// 两套模板共享的 28 个函数签名 + 5 个共享常量。
// 形参个数两侧不一时以多者为准（少参函数天然可赋值给多参类型）：diffScript
// 即此例——pwsh 6 参（maxChanges 控制 TOTAL 截断）、posix 5 参（TSV 全量输出，
// 截断由 JS 侧 slice），调用方恒传 6 参（snapshots.js MAX_CHANGES），故契约声明
// 6 参版本，两侧同时满足。
export interface ScriptsCommon {
  // ---- 常量（scripts-contract.test.js 键集含常量，类型侧缺席会让编译期
  // 断言比既有单测宽松，故一并锁定）----
  UTF8_PRELUDE: string
  MAX_FILE_BYTES: 104857600
  STALE_LOCK_MIN: 5
  HEARTBEAT_TTL_S: 900
  FIDELITY_ATTRS: string

  // ---- 工具 ----
  psq(value: string): string
  stripBom(text: string): string

  // ---- 解析/探测 ----
  resolveGitScript(): string
  mkdirScript(dir: string): string
  migrateScript(src: string, dst: string): string
  ensureGitScript(store: ScriptStore, gitExe: string, base: string[]): string
  dirExistsScript(dir: string): string
  listSubdirsScript(dir: string): string
  diskUsageScript(dir: string): string
  countObjectsScript(store: ScriptStore, gitExe: string): string
  storesDumpScript(container: string, extraDirs: string[]): string

  // ---- 快照/回退主链路 ----
  snapshotScript(root: string, store: ScriptStore, gitExe: string, messageId: string, base: string[]): string
  diffScript(root: string, store: ScriptStore, gitExe: string, tag: string, base: string[], maxChanges: number): string
  rollbackScript(root: string, store: ScriptStore, gitExe: string, tag: string, base: string[]): string
  rescueScript(root: string, store: ScriptStore, gitExe: string, tag: string): string
  listTagsScript(store: ScriptStore, gitExe: string): string
  listTagsWithTimeScript(store: ScriptStore, gitExe: string): string

  // ---- 维护/治理 ----
  gcScript(store: ScriptStore, gitExe: string): string
  pruneScript(store: ScriptStore, gitExe: string): string
  killOrphansScript(gitDir: string): string
  purgeTagsScript(store: ScriptStore, gitExe: string, tags: string[]): string
  legacyRmScript(path: string): string

  // ---- 文件/索引读写 ----
  fileWriteStdinCmd(file: string): string
  renameFileCmd(src: string, dst: string): string
  indexReadCmd(dir: string): string
  lineageReadCmd(dir: string): string
  excludeReadCmd(file: string): string
  excludeDumpScript(files: string[]): string
}

// PowerShell 模板：win32 专属 homeDirScript（$h 链在 shell 侧完成 DSH_HOME/
// USERPROFILE 解析与哈希）
export interface PwshScripts extends ScriptsCommon {
  homeDirScript(root: string, envHome: string): string
}

// bash 模板（macOS bash 3.2 兼容约束保留）：POSIX 专属 probeHomeScript（bash env
// 显式 $DSH_HOME 探测）与 legacyHomeMigrateScript（旧容器迁移，I24 漂移专属兜底）
export interface PosixScripts extends ScriptsCommon {
  probeHomeScript(): string
  legacyHomeMigrateScript(homedir: string): string
}
