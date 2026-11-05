/**
 * dsh-recall-plugin — 版本翻页器 ‹ X/N ›（assistant-actions + 会话头兜底）
 *
 * 每次撤回/编辑重发都会 fork 出新会话，同一段对话于是有多个真实版本。翻页器
 * 常规挂在回合末尾的官方操作区；provider 缺失等导致消息区不渲染时，会话头
 * 入口仍能按显式 sessionId 切换（issue #35）。切换先解档并导航目标，等目标
 * 挂载后才归档来源——openSession 只发起导航，不能证明会话可加载；宁可两个
 * 会话短暂并存，也不留下「来源已归档、目标未打开」的死角。
 *
 * 消息区只在最后一个回合显示：家族是会话级的，历史回合各挂一个控件会让同一页
 * 出现多个入口，点哪个都切到同一处，纯噪音。头部兜底在消息区入口可用时让位。
 */

import type { ReactApi, UtilApi } from './util.js'
import type { ClientUiWorkspaceService, ClientWorkspacesService } from '../types/client-contract.js'
import { activeSession, familyOf } from './version-tree.js'
import type { VersionFamily } from './version-tree.js'

// 当前会话 id：消息节点渲染时写进共享位；万一 pager 先于消息挂载（或节点被
// 官方缓存复用），回落到 DOM 上消息行留的 data-recall-session 标记
function currentSessionId(): string {
  if (activeSession.id) return activeSession.id
  if (typeof document === 'undefined') return ''
  const rows = document.querySelectorAll('[data-recall-session]')
  const last = rows.length > 0 ? rows[rows.length - 1] : null
  return last ? (last.getAttribute('data-recall-session') || '') : ''
}

// turn-tail 的属性值是回合号（data-turn-tail={turn}），这里只用它的存在性做
// 文档顺序比较：最后一个 turn-tail 即「当前会话的最后一轮」
function isLastTurnTail(node: Element | null): boolean {
  if (!node || typeof document === 'undefined') return false
  const own = node.closest('[data-turn-tail]')
  if (!own) return false
  const all = document.querySelectorAll('[data-turn-tail]')
  return all.length === 0 || all[all.length - 1] === own
}

function scrollerOf(node: Element | null): HTMLElement | null {
  let cur: Element | null = node ? node.parentElement : null
  while (cur) {
    if (cur instanceof HTMLElement && cur.scrollHeight > cur.clientHeight) {
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(cur) : null
      if (style && /(auto|scroll)/.test(style.overflowY)) return cur
    }
    cur = cur.parentElement
  }
  return null
}

// 视口锚定：记下「首个仍然可见的消息行」及其相对视口顶部的位置，切换后按同一
// 行重新对齐。切版本时消息内容不同，行高必然不同，只靠 scrollTop 会跳位。
function captureAnchor(): { key: string; top: number } | null {
  if (typeof document === 'undefined') return null
  const rows = document.querySelectorAll('[data-chat-anchor-key]')
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as HTMLElement
    const rect = row.getBoundingClientRect()
    if (rect.bottom > 0) {
      const key = row.getAttribute('data-chat-anchor-key') || ''
      return key ? { key, top: rect.top } : null
    }
  }
  return null
}

function restoreAnchor(scroller: HTMLElement | null, anchor: { key: string; top: number } | null): void {
  if (!scroller || !anchor || typeof document === 'undefined') return
  const rows = document.querySelectorAll('[data-chat-anchor-key]')
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as HTMLElement
    if (row.getAttribute('data-chat-anchor-key') !== anchor.key) continue
    const delta = row.getBoundingClientRect().top - anchor.top
    if (Math.abs(delta) > 1) scroller.scrollTop += delta
    return
  }
}

export interface VersionPagerApi {
  // sessionId 由槽的 inject(sessionId) 注入（官方 assistant-actions 契约），
  // messageId 是槽 props 本身
  VersionPager: (props: { messageId?: string; sessionId?: string }) => import('react').ReactNode
  // 会话头兜底入口：消息区因 provider 缺失等原因不渲染时，仍能按显式 sessionId 切版本
  VersionHeaderAction: (props: { sessionId?: string }) => import('react').ReactNode
}

// 目标挂载确认的兜底时限：超时后不归档来源，宁可短暂并存两个可见会话也不困住用户。
const READY_TIMEOUT_MS = 5000

interface PendingSwitch {
  from: string
  to: string
  done: () => void
  timer?: ReturnType<typeof setTimeout>
}

function pagerClass(variant: 'message' | 'header'): string {
  return variant === 'header' ? 'dsh-recall-pager dsh-recall-pager-header' : 'dsh-recall-pager'
}

export function buildVersionPager(
  React: ReactApi,
  util: UtilApi,
  workspacesSvc: ClientWorkspacesService,
  uiWorkspaceSvc?: ClientUiWorkspaceService
): VersionPagerApi {
  const { t, showThrottledToast } = util
  let pending: PendingSwitch | null = null
  let archiving = false
  let primarySessionId: string | null = null
  const headerListeners = new Set<() => void>()

  function setPrimarySessionId(sessionId: string | null): void {
    if (primarySessionId === sessionId) return
    primarySessionId = sessionId
    for (const notify of headerListeners) notify()
  }

  // openSession 只发起导航；由目标会话的明确 sessionId 挂载信号确认就绪，才收走来源入口。
  function settlePending(sessionId: string): void {
    const job = pending
    if (!job || job.to !== sessionId) return
    pending = null
    if (job.timer) clearTimeout(job.timer)
    archiving = true
    Promise.resolve()
      .then(() => workspacesSvc.archiveSession(job.from))
      .catch((error) => {
        // 目标已经打开，来源归档失败只遗留两个可访问会话，不做反向导航或归档目标。
        showThrottledToast(t('toast.pagerFailed', { error: String(error).slice(0, 120) }))
      })
      .then(() => { archiving = false; job.done() })
  }

  function PagerView(props: { messageId?: string; sessionId?: string; variant?: 'message' | 'header' }): import('react').ReactNode {
    const variant = props.variant === 'header' ? 'header' : 'message'
    // 头部入口只信显式 sessionId：消息 DOM 与共享位在异常会话里本就不可靠
    const sessionId = variant === 'header'
      ? String(props.sessionId || '')
      : String(props.sessionId || currentSessionId())
    const ref = React.useRef<HTMLDivElement | null>(null)
    const [family, setFamily] = React.useState<VersionFamily | null>(null)
    const [visible, setVisible] = React.useState(false)
    const [primaryPresent, setPrimaryPresent] = React.useState(false)
    const [busy, setBusy] = React.useState(false)

    // 家族数据在 fork 成功时写入 localStorage；挂载与消息变化时重读即可覆盖
    // 「刚提交完编辑、翻页器随新消息重挂」这条路径。延后一拍再判「是否最后一
    // 个回合」：新 turn-tail 可能在本组件首次 effect 之后才插进文档
    React.useEffect(() => {
      if (props.sessionId) settlePending(props.sessionId)
      if (variant === 'header') {
        setFamily(familyOf(sessionId))
        const sync = () => setPrimaryPresent(primarySessionId === sessionId)
        sync()
        headerListeners.add(sync)
        return () => { headerListeners.delete(sync) }
      }
      const measure = () => {
        const nextFamily = familyOf(sessionId)
        const nextVisible = isLastTurnTail(ref.current)
        setFamily(nextFamily)
        setVisible(nextVisible)
        setPrimarySessionId(nextVisible && nextFamily && nextFamily.ids.length >= 2 ? sessionId : null)
      }
      measure()
      const timer = setTimeout(measure, 60)
      return () => {
        clearTimeout(timer)
        if (primarySessionId === sessionId) setPrimarySessionId(null)
      }
    }, [variant, sessionId, props.messageId])

    const show = Boolean(family && family.ids.length >= 2 && (variant === 'header' ? !primaryPresent : visible))
    if (!show || !family) {
      // 容器必须照常渲染（空则 CSS :empty 隐藏）：若这里返回 null，ref 永不
      // 挂载，「我是最后一个回合吗」的第一步就量不到自己
      return React.createElement('div', { className: pagerClass(variant), ref })
    }

    const total = family.ids.length
    const index = family.index
    const go = (delta: number) => {
      if (busy || pending || archiving) return
      const target = family.ids[index + delta]
      if (!target) return
      const current = family.ids[index]
      if (!current || current === target) return
      setBusy(true)
      const scroller = scrollerOf(ref.current)
      const anchor = captureAnchor()
      const done = () => setBusy(false)
      const job: PendingSwitch = { from: current, to: target, done }
      pending = job
      job.timer = setTimeout(() => {
        if (pending !== job) return
        pending = null
        showThrottledToast(t('toast.pagerFailed', { error: t('pager.openUnconfirmed') }))
        done()
      }, READY_TIMEOUT_MS)
      let targetWasArchived = false
      try {
        const snapshot = workspacesSvc.list && workspacesSvc.list.getSnapshot()
        targetWasArchived = Boolean(snapshot && snapshot.archivedSessionIds && snapshot.archivedSessionIds.includes(target))
      } catch (e) { /* 快照不可读时不做可能误归档的补偿 */ }
      let unarchived = false
      let navigationReturned = false
      // 来源只在目标挂载后由 settlePending 归档，导航返回本身不代表会话可用。
      Promise.resolve()
        .then(() => (uiWorkspaceSvc && typeof uiWorkspaceSvc.unarchiveSession === 'function')
          ? uiWorkspaceSvc.unarchiveSession(target)
          : undefined)
        .then(() => {
          unarchived = true
          if (uiWorkspaceSvc && typeof uiWorkspaceSvc.openSession === 'function') uiWorkspaceSvc.openSession(target)
          navigationReturned = true
          // 会话内容异步替换：两次尝试覆盖「先渲染骨架、后补齐内容」的两拍
          setTimeout(() => restoreAnchor(scroller, anchor), 80)
          setTimeout(() => restoreAnchor(scroller, anchor), 320)
        })
        .catch(async (error) => {
          if (pending === job) {
            if (job.timer) clearTimeout(job.timer)
            pending = null
          }
          // 只有导航未接受目标时才恢复其原归档态；后续来源归档失败不能把已打开目标收走。
          if (unarchived && !navigationReturned && targetWasArchived && uiWorkspaceSvc) {
            try { await uiWorkspaceSvc.archiveSession(target) } catch (e) { /* 来源仍可访问，保留补偿失败现场 */ }
          }
          showThrottledToast(t('toast.pagerFailed', { error: String(error).slice(0, 120) }))
          done()
        })
    }

    return React.createElement('div', { className: pagerClass(variant), ref, 'data-busy': busy ? 'true' : undefined },
      React.createElement('button', {
        type: 'button',
        className: 'dsh-recall-pager-btn',
        'aria-label': t('pager.prev'),
        title: t('pager.prev'),
        disabled: busy || index <= 0,
        onClick: () => go(-1),
      }, '\u2039'),
      React.createElement('span', { className: 'dsh-recall-pager-count', 'aria-label': t('pager.label', { n: index + 1, total }) }, (index + 1) + '/' + total),
      React.createElement('button', {
        type: 'button',
        className: 'dsh-recall-pager-btn',
        'aria-label': t('pager.next'),
        title: t('pager.next'),
        disabled: busy || index >= total - 1,
        onClick: () => go(1),
      }, '\u203a')
    )
  }

  function VersionPager(props: { messageId?: string; sessionId?: string }): import('react').ReactNode {
    return React.createElement(PagerView, { ...props, variant: 'message' })
  }

  function VersionHeaderAction(props: { sessionId?: string }): import('react').ReactNode {
    return React.createElement(PagerView, { ...props, variant: 'header' })
  }

  return { VersionPager, VersionHeaderAction }
}
