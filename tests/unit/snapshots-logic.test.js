/**
 * snapshots.js 纯逻辑单测（P1-1）：模块级导出的 parseSkipped / parseChanges /
 * scanCutSeq。这些是本插件跨平台快照链路的核心解析器，被 win32 与 POSIX
 * 两侧共用——历史坑集中在「平台分叉输入格式」与「消息切点定位」，
 * 用真实格式样本钉住行为，避免改模板时悄悄破坏解析。
 */

import { describe, it, expect } from 'vitest'
import { parseSkipped, parseChanges, scanCutSeq } from '../../src/host/snapshots.js'

describe('parseSkipped', () => {
  it('提取 SNAP_SKIP 开头的行，剥掉前缀', () => {
    const out = 'SNAP_SKIP D:/repo/embedded\nINFO something\nSNAP_SKIP docs/generated\n'
    expect(parseSkipped(out)).toEqual(['D:/repo/embedded', 'docs/generated'])
  })

  it('无跳过行返回空数组（包括为空/undefined）', () => {
    expect(parseSkipped('正常日志行')).toEqual([])
    expect(parseSkipped('')).toEqual([])
    expect(parseSkipped(undefined)).toEqual([])
  })

  it('CRLF 换行同样解析', () => {
    const out = 'SNAP_SKIP a.txt\r\nSNAP_SKIP b.txt\r\n'
    expect(parseSkipped(out)).toEqual(['a.txt', 'b.txt'])
  })

  it('SNAP_SKIP 前缀的歧义（路径恰以此开头）不会被误割', () => {
    const out = 'SNAP_SKIP SNAP_SKIP_stuff.txt'
    expect(parseSkipped(out)).toEqual(['SNAP_SKIP_stuff.txt'])
  })
})

describe('parseChanges', () => {
  it('win32：JSON 数组直接返回', () => {
    const text = JSON.stringify([{ kind: 'modified', rel: 'src/a.js' }, { kind: 'restored', rel: 'b.md' }])
    expect(parseChanges(text, true)).toEqual([{ kind: 'modified', rel: 'src/a.js' }, { kind: 'restored', rel: 'b.md' }])
  })

  it('win32：单对象（非数组）包装成数组；空数组返回空', () => {
    expect(parseChanges('{"kind":"added","rel":"x"}', true)).toEqual([{ kind: 'added', rel: 'x' }])
    expect(parseChanges('[]', true)).toEqual([])
  })

  it('win32：语法损坏的 JSON 抛出（由调用方兜底为报错文案）', () => {
    expect(() => parseChanges('{"kind":', true)).toThrow()
  })

  it('POSIX：TSV「kind\\tpath」逐行解析，空白行跳过', () => {
    const text = ['modified\tsrc/a.js', 'restored\tb.md', ''].join('\n')
    expect(parseChanges(text, false)).toEqual([{ kind: 'modified', rel: 'src/a.js' }, { kind: 'restored', rel: 'b.md' }])
  })

  it('POSIX：无 tab 的行（异常输出）跳过', () => {
    expect(parseChanges('malformed line\nk\tv\n', false)).toEqual([{ kind: 'k', rel: 'v' }])
  })

  it('POSIX：CRLF 换行同样解析', () => {
    expect(parseChanges('a\t1\r\nb\t2\r\n', false)).toEqual([{ kind: 'a', rel: '1' }, { kind: 'b', rel: '2' }])
  })
})

describe('scanCutSeq', () => {
  const events = [
    { seq: 1, type: 'session/title' },
    { seq: 2, type: 'turn/start' },
    { seq: 3, type: 'user/message', data: { id: 'm1' } },
    { seq: 4, type: 'turn/end' },
    { seq: 5, type: 'user/message', data: { id: 'm2' } },
  ]

  it('取目标消息之前最近一次 turn/end 的 seq', () => {
    expect(scanCutSeq(events, 'm2')).toBe(4)
  })

  it('消息是会话第一条（其前无 turn/end）返回 null', () => {
    expect(scanCutSeq(events, 'm1')).toBe(null)
  })

  it('找不到该消息返回 null', () => {
    expect(scanCutSeq(events, 'nope')).toBe(null)
  })

  it('消息 id 按字符串比较（数字 id 也可命中）', () => {
    const ev = [{ seq: 10, type: 'turn/end' }, { seq: 11, type: 'user/message', data: { id: 42 } }]
    expect(scanCutSeq(ev, '42')).toBe(10)
  })

  it('畸形事件（缺 type/data）跳过不抛', () => {
    const ev = [null, {}, { type: 'user/message' }, { seq: 7, type: 'turn/end' }, { type: 'user/message', data: { id: 'x' } }]
    expect(scanCutSeq(ev, 'x')).toBe(7)
  })
})