/**
 * dsh-recall-plugin — dump 输出解析纯函数（PF-4 / PF-8）
 *
 * storesDumpScript / excludeDumpScript（两平台脚本模板）定界输出的解析器。
 * 放独立模块而非 index.js：routes-manage 也要用 parseExcludeDump，放 index.js
 * 会形成 index → routes-manage → index 的循环依赖；纯函数无依赖，独立成
 * 文件最干净。模块级导出供单测（tests/unit/stores-dump.test.js 等），index.js
 * re-export 保持既有 import 路径稳定。
 */

// 解析 storesDumpScript 的定界输出：dir → { root, entries, lineage }。逐行
// 状态机（==DIR / ROOT / INDEXBEGIN..INDEXEND / LINEAGEBEGIN..LINEAGEEND），
// 单个 store 的 JSON 损坏只丢它自己。
// PF-4：LINEAGE 段承载 lineage.json 原文（与 INDEX 段同构）——manage lineage
// 原实现对每个 root 串行 loadLineage（每 root 一条进程，20 工作区 ≈ 10s），
// 并入 dump 后零新增进程。无 LINEAGE 段（脚本/Host 版本错位的理论场景）按
// 无 lineage 处理，解析容错；lineage.json 损坏按空处理（与 loadLineage 的
// 既有语义一致：损坏不致命，树退化为普通分组）。
export function parseStoresDump(text) {
  const map = new Map()
  let cur = null
  let inIndex = false
  let indexLines = []
  let inLineage = false
  let lineageLines = []
  function flush() {
    if (!cur) return
    const raw = indexLines.join('\n').trim()
    if (raw) {
      try {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) cur.entries = arr
      } catch (error) { /* index 损坏按无索引处理 */ }
    }
    const lraw = lineageLines.join('\n').trim()
    if (lraw) {
      try {
        const larr = JSON.parse(lraw)
        if (Array.isArray(larr)) {
          cur.lineage = larr.filter((e) => e && typeof e.childId === 'string' && typeof e.parentId === 'string')
        }
      } catch (error) { /* lineage 损坏按无处理（不隔离），与 loadLineage 一致 */ }
    }
    map.set(cur.dir, cur)
    cur = null
  }
  for (const line of String(text).split(/\r?\n/)) {
    if (line.indexOf('==DIR ') === 0) { flush(); cur = { dir: line.slice(6).trim(), root: null, entries: null, lineage: null }; inIndex = false; inLineage = false; indexLines = []; lineageLines = []; continue }
    if (!cur) continue
    if (line.indexOf('ROOT ') === 0) { const v = line.slice(5).trim(); cur.root = v || null; continue }
    if (line === 'INDEXBEGIN') { inIndex = true; indexLines = []; continue }
    if (line === 'INDEXEND') { inIndex = false; continue }
    if (line === 'LINEAGEBEGIN') { inLineage = true; lineageLines = []; continue }
    if (line === 'LINEAGEEND') { inLineage = false; continue }
    if (inIndex) indexLines.push(line)
    else if (inLineage) lineageLines.push(line)
  }
  flush()
  return map
}

// 解析 excludeDumpScript 的定界输出（PF-8）：EXCLBEGIN <path> / base64 单行
// / EXCLEND → Map<路径, 原文>。内容行是 base64（ASCII 单行），exclude.txt
// 里的任意文本（空行/注释/恰好像标记的行）都不会打乱状态机；文件不存在的
// 段内容为空串（按「尚未配置」处理）。
export function parseExcludeDump(text) {
  const map = new Map()
  let cur = null
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.indexOf('EXCLBEGIN ') === 0) { cur = line.slice('EXCLBEGIN '.length).trim(); map.set(cur, ''); continue }
    if (line === 'EXCLEND') { cur = null; continue }
    if (cur !== null && line) {
      // base64 损坏按空处理（与「文件不存在」同语义，不致命）
      try { map.set(cur, Buffer.from(line, 'base64').toString('utf8')) } catch (error) { /* 保持空串 */ }
    }
  }
  return map
}
