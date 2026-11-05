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

    probeIf(guard)('图片渲染入口在位（旧面 renderMessageImages / 新面 PropsRenderFactories + loadImage）', () => {
      const { p, f } = find()
      const src = read(p, f)
      // 两代契约任一在位即可——插件运行时双面探测（recall-node.ts）：
      // ≤0.2.1-alpha.2：ChatNodeOwnerProps 只有 renderMessageImages，loadImage
      // 被 Omit 剔除（issue #9 的原始钉子：契约里从不存在 loadImage）；
      // ≥0.2.1-alpha.3：renderMessageImages 随 conversation.message.images
      // 拆分下线，chat.node props 追加 renderFactorySlot（PropsRenderFactories）
      // 并正式下放 loadImage。两面同时消失 = 官方第三次重排图片入口，必须重核
      // 插件渲染分支。
      const oldFace = /renderMessageImages/.test(src)
      const newFace = /PropsRenderFactories/.test(src) && /loadImage/.test(src)
      expect(oldFace || newFace).toBe(true)
      if (newFace && !oldFace && has('dsh-client-ui-slots', '/lib/types/index.d.ts')) {
        // 新面能力出处：renderFactorySlot 的类型定义与随附能力面
        expect(read('dsh-client-ui-slots', '/lib/types/index.d.ts')).toMatch(/renderFactorySlot/)
      }
    })

    probeIf(guard)('用户内容 Factory 在位（新面 ≥0.2.1-alpha.3：conversation.chat.user.content 整条内容渲染入口）', () => {
      const { p, f } = find()
      const src = read(p, f)
      const newFace = /PropsRenderFactories/.test(src)
      if (!newFace) return // 旧面：无该 Factory（不误红）
      // 插件把整条用户内容交给该 Factory（官方 UserStyleBubble 同款调用）；
      // 输入契约是插件投影（contentParts 复刻）的对偶面——三分派声明任一漂移
      // 或附件支改派，此处先红（issue #23 的失效模式正是契约漂移→静默空白）
      expect(src).toMatch(/'conversation\.chat\.user\.content'/)
      expect(src).toMatch(/interface UserContentData/)
      expect(src).toMatch(/readonly attachments: readonly UserContentAttachment\[\]/)
      expect(src).toMatch(/type: 'file'/)
    })

    probeIf(guard)('文本投影 Factory 在位（新面 ≥0.2.1-alpha.3：conversation.user.text，密钥脱敏链）', () => {
      const { p, f } = find()
      const newFace = /PropsRenderFactories/.test(read(p, f))
      if (!newFace) return // 旧面：文本走纯字符串渲染，无 Factory 依赖（不误红）
      // 官方 UserContent 在气泡内调用它渲染文本——插件经 user.content 间接继承
      // 该规则链（dsh-client-ui-secret-mask 的密钥打码）
      expect(read('dsh-client-ui-conversation', '/lib/types/client/contract/slots.d.ts')).toMatch(/'conversation\.user\.text'/)
      expect(has('dsh-client-ui-conversation', '/lib/types/client/contract/user-text.d.ts')).toBe(true)
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

  describe('会话头动作槽（issue #35 兜底入口）', () => {
    // 版本翻页器的会话头兜底依赖该 list/session 槽：官方把它改成 single、
    // 换 scope 或从头部 renderSlots 移除，provider 缺失时的版本入口会静默消失。
    const p = 'dsh-client-ui-conversation'
    const f = '/lib/types/client/contract/slots.d.ts'
    const guard = () => has(p, f)

    probeIf(guard)('conversation.session.header.actions 仍是 list/session 且由会话头渲染', () => {
      const src = read(p, f)
      expect(src).toMatch(/'conversation\.session\.header\.actions':\s*\{\s*kind:\s*'list';\s*scope:\s*'session';\s*owner:\s*ConversationHeaderActionOwnerProps;\s*\}/)
      expect(src).toMatch(/ConversationSessionHeaderSlotProps[\s\S]{0,300}'conversation\.session\.header\.actions'/)
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

  describe('sessions.fork 切点语义（G1/I35：0.1.7 起 boundary 校验 + buildForkSeed）', () => {
    // 插件的 cutSeq 是「该消息之前最近一次 turn/end 的真实 seq」，官方把它当**包含式**
    // 切点：boundary = atSeq ?? latestCompletedPrefixBoundary(events)，并要求
    // events[boundary].seq === boundary（否则 session/fork-unavailable）。三条锚点
    // 分钉 boundary 解析、边界校验、seed 与前缀计数——官方改边界语义（如回到
    // 「向后推进到下一个 turn/start」）即红：那正是残留排队消息复活的形态，
    // scanStaleQueueItemIds 清理链要跟着重估。
    // 0.1.1 旧实现的产物锚点未核验，旧版安装整体 skip（fork 签名探针仍覆盖旧包）。
    const p = 'dsh-api-session-controller'
    const f = '/lib/index.js'
    const guard = () => has(p, f)

    probeIf(guard)('boundary = atSeq ?? latestCompletedPrefixBoundary（省略 atSeq 才取最近完成轮次前缀）', () => {
      const src = read(p, f)
      expect(src).toMatch(/const boundary = atSeq \?\? latestCompletedPrefixBoundary\(source\.events\);/)
      // 前缀解析以最后一条 turn/end 为锚（插件传的 cutSeq 同源，不会被跳过）
      expect(src).toMatch(/const lastTurnEnd = events\.findLast\(\(event\) => event\.type === "turn\/end"\);/)
    })

    probeIf(guard)('boundary 必须是真实事件 seq（events[boundary]?.seq !== boundary 即 fork-unavailable）', () => {
      expect(read(p, f)).toMatch(/source\.events\[boundary\]\?\.seq !== boundary\) throw new RemoteError\("session\/fork-unavailable"/)
    })

    probeIf(guard)('seed = buildForkSeed(events, boundary)，inheritedEventCount = boundary + 1', () => {
      const src = read(p, f)
      expect(src).toMatch(/const seed = buildForkSeed\(source\.events, boundary\);/)
      expect(src).toMatch(/inheritedEventCount: SessionLogOffset\(boundary \+ 1\),/)
      expect(src).toMatch(/import \{ buildForkSeed \} from "@deepseek-ai\/dsh-session\/fork";/)
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

  describe('settings 面换代（I39：0.1.7 起 SettingsForms + profile entry id + volatile 门槛）', () => {
    // 0.1.7 把 dsh-settings 整体换成 SettingsForms：整个 SettingsProvider 移除
    // （installSection/register 双双缺席，插件旧三分支静默 no-op）、ns 变成
    // profile entry id（configEditor.entries() 按 row.options.id 匹配）、且只有
    // schema 标了 schemastery .volatile() 的字段可被 describe 收录与写入。
    // 三条锚点正是插件双分支与 volatile 声明的合法性依赖——官方改名/改判据即红
    // （本机实测 apply 期 describe 看不到自身、settled 后可返回，故插件同时保留
    // options.id 候选回退，见 host/config.ts resolveSettingsNs）。
    const p = 'dsh-settings'
    const f = '/lib/index.js'
    const guard = () => has(p, f)

    probeIf(guard)('导出面只剩 SettingsForms（旧注册入口 installSection/register 已整体移除）', () => {
      const src = read(p, f)
      expect(src).toMatch(/var SettingsForms = class extends Service \{/)
      expect(src).toMatch(/export \{ SettingsConflictError, SettingsForms/)
      // 这是「旧三分支静默 no-op」的机器化表达：官方若把注册入口加回来，插件应重估分流优先级
      expect(src).not.toMatch(/installSettingsSection|installSection/)
      expect(src).not.toMatch(/\bregister\s*\(/)
    })

    probeIf(guard)('ns = profile entry id：write 按 entries().find(options.id === ns)、describe 报 entry.options.id', () => {
      const src = read(p, f)
      expect(src).toMatch(/configEditor\.entries\(\)\.find\(\(row\) => row\.options\.id === ns\)/)
      expect(src).toMatch(/ns: entry\.options\.id,/)
    })

    probeIf(guard)('volatile 门槛：volatileForm 读 schema.meta.volatile，无 volatile 字段即拒写/拒显', () => {
      const src = read(p, f)
      expect(src).toMatch(/if \(schema\.meta\.volatile\) return plainSchema\(schema\);/)
      expect(src).toMatch(/`No configurable plugin entry "\$\{ns\}"`/)
      expect(src).toMatch(/`Plugin entry "\$\{ns\}" has no volatile fields`/)
    })
  })

  describe('volatile 热更链路与运行时可访问面（I39：loader 提交 ref 后按 fiber 派发事件）', () => {
    // 插件新面的热更依赖两条官方事实，此前完全没有盯防——官方改名即静默失效
    // （热更悄悄死掉、新面悄悄不启用），与本轮被 verify-host 自建桩掩盖的换代
    // 属同类面，故一并钉住：
    // 1) loader 把新值写进运行中 fiber 的 ref 后，经只对目标 fiber 可见的上下文
    //    派发 loader/volatile-update（所以插件必须在自己 ctx 上 on，别的插件收不到）；
    // 2) Fiber.entry 增补（可选：无 Loader 挂载时缺席）+ Entry.id/options.id 双形态
    //    ——ns 解析读的就是 options.id。
    const p = 'cordis-plugin-loader'
    const f = '/lib/index.js'
    const guard = () => has(p, f)

    probeIf(guard)('loader/volatile-update 在产物里存在且被 dispatch（按 fiber 过滤 + ref 已先行提交）', () => {
      const src = read(p, f)
      // ref 来源随 cordis 4.0.6-alpha.1 统一配置访问改名：fiber.config →
      // fiber.effectiveConfig（rawConfig 另存未解析输入）。两种拼写都接受——
      // 插件依赖的是「ref 取自 fiber 已发布的配置」这条事实，不是字段名本身；
      // 下方的 updateVolatile + emit + Context.filter 才是热更链路本体。
      expect(src).toMatch(/const refs = volatileEntries\(fiber\.(?:config|effectiveConfig)\);/)
      expect(src).toMatch(/updateVolatile\(ref, source\);/)
      expect(src).toMatch(/fiber\.ctx\.emit\(self, "loader\/volatile-update", paths\);/)
      expect(src).toMatch(/self\[Context\.filter\] = \(owner\) => owner\.fiber === fiber;/)
    })

    probeIf(() => has(p, '/lib/types/index.d.ts'))('Fiber.entry 增补形状在位（ns 解析的读取面）', () => {
      expect(read(p, '/lib/types/index.d.ts')).toMatch(/interface Fiber \{\s*entry\?: Entry;/)
    })

    probeIf(() => has(p, '/lib/types/config/entry.d.ts'))('Entry.options.id 是局部 id、Entry.id 带父 tree 前缀（候选顺序依据）', () => {
      const src = read(p, '/lib/types/config/entry.d.ts')
      expect(src).toMatch(/Stable id inside the containing entry tree/)
      expect(src).toMatch(/options: EntryOptions;/)
      expect(src).toMatch(/get id\(\): string;/)
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

  describe('archiveSession 契约（I7：归档 = 分组表面隐藏、日志保留；忙碌会话需 stopActivity）', () => {
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

    // 第二锚点钉「插件现在要传的选项」：官方归档前经 workspace/session-activity
    // 瀑布问「这会话还有什么在跑」（agent 回合 / jobs 后台作业 / subagent / schedule），
    // 命中即拒（workspace/session-active）；只有 stopActivity 才改成「先停后归档」。
    // 插件据此传 { stopActivity: true }——有后台作业在跑时撤回，旧写法归档静默失败、
    // 作业结算再把原会话唤醒继续干活（文件已回滚）。选项或拒绝语义漂移即红。
    const cf = '/lib/types/client/service.d.ts'
    const clientGuard = () => has(p, cf)
    probeIf(clientGuard)('客户端 archiveSession 接受 { stopActivity }（忙碌会话先停后归档）', () => {
      const src = read(p, cf)
      expect(src).toMatch(/archiveSession\(sessionId: SessionId, options\?: \{/)
      expect(src).toMatch(/readonly stopActivity\?: boolean;/)
      expect(src).toMatch(/workspace\/session-active/)
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

  describe('设置卡片 slot 锚点（I12：≤0.1.5 settings.plugin.item → 0.1.6+ plugins.bundle.config）', () => {
    // 插件双键并注册两个 slot（旧版吃 settings.plugin.item、0.1.6+ 吃插件管理页 bundle
    // 页的 plugins.bundle.config），key 写错或官方 slot 消失时渲染器静默 return
    // （specDynamic undefined），卡片凭空不出现且零报错。
    // 旧键的契约文件自 0.1.6 线起不再发布（该包只剩 index/PluginsSection/locales），
    // 原先的单路径探针因此长期静默 skip——绿灯但零覆盖。故这里保留一条刻意
    // fail-loud 的断言：只要本机装了 dsh，两代面至少一条 slot 契约必须在位。
    const modern = { p: 'dsh-client-ui-plugin-manager', f: '/lib/types/client/slot-contract.d.ts' }
    const legacy = { p: 'dsh-client-ui-settings-plugins', f: '/lib/types/client/slot-contract.d.ts' }
    const hasModern = () => has(modern.p, modern.f)
    const hasLegacy = () => has(legacy.p, legacy.f)

    probeIf(() => true)('两代面至少一条 slot 契约在位（都缺席即红：卡片挂载点消失）', () => {
      expect(hasModern() || hasLegacy(), '设置卡片两代 slot 契约都找不到').toBe(true)
    })

    probeIf(hasModern)('新面 plugins.bundle.config 为 keyed + root scope（按 bundle 包名分发）', () => {
      const src = read(modern.p, modern.f)
      expect(src).toMatch(/'plugins\.bundle\.config'/)
      expect(src).toMatch(/kind: 'keyed'/)
      expect(src).toMatch(/scope: 'root'/)
    })

    probeIf(hasLegacy)('旧面 settings.plugin.item 为 keyed + root scope（按 namespace 分发，≤0.1.5）', () => {
      const src = read(legacy.p, legacy.f)
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

  describe('win32 shell 方言与执行接缝（I36/I38：无方言字段；0.1.7 起 run/start → execute().result()）', () => {
    // 官方 shell 是提供方注册制：win32 上宿主可把 ctx.shell 配成 bash，此时 pwsh
    // 模板被 bash 执行、首行编码前导即语法错误（issue #15）。插件的路线是行为探针
    // 判方言 + 判成 bash 时 Node spawn 直连 powershell.exe，其合法性依赖以下官方
    // 事实——任一漂移即红：
    // 1) ShellExecutor 公开面没有「我是 bash 还是 pwsh」的字段：有字段就该改读字段
    //    （探针与探测命令可一并退役）；
    // 2) 0.1.7 起前台接缝换成 resolve + execute(spec) → handle.result()（run/start
    //    被删除）。插件按运行时方法探测双分支（store.runViaExecutor），判据优先级
    //    与「run 是否存在」绑定：官方若回退（把 run 加回来）本探针即红，提示重估；
    // 3) 直连通道复刻的三件事仍在官方实现里：PS 5.1 候选路径、argv 旗标形态、
    //    env 清洗与 overrides 口径。
    const p = 'dsh-shell'
    const f = '/lib/types/index.d.ts'
    const guard = () => has(p, f)

    probeIf(guard)('ShellExecutor 公开面无方言字段，接缝为 resolve + execute（抽象 run/start 已移除）', () => {
      const m = read(p, f).match(/export declare abstract class ShellExecutor[\s\S]*?\n\}/)
      expect(m).toBeTruthy()
      expect(m[0]).toMatch(/abstract resolve\(request: ShellExecRequest\): ShellExecSpec/)
      expect(m[0]).toMatch(/abstract execute\(spec: ShellExecSpec\): Promise<ShellExecution>/)
      expect(m[0]).not.toMatch(/abstract run\(|abstract start\(/)
      expect(m[0]).not.toMatch(/dialect|shellKind|flavor/i)
    })

    probeIf(() => has(p, '/lib/types/types.d.ts'))('ShellExecution.result() 与可空 exitCode（双分支调用形态 + 失败分级的类型依据）', () => {
      const types = read(p, '/lib/types/types.d.ts')
      expect(types).toMatch(/export interface ShellExecution extends ShellProcess \{/)
      expect(types).toMatch(/result\(\): Promise<ShellRunResult>/)
      // exitCode 可空是 runShellMeta「准备期超时 vs 非零退出」分级的官方事实依据；
      // timedOut 是超时的 first-cause 标记（有它就不必靠「null + 无 stderr」推断）
      expect(types).toMatch(/exitCode: number \| null;/)
      expect(types).toMatch(/timedOut: boolean;/)
    })

    const pwsh = 'dsh-pwsh-local'
    const pwshFile = '/lib/index.js'
    probeIf(() => has(pwsh, pwshFile))('直连复刻的官方事实：PS 5.1 候选路径 + argv 旗标 + env overrides', () => {
      const src = read(pwsh, pwshFile)
      // 直连固定 %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe（不赌
      // PS7 存在）；该路径是官方候选链末档，官方移除即红（直连可执行文件须重新选型）
      expect(src).toMatch(/"System32", "WindowsPowerShell", "v1\.0", "powershell\.exe"/)
      expect(src).toMatch(/"-NoProfile"/)
      expect(src).toMatch(/"-NonInteractive"/)
      expect(src).toMatch(/"-Command"/)
      expect(src).toMatch(/NO_COLOR: "1"[\s\S]{0,120}PAGER: "cat"[\s\S]{0,120}GIT_PAGER: "cat"/)
    })

    probeIf(() => has('dsh-subprocess', '/lib/index.js'))('env 清洗口径：凭证形状名 + 全部 DSH_*（直连通道逐条复刻）', () => {
      const src = read('dsh-subprocess', '/lib/index.js')
      expect(src).toMatch(/SENSITIVE_ENV_PATTERN = \/KEY\|PASSWORD\|SECRET\|TOKEN\/i/)
      expect(src).toMatch(/key\.toUpperCase\(\)\.startsWith\("DSH_"\)/)
    })
  })

  describe('会话导航归属（I37：0.1.6-alpha.2 起 ISessions 无 open，导航在 uiWorkspace）', () => {
    // 撤回 fork 出子会话后必须把它打开：0.1.5 线及以前走 ISessions.open，alpha.2 移除
    // （契约注释「navigation belongs to view owners」）迁到独立 uiWorkspace 服务。探针钉
    // 两侧事实——官方若把 open 加回来，插件可退回单路径；openSession 改名/改签名则优先
    // 分支失效、只剩旧接口（在 alpha.2 上不存在），功能会再次静默死掉（typeof 守卫不报错）。
    const sess = 'dsh-api-session-controller'
    const sessFile = '/lib/types/client/contract/sessions.d.ts'
    probeIf(() => has(sess, sessFile))('ISessions 无独立 open 方法，引用模型 retain 在位', () => {
      const src = read(sess, sessFile)
      expect(src).toMatch(/retain\(target: SessionTarget, options: SessionRetainOptions\): SessionReference/)
      // 只排除「方法名就是 open」这一形态：`setSubagentCatalogOpen(…, open: boolean)`
      // 的参数名也叫 open，宽松匹配会误红。
      expect(src).not.toMatch(/^\s*open\s*\(/m)
    })

    const ws = 'dsh-client-ui-workspace'
    const navFile = '/lib/types/client/navigation.d.ts'
    probeIf(() => has(ws, navFile))('uiWorkspace.openSession 是插件依赖的导航入口', () => {
      expect(read(ws, navFile)).toMatch(/openSession\(target: SessionTarget\): void/)
    })
  })

  describe('子路径部署的服务端路径基址（I40：官方注入 <base href="./"> + 客户端按文档基址解析）', () => {
    // 0.1.7-rc.1 起官方支持「Web 挂在反向代理子路径」：index 注入 <base href="./">、
    // 前端资源改相对引用、客户端把服务端路径按 document.baseURI 解析。插件端点路径
    // 同样按基址解析（src/client/util.ts recallApiUrl），故依赖这三条官方事实；任一
    // 条漂移都要重估（官方改回根绝对路径时插件应同步改回；`<base>` 消失则插件子路径
    // 行为不变、官方自身会坏——探针红了先读 I40 的复查动作再动手）。
    const staticPkg = 'dsh-host-frontend-static'
    probeIf(() => has(staticPkg, '/lib/index.js'))('index 响应注入 <base href="./">（插件解析基址的来源）', () => {
      expect(read(staticPkg, '/lib/index.js')).toMatch(/<base href="\.\/">/)
    })

    const frontend = 'dsh-web-frontend'
    probeIf(() => has(frontend, '/dist/index.html'))('前端资源引用为相对路径（子路径下可加载）', () => {
      const html = read(frontend, '/dist/index.html')
      expect(html).toMatch(/(?:src|href)="\.\/assets\//)
      // 出现根绝对资源引用即子路径不可用（本轮修复前的形态）
      expect(html).not.toMatch(/(?:src|href)="\/assets\//)
    })

    const gateway = 'dsh-api-gateway'
    probeIf(() => has(gateway, '/lib/client.js'))('官方客户端以 document.baseURI 为基址（同构对照）', () => {
      expect(read(gateway, '/lib/client.js')).toMatch(/streamBaseUrl \?\? document\.baseURI/)
    })
  })

  describe('输入区写入链（I34：回填 fillDraft / 编辑重发的全部官方入口）', () => {
    // 插件把「文本 + 附件 + 可选发送」写进目标会话输入态，全部走官方通道：
    // shell.actions.setDraft / addAttachments / submit、shell.snapshot.draft（发送
    // 前校验草稿已落地）、conversation.createDrafts / releaseDraftAttachments。
    // 这些入口此前只有运行时能力探测兜底、探针零覆盖——官方一旦重排（如 0.2.1-rc.3
    // 把「已有草稿怎么处理」显式化为 whenDraftExists），没有任何红灯会亮。
    const conv = 'dsh-client-ui-conversation'
    const inputActions = '/lib/types/client/contract/input.d.ts'
    const facade = '/lib/types/client/input/facade.d.ts'
    const service = '/lib/types/client/service.d.ts'

    probeIf(() => has(conv, inputActions))('InputActions 三件套在位（setDraft / addAttachments / submit）', () => {
      const src = read(conv, inputActions)
      const face = src.match(/export interface InputActions \{[\s\S]*?\n\}/)
      expect(face).toBeTruthy()
      // setDraft 必须是「整段替换」语义（插件回填依赖覆盖而非追加）
      expect(face[0]).toMatch(/setDraft\(text: string\): void;/)
      expect(face[0]).toMatch(/addAttachments\(ids: readonly DraftAttachmentId\[\]\): boolean;/)
      expect(face[0]).toMatch(/submit\(\): void;/)
    })

    probeIf(() => has(conv, inputActions))('InputState.draft 可读（submit 前的草稿落地校验依据）', () => {
      const src = read(conv, inputActions)
      const state = src.match(/export interface InputState \{[\s\S]*?\n\}/)
      expect(state).toBeTruthy()
      expect(state[0]).toMatch(/readonly draft: string;/)
    })

    probeIf(() => has(conv, facade))('SessionInputShell 暴露 actions + snapshot（能力探测的两条读取面）', () => {
      const src = read(conv, facade)
      expect(src).toMatch(/readonly actions: InputActions;/)
      expect(src).toMatch(/get snapshot\(\): InputState;/)
    })

    probeIf(() => has(conv, service))('草稿附件注册/释放面在位（createDrafts / releaseDraftAttachments）', () => {
      const src = read(conv, service)
      // 0.2.2-alpha.2 起第三参 uploadImages 显式（普通会话进输入态即上传、子代理
      // 续写传 false）；≤0.2.1 为两参。插件恒传 true、旧版忽略多出的实参，故两
      // 种形态都算在位——钉的是「参数名与位置」，单钉一代会让另一端误红。
      expect(src).toMatch(/createDrafts\(sessionId: SessionId, files: readonly File\[\](?:, uploadImages: boolean)?\)/)
      expect(src).toMatch(/releaseDraftAttachments/)
    })
  })

  describe('附件回读链（B1：readAttachment 的入参两代）', () => {
    // 撤回回填 / 编辑重发要从源会话读回被撤回消息的图片字节。官方在
    // 0.2.2-alpha.1 改了这条链：≤0.2.1 收 attachmentId 字符串、由宿主回会话日志
    // 反查完整引用；≥0.2.2-alpha.1 收完整引用对象、宿主只按 mediaType/bytes/尺寸
    // 自证（裸 id 直接 INVALID_ATTACHMENT_REF）。插件按「完整引用 → 裸 id」探测
    // 回退，两代都得能跑——所以这里钉单参形状与参数名，不钉具体是哪种取值。
    const ctrl = 'dsh-api-session-controller'
    const sessionTypes = '/lib/types/client/sessions/session.d.ts'

    probeIf(() => has(ctrl, sessionTypes))('readAttachment 单参承载图片引用（attachment 对象 / attachmentId 字符串）', () => {
      const src = read(ctrl, sessionTypes)
      expect(src).toMatch(/readAttachment\((?:attachment: ImageAttachmentRef|attachmentId: string)\)/)
      // 返回值形状两代一致：引用 + 解码字节（回填侧按 value.data 建 File）
      expect(src).toMatch(/data: Uint8Array/)
    })
  })
})