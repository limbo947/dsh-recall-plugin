#!/usr/bin/env node
/**
 * check-upgrade.mjs — dsh 升级后的一键核验门禁（E3）
 *
 * 背景：test:probe（官方字段探针）与 verify:host（装配门禁）依赖本机 dsh 安装，
 * 不进 CI——升级后跑不跑全凭人记，忘了跑探针第一道防线就失效。本脚本把
 * dsh 升级后的三层机器化核验串成一条命令：
 *   1. check:dsh — 版本巡检（四层比对：本地 dsh vs reference 镜像、本地 dsh vs
 *      docs/dsh-contract.md 契约文档、npm 最新 dsh vs peer 范围、npm 最新 vs 本地）；
 *   2. test:probe — 官方 API 字段探针（I2/I5/I6/I8/I27/I28 等，读本机 .d.ts）；
 *   3. verify:host — 装配门禁（inject 声明/端点注册/Config schema/settings 接入）。
 * 任一层失败即 exit 1，并在输出中提示按 compat-audit.md「复查动作」定点复查；
 * 全绿则提示在 compat-audit.md 头部追加核验记录（日期/版本/结果/漂移结论），
 * 并同步 docs/reference/README.md 归档版本字段与 docs/dsh-contract.md「对应版本」。
 *
 * 定位：本地开发门禁，不进 CI（与 test:probe/verify:host 同语义——无 dsh 的
 * 环境跑 check:dsh 与 probe 仍可整体通过/跳过，verify:host 无 dsh 自动 skip）。
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

const steps = [
  { name: 'check:dsh（版本巡检 / 镜像 + 契约文档漂移比对）', script: 'check:dsh' },
  { name: 'test:probe（官方 API 字段探针）', script: 'test:probe' },
  { name: 'verify:host（装配门禁）', script: 'verify:host' },
]

let failed = false
for (const step of steps) {
  console.log(`\n==> ${step.name}`)
  // win32 下 npm 是 .cmd 批处理，spawnSync 必须 shell: true 才能解析；shell: true
  // 时把命令拼成单字符串、args 传空数组，避免 Node DEP0190 拼接警告（args 均来自
  // 内部常量数组，无外部输入，拼接本身安全）。
  const win = process.platform === 'win32'
  const res = spawnSync(win ? `npm run ${step.script}` : 'npm', win ? [] : ['run', step.script], {
    cwd: root,
    stdio: 'inherit',
    shell: win,
  })
  if (res.status === 0) {
    console.log(`[check-upgrade] ok: ${step.name}`)
  } else {
    failed = true
    console.error(`[check-upgrade] FAIL: ${step.name}（exit ${res.status}）`)
  }
}

if (failed) {
  console.error('\n[check-upgrade] 存在失败步骤——按 AGENTS.md「dsh 升级后定点复查」与')
  console.error('compat-audit.md 各条目「复查动作」定位漂移，修复后重跑本命令。')
  process.exit(1)
}

console.log('\n[check-upgrade] 三层门禁全绿。')
console.log('下一步（人工，必做）：')
console.log('1. 在 docs/compat-audit.md 头部追加核验记录：日期 + 归档 dsh 版本 +')
console.log('   本命令结果 + I1-I31 逐条漂移结论（参考既有 alpha.4 核验段落格式）；')
console.log('2. 同步 docs/reference/README.md 头部「归档日期 / 归档 dsh 版本」字段，')
console.log('   同步 docs/dsh-contract.md 头部「对应版本」字段；')
console.log('3. 若有官方 API 假设变化，同步 AGENTS.md 合规清单、docs/dsh-contract.md 正文与本文台账。')
