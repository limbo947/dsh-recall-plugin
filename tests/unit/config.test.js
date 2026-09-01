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
      maxFileBytes: 104857600,
      maxSnapshotsPerWorkspace: 500,
      baseExcludes: ['.git', 'node_modules/', '.dsh-recall-snapshots/', 'dsh-recall-snapshots/'],
      refillDraft: true,
      snapshotEnabled: true,
      archiveOriginal: true,
      retentionDays: 0,
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

  it('maxFileBytes 低于 1024 回退到默认值', () => {
    expect(createConfig({ maxFileBytes: 512 }).maxFileBytes).toBe(104857600)
    expect(createConfig({ maxFileBytes: 2048 }).maxFileBytes).toBe(2048)
  })

  it('maxSnapshotsPerWorkspace：正常值生效，0/负值 = 不限制，非法回退 500', () => {
    expect(createConfig({ maxSnapshotsPerWorkspace: 30 }).maxSnapshotsPerWorkspace).toBe(30)
    expect(createConfig({ maxSnapshotsPerWorkspace: 0 }).maxSnapshotsPerWorkspace).toBe(0)
    expect(createConfig({ maxSnapshotsPerWorkspace: -5 }).maxSnapshotsPerWorkspace).toBe(0)
    expect(createConfig({ maxSnapshotsPerWorkspace: 'abc' }).maxSnapshotsPerWorkspace).toBe(500)
    expect(createConfig({ maxSnapshotsPerWorkspace: '12' }).maxSnapshotsPerWorkspace).toBe(12)
    expect(createConfig({}).maxSnapshotsPerWorkspace).toBe(500)
  })

  it('baseExcludes 过滤空串与非法类型；空/缺失回退内置表', () => {
    const cfg = createConfig({ baseExcludes: ['.git', '  ', 42, null, 'dist/'] })
    expect(cfg.baseExcludes).toEqual(['.git', 'dist/'])
    expect(createConfig({ baseExcludes: [] }).baseExcludes).toEqual(['.git', 'node_modules/', '.dsh-recall-snapshots/', 'dsh-recall-snapshots/'])
    expect(createConfig({}).baseExcludes).toEqual(['.git', 'node_modules/', '.dsh-recall-snapshots/', 'dsh-recall-snapshots/'])
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

  it('retentionDays：正常值生效，0/负值 = 不启用，非法回退 0', () => {
    expect(createConfig({ retentionDays: 30 }).retentionDays).toBe(30)
    expect(createConfig({ retentionDays: 0 }).retentionDays).toBe(0)
    expect(createConfig({ retentionDays: -5 }).retentionDays).toBe(0)
    expect(createConfig({ retentionDays: 'abc' }).retentionDays).toBe(0)
    expect(createConfig({}).retentionDays).toBe(0)
  })

  it('DEFAULTS 与 schema 默认值一致（config-reset 降级路径的单一事实源）', () => {
    const fresh = createConfig({})
    expect(DEFAULTS).toEqual({
      gcSnaps: fresh.gcSnaps,
      gcHours: fresh.gcHours,
      maxFileBytes: fresh.maxFileBytes,
      maxSnapshotsPerWorkspace: fresh.maxSnapshotsPerWorkspace,
      baseExcludes: fresh.baseExcludes,
      refillDraft: fresh.refillDraft,
      snapshotEnabled: fresh.snapshotEnabled,
      archiveOriginal: fresh.archiveOriginal,
      retentionDays: fresh.retentionDays,
    })
  })

  it('raw 非对象（null/string）按空配置处理', () => {
    expect(createConfig(null).gcSnaps).toBe(50)
    expect(createConfig('x').gcSnaps).toBe(50)
  })
})