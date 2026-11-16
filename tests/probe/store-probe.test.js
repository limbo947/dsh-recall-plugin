/**
 * 存储可写性探测的运行时探针（tests/probe/，仅本地跑：npm run test:probe）
 *
 * issue #36 的现场是「目录在、ACL 干净、就是建不出子项」——静态断言只能钉脚本
 * 形状，钉不住 PowerShell 的运行时行为（EAP=Stop 下 Join-Path 遇不存在的盘符会
 * 终止整条脚本、Set-Content 在受限 token 下的错误形态等）。本探针把生成的脚本
 * 交给本机真实解释器（pwsh7 优先、5.1 兜底，与 dsh-pwsh-local 同序）跑三个场景：
 *   1) 可写目录 → PROBE WRITABLE / REPO NO；
 *   2) 已建出 git/ → REPO YES（宿主据此判断换 store 会不会丢历史）；
 *   3) 不可达盘符 → NOWRITABLE / REPO NO 且**退出码 0**（REPO 行不得抛）；
 *   4) ACL 拒 AD/WD（issue #36 现场复现）→ NOWRITABLE / REPO YES。
 * 第 4 例要改临时目录 ACL，全程 try/finally 收回，且只作用于 mkdtemp 出来的目录。
 */

import { describe, it, expect } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as pwsh from '../../src/host/scripts.pwsh.js'

// 与 dsh-pwsh-local 的 ENCODING_PREAMBLE 逐字一致（store.js runShellMeta 前置拼接）
const ENC_PREAMBLE = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); '

function candidateExecutables() {
  const list = [
    { exe: path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'), label: 'pwsh7' },
  ]
  for (const dir of (process.env.PATH || '').split(';')) {
    const p = path.join(dir.trim().replace(/^"|"$/g, ''), 'pwsh.exe')
    if (p && !list.some((c) => c.exe === p)) list.push({ exe: p, label: 'pwsh7' })
  }
  list.push({ exe: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), label: 'ps51' })
  return list.filter((c) => fs.existsSync(c.exe))
}

function runPwsh(exe, script) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', ENC_PREAMBLE + '\n' + script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

const isWin = process.platform === 'win32'
const execs = isWin ? candidateExecutables() : []

// 探针脚本自身带 UTF8_PRELUDE（runShellMeta 在生产里会前置同一段），这里照拼
function probeScript(dir) {
  return pwsh.UTF8_PRELUDE + '\n' + pwsh.storeProbeScript(dir)
}

describe('storeProbeScript 运行时探针（win32 专属，无 PowerShell 环境 skip）', () => {
  for (const { exe, label } of execs) {
    it(`${label}：可写目录 → WRITABLE / REPO NO`, async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-recall-probe-'))
      try {
        const { code, stdout, stderr } = await runPwsh(exe, probeScript(dir))
        expect(code, 'stderr: ' + stderr.slice(0, 500)).toBe(0)
        expect(stdout).toContain('PROBE WRITABLE')
        expect(stdout).toContain('REPO NO')
        // 探测必须收尾干净：临时文件不得留在目录里
        expect(fs.readdirSync(dir).length).toBe(0)
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it(`${label}：已存在 git/ → REPO YES（降级安全判定依据）`, async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-recall-probe-'))
      try {
        fs.mkdirSync(path.join(dir, 'git'))
        const { code, stdout } = await runPwsh(exe, probeScript(dir))
        expect(code).toBe(0)
        expect(stdout).toContain('PROBE WRITABLE')
        expect(stdout).toContain('REPO YES')
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it(`${label}：不可达盘符 → NOWRITABLE / REPO NO 且退出码 0（REPO 行不得抛）`, async () => {
      // 取一个本机不存在的盘符；REPO 行的 Join-Path 在 EAP=Stop 下曾整条终止
      const absent = ['Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
        .map((d) => d + ':\\nope\\store')
        .find((p) => !fs.existsSync(p.slice(0, 3)))
      expect(absent).toBeTruthy()
      const { code, stdout, stderr } = await runPwsh(exe, probeScript(absent))
      expect(code, 'stderr: ' + stderr.slice(0, 500)).toBe(0)
      expect(stdout).toContain('PROBE NOWRITABLE')
      expect(stdout).toContain('REPO NO')
    })

    it(`${label}：ACL 拒 AD/WD（issue #36 现场）→ NOWRITABLE / REPO YES`, async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-recall-probe-'))
      const user = process.env.USERNAME || ''
      let denied = false
      try {
        fs.mkdirSync(path.join(dir, 'git'))
        // 旧判据（New-Item -Force 已存在目录）在这里会谎报成功，正是 issue #36
        execFileSync('icacls', [dir, '/deny', `${user}:(AD,WD)`], { stdio: 'ignore' })
        denied = true
        const { code, stdout } = await runPwsh(exe, probeScript(dir))
        expect(code).toBe(0)
        expect(stdout).toContain('PROBE NOWRITABLE')
        expect(stdout).toContain('REPO YES')
      } finally {
        // 收回 deny ACE 后才能删目录（只拒了 AD/WD，WRITE_DAC 仍在自己手里）
        if (denied) { try { execFileSync('icacls', [dir, '/remove:d', user], { stdio: 'ignore' }) } catch { /* 回收失败不影响结论：目录在 TEMP 下 */ } }
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})
