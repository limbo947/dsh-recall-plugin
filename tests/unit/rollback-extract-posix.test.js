/**
 * POSIX 回退脚本真执行回归。
 *
 * scripts-contract 只检查生成文本；本文件用真 bash + git 跑快照/回退，钉住
 * tar -m 的 stat 缓存语义、分批路径过滤、CJK/空格路径和超长路径删除。
 * win32 只在 Git Bash（MINGW/MSYS/CYGWIN）上跑；找不到 WSL 方言则整组跳过，
 * CI 的 ubuntu 会执行真实 POSIX 分支。
 */

import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureGitScript, rollbackScript, snapshotScript, UTF8_PRELUDE } from '../../src/host/scripts.posix.js'

function findBash() {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe', 'bash']
    : ['bash']
  for (const exe of candidates) {
    try {
      const out = String(execFileSync(exe, ['-c', 'uname -s'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim()
      if (process.platform !== 'win32' || /^(MINGW|MSYS|CYGWIN)/.test(out)) return exe
    } catch (error) { /* 换下一个候选 */ }
  }
  return null
}

const BASH = findBash()
const RUNNABLE = Boolean(BASH) && spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
const dirs = []

function shellPath(file) {
  const abs = path.resolve(file)
  if (process.platform !== 'win32') return abs
  return abs.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase())
}

function nativePath(file) {
  if (process.platform !== 'win32' || file.length < 240) return file
  return '\\\\?\\' + path.resolve(file)
}

function put(file, text) {
  fs.mkdirSync(nativePath(path.dirname(file)), { recursive: true })
  fs.writeFileSync(nativePath(file), text, 'utf8')
}

function runSh(script) {
  // 脚本经临时文件执行：完整回退脚本体量接近 Windows 命令行上限，-c 内联会
  // 被截断后让 bash 继续等输入；文件方式也和生产失败诊断看到的内容一致。
  const holder = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-posix-sh-'))
  const file = path.join(holder, 'run.sh')
  fs.writeFileSync(file, UTF8_PRELUDE + '\n' + script)
  // 开发宿主的 safe-delete 会通过 BASH_ENV/导出函数劫持 rm；测试要验证脚本
  // 自己的 rm/trap 语义，不能把宿主的回收站包装带进子 shell（否则递归挂起）。
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  }
  for (const key of Object.keys(env)) {
    if (key === 'BASH_ENV' || key === 'ENV' || key.startsWith('BASH_FUNC_')) delete env[key]
  }
  try {
    const res = spawnSync(BASH, [shellPath(file)], {
      encoding: 'utf8',
      env,
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
    })
    return { status: res.status, stdout: String(res.stdout || '').trim(), stderr: String(res.stderr || '').trim(), error: res.error }
  } finally {
    fs.rmSync(holder, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  }
}

function expectOk(res) {
  expect(res.error, String(res.error || '')).toBeUndefined()
  expect(res.status, res.stdout + '\n' + res.stderr).toBe(0)
  return res.stdout
}

function makeFixture(files) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-posix-'))
  dirs.push(base)
  const root = path.join(base, 'root')
  const dir = path.join(base, 'store')
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(dir, { recursive: true })
  const store = {
    dir: shellPath(dir),
    repo: shellPath(path.join(dir, 'git')),
    git: shellPath(path.join(dir, 'git', '.git')),
    home: true,
    excludeFile: shellPath(path.join(dir, 'exclude.txt')),
    maxFileBytes: 8388608,
    maxWorkspaceBytes: 268435456,
    scanBudgetMs: 10000,
  }
  for (const [name, text] of Object.entries(files)) put(path.join(root, name), text)
  expectOk(runSh(ensureGitScript(store, 'git', [])))
  expectOk(runSh(snapshotScript(shellPath(root), store, 'git', 'm1', [])))
  return { base, root, shellRoot: shellPath(root), store }
}

function rollback(fixture) {
  return runSh(rollbackScript(fixture.shellRoot, fixture.store, 'git', 'snap-m1', []))
}

afterEach(() => {
  while (dirs.length) fs.rmSync(nativePath(dirs.pop()), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

describe.skipIf(!RUNNABLE)('POSIX rollback 真执行', () => {
  it('分批恢复覆盖修改、恢复缺失并删除新增，CJK 与空格路径正确', () => {
    const fixture = makeFixture({
      'keep.txt': 'keep',
      'dir/中文.txt': 'before-cn',
      'dir/日本語.txt': 'before-jp',
      'dir/with space.txt': 'before-space',
      'other/a.txt': 'a',
      'other/b.txt': 'b',
      'other/c.txt': 'c',
    })
    put(path.join(fixture.root, 'dir/中文.txt'), 'dirty-cn')
    fs.rmSync(path.join(fixture.root, 'dir/日本語.txt'))
    put(path.join(fixture.root, 'dir/with space.txt'), 'dirty-space')
    put(path.join(fixture.root, 'new.txt'), 'new')

    const out = expectOk(rollback(fixture))

    expect(out).toContain('ROLLBACK_OK 1 3')
    expect(fs.readFileSync(path.join(fixture.root, 'dir/中文.txt'), 'utf8')).toBe('before-cn')
    expect(fs.readFileSync(path.join(fixture.root, 'dir/日本語.txt'), 'utf8')).toBe('before-jp')
    expect(fs.readFileSync(path.join(fixture.root, 'dir/with space.txt'), 'utf8')).toBe('before-space')
    expect(fs.existsSync(path.join(fixture.root, 'new.txt'))).toBe(false)
  }, 30000)

  it('tar -m 使恢复文件 mtime 失配，紧接着的快照记录恢复内容', () => {
    const fixture = makeFixture({ 'a.txt': 'before', 'b.txt': 'b', 'c.txt': 'c' })
    const restored = path.join(fixture.root, 'a.txt')
    put(restored, 'dirt!!')
    const dirtyMtime = fs.statSync(restored).mtimeMs
    const first = expectOk(rollback(fixture))
    expect(first).toContain('ROLLBACK_OK 0 1')
    expect(fs.statSync(restored).mtimeMs).not.toBe(dirtyMtime)

    expectOk(runSh(snapshotScript(fixture.shellRoot, fixture.store, 'git', 'm2', [])))
    put(restored, 'after!')
    const out = expectOk(runSh(rollbackScript(fixture.shellRoot, fixture.store, 'git', 'snap-m2', [])))

    expect(out).toContain('ROLLBACK_OK 0 1')
    expect(fs.readFileSync(restored, 'utf8')).toBe('before')
  }, 30000)

  it('超过 260 字符的路径可重建并删除新增文件', () => {
    const longDir = Array.from({ length: 20 }, (_, i) => `d${String(i + 1).padStart(2, '0')}xxxxxxx`).join('/')
    const targetRel = `${longDir}/target.txt`
    const extraRel = `${longDir}/extra.txt`
    const fixture = makeFixture({ [targetRel]: 'before', 'a.txt': 'a', 'b.txt': 'b' })
    const target = path.join(fixture.root, targetRel)
    const extra = path.join(fixture.root, extraRel)
    expect(target.length).toBeGreaterThan(260)

    fs.rmSync(nativePath(path.join(fixture.root, longDir.split('/')[0])), { recursive: true, force: true })
    put(extra, 'extra')

    const out = expectOk(rollback(fixture))

    expect(out).toContain('ROLLBACK_OK 1 1')
    expect(fs.readFileSync(nativePath(target), 'utf8')).toBe('before')
    expect(fs.existsSync(nativePath(extra))).toBe(false)
  }, 30000)
})
