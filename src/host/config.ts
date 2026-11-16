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
import type { ResolvedConfig, RawConfig, LocalePref } from '../types/config.js'

// 排除表必须同时覆盖两种存储目录名：降级存储是项目内 .dsh-recall-snapshots/，
// 而 home 存储目录名是 dsh-recall-snapshots/（无点）——工作区 root 恰为
// HOME 时（容器 root=/root 等）它落在工作区内，漏排除会让 git add -A
// 把影子仓库自己吞进去、快照全部失败（issue #6）。
// 编译产物目录与常见二进制/压缩包默认排除：快照只按 maxFileBytes 挡单个
// 大文件，挡不住 target/ 这类上万小文件、整体 GB 级的构建产物——它们既拖慢
// 每次快照的 add/遍历，也会让对象库膨胀到 GB 级（实测 3.35 GB loose）。
const BASE_EXCLUDES = [
  '.git', 'node_modules/', '.dsh-recall-snapshots/', 'dsh-recall-snapshots/',
  'target/', 'dist/', 'build/', 'out/', 'coverage/', '.next/', '.nuxt/', '.output/', '.cache/', '.gradle/',
  '*.exe', '*.dll', '*.pdb', '*.so', '*.dylib', '*.msi',
  '*.zip', '*.7z', '*.rar', '*.tar', '*.tar.gz', '*.iso',
]

// ---- dsh 0.1.7 settings 接缝（SettingsForms）适配：三个模块级纯函数 ----
// 新面只把「schema 标了 .volatile()」的字段收进可编辑表单（volatileForm 读
// schema.meta.volatile），其余字段既读不到也写不进；而 `.volatile()` 只有
// schemastery ≥3.18.3 才有（0.1.6-alpha.2 随装 3.18.2）。故必须 feature-detect
// 而不能直接调用——老 dsh 上模块加载即崩是硬失败；探不到就原样返回，meta
// 多标一个 volatile 对老版 settings 是无害的未知元数据。
export function withVolatile<T>(field: T): T {
  const schema = field as { volatile?: () => T }
  return typeof schema.volatile === 'function' ? schema.volatile() : field
}

export const Config = Schema.object({
  gcSnaps: withVolatile(Schema.number().default(50).description('每积累多少条快照触发一次 git gc')),
  gcHours: withVolatile(Schema.number().default(24).description('距上次 gc 超过多少小时触发（与条数先到先触发）')),
  maxFileBytes: withVolatile(Schema.number().default(8388608).description('超过该字节数的文件不进快照、不被回退触碰')),
  // issue #24：单文件上限挡不住「大量小文件」——下载目录 321 个 ≤100MB 文件
  // 合计 1.05GB 全部进快照。总量超限时**整体停用该工作区快照**而非截断：
  // 截断快照回退时，未纳入的文件会命中回退脚本的「当前有、目标无」删除侧。
  maxWorkspaceBytes: withVolatile(Schema.number().default(268435456).description('单工作区可纳入快照的文件总量上限，口径与 git add 一致（含 .gitignore），超过即停用该工作区快照；0 表示不限制')),
  scanBudgetMs: withVolatile(Schema.number().default(10000).description('快照前统计纳入总量的时间预算，超时即停用本次快照；0 表示不限制')),
  // issue #29：scanBudgetMs 只约束「统计阶段」，真正的耗时与写盘在 add。
  // 这条是整条快照脚本的兜底时限——慢盘或病态工作区上它才是把队列拖住的一段。
  snapshotBudgetMs: withVolatile(Schema.number().default(180000).description('单次快照的总时限（毫秒，含扫描与写入），超时即中止本次快照并记录；0 表示不限制')),
  maxSnapshotsPerWorkspace: withVolatile(Schema.number().default(500).description('每个工作区保留的最大快照数，超限删除最旧的')),
  baseExcludes: withVolatile(Schema.array(Schema.string()).default(BASE_EXCLUDES).description('基础排除表（gitignore 语法，优先级低于 exclude.txt）')),
  refillDraft: withVolatile(Schema.boolean().default(true).description('撤回后把被撤回的消息（文本与附件）回填到输入框')),
  snapshotEnabled: withVolatile(Schema.boolean().default(true).description('启用消息快照（关闭后不再新建，已有快照仍可撤回）')),
  // issue #31：超大工作区（gitignore 过滤后仍上 GB）每条消息写一次全量对象
  // 成本过高。开启后仍登记撤回记录（按钮与对话回退照常），但跳过文件快照；
  // 按条落 files:false，老条目仍可完整回退文件
  messageOnly: withVolatile(Schema.boolean().default(false).description('只回退消息：每条消息只登记撤回记录，不写文件快照（适合超大工作区）')),
  archiveOriginal: withVolatile(Schema.boolean().default(true).description('撤回后归档原会话（关闭后原会话保留在列表中）')),
  // issue #26：编辑提交后自动发出改后的文本。关闭则退化为「只回填输入框」，
  // 给「只想改稿、不立刻发」的用户留一条与撤回回填一致的出口
  editSubmitsImmediately: withVolatile(Schema.boolean().default(true).description('「编辑并重发」提交后自动发出改后的消息（关闭则只回填输入框）')),
  retentionDays: withVolatile(Schema.number().default(0).description('按天数保留快照，超期自动删除；0 表示不启用')),
  // issue #36：显式快照根。留空＝按 $DSH_HOME 派生（推荐）；沙箱下 home 彻底
  // 不可写时可指到任意可写位置。相对路径在运行时被忽略并告警（见 store.ts）。
  storeRoot: withVolatile(Schema.string().default('').description('快照存储根目录（绝对路径，留空＝$DSH_HOME 下按工作区哈希分目录）')),
  // A4：界面语言。union 三值而不是自由字符串——非法配置在加载时响亮失败
  //（合规清单 #3）；description 保持中文是 v1 明示限制：它由宿主官方设置
  // 表单在 host 侧渲染，插件无法本地化（自定义配置卡片不受影响，见 README）
  locale: withVolatile(Schema.union(['auto', 'zh', 'en'] as const).default('auto').description('界面语言：auto 跟随系统，可选 zh / en（保存后生效）')),
})

// 旧面判据（≤0.1.6 的 SettingsProvider）：配置所有权在插件——namespace 由
// installSection/register 注册，ns 是注册时给的字面量 'dsh-recall'。新面
// （0.1.7 SettingsForms）整个 Provider 被移除，两个入口都不在，ns 变成 profile
// entry id。分流与 ns 候选都用这一条判据（index.ts 同源引用，避免两处漂移）。
export function isLegacySettingsFace(settings: unknown): boolean {
  const svc = settings as { installSection?: unknown; register?: unknown } | null | undefined
  if (!svc) return false
  return typeof svc.installSection === 'function' || typeof svc.register === 'function'
}

// 旧面注册出来的 namespace 名（插件自己在 installSettingsSection / installSection /
// register 里给的字面量）。单点定义：解析回退与注册调用共用，避免两处漂移。
export const LEGACY_SETTINGS_NS = 'dsh-recall'

// settings ns 解析。两代的 ns 来源完全不同，故按面分叉：
// - 旧面（≤0.1.6）：ns 是插件注册时给的字面量（与 Loader、profile 行无关）；
// - 新面（0.1.7+）：ns = profile entry id。官方只有一条匹配式——
//   configEditor.entries() 里找 row.options.id === ns。本机实测：profile 行 id
//   是 bundle patch 的 insert 行 id（'recall'），而 entry.id 是带父 tree 前缀的
//   'include:recall'（EntryTree.sep = ':'），两者不同，故候选按 options.id →
//   全 id 排序，并先与 describe() 返回的 ns 集合求交集（唯一权威的「官方认得的
//   值」，端点期走这条）。
// 新面交集为空**不等于**不可用：describe() 跳过 fiber.state !== 2 的条目，而
// apply 期本插件自身 fiber 还在 LOADING，自己的 ns 必然不在列表里（本机实测
// apply 期 11 条 / settled 后 17 条且含自身）。此时取 options.id——官方
// write/describe 都用它寻址，对 Loader 挂载的条目是构造性正确的；真不可写会由
// 官方在端点调用时抛错，卡片可见失败而不是静默退化。
// 无 entry 又非旧面时返回 null（「ns 缺失」的诚实信号：没有任何可寻址的条目，
// 端点按 RECALL_SETTINGS_UNAVAILABLE 报逃生口提示，而不是拿猜出来的 ns 去撞
// 官方错误）。
export function resolveSettingsNs(ctx: SettingsNsContext | null | undefined, settings: unknown): string | null {
  const entry = ctx && ctx.fiber ? ctx.fiber.entry : null
  const entryIds: string[] = []
  for (const candidate of [entry && entry.options ? entry.options.id : null, entry ? entry.id : null]) {
    if (typeof candidate === 'string' && candidate && entryIds.indexOf(candidate) < 0) entryIds.push(candidate)
  }
  const known = describeNamespaces(settings)
  if (isLegacySettingsFace(settings)) {
    if (known.indexOf(LEGACY_SETTINGS_NS) >= 0) return LEGACY_SETTINGS_NS
    for (const id of entryIds) {
      if (known.indexOf(id) >= 0) return id
    }
    // 回退必须回旧面的字面量：旧面上 entry（profile 行）与 ns 无关，此刻取
    // options.id 会拿新面的键去写旧面的注册表（0.1.6 上必失败）。
    return LEGACY_SETTINGS_NS
  }
  for (const id of entryIds) {
    if (known.indexOf(id) >= 0) return id
  }
  const first = entryIds[0]
  return first !== undefined ? first : null
}

// describe() 的 ns 集合（best-effort：服务缺席/方法报错都按「无交集」处理，
// 调用方的候选回退不依赖它成功）。
function describeNamespaces(settings: unknown): string[] {
  const svc = settings as { describe?: () => unknown } | null | undefined
  if (!svc || typeof svc.describe !== 'function') return []
  try {
    const list = svc.describe()
    const out: string[] = []
    for (const row of Array.isArray(list) ? list : []) {
      const ns = row && (row as { ns?: unknown }).ns
      if (typeof ns === 'string' && ns) out.push(ns)
    }
    return out
  } catch (error) {
    // 方法报错按无交集（best-effort，调用方候选回退不依赖它成功）
    return []
  }
}

export interface SettingsNsContext {
  fiber?: { entry?: { id?: string; options?: { id?: string } } | null } | null
}

// cfg 取值收口（0.1.7 的 volatile 字段在 apply 拿到的是 Volatile<T> ref，不
// unwrap 会把 cfg.gcSnaps 读成 { get() } 对象——表现为「配置读成空」）。
// 判定用 duck-type（typeof v.get === 'function'）而不引入 cosmokit 依赖：
// package.json 无 dependencies、host 构建 bundle:false 裸 import 逐字透传，
// 新增运行时依赖要赌宿主提升；Volatile 形状是 frozen 的 { get() }（cosmokit
// createVolatile），duck-type 足够且零依赖。
// 解一层即止：9 个字段的 volatile 都标在字段节点上（baseExcludes 标在数组节点，
// 取出来就是字符串数组），不再向下递归——多层递归会把用户数据里的同形对象
// { get() {...} } 误判成 ref 并吞掉。
export function unwrapConfig(raw: unknown): RawConfig {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(source)) out[key] = unwrapOnce(source[key])
  return out as RawConfig
}

function unwrapOnce(value: unknown): unknown {
  if (isVolatileRef(value)) return (value as { get(): unknown }).get()
  if (Array.isArray(value)) return value.map((item) => (isVolatileRef(item) ? (item as { get(): unknown }).get() : item))
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    const entries = value as Record<string, unknown>
    for (const key of Object.keys(entries)) {
      const item = entries[key]
      out[key] = isVolatileRef(item) ? (item as { get(): unknown }).get() : item
    }
    return out
  }
  return value
}

function isVolatileRef(value: unknown): boolean {
  return Boolean(value) && typeof (value as { get?: unknown }).get === 'function'
}

function isPlainObject(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// schema 默认值的运行时镜像：settings 服务未组装时 createConfig 直接以
// 入口 config 解析，这组兜底与 Config 保持一致。以 ResolvedConfig 标注钉住
// 形状——schema 增删字段时 ResolvedConfig（types/config.ts）同步改，漏改
// DEFAULTS 编译期报错（消灭「改默认值两处同步改」的人工同步面）。
// DEFAULTS 同时供 config-reset 降级路径（settings.replace 不可用时的兜底，
// 见 index.js config-reset 端点）——默认值只此一份（BASE_EXCLUDES 同时供
// schema default 引用），避免重置与 schema 漂移。
export const DEFAULTS: ResolvedConfig = {
  gcSnaps: 50,
  gcHours: 24,
  maxFileBytes: 8388608,
  maxWorkspaceBytes: 268435456,
  scanBudgetMs: 10000,
  snapshotBudgetMs: 180000,
  maxSnapshotsPerWorkspace: 500,
  baseExcludes: BASE_EXCLUDES,
  refillDraft: true,
  snapshotEnabled: true,
  messageOnly: false,
  archiveOriginal: true,
  editSubmitsImmediately: true,
  retentionDays: 0,
  locale: 'auto',
  storeRoot: '',
}

export function createConfig(raw: RawConfig): ResolvedConfig {
  const cfg: RawConfig = raw && typeof raw === 'object' ? raw : {}

  function pickNumber(value: unknown, fallback: number, min: number): number {
    const n = typeof value === 'number' ? value : parseInt(String(value == null ? '' : value), 10)
    if (!Number.isFinite(n) || n < min) return fallback
    return n
  }

  // 环境变量优先（向后兼容），其次 config，最后默认值
  const gcSnaps = pickNumber(process.env.DSH_RECALL_GC_SNAPS, pickNumber(cfg.gcSnaps, 50, 1), 1)
  const gcHours = pickNumber(process.env.DSH_RECALL_GC_HOURS, pickNumber(cfg.gcHours, 24, 1), 1)
  const maxFileBytes = pickNumber(cfg.maxFileBytes, 8388608, 1024)
  // 0 = 不限制（issue #24 的逃生口）；非数值/负数按非法回退默认——护栏是
  // 安全机制，误输入负数不该把护栏关掉（显式关闭只认 0）。
  const maxWorkspaceBytes = pickNumber(cfg.maxWorkspaceBytes, 268435456, 0)
  const scanBudgetMs = pickNumber(cfg.scanBudgetMs, 10000, 0)
  // issue #29：整条快照的兜底时限；0 = 不限制（消费侧映射为 24h）
  const snapshotBudgetMs = pickNumber(cfg.snapshotBudgetMs, 180000, 0)
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

  // issue #31：只登记消息撤回记录，不写文件快照。与 snapshotEnabled 叠加：
  // 前者关＝连记录都不建，本项只决定「登记时写不写文件树」
  const messageOnly = cfg.messageOnly === true

  // 撤回后是否归档原会话：关闭时原会话保留在侧栏（fork 新会话仍打开），
  // 供用户对照回退前后上下文；默认开（归档只是隐藏、可恢复）。
  const archiveOriginal = typeof cfg.archiveOriginal === 'boolean' ? cfg.archiveOriginal : true

  // 编辑提交后是否自动发出（issue #26）：仅显式 false 关闭，缺失/非法回 true——
  // 默认行为必须是「改完即发」，否则该入口相对撤回没有增量价值
  const editSubmitsImmediately = cfg.editSubmitsImmediately !== false

  // 按时间保留（S2-3）：0 或负值 = 不启用（静默删历史撤回点必须显式
  // opt-in）；非数值回退 0。与 maxSnapshotsPerWorkspace（条数维度）并存，
  // 各自独立触发——见 maintenance.enforceRetention。
  const rawDays = typeof cfg.retentionDays === 'number'
    ? cfg.retentionDays
    : parseInt(String(cfg.retentionDays == null ? '' : cfg.retentionDays), 10)
  const retentionDays = Number.isFinite(rawDays) ? Math.max(0, rawDays) : 0

  // 界面语言（A4）：非法/缺失一律回 auto——schema union 已在加载期拦掉非法
  // 值（响亮失败），这里只兜 env 覆盖与旧配置文档缺字段两条路径
  const locale: LocalePref = cfg.locale === 'zh' || cfg.locale === 'en' ? cfg.locale : 'auto'

  // issue #36：显式快照根。只收字符串并去尾随分隔符；是否绝对路径由 store.ts
  // 在使用点判定（这里静默保留，避免加载期把用户配置判死、连降级都跑不到）。
  // 根目录会被去成空串/裸盘符（后者是 drive-relative，使用点会判非法），故
  // 单独兜底：POSIX 的 '/' 原样保留，win32 的 'D:\' 补回分隔符。
  const storeRoot = (() => {
    const raw = typeof cfg.storeRoot === 'string' ? cfg.storeRoot.trim() : ''
    if (!raw) return ''
    // 盘根（D:\）去尾随分隔符会退化成 drive-relative 的 'D:'，必须补回分隔符
    if (/^[A-Za-z]:[\\/]*$/.test(raw)) return raw.slice(0, 2) + '\\'
    const trimmed = raw.replace(/[\\/]+$/, '')
    return trimmed || raw.slice(0, 1)
  })()

  return { gcSnaps, gcHours, maxFileBytes, maxWorkspaceBytes, scanBudgetMs, snapshotBudgetMs, maxSnapshotsPerWorkspace, baseExcludes, refillDraft, snapshotEnabled, messageOnly, archiveOriginal, editSubmitsImmediately, retentionDays, locale, storeRoot }
}
