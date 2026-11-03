/**
 * PF-1 diff 输出解析单测：parseDiffOutput / parseTreeId
 *
 * 脚本侧输出协议（scripts.*.js diffScript）：
 * - pwsh：TOTAL <全量条数> / 前 N 条 JSON / TREE <index 树指纹>
 * - posix：TSV「kind<TAB>path」逐行（不截断）+ 末行 TREE
 * 标记行必须先剥离再交给 parseChanges——win32 分支对整段 JSON.parse，
 * 标记行混入直接抛错（文档 PF-1 落点节钉过的坑）。
 */

import { describe, it, expect } from 'vitest'
import { parseDiffOutput, parseTreeId } from '../../src/host/snapshots.js'

describe('parseTreeId（snapshotScript / diffScript 输出的 TREE 行）', () => {
  it('SNAP_SKIP 与 SNAP_OK 混合输出中取 TREE 值', () => {
    const out = 'SNAP_SKIP a/\nSNAP_SKIP b/\nTREE 0123abc\nSNAP_OK\n'
    expect(parseTreeId(out)).toBe('0123abc')
  })

  it('无 TREE 行返回 null（execute 跳过指纹校验的兼容路径）', () => {
    expect(parseTreeId('SNAP_OK')).toBe(null)
    expect(parseTreeId('')).toBe(null)
    expect(parseTreeId(null)).toBe(null)
  })

  it('TREE 行含 CRLF 与行尾空白时 trim', () => {
    expect(parseTreeId('TREE  abc123  \r\n')).toBe('abc123')
  })
})

describe('parseDiffOutput（win32 协议：TOTAL + JSON + TREE）', () => {
  const changes = [
    { kind: 'modified', rel: 'a.ts' },
    { kind: 'restored', rel: 'b.ts' },
    { kind: 'added', rel: 'c.ts' },
  ]
  const winOut = 'TOTAL 3\n' + JSON.stringify(changes) + '\nTREE deadbeef\n'

  it('标记行剥离后 JSON 正常解析，total 取 TOTAL 行，treeId 提取', () => {
    const r = parseDiffOutput(winOut, true, 500)
    expect(r.changes).toEqual(changes)
    expect(r.total).toBe(3)
    expect(r.truncated).toBe(false)
    expect(r.treeId).toBe('deadbeef')
  })

  it('TOTAL > 返回条数 → truncated（PS 侧截断前移后的语义）', () => {
    const big = Array.from({ length: 4 }, (_, i) => ({ kind: 'modified', rel: 'f' + i }))
    const r = parseDiffOutput('TOTAL 900\n' + JSON.stringify(big) + '\nTREE t\n', true, 500)
    expect(r.total).toBe(900)
    expect(r.changes.length).toBe(4)
    expect(r.truncated).toBe(true)
  })

  it('maxChanges 截断 changes（PS 侧截断缺失时 JS 侧兜底）', () => {
    const big = Array.from({ length: 6 }, (_, i) => ({ kind: 'modified', rel: 'f' + i }))
    const r = parseDiffOutput('TOTAL 6\n' + JSON.stringify(big) + '\nTREE t\n', true, 5)
    expect(r.changes.length).toBe(5)
    expect(r.truncated).toBe(true)
  })

  it('空清单：TOTAL 0 + 空数组 JSON', () => {
    const r = parseDiffOutput('TOTAL 0\n[]\nTREE t\n', true, 500)
    expect(r.changes).toEqual([])
    expect(r.total).toBe(0)
    expect(r.truncated).toBe(false)
    expect(r.treeId).toBe('t')
  })

  it('TOTAL 行损坏/缺失回退解析条数', () => {
    const r1 = parseDiffOutput('TOTAL NaN\n' + JSON.stringify(changes) + '\nTREE t\n', true, 500)
    expect(r1.total).toBe(3)
    const r2 = parseDiffOutput(JSON.stringify(changes) + '\n', true, 500)
    expect(r2.total).toBe(3)
    expect(r2.treeId).toBe(null)
  })
})

describe('parseDiffOutput（分类计数：全量口径，不按截断后的清单统计）', () => {
  const head = Array.from({ length: 4 }, (_, i) => ({ kind: 'modified', rel: 'f' + i }))

  it('采信 COUNTS 行：截断清单只回传前 4 条，计数仍覆盖 3054 条', () => {
    const r = parseDiffOutput('COUNTS 3002 50 2\nTOTAL 3054\n' + JSON.stringify(head) + '\nTREE t\n', true, 500)
    expect(r.changes.length).toBe(4)
    expect(r.total).toBe(3054)
    expect(r.truncated).toBe(true)
    expect(r.counts).toEqual({ modified: 3002, restored: 50, added: 2 })
  })

  it('截断且无 COUNTS：counts 为 null（宁可不出摘要也不出错数）', () => {
    const r = parseDiffOutput('TOTAL 900\n' + JSON.stringify(head) + '\nTREE t\n', true, 500)
    expect(r.truncated).toBe(true)
    expect(r.counts).toBe(null)
  })

  it('未截断且无 COUNTS：按清单本地统计（POSIX 全量输出与旧脚本同路）', () => {
    const r = parseDiffOutput('TOTAL 3\n' + JSON.stringify([
      { kind: 'modified', rel: 'a' },
      { kind: 'restored', rel: 'b' },
      { kind: 'added', rel: 'c' },
    ]) + '\nTREE t\n', true, 500)
    expect(r.counts).toEqual({ modified: 1, restored: 1, added: 1 })
  })

  it('COUNTS 行损坏（段数/数值不合法）按缺席处理', () => {
    const r1 = parseDiffOutput('COUNTS 1 2\nTOTAL 900\n' + JSON.stringify(head) + '\nTREE t\n', true, 500)
    expect(r1.counts).toBe(null)
    const r2 = parseDiffOutput('COUNTS 1 x 3\nTOTAL 900\n' + JSON.stringify(head) + '\nTREE t\n', true, 500)
    expect(r2.counts).toBe(null)
    // 未截断时仍可退回本地统计
    const r3 = parseDiffOutput('COUNTS -1 2 3\nTOTAL 4\n' + JSON.stringify(head) + '\nTREE t\n', true, 500)
    expect(r3.counts).toEqual({ modified: 4, restored: 0, added: 0 })
  })

  it('POSIX 全量 TSV：counts 由清单统计得出', () => {
    const r = parseDiffOutput('modified\ta\nrestored\tb\nrestored\tc\nTREE abc\n', false, 500)
    expect(r.counts).toEqual({ modified: 1, restored: 2, added: 0 })
  })

  it('POSIX 清单超过 maxChanges：JS 侧截断但计数仍覆盖全量', () => {
    // POSIX 脚本不截断，截断只发生在 JS 侧——解析到的就是全量，可放心统计
    const lines = Array.from({ length: 600 }, (_, i) => 'modified\tf' + i).join('\n')
    const r = parseDiffOutput(lines + '\nTREE t\n', false, 500)
    expect(r.changes.length).toBe(500)
    expect(r.total).toBe(600)
    expect(r.truncated).toBe(true)
    expect(r.counts).toEqual({ modified: 600, restored: 0, added: 0 })
  })
})

describe('parseDiffOutput（posix 协议：TSV + 末行 TREE）', () => {
  it('TSV 逐行解析，TREE 行不混入数据，total=解析条数', () => {
    const r = parseDiffOutput('modified\ta.ts\nrestored\tb.ts\nTREE abc\n', false, 500)
    expect(r.changes).toEqual([
      { kind: 'modified', rel: 'a.ts' },
      { kind: 'restored', rel: 'b.ts' },
    ])
    expect(r.total).toBe(2)
    expect(r.truncated).toBe(false)
    expect(r.treeId).toBe('abc')
  })

  it('空 diff（只有 TREE 行）：零清单不报错', () => {
    const r = parseDiffOutput('TREE abc\n', false, 500)
    expect(r.changes).toEqual([])
    expect(r.total).toBe(0)
    expect(r.treeId).toBe('abc')
  })
})
