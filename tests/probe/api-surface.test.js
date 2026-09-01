/**
 * 官方 API 字段探针（tests/probe/，仅本地跑：npm run test:probe）
 *
 * 原理：直接读取本机 dsh 安装目录的真实 .d.ts，断言插件依赖的官方字段存在。
 * 与运行时同源——dsh 升级后本探针先红，这正是想要的预警（P1-1）。
 * 每条探针对应一个历史坑或现有调用点，把 AGENTS.md 合规清单 #8
 * （禁字段假设）从纪律变成断言。
 *
 * 定位：优先环境变量 DSH_ROOT；否则 %APPDATA%\npm\node_modules\@deepseek-ai\dsh
 * （npm 全局安装默认路径）。找不到时整体 skip（黄）——没装 dsh 的
 * 贡献者/CI 不被卡死；装了的机器本地必跑（AGENTS.md 开发与验证节）。
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

function dshRoot() {
  if (process.env.DSH_ROOT) return process.env.DSH_ROOT
  const global = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh')
  return fs.existsSync(global) ? global : null
}

const ROOT = dshRoot()
const PKG = (name) => path.join(ROOT, 'node_modules', '@deepseek-ai', name)
const read = (pkg, rel) => fs.readFileSync(path.join(PKG(pkg), rel), 'utf8')

// 命中文件才跑探针；文件缺失/目录缺失 skip（黄），不 fail
const probeIf = (guard) => (name, fn) => it(name, () => {
  if (!ROOT || !guard()) return // local-only：无 dsh 环境直接跳过
  fn()
})

describe('官方 API 字段探针（dsh 安装目录）', () => {
  const has = (pkg, rel) => fs.existsSync(path.join(PKG(pkg), rel))

  describe('chat.node slot props（issue #9 钉子）', () => {
    // 0.1.2-alpha.2 起声明迁至 dsh-client-ui-chat（ui-chat 包名），旧版在
    // dsh-client-ui-conversation（0.1.2-alpha.1 及以前）。双路径任一命中即验
    // 证——探针跟着官方包布局走，避免升级后误红。
    const chat = { p: 'dsh-client-ui-chat', f: '/lib/types/client/contract/slots.d.ts' }
    const conv = { p: 'dsh-client-ui-conversation', f: '/lib/types/client/contract/slots.d.ts' }
    const find = () => (has(chat.p, chat.f) ? chat : has(conv.p, conv.f) ? conv : null)
    const guard = () => Boolean(find())

    probeIf(guard)('renderMessageImages 是官方字段（曾读不存在的 loadImage）', () => {
      const { p, f } = find()
      expect(read(p, f)).toMatch(/renderMessageImages/)
      // 契约明确剔除 loadImage——`Omit<MessageImagesOwnerProps, 'loadImage'>`
      // 是「渲染入口只有 renderMessageImages」的机器化表达；单匹配 loadImage
      // 会被字面量误放行（字面量作为被 Omit 剔除的名字也存在），必须匹配整型。
      // RenderMessageImages 类型定义现居 ui-conversation（chat 包仅 re-export）
      expect(read(conv.p, conv.f)).toMatch(/Omit<MessageImagesOwnerProps,\s*'loadImage'>/)
    })

    probeIf(guard)('node 字段存在（消息节点渲染 props 的官方命名）', () => {
      const { p, f } = find()
      expect(read(p, f)).toMatch(/node:\s*ChatNode</)
    })

    probeIf(guard)('cwd 字段存在（会话工作区路径显示契约）', () => {
      const { p, f } = find()
      expect(read(p, f)).toMatch(/cwd\??:\s*string/)
    })
  })

  describe('ConversationNode 节点集合（I5：user/steering 覆盖 + 官方新增节点即红）', () => {
    // I5 只注册 user+steering 两个 keyed key；节点投影 kind 全集以 records.d.ts 的
    // ConversationNode union 成员为代理。官方新增 surface 节点类型（= 新投影 kind）时
    // 本断言红，逼人评估是否需注册对应撤回按钮 key——context（alpha.1 新增）已在清单，
    // 评估无害（注入行不需要撤回按钮，落官方默认渲染即可）。
    const p = 'dsh-client-ui-conversation'
    const f = '/lib/types/client/contract/records.d.ts'
    const guard = () => has(p, f)

    probeIf(guard)('ConversationNode 成员与已知清单一致（官方新增投影 kind 即红）', () => {
      const src = read(p, f)
      const m = src.match(/export type ConversationNode = ([\s\S]*?);/)
      expect(m).toBeTruthy()
      const members = new Set(
        [...m[0].matchAll(/([A-Z][A-Za-z]*Node)/g)]
          .map((x) => x[1])
          .filter((x) => x !== 'ConversationNode')
      )
      expect([...members].sort()).toEqual(
        ['AssistantMessageNode', 'CommandNode', 'CompactionSummaryNode', 'ContextMessageNode',
         'ModelRetryNode', 'SteeringMessageNode', 'ToolResultNode', 'TurnErrorNode',
         'TurnMaxTokensNode', 'UnknownSurfaceNode', 'UserMessageNode'].sort()
      )
    })

    probeIf(guard)('user 与 steering 节点仍在集合（撤回按钮覆盖的两个 keyed key）', () => {
      const src = read(p, f)
      expect(src).toMatch(/export interface UserMessageNode/)
      expect(src).toMatch(/export interface SteeringMessageNode/)
    })
  })

  describe('ChatNode.id 语义（I4：id=消息 ID、key=位置键）', () => {
    // node.id 是快照主键、node.key 是位置键——字段分离是撤回按 id 查询的前提；
    // 官方把两字段合并/改名即红。
    const p = 'dsh-client-ui-conversation'
    const f = '/lib/types/client/contract/conversation.d.ts'
    const guard = () => has(p, f)

    probeIf(guard)('ConversationViewNode 同时声明 id 与 key（分离语义未变）', () => {
      const m = read(p, f).match(/export interface ConversationViewNode \{[\s\S]*?\n\}/)
      expect(m).toBeTruthy()
      expect(m[0]).toMatch(/readonly id: string/)
      expect(m[0]).toMatch(/readonly key: string/)
    })
  })

  describe('sessions.fork 签名（1.6.x 行为回归钉）', () => {
    // 0.1.2 起 client/runtime 包整体删除（I29），fork 契约迁入 dsh-api-session-controller
    // 新包；旧包路径留作兜底。双路径任一命中即验——探针跟着官方包布局走，避免升级后
    // 误黄（原单路径指 dsh-client-runtime 在 alpha.3 下静默 skip，I6 实际零断言）。
    const api = { p: 'dsh-api-session-controller', f: '/lib/types/client/contract/sessions.d.ts' }
    const rt = { p: 'dsh-client-runtime', f: '/lib/types/client/contract/sessions.d.ts' }
    const find = () => (has(api.p, api.f) ? api : has(rt.p, rt.f) ? rt : null)
    const guard = () => Boolean(find())

    probeIf(guard)('fork 接受对象形态 { sessionId, atSeq?, increaseTitle? }', () => {
      const { p, f } = find()
      const src = read(p, f)
      expect(src).toMatch(/fork\(opts:\s*\{/)
      expect(src).toMatch(/sessionId:\s*SessionId/)
    })

    probeIf(guard)('atSeq 仍是可选项（变必填即红：不锚定 cut 的调用点会漏参数）', () => {
      // 严格匹配 `atSeq?:`——`\?` 必须出现，未来官方收紧为必填时探针红
      expect(read(find().p, find().f)).toMatch(/atSeq\?:\s*number/)
    })

    probeIf(guard)('increaseTitle 仍是可选项（本项目 fork 不传它，标题「xxx 2」回归钉）', () => {
      // 若未来 increaseTitle 变成必填，本探针红
      expect(read(find().p, find().f)).toMatch(/increaseTitle\?:\s*boolean/)
    })
  })

  describe('sessionQuery.listSessions 记录结构（1.5.2 坑钉子）', () => {
    const p = 'dsh-session-query'
    const f = '/lib/types/corpus.d.ts'
    const guard = () => has(p, f)

    probeIf(guard)('SessionRecord.header 为 SessionHeader，listSessions 存在', () => {
      const src = read(p, f)
      // id 在 header.id——误读 record.id 恒 undefined（1.5.2 修过预热路径）
      expect(src).toMatch(/header:\s*SessionHeader/)
      expect(src).toMatch(/listSessions\s*\(/)
    })

    probeIf(guard)('SessionRecord 顶层不含 id 字段（未来官方加顶层 id 即红，预热路径可简化）', () => {
      // SessionRecord 定义住在 types.d.ts（corpus.d.ts 只是 re-import）
      const m = read('dsh-session-query', '/lib/types/types.d.ts').match(/export interface SessionRecord \{[\s\S]*?\n\}/)
      expect(m).toBeTruthy()
      expect(m[0]).toMatch(/header: SessionHeader/)
      expect(m[0]).not.toMatch(/\bid\s*:/)
    })
  })

  describe('SessionHeader 字段形状（PF-7 探针：titles 半项废弃依据）', () => {
    // SessionHeader 定义住在 dsh-session（corpus.d.ts 只是 re-import）
    const p = 'dsh-session'
    const f = '/lib/types/types.d.ts'
    const guard = () => has(p, f)

    probeIf(guard)('header.id 存在（sweep 判定只依赖 id 的形状前提）', () => {
      const m = read(p, f).match(/interface SessionHeader \{[\s\S]*?\n\}/)
      expect(m).toBeTruthy()
      expect(m[0]).toMatch(/readonly id:\s*SessionId/)
    })

    probeIf(guard)('header 不含 title（2026-08-29 PF-7 前置核验：冷标题无法走 listSessions，titles 半项废弃；未来若加 title 本探针红，提示可重启 titles 优化）', () => {
      const m = read(p, f).match(/interface SessionHeader \{[\s\S]*?\n\}/)
      expect(m).toBeTruthy()
      expect(m[0]).not.toMatch(/readonly title/)
    })
  })

  describe('AgentRegistry / AgentStatus（P0-1 依赖）', () => {
    const p = 'dsh-agent'
    const guardA = () => has(p, '/lib/types/index.d.ts')
    const guardB = () => has(p, '/lib/types/runtime-types.d.ts')

    probeIf(guardA)('AgentRegistry.get(id) 与 list() 存在', () => {
      const src = read(p, '/lib/types/index.d.ts')
      expect(src).toMatch(/\bget\(/)
      expect(src).toMatch(/\blist\(/)
    })

    probeIf(guardB)('Agent.status ∈ idle | running', () => {
      expect(read(p, '/lib/types/runtime-types.d.ts')).toMatch(/idle|running/)
    })

    probeIf(() => has('dsh-session', '/lib/types/types.d.ts'))('Agent.session.header.cwd 存在（跨会话比对用）', () => {
      expect(read('dsh-session', '/lib/types/types.d.ts')).toMatch(/cwd\??:\s*string/)
    })
  })

  describe('settings RPC 契约（config-reset 依赖，S1-3）', () => {
    // 0.1.2 起 dsh-host-apiproxy 拆分，settings RPC 迁入 dsh-api-settings-controller
    // （replace/mutate 为 typert Remote 方法）；旧包路径留兜底。op set/unset 的
    // 类型面统一住在 dsh-settings/types 的 SettingsPathOpView。
    const api = { p: 'dsh-api-settings-controller', f: '/lib/index.js' }
    const old = { p: 'dsh-host-apiproxy', f: '/lib/types/api/settings.d.ts' }
    const find = () => (has(api.p, api.f) ? api : has(old.p, old.f) ? old : null)
    const guard = () => Boolean(find())

    probeIf(guard)('replace/mutate 契约存在（恢复默认的官方 reset 路径）', () => {
      const { p, f } = find()
      const src = read(p, f)
      if (p.startsWith('dsh-api-settings-controller')) {
        // 新包是 Remote 方法：断言 decorator 元数据里的方法名
        expect(src).toMatch(/name: "replace"/)
        expect(src).toMatch(/name: "mutate"/)
      } else {
        // 旧包 .d.ts：RpcRequest<{ns, section}> 形态
        expect(src).toMatch(/replace\(request:\s*RpcRequest<\{/)
      }
    })

    probeIf(guard)('mutate 支持路径级 unset op（清除单字段的通道）', () => {
      // op set/unset 的类型面统一在 dsh-settings/types（SettingsPathOpView）
      expect(has('dsh-settings', '/lib/types/types.d.ts')).toBe(true)
      const src = read('dsh-settings', '/lib/types/types.d.ts')
      expect(src).toMatch(/op: 'set'/)
      expect(src).toMatch(/op: 'unset'/)
    })
  })

  describe('ShellRunResult.stdout CollectedOutput（F-G3 索引截断判定依赖）', () => {
    const p = 'dsh-shell'
    const f = '/lib/types/types.d.ts'
    const guard = () => has(p, f)

    probeIf(guard)('ShellRunResult.stdout 是 CollectedOutput（runShellMeta 读取载体）', () => {
      expect(read(p, f)).toMatch(/stdout:\s*CollectedOutput/)
    })

    probeIf(guard)('CollectedOutput.truncated 存在（截断可判定，loadIndex 据此区分截断/损坏）', () => {
      // CollectedOutput 定义住在 dsh-subprocess（dsh-shell re-export）；
      // 截断时 text 只剩流尾部——这是「截断 ≠ 损坏」分支的官方事实依据
      const sub = read('dsh-subprocess', '/lib/types/types.d.ts')
      expect(sub).toMatch(/truncated:\s*boolean/)
      expect(sub).toMatch(/spillPath\?:/)
    })
  })

  describe('keyed slot shadowing priority（I1：guard 强制分配，插件 priority 被覆盖）', () => {
    // 0.1.2 起 runner guard 的 register 代理强制分配 shadowing priority
    // （「later registrations sort first」）；插件传入的 priority 被覆盖、app.js
    // 的负值递减重试循环失效但无害（I29）。删除/改名即红，提示复核覆盖语义。
    const p = 'dsh-cordis-client-runner'
    const f = '/lib/types/client/guard.d.ts'
    const guard = () => has(p, f)

    probeIf(guard)('register 代理仍分配 shadowing priority（强制覆盖的实证面）', () => {
      const src = read(p, f)
      expect(src).toMatch(/allocatePriority\(\)/)
      expect(src).toMatch(/shadowing/)
    })
  })

  describe('slots.entries 快照与 StoredEntry 形状（I31：动态避让的读取面）', () => {
    // nextShadowPriority 在 slots.inject 回调里调 slots.entries 读同 key 已占用的
    // priority。0.1.2 起声明在 ui-renderer registry.d.ts；0.1.1-rc.2 在
    // dsh-client-runtime（双包探测，任一命中即验）。方法删除/改名即红。
    const cur = { p: 'dsh-client-ui-renderer', f: '/lib/types/client/registry.d.ts' }
    const old = { p: 'dsh-client-runtime', f: '/lib/types/client/slots.d.ts' }
    const find = () => (has(cur.p, cur.f) ? cur : has(old.p, old.f) ? old : null)
    const guard = () => Boolean(find())

    probeIf(guard)('entries(key) 仍返回 readonly StoredEntry[]', () => {
      const { p, f } = find()
      expect(read(p, f)).toMatch(/entries\(key[^)]*\):\s*readonly StoredEntry\[\]/)
    })

    // StoredEntry 本体不随 .d.ts 发布（ui-slots 声明内嵌在 runner 构建产物的
    // 声明表里），只能在产物中断言形状；options 的 key/priority 是避让算法的
    // 全部字段假设。窗口放宽到 200/400 字符以容忍声明表重排版。
    probeIf(() => has('dsh-cordis-client-runner', '/lib/client.js'))('StoredEntry.options 仍含 key/priority（nextShadowPriority 字段假设）', () => {
      const src = read('dsh-cordis-client-runner', '/lib/client.js')
      expect(src).toMatch(/interface StoredEntry[\s\S]{0,200}options:\s*\{[\s\S]{0,400}key\?:\s*string;[\s\S]{0,400}priority\?:\s*number/)
    })
  })

  describe('standardProps/renderEntry 合成（I3：kit 最先展开、ownerProps 同名覆盖）', () => {
    // 合成顺序 `{...kit, ...injected, ...slotInjected.props, ...ownerProps}` 是
    // renderer 构建产物实现；探针只钉「函数仍存在」最低门槛（删除/改名即红），
    // 顺序语义核对留复查动作（产物内部结构频繁变化，不宜钉死正则）。
    const p = 'dsh-client-ui-renderer'
    const f = '/lib/client.js'
    const guard = () => has(p, f)

    probeIf(guard)('standardProps 与 renderEntry 仍存在', () => {
      const src = read(p, f)
      expect(src).toMatch(/function standardProps\(/)
      expect(src).toMatch(/function renderEntry\(/)
    })
  })

  describe('archiveSession 契约（I7：归档 = 分组表面隐藏、日志保留）', () => {
    // F1 用 Host 记录 fork lineage 绕过「归档会话不可列举」的限制；方法删除或
    // 改路由（不再经 workspaceRegistry）即红。
    const p = 'dsh-api-workspace-controller'
    const f = '/lib/index.js'
    const guard = () => has(p, f)

    probeIf(guard)('archiveSession Remote 方法存在且路由 workspaceRegistry', () => {
      const src = read(p, f)
      expect(src).toMatch(/name: "archiveSession"/)
      expect(src).toMatch(/workspaceRegistry\.archiveSession/)
    })
  })

  describe('ctx.sessions 内存 store（I9：list 冷启动为空，依赖磁盘兜底）', () => {
    // SessionStore 是纯内存 Map（无持久化，重放由持久化插件经 session/event 填充）；
    // 若官方改为可枚举持久化源，resolveHomeContainer 磁盘兜底可相应简化。
    const p = 'dsh-session'
    const f = '/lib/index.js'
    const guard = () => has(p, f)

    probeIf(guard)('SessionStore 仍是服务名 sessions + 内存 Map 形态', () => {
      const src = read(p, f)
      expect(src).toMatch(/super\(ctx, "sessions"\)/)
      expect(src).toMatch(/store = .*new Map\(\)/)
    })
  })

  describe('settings.plugin.item keyed-by-namespace（I12：卡片 key 与 Host namespace 一致）', () => {
    // 卡片按 settings namespace 分发（entryKey）；key 与 namespace（dsh-recall）
    // 不一致时卡片静默不渲染——类型面仍是 keyed + root 即视为语义未变。
    const p = 'dsh-client-ui-settings-plugins'
    const f = '/lib/types/client/slot-contract.d.ts'
    const guard = () => has(p, f)

    probeIf(guard)('slot 仍是 keyed + root scope（namespace 分发语义的类型面）', () => {
      const src = read(p, f)
      expect(src).toMatch(/'settings\.plugin\.item'/)
      expect(src).toMatch(/kind: 'keyed'/)
      expect(src).toMatch(/scope: 'root'/)
    })
  })

  describe('DSH_* 变量注册表（I18：模型侧 shell 工具只见注册表产出）', () => {
    // DSH_* 由 shell-env 注册表统一产出、用户随意导出的 DSH_HOME 不可见——
    // POSIX home 三档回退的前提。前缀/保留键常量删除即红。
    const p = 'dsh-shell-env'
    const f = '/lib/index.js'
    const guard = () => has(p, f)

    probeIf(guard)('DSH_ENV_PREFIX 与 RESERVED_BASH_ENV_KEYS 仍存在（DSH_HOME 受控）', () => {
      const src = read(p, f)
      expect(src).toMatch(/DSH_ENV_PREFIX/)
      expect(src).toMatch(/RESERVED_BASH_ENV_KEYS/)
      expect(src).toMatch(/DSH_HOME_ENV/)
    })
  })

  describe('pwsh -Command 单 argv 元素（I20：win32 命令行 32767 上限生效前提）', () => {
    // 命令串作为单个 argv 传给 -Command（无中间 shell）→ 命令总长受 Windows
    // 命令行上限约束 → 批量删 tag 必须分块（每 100）。执行器改传参方式即红。
    const p = 'dsh-pwsh-local'
    const f = '/lib/index.js'
    const guard = () => has(p, f)

    probeIf(guard)('命令仍作为单个 argv 传给 -Command', () => {
      const src = read(p, f)
      expect(src).toMatch(/"-Command"/)
    })
  })
})