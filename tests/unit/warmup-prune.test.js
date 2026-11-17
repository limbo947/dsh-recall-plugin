/**
 * 启动预热剪枝单测（issue #24 遗留项）
 *
 * 报告者实测：一个从没发过消息的下载目录工作区（会话日志只有 header、零
 * user/message）每次 DSH 启动都被预热链摸一遍——resolveStore + git init +
 * rebuildOrphans，重启后 CPU 再次打满。判据是「磁盘上到底有没有 store 目录」，
 * 本文件钉三件事：
 * 1) 命中面：home 容器哈希子目录（含多档容器）、项目内降级目录；
 * 2) 零 shell 进程：这是纯只读判断，为它起 pwsh 就把省下的开销还回去了；
 * 3) fail-open 与保守口径：探不清时判「都有」，配了 storeRoot 不剪枝。
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRuntime, hashRootPath } from '../../src/host/store.js'

// 剪枝的 fail-open 分支会 console.error 留诊断，单测里静音避免刷屏
beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

const REAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')
const REAL_DSH_HOME = process.env.DSH_HOME
const dirs = []

function setPlatform(value) {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

function makeHome(dshHome) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-prune-'))
  dirs.push(base)
  const container = path.join(base, 'dsh-recall-snapshots')
  fs.mkdirSync(container, { recursive: true })
  if (dshHome) process.env.DSH_HOME = base
  return { base, container }
}

// 从 cwd 解析 root 的运行时：剪枝只走 fs，任何 shell 调用都算违约
function makeRuntime(config) {
  const shell = {
    resolve: (spec) => spec,
    execute: async (spec) => ({
      result: async () => {
        throw new Error('预热剪枝不得起 shell 进程: ' + String(spec.command).slice(0, 80))
      },
    }),
  }
  return createRuntime({ shell, sessions: { list: () => [] }, get: () => null }, config || { baseExcludes: [] })
}

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-ws-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  if (REAL_PLATFORM) Object.defineProperty(process, 'platform', REAL_PLATFORM)
  if (REAL_DSH_HOME === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = REAL_DSH_HOME
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

describe('rootsWithExistingStore（预热剪枝判据）', () => {
  it('home 容器里有该工作区的哈希子目录 → 保留；没有 → 剪掉', async () => {
    setPlatform('linux')
    const { container } = makeHome(true)
    const withStore = makeWorkspace()
    const noStore = makeWorkspace()
    fs.mkdirSync(path.join(container, hashRootPath(withStore)), { recursive: true })

    const rt = makeRuntime()
    const kept = await rt.rootsWithExistingStore([withStore, noStore])
    expect(Array.from(kept)).toEqual([withStore])
  })

  it('项目内降级目录也算「有库」', async () => {
    setPlatform('linux')
    makeHome(true)
    const fallback = makeWorkspace()
    const other = makeWorkspace()
    fs.mkdirSync(path.join(fallback, '.dsh-recall-snapshots'), { recursive: true })

    const rt = makeRuntime()
    const kept = await rt.rootsWithExistingStore([fallback, other])
    expect(Array.from(kept)).toEqual([fallback])
  })

  it('尾部斜杠归一：cwd 带尾斜杠时哈希与 resolveRoot 同口径（不误判为「没库」）', async () => {
    setPlatform('linux')
    const { container } = makeHome(true)
    const root = makeWorkspace()
    fs.mkdirSync(path.join(container, hashRootPath(root)), { recursive: true })

    const rt = makeRuntime()
    const kept = await rt.rootsWithExistingStore([root + '/'])
    expect(Array.from(kept)).toEqual([root + '/'])
  })

  it('POSIX 大小写敏感：哈希子目录存在但 root 大小写不同 → 不算命中', async () => {
    setPlatform('linux')
    const { container } = makeHome(true)
    const root = path.join(makeWorkspace(), 'Proj')
    fs.mkdirSync(root, { recursive: true })
    fs.mkdirSync(path.join(container, hashRootPath(root)), { recursive: true })

    const rt = makeRuntime()
    expect(Array.from(await rt.rootsWithExistingStore([root.toLowerCase()]))).toEqual([])
    expect(Array.from(await rt.rootsWithExistingStore([root]))).toEqual([root])
  })

  it('多档容器：DSH_HOME 与主目录下的容器都参与判定（I24 旧位）', async () => {
    setPlatform('linux')
    const { container } = makeHome(true)
    const root = makeWorkspace()
    fs.mkdirSync(path.join(container, hashRootPath(root)), { recursive: true })

    const rt = makeRuntime()
    // DSH_HOME 已指向临时 home，命中来自这一档；主目录档不存在也不影响
    expect(Array.from(await rt.rootsWithExistingStore([root]))).toEqual([root])
  })

  it('配了显式快照根 → 不剪枝（换根搬迁挂在 resolveStore 上，预热是唯一触发点）', async () => {
    setPlatform('linux')
    makeHome(true)
    const rt = makeRuntime({ baseExcludes: [], storeRoot: '/data/snap' })
    const roots = [makeWorkspace(), makeWorkspace()]
    expect(Array.from(await rt.rootsWithExistingStore(roots))).toEqual(roots)
  })

  it('空 root 列表：零 fs 试探直接返回（启动早期无会话不付成本）', async () => {
    setPlatform('linux')
    const rt = makeRuntime()
    expect(Array.from(await rt.rootsWithExistingStore([]))).toEqual([])
  })

  it('容器档探不清（权限错）→ fail-open 判「都有」', async () => {
    setPlatform('linux')
    makeHome(true)
    const roots = [makeWorkspace(), makeWorkspace()]
    const spy = vi.spyOn(fs, 'statSync').mockImplementation((p) => {
      if (String(p).includes('dsh-recall-snapshots')) throw Object.assign(new Error('denied'), { code: 'EACCES' })
      return { isDirectory: () => true }
    })
    const rt = makeRuntime()
    expect(Array.from(await rt.rootsWithExistingStore(roots)).sort()).toEqual(roots.slice().sort())
    expect(spy).toHaveBeenCalled()
  })

  it('全程零 shell：任何 shell 调用都会让本组用例抛错（已由 makeRuntime 断言）', async () => {
    setPlatform('linux')
    const { container } = makeHome(true)
    const root = makeWorkspace()
    fs.mkdirSync(path.join(container, hashRootPath(root)), { recursive: true })
    const rt = makeRuntime()
    await expect(rt.rootsWithExistingStore([root])).resolves.toEqual(new Set([root]))
  })
})
