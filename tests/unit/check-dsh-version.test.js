/**
 * P2-5 dsh 版本巡检脚本 — 纯函数单测（进 npm test，CI 同跑）
 *
 * 钉住 scripts/check-dsh-version.mjs 的语义：版本解析/比较、^~/精确范围
 * 匹配（含 prerelease）、报告组装（各差异分支的文案与 exit code）。
 * IO 胶水（npm 子进程、全局树探测）不在单测范围——与其他模块一致，
 * 环境相关逻辑靠真实运行验证。
 */

import { describe, it, expect } from 'vitest'
import {
  parseVersion, compareVersions, parseRange, satisfiesRange,
  buildReport, parseMirrorVersion, parseContractVersion,
} from '../../scripts/check-dsh-version.mjs'

describe('parseVersion', () => {
  it('解析正式版与 rc 预发布版', () => {
    expect(parseVersion('0.1.1-rc.2')).toEqual({ major: 0, minor: 1, patch: 1, pre: 'rc.2' })
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: null })
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: null })
    expect(parseVersion('0.1.1-alpha.1.beta')).toEqual({ major: 0, minor: 1, patch: 1, pre: 'alpha.1.beta' })
  })

  it('非法输入返回 null（不抛错）', () => {
    for (const bad of ['1.2', 'x.y.z', '', null, undefined, '1.2.3.4', 'latest']) {
      expect(parseVersion(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})

describe('compareVersions', () => {
  it('按 major/minor/patch 递增比较', () => {
    expect(compareVersions(parseVersion('1.0.0'), parseVersion('1.0.1'))).toBeLessThan(0)
    expect(compareVersions(parseVersion('0.2.0'), parseVersion('0.10.0'))).toBeLessThan(0)
    expect(compareVersions(parseVersion('2.0.0'), parseVersion('1.9.9'))).toBeGreaterThan(0)
    expect(compareVersions(parseVersion('1.2.3'), parseVersion('1.2.3'))).toBe(0)
  })

  it('正式版大于同序号的预发布版', () => {
    expect(compareVersions(parseVersion('0.1.1'), parseVersion('0.1.1-rc.2'))).toBeGreaterThan(0)
    expect(compareVersions(parseVersion('0.1.1-rc.2'), parseVersion('0.1.1'))).toBeLessThan(0)
  })

  it('prerelease 标识符：数字段按数值、数字 < 非数字', () => {
    expect(compareVersions(parseVersion('1.0.0-rc.10'), parseVersion('1.0.0-rc.2'))).toBeGreaterThan(0)
    expect(compareVersions(parseVersion('1.0.0-rc.2'), parseVersion('1.0.0-rc.2'))).toBe(0)
    expect(compareVersions(parseVersion('1.0.0-1'), parseVersion('1.0.0-alpha'))).toBeLessThan(0)
    expect(compareVersions(parseVersion('1.0.0-rc.2'), parseVersion('1.0.0-rc.2.1'))).toBeLessThan(0)
  })
})

describe('parseRange', () => {
  it('解析 ^ / ~ / 精确三种形态', () => {
    expect(parseRange('^0.1.1-rc.2')).toEqual({ op: '^', base: { major: 0, minor: 1, patch: 1, pre: 'rc.2' } })
    expect(parseRange('~1.2.3')).toEqual({ op: '~', base: { major: 1, minor: 2, patch: 3, pre: null } })
    expect(parseRange('1.2.3')).toEqual({ op: '=', base: { major: 1, minor: 2, patch: 3, pre: null } })
  })

  it('不支持的范围形态返回 null（fail-open）', () => {
    for (const bad of ['>=1.0.0', '*', '^1.2', '1.2.x', '1.x', 'latest', '', null]) {
      expect(parseRange(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})

describe('satisfiesRange', () => {
  it('^0.1.1-rc.2：锁 0.x 次版本线，下限含 rc 预发布', () => {
    expect(satisfiesRange('0.1.1-rc.2', '^0.1.1-rc.2')).toBe(true) // 等于下限
    expect(satisfiesRange('0.1.1', '^0.1.1-rc.2')).toBe(true) // 正式版大于 rc
    expect(satisfiesRange('0.1.9', '^0.1.1-rc.2')).toBe(true)
    expect(satisfiesRange('0.1.1-rc.1', '^0.1.1-rc.2')).toBe(false) // 早于下限
    expect(satisfiesRange('0.2.0', '^0.1.1-rc.2')).toBe(false) // 越 minor 上界
  })

  it('^ 语义：主版本 >0 锁主版本，^0.0.x 锁补丁', () => {
    expect(satisfiesRange('1.2.4', '^1.2.3')).toBe(true)
    expect(satisfiesRange('1.9.9', '^1.2.3')).toBe(true)
    expect(satisfiesRange('2.0.0', '^1.2.3')).toBe(false)
    expect(satisfiesRange('0.0.3', '^0.0.3')).toBe(true)
    expect(satisfiesRange('0.0.4', '^0.0.3')).toBe(false)
  })

  it('~ 锁次版本、精确匹配', () => {
    expect(satisfiesRange('1.2.9', '~1.2.3')).toBe(true)
    expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false)
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true)
    expect(satisfiesRange('1.2.4', '1.2.3')).toBe(false)
  })

  it('非法输入/不支持范围返回 null（fail-open）', () => {
    expect(satisfiesRange('abc', '^1.0.0')).toBeNull()
    expect(satisfiesRange('1.0.0', '>=1.0.0')).toBeNull()
  })
})

describe('parseMirrorVersion', () => {
  it('从 README 头部文本提取归档 dsh 版本（冒号中英文均识别）', () => {
    const text = [
      '# 官方文档镜像（reference）',
      '> 归档日期：2026-08-25，对应 deepseek-harness 仓库 master 分支 docs/ 目录。',
      '> 归档 dsh 版本：0.1.1-rc.2（npm run check:dsh 的漂移比对基准）',
    ].join('\n')
    expect(parseMirrorVersion(text)).toBe('0.1.1-rc.2')
    expect(parseMirrorVersion(text.replace('版本：', '版本:'))).toBe('0.1.1-rc.2')
  })

  it('字段缺失/非法输入返回 null（不抛错）', () => {
    expect(parseMirrorVersion('# 无版本字段的文本')).toBeNull()
    expect(parseMirrorVersion('')).toBeNull()
    expect(parseMirrorVersion(null)).toBeNull()
    expect(parseMirrorVersion(undefined)).toBeNull()
  })
})

describe('parseContractVersion', () => {
  it('从 dsh-contract.md 头部文本提取对应版本（双星号包裹 + dsh 前缀）', () => {
    const text = [
      '# DSH 契约文档（dsh-contract）',
      '> * 对应版本：**dsh 0.1.2-alpha.2**（tag `dsh-v0.1.2-alpha.2`，commit `0a53fb5`）',
    ].join('\n')
    expect(parseContractVersion(text)).toBe('0.1.2-alpha.2')
  })

  it('冒号中英文均识别、版本号后无多余字符', () => {
    const text = '> * 对应版本: **dsh 0.1.1-rc.2**（tag `dsh-v0.1.1-rc.2`）'
    expect(parseContractVersion(text)).toBe('0.1.1-rc.2')
  })

  it('字段缺失/非法输入返回 null（不抛错）', () => {
    expect(parseContractVersion('# 无对应版本字段的文本')).toBeNull()
    expect(parseContractVersion('')).toBeNull()
    expect(parseContractVersion('> * 对应版本：**dshell 0.1.0**')).toBeNull()
    expect(parseContractVersion(null)).toBeNull()
    expect(parseContractVersion(undefined)).toBeNull()
  })
})

describe('buildReport', () => {
  const peers = [{ name: '@deepseek-ai/dsh-shell', range: '^0.1.1-rc.2', installed: '0.1.1-rc.2' }]

  it('全部一致：exit 0 且无差异标记', () => {
    const r = buildReport({ local: '0.1.1-rc.2', mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: '0.1.1-rc.2', peers })
    expect(r.ok).toBe(true)
    expect(r.exitCode).toBe(0)
    expect(r.lines.join('\n')).toContain('全部一致')
    expect(r.lines.join('\n')).not.toMatch(/[⚠✗✘]/)
  })

  it('镜像漂移：本地 ≠ reference 记录，输出重拉提醒并 exit 1', () => {
    const r = buildReport({ local: '0.1.2', mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: '0.1.1-rc.2', peers })
    expect(r.ok).toBe(false)
    expect(r.exitCode).toBe(1)
    expect(r.lines.join('\n')).toContain('镜像漂移')
    expect(r.lines.join('\n')).toContain('重拉 reference/ 镜像')
  })

  it('peer 越界：npm 最新 dsh 超出 peer 范围，输出扩范围提醒并 exit 1', () => {
    const r = buildReport({ local: '0.1.1-rc.2', mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: '0.2.0', peers })
    expect(r.ok).toBe(false)
    expect(r.exitCode).toBe(1)
    expect(r.lines.join('\n')).toContain('不覆盖 npm 最新 dsh 0.2.0')
    expect(r.lines.join('\n')).toContain('扩 peer 范围')
  })

  it('本地实装版本越界：按子包报 ✗', () => {
    const bad = [{ name: '@deepseek-ai/dsh-shell', range: '^0.1.1-rc.2', installed: '0.2.0' }]
    const r = buildReport({ local: '0.1.1-rc.2', mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: '0.1.1-rc.2', peers: bad })
    expect(r.ok).toBe(false)
    expect(r.lines.join('\n')).toContain('本地已装 0.2.0 不在 peer 范围')
  })

  it('peer 包未装于全局/profile 树：跳过实装校验，不算差异', () => {
    const uninstalled = [{ name: '@deepseek-ai/dsh-settings', range: '^0.1.1-rc.2', installed: null }]
    const r = buildReport({ local: '0.1.1-rc.2', mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: '0.1.1-rc.2', peers: uninstalled })
    expect(r.ok).toBe(true)
    expect(r.lines.join('\n')).toContain('跳过实装校验')
  })

  it('无法解析的范围：警告并跳过，不误报差异', () => {
    const weird = [{ name: '@deepseek-ai/x', range: '>=1.0.0', installed: '1.2.3' }]
    const r = buildReport({ local: '0.1.1-rc.2', mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: '0.1.1-rc.2', peers: weird })
    expect(r.ok).toBe(true)
    expect(r.lines.join('\n')).toContain('无法解析')
  })

  it('非 dsh 线 peer（cordis/schemastery 独立版本线）：不做 npm 最新对比，仅本地实装校验', () => {
    // dsh 主包 0.1.1-rc.2 与 cordis ^4.0.1 是两套版本线，用主包版本号比对
    // 会永远误报越界——必须跳过 latest 对比
    const cordis = [{ name: '@deepseek-ai/cordis', range: '^4.0.1', installed: '4.1.0' }]
    const r = buildReport({ local: '0.1.1-rc.2', mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: '0.1.1-rc.2', peers: cordis })
    expect(r.ok).toBe(true)
    expect(r.lines.join('\n')).not.toContain('不覆盖 npm 最新')
    expect(r.lines.join('\n')).toContain('4.1.0 在范围内')
  })

  it('找不到本地 dsh：✗ 且 exit 1', () => {
    const r = buildReport({ local: null, mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: '0.1.1-rc.2', peers: [] })
    expect(r.ok).toBe(false)
    expect(r.lines.join('\n')).toContain('未找到本地已装 dsh')
  })

  it('reference 未记录归档版本：⚠ 提醒且 exit 1（无法确认一致）', () => {
    const r = buildReport({ local: '0.1.1-rc.2', mirror: null, contract: '0.1.1-rc.2', latest: '0.1.1-rc.2', peers: [] })
    expect(r.ok).toBe(false)
    expect(r.lines.join('\n')).toContain('未记录「归档 dsh 版本」')
  })

  it('npm 最新获取失败（离线）：降级为仅本地比对，不误报差异', () => {
    const r = buildReport({ local: '0.1.1-rc.2', mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: null, peers: [] })
    expect(r.ok).toBe(true)
    expect(r.lines.join('\n')).toContain('无法获取 npm 最新 dsh')
  })

  it('npm 最新版比本地新：提示可升级（不 fail，镜像基准由漂移层捕获）', () => {
    const r = buildReport({ local: '0.1.1-rc.2', mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: '0.1.2', peers })
    expect(r.ok).toBe(true)
    expect(r.lines.join('\n')).toContain('npm 最新 dsh 0.1.2 > 本地 0.1.1-rc.2')
  })

  it('契约文档漂移：本地 dsh ≠ dsh-contract.md 记录，输出重核提醒并 exit 1', () => {
    const r = buildReport({ local: '0.1.2', mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: '0.1.1-rc.2', peers })
    expect(r.ok).toBe(false)
    expect(r.exitCode).toBe(1)
    expect(r.lines.join('\n')).toContain('契约文档漂移')
    expect(r.lines.join('\n')).toContain('按 docs/dsh-contract.md 第七节指引重核契约')
  })

  it('契约文档未记录对应版本：⚠ 提醒且 exit 1（升级后须按第七节补写）', () => {
    const r = buildReport({ local: '0.1.1-rc.2', mirror: '0.1.1-rc.2', contract: null, latest: '0.1.1-rc.2', peers: [] })
    expect(r.ok).toBe(false)
    expect(r.exitCode).toBe(1)
    expect(r.lines.join('\n')).toContain('未记录「对应版本」')
  })

  it('契约版本一致：✓ 且不影响 exit code', () => {
    const r = buildReport({ local: '0.1.1-rc.2', mirror: '0.1.1-rc.2', contract: '0.1.1-rc.2', latest: '0.1.1-rc.2', peers: [] })
    expect(r.ok).toBe(true)
    expect(r.lines.join('\n')).toContain('与本地 dsh 一致')
  })
})
