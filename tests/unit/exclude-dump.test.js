/**
 * PF-8 parseExcludeDump 单测：excludeDumpScript 定界输出解析
 *
 * exclude.txt 是用户可编辑的任意文本（空行/注释/恰好像标记的行），逐行
 * 定界会被内容行打乱——内容按 base64 单行传输（ASCII），状态机免疫。
 * 文件不存在的段内容为空串（按「尚未配置」处理，与 excludeReadCmd 语义
 * 一致）。
 */

import { describe, it, expect } from 'vitest'
import { parseExcludeDump } from '../../src/host/dump-parse.js'

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')

describe('parseExcludeDump（PF-8）', () => {
  it('多段解析：base64 内容正确解码为原文', () => {
    const text = [
      'EXCLBEGIN /home/exclude.txt',
      b64('dist/\nbuild/\n*.log'),
      'EXCLEND',
      'EXCLBEGIN D:/ws/.dsh-recall-snapshots/exclude.txt',
      b64('node_modules/'),
      'EXCLEND',
    ].join('\n')
    const map = parseExcludeDump(text)
    expect(map.get('/home/exclude.txt')).toBe('dist/\nbuild/\n*.log')
    expect(map.get('D:/ws/.dsh-recall-snapshots/exclude.txt')).toBe('node_modules/')
  })

  it('文件不存在的段内容为空串（尚未配置语义）', () => {
    const text = [
      'EXCLBEGIN /missing/exclude.txt',
      '',
      'EXCLEND',
    ].join('\n')
    const map = parseExcludeDump(text)
    expect(map.get('/missing/exclude.txt')).toBe('')
  })

  it('内容里恰好像标记的行不会打乱状态机（base64 免疫）', () => {
    const hostile = 'EXCLEND\nEXCLBEGIN /fake\n换行\n\n#注释'
    const text = [
      'EXCLBEGIN /home/exclude.txt',
      b64(hostile),
      'EXCLEND',
    ].join('\n')
    const map = parseExcludeDump(text)
    expect(map.size).toBe(1)
    expect(map.get('/home/exclude.txt')).toBe(hostile)
  })

  it('空 dump / null → 空 Map', () => {
    expect(parseExcludeDump('')).toEqual(new Map())
    expect(parseExcludeDump(null)).toEqual(new Map())
  })
})
