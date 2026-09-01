/**
 * H3 错误码单一事实源单测（F-G4 补强）
 *
 * errors.js 收拢全部端点 code 常量（值保持不变），lib 内联字符串已替换为
 * E.RECALL_* 引用。本测试三道门禁：
 * 1. ALL_CODES 覆盖全部常量值且唯一非空；
 * 2. 静态扫描 lib/*.js 全部文件（F-G4：清单从 index.js/snapshots.js 扩到
 *    全量——routes-core.js/routes-manage.js 才是 25 处 E.RECALL_* 引用主战场，
 *    固定清单会随新路由文件拆分而失效）的 E.RECALL_* 引用，无 typo（引用
 *    未导出常量即红）；
 * 3. 契约不回归：code 字符串值与收敛前逐字一致（client 已消费的线上契约），
 *    18 个 code 全量值钉——漏钉的恰是无人消费、漂移无声的那批；
 * 4. 全仓零内联：lib/*.js 不存在 `code: '<字面量>'` 形态（把「全仓零内联」
 *    从人肉 grep 固化为测试，新代码内联即红）。
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../../src/host/errors.js'

const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../lib')

// lib 目前是扁平目录；为防未来拆子目录，读取时递归一层兜底
function listLibFiles() {
  const out = []
  for (const name of fs.readdirSync(libDir, { withFileTypes: true })) {
    if (name.isDirectory()) {
      const sub = path.join(libDir, name.name)
      for (const f of fs.readdirSync(sub)) {
        if (f.endsWith('.js')) out.push(path.join(sub, f))
      }
    } else if (name.name.endsWith('.js')) {
      out.push(path.join(libDir, name.name))
    }
  }
  return out
}

const CODE_NAMES = [
  'RECALL_STALE',
  'RECALL_NO_SNAPSHOT',
  'RECALL_NO_STORE',
  'RECALL_AGENT_BUSY',
  'RECALL_ROLLBACK_FAILED',
  'RECALL_UNKNOWN_PATH',
  'RECALL_BAD_TYPE',
  'RECALL_EMPTY_PATCH',
  'RECALL_SETTINGS_UNAVAILABLE',
  'RECALL_SETTINGS_WRITE_FAILED',
  'RECALL_BODY_TOO_LARGE',
  'RECALL_ERROR',
  'RECALL_NO_ROOT',
  'RECALL_NO_SESSION',
  'RECALL_PARTIAL_DELETE',
  'RECALL_UNKNOWN_OP',
  'RECALL_UNKNOWN_ENDPOINT',
  'RECALL_INDEX_CORRUPT',
]

describe('H3 错误码单一事实源', () => {
  it('ALL_CODES 覆盖全部常量值，且唯一、非空字符串', () => {
    for (const name of CODE_NAMES) {
      expect(typeof E[name], name).toBe('string')
      expect(E.ALL_CODES, name).toContain(E[name])
    }
    expect(new Set(E.ALL_CODES).size).toBe(E.ALL_CODES.length)
    expect(E.ALL_CODES.length).toBe(CODE_NAMES.length)
  })

  it('lib/*.js 引用的 E.RECALL_* 均在导出集内（无 typo，全量扫描）', () => {
    const exported = new Set(Object.keys(E).filter((k) => k.startsWith('RECALL_')))
    for (const file of listLibFiles()) {
      const src = fs.readFileSync(file, 'utf8')
      for (const m of src.matchAll(/E\.RECALL_[A-Z_]+/g)) {
        expect(exported.has(m[0].slice(2)), path.basename(file) + ' 引用了未导出常量 ' + m[0]).toBe(true)
      }
    }
  })

  it('code 字符串值与收敛前逐字一致（18 个全量值钉，线上契约不回归）', () => {
    expect(E.RECALL_STALE).toBe('STALE')
    expect(E.RECALL_NO_SNAPSHOT).toBe('NO_SNAPSHOT')
    expect(E.RECALL_NO_STORE).toBe('NO_STORE')
    expect(E.RECALL_AGENT_BUSY).toBe('AGENT_BUSY')
    expect(E.RECALL_ROLLBACK_FAILED).toBe('ROLLBACK_FAILED')
    expect(E.RECALL_UNKNOWN_PATH).toBe('UNKNOWN_PATH')
    expect(E.RECALL_BAD_TYPE).toBe('BAD_TYPE')
    expect(E.RECALL_EMPTY_PATCH).toBe('EMPTY_PATCH')
    expect(E.RECALL_SETTINGS_UNAVAILABLE).toBe('SETTINGS_UNAVAILABLE')
    expect(E.RECALL_SETTINGS_WRITE_FAILED).toBe('SETTINGS_WRITE_FAILED')
    expect(E.RECALL_BODY_TOO_LARGE).toBe('BODY_TOO_LARGE')
    expect(E.RECALL_ERROR).toBe('ERROR')
    expect(E.RECALL_NO_ROOT).toBe('NO_ROOT')
    expect(E.RECALL_NO_SESSION).toBe('NO_SESSION')
    expect(E.RECALL_PARTIAL_DELETE).toBe('PARTIAL_DELETE')
    expect(E.RECALL_UNKNOWN_OP).toBe('UNKNOWN_OP')
    expect(E.RECALL_UNKNOWN_ENDPOINT).toBe('UNKNOWN_ENDPOINT')
    expect(E.RECALL_INDEX_CORRUPT).toBe('INDEX_CORRUPT')
  })

  it('全仓零内联：lib/*.js 不存在 code: <字面量> 形态（一律走 E.RECALL_*）', () => {
    const offenders = []
    for (const file of listLibFiles()) {
      const src = fs.readFileSync(file, 'utf8')
      if (/code:\s*['"]/.test(src)) offenders.push(path.basename(file))
    }
    // errors.js 的常量定义（export const RECALL_X = 'Y'）不匹配 code: 形态，
    // 注释里的示例也要避开 code: '…' 写法，本断言零豁免
    expect(offenders, '内联 code 字面量出现在: ' + offenders.join(', ')).toEqual([])
  })
})
