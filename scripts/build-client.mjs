/**
 * 构建 client bundle（R1 路线 B）
 *
 * 把 src/client/ 多文件（entry/app/util/recall-node/settings-cards/css）经
 * esbuild 打包成单文件 lib/client.js。loader 契约（spike 核验）：插件 bundle
 * 以 classic <script> 原文 serve，只支持单文件 CJS 风格 factory 注册
 * （window.__ModuleLoader__.load({id, factory})），不支持 ESM 多文件相对
 * import——因此 react 标记 external，由 factory 的 require("react") 在运行时
 * 从 loader 平台模块表提供。
 *
 * 构建后做产物包裹格式断言，把 spike 结论钉成机器化门禁：产物必须是
 * factory(require) 包裹、含 __ModuleLoader__.load 注册、无顶层 import。
 *
 * F-G6 加固：路径用 import.meta.url 锚定（对齐 verify-host——非仓库根目录
 * 运行不写错位、entry 解析不落空）；冒烟断言补「注册 id 字面量未漂移」
 * （id 是 client 与 loader 的对接主键，改名即装不上）与「除 react 外无
 * 其他裸 require」（防未来误 import react-dom/第三方包被静默打进 bundle
 * 的 React 双副本隐患——external 白名单只此一家，新增运行时依赖必须显式
 * 改本脚本与 loader 模块表）。
 */

import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const outfile = path.join(root, 'lib', 'client.js')
const entry = path.join(root, 'src', 'client', 'entry.ts')

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  external: ['react'],
  outfile,
  target: ['es2020'],
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
})

// 产物包裹格式断言：spike 结论的回归钉。esbuild cjs 输出会把 factory 的
// require 参数重命名（如 require2）以避开自身模块 require，故断言不假设
// 参数名：只要求 factory 接收一个参数、该参数被用于加载 react、无顶层
// import/export（classic script 会拒载）。
const out = readFileSync(outfile, 'utf8')
if (!out.includes('window.__ModuleLoader__.load')) {
  throw new Error('build-client: 产物缺少 window.__ModuleLoader__.load 注册')
}
const factoryMatch = out.match(/factory:\s*\((\w+)\)/)
if (!factoryMatch) {
  throw new Error('build-client: 产物缺少 factory(参数) 包裹')
}
const reqParam = factoryMatch[1]
if (!out.includes(reqParam + '("react")')) {
  throw new Error('build-client: factory 参数未用于加载 react（react 须由 loader 的 require 运行时提供）')
}
if (/^\s*import\s/m.test(out) || /^\s*export\s/m.test(out)) {
  throw new Error('build-client: 产物含顶层 import/export（classic script 会拒载）')
}
// F-G6：注册 id 字面量未漂移——entry.js 的 id 与 loader/市场侧对接，改名字
// 面就装不上；esbuild 会把源码单引号规整为双引号，故按双引号形态断言。
if (!out.includes('"dsh-recall-plugin"')) {
  throw new Error('build-client: 产物缺少注册 id 字面量 "dsh-recall-plugin"（entry.js 的 id 被改？）')
}
// F-G6：除 react 外无其他裸 require——react 标记 external、loader 运行时
// 提供；任何新出现的 require 意味着第三方包被打进了 bundle（React 双副本/
// 意外依赖），必须显式评估后改本断言与 loader 模块表，而不是静默流出。
const requireCalls = [...out.matchAll(new RegExp(reqParam + '\\("([^"]+)"\\)', 'g'))].map((m) => m[1])
const unexpectedRequires = [...new Set(requireCalls.filter((name) => name !== 'react'))]
if (unexpectedRequires.length) {
  throw new Error('build-client: 产物出现 react 之外的 require: ' + unexpectedRequires.join(', ') + '（新增运行时依赖须显式改 external 白名单与 loader 模块表）')
}

console.log('[build-client] ok: ' + outfile + ' (' + out.length + ' bytes)')
