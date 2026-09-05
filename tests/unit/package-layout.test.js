/**
 * 发布包内容布局断言（P1-1；P2-4 收口补齐）
 *
 * npm pack --dry-run --json 输出包里实际会安装的文件，据此钉住 files 白名单：
 * - 运行时文件必须进包（lib/、cordis.patch.yml、README、LICENSE、package.json）；
 * - 仓库开发文件绝不进包（AGENTS.md / docs/（含 docs/reference 镜像）/ tests/ / scripts/——
 *   AGENTS.md 已在 .gitignore 中确认不进 npm，这里从 pack 输出侧再兜一道；
 *   scripts/ 是 P2-5 起的发布前巡检脚本，同样不是运行时产物）。
 * 借鉴 turn-rewind 的 package-layout 思路，用 node:child_process 跑产物断言，
 * 比 CI shell 步骤更可移植（跨平台跑同一份逻辑）。
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let files = []
beforeAll(() => {
  // Windows 上 npm 是 .cmd 批处理：直接 spawn 会 EINVAL，shell 又会触发
  // DEP0190 弃用噪音——探测 npm-cli.js 用 node 直跑最干净；找不到时才
  // 退回 shell（参数是固定白名单，无注入面）。
  let cmd = 'npm'
  let args = ['pack', '--dry-run', '--json']
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ]
    const cli = candidates.find((c) => fs.existsSync(c))
    if (cli) { cmd = process.execPath; args = [cli, ...args] }
  }
  const stdout = execFileSync(cmd, args, {
    cwd: path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    encoding: 'utf8',
    shell: process.platform === 'win32' && cmd === 'npm',
  })
  const parsed = JSON.parse(stdout)
  const item = Array.isArray(parsed) ? parsed[0] : parsed
  files = (item && Array.isArray(item.files) ? item.files : []).map((f) => f.path)
})

describe('npm 发布包内容', () => {
  it('pack --dry-run 能正常出包', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('运行时文件全部在包内', () => {
    const required = [
      'lib/index.js', 'lib/client.js', 'lib/config.js', 'lib/store.js',
      'lib/snapshots.js', 'lib/maintenance.js', 'lib/scripts.pwsh.js',
      'lib/scripts.posix.js', 'cordis.patch.yml', 'README.md', 'LICENSE',
      'package.json',
    ]
    for (const rel of required) expect(files, 'pack 缺少 ' + rel).toContain(rel)
  })

  it('仓库开发文件不进包（AGENTS.md / docs / tests / scripts）', () => {
    for (const disallowed of ['AGENTS.md', 'docs/', 'tests/', 'scripts/']) {
      expect(files.some((f) => f.startsWith(disallowed)), 'pack 泄漏 ' + disallowed).toBe(false)
    }
  })
})