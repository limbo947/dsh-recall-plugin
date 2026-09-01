/**
 * 两套脚本模板同名导出断言（P1-1）
 *
 * AGENTS.md 重要约束：scripts.pwsh.js 与 scripts.posix.js 必须同名导出——
 * 调用方统一走 rt.scripts.*（按 process.platform 单选），单侧漏导出只会
 * 在另一平台用户机器上以「不是函数」的怪异方式暴雷。store.js 装配时已有
 * 运行时 checkScriptParity 兜底（console.error），这里是机器化断言钉死，
 * 且加关键模板结构断言（快照脚本含 --ignore-errors、killOrphans 含
 * RECALL_CLEANUP 哨兵、带 store 的脚本维持 g= 赋值约定）——
 * AGENTS.md「已知坑」的回归钉。
 */

import { describe, it, expect } from 'vitest'
import * as pwsh from '../../src/host/scripts.pwsh.js'
import * as posix from '../../src/host/scripts.posix.js'

// 与 store.js checkScriptParity 的豁免集保持一致：
// 平台专属导出（homeDirScript 的 $h 链只在 pwsh 侧需要；probeHomeScript
// 只在 posix 侧用于 home 基底探测；legacyHomeMigrateScript 仅 posix 版
// 存在——旧容器迁移是 POSIX 漂移（I24）专属的存量数据兜底）。
// 豁免集事实源：src/types/scripts.ts 平台专属接口（PwshScripts/PosixScripts
// extends 差分）；本集合是它的单测侧镜像，tests/types satisfies 断言已编译期锁死。
// PF-2 起 fileWriteStdinCmd 两平台同名导出（stdin 单进程落盘），
// 旧的 pwsh 专属 fileWriteCmd（base64 分块）已整体移除。
const SKIP = new Set(['homeDirScript', 'probeHomeScript', 'legacyHomeMigrateScript'])

const pwshKeys = Object.keys(pwsh).filter((k) => !SKIP.has(k)).sort()
const posixKeys = Object.keys(posix).filter((k) => !SKIP.has(k)).sort()

// 提供 store 最少形状（extractGitDir 只读 store.git 字面量赋值）
const FAKE_STORE = { git: 'GIT_DIR', repo: 'REPO_DIR', excludeFile: 'EXCLUDE', home: true }

// 带 store 参数的脚本（注入 $g = '<store.git>' 赋值）——这些是 runShell 失败
// 兜底提取 git-dir 的目标集（store.js extractGitDir）；新增带 store 脚本模板
// 必须保持该约定（AGENTS.md 已知坑）。migrateScript 只取 src/dst、不经失败
// 兜底，单独豁免。
const STORE_SCRIPTS = {
  ensureGitScript: (api) => api.ensureGitScript(FAKE_STORE, 'git-exe', []),
  snapshotScript: (api) => api.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', []),
  diffScript: (api) => api.diffScript('ROOT', FAKE_STORE, 'git-exe', 'snap-1', []),
  rollbackScript: (api) => api.rollbackScript('ROOT', FAKE_STORE, 'git-exe', 'snap-1', []),
  listTagsScript: (api) => api.listTagsScript(FAKE_STORE, 'git-exe'),
  listTagsWithTimeScript: (api) => api.listTagsWithTimeScript(FAKE_STORE, 'git-exe'),
  gcScript: (api) => api.gcScript(FAKE_STORE, 'git-exe'),
  pruneScript: (api) => api.pruneScript(FAKE_STORE, 'git-exe'),
  purgeTagsScript: (api) => api.purgeTagsScript(FAKE_STORE, 'git-exe', ['snap-1']),
  rescueScript: (api) => api.rescueScript('ROOT', FAKE_STORE, 'git-exe', 'pre-rollback-1'),
}

describe('脚本模板同名导出契约', () => {
  it('两套模板导出键集合全等（含平台豁免集）', () => {
    expect(pwshKeys).toEqual(posixKeys)
  })

  it('平台专属导出各自存在且互不越界', () => {
    expect(typeof pwsh.homeDirScript).toBe('function')
    expect(pwsh.probeHomeScript).toBeUndefined()
    expect(pwsh.legacyHomeMigrateScript).toBeUndefined()
    expect(typeof posix.probeHomeScript).toBe('function')
    expect(typeof posix.legacyHomeMigrateScript).toBe('function')
    expect(posix.homeDirScript).toBeUndefined()
    // PF-2：分块写入实现整体移除（回退手段是 git revert，不是运行时分支）
    expect(pwsh.fileWriteCmd).toBeUndefined()
    expect(posix.fileWriteCmd).toBeUndefined()
  })

  it('PF-2：fileWriteStdinCmd 两平台同名——pwsh 走探针钉死的字节流形态，posix 是 cat', () => {
    // pwsh 读取手法由 tests/probe/stdin-write.test.js 实测钉死：
    // Console.In 在 PS 5.1 按 GBK 解码 UTF-8 stdin（必挂），必须
    // OpenStandardInput 读原始字节；落盘必须 .NET WriteAllText 无 BOM 重载
    // （PS 5.1 的 Set-Content -Encoding utf8 必带 BOM）
    const w = pwsh.fileWriteStdinCmd('some/file.tmp')
    expect(w).toContain('[Console]::OpenStandardInput()')
    expect(w).toContain('[IO.File]::WriteAllText($tmp, $text, [Text.UTF8Encoding]::new($false))')
    expect(w).not.toContain('[Console]::In')
    expect(w).not.toContain('Set-Content')
    expect(posix.fileWriteStdinCmd('some/file.tmp')).toBe("cat > 'some/file.tmp'")
  })

  for (const key of pwshKeys) {
    it(`${key} 两侧类型一致`, () => {
      const p = pwsh[key]
      const x = posix[key]
      if (typeof p === 'function') {
        expect(typeof x, 'posix.' + key).toBe('function')
      } else {
        // 常量（UTF8_PRELUDE / MAX_FILE_BYTES）类型也应一致
        expect(typeof x, 'posix.' + key).toBe(typeof p)
      }
    })
  }
})

describe('关键模板结构断言', () => {
  for (const [title, module] of [['pwsh', pwsh], ['posix', posix]]) {
    it(`${title}: snapshotScript 含 --ignore-errors（嵌套仓库 fail-open）`, () => {
      expect(module.snapshotScript('ROOT', { git: 'STORE_GIT' }, 'git-exe', 'm1', [])).toContain('--ignore-errors')
    })

    it(`${title}: killOrphansScript 含 RECALL_CLEANUP 哨兵（防递归清理）`, () => {
      expect(module.killOrphansScript('any/dir')).toContain('RECALL_CLEANUP')
    })

    // F-G2 防回归字面契约：rollbackScript（含内联的 collectListsBlock）里
    // 禁止裸 ` && ` 链——set -e 下条件为假的 && 列表会杀掉脚本或让 rm 失败
    // 被静默豁免，半回退假成功报 ROLLBACK_OK、救援永不触发。循环体一律 if/fi。
    it(`${title}: rollbackScript 不存在裸 ' && ' 链（set -e 循环体约定）`, () => {
      expect(module.rollbackScript('ROOT', FAKE_STORE, 'git-exe', 'snap-1', [])).not.toContain(' && ')
    })

    for (const [name, invoke] of Object.entries(STORE_SCRIPTS)) {
      it(`${title}: ${name}(store) 维持 g='<store.git>' 赋值约定`, () => {
        const script = invoke(module)
        expect(script.split(/\r?\n/).some((line) => /(?:^\$g|^g)\s*=\s*'GIT_DIR'/.test(line)),
          `${name} 未定义 g='GIT_DIR'（failed-check 提取 git-dir 依赖该约定）`).toBe(true)
      })
    }
  }

  it('两侧 UTF8_PRELUDE 非空（编码前导是 runShell 统一前置注入的契约）', () => {
    expect(pwsh.UTF8_PRELUDE.length).toBeGreaterThan(0)
    expect(posix.UTF8_PRELUDE.length).toBeGreaterThan(0)
  })

  // M3：清扫分级常量两侧必须同值——阈值漂移会让两平台对「多活跃实例」的
  // 保护窗口不一致（一侧让路一侧误杀，等于没治）。
  it('两侧 M3 常量同值（STALE_LOCK_MIN / HEARTBEAT_TTL_S）', () => {
    expect(pwsh.STALE_LOCK_MIN).toBe(posix.STALE_LOCK_MIN)
    expect(pwsh.HEARTBEAT_TTL_S).toBe(posix.HEARTBEAT_TTL_S)
  })

  it('killOrphansScript 三级出口标记两侧齐备', () => {
    for (const module of [pwsh, posix]) {
      const s = module.killOrphansScript('any/dir')
      for (const marker of ['RECALL_CLEANUP', 'CLEANUP_OTHER_INSTANCE', 'CLEANUP_SKIPPED_FRESH_LOCK', 'CLEANUP_DONE']) {
        expect(s, '缺少出口标记 ' + marker).toContain(marker)
      }
    }
  })

  it('心跳写入接线：ensureGit/snapshot 两个模板都写 heartbeat（清扫判定的时间源）', () => {
    for (const module of [pwsh, posix]) {
      expect(module.ensureGitScript(FAKE_STORE, 'git-exe', []), 'ensureGitScript 缺心跳写入').toContain('heartbeat')
      expect(module.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', []), 'snapshotScript 缺心跳写入').toContain('heartbeat')
      // diff/rollback 不写心跳是有意的：回退前必有安全快照刷新心跳，预览窗口
      // 由新锁分级兜底（见 plan-env-diagnostics M3 实施记录）
      expect(module.diffScript('ROOT', FAKE_STORE, 'git-exe', 'snap-1', [])).not.toContain('heartbeat')
    }
  })

  it('ensureGitScript（posix）init 竞态容忍：HEAD 复查放行同伴、真失败 exit 1 带诊断', () => {
    // WSL 实弹发现：冷启动首消息与预热并发时两个 git init 同跑，输家
    // fatal: cannot mkdir File exists → 首条消息快照丢失。模板必须「init
    // 失败后复查 $g/HEAD，同伴建成则继续，否则带 stderr exit 1」。
    const s = posix.ensureGitScript(FAKE_STORE, 'git-exe', [])
    expect(s).toContain('if [ ! -f "$g/HEAD" ]; then')
    expect(s).toContain('init_log=$("$git" init "$repo" 2>&1) || {')
    expect(s).toContain('exit 1')
    // 不允许退回裸 init（失败即中断、无复查）
    expect(s).not.toContain('|| "$git" init')
  })

  it('listTagsWithTimeScript 两侧输出契约：for-each-ref 带 creatordate:unix', () => {
    // rebuildOrphans 从 tag creatordate 恢复快照时间（time=0 改进）——
    // 两侧格式必须逐字对齐（snapshots.js parseTagsWithTime 按同一形状解析）
    for (const module of [pwsh, posix]) {
      const s = module.listTagsWithTimeScript(FAKE_STORE, 'git-exe')
      expect(s).toContain('for-each-ref')
      expect(s).toContain('%(refname:short) %(creatordate:unix)')
      expect(s).toContain('refs/tags/snap-*')
    }
  })

  it('ensureGitScript 固化 info/attributes 字节保真（issue #12）', () => {
    // git archive/add 都会应用快照树里项目自己的 .gitattributes——影子仓库
    // 必须用 info/attributes（最高优先级属性源）一票否决，否则 text=auto
    // 项目回退后 LF 变 CRLF（issue #12 实证）。两侧常量必须逐字同值，
    // 且 ensureGitScript 必须把该内容写进 info/attributes。
    expect(pwsh.FIDELITY_ATTRS).toBe(posix.FIDELITY_ATTRS)
    expect(pwsh.FIDELITY_ATTRS).toContain('-text')
    for (const [title, module] of [['pwsh', pwsh], ['posix', posix]]) {
      const s = module.ensureGitScript(FAKE_STORE, 'git-exe', [])
      expect(s, title + ' 缺 info/attributes 固化内容').toContain(module.FIDELITY_ATTRS)
      expect(s, title + ' 未写 attributes 文件').toContain('attributes')
    }
  })

  it('snapshotScript 含一次性 renormalize 迁移（issue #12 存量归一化）', () => {
    // 属性固化后旧索引条目仍指向归一化 blob，stat 缓存时序依赖地跳过重哈希
    // ——需要 --renormalize 一次性迁移；无 pathspec 的 renormalize 是空操作
    // （实测），必须带 ':(top)' 顶层魔法 pathspec，且有标记文件防重复。
    for (const [title, module] of [['pwsh', pwsh], ['posix', posix]]) {
      const s = module.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', [])
      expect(s, title + ' 缺 --renormalize').toContain('--renormalize')
      expect(s, title + ' 缺 :(top) 魔法 pathspec').toContain('\':(top)\'')
      expect(s, title + ' 缺迁移标记文件').toContain('attrs-v1.stamp')
    }
  })

  it('PF-1：diff/snapshot 脚本输出 TREE 行（index 树指纹，execute STALE 比对依据）', () => {
    const snap = pwsh.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', [])
    const diff = pwsh.diffScript('ROOT', FAKE_STORE, 'git-exe', 'snap-1', [])
    expect(snap, 'pwsh snapshotScript 缺 TREE 输出').toContain("Write-Output ('TREE ' + $tree)")
    expect(diff, 'pwsh diffScript 缺 write-tree 探测').toContain('write-tree')
    expect(diff, 'pwsh diffScript 缺 TREE 输出').toContain("Write-Output ('TREE ' + $tree)")
    // POSIX 侧形态（echo "TREE $tree"）
    const pSnap = posix.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', [])
    const pDiff = posix.diffScript('ROOT', FAKE_STORE, 'git-exe', 'snap-1', [])
    expect(pSnap, 'posix snapshotScript 缺 TREE 输出').toContain('echo "TREE $tree"')
    expect(pDiff, 'posix diffScript 缺 write-tree 探测').toContain('write-tree')
    expect(pDiff, 'posix diffScript 缺 TREE 输出').toContain('echo "TREE $tree"')
  })

  it('PF-1：pwsh diffScript 输出 TOTAL 行且 JSON 截断数由参数注入（不硬编码）', () => {
    const s = pwsh.diffScript('ROOT', FAKE_STORE, 'git-exe', 'snap-1', [], 300)
    expect(s).toContain("Write-Output ('TOTAL ' + $sorted.Count)")
    expect(s).toContain('Select-Object -First 300')
    // 缺省 500 兜底（直调模板的安全默认）
    expect(pwsh.diffScript('ROOT', FAKE_STORE, 'git-exe', 'snap-1', [])).toContain('Select-Object -First 500')
    // POSIX 侧无 TOTAL（TSV 全量输出，total 由 JS 侧按解析条数计）
    expect(posix.diffScript('ROOT', FAKE_STORE, 'git-exe', 'snap-1', [])).not.toContain('TOTAL')
  })

  it('PF-3：pwsh 全量枚举换 .NET 手动栈遍历（Get-ChildItem -Recurse 退役）', () => {
    // PS 5.1 可用的 .NET 4.x 没有 AllDirectories 的 SkipUnavailable——必须
    // 手动 Stack 逐目录 try/catch 才能与 SilentlyContinue 的逐项容错对齐
    const snap = pwsh.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', [])
    expect(snap).toContain('[System.Collections.Generic.Stack[string]]::new()')
    expect(snap).toContain('EnumerateFiles()')
    expect(snap).not.toContain('Get-ChildItem -LiteralPath $root -Recurse')
    const usage = pwsh.diskUsageScript('any/dir')
    expect(usage).toContain('EnumerateFiles()')
    expect(usage).not.toContain('Get-ChildItem')
    // POSIX 侧 find/du 本就高效，按计划不动
    expect(posix.diskUsageScript('any/dir')).toContain('du -sk')
    expect(posix.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', [])).toContain('find "$root"')
  })

  it('PF-4：storesDumpScript 输出 LINEAGE 段（与 INDEX 段同构，两平台同构）', () => {
    for (const module of [pwsh, posix]) {
      const s = module.storesDumpScript('CONTAINER', ['/extra'])
      for (const marker of ['LINEAGEBEGIN', 'LINEAGEEND', 'INDEXBEGIN', 'INDEXEND', '==DIR ', 'ROOT ']) {
        expect(s, '缺少标记 ' + marker).toContain(marker)
      }
    }
    // 段内读取的目标文件名
    expect(pwsh.storesDumpScript('', [])).toContain("'lineage.json'")
    expect(posix.storesDumpScript('', [])).toContain('"$d/lineage.json"')
  })

  it('PF-8：excludeDumpScript 两平台同名——内容 base64 单行传输（任意文本免疫）', () => {
    const files = ['/a/exclude.txt', '/b/exclude.txt']
    for (const module of [pwsh, posix]) {
      const s = module.excludeDumpScript(files)
      expect(s).toContain('EXCLBEGIN ')
      expect(s).toContain('EXCLEND')
    }
    // pwsh 用 ReadAllBytes+ToBase64String（不碰代码页）；POSIX tr 去折行兼容 GNU/BSD
    expect(pwsh.excludeDumpScript(files)).toContain('[Convert]::ToBase64String([IO.File]::ReadAllBytes')
    expect(posix.excludeDumpScript(files)).toContain('base64 ')
    expect(posix.excludeDumpScript(files)).toContain("tr -d '\\n'")
  })

  it('PF-9：excludeSync 条件化（内容未变跳过重写与清理循环）两侧齐备', () => {
    // pwsh：逐行比对（Get-Content 剥 BOM/行尾，免疫 5.1 BOM 与 LF/CRLF 差异）
    const pwshSnap = pwsh.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', [])
    expect(pwshSnap).toContain('$same = ($excOld.Count -eq $lines.Count)')
    expect(pwshSnap).toContain('if (-not $same) {')
    // posix：命令替换对两侧同样剥尾随换行后比对
    const posixSnap = posix.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', [])
    expect(posixSnap).toContain('if [ "$new_exc" != "$old_exc" ]; then')
  })

  it('PF-9：update-index 合批（多路径合参，N 次 fork → N/100 或 xargs 自适应）', () => {
    // pwsh：显式 100 条/批（与 purgeTags 分块同款纪律）
    const pwshSnap = pwsh.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', [])
    expect(pwshSnap).toContain('for ($i = 0; $i -lt $oversizeRel.Count; $i += 100) {')
    expect(pwshSnap).toContain('for ($i = 0; $i -lt $hit.Count; $i += 100) {')
    // 旧的逐条 update-index（对单个 $rel / $_ 调用）退役
    expect(pwshSnap).not.toContain('update-index --force-remove -- $_')
    expect(pwshSnap).not.toContain("Replace('\\','/')\n        & $git")
    // posix：xargs -0 自适应批次（空格/中文路径不分裂），excludeSync + oversize 两处
    const posixSnap = posix.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', [])
    expect(posixSnap.match(/xargs -0/g).length).toBe(2)
    // oversize 侧不再逐条（" $rel" 逐条退役）；dropGitlinks 的逐条 "$p" 是
    // PF-9 方案明确「保留不动」的（gitlink 常态 0 条，无收益）
    expect(posixSnap).not.toContain('update-index --force-remove -- "$rel"')
  })
})

describe('F-S1 rescue tag 前缀契约（跨函数）', () => {
  // S1 漏网口：snapshotScript 打 tag 无条件加 snap- 前缀，rescueScript 接受
  // 完整 tag 名——若调用侧（snapshots.js rescueRollback）忘记拼前缀，reset
  // 目标必然 unknown revision 且救援 100% 走失败分支。假模板单测测不到这种
  // 跨函数约定，这里把「snapshotScript 的 tag 命令」与「rescueScript('snap-' + id)
  // 的 reset 目标」钉成同一个名字，前缀规则漂移即红。
  for (const [title, module] of [['pwsh', pwsh], ['posix', posix]]) {
    it(`${title}: snapshotScript 打的 tag 与 rescueScript('snap-'+id) 的 reset 目标同名`, () => {
      const snap = module.snapshotScript('ROOT', FAKE_STORE, 'git-exe', 'm1', [])
      const tagM = snap.match(/tag -f '([^']+)'/)
      expect(tagM, 'snapshotScript 未找到 tag -f 命令').toBeTruthy()
      const rescue = module.rescueScript('ROOT', FAKE_STORE, 'git-exe', 'snap-m1')
      const resetM = rescue.match(/reset --hard '([^']+)'/)
      expect(resetM, 'rescueScript 未找到 reset --hard 目标').toBeTruthy()
      expect(resetM[1]).toBe(tagM[1])
    })
  }
})