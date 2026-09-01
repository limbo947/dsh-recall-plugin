/**
 * PF-4 parseStoresDump 单测：LINEAGE 段并入 storesDump 的解析状态机
 *
 * manage lineage 原实现对每个 root 串行 loadLineage（每 root 一条进程，
 * 20 工作区 ≈ 10s）；LINEAGE 段并入 dump 后一次全拿。本文件钉解析容错：
 * LINEAGE 段缺失（脚本/Host 版本错位的理论场景）按无 lineage 处理；
 * lineage.json 损坏按空处理不隔离（与 snapshots.loadLineage 的既有语义
 * 一致：损坏不致命，树退化为普通分组）；条目形状非法的逐条过滤。
 */

import { describe, it, expect } from 'vitest'
// 从 dump-parse.js 而非 index.js 导入：index.js 顶层 re-export Config（config.js）
// 会带出 @deepseek-ai/schemastery（运行期私有 peer 依赖，CI 只装 devDeps 不可得），
// 且本文件没有 config.test.js 那样的 vi.mock——CI 上整个套件加载即崩（2.2.0/2.2.1
// 连续 6 次 CI 失败根因）。dump-parse.js 是零依赖纯函数，与 exclude-dump.test.js 同源。
import { parseStoresDump } from '../../src/host/dump-parse.js'

describe('parseStoresDump LINEAGE 段（PF-4）', () => {
  const lineage = [{ childId: 'c1', parentId: 'p1', time: 1 }]

  it('ROOT + INDEX + LINEAGE 三段齐备时全部解析', () => {
    const text = [
      '==DIR /store-a',
      'ROOT D:/ws',
      'INDEXBEGIN',
      JSON.stringify([{ id: 'm1', time: 1 }]),
      'INDEXEND',
      'LINEAGEBEGIN',
      JSON.stringify(lineage),
      'LINEAGEEND',
    ].join('\n')
    const map = parseStoresDump(text)
    const info = map.get('/store-a')
    expect(info.root).toBe('D:/ws')
    expect(info.entries).toEqual([{ id: 'm1', time: 1 }])
    expect(info.lineage).toEqual(lineage)
  })

  it('LINEAGE 段缺失（旧输出形态）→ lineage 为 null，index 照常解析', () => {
    const text = [
      '==DIR /store-a',
      'ROOT D:/ws',
      'INDEXBEGIN',
      JSON.stringify([{ id: 'm1' }]),
      'INDEXEND',
    ].join('\n')
    const map = parseStoresDump(text)
    const info = map.get('/store-a')
    expect(info.entries).toEqual([{ id: 'm1' }])
    expect(info.lineage).toBe(null)
  })

  it('lineage.json 内容损坏 → lineage 为 null（按无处理，不隔离）', () => {
    const text = [
      '==DIR /store-a',
      'INDEXBEGIN',
      '[]',
      'INDEXEND',
      'LINEAGEBEGIN',
      '{"broken":',
      'LINEAGEEND',
    ].join('\n')
    const map = parseStoresDump(text)
    expect(map.get('/store-a').lineage).toBe(null)
  })

  it('lineage 条目形状非法（缺 childId/parentId）逐条过滤', () => {
    const text = [
      '==DIR /store-a',
      'LINEAGEBEGIN',
      JSON.stringify([
        { childId: 'ok', parentId: 'p' },
        { childId: 'bad' },
        null,
        { childId: 1, parentId: 'p' },
      ]),
      'LINEAGEEND',
    ].join('\n')
    const map = parseStoresDump(text)
    expect(map.get('/store-a').lineage).toEqual([{ childId: 'ok', parentId: 'p' }])
  })

  it('多 DIR 段各自独立解析，单段 lineage 损坏不丢其他段', () => {
    const text = [
      '==DIR /a',
      'LINEAGEBEGIN',
      'garbage',
      'LINEAGEEND',
      '==DIR /b',
      'LINEAGEBEGIN',
      JSON.stringify([{ childId: 'c', parentId: 'p' }]),
      'LINEAGEEND',
    ].join('\n')
    const map = parseStoresDump(text)
    expect(map.get('/a').lineage).toBe(null)
    expect(map.get('/b').lineage).toEqual([{ childId: 'c', parentId: 'p' }])
  })

  it('空 dump 输出 → 空 Map', () => {
    expect(parseStoresDump('')).toEqual(new Map())
    expect(parseStoresDump(null)).toEqual(new Map())
  })
})
