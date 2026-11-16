/**
 * config.js 纯逻辑单测（P1-1）
 *
 * createConfig 依赖 @deepseek-ai/schemastery 实例化 Config schema，但
 * schemastery 是运行期 peer 依赖（本机走 junction、CI 不可得）。这里
 * vi.mock 掉 schemastery——createConfig 本身不消费 Schema，只消费原始
 * config 对象与 env，mock 后测试仍钉住真实解析逻辑。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@deepseek-ai/schemastery', () => ({
  default: {
    // 最小链式 mock：真实 schema 是 Schema.number().default(50).description(...) 的链式调用，
    // mock 只需让 object 原样返回、标量支持链式返回自身即可
    object: (obj) => obj,
    number: () => chain(),
    string: () => chain(),
    boolean: () => chain(),
    array: () => chain(),
    // A4：locale 走 Schema.union(['auto','zh','en'])——mock 补齐同名工厂方法
    union: () => chain(),
  },
}))

function chain() {
  const self = { default: () => self, description: () => self, required: () => self }
  return self
}

import { createConfig, DEFAULTS } from '../../src/host/config.js'

describe('createConfig', () => {
  const ENV_KEYS = ['DSH_RECALL_GC_SNAPS', 'DSH_RECALL_GC_HOURS']

  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k]
  })

  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k]
  })

  it('默认值：schema 默认值兜底（无 config、无 env）', () => {
    const cfg = createConfig({})
    expect(cfg).toEqual({
      gcSnaps: 50,
      gcHours: 24,
      maxFileBytes: 8388608,
      maxWorkspaceBytes: 268435456,
      scanBudgetMs: 10000,
      snapshotBudgetMs: 180000,
      maxSnapshotsPerWorkspace: 500,
      baseExcludes: expect.arrayContaining([
        '.git', 'node_modules/', '.dsh-recall-snapshots/', 'dsh-recall-snapshots/',
        'target/', 'dist/', '*.exe',
      ]),
      refillDraft: true,
      snapshotEnabled: true,
      messageOnly: false,
      archiveOriginal: true,
      editSubmitsImmediately: true,
      retentionDays: 0,
      locale: 'auto',
      storeRoot: '',
    })
  })

  it('env 优先级最高：覆盖 config 与默认值', () => {
    process.env.DSH_RECALL_GC_SNAPS = '7'
    process.env.DSH_RECALL_GC_HOURS = '3'
    const cfg = createConfig({ gcSnaps: 50, gcHours: 24 })
    expect(cfg.gcSnaps).toBe(7)
    expect(cfg.gcHours).toBe(3)
  })

  it('env 非法值回退到 config 层，config 非法回退到默认值', () => {
    process.env.DSH_RECALL_GC_SNAPS = 'abc'
    const cfg = createConfig({ gcSnaps: 10 })
    expect(cfg.gcSnaps).toBe(10)

    const cfg2 = createConfig({ gcSnaps: 'not-a-number' })
    expect(cfg2.gcSnaps).toBe(50)
  })

  it('gcSnaps/gcHours 低于下限回退', () => {
    expect(createConfig({ gcSnaps: 0 }).gcSnaps).toBe(50)
    expect(createConfig({ gcHours: -5 }).gcHours).toBe(24)
  })

  it('maxFileBytes 低于 1024 回退到默认值（issue #24 起默认 8MB）', () => {
    expect(createConfig({ maxFileBytes: 512 }).maxFileBytes).toBe(8388608)
    expect(createConfig({ maxFileBytes: 2048 }).maxFileBytes).toBe(2048)
  })

  it('maxWorkspaceBytes / scanBudgetMs：0 = 不限制，非法回退默认（issue #24）', () => {
    expect(createConfig({ maxWorkspaceBytes: 1024 }).maxWorkspaceBytes).toBe(1024)
    expect(createConfig({ maxWorkspaceBytes: 0 }).maxWorkspaceBytes).toBe(0)
    // 负数 = 非法（误输入不该把护栏关掉），回退默认上限
    expect(createConfig({ maxWorkspaceBytes: -1 }).maxWorkspaceBytes).toBe(268435456)
    expect(createConfig({ maxWorkspaceBytes: 'abc' }).maxWorkspaceBytes).toBe(268435456)
    expect(createConfig({}).maxWorkspaceBytes).toBe(268435456)

    expect(createConfig({ scanBudgetMs: 1500 }).scanBudgetMs).toBe(1500)
    expect(createConfig({ scanBudgetMs: 0 }).scanBudgetMs).toBe(0)
    expect(createConfig({ scanBudgetMs: -5 }).scanBudgetMs).toBe(10000)
    expect(createConfig({ scanBudgetMs: 'abc' }).scanBudgetMs).toBe(10000)
    expect(createConfig({}).scanBudgetMs).toBe(10000)
  })

  // issue #29：整条快照脚本的兜底时限。0 = 不限制（消费侧映射为 24h），
  // 负数与非数值按非法回退默认——误输入不该把兜底关掉。
  it('snapshotBudgetMs：正常值生效，0 = 不限制，非法回退 180000', () => {
    expect(createConfig({ snapshotBudgetMs: 60000 }).snapshotBudgetMs).toBe(60000)
    expect(createConfig({ snapshotBudgetMs: 0 }).snapshotBudgetMs).toBe(0)
    expect(createConfig({ snapshotBudgetMs: -1 }).snapshotBudgetMs).toBe(180000)
    expect(createConfig({ snapshotBudgetMs: 'abc' }).snapshotBudgetMs).toBe(180000)
    expect(createConfig({}).snapshotBudgetMs).toBe(180000)
  })

  it('maxSnapshotsPerWorkspace：正常值生效，0/负值 = 不限制，非法回退 500', () => {
    expect(createConfig({ maxSnapshotsPerWorkspace: 30 }).maxSnapshotsPerWorkspace).toBe(30)
    expect(createConfig({ maxSnapshotsPerWorkspace: 0 }).maxSnapshotsPerWorkspace).toBe(0)
    expect(createConfig({ maxSnapshotsPerWorkspace: -5 }).maxSnapshotsPerWorkspace).toBe(0)
    expect(createConfig({ maxSnapshotsPerWorkspace: 'abc' }).maxSnapshotsPerWorkspace).toBe(500)
    expect(createConfig({ maxSnapshotsPerWorkspace: '12' }).maxSnapshotsPerWorkspace).toBe(12)
    expect(createConfig({}).maxSnapshotsPerWorkspace).toBe(500)
  })

  it('baseExcludes 过滤空串与非法类型；空/缺失回退内置表（含构建产物与二进制）', () => {
    const cfg = createConfig({ baseExcludes: ['.git', '  ', 42, null, 'dist/'] })
    expect(cfg.baseExcludes).toEqual(['.git', 'dist/'])
    expect(createConfig({ baseExcludes: [] }).baseExcludes).toEqual(DEFAULTS.baseExcludes)
    expect(createConfig({}).baseExcludes).toEqual(DEFAULTS.baseExcludes)
    expect(DEFAULTS.baseExcludes).toEqual(expect.arrayContaining(['target/', 'dist/', 'build/', '*.exe', '*.zip']))
  })

  it('refillDraft 只接受布尔，非布尔回退 true', () => {
    expect(createConfig({ refillDraft: false }).refillDraft).toBe(false)
    expect(createConfig({ refillDraft: 'no' }).refillDraft).toBe(true)
    expect(createConfig({}).refillDraft).toBe(true)
  })

  it('snapshotEnabled 只接受布尔，非布尔回退 true', () => {
    expect(createConfig({ snapshotEnabled: false }).snapshotEnabled).toBe(false)
    expect(createConfig({ snapshotEnabled: 0 }).snapshotEnabled).toBe(true)
    expect(createConfig({}).snapshotEnabled).toBe(true)
  })

  it('archiveOriginal 只接受布尔，非布尔回退 true', () => {
    expect(createConfig({ archiveOriginal: false }).archiveOriginal).toBe(false)
    expect(createConfig({ archiveOriginal: 'no' }).archiveOriginal).toBe(true)
    expect(createConfig({}).archiveOriginal).toBe(true)
  })

  it('editSubmitsImmediately：仅显式 false 关闭，缺失/非法回退 true（issue #26）', () => {
    expect(createConfig({ editSubmitsImmediately: false }).editSubmitsImmediately).toBe(false)
    expect(createConfig({ editSubmitsImmediately: 'no' }).editSubmitsImmediately).toBe(true)
    expect(createConfig({ editSubmitsImmediately: 0 }).editSubmitsImmediately).toBe(true)
    expect(createConfig({}).editSubmitsImmediately).toBe(true)
  })

  it('retentionDays：正常值生效，0/负值 = 不启用，非法回退 0', () => {
    expect(createConfig({ retentionDays: 30 }).retentionDays).toBe(30)
    expect(createConfig({ retentionDays: 0 }).retentionDays).toBe(0)
    expect(createConfig({ retentionDays: -5 }).retentionDays).toBe(0)
    expect(createConfig({ retentionDays: 'abc' }).retentionDays).toBe(0)
    expect(createConfig({}).retentionDays).toBe(0)
  })

  it('locale：只接受三值，其余回落 auto（A4）', () => {
    expect(createConfig({ locale: 'en' }).locale).toBe('en')
    expect(createConfig({ locale: 'zh' }).locale).toBe('zh')
    expect(createConfig({ locale: 'auto' }).locale).toBe('auto')
    expect(createConfig({ locale: 'fr' }).locale).toBe('auto')
    expect(createConfig({}).locale).toBe('auto')
  })

  it('DEFAULTS 与 schema 默认值一致（config-reset 降级路径的单一事实源）', () => {
    const fresh = createConfig({})
    expect(DEFAULTS).toEqual({
      gcSnaps: fresh.gcSnaps,
      gcHours: fresh.gcHours,
      maxFileBytes: fresh.maxFileBytes,
      maxWorkspaceBytes: fresh.maxWorkspaceBytes,
      scanBudgetMs: fresh.scanBudgetMs,
      snapshotBudgetMs: fresh.snapshotBudgetMs,
      maxSnapshotsPerWorkspace: fresh.maxSnapshotsPerWorkspace,
      baseExcludes: fresh.baseExcludes,
      refillDraft: fresh.refillDraft,
      snapshotEnabled: fresh.snapshotEnabled,
      messageOnly: fresh.messageOnly,
      archiveOriginal: fresh.archiveOriginal,
      editSubmitsImmediately: fresh.editSubmitsImmediately,
      retentionDays: fresh.retentionDays,
      locale: fresh.locale,
      storeRoot: fresh.storeRoot,
    })
  })

  // issue #36：显式快照根只做归一（去空白/去尾随分隔符），绝对性在 store.ts
  // 的使用点判定——加载期判死会让「配置错了」表现为插件整体不工作
  it('storeRoot：去空白与尾随分隔符，非字符串回落空串（issue #36）', () => {
    expect(createConfig({ storeRoot: '  D:\\dsh-snap  ' }).storeRoot).toBe('D:\\dsh-snap')
    expect(createConfig({ storeRoot: '/data/snap/' }).storeRoot).toBe('/data/snap')
    expect(createConfig({ storeRoot: '/' }).storeRoot).toBe('/')
    // 盘根去尾随分隔符会变 drive-relative，必须补回（否则使用点判非法）
    expect(createConfig({ storeRoot: 'D:\\' }).storeRoot).toBe('D:\\')
    expect(createConfig({ storeRoot: 42 }).storeRoot).toBe('')
    expect(createConfig({}).storeRoot).toBe('')
  })

  it('raw 非对象（null/string）按空配置处理', () => {
    expect(createConfig(null).gcSnaps).toBe(50)
    expect(createConfig('x').gcSnaps).toBe(50)
  })
})