/**
 * dsh-recall-plugin — client 撤回节点（UserRecallNode + recallPanel）
 *
 * 从原 lib/client.js 抽出：kind 单表、变更摘要、确认面板、用户消息重绘
 * （文本/图片/JSON 块，图片经官方 renderMessageImages 管线）、撤回执行链
 * （preview→execute→fork→回填）。KIND_INFO/summaryText 模块级导出供单测。
 */

import type { ReactApi, UtilApi } from './util.js'
import type { ClientContext, ClientSessionsService, ClientWorkspacesService, ChatNodeProps, ConversationService } from '../types/client-contract.js'
import type { SnapshotInfoResponse, PreviewResponse, ExecuteResponse, DiffChange } from '../types/api.js'

// 用户消息内容块（text/image/JSON 等）：只读已知字段，其余透传 unknown
interface ChatBlock {
  type?: string
  text?: string
  attachment?: unknown
  [key: string]: unknown
}

// kind 语义单表承载（文案/徽章类名/汇总顺序）：新增 kind 时只改这一处
export type ChangeKind = 'modified' | 'restored' | 'added'
export const KIND_INFO: Record<ChangeKind, { label: string; cls: string }> = {
  modified: { label: '修改', cls: 'modified' },
  restored: { label: '恢复', cls: 'restored' },
  added: { label: '删除', cls: 'added' }
}

export interface ChangeCounts {
  modified: number
  restored: number
  added: number
}

export function summaryText(counts: ChangeCounts): string {
  const parts: string[] = []
  for (const kind of Object.keys(KIND_INFO) as ChangeKind[]) {
    if (counts[kind] > 0) parts.push(KIND_INFO[kind].label + ' ' + counts[kind])
  }
  return parts.join(' · ')
}

// 撤回面板的状态机：idle（默认，仅按钮）→ loading（预览中）→ error →
// confirm（变更清单 + 确认）→ executing（回退中）→ done（结果）
export type RecallStage =
  | { stage: 'idle' }
  | { stage: 'loading' }
  | { stage: 'error'; message: string }
  | { stage: 'confirm'; changes: DiffChange[]; total: number; truncated: boolean; treeId: string | null; time: number | null; cutSeq: number | null }
  | { stage: 'executing'; changes: DiffChange[] }
  | { stage: 'done'; count: number; chatReverted: boolean; chatError: string }

export interface RecallNodeApi {
  UserRecallNode: (props: ChatNodeProps) => unknown
}

export function buildRecallNode(
  React: ReactApi,
  util: UtilApi,
  ctx: ClientContext,
  sessionsSvc: ClientSessionsService,
  workspacesSvc: ClientWorkspacesService
): RecallNodeApi {
  const { api, ensureInit, showThrottledToast, writeClipboard, clockText, pluginConfig, messageFor } = util

  function CopyIcon() {
    return React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true },
      React.createElement('rect', { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5 }),
      React.createElement('path', { d: 'M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5' })
    )
  }

  function CheckIcon() {
    return React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      React.createElement('path', { d: 'm3 8.5 3.2 3.2L13 5' })
    )
  }

  function UndoIcon() {
    return React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      React.createElement('path', { d: 'M7.5 3.5 3.5 7.5l4 4' }),
      React.createElement('path', { d: 'M4.5 7.5h5a3 3 0 0 1 0 6H8' })
    )
  }

  function recallPanel(recall: RecallStage, closePanel: () => void, executeRecall: () => void) {
    if (recall.stage === 'loading') {
      return React.createElement('div', { className: 'dsh-recall-panel' },
        React.createElement('div', { className: 'dsh-recall-panel-title' }, '正在计算变更…')
      )
    }
    if (recall.stage === 'error') {
      return React.createElement('div', { className: 'dsh-recall-panel' },
        React.createElement('div', { className: 'dsh-recall-panel-title' }, '无法回退'),
        React.createElement('div', { className: 'dsh-recall-panel-note' }, recall.message || ''),
        React.createElement('div', { className: 'dsh-recall-panel-actions' },
          React.createElement('button', { type: 'button', className: 'dsh-recall-btn', onClick: closePanel }, '关闭')
        )
      )
    }
    if (recall.stage === 'confirm') {
      const changes = recall.changes || []
      const total = typeof recall.total === 'number' ? recall.total : changes.length
      const counts: ChangeCounts = { modified: 0, restored: 0, added: 0 }
      for (const c of changes) {
        if (c && (counts as unknown as Record<string, number>)[c.kind] !== undefined) (counts as unknown as Record<string, number>)[c.kind]++
      }
      const rows: Array<ReturnType<typeof React.createElement>> = changes.map((c: DiffChange, i: number) => {
        const info = KIND_INFO[c.kind as ChangeKind]
        return React.createElement('div', { className: 'dsh-recall-file', key: i },
          React.createElement('span', { className: 'dsh-recall-badge dsh-recall-badge-' + (info ? info.cls : '') }, info ? info.label : (c.kind || '')),
          React.createElement('span', { className: 'dsh-recall-rel' }, c.rel || '')
        )
      })
      if (recall.truncated) {
        rows.push(React.createElement('div', { className: 'dsh-recall-panel-note', key: 'truncated' }, '…仅显示前 ' + changes.length + ' 条，共 ' + total + ' 个文件将变更'))
      }
      // cutSeq 为 null 表示该消息是会话第一条用户消息：文件可回退但对话无从回退
      const canRevertChat = typeof recall.cutSeq === 'number'
      return React.createElement('div', { className: 'dsh-recall-panel' },
        React.createElement('div', { className: 'dsh-recall-panel-title' }, '整段回退'),
        React.createElement('div', { className: 'dsh-recall-panel-note' },
          '将项目恢复到' + (recall.time ? ' ' + clockText(recall.time) + ' ' : ' ') + '发送该消息时的状态。共 ' + total + ' 个文件将变更' + (summaryText(counts) ? '（' + summaryText(counts) + '）' : '') + '。此操作会覆盖当前文件内容；回退前会自动保存一份当前状态的安全快照（不含在下方清单内）。'
        ),
        React.createElement('div', { className: 'dsh-recall-panel-note' },
          canRevertChat
            ? '对话将一并回退到该消息之前：该消息及之后的全部对话会从当前视图移除，原会话归档保存（可从归档找回）。'
            : '该消息是本会话中第一条用户消息，无法回退对话；确认后仅回退项目文件。'
        ),
        changes.length > 0 ? React.createElement('div', { className: 'dsh-recall-list' }, ...rows) : null,
        React.createElement('div', { className: 'dsh-recall-panel-actions' },
          React.createElement('button', { type: 'button', className: 'dsh-recall-btn', onClick: closePanel }, '取消'),
          React.createElement('button', { type: 'button', className: 'dsh-recall-btn dsh-recall-btn-danger', onClick: executeRecall }, '确认回退')
        )
      )
    }
    if (recall.stage === 'executing') {
      return React.createElement('div', { className: 'dsh-recall-panel' },
        React.createElement('div', { className: 'dsh-recall-panel-title' }, '正在回退…')
      )
    }
    if (recall.stage === 'done') {
      return React.createElement('div', { className: 'dsh-recall-panel' },
        React.createElement('div', { className: 'dsh-recall-panel-title' }, '回退完成'),
        React.createElement('div', { className: 'dsh-recall-panel-note' },
          recall.chatReverted
            ? '项目文件与对话已回退到该消息之前。新会话已打开，原会话已归档（可从归档找回）。'
            : '项目已恢复到发送该消息时的状态。' + (recall.chatError ? ' 对话回退失败：' + recall.chatError : '')
        ),
        React.createElement('div', { className: 'dsh-recall-panel-actions' },
          React.createElement('button', { type: 'button', className: 'dsh-recall-btn', onClick: closePanel }, '关闭')
        )
      )
    }
    return null
  }

  // 撤回后把被撤回消息的文本回填到输入框，方便用户修改后重新发送。
  // 官方 conversation 服务提供 input（InputHub）→ per-session shell →
  // actions.setDraft，走与输入框自身同一条官方写入通道。fork + open 之后
  // shell 可能需要一个 tick 才就绪（binding 异步解析），做有界重试：最多
  // 8 次、间隔 150ms；拿不到服务时静默跳过。
  function fillDraft(targetSessionId: string, draftText: string): void {
    if (!draftText || !targetSessionId) return
    let attempts = 0
    const attempt = () => {
      try {
        // conversation 服务 0.1.2 才有（0.1.1-rc.2 无，ui-conversation 提供），
        // 不能进静态 inject——否则 0.1.1-rc.2 上声明缺失服务插件静默不启动。
        // 走 ctx.get 探测：guard 的 get 对缺失/未声明服务安全返回 undefined，
        // 拿不到就降级重试（0.1.1-rc.2 恒降级；0.1.2 视服务可见性而定）。
        const conversation = ctx.get<ConversationService>('conversation')
        if (conversation && conversation.input && typeof conversation.input.shell === 'function') {
          const shell = conversation.input.shell(targetSessionId)
          if (shell) {
            if (shell.actions && typeof shell.actions.setDraft === 'function') {
              shell.actions.setDraft(draftText)
              return
            }
            if (typeof shell.setDraft === 'function') {
              shell.setDraft(draftText)
              return
            }
          }
        }
      } catch (e) { /* fall through to retry */ }
      if (attempts++ < 8) setTimeout(attempt, 150)
    }
    attempt()
  }

  function UserRecallNode(props: ChatNodeProps) {
    const node = props && props.node
    // 图片渲染入口：官方 ChatNodeSeat 传给本 slot 的 props 契约只有
    // renderMessageImages（内部经 conversation.message.images slot 渲染
    // 官方 MessageImages，自带鉴权、缓存、失败重试与灯箱预览）。
    // 契约里从不存在 loadImage（issue #9）：读该不存在的字段导致自研加载链
    // 从未执行、用户消息图片永久无声空白。
    const renderMessageImages = props && props.renderMessageImages
    const sessionId = props && props.sessionId
    const data = (node && node.data ? node.data : {}) as { content?: unknown; time?: unknown }
    // node.id 是会话事件匹配时写入的真实消息 ID；node.key 是位置键，不能用于快照查询
    const messageId = node ? String(node.id || node.key || '') : ''
    const blocks: ChatBlock[] = Array.isArray(data.content) ? data.content as ChatBlock[] : []
    const text = blocks.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('')
    // 官方契约：images 传 image 块数组（{attachment}），官方内部取
    // image.attachment.attachmentId —— 不是裸 attachment 对象
    const imageBlocks: Array<{ attachment: unknown }> = blocks.filter((b) => b && b.type === 'image' && b.attachment).map((b) => ({ attachment: b.attachment }))
    const rest: ChatBlock[] = blocks.filter((b) => !b || !(b.type === 'text' && typeof b.text === 'string') && !(b.type === 'image' && b.attachment))

    const [copied, setCopied] = React.useState(false)
    const [hasSnapshot, setHasSnapshot] = React.useState(false)
    const [recall, setRecall] = React.useState<RecallStage>({ stage: 'idle' })

    React.useEffect(() => {
      let alive = true
      let timer: ReturnType<typeof setTimeout> | null = null
      let attempts = 0
      // 快照捕获（Host 侧脚本）是异步的：消息节点挂载时 snapshot-info 可能
      // 先于捕获完成而返回 has:false。改为有界轮询：has:true 或达上限即停
      // （覆盖常规快照耗时，又避免无限请求），捕获完成后按钮自动出现。
      // 只对「近 5 分钟内」的消息轮询：快照只在消息发送当下捕获，老消息若
      // 没有快照就永远不会再有。
      const RETRY_WINDOW_MS = 5 * 60 * 1000
      const MAX_ATTEMPTS = 20
      const RETRY_MS = 1000
      const msgTime = data && typeof data.time === 'number' ? data.time : NaN
      const recent = !isNaN(msgTime) && Date.now() - msgTime <= RETRY_WINDOW_MS
      function schedule() {
        if (!alive || !messageId) return
        attempts++
        api<SnapshotInfoResponse>('snapshot-info', { messageId, sessionId }).then((res) => {
          if (!alive) return
          if (res && res.has) {
            // fail-open 跳过的路径：快照存在但个别目录没进去——仅对正在发生的
            // 消息提示，让用户知道快照少了什么（issue #7 失败可见性）
            if (recent && Array.isArray(res.skipped) && res.skipped.length) {
              const names = res.skipped.slice(0, 5).join('、') + (res.skipped.length > 5 ? ' 等 ' + res.skipped.length + ' 项' : '')
              showThrottledToast('快照已跳过未纳入的路径：' + names + '（撤回不会恢复或删除这些路径）')
            }
            setHasSnapshot(true)
            return
          }
          // 失败/熔断是终止态：快照不会迟到，提示后停止轮询
          if (res && res.failed) {
            if (recent) showThrottledToast('快照失败：' + String(res.error || '未知原因').slice(0, 140))
            return
          }
          if (recent && attempts < MAX_ATTEMPTS) timer = setTimeout(schedule, RETRY_MS)
        }).catch(() => {
          if (alive && recent && attempts < MAX_ATTEMPTS) timer = setTimeout(schedule, RETRY_MS)
        })
      }
      // 先等 init 预热完成再查快照存在性：避免索引未载入时误判 has:false
      ensureInit(sessionId).then(() => {
        if (!messageId || !alive) return
        schedule()
      }).catch(() => {
        if (alive && messageId) timer = setTimeout(schedule, RETRY_MS)
      })
      return () => {
        alive = false
        if (timer !== null) clearTimeout(timer)
      }
    }, [messageId, sessionId])

    const onCopy = () => {
      if (copied) return
      writeClipboard(text).then(() => {
        setCopied(true)
        // timer 同经 inject 声明属性访问；未就绪时降级裸 setTimeout。
        const timer = ctx.timer
        if (timer && typeof timer.timeout === 'function') {
          timer.timeout(() => setCopied(false), 1200)
        } else {
          setTimeout(() => setCopied(false), 1200)
        }
      })
    }

    const openPreview = () => {
      if (recall.stage === 'loading' || recall.stage === 'executing') return
      setRecall({ stage: 'loading' })
      api<PreviewResponse>('preview', { messageId, sessionId }).then((res) => {
        if (!res || !res.ok) {
          setRecall({ stage: 'error', message: messageFor(res, '无法获取快照') })
          return
        }
        // PF-1：treeId 是 preview 时的 index 树指纹，确认时透传回 execute——
        // Host 与安全快照指纹比对判 STALE，省一次重复 diff
        setRecall({
          stage: 'confirm',
          changes: res.changes || [],
          total: typeof res.total === 'number' ? res.total : (res.changes || []).length,
          truncated: Boolean(res.truncated),
          treeId: res.treeId || null,
          time: res.time || null,
          cutSeq: typeof res.cutSeq === 'number' ? res.cutSeq : null
        })
      }).catch((error) => {
        setRecall({ stage: 'error', message: String(error) })
      })
    }

    const executeRecall = () => {
      if (recall.stage !== 'confirm') return
      const changes = recall.changes || []
      const previewCut = typeof recall.cutSeq === 'number' ? recall.cutSeq : null
      // P0-3：携带预览摘要（total 是完整计数，与 Host 侧 diffFor 的 total
      // 对齐；changes 截断到 500 条，不能用来比对）。Host 端据此在 execute
      // 时校验「预览后文件集是否变化」，变了则返回 STALE 拒绝执行。
      // PF-1：新版同时透传 previewTreeId（内容级指纹），Host 优先用它比对
      // 且免一次重复 diff；老 Host 忽略未知字段自动退回 total 校验。
      const previewTotal = typeof recall.total === 'number' ? recall.total : changes.length
      setRecall({ stage: 'executing', changes })
      api<ExecuteResponse>('execute', { messageId, sessionId, previewTotal, previewTreeId: recall.treeId || undefined, previewAt: Date.now() }).then(async (res) => {
        if (!res || !res.ok) {
          // STALE：预览后文件变了——自动重新拉一次最新清单回到确认阶段
          if (res && res.code === 'STALE') {
            setRecall({ stage: 'loading' })
            api<PreviewResponse>('preview', { messageId, sessionId }).then((res2) => {
              if (!res2 || !res2.ok) {
                setRecall({ stage: 'error', message: messageFor(res2, '无法获取快照') })
                return
              }
              setRecall({
                stage: 'confirm',
                changes: res2.changes || [],
                total: typeof res2.total === 'number' ? res2.total : (res2.changes || []).length,
                truncated: Boolean(res2.truncated),
                treeId: res2.treeId || null,
                time: res2.time || null,
                cutSeq: typeof res2.cutSeq === 'number' ? res2.cutSeq : null
              })
            }).catch((error) => {
              setRecall({ stage: 'error', message: String(error) })
            })
            return
          }
          setRecall({ stage: 'error', message: messageFor(res, '回退失败') })
          return
        }
        // 文件已回退；对话回退独立进行，失败只降级为“仅文件回退”而不是整体失败
        const cutSeq = typeof res.cutSeq === 'number' ? res.cutSeq : previewCut
        let chatReverted = false
        let chatError = ''
        // 回填目标会话：对话回退成功 → fork 出的新会话（视图已切过去）；
        // 失败/无切点 → 当前会话
        let fillTarget = sessionId
        if (cutSeq !== null && sessionsSvc && typeof sessionsSvc.fork === 'function') {
          try {
            // 撤回语义是「回退」而非「复制」：新会话顶替原会话（原会话已归档），
            // 必须原样继承标题。increaseTitle 是官方侧栏「复制会话」用来区分
            // 新旧会话的，会把标题改成「xxx 2」且多次撤回时数字不断递增，故不传。
            // sessionId 在撤回按钮可见时恒有（快照仅对已知会话生成），断言收口
            const childId = await sessionsSvc.fork({ sessionId: sessionId as string, atSeq: cutSeq })
            if (childId) {
              if (typeof sessionsSvc.open === 'function') sessionsSvc.open(childId)
              chatReverted = true
              fillTarget = childId
              // F1：上报撤回链（childId ↔ parentId），Host 持久化供版本家族展示；
              // 上报失败不阻断撤回主流程（家族是纯增量 UI）。
              api<unknown>('lineage-record', { childId, parentId: sessionId }).catch(() => {})
              // 回退前的原会话归档（可关）：只是从列表隐藏、可恢复
              if (pluginConfig.archiveOriginal && workspacesSvc && typeof workspacesSvc.archiveSession === 'function') {
                Promise.resolve(workspacesSvc.archiveSession(sessionId as string)).catch(() => {})
              }
            } else {
              chatError = '未返回新会话'
            }
          } catch (error) {
            chatError = String(error)
          }
        }
        // 把被撤回的消息文本回填到输入框（可在设置页关闭）
        // fillTarget 只在撤回链路上赋值（fork 出的 childId 或原 sessionId），
        // 断言收口——撤回执行必有会话上下文
        if (pluginConfig.refillDraft) fillDraft(fillTarget as string, text)
        setHasSnapshot(false)
        // 注：快照 tag 在 Host 侧有意保留（幂等回退），刷新页面后该消息的
        // 撤回按钮会重新出现——这是「可再次回退到同一点」的特性而非 bug。
        setRecall({ stage: 'done', count: typeof res.count === 'number' ? res.count : changes.length, chatReverted, chatError })
      }).catch((error) => {
        setRecall({ stage: 'error', message: String(error) })
      })
    }

    const closePanel = () => setRecall({ stage: 'idle' })

    const bubbleChildren: Array<ReturnType<typeof React.createElement>> = []
    // 图片在上、气泡在下：布局顺序对齐官方 UserStyleBubble
    if (imageBlocks.length && typeof renderMessageImages === 'function') {
      const render = renderMessageImages as (args: { images: Array<{ attachment: unknown }>; align: string }) => import('react').ReactNode
      bubbleChildren.push(React.createElement(React.Fragment, { key: 'images' },
        render({ images: imageBlocks, align: 'end' })
      ))
    }
    if (text !== '') bubbleChildren.push(React.createElement('div', { className: 'dsh-recall-bubble', key: 'text' }, text))
    for (let i = 0; i < rest.length; i++) {
      bubbleChildren.push(React.createElement('pre', { className: 'dsh-recall-json', key: 'rest-' + i }, JSON.stringify(rest[i], null, 2)))
    }

    const actions = []
    actions.push(React.createElement('span', { className: 'dsh-recall-time', key: 'time' }, clockText(data.time)))
    actions.push(React.createElement('button', {
      key: 'copy',
      type: 'button',
      className: 'dsh-recall-action',
      'aria-label': copied ? '已复制' : '复制',
      title: copied ? '已复制' : '复制',
      onClick: onCopy
    }, copied ? React.createElement(CheckIcon, {}) : React.createElement(CopyIcon, {})))
    if (hasSnapshot) {
      actions.push(React.createElement('button', {
        key: 'recall',
        type: 'button',
        className: 'dsh-recall-action',
        'aria-label': '撤回',
        title: '整段回退：文件与对话一并回到该消息之前',
        onClick: openPreview
      }, React.createElement(UndoIcon, {})))
    }

    return React.createElement('div', { className: 'dsh-recall-row', 'data-time-hover-root': true },
      bubbleChildren.length > 0 ? React.createElement('div', { className: 'dsh-recall-stack', key: 'stack' }, ...bubbleChildren) : null,
      React.createElement('div', { className: 'dsh-recall-actions', key: 'actions' }, ...actions),
      recallPanel(recall, closePanel, executeRecall)
    )
  }

  return { UserRecallNode }
}
