/**
 * session-info.js 纯逻辑单测（R2 拆出）
 *
 * titleFromEvents / messageTextFromEvents 是「两段式」会话标题/文本补全的
 * 核心解析器，被 live 快速查询与冷会话补齐共用。钉住事件序列解析边界，
 * 避免拆 routes 时悄悄破坏标题/文本提取。
 */

import { describe, it, expect } from 'vitest'
import { titleFromEvents, messageTextFromEvents } from '../../src/host/session-info.js'

describe('titleFromEvents', () => {
  it('取最新一条 session/title', () => {
    const events = [
      { type: 'session/title', data: { title: '旧标题' } },
      { type: 'user/message', data: { id: 'm1' } },
      { type: 'session/title', data: { title: '新标题' } },
    ]
    expect(titleFromEvents(events)).toBe('新标题')
  })

  it('无标题事件/非数组/空标题返回 null', () => {
    expect(titleFromEvents([{ type: 'x' }])).toBe(null)
    expect(titleFromEvents(null)).toBe(null)
    expect(titleFromEvents([{ type: 'session/title', data: { title: '' } }])).toBe(null)
  })

  it('畸形事件跳过不抛', () => {
    expect(titleFromEvents([null, {}, { type: 'session/title' }, { type: 'session/title', data: { title: 'ok' } }])).toBe('ok')
  })
})

describe('messageTextFromEvents', () => {
  it('取指定消息的 text 块拼接文本', () => {
    const events = [
      { type: 'user/message', data: { id: 'm1', content: [{ type: 'text', text: '你好' }, { type: 'text', text: '世界' }] } },
      { type: 'user/message', data: { id: 'm2', content: [{ type: 'text', text: '另一条' }] } },
    ]
    expect(messageTextFromEvents(events, 'm1')).toBe('你好世界')
    expect(messageTextFromEvents(events, 'm2')).toBe('另一条')
  })

  it('无文本块/无消息/无 messageId 返回 null', () => {
    expect(messageTextFromEvents([{ type: 'user/message', data: { id: 'm1', content: [{ type: 'image' }] } }], 'm1')).toBe(null)
    expect(messageTextFromEvents([], 'm1')).toBe(null)
    expect(messageTextFromEvents([{ type: 'user/message', data: { id: 'm1' } }], null)).toBe(null)
  })

  it('消息 id 按字符串比较（数字 id 也可命中）', () => {
    expect(messageTextFromEvents([{ type: 'user/message', data: { id: 42, content: [{ type: 'text', text: 'x' }] } }], '42')).toBe('x')
  })
})
