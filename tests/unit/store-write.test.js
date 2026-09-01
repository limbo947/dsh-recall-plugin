/**
 * writeTextViaShell rename ENOENT 容忍判定单测（WSL 双实例实弹修复）
 *
 * 背景：每实例写同一个 <file>.tmp 路径，并发 saveIndex 时一方 rename
 * 把 tmp 消费掉，另一方 mv/Move-Item 报 ENOENT。isTmpConsumedError 钉住
 * 「只认 rename 步的错误形态」：错误文本含 tmp basename + 三平台 ENOENT
 * 文案之一。写侧错误结构上进不到判定（见 store.js renameTmpQuietly 注释），
 * 这里对文案集合做边界钉：换 mv/Move-Item 版本导致文案漂移时此测试红。
 */

import { describe, it, expect } from 'vitest'
import { isTmpConsumedError } from '../../src/host/store.js'

const BASE = 'index.json.tmp'

describe('isTmpConsumedError（tmp 被并发写者消费的判定）', () => {
  it('POSIX mv 文案命中', () => {
    expect(isTmpConsumedError(
      "Error: mv: cannot stat '/home/u/.dsh/dsh-recall-snapshots/abc/index.json.tmp': No such file or directory",
      BASE
    )).toBe(true)
  })

  it('pwsh Move-Item 文案（含完整路径）命中', () => {
    expect(isTmpConsumedError(
      "Move-Item : Cannot find path 'C:\\Users\\u\\.dsh\\store\\index.json.tmp' because it does not exist.",
      BASE
    )).toBe(true)
  })

  it('短文案（仅文件名）命中——Windows 侧实际观测形态', () => {
    expect(isTmpConsumedError('Move-Item: index.json.tmp does not exist', BASE)).toBe(true)
  })

  it('不含 tmp basename 的错误不命中（避免误吞无关 ENOENT）', () => {
    expect(isTmpConsumedError("mv: cannot stat 'other.tmp': No such file or directory", BASE)).toBe(false)
  })

  it('提到 tmp 但非 ENOENT 语义的错误不命中（权限/占用等真失败照常抛出）', () => {
    expect(isTmpConsumedError("mv: cannot move 'index.json.tmp': Permission denied", BASE)).toBe(false)
    expect(isTmpConsumedError('Move-Item: index.json.tmp is being used by another process', BASE)).toBe(false)
  })

  it('空错误与空 basename 不命中', () => {
    expect(isTmpConsumedError('', BASE)).toBe(false)
    expect(isTmpConsumedError('some error', '')).toBe(false)
    expect(isTmpConsumedError(null, BASE)).toBe(false)
  })
})
