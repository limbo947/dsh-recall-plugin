/**
 * client 纯逻辑单测（P1-1，R1 后改为直接 import src/client 模块）
 *
 * R1 拆分前这些纯函数藏在 lib/client.js 的 apply 闭包里，无法 import，只能
 * 「花括号配对提取源码」在最小容器执行。R1（路线 B：src/client/ 多文件 +
 * esbuild 打包）把纯函数提升为模块级导出（buildTree/clockText/sizeText/
 * bytesToMb 在 util.js，summaryText/KIND_INFO 在 recall-node.js），这里改为
 * 直接 import 钉边界——src 是打包输入，改了 src 语义即测红。
 */

import { describe, it, expect } from 'vitest'
import { buildTree, clockText, sizeText, bytesToMb } from '../../src/client/util.js'
import { KIND_INFO, summaryText } from '../../src/client/recall-node.js'
import { groupByLineage } from '../../src/client/settings-cards.js'
import { nextShadowPriority } from '../../src/client/app.js'

describe('client 纯逻辑', () => {
  it('nextShadowPriority：无同 key 时从 -1 开始', () => {
    expect(nextShadowPriority([], 'user')).toBe(-1)
  })

  it('nextShadowPriority：避开同 key 已占用的最低优先级', () => {
    expect(nextShadowPriority([
      { options: { key: 'user', priority: 0 } },
      { options: { key: 'user', priority: -1 } },
      { options: { key: 'steering', priority: -7 } },
    ], 'user')).toBe(-2)
  })

  it('nextShadowPriority：连续冲突时继续向更低优先级移动', () => {
    expect(nextShadowPriority([
      { options: { key: 'user', priority: -1 } },
      { options: { key: 'user', priority: -2 } },
      { options: { key: 'user', priority: -3 } },
    ], 'user')).toBe(-4)
  })

  it('nextShadowPriority：缺失或非法 priority 按默认 0 处理', () => {
    expect(nextShadowPriority([
      { options: { key: 'user' } },
      { options: { key: 'user', priority: 'bad' } },
    ], 'user')).toBe(-1)
  })

  it('nextShadowPriority：空/非法 entries 不阻断计算', () => {
    expect(nextShadowPriority(null, 'user')).toBe(-1)
    expect(nextShadowPriority([null, {}, { options: null }], 'user')).toBe(-1)
  })

  it('buildTree：按工作区/会话分组，未知归属进「未知」节点', () => {
    const tree = buildTree([
      { root: '/ws1', workspace: 'ws1', sessionId: 's1', sessionTitle: 'S1', time: 2, id: 'a' },
      { root: '/ws1', workspace: 'ws1', sessionId: 's1', sessionTitle: 'S1', time: 1, id: 'b' },
      { root: '/ws1', workspace: 'ws1', sessionId: 's2', sessionTitle: 'S2', time: 3, id: 'c' },
      { root: null, workspace: null, sessionId: null, time: 4, id: 'd' },
      { root: '/ws1', workspace: 'ws1', sessionId: null, time: 5, id: 'e' },
    ])
    expect(tree.length).toBe(2) // /ws1 + unknown-root
    const ws1 = tree.find((w) => w.root === '/ws1')
    expect(ws1.name).toBe('ws1')
    expect(ws1.sessions.length).toBe(3) // s1 / s2 / unknown-session
    // 会话内子项按 time 降序
    const s1 = ws1.sessions.find((s) => s.sessionId === 's1')
    expect(s1.items.map((i) => i.id)).toEqual(['a', 'b'])
    const unknown = tree.find((w) => w.root === null)
    expect(unknown.name).toBe('未知工作区')
  })

  it('clockText：当天只显示时分，跨天显示月/日 时分，非法值返回空串', () => {
    const now = new Date()
    const sameDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 5).getTime()
    expect(clockText(sameDay)).toBe('09:05')
    const otherDay = new Date(2020, 0, 15, 3, 45).getTime()
    expect(clockText(otherDay)).toBe('1/15 03:45')
    expect(clockText(0)).toBe('')
    expect(clockText(null)).toBe('')
    expect(clockText(NaN)).toBe('')
  })

  it('summaryText：按 modified/restored/added 顺序拼接，0 项不出现', () => {
    const s = summaryText({ modified: 2, restored: 0, added: 1 })
    expect(s).toBe('修改 2 · 删除 1')
    expect(summaryText({ modified: 0, restored: 0, added: 0 })).toBe('')
  })

  it('sizeText：KB/MB/GB 边界与格式', () => {
    expect(sizeText(0)).toBe('0 MB')
    expect(sizeText(null)).toBe('0 MB')
    expect(sizeText(512)).toBe('1 KB')
    expect(sizeText(1048576)).toBe('1.0 MB')
    expect(sizeText(2 * 1073741824)).toBe('2.00 GB')
  })

  it('bytesToMb：字节→MB 小数（round 2 位去尾零），非法/非正值返回空串', () => {
    expect(bytesToMb(1048576)).toBe('1')
    expect(bytesToMb(104857600)).toBe('100')
    expect(bytesToMb(1572864)).toBe('1.5')
    expect(bytesToMb(0)).toBe('')
    expect(bytesToMb(-1)).toBe('')
    expect(bytesToMb('x')).toBe('')
  })

  it('KIND_INFO：kind 单表覆盖 modified/restored/added', () => {
    expect(Object.keys(KIND_INFO).sort()).toEqual(['added', 'modified', 'restored'])
    expect(KIND_INFO.modified.label).toBe('修改')
    expect(KIND_INFO.added.label).toBe('删除')
  })

  it('groupByLineage：撤回两次 A→B→C 聚族，标注 v1/v2/v3', () => {
    const lineage = [
      { childId: 'B', parentId: 'A' },
      { childId: 'C', parentId: 'B' },
    ]
    const map = groupByLineage(['A', 'B', 'C'], lineage)
    expect(map.get('A')).toEqual({ family: ['A', 'B', 'C'], index: 1 })
    expect(map.get('B').index).toBe(2)
    expect(map.get('C').index).toBe(3)
  })

  it('groupByLineage：单会话/无 lineage 无家族', () => {
    expect(groupByLineage(['A'], [])).toEqual(new Map())
    expect(groupByLineage(['A', 'B'], [])).toEqual(new Map())
  })

  it('groupByLineage：父不在集合时链断裂，不误聚族', () => {
    const map = groupByLineage(['B', 'C'], [
      { childId: 'B', parentId: 'A' },
      { childId: 'C', parentId: 'B' },
    ])
    // B 的父 A 不在集合 → B 是根；C 的父 B 在集合 → 链 B→C
    expect(map.get('B')).toEqual({ family: ['B', 'C'], index: 1 })
    expect(map.get('C').index).toBe(2)
  })

  it('groupByLineage：乱序 ids 回溯根 + 非法条目忽略', () => {
    const lineage = [
      { childId: 'C', parentId: 'B' },
      { childId: 'B', parentId: 'A' },
      { childId: 'X' }, // 非法：缺 parentId
      null,
    ]
    const map = groupByLineage(['C', 'A', 'B'], lineage)
    expect(map.get('A').index).toBe(1)
    expect(map.get('B').index).toBe(2)
    expect(map.get('C').index).toBe(3)
  })

  it('groupByLineage：成环 lineage（A→C→B→A）不死循环，seen 防护钉', () => {
    // A7：脏数据（lineage.json 手改/旧版缺陷）可能构成环——回溯根的 seen
    // 集合必须在环上终止，BFS 的 assigned 集合必须在环上收敛。本例若防护
    // 失效会挂死测试进程（同步死循环），以此钉住回归。
    const lineage = [
      { childId: 'C', parentId: 'A' },
      { childId: 'A', parentId: 'B' },
      { childId: 'B', parentId: 'C' },
    ]
    const map = groupByLineage(['A', 'B', 'C'], lineage)
    // 环上无真根：回溯从任意点出发绕环一圈即止（seen 命中起点），从该点
    // BFS 收集整环且只收集一次——三个成员都有家族标注且索引互不重复
    expect(map.size).toBe(3)
    const family = map.get('A').family
    expect([...family].sort()).toEqual(['A', 'B', 'C'])
    expect(new Set([...map.values()].map((v) => v.index)).size).toBe(3)
  })
})
