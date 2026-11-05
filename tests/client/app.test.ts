/**
 * createApp 的槽注册接线测试：官方 slots 用最小桩捕获注册，不渲染宿主 UI。
 * 这里钉版本入口的双注册面，防止组件存在但装配漏接。
 */
import * as React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { createApp } from '../../src/client/app.js'
import type { ClientContext, SlotsService } from '../../src/types/client-contract.js'
import { stubSessions, stubWorkspaces, stubUiWorkspace, renderIntoDocument } from './helpers.js'

interface CapturedRegistration {
  name: string
  id?: string
  component: unknown
}

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function applyAppWithSlotStub(): CapturedRegistration[] {
  const registrations: CapturedRegistration[] = []
  const slots: SlotsService = {
    inject: (name, factory) => factory(),
    register: (opts, component) => {
      registrations.push({ name: opts.name, id: opts.id, component })
      return { name: opts.name }
    },
    entries: () => [],
  }
  const ctx: ClientContext = {
    slots,
    sessions: stubSessions().service,
    workspaces: stubWorkspaces().service,
    uiWorkspace: stubUiWorkspace().service,
    timer: { timeout: () => 0 },
    get: () => undefined,
  }
  createApp(React)(ctx)
  return registrations
}

describe('client 装配：版本入口注册', () => {
  it('同时注册回合操作区与会话头版本入口', () => {
    const registrations = applyAppWithSlotStub()
    const names = registrations.map((it) => it.name + ':' + String(it.id))
    expect(names).toContain('conversation.chat.assistant-actions:recall-version-pager')
    expect(names).toContain('conversation.session.header.actions:recall-version-header')
    const header = registrations.find((it) => it.name === 'conversation.session.header.actions') || null
    expect(typeof (header && header.component)).toBe('function')
  })

  it('会话头组件在无消息 DOM 时仍按显式 sessionId 渲染', async () => {
    localStorage.setItem('dsh-recall:versions:s1', JSON.stringify(['s1', 's2']))
    const registrations = applyAppWithSlotStub()
    const header = registrations.find((it) => it.name === 'conversation.session.header.actions')
    const Header = (header && header.component) as (props: { sessionId?: string }) => React.ReactNode
    const handle = await renderIntoDocument(React.createElement(Header, { sessionId: 's1' }))
    cleanups.push(handle.unmount)
    expect(handle.container.querySelectorAll('.dsh-recall-pager-btn').length).toBe(2)
  })
})
