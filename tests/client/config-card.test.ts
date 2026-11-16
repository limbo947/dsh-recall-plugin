/**
 * 配置表单卡片组件测试（A1）
 *
 * 覆盖读 / 存 / 恢复默认三条链路的成功与失败面：断言请求载荷（只提交相对
 * 基线修改过的字段）、错误态与禁用态可见性（className / aria / disabled），
 * 网络异常不吞。文案不进断言（A4 i18n 让路）——错误传播断言的是 host 载荷
 * 原文（如 message: 'boom'）出现在界面上，不是 UI 文案字面量。
 */

import * as React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { buildConfigForm } from '../../src/client/config-card.js'
import type { SectionToggleProps } from '../../src/client/config-card.js'
import { makeUtil, stubFetch, renderIntoDocument, q, qa, qid, first, at, click, typeInto, flush } from './helpers.js'

const CONFIG_VALUES = {
  gcSnaps: 50,
  gcHours: 24,
  maxFileBytes: 8388608,
  maxWorkspaceBytes: 268435456,
  scanBudgetMs: 10000,
  maxSnapshotsPerWorkspace: 500,
  baseExcludes: ['node_modules/'],
  refillDraft: true,
  snapshotEnabled: true,
  // issue #31：只回退消息（默认关）
  messageOnly: false,
  archiveOriginal: true,
  retentionDays: 0,
}

// 折叠头桩：config-card 的契约只要求「可点击 + 转发 open」，展开态由测试驱动
function SectionToggle(props: SectionToggleProps): React.ReactNode {
  return React.createElement('button', { type: 'button', className: 'sec-toggle', onClick: props.onToggle }, props.title)
}

let cleanups: Array<() => void> = []
afterEach(() => {
  for (const fn of cleanups) fn()
  cleanups = []
})

async function mount(routes: Record<string, unknown> = {}): Promise<{
  container: HTMLElement
  fetchStub: ReturnType<typeof stubFetch>
}> {
  const fetchStub = stubFetch(Object.assign({ 'config-get': { ok: true, values: CONFIG_VALUES, envLocks: {}, overridden: {}, writable: true } }, routes))
  const util = makeUtil()
  const { ConfigForm } = buildConfigForm(React, util, SectionToggle)
  const handle = await renderIntoDocument(React.createElement(ConfigForm))
  cleanups.push(handle.unmount, fetchStub.restore)
  await flush()
  return { container: handle.container, fetchStub }
}

// panel-actions 内按钮顺序：放弃修改 / 恢复默认 / 保存（主色）——按位置取，
// 不依赖文案（i18n 安全）
function actionButtons(container: HTMLElement): HTMLElement[] {
  return qa(container, '.dsh-recall-panel-actions .dsh-recall-btn')
}

describe('config-card 读取与渲染', () => {
  it('读取成功：渲染 12 字段控件，值来自 config-get 载荷', async () => {
    const { container } = await mount()
    expect(qid(container, 'dsh-recall-cfg-gcSnaps')).not.toBeNull()
    expect((qid(container, 'dsh-recall-cfg-gcSnaps') as HTMLInputElement).value).toBe('50')
    // issue #24：单文件默认 8MB；单工作区总量按 MB 展示（256），扫描预算按秒展示（10）
    expect((qid(container, 'dsh-recall-cfg-maxFileBytes') as HTMLInputElement).value).toBe('8')
    expect((qid(container, 'dsh-recall-cfg-maxWorkspaceBytes') as HTMLInputElement).value).toBe('256')
    expect((qid(container, 'dsh-recall-cfg-scanBudgetMs') as HTMLInputElement).value).toBe('10')
    expect(qa(container, '.dsh-recall-cfg-switch').length).toBe(5)
    expect(qa(container, '.dsh-recall-cfg-row').length).toBeGreaterThanOrEqual(10)
  })

  it('布尔字段经 role=switch 呈现，aria-checked 反映当前值', async () => {
    const { container } = await mount()
    // 渲染顺序：snapshotEnabled / messageOnly / refillDraft / archiveOriginal /
    // editSubmitsImmediately——messageOnly 默认关（issue #31），其余默认开
    expect(qa(container, '.dsh-recall-cfg-switch').map((sw) => sw.getAttribute('aria-checked')))
      .toEqual(['true', 'false', 'true', 'true', 'true'])

    const off = await mount({ 'config-get': { ok: true, values: Object.assign({}, CONFIG_VALUES, { refillDraft: false }), envLocks: {}, writable: true } })
    expect(at(qa(off.container, '.dsh-recall-cfg-switch'), 2).getAttribute('aria-checked')).toBe('false')
  })

  it('读取失败（ok:false）→ 表单不渲染，host 载荷原文可见', async () => {
    const { container } = await mount({ 'config-get': { ok: false, message: 'boom-read' } })
    expect(qid(container, 'dsh-recall-cfg-gcSnaps')).toBeNull()
    expect(container.textContent).toContain('boom-read')
  })

  it('读取异常（网络错误）→ 同样可见（不吞）', async () => {
    const { container } = await mount({ 'config-get': new Error('network down') })
    expect(qid(container, 'dsh-recall-cfg-gcSnaps')).toBeNull()
    expect(container.textContent).toContain('network down')
  })

  it('envLocks 命中的字段禁用输入', async () => {
    const { container } = await mount({ 'config-get': { ok: true, values: CONFIG_VALUES, envLocks: { gcSnaps: true }, writable: true } })
    expect((qid(container, 'dsh-recall-cfg-gcSnaps') as HTMLInputElement).disabled).toBe(true)
  })

  it('只读设置源（writable=false）→ 控件禁用且三个操作按钮都不可点', async () => {
    const { container } = await mount({ 'config-get': { ok: true, values: CONFIG_VALUES, envLocks: {}, writable: false } })
    expect((qid(container, 'dsh-recall-cfg-gcSnaps') as HTMLInputElement).disabled).toBe(true)
    const buttons = actionButtons(container)
    expect(buttons.length).toBe(3)
    for (const btn of buttons) expect((btn as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('config-card 保存链路', () => {
  it('只提交相对基线修改过的字段，且数字字段转回整数', async () => {
    const { container, fetchStub } = await mount({ 'config-set': { ok: true } })
    await typeInto(qid(container, 'dsh-recall-cfg-gcSnaps') as HTMLInputElement, '80')
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()

    const setCalls = fetchStub.callsOf('config-set')
    expect(setCalls.length).toBe(1)
    expect(first(setCalls).args.patch).toEqual({ gcSnaps: 80 })
  })

  it('开关翻转同样进入补丁（布尔字段）', async () => {
    const { container, fetchStub } = await mount({ 'config-set': { ok: true } })
    // refillDraft 是第 3 个开关（前两个：snapshotEnabled / messageOnly）
    await click(qa(container, '.dsh-recall-cfg-switch')[2])
    await flush()
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()

    expect(first(fetchStub.callsOf('config-set')).args.patch).toEqual({ refillDraft: false })
  })

  it('无改动时保存短路：不发 config-set', async () => {
    const { container, fetchStub } = await mount({ 'config-set': { ok: true } })
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()

    expect(fetchStub.callsOf('config-set').length).toBe(0)
    expect(q(container, '.dsh-recall-ex-status')).not.toBeNull()
  })

  it('保存失败（ok:false）→ 错误态', async () => {
    const { container } = await mount({ 'config-set': { ok: false, message: 'nope-save' } })
    await typeInto(qid(container, 'dsh-recall-cfg-gcHours') as HTMLInputElement, '5')
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()

    expect(q(container, '.dsh-recall-ex-status-error')).not.toBeNull()
    expect(container.textContent).toContain('nope-save')
  })

  it('保存异常（网络错误）→ 同样错误态', async () => {
    const { container } = await mount({ 'config-set': new Error('network down') })
    await typeInto(qid(container, 'dsh-recall-cfg-gcHours') as HTMLInputElement, '5')
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()

    expect(q(container, '.dsh-recall-ex-status-error')).not.toBeNull()
  })

  it('数字字段非法（小于下限）→ 不发请求，错误态提示', async () => {
    const { container, fetchStub } = await mount({ 'config-set': { ok: true } })
    await typeInto(qid(container, 'dsh-recall-cfg-gcSnaps') as HTMLInputElement, '0')
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()

    expect(fetchStub.callsOf('config-set').length).toBe(0)
    expect(q(container, '.dsh-recall-ex-status-error')).not.toBeNull()
  })

  it('保存成功 → 重新拉取配置（config-get 第二次）', async () => {
    const { container, fetchStub } = await mount({ 'config-set': { ok: true } })
    await typeInto(qid(container, 'dsh-recall-cfg-gcSnaps') as HTMLInputElement, '80')
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()

    expect(fetchStub.callsOf('config-get').length).toBe(2)
  })

  // issue #36：快照存储根住在「高级设置」折叠区，展开才渲染；绝对路径进补丁，
  // 相对路径在前端就被拒（与 host 端点同一判据），不发请求
  it('快照存储根：绝对路径进补丁，相对路径被拒且不发请求', async () => {
    const { container, fetchStub } = await mount({ 'config-set': { ok: true } })
    await click(q(container, '.sec-toggle'))
    await flush()
    const input = qid(container, 'dsh-recall-cfg-storeRoot') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('')

    await typeInto(input, 'relative/dir')
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()
    expect(fetchStub.callsOf('config-set').length).toBe(0)
    expect(q(container, '.dsh-recall-ex-status-error')).not.toBeNull()

    await typeInto(qid(container, 'dsh-recall-cfg-storeRoot') as HTMLInputElement, 'D:\\dsh-snap')
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()
    expect(first(fetchStub.callsOf('config-set')).args.patch).toEqual({ storeRoot: 'D:\\dsh-snap' })
  })
})

describe('config-card 恢复默认链路', () => {
  it('恢复默认：发 config-reset 并重新读取配置', async () => {
    const { container, fetchStub } = await mount({ 'config-reset': { ok: true } })
    await click(actionButtons(container)[1])
    await flush()

    expect(fetchStub.callsOf('config-reset').length).toBe(1)
    expect(fetchStub.callsOf('config-get').length).toBe(2)
    expect(q(container, '.dsh-recall-ex-status-success')).not.toBeNull()
  })

  it('恢复默认失败（ok:false）→ 错误态', async () => {
    const { container } = await mount({ 'config-reset': { ok: false, message: 'nope-reset' } })
    await click(actionButtons(container)[1])
    await flush()

    expect(q(container, '.dsh-recall-ex-status-error')).not.toBeNull()
  })

  it('恢复默认异常（网络错误）→ 同样错误态', async () => {
    const { container } = await mount({ 'config-reset': new Error('network down') })
    await click(actionButtons(container)[1])
    await flush()

    expect(q(container, '.dsh-recall-ex-status-error')).not.toBeNull()
  })

  it('放弃修改：草稿回到基线（已修改标签消失）', async () => {
    const { container } = await mount()
    await typeInto(qid(container, 'dsh-recall-cfg-gcSnaps') as HTMLInputElement, '99')
    await flush()
    expect(qa(container, '.dsh-recall-cfg-tag-modified').length).toBeGreaterThan(0)

    await click(actionButtons(container)[0])
    await flush()
    expect((qid(container, 'dsh-recall-cfg-gcSnaps') as HTMLInputElement).value).toBe('50')
    expect(qa(container, '.dsh-recall-cfg-tag-modified').length).toBe(0)
  })
})