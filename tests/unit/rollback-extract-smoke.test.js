import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureGitScript, rescueScript, rollbackScript, snapshotScript, UTF8_PRELUDE } from '../../src/host/scripts.pwsh.js'

const PS = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const AVAILABLE = process.platform === 'win32' && fs.existsSync(PS)
const dirs = []

function diskPath(file) {
  if (!AVAILABLE) return file
  if (file.startsWith('\\\\?\\')) return file
  const abs = path.resolve(file)
  if (abs.length < 240) return abs
  return abs.startsWith('\\\\') ? '\\\\?\\UNC\\' + abs.slice(2) : '\\\\?\\' + abs
}

function put(file, text) {
  fs.mkdirSync(diskPath(path.dirname(file)), { recursive: true })
  fs.writeFileSync(diskPath(file), text, 'utf8')
}

function readText(file) {
  return fs.readFileSync(diskPath(file), 'utf8')
}

function exists(file) {
  return fs.existsSync(diskPath(file))
}

function runPs(script) {
  // 与生产直连通道同用 PS5.1 和 UTF-8 前导，避免测试误走 pwsh 7 而漏掉
  // .NET Framework 的 API/编码差异；隔离全局 Git 配置防止用户环境影响夹具。
  const res = spawnSync(PS, ['-NoProfile', '-NonInteractive', '-Command', UTF8_PRELUDE + '\n' + script], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: 'NUL', GIT_CONFIG_NOSYSTEM: '1' },
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  })
  return { status: res.status, stdout: String(res.stdout || '').trim(), stderr: String(res.stderr || '').trim(), error: res.error }
}

function expectOk(res) {
  expect(res.error, String(res.error || '')).toBeUndefined()
  expect(res.status, res.stdout + '\n' + res.stderr).toBe(0)
  return res.stdout
}

function makeFixture(files) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-rollback-'))
  dirs.push(base)
  // 夹具的 root 必须保持短：git 对工作区根自身 ≥260 字符的目录一律拒绝索引
  // （Windows MAX_PATH 硬限制，实测 259 起就失败），这类工作区不支持撤回
  const root = path.join(base, 'root')
  const dir = path.join(base, 'store')
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(dir, { recursive: true })
  const store = {
    dir,
    repo: path.join(dir, 'git'),
    git: path.join(dir, 'git', '.git'),
    home: true,
    excludeFile: path.join(dir, 'exclude.txt'),
    maxFileBytes: 8388608,
    maxWorkspaceBytes: 268435456,
    scanBudgetMs: 10000,
  }
  for (const [name, text] of Object.entries(files)) put(path.join(root, name), text)
  expectOk(runPs(ensureGitScript(store, 'git', [])))
  expectOk(runPs(snapshotScript(root, store, 'git', 'm1', [])))
  return { base, root, store }
}

function rollback(fixture) {
  return runPs(rollbackScript(fixture.root, fixture.store, 'git', 'snap-m1', []))
}

afterEach(() => {
  while (dirs.length) fs.rmSync(diskPath(dirs.pop()), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

describe.skipIf(!AVAILABLE)('Windows rollback 解压真执行（PS5.1）', () => {
  it('分批分支覆盖修改、恢复缺失并删除新增，CJK 与空格路径保持正确', () => {
    const fixture = makeFixture({
      'keep.txt': 'keep',
      'dir/中文.txt': 'before-cn',
      'dir/日本語.txt': 'before-jp',
      'dir/with space.txt': 'before-space',
      'unchanged/同 じ.txt': 'same',
      'other/a.txt': 'a',
      'other/b.txt': 'b',
      'other/c.txt': 'c',
    })
    const untouched = path.join(fixture.root, 'unchanged/同 じ.txt')
    const untouchedMtime = fs.statSync(untouched).mtimeMs
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
    expect(fs.statSync(untouched).mtimeMs).toBe(untouchedMtime)
    expect(fs.existsSync(path.join(fixture.store.dir, 'restore-tmp.zip'))).toBe(false)
  }, 30000)

  it('整树分支在恢复项过半时保持覆盖内容与计数', () => {
    const fixture = makeFixture({ 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' })
    put(path.join(fixture.root, 'a.txt'), 'dirty-a')
    put(path.join(fixture.root, 'b.txt'), 'dirty-b')
    put(path.join(fixture.root, 'new.txt'), 'new')

    const out = expectOk(rollback(fixture))

    expect(out).toContain('ROLLBACK_OK 1 2')
    expect(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8')).toBe('a')
    expect(fs.readFileSync(path.join(fixture.root, 'b.txt'), 'utf8')).toBe('b')
    expect(fs.readFileSync(path.join(fixture.root, 'c.txt'), 'utf8')).toBe('c')
    expect(fs.existsSync(path.join(fixture.root, 'new.txt'))).toBe(false)
  }, 30000)

  it('空恢复集只执行删除，不创建或打开临时 zip', () => {
    const fixture = makeFixture({ 'same.txt': 'same' })
    put(path.join(fixture.root, 'new.txt'), 'new')

    const out = expectOk(rollback(fixture))

    expect(out).toContain('ROLLBACK_OK 1 0')
    expect(fs.readFileSync(path.join(fixture.root, 'same.txt'), 'utf8')).toBe('same')
    expect(fs.existsSync(path.join(fixture.root, 'new.txt'))).toBe(false)
    expect(fs.existsSync(path.join(fixture.store.dir, 'restore-tmp.zip'))).toBe(false)
  }, 30000)

  it('解压失败不输出成功哨兵，安全快照可恢复回退前现场', () => {
    const fixture = makeFixture({ 'collision/item.txt': 'target' })
    const collision = path.join(fixture.root, 'collision')
    fs.rmSync(collision, { recursive: true })
    put(collision, 'blocking file')
    expectOk(runPs(snapshotScript(fixture.root, fixture.store, 'git', 'pre', [])))

    const failed = rollback(fixture)

    expect(failed.status, failed.stdout + '\n' + failed.stderr).not.toBe(0)
    expect(failed.stdout).not.toContain('ROLLBACK_OK')
    expectOk(runPs(rescueScript(fixture.root, fixture.store, 'git', 'snap-pre')))
    expect(fs.readFileSync(collision, 'utf8')).toBe('blocking file')
    expect(fs.existsSync(path.join(fixture.root, 'collision/item.txt'))).toBe(false)
  }, 30000)

  it('回退后立即重拍快照记录恢复内容，后续回退不受 stat 缓存影响', () => {
    const fixture = makeFixture({ 'a.txt': 'before', 'b.txt': 'b', 'c.txt': 'c' })
    const restored = path.join(fixture.root, 'a.txt')
    put(restored, 'dirt!!')
    const dirtyMtime = fs.statSync(restored).mtimeMs
    const first = expectOk(rollback(fixture))
    expect(first).toContain('ROLLBACK_OK 0 1')
    // touch 让恢复文件与旧 index 的 stat 记录失配，后续 add 必须重新 hash。
    expect(fs.statSync(restored).mtimeMs).not.toBe(dirtyMtime)

    // 等长写入放大 stat 碰撞风险：若重拍漏掉恢复内容，第二次回退会把
    // 错误的 dirty 内容当成 m2 快照恢复出来。
    expectOk(runPs(snapshotScript(fixture.root, fixture.store, 'git', 'm2', [])))
    put(restored, 'after!')
    const out = expectOk(runPs(rollbackScript(fixture.root, fixture.store, 'git', 'snap-m2', [])))

    expect(out).toContain('ROLLBACK_OK 0 1')
    expect(fs.readFileSync(restored, 'utf8')).toBe('before')
  }, 30000)

  it('恢复集跨过 100 条批次边界时每批都正确覆盖', () => {
    const files = {}
    for (let i = 0; i < 400; i++) files[`d${i % 10}/f${i}.txt`] = `v${i}`
    const fixture = makeFixture(files)
    for (let i = 0; i < 150; i++) put(path.join(fixture.root, `d${i % 10}/f${i}.txt`), `dirty-${i}`)

    const out = expectOk(rollback(fixture))

    expect(out).toContain('ROLLBACK_OK 0 150')
    for (const i of [0, 99, 100, 149]) {
      expect(fs.readFileSync(path.join(fixture.root, `d${i % 10}/f${i}.txt`), 'utf8')).toBe(`v${i}`)
    }
  }, 30000)

  it('超长路径可重建缺失文件并删除只读新增文件', () => {
    // 22 段而非 20：%TEMP% 短的环境下（如 C:\Windows\Temp）20 段只有 262 字符，
    // 贴着断言门槛；多两段换来稳定余量
    const segments = Array.from({ length: 22 }, (_, i) => `d${String(i + 1).padStart(2, '0')}xxxxxxx`)
    const longDir = segments.join('/')
    const targetRel = `${longDir}/target.txt`
    const extraRel = `${longDir}/extra.txt`
    const fixture = makeFixture({ [targetRel]: 'before', 'a.txt': 'a', 'b.txt': 'b' })
    const target = path.join(fixture.root, targetRel)
    const extra = path.join(fixture.root, extraRel)
    expect(target.length).toBeGreaterThan(260)

    fs.rmSync(diskPath(path.join(fixture.root, segments[0])), { recursive: true, force: true })
    put(extra, 'extra')
    fs.chmodSync(diskPath(extra), 0o444)
    expect(fs.statSync(diskPath(extra)).mode & 0o200).toBe(0)

    const out = expectOk(rollback(fixture))

    expect(out).toContain('ROLLBACK_OK 1 1')
    expect(readText(target)).toBe('before')
    expect(exists(extra)).toBe(false)
  }, 30000)

  it('超长路径已存在文件按目标内容覆盖', () => {
    const longDir = Array.from({ length: 22 }, (_, i) => `d${String(i + 1).padStart(2, '0')}xxxxxxx`).join('/')
    const targetRel = `${longDir}/target.txt`
    const fixture = makeFixture({ [targetRel]: 'before', 'a.txt': 'a', 'b.txt': 'b' })
    const target = path.join(fixture.root, targetRel)
    put(target, 'dirty!')

    const out = expectOk(rollback(fixture))

    expect(out).toContain('ROLLBACK_OK 0 1')
    expect(readText(target)).toBe('before')
  }, 30000)
})
