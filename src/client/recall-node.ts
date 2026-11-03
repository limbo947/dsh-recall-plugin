/**
 * dsh-recall-plugin — client 撤回节点（UserRecallNode + recallPanel）
 *
 * 从原 lib/client.js 抽出：kind 单表、变更摘要、确认面板、用户消息重绘
 * （新面整条内容走官方 conversation.chat.user.content Factory；旧面与兜底
 * 路径自绘文本、图片经官方 renderMessageImages 闭包、文件卡片与 JSON 块）、
 * 撤回执行链（preview→execute→fork→回填）。kind 单表（KIND_INFO/summaryText）拆在
 * diff-kinds.ts，此处 re-export 保住既有 import 路径。
 *
 * A4：全部可见文案经 util.t 取词（词典层见 locales/）；模块级纯函数保留
 * 「不收词表则按 zh 渲染」的缺省（zhTranslate），单测与降级路径不因缺 util
 * 而崩，替换前的单语文案行为等价。
 */

import type { ReactApi, UtilApi } from './util.js'
import { buildRecallNotify } from './util.js'
import type { RecallNotifyOutcome } from './util.js'
import { recallNodeLog } from './log.js'
import { resolveUserContentFace, renderOfficialUserContent } from './user-content.js'
import { buildEditFlow } from './edit-node.js'
import type { EditStage, EditAttachmentItem, EditMeta } from './edit-node.js'
import { installEditDismiss } from './edit-dismiss.js'
import { buildModelPicker } from './model-picker.js'
import type { ModelOption, ModelPickerApi, ModelPickerState } from './model-picker.js'
import { renderModelMenu } from './model-menu.js'
import type { ModelPane } from './model-menu.js'
import { buildDraftFill, defaultAttachmentName } from './draft-fill.js'
import { activeSession, recordVersion } from './version-tree.js'
import type { DraftAttachmentRef } from './draft-fill.js'
import type { ClientContext, ClientSessionsService, ClientWorkspacesService, ClientUiWorkspaceService, ChatNodeProps, ConversationInputShell, ConversationService } from '../types/client-contract.js'
import type { SnapshotInfoResponse, PreviewResponse, ExecuteResponse, DiffChange, RecallScope } from '../types/api.js'

// defaultAttachmentName 的实现随附件回填链迁到 draft-fill.ts；此 re-export 保住
// 既有 import 路径（tests/unit/client-pure.test.js 直测它）
export { defaultAttachmentName }

// 块解析与文件卡片度量拆在 message-blocks.ts（自包含纯逻辑，与撤回状态机无关）；
// re-export 保住既有 import 路径（client-pure 单测从本文件导入）
import { attachmentRefsFromBlocks, fileCardInfo, projectMessageBlocks } from './message-blocks.js'
import type { ChatBlock } from './message-blocks.js'
export { attachmentRefsFromBlocks, fileCardInfo } from './message-blocks.js'
export type { ChatBlock, FileCardInfo } from './message-blocks.js'

// kind 单表与摘要拆在 diff-kinds.ts（自包含纯映射，与状态机无关）；re-export
// 保住既有 import 路径——client-pure 单测与 locales 注释都指向本文件
import { KIND_INFO, isChangeKind, summaryText } from './diff-kinds.js'
import type { ChangeKind, ChangeCounts } from './diff-kinds.js'
export { KIND_INFO, isChangeKind, summaryText } from './diff-kinds.js'
export type { ChangeKind, ChangeCounts } from './diff-kinds.js'

// 面板状态机拆在 recall-stage.ts（纯类型，issue #31 的 files/scope 分叉在那里）
import type { RecallStage } from './recall-stage.js'
export type { RecallStage } from './recall-stage.js'

export interface RecallNodeApi {
  UserRecallNode: (props: ChatNodeProps) => unknown
}

export function buildRecallNode(
  React: ReactApi,
  util: UtilApi,
  ctx: ClientContext,
  sessionsSvc: ClientSessionsService,
  workspacesSvc: ClientWorkspacesService,
  uiWorkspaceSvc?: ClientUiWorkspaceService
): RecallNodeApi {
  const { api, ensureInit, showThrottledToast, writeClipboard, clockText, pluginConfig, messageFor, t } = util
  // 编辑面板与图标走独立模块（issue #26）：撤回面板与编辑面板的 stage 语义
  // 不同（确认 vs 直接发送），强行合并会让两套文案矩阵互相污染
  const { EditIcon, EditPanel } = buildEditFlow(React, t)
  // 输入区回填（文本 + 附件 + 可选发送）：撤回回填与编辑重发共用同一条官方
  // 写入通道，实现见 draft-fill.ts
  const { fillDraft, preloadAttachmentFiles } = buildDraftFill(ctx)

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

  // 撤回按钮图标。形状与插件图标文件（assets/icon.svg，插件管理页展示）保持一致：
  // 两条侧翼从箭尖算起缩到 70%、尾端水平线延到与侧翼端点同列（x=6.3）、整组上移
  // 1.1 让几何中心落在画布中心；两处是同一套坐标，改动要同步（图标文件另有写死
  // 颜色与 20 声明尺寸两项差异——图片不继承 currentColor，颜色只能写死）。
  // 这里保持内联渲染的既有规格：16 声明尺寸、stroke 1.4、currentColor 随按钮文字色。
  function UndoIcon() {
    return React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      React.createElement('g', { transform: 'translate(0 -1.1)' },
        React.createElement('path', { d: 'M6.3 4.7 3.5 7.5l2.8 2.8' }),
        React.createElement('path', { d: 'M4.5 7.5h5a3 3 0 0 1 0 6H6.3' })
      )
    )
  }

  // scope/onScopeChange：模式选择是确认面板内的组件态（both/session-only），
  // 面板文案矩阵（清单语义/安全快照预告/按钮/executing/done）随其分叉；放
  // recallPanel 参数而非模块级——HMR 与多消息节点并挂时各面板状态互不串扰。
  function recallPanel(recall: RecallStage, closePanel: () => void, executeRecall: () => void, scope: RecallScope, onScopeChange: (s: RecallScope) => void) {
    if (recall.stage === 'loading') {
      return React.createElement('div', { className: 'dsh-recall-panel' },
        React.createElement('div', { className: 'dsh-recall-panel-title' }, t('recall.loading'))
      )
    }
    if (recall.stage === 'error') {
      return React.createElement('div', { className: 'dsh-recall-panel' },
        React.createElement('div', { className: 'dsh-recall-panel-title' }, t('recall.error.title')),
        React.createElement('div', { className: 'dsh-recall-panel-note' }, recall.message || ''),
        React.createElement('div', { className: 'dsh-recall-panel-actions' },
          React.createElement('button', { type: 'button', className: 'dsh-recall-btn', onClick: closePanel }, t('common.close'))
        )
      )
    }
    if (recall.stage === 'confirm') {
      const changes = recall.changes || []
      const total = typeof recall.total === 'number' ? recall.total : changes.length
      // 摘要一律用 Host 的全量计数：changes 截断到 500 条，按它统计会与 total
      // 打架（实测 3054 条只报「修改 448」）。计数缺失且清单被截断时宁可不
      // 出摘要也不出错数；未截断（旧 Host/小工作区）时本地统计等价
      let counts: ChangeCounts | null = recall.counts || null
      if (!counts && !recall.truncated) {
        counts = { modified: 0, restored: 0, added: 0 }
        for (const c of changes) {
          if (c && isChangeKind(c.kind)) counts[c.kind]++
        }
      }
      const rows: Array<ReturnType<typeof React.createElement>> = changes.map((c: DiffChange, i: number) => {
        const info = KIND_INFO[c.kind as ChangeKind]
        return React.createElement('div', { className: 'dsh-recall-file', key: i },
          React.createElement('span', { className: 'dsh-recall-badge dsh-recall-badge-' + (info ? info.cls : '') }, info ? t(info.labelKey) : (c.kind || '')),
          React.createElement('span', { className: 'dsh-recall-rel' }, c.rel || '')
        )
      })
      // cutSeq 为 null 表示该消息是会话第一条用户消息：文件可回退但对话无从回退
      const canRevertChat = typeof recall.cutSeq === 'number'
      // issue #31：仅消息条目没有文件树——范围单选不再有意义，文案与提交
      // 按钮一律走 session-only 分支（与 Host 侧的强制降级保持一致）
      const noFiles = recall.files === false
      const sessionOnly = noFiles || (canRevertChat && scope === 'session-only')
      // 既无文件树、又是首条消息：没有任何可撤回的内容，提交必须禁用
      const noEffect = noFiles && !canRevertChat
      if (recall.truncated) {
        rows.push(React.createElement('div', { className: 'dsh-recall-panel-note', key: 'truncated' },
          t(sessionOnly ? 'recall.truncated.chat' : 'recall.truncated.files', { shown: changes.length, total })
        ))
      }
      // both 首段按「有时间 / 无时间」「有摘要 / 无摘要」四个分叉组合：模板各自
      // 成句（英文语序与括号标点都和中文不同），不在渲染里拼中文句子骨架
      const summary = counts ? summaryText(counts, t) : ''
      const rollbackLead = recall.time
        ? t('recall.confirm.rollbackAt', { time: clockText(recall.time) })
        : t('recall.confirm.rollbackNoTime')
      const filesLead = t('recall.confirm.files', {
        total,
        summary: summary ? t('common.paren', { text: summary }) : ''
      })
      return React.createElement('div', { className: 'dsh-recall-panel' },
        React.createElement('div', { className: 'dsh-recall-panel-title' }, t('recall.confirm.title')),
        sessionOnly
          ? // session-only：零文件改动即无不可逆操作缺口——安全快照预告随之隐藏
            //（不打安全快照），主说明换成模式语义；仅消息条目另给专属说明
            React.createElement('div', { className: 'dsh-recall-panel-note' },
              t(noFiles ? 'recall.confirm.messageOnly' : 'recall.confirm.sessionOnly')
            )
          : React.createElement('div', { className: 'dsh-recall-panel-note' },
              rollbackLead + filesLead
            ),
        sessionOnly ? null : React.createElement('div', { className: 'dsh-recall-panel-note' },
          t(canRevertChat ? 'recall.confirm.chatBoth' : 'recall.confirm.chatFirst')
        ),
        sessionOnly && changes.length > 0
          ? // 文件清单保留展示但降级为参考语义：清单照常算（Host preview 链路
            // 不分叉），只是告知用户所选模式不会真的改这些文件
            React.createElement('div', { className: 'dsh-recall-panel-note', key: 'ref-note' },
              t('recall.confirm.refNote')
            )
          : null,
        changes.length > 0 ? React.createElement('div', { className: 'dsh-recall-list' }, ...rows) : null,
        canRevertChat && !noFiles
          ? // 模式二选一（原生 radio，键盘方向键可达）：临场选择不设全局配置项；
            // 默认 both 与现状一致，面板每次打开都复位到默认起点。仅消息条目
            // 没有可选项（没有文件树），整组隐藏
            React.createElement('div', { className: 'dsh-recall-scope', role: 'radiogroup', 'aria-label': t('recall.scope.aria') },
              React.createElement('label', { className: 'dsh-recall-scope-item' },
                React.createElement('input', { type: 'radio', name: 'dsh-recall-scope', checked: scope === 'both', onChange: () => onScopeChange('both') }),
                React.createElement('span', { className: 'dsh-recall-scope-label' }, t('recall.scope.both'))
              ),
              React.createElement('label', { className: 'dsh-recall-scope-item' },
                React.createElement('input', { type: 'radio', name: 'dsh-recall-scope', checked: scope === 'session-only', onChange: () => onScopeChange('session-only') }),
                React.createElement('span', { className: 'dsh-recall-scope-label' }, t('recall.scope.sessionOnly'))
              )
            )
          : null,
        noEffect
          ? // 仅消息 + 首条消息：文件无快照、对话无更早切点，提交只会空转
            React.createElement('div', { className: 'dsh-recall-panel-note', key: 'no-effect' }, t('recall.confirm.noEffect'))
          : null,
        React.createElement('div', { className: 'dsh-recall-panel-actions' },
          React.createElement('button', { type: 'button', className: 'dsh-recall-btn', onClick: closePanel }, t('common.cancel')),
          React.createElement('button', { type: 'button', className: 'dsh-recall-btn dsh-recall-btn-danger', disabled: noEffect, onClick: executeRecall }, t(sessionOnly ? 'recall.confirm.submit.sessionOnly' : 'recall.confirm.submit.both'))
        )
      )
    }
    if (recall.stage === 'executing') {
      // 执行阶段的模式文案按实际下发的 scope 取（仅消息条目被强制 session-only）
      const active = recall.scope || scope
      return React.createElement('div', { className: 'dsh-recall-panel' },
        React.createElement('div', { className: 'dsh-recall-panel-title' }, t(active === 'session-only' ? 'recall.executing.sessionOnly' : 'recall.executing.both'))
      )
    }
    if (recall.stage === 'done') {
      // 结果文案按实际执行的模式渲染：仅消息条目被 Host 强制成 session-only，
      // 组件态 scope 仍是 both，用它会误报「文件与对话已回退」
      const active = recall.scope || scope
      return React.createElement('div', { className: 'dsh-recall-panel' },
        React.createElement('div', { className: 'dsh-recall-panel-title' }, t('recall.done.title')),
        React.createElement('div', { className: 'dsh-recall-panel-note' },
          active === 'session-only'
            ? // session-only 文案矩阵：文件侧零改动是确定事实，失败时也只描述对话侧
              (recall.chatReverted
                ? t('recall.done.sessionOnly.ok')
                : t('recall.done.sessionOnly.fail', { error: recall.chatError || t('common.unknownReason') }))
            : (recall.chatReverted
                ? t('recall.done.both.ok')
                : t('recall.done.both.partial') + (recall.chatError ? t('recall.done.both.failChat', { error: recall.chatError }) : ''))
        ),
        React.createElement('div', { className: 'dsh-recall-panel-actions' },
          React.createElement('button', { type: 'button', className: 'dsh-recall-btn', onClick: closePanel }, t('common.close'))
        )
      )
    }
    return null
  }

  // 撤回后清理 fork 子会话里被 seed 重放出来的排队消息：官方 fork 的切点会
  // 把「被撤回消息的 inbox 入队事件」一并复制进子会话（Host 侧
  // scanStaleQueueItemIds 的窗口说明），子会话重建 inbox 后输入框上方就凭空
  // 多出一条排队消息；子会话被驱动时该入队项还会被当作真实一轮消费。
  //
  // 按 item id 直删：Host 下发的 id 就是那条消息的 message id，也正是官方
  // updateQueue 的寻址键（0.1.5-rc.1 实测：直删 accepted，重复删
  // queue-item-not-found），与 QueueDock 的「删除排队消息」同一动词。不读队列
  // 快照、不做 rpcId 匹配——队列快照走 control 帧、到达时机不定，命中式等待会
  // 整段落空（2.3.19 真机实证：30 秒窗口内卡片始终在，清理从未触发）。只在会话
  // 面尚未就绪时做短窗口重试（5 秒），拿到 face 即发出删除。
  function removeStaleQueueItems(targetSessionId: string, itemIds: unknown): void {
    if (!Array.isArray(itemIds) || itemIds.length === 0) return
    const deadline = Date.now() + 5000
    const attempt = () => {
      try {
        const binding = sessionsSvc && typeof sessionsSvc.binding === 'function' ? sessionsSvc.binding(targetSessionId) : null
        const face = binding && binding.session
        if (face && typeof face.updateQueue === 'function') {
          // 逐项失败只影响该项（与官方 QueueDock 的行级操作同语义）：入队项
          // 已被消费时返回 queue-item-not-found，此时已无残留可清。
          for (const itemId of itemIds) {
            if (typeof itemId !== 'string' || itemId === '') continue
            face.updateQueue(itemId, { kind: 'remove' }).catch(() => {}) // 逐项静默（not-found = 已无残留，语义见上）
          }
          return
        }
      } catch (error) { /* 服务面未就绪：继续等待 */ }
      if (Date.now() >= deadline) {
        recallNodeLog.warn('残留排队消息未能自动清理（会话面未就绪）：', itemIds)
        showThrottledToast(t('toast.staleQueue'))
        return
      }
      setTimeout(attempt, 250)
    }
    attempt()
  }

  function UserRecallNode(props: ChatNodeProps) {
    const node = props && props.node
    // 内容渲染入口（I2 三代契约，判据单源在 user-content.ts 文件头）：
    // - ≤0.2.1-alpha.2（旧面）：只有 renderMessageImages 图片闭包（内置鉴权/
    //   缓存/重试/灯箱），文本/文件/JSON 由插件自绘。
    // - ≥0.2.1-alpha.3（新面）：图片闭包下线，整条内容经
    //   conversation.chat.user.content Factory 渲染（官方 UserMessageNodeView
    //   同法）——插件只保留动作行。
    // 判据以旧面闭包在场为准，而不是探测 renderFactorySlot：0.2.0-rc.2 两者
    // 并存但新槽位缺席，误判会让正文静默空白（issue #23）。
    const renderMessageImages = props && props.renderMessageImages
    const renderFactorySlot = props && props.renderFactorySlot
    const loadImage = props && props.loadImage
    const sessionId = props && props.sessionId
    const data = (node && node.data ? node.data : {}) as { content?: unknown; time?: unknown; referenceLabels?: unknown; skillNames?: unknown }
    // node.id 是会话事件匹配时写入的真实消息 ID；node.key 是位置键，不能用于快照查询
    const messageId = node ? String(node.id || node.key || '') : ''
    const blocks: ChatBlock[] = Array.isArray(data.content) ? data.content as ChatBlock[] : []
    // 以下四个块视图供自绘降级路径使用（旧面主路径 / 新面工厂兜底）；投影口径
    // 与注释见 message-blocks.ts（新面主路径由 content Factory 直接消费 blocks）
    const { text, images: imageBlocks, files: fileBlocks, rest } = projectMessageBlocks(blocks)
    // 回填用附件引用（image/file 块）：撤回后连同文本一起回填到输入框
    const attachmentRefs = attachmentRefsFromBlocks(blocks)
    // 版本翻页器所在的 assistant-actions 槽只收 messageId，拿不到 sessionId：
    // 由消息节点在渲染时把当前会话记到共享位（列表里最后渲染的即当前会话，
    // 而 turn-tail 的 pager 在同一次提交中后渲染，读到的一定是最新值）
    activeSession.id = String(sessionId || '')

    const [copied, setCopied] = React.useState(false)
    const [hasSnapshot, setHasSnapshot] = React.useState(false)
    const [recall, setRecall] = React.useState<RecallStage>({ stage: 'idle' })
    // 撤回范围（确认面板内临场选择）：默认 both 与现状一致；openPreview/
    // closePanel 时复位——每次面板打开都是确定起点，不残留上一次选择
    const [scope, setScope] = React.useState<RecallScope>('both')
    // 就地编辑（issue #26）：与撤回面板互斥——两条入口共用同一段 fork 收尾，
    // 但面板语义不同（不可逆确认 vs 改完直接发），stage 各自独立不互相污染
    const [edit, setEdit] = React.useState<EditStage>({ stage: 'idle' })
    const stackRef = React.useRef<HTMLElement | null>(null)
    // 编辑卡上的附件：原消息附件可逐个移除，新加的（粘贴/拖入/选择）随消息发出
    const [editFiles, setEditFiles] = React.useState<File[]>([])
    const [droppedRefs, setDroppedRefs] = React.useState<string[]>([])
    // 图片缩略图：原消息图片走官方 loadImage（与消息里大图同源），本地新加图片
    // 用 object URL；加载完成前先按文件名 chip 渲染，拿到 URL 后换成缩略图
    const [refPreviews, setRefPreviews] = React.useState<Record<string, string>>({})
    const fileUrlsRef = React.useRef<Map<File, string>>(new Map())
    // 元信息：权限只读（抄自底部官方输入框当前显示）；模型走官方目录服务，
    // 打开编辑时加载一次，选择后同步到底部 chip 与后续 fork 的子会话
    const [editMeta, setEditMeta] = React.useState<EditMeta>({ permission: '', model: '' })
    const [modelState, setModelState] = React.useState<ModelPickerState | null>(null)
    const [modelOpen, setModelOpen] = React.useState(false)
    const [modelBusy, setModelBusy] = React.useState(false)
    // 菜单分两段（模型列表 / 推理等级），与官方同构；query 只作用于模型列表
    const [modelPane, setModelPane] = React.useState<ModelPane>('main')
    const [modelQuery, setModelQuery] = React.useState('')
    const pickerRef = React.useRef<ModelPickerApi | null>(null)

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
              const names = res.skipped.slice(0, 5).join(t('common.listSep')) + (res.skipped.length > 5 ? t('toast.skippedMore', { n: res.skipped.length }) : '')
              showThrottledToast(t('toast.skipped', { names }))
            }
            setHasSnapshot(true)
            return
          }
          // 失败/熔断是终止态：快照不会迟到，提示后停止轮询
          if (res && res.failed) {
            if (recent) showThrottledToast(t('toast.snapshotFailed', { error: String(res.error || t('common.unknownReason')).slice(0, 140) }))
            return
          }
          // issue #18：has=false 的「非失败」解释（当前只有构建产物工作区根停用
          // 快照）——同样是终止态：快照不会迟到，提示一次后停止空轮询。
          // A4：Host 下发 artifactSeg（命中段名）时本地取词；仅老 Host 才回落
          // 拼好的中文字段 notice
          if (res && (res.artifactSeg || res.notice)) {
            if (recent) {
              const text = res.artifactSeg
                ? t('notice.buildRoot', { seg: res.artifactSeg })
                : String(res.notice).slice(0, 140)
              showThrottledToast(text)
            }
            return
          }
          if (recent && attempts < MAX_ATTEMPTS) timer = setTimeout(schedule, RETRY_MS)
        }).catch(() => {
          // 查询失败按未就绪退避重试（与 has:false 同节奏，不打扰用户）
          if (alive && recent && attempts < MAX_ATTEMPTS) timer = setTimeout(schedule, RETRY_MS)
        })
      }
      // 先等 init 预热完成再查快照存在性：避免索引未载入时误判 has:false
      ensureInit(sessionId).then(() => {
        if (!messageId || !alive) return
        schedule()
      }).catch(() => {
        // init 失败按未就绪退避重试（同上节奏）
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

    // ---- 就地编辑（issue #26）----
    // 权限/模型 chip 只是上下文提示：值从底部官方输入框的槽容器里读，不碰服务
    // （`data-slot` 名是官方契约，已列在本仓库的类型枚举里）
    const readComposerMeta = (): EditMeta => {
      const empty: EditMeta = { permission: '', model: '' }
      if (typeof document === 'undefined') return empty
      const card = document.querySelector('[data-composer-card]')
      if (!card) return empty
      const textOf = (slot: string): string => {
        const el = card.querySelector('[data-slot="' + slot + '"]') as HTMLElement | null
        if (!el) return ''
        // innerText 会按布局补上元素间的空格（槽里常有「模型 · 档位」两段）；
        // jsdom 没实现 innerText，回落到 textContent 并自行收敛空白
        const raw = typeof el.innerText === 'string' ? el.innerText : el.textContent
        return String(raw || '').replace(/\s+/g, ' ').trim()
      }
      return { permission: textOf('conversation.input.permission'), model: textOf('conversation.input.model') }
    }

    // 官方 loadImage(attachment) → Promise<url>：消息里的大图与缩略图同一来源，
    // 原消息图片不必自己读字节。旧宿主可能没有该 props，缺失就退回文件名 chip
    const resolveImage = typeof loadImage === 'function'
      ? loadImage as (attachment: unknown) => Promise<unknown>
      : null
    // 只回收自己创建的 blob: URL；loadImage 返回的 URL 由宿主管理
    const revokePreview = (url: string) => {
      if (url.indexOf('blob:') !== 0) return
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
    }
    const previewOfFile = (file: File): string => {
      const cached = fileUrlsRef.current.get(file)
      if (cached !== undefined) return cached
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return ''
      const url = URL.createObjectURL(file)
      fileUrlsRef.current.set(file, url)
      return url
    }

    // 未被移除的原消息附件：提交时按此清单早读字节，fork 后重新登记到子会话
    const keptRefs = (): DraftAttachmentRef[] => attachmentRefs.filter((ref) => droppedRefs.indexOf(ref.attachmentId) < 0)
    const editAttachments = (): EditAttachmentItem[] => {
      const items: EditAttachmentItem[] = []
      let index = 0
      for (const ref of keptRefs()) {
        const item: EditAttachmentItem = { key: 'ref:' + ref.attachmentId, name: ref.name || defaultAttachmentName('application/octet-stream', index) }
        const preview = refPreviews[ref.attachmentId]
        if (ref.kind === 'image' && typeof preview === 'string' && preview !== '') item.previewUrl = preview
        items.push(item)
        index++
      }
      for (const [fileIndex, file] of editFiles.entries()) {
        const item: EditAttachmentItem = { key: 'file:' + fileIndex, name: file.name || ('attachment-' + (fileIndex + 1)) }
        if (typeof file.type === 'string' && file.type.indexOf('image/') === 0) {
          const preview = previewOfFile(file)
          if (preview !== '') item.previewUrl = preview
        }
        items.push(item)
      }
      return items
    }
    const removeEditAttachment = (key: string) => {
      if (key.indexOf('ref:') === 0) { setDroppedRefs((prev) => prev.concat(key.slice(4))); return }
      if (key.indexOf('file:') !== 0) return
      const index = Number(key.slice(5))
      if (!Number.isFinite(index)) return
      const removed = editFiles[index]
      if (removed !== undefined) {
        const url = fileUrlsRef.current.get(removed)
        if (url !== undefined) { revokePreview(url); fileUrlsRef.current.delete(removed) }
      }
      setEditFiles((prev) => prev.filter((_, i) => i !== index))
    }

    // 两条入口互斥：preview 在途时不接编辑，打开编辑则把撤回面板收回 idle。
    // 打开时只改 UI 状态：preview 放到提交时做——「只是想改一个字」的路径
    // 不该先等一次 git 目录遍历
    const openEdit = () => {
      if (edit.stage === 'submitting' || recall.stage === 'loading' || recall.stage === 'executing') return
      // 已在编辑态：忽略重复点击（否则会用原文覆盖用户改到一半的文本）
      if (edit.stage === 'editing') return
      // 错误态重开 = 回到编辑态并保留改过的文本
      if (edit.stage === 'error') {
        setEdit({ stage: 'editing', text: edit.text, attachments: edit.attachments })
        return
      }
      setRecall({ stage: 'idle' })
      setEditFiles([])
      setDroppedRefs([])
      setRefPreviews({})
      setEditMeta(readComposerMeta())
      setModelState(null)
      setModelOpen(false)
      setModelPane('main')
      setModelQuery('')
      // 模型目录按会话解析：服务不可用（旧宿主/未注册）时 picker 为 null，
      // chip 退回只读展示，不打断编辑
      const picker = buildModelPicker(ctx, String(sessionId || ''))
      pickerRef.current = picker
      if (picker) {
        picker.load().then((state) => { if (state) setModelState(state) }).catch(() => {})
      }
      // 原消息里的图片：按块并发取缩略图，先渲染文件名 chip、拿到 URL 再替换
      if (resolveImage) {
        for (const block of imageBlocks) {
          const attachment = block.attachment as { attachmentId?: unknown } | null
          const id = attachment && typeof attachment.attachmentId === 'string' ? attachment.attachmentId : ''
          if (id === '') continue
          Promise.resolve(resolveImage(attachment)).then((url) => {
            if (typeof url !== 'string' || url === '') return
            setRefPreviews((prev) => (prev[id] !== undefined ? prev : { ...prev, [id]: url }))
          }).catch(() => {})
        }
      }
      setEdit({ stage: 'editing', text, attachments: attachmentRefs.length })
    }

    const editFail = (nextText: string, message: string) => {
      setEdit({ stage: 'error', text: nextText, attachments: attachmentRefs.length, message })
    }

    // 关闭一律回 idle：错误态的「关闭」是放弃本次编辑，用户再点 ✎ 重新开始
    const closeEdit = () => {
      setEdit({ stage: 'idle' })
      setEditFiles([])
      setDroppedRefs([])
      setRefPreviews({})
      for (const url of fileUrlsRef.current.values()) revokePreview(url)
      fileUrlsRef.current.clear()
      setModelState(null)
      setModelOpen(false)
      pickerRef.current = null
    }

    // 节点卸载（切会话/换视图）也要回收本地缩略图，否则 blob URL 会一直挂着
    React.useEffect(() => () => {
      for (const url of fileUrlsRef.current.values()) revokePreview(url)
      fileUrlsRef.current.clear()
    }, [])

    // 模型菜单：点开先回主段（模型 / 推理等级两行）；选择走官方 selectModel，
    // 落地后重读目录刷新标签。失败只提示、菜单留在原处，不打断编辑
    const toggleModelMenu = () => {
      if (!pickerRef.current || modelBusy) return
      setModelOpen((prev) => {
        if (prev) return false
        setModelPane('main')
        setModelQuery('')
        return true
      })
    }
    const activeModelOption = (): ModelOption | null => {
      if (!modelState) return null
      for (const group of modelState.groups) {
        for (const option of group.options) {
          if (option.key === modelState.activeKey) return option
        }
      }
      return null
    }
    const commitModel = (option: ModelOption, effortId: string) => {
      const picker = pickerRef.current
      if (!picker || modelBusy) return
      setModelBusy(true)
      picker.select(option, effortId).then((error) => {
        if (error !== null) {
          setModelBusy(false)
          showThrottledToast(error)
          return
        }
        return picker.load().then((state) => {
          setModelBusy(false)
          setModelOpen(false)
          setModelPane('main')
          if (state) setModelState(state)
        })
      }).catch(() => {
        setModelBusy(false)
      })
    }
    const pickModel = (option: ModelOption) => {
      // 换模型用该模型的默认档；重选同一模型保留当前档位（官方 selectionOf 同义）
      const current = modelState
      const effort = current !== null && option.key === current.activeKey
        ? current.activeEffortId
        : (option.defaultEffort || '')
      commitModel(option, effort)
    }
    const pickEffort = (effortId: string) => {
      const option = activeModelOption()
      if (option) commitModel(option, effortId)
    }

    // 菜单开着时点卡片外面只收菜单（不退出编辑）
    React.useEffect(() => {
      if (!modelOpen) return
      const doc = typeof document === 'undefined' ? null : document
      if (!doc) return
      const onPointerDown = (event: Event) => {
        const target = event.target as Element | null
        if (target && typeof target.closest === 'function' && target.closest('.dsh-recall-composer-model') !== null) return
        setModelOpen(false)
      }
      doc.addEventListener('pointerdown', onPointerDown, true)
      return () => doc.removeEventListener('pointerdown', onPointerDown, true)
    }, [modelOpen])

    // 编辑卡没有取消按钮：Esc 是唯一出口（见 edit-dismiss）——点空白不算放弃，
    // 否则滚动列表或点别的消息都会把正在编辑的文本丢掉
    const editPanelOpen = edit.stage === 'editing' || edit.stage === 'error'
    React.useEffect(() => {
      if (!editPanelOpen) return
      const doc = typeof document === 'undefined' ? null : document
      if (!doc) return
      // 模型菜单开着时 Esc 先收菜单，「退出编辑」留给下一次 Esc
      return installEditDismiss(doc, {
        popupSelector: '',
        onDismiss: () => {
          if (modelOpen) { setModelOpen(false); return }
          closeEdit()
        },
      })
    }, [editPanelOpen, modelOpen])

    // 编辑提交：preview 取切点 → execute(scope=session-only) → fork → 回填并发送。
    // scope 固定 session-only：编辑语义不动项目文件（与撤回面板的二选一是两回事）
    const submitEdit = () => {
      if (edit.stage !== 'editing' && edit.stage !== 'error') return
      const nextText = edit.text
      const kept = keptRefs()
      if (nextText.trim() === '' && kept.length === 0 && editFiles.length === 0) {
        editFail(nextText, t('edit.empty'))
        return
      }
      // 没有新附件就交 null：空数组的 promise 会让 fillDraft 一直等一条不会
      // 发生的附件链（startAttachDrafts 无 createDrafts 时返回 false）
      const extraFiles = editFiles.length > 0 ? Promise.resolve(editFiles.slice()) : null
      setEdit({ stage: 'submitting' })
      api<PreviewResponse>('preview', { messageId, sessionId }).then((res) => {
        if (!res || !res.ok) {
          editFail(nextText, messageFor(res, t('fallback.preview')))
          return
        }
        const cut = typeof res.cutSeq === 'number' ? res.cutSeq : null
        // 首条用户消息没有更早的 turn 边界：fork 只会复制整段会话，编辑必须
        // 明确拒绝而不是悄悄退化成「仅回填」
        if (cut === null) {
          editFail(nextText, t('edit.noCut'))
          return
        }
        executeRecall({
          scope: 'session-only',
          cutSeq: cut,
          total: typeof res.total === 'number' ? res.total : (res.changes || []).length,
          treeId: res.treeId || null,
          editText: nextText,
          editRefs: kept,
          editFiles: extraFiles,
        })
      }).catch((error) => {
        editFail(nextText, String(error))
      })
    }

    const openPreview = () => {
      if (recall.stage === 'loading' || recall.stage === 'executing') return
      // 撤回入口抢占用编辑面：同一时刻只留一个输入面，避免确认面板与锚定的
      // 官方输入框并存（closeEdit 负责摘补丁、还原座位与用户原有草稿）
      closeEdit()
      setScope('both')
      setRecall({ stage: 'loading' })
      api<PreviewResponse>('preview', { messageId, sessionId }).then((res) => {
        if (!res || !res.ok) {
          setRecall({ stage: 'error', message: messageFor(res, t('fallback.preview')) })
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
          cutSeq: typeof res.cutSeq === 'number' ? res.cutSeq : null,
          // 全量分类计数（changes 是截断后的清单，不能拿来统计）
          counts: res.counts || null,
          // issue #31：仅消息条目没有文件树（老 Host 无该字段 → 按 true）
          files: res.files !== false
        })
      }).catch((error) => {
        // 端点异常落错误态（面板显示可重试）
        setRecall({ stage: 'error', message: String(error) })
      })
    }

    // 撤回与编辑共用的执行链：编辑只是把「终态面板」换成「回填后自动发送」，
    // fork / 归档 / 残留排队清理 / lineage 走同一条路径（各写一份必然漂移）
    const executeRecall = (overrides?: { scope?: RecallScope; cutSeq?: number | null; total?: number; treeId?: string | null; editText?: string; editRefs?: DraftAttachmentRef[]; editFiles?: Promise<File[]> | null }) => {
      const editText = overrides && typeof overrides.editText === 'string' ? overrides.editText : null
      const isEdit = editText !== null
      if (!isEdit && recall.stage !== 'confirm') return
      const changes = recall.stage === 'confirm' ? recall.changes || [] : []
      // 白名单判定而不是 truthy：executeRecall 也会被当作 onClick 处理器传进
      // 事件对象（React 合成事件），真值检查会把事件当 scope 透传给 Host
      const activeScope: RecallScope = overrides && overrides.scope === 'session-only'
        ? 'session-only'
        : overrides && overrides.scope === 'both' ? 'both'
          // issue #31：仅消息条目没有文件树，Host 会强制降级成 session-only；
          // 这里按同一口径下发，executing/done 文案才不会误报文件已回退
          : (recall.stage === 'confirm' && recall.files === false ? 'session-only' : scope)
      const previewCut = overrides && overrides.cutSeq !== undefined
        ? overrides.cutSeq
        : (recall.stage === 'confirm' && typeof recall.cutSeq === 'number' ? recall.cutSeq : null)
      // 编辑路径的阶段映射：loading/executing 都归入 submitting，error 写进编辑
      // 面板（保留用户改到一半的文本）；done 由收尾处按 fork 结果决定
      const setStage = (stage: RecallStage) => {
        if (!isEdit) { setRecall(stage); return }
        if (stage.stage === 'error') {
          setEdit({ stage: 'error', text: editText === null ? '' : editText, attachments: attachmentRefs.length, message: stage.message })
        }
      }
      // 终态上报基座（issue #19）：五处上报点共用；sessionId 断言收口语义同
      // fork 处（撤回按钮可见时恒有）。载荷组装在 util.buildRecallNotify（纯函数，
      // 六场景矩阵单测直钉），这里只负责 fire-and-forget 发送
      const notifyBase = { sessionId: String(sessionId || ''), messageId, scope: activeScope }
      // P0-3：携带预览摘要（total 是完整计数，与 Host 侧 diffFor 的 total
      // 对齐；changes 截断到 500 条，不能用来比对）。Host 端据此在 execute
      // 时校验「预览后文件集是否变化」，变了则返回 STALE 拒绝执行。
      // PF-1：新版同时透传 previewTreeId（内容级指纹），Host 优先用它比对
      // 且免一次重复 diff；老 Host 忽略未知字段自动退回 total 校验。
      const previewTotal = overrides && typeof overrides.total === 'number'
        ? overrides.total
        : (recall.stage === 'confirm' && typeof recall.total === 'number' ? recall.total : changes.length)
      const previewTreeId = overrides && overrides.treeId !== undefined
        ? overrides.treeId
        : (recall.stage === 'confirm' ? recall.treeId : null)
      // 附件早读：此刻源会话仍在册（归档在 fork 之后才发生）、附件引用可解析；
      // 读成的 File 在 fork 出的子会话里由 fillDraft 注册为草稿附件（见上）。
      // 编辑路径不看 refillDraft（那是「撤回后是否回填」的开关）——原消息带
      // 附件就必须带过去，否则编辑重发会静默丢附件
      // 编辑路径的附件清单由编辑卡决定（原消息附件可能被逐个移除）
      const refsForFiles = overrides && overrides.editRefs ? overrides.editRefs : attachmentRefs
      const wantAttachments = refsForFiles.length > 0 && sessionId && (isEdit || pluginConfig.refillDraft)
      const baseFiles = wantAttachments ? preloadAttachmentFiles(sessionId as string, refsForFiles) : null
      // 编辑卡里新加的文件（粘贴/拖入/选择）走同一路合并，子会话里重建草稿附件
      const inlineFiles = overrides && overrides.editFiles ? overrides.editFiles : null
      const attachmentFiles = baseFiles !== null && inlineFiles !== null
        ? Promise.all([baseFiles, inlineFiles]).then(([base, extra]) => base.concat(extra))
        : (baseFiles !== null ? baseFiles : inlineFiles)
      setStage({ stage: 'executing', changes, scope: activeScope })
      // scope 透传：Host 端 session-only 走零 git 短路径；previewTreeId/
      // previewTotal 照常携带（Host 按 scope 忽略 STALE 校验）。cutSeq 为 null
      // 时 scope 恒为 both（radio 未渲染，无 session-only 可选）
      api<ExecuteResponse>('execute', { messageId, sessionId, previewTotal, previewTreeId: previewTreeId || undefined, scope: activeScope, previewAt: Date.now() }).then(async (res) => {
        if (!res || !res.ok) {
          // STALE：预览后文件变了——自动重新拉一次最新清单回到确认阶段
          if (res && res.code === 'STALE') {
            // 编辑走 session-only，Host 本就跳过 STALE 校验；真收到只可能是版本
            // 错位——给明确错误而不是把面板停在 submitting
            if (isEdit) {
              setStage({ stage: 'error', message: t('err.STALE') })
              return
            }
            setStage({ stage: 'loading' })
            api<PreviewResponse>('preview', { messageId, sessionId }).then((res2) => {
              if (!res2 || !res2.ok) {
                setStage({ stage: 'error', message: messageFor(res2, t('fallback.preview')) })
                return
              }
              setStage({
                stage: 'confirm',
                changes: res2.changes || [],
                total: typeof res2.total === 'number' ? res2.total : (res2.changes || []).length,
                truncated: Boolean(res2.truncated),
                treeId: res2.treeId || null,
                time: res2.time || null,
                cutSeq: typeof res2.cutSeq === 'number' ? res2.cutSeq : null,
                counts: res2.counts || null,
                files: res2.files !== false
              })
            }).catch((error) => {
              // 重拉失败落错误态（与首次 preview 同显式面）
              setStage({ stage: 'error', message: String(error) })
            })
            return
          }
          // 终态上报（issue #19）：护栏拒绝（AGENT_BUSY/NO_SNAPSHOT 等）发
          // failed(execute) 且透传 code 供下游过滤；STALE 是中间态已提前
          // return 不上报（规格 §一决策表）。fire-and-forget：旧 host 对
          // notify 返 404/未知端点，静默忽略即版本错位容错（§3.4）
          api('notify', buildRecallNotify(notifyBase, {
            outcome: 'execute-rejected', cutSeq: previewCut,
            code: res && typeof res.code === 'string' ? res.code : undefined,
            error: messageFor(res, ''),
          })).catch(() => {})
          setStage({ stage: 'error', message: messageFor(res, t('fallback.rollback')) })
          return
        }
        // 文件已回退；对话回退独立进行，失败只降级为“仅文件回退”而不是整体失败
        const cutSeq = typeof res.cutSeq === 'number' ? res.cutSeq : previewCut
        let chatReverted = false
        let chatError = ''
        // complete 上报的 archiveRequested 追踪：归档是 fire-and-forget，
        // 事件只表示「已发起」，不等归档落定
        let archiveRequested = false
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
              // 打开子会话：0.1.6-alpha.2 起 ISessions 移除 open（导航归视图所有
              // 者），改走 uiWorkspace 的 openSession；0.1.2〜0.1.6-alpha.1 用
              // sessions.open——按服务能力各吃各的，均缺失则降级为「仅文件回退、
              // 视图不切换」（守卫吞掉，无报错）
              if (uiWorkspaceSvc && typeof uiWorkspaceSvc.openSession === 'function') uiWorkspaceSvc.openSession(childId)
              else if (typeof sessionsSvc.open === 'function') sessionsSvc.open(childId)
              chatReverted = true
              fillTarget = childId
              // 版本家族登记：撤回与编辑重发走同一条 fork 收尾，两个入口都要记
              // （翻页器按家族根聚合，这里只给父子对，聚合在 version-tree 内做）
              recordVersion(String(sessionId || ''), childId)
              // 子会话从 seed 继承了一份「被撤回消息的 inbox 入队记录」，不清理
              // 就会在输入框上方显示成一条排队消息（Host 已解析出它对应的
              // item id 集合）
              removeStaleQueueItems(childId, res.staleQueueItemIds)
              // F1：上报撤回链（childId ↔ parentId），Host 持久化供版本家族展示；
              // 上报失败不阻断撤回主流程（家族是纯增量 UI）。
              api<unknown>('lineage-record', { childId, parentId: sessionId }).catch(() => {}) // 静默（纯增量 UI，见上）
              // 回退前的原会话归档（可关）：只是从列表隐藏、可恢复
              if (pluginConfig.archiveOriginal && workspacesSvc && typeof workspacesSvc.archiveSession === 'function') {
                archiveRequested = true
                // stopActivity：官方归档前经 `workspace/session-activity` 瀑布问「这会话还有
                // 什么在跑」（agent 回合 / jobs 后台作业 / subagent / schedule），有就抛
                // workspace/session-active 拒归档。之前不传该选项、又把 reject 吞掉，于是
                // 「有后台作业在跑时撤回」的原会话静默不归档、作业继续跑，作业结算
                // （cause:'kill'，不属被抑制的 teardown）还会被 jobs 工具当完成通知投递，
                // 把原会话唤醒开新一轮——文件已回滚，等于幽灵执行。撤回语义是这一版作废，
                // 故显式要求先停掉原会话活动再归档（官方 UI「停止并归档」同款选项；
                // 旧版服务无此参数时多传一个实参在 JS 侧无害）。
                workspacesSvc.archiveSession(sessionId as string, { stopActivity: true }).catch((error) => {
                  // 仍不阻断撤回主流程（fork 与回填已完成），但不再静默：归档失败意味着
                  // 原会话留在列表且可能继续跑，属用户可见降级，warn（恒输出）留痕便于排查
                  recallNodeLog.warn('archive original session failed:', error)
                })
              }
            } else {
              chatError = t('recall.chat.noChild')
              // 终态上报（issue #19）：fork 返空与抛错同语义——文件已回退但
              // 对话未回退，发 failed(fork) 而非 complete（下游若按 complete
              // 清记忆会把「对话还在」的回合误清，规格 §一决策表）
              api('notify', buildRecallNotify(notifyBase, { outcome: 'fork-failed', cutSeq, error: chatError })).catch(() => {})
            }
          } catch (error) {
            // fork 失败只降级为「仅文件回退」（chatError 进结果面板，见上方注释）
            chatError = String(error)
            // 终态上报：fork 抛错 → failed(fork)，理由同上（防下游误清记忆）
            api('notify', buildRecallNotify(notifyBase, { outcome: 'fork-failed', cutSeq, error: chatError })).catch(() => {})
          }
        }
        setHasSnapshot(false)
        if (isEdit) {
          // 编辑收尾：只有真的 fork 出新会话才回填并发送——fork 失败时原会话
          // 还在、原消息也还在，自动发出会变成同一会话里的重复消息
          if (chatReverted) {
            fillDraft(fillTarget as string, editText === null ? '' : editText, attachmentFiles, {
              submit: pluginConfig.editSubmitsImmediately,
            })
            // 收尾同时摘补丁、还原座位与用户原有草稿：会话已切到子会话，
            // 父会话的输入面必须回到正常状态
            closeEdit()
          } else {
            setEdit({ stage: 'error', text: editText === null ? '' : editText, attachments: attachmentRefs.length, message: chatError || t('edit.forkFailed') })
          }
        } else {
          // 把被撤回的消息文本回填到输入框（可在设置页关闭）
          // fillTarget 只在撤回链路上赋值（fork 出的 childId 或原 sessionId），
          // 断言收口——撤回执行必有会话上下文
          if (pluginConfig.refillDraft) {
            fillDraft(fillTarget as string, text, attachmentFiles)
            // 文件附件（非图片）没有回读通道：官方 session.attachment 只认图片引用
            // （Host 侧 referencedImage + readImage，file 块直接判 ATTACHMENT_NOT_
            // REFERENCED），插件侧读不到字节就必然填不回输入框。文本与图片照常
            // 回填，这里只把「少了什么」讲清楚，免得用户以为回填是完整的。
            if (fileBlocks.length > 0) showThrottledToast(t('toast.fileAttachRefill'))
          }
          // 注：快照 tag 在 Host 侧有意保留（幂等回退），刷新页面后该消息的
          // 撤回按钮会重新出现——这是「可再次回退到同一点」的特性而非 bug。
          setRecall({ stage: 'done', count: typeof res.count === 'number' ? res.count : changes.length, chatReverted, chatError, scope: activeScope })
        }
        // 终态上报（issue #19）：撤回链完整走完才发 complete（fork 失败路径
        // 已发过 failed(fork)，按 chatError 收口防双发矛盾终态——complete 与
        // failed 并存会让下游按 (sessionId,messageId,cutSeq) 幂等去重失灵）
        if (chatError === '') {
          api('notify', buildRecallNotify(notifyBase, {
            outcome: 'complete', cutSeq,
            childSessionId: chatReverted ? (String(fillTarget || '') || null) : null,
            count: typeof res.count === 'number' ? res.count : changes.length,
            chatReverted, archiveRequested,
          })).catch(() => {})
        }
      }).catch((error) => {
        // 端点异常落错误态（文件可能未回退，面板提示可重试）
        setStage({ stage: 'error', message: String(error) })
        // 终态上报（issue #19）：execute 抛异常发 failed(execute)——此时文件
        // 是否已回退不确定（规格 §一注明），下游按 stage 自行决定保守策略
        api('notify', buildRecallNotify(notifyBase, { outcome: 'execute-threw', cutSeq: previewCut, error: String(error) })).catch(() => {})
      })
    }

    const closePanel = () => {
      setScope('both')
      setRecall({ stage: 'idle' })
    }

    const bubbleChildren: Array<ReturnType<typeof React.createElement>> = []
    // 内容渲染分派（issue #23 修复点）：新面把整条内容交给官方 content
    // Factory（与官方 UserMessageNodeView 同款调用），插件只保留下方动作行；
    // 调用失败/返回空即回落自绘——「函数在场」不足以证明「槽位可用」
    // （0.2.0-rc.2 实证），回落保证内容永远不会静默空白。
    let officialFace = resolveUserContentFace({ renderMessageImages, renderFactorySlot, loadImage }) === 'factory'
    if (officialFace) {
      const official = renderOfficialUserContent(renderFactorySlot, blocks, data, loadImage, true)
      if (official.ok) {
        bubbleChildren.push(React.createElement(React.Fragment, { key: 'official' }, official.node as import('react').ReactNode))
      } else {
        officialFace = false
        recallNodeLog.warn('user.content factory unavailable; falling back to own rendering:', official.error)
      }
    }
    if (!officialFace) {
      // 自绘降级路径（旧面主路径 / 新面工厂兜底）：布局对齐官方「附件在上、
      // 文本在下」。新面兜底时图片无入口可用（图片闭包与其槽位同代下线），
      // 跳过即可——这是罕见中间态的降级面，内容其余部分照常可见
      if (imageBlocks.length && typeof renderMessageImages === 'function') {
        const render = renderMessageImages as (args: { images: Array<{ attachment: unknown }>; align: string }) => import('react').ReactNode
        bubbleChildren.push(React.createElement(React.Fragment, { key: 'images' },
          render({ images: imageBlocks, align: 'end' })
        ))
      }
      // 文件卡片与图片同属「附件在上、文本在下」的官方布局
      for (let i = 0; i < fileBlocks.length; i++) {
        const info = fileCardInfo(fileBlocks[i], t)
        if (!info) continue
        bubbleChildren.push(React.createElement('div', { className: 'dsh-recall-filecard', key: 'file-' + i },
          React.createElement('span', { className: 'dsh-recall-filecard-icon' }, info.ext),
          React.createElement('span', { className: 'dsh-recall-filecard-body' },
            React.createElement('span', { className: 'dsh-recall-filecard-name', title: info.name }, info.name),
            React.createElement('span', { className: 'dsh-recall-filecard-meta' }, info.size ? info.ext + ' ' + info.size : info.ext)
          )
        ))
      }
      // 文本纯字符串自绘：新面主路径已由官方 user.text 投影承接（含密钥脱敏
      // 链），此分支只在旧面与兜底可达
      if (text !== '') {
        bubbleChildren.push(React.createElement('div', { className: 'dsh-recall-bubble', key: 'text' }, text))
      }
      for (let i = 0; i < rest.length; i++) {
        bubbleChildren.push(React.createElement('pre', { className: 'dsh-recall-json', key: 'rest-' + i }, JSON.stringify(rest[i], null, 2)))
      }
    }

    const actions = []
    actions.push(React.createElement('span', { className: 'dsh-recall-time', key: 'time' }, clockText(data.time)))
    actions.push(React.createElement('button', {
      key: 'copy',
      type: 'button',
      className: 'dsh-recall-action',
      'aria-label': copied ? t('action.copied') : t('action.copy'),
      title: copied ? t('action.copied') : t('action.copy'),
      onClick: onCopy
    }, copied ? React.createElement(CheckIcon, {}) : React.createElement(CopyIcon, {})))
    if (hasSnapshot) {
      actions.push(React.createElement('button', {
        key: 'recall',
        type: 'button',
        className: 'dsh-recall-action',
        'aria-label': t('action.recall'),
        title: t('action.recall.title'),
        onClick: openPreview
      }, React.createElement(UndoIcon, {})))
      // 编辑入口与撤回并列（issue #26）：撤回是破坏性操作，编辑是新增路径，
      // 混成一个二级菜单会让「确认回退」的语义被稀释。已在编辑态则不再显示
      // ✎（点了也是空操作，留着只会让人以为「再点一次能重置」）
      if (edit.stage === 'idle') {
        actions.push(React.createElement('button', {
          key: 'edit',
          type: 'button',
          className: 'dsh-recall-action',
          'aria-label': t('action.edit'),
          title: t('action.edit.title'),
          onClick: openEdit
        }, React.createElement(EditIcon, {})))
      }
    }

    // 宽度约束按面分派：官方面需要外层全宽，官方 .userStack 的百分比才能按整列
    // 解析；legacy/回落面保留 stack 原 cap，自绘气泡的长文本宽度才与官方一致
    const stackClass = 'dsh-recall-stack' + (officialFace ? ' dsh-recall-stack-official' : '')
    // 编辑卡顶替气泡本体（底部官方输入框原样保留，不受影响）
    const editing = edit.stage !== 'idle'
    // 模型菜单节点：两段式（模型列表 / 推理等级），只在菜单打开时渲染
    const modelNodes = modelOpen && modelState
      ? renderModelMenu(React, t, {
          pane: modelPane,
          query: modelQuery,
          groups: modelState.groups,
          activeKey: modelState.activeKey,
          activeOption: activeModelOption(),
          modelLabel: modelState.label,
          effortLabel: modelState.effortLabel,
          activeEffortId: modelState.activeEffortId,
          busy: modelBusy,
          onPane: (next: ModelPane) => {
            setModelPane(next)
            if (next !== 'list') setModelQuery('')
          },
          onQuery: setModelQuery,
          onPick: pickModel,
          onPickEffort: pickEffort,
        })
      : null
    const bubble = bubbleChildren.length > 0
      ? React.createElement('div', { className: stackClass, key: 'stack', ref: stackRef }, ...bubbleChildren)
      : null
    const stack = editing
      ? React.createElement('div', { className: 'dsh-recall-stack dsh-recall-stack-editing', key: 'stack' },
          EditPanel({
            stage: edit,
            submitLabel: t(pluginConfig.editSubmitsImmediately ? 'edit.submit' : 'edit.submit.draftOnly'),
            meta: editMeta,
            attachments: editAttachments(),
            // chip 与官方同构：模型名与思考强度分两个 span（档位空 = provider default）
            modelLabel: modelState ? modelState.label : '',
            modelEffort: modelState ? modelState.effortLabel : '',
            modelOpen,
            modelBusy,
            modelNodes,
            onToggleModel: toggleModelMenu,
            onChange: (next: string) => setEdit((prev) => (prev.stage === 'editing' || prev.stage === 'error')
              ? { stage: 'editing', text: next, attachments: prev.attachments }
              : prev),
            onSubmit: submitEdit,
            onClose: closeEdit,
            onAddFiles: (files: File[]) => setEditFiles((prev) => prev.concat(files)),
            onRemoveAttachment: removeEditAttachment,
          })
        )
      : bubble
    return React.createElement('div', {
      className: 'dsh-recall-row',
      'data-time-hover-root': true,
      'data-editing': editing ? 'true' : undefined,
      // 版本翻页器据此确认「当前是哪个会话」（官方槽只给 messageId）
      'data-recall-session': sessionId || undefined,
    },
      stack,
      React.createElement('div', { className: 'dsh-recall-actions', key: 'actions' }, ...actions),
      recallPanel(recall, closePanel, () => executeRecall(), scope, setScope)
    )
  }

  return { UserRecallNode }
}
