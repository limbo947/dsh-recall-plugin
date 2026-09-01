/**
 * build-host.mjs — host 侧逐文件转译（bundle: false）
 *
 * 产物文件名与历史 lib/ 布局逐一相同：package-layout.test.js 白名单断言、
 * npm pack 文件集合、cordis.patch.yml 与 verify-host 全部零感知（上游 §2.1
 * 方案 A）。入口按 .ts 优先、.js 兜底解析：M4–M7 迁移期 src/host 内
 * .ts/.js 混居，本脚本不随迁移进度改动。
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const HOST_ENTRIES = [
  'index', 'store', 'snapshots', 'maintenance', 'routes-core', 'routes-manage',
  'config', 'diagnostics', 'errors', 'dump-parse', 'session-info',
  'scripts.pwsh', 'scripts.posix',
]

function resolveEntry(name) {
  for (const ext of ['.ts', '.js']) {
    const p = path.join(root, 'src', 'host', name + ext)
    if (fs.existsSync(p)) return p
  }
  throw new Error('build-host: 入口缺失 src/host/' + name + '.(ts|js)')
}

const entryPoints = {}
for (const name of HOST_ENTRIES) entryPoints[name] = resolveEntry(name)

await build({
  entryPoints,
  bundle: false,
  // import 说明符逐字透传：'./config.js' 维持产物间互引，@deepseek-ai/*
  // 裸导入交给 Node 运行时按 peerDependencies 解析
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outdir: path.join(root, 'lib'),
})
