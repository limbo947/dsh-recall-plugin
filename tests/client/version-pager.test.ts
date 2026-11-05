/**
 * 版本翻页器通过公开组件验证切换与异常恢复，官方服务只记录可观察调用。
 * 重点覆盖 provider 缺失可能暴露的归档中间态，不断言 UI 文案。
 */
import * as React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildVersionPager } from '../../src/client/version-pager.js'
import { activeSession, recordVersion } from '../../src/client/version-tree.js'
import type { ClientUiWorkspaceService, ClientWorkspacesService } from '../../src/types/client-contract.js'
import { makeUtil, renderIntoDocument, q, qa, at, click, flush, wait } from './helpers.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  vi.useRealTimers()
  for (const cleanup of cleanups.splice(0)) cleanup()
  localStorage.clear()
  activeSession.id = ''
})

async function mountPager(options: { unarchiveError?: boolean; openError?: boolean; withPrimary?: boolean } = {}) {
  recordVersion('s1', 's2')
  const archived: string[] = []
  const targetArchived: string[] = []
  const opened: string[] = []
  const toasts: string[] = []
  const workspaces: ClientWorkspacesService = {
    archiveSession: async (sessionId) => { archived.push(sessionId); return {} },
    list: { getSnapshot: () => ({ archivedSessionIds: ['s2'] }) },
  }
  const uiWorkspace: ClientUiWorkspaceService = {
    openSession: (sessionId) => { opened.push(sessionId); if (options.openError) throw new Error('open-failed') },
    archiveSession: async (sessionId) => { targetArchived.push(sessionId); return {} },
    unarchiveSession: async () => { if (options.unarchiveError) throw new Error('unarchive-failed'); return {} },
  }
  const { VersionPager, VersionHeaderAction } = buildVersionPager(React, makeUtil({ showThrottledToast: (text) => { toasts.push(text) } }), workspaces, uiWorkspace)
  const handle = options.withPrimary === false
    ? { container: document.createElement('div'), unmount: () => undefined }
    : await renderIntoDocument(React.createElement('div', { 'data-turn-tail': '1' },
        React.createElement(VersionPager, { sessionId: 's1', messageId: 'm1' })
      ))
  if (handle.unmount !== undefined && options.withPrimary !== false) cleanups.push(handle.unmount)
  if (options.withPrimary !== false) await wait(70)
  return { container: handle.container, archived, targetArchived, opened, toasts, VersionPager, VersionHeaderAction }
}

describe('版本翻页器：失败状态恢复', () => {
  it('目标解档失败时不归档来源，也不发起导航', async () => {
    const { container, archived, opened } = await mountPager({ unarchiveError: true })
    await click(at(qa(container, '.dsh-recall-pager-btn'), 1))
    await flush()
    expect(archived).toEqual([])
    expect(opened).toEqual([])
  })

  it('导航同步失败时恢复目标归档，来源保持未归档', async () => {
    const { container, archived, targetArchived, opened } = await mountPager({ openError: true })
    await click(at(qa(container, '.dsh-recall-pager-btn'), 1))
    await flush()
    expect(opened).toEqual(['s2'])
    expect(archived).toEqual([])
    expect(targetArchived).toEqual(['s2'])
  })

  it('目标会话挂载后才归档来源', async () => {
    const { container, archived, VersionPager } = await mountPager()
    await click(at(qa(container, '.dsh-recall-pager-btn'), 1))
    await flush()
    expect(archived).toEqual([])

    const target = await renderIntoDocument(React.createElement('div', { 'data-turn-tail': '2' },
      React.createElement(VersionPager, { sessionId: 's2', messageId: 'm2' })
    ))
    cleanups.push(target.unmount)
    await flush()
    expect(archived).toEqual(['s1'])
  })

  it('目标一直未挂载时超时释放操作态且不归档来源', async () => {
    const { container, archived, toasts, opened } = await mountPager()
    vi.useFakeTimers()
    await click(at(qa(container, '.dsh-recall-pager-btn'), 1))
    await flush()
    expect(opened).toEqual(['s2'])

    await React.act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(archived).toEqual([])
    expect(toasts.length).toBe(1)
    expect(q(container, '.dsh-recall-pager[data-busy=true]')).toBeNull()
  })

  it('消息区不可用时头部入口仍显示并完成切换', async () => {
    const { archived, opened, VersionHeaderAction } = await mountPager({ withPrimary: false })
    const source = await renderIntoDocument(React.createElement(VersionHeaderAction, { sessionId: 's1' }))
    cleanups.push(source.unmount)
    await wait(90)
    await click(at(qa(source.container, '.dsh-recall-pager-btn'), 1))
    await flush()
    expect(opened).toEqual(['s2'])

    const target = await renderIntoDocument(React.createElement(VersionHeaderAction, { sessionId: 's2' }))
    cleanups.push(target.unmount)
    await flush()
    expect(archived).toEqual(['s1'])
  })

  it('消息区入口可用时头部入口不重复渲染', async () => {
    const { VersionHeaderAction } = await mountPager()
    const header = await renderIntoDocument(React.createElement(VersionHeaderAction, { sessionId: 's1' }))
    cleanups.push(header.unmount)
    await wait(90)
    expect(header.container.querySelectorAll('.dsh-recall-pager-btn').length).toBe(0)
  })
})
