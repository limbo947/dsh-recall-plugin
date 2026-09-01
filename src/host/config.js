/**
 * dsh-recall-plugin — 配置域（ctx 绑定的工厂，无模块级副作用）
 *
 * 三层配置解析（官方 settings 模型，见 dsh-settings README）：
 *   schema 默认值（Config）→ 组合 base（cordis.patch.yml insert 行 config
 *   键）→ 用户文档（设置页「插件配置」卡片写入，dsh-settings 持久化）。
 * 环境变量 DSH_RECALL_GC_SNAPS / DSH_RECALL_GC_HOURS 保留为最高优先级
 * 覆盖：已用它们调档的用户（含冒烟测试脚本）升级后行为不漂移；设了 env
 * 的字段在设置卡片里锁定不可编辑。
 *
 * Config 同时承担两个角色：cordis 入口配置校验（index.js re-export 给
 * 加载器，非法配置在插件加载时响亮失败）与 settings namespace
 * 「dsh-recall」的注册 schema（installSettingsSection，见 index.js）。
 */

import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  gcSnaps: Schema.number().default(50).description('每积累多少条快照触发一次 git gc'),
  gcHours: Schema.number().default(24).description('距上次 gc 超过多少小时触发（与条数先到先触发）'),
  maxFileBytes: Schema.number().default(104857600).description('超过该字节数的文件不进快照、不被回退触碰'),
  maxSnapshotsPerWorkspace: Schema.number().default(500).description('每个工作区保留的最大快照数，超限删除最旧的'),
  // 排除表必须同时覆盖两种存储目录名：降级存储是项目内 .dsh-recall-snapshots/，
  // 而 home 存储目录名是 dsh-recall-snapshots/（无点）——工作区 root 恰为
  // HOME 时（容器 root=/root 等）它落在工作区内，漏排除会让 git add -A
  // 把影子仓库自己吞进去、快照全部失败（issue #6）
  baseExcludes: Schema.array(Schema.string()).default(['.git', 'node_modules/', '.dsh-recall-snapshots/', 'dsh-recall-snapshots/']).description('基础排除表（gitignore 语法，优先级低于 exclude.txt）'),
  refillDraft: Schema.boolean().default(true).description('撤回后把被撤回的消息文本回填到输入框'),
  snapshotEnabled: Schema.boolean().default(true).description('启用消息快照（关闭后不再新建，已有快照仍可撤回）'),
  archiveOriginal: Schema.boolean().default(true).description('撤回后归档原会话（关闭后原会话保留在列表中）'),
  retentionDays: Schema.number().default(0).description('按天数保留快照，超期自动删除；0 表示不启用'),
})

// schema 默认值的运行时镜像：settings 服务未组装时 createConfig 直接以
// 入口 config 解析，这组兜底与 Config 保持一致（改默认值两处同步改）。
// DEFAULTS 同时供 config-reset 降级路径（settings.replace 不可用时的兜底，
// 见 index.js config-reset 端点）——默认值只此一份，避免重置与 schema 漂移。
const BASE_EXCLUDES = ['.git', 'node_modules/', '.dsh-recall-snapshots/', 'dsh-recall-snapshots/']

export const DEFAULTS = {
  gcSnaps: 50,
  gcHours: 24,
  maxFileBytes: 104857600,
  maxSnapshotsPerWorkspace: 500,
  baseExcludes: BASE_EXCLUDES,
  refillDraft: true,
  snapshotEnabled: true,
  archiveOriginal: true,
  retentionDays: 0,
}

export function createConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {}

  function pickNumber(value, fallback, min) {
    const n = typeof value === 'number' ? value : parseInt(String(value == null ? '' : value), 10)
    if (!Number.isFinite(n) || n < min) return fallback
    return n
  }

  // 环境变量优先（向后兼容），其次 config，最后默认值
  const gcSnaps = pickNumber(process.env.DSH_RECALL_GC_SNAPS, pickNumber(cfg.gcSnaps, 50, 1), 1)
  const gcHours = pickNumber(process.env.DSH_RECALL_GC_HOURS, pickNumber(cfg.gcHours, 24, 1), 1)
  const maxFileBytes = pickNumber(cfg.maxFileBytes, 104857600, 1024)
  // 每工作区快照上限：0 或负值语义 = 不限制（给想全保留的用户出口）；
  // 非数值回退默认 500。默认 500 ≈ 重度使用一周量级，太小会静默丢历史
  // 撤回点，太大失去防膨胀意义。
  const rawMax = typeof cfg.maxSnapshotsPerWorkspace === 'number'
    ? cfg.maxSnapshotsPerWorkspace
    : parseInt(String(cfg.maxSnapshotsPerWorkspace == null ? '' : cfg.maxSnapshotsPerWorkspace), 10)
  const maxSnapshotsPerWorkspace = Number.isFinite(rawMax) ? Math.max(0, rawMax) : 500

  const baseExcludes = Array.isArray(cfg.baseExcludes) && cfg.baseExcludes.length
    ? cfg.baseExcludes.filter((p) => typeof p === 'string' && p.trim())
    : BASE_EXCLUDES

  const refillDraft = typeof cfg.refillDraft === 'boolean' ? cfg.refillDraft : true

  // 快照总开关：false 冻结「新建」（session/event 短路，见 index.js），
  // 已有快照的撤回链路不受影响——关闭只停增量，不销毁存量。
  const snapshotEnabled = typeof cfg.snapshotEnabled === 'boolean' ? cfg.snapshotEnabled : true

  // 撤回后是否归档原会话：关闭时原会话保留在侧栏（fork 新会话仍打开），
  // 供用户对照回退前后上下文；默认开（归档只是隐藏、可恢复）。
  const archiveOriginal = typeof cfg.archiveOriginal === 'boolean' ? cfg.archiveOriginal : true

  // 按时间保留（S2-3）：0 或负值 = 不启用（静默删历史撤回点必须显式
  // opt-in）；非数值回退 0。与 maxSnapshotsPerWorkspace（条数维度）并存，
  // 各自独立触发——见 maintenance.enforceRetention。
  const rawDays = typeof cfg.retentionDays === 'number'
    ? cfg.retentionDays
    : parseInt(String(cfg.retentionDays == null ? '' : cfg.retentionDays), 10)
  const retentionDays = Number.isFinite(rawDays) ? Math.max(0, rawDays) : 0

  return { gcSnaps, gcHours, maxFileBytes, maxSnapshotsPerWorkspace, baseExcludes, refillDraft, snapshotEnabled, archiveOriginal, retentionDays }
}
