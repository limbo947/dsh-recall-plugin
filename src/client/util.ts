/**
 * dsh-recall-plugin — client util（纯函数模块级导出 + 有状态工厂）
 *
 * 纯函数（clockText/sizeText/bytesToMb/buildTree）模块级导出，供单测直接
 * import 与工厂复用；api/toast/ensureInit 有闭包状态（每会话 init 缓存、
 * 提示节流），由 buildUtil() 工厂生产，避免模块级可变状态（HMR 假设）。
 */

import type { ManageListItem } from '../types/api.js'

// React 以参数逐层注入（同形态复刻的依赖注入形态）：参数类型即 React 全量
// 命名空间类型（@types/react 是唯一用途，import type 运行时零依赖）
export type ReactApi = typeof import('react')

// 树形结构（buildTree 产出：工作区 → 会话 → 快照三级）
export interface TreeWorkspace {
  root: string | null
  name: string
  sessions: TreeSession[]
}
export interface TreeSession {
  root: string | null
  sessionId: string | null
  title: string | null
  items: ManageListItem[]
}

// 消息时间：当天只显示时分，跨天显示月/日 时分
export function clockText(ms: unknown): string {
  try {
    // time 字段缺失或非法时返回空串：Invalid Date 不会 throw，
    // 不拦会渲染出 "NaN/NaN NaN:NaN" 这样的坏时间戳
    if (!ms || isNaN(new Date(ms as number | string).getTime())) return ''
    const d = new Date(ms as number | string)
    const now = new Date()
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return sameDay ? hh + ':' + mm : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hh + ':' + mm
  } catch (e) {
    return ''
  }
}

// 字节大小展示：KB/MB/GB 边界与格式
export function sizeText(bytes: unknown): string {
  const n = Number(bytes)
  if (!bytes || n <= 0) return '0 MB'
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB'
  return (n / 1073741824).toFixed(2) + ' GB'
}

// ConfigForm 的字节↔MB 换算：持久化与 schema 都是字节，只在 display/input
// 层换算成人工友好的 MB 小数；round 2 位去尾零，避免默认值裸奔成一长串
export function bytesToMb(bytes: unknown): string {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  return String(Math.round((n / 1048576) * 100) / 100)
}

// 把扁平列表组装成树（工作区 → 会话 → 快照三级）。同一快照只属于一个
// 工作区/会话，root 或 sessionId 缺失时归入「未知」节点，避免行凭空消失。
// 构建期会话以 Map 暂存（按键快速归组），收尾统一转数组供渲染。
export function buildTree(list: ManageListItem[] | null | undefined): TreeWorkspace[] {
  const workspaces = new Map<string, { root: string | null; name: string; sessions: Map<string, TreeSession> }>()
  for (const it of list || []) {
    const rootKey = it.root || 'unknown-root'
    if (!workspaces.has(rootKey)) workspaces.set(rootKey, { root: it.root || null, name: it.workspace || '未知工作区', sessions: new Map() })
    const ws = workspaces.get(rootKey)!
    const sidKey = it.sessionId || 'unknown-session'
    if (!ws.sessions.has(sidKey)) ws.sessions.set(sidKey, { root: ws.root, sessionId: it.sessionId || null, title: it.sessionTitle || null, items: [] })
    ws.sessions.get(sidKey)!.items.push(it)
  }
  const wsList: TreeWorkspace[] = Array.from(workspaces.values()).map((ws) => ({ root: ws.root, name: ws.name, sessions: Array.from(ws.sessions.values()) }))
  wsList.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  for (const ws of wsList) {
    ws.sessions.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    for (const s of ws.sessions) s.items.sort((a, b) => (b.time || 0) - (a.time || 0))
  }
  return wsList
}

// 设置卡片三处共用的状态形状（busy 进行中 / message 反馈 / error 是否错误）
export interface CardStatusState {
  busy: boolean
  message: string
  error: boolean
}

// V3 成功消息自动消退（ExcludeCard/ManageCard/ConfigForm 共用，落在 util.ts
// 因为三卡片已在 S1 拆分到不同文件，放任一卡片文件都会造成跨域引用）。
// 只清成功消息（4s）：错误常驻供从容处理；busy 中的「保存中…」不清。
// timer 以 setState 函数式更新 + 原文比对兜底：以最后一次 setState 为准，
// 期间若又写入新消息则跳过清空；卸载时由 effect 清理函数取消。
export function useAutoDismissMessage(
  React: ReactApi,
  state: CardStatusState,
  setState: (updater: (prev: CardStatusState) => CardStatusState) => void
): void {
  React.useEffect(() => {
    if (!state.message || state.error || state.busy) return
    const timer = setTimeout(() => {
      setState((prev) => (
        prev.message === state.message && !prev.error && !prev.busy
          ? Object.assign({}, prev, { message: '' })
          : prev
      ))
    }, 4000)
    return () => clearTimeout(timer)
  }, [state.message, state.error, state.busy])
}

// buildUtil 工厂产出（各组件依赖注入消费面；api 的返回类型随调用点泛型推断）
export interface UtilApi {
  api<T = unknown>(name: string, args?: unknown): Promise<T>
  messageFor(res: unknown, fallback: string): string
  showNotice(kind: string, text: string): void
  showThrottledToast(text: string): void
  ensureInit(sessionId: string | null | undefined): Promise<unknown>
  clockText(ms: unknown): string
  writeClipboard(text: string): Promise<boolean>
  sizeText(bytes: unknown): string
  bytesToMb(bytes: unknown): string
  buildTree(list: ManageListItem[] | null | undefined): TreeWorkspace[]
  pluginConfig: { refillDraft: boolean; archiveOriginal: boolean }
}

export function buildUtil(): UtilApi {
  // Host HTTP API（动态插件的 harness RPC 在此换成 fetch 调用）
  function api<T = unknown>(name: string, args?: unknown): Promise<T> {
    return fetch('/api/recall/' + name, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then((r) => r.json())
  }

  // 机器码 → 人文案映射（H3）：host 端点 code 是线上契约（machine），
  // client 这里做展示层文案（human），未命中回退 host 的 message 兜底。
  const CODE_TEXT: Record<string, string> = {
    STALE: '预览后项目文件发生了变化，请重新预览确认',
    AGENT_BUSY: 'Agent 正在运行中，请先停止后再撤回',
    NO_SNAPSHOT: '该消息没有可用的项目快照',
    NO_STORE: '快照存储不可用',
    ROLLBACK_FAILED: '回退失败',
  }
  function messageFor(res: unknown, fallback: string): string {
    if (!res) return fallback
    const code = (res as { code?: unknown }).code
    if (code && CODE_TEXT[String(code)]) return CODE_TEXT[String(code)]
    // message/error 均为 unknown（端点返回形状宽松），取首个 truthy 并 String 化
    const m = (res as { message?: unknown }).message
    const e = (res as { error?: unknown }).error
    return String(m || e || fallback)
  }

  // 降级提示：每个种类每次页面加载只弹一次（Set 去重），避免切会话时反复
  // 打扰。纯 DOM 直插（与剪贴板同样的零依赖思路），7 秒后自动淡出。
  const noticeShown = new Set<string>()
  // toast 挂载本体：两类提示（降级/快照反馈）共用的纯 DOM 实现
  function mountToast(text: string): void {
    if (typeof document === 'undefined') return
    try {
      const el = document.createElement('div')
      el.className = 'dsh-recall-toast'
      const tag = document.createElement('span')
      tag.className = 'dsh-recall-toast-tag'
      tag.textContent = '撤回插件'
      const body = document.createElement('span')
      body.textContent = text
      el.appendChild(tag)
      el.appendChild(body)
      el.addEventListener('click', () => dismiss(), { once: true })
      document.body.appendChild(el)
      requestAnimationFrame(() => el.classList.add('dsh-recall-toast-in'))
      const timer = setTimeout(dismiss, 7000)
      let dismissed = false
      function dismiss() {
        if (dismissed) return
        dismissed = true
        clearTimeout(timer)
        el.classList.remove('dsh-recall-toast-in')
        setTimeout(() => el.remove(), 300)
      }
    } catch (e) { /* 提示失败不影响主流程 */ }
  }
  function showNotice(kind: string, text: string): void {
    if (noticeShown.has(kind)) return
    noticeShown.add(kind)
    mountToast(text)
  }
  // 快照失败/跳过提示（issue #7 失败可见性）：与降级提示不同，这类事件
  // 会在持续故障期间随每条消息反复发生——按「文本前缀 + 时间窗」节流，
  // 同一故障 10 分钟内至多打扰一次；不同错误各自独立计数。Map 规模封顶后
  // 整体清空：提示是尽力而为的可见性，不是需要精确保留的状态。
  const toastLastShown = new Map<string, number>()
  function showThrottledToast(text: string): void {
    const key = String(text).slice(0, 80)
    const now = Date.now()
    if (now - (toastLastShown.get(key) || 0) < 10 * 60 * 1000) return
    if (toastLastShown.size > 50) toastLastShown.clear()
    toastLastShown.set(key, now)
    mountToast(text)
  }

  // 每个会话只向 Host 注册一次（预热其根目录解析缓存）。
  // 返回 init 的 promise：Host 端 init 要跑数条 PowerShell（建仓/loadIndex），
  // snapshot-info 必须等它完成后再查，否则冷启动时索引尚未载入会误判
  // has:false 且不再重试，撤回按钮将永不出现。
  // init 顺带下发插件行为开关（refillDraft 等），存进 pluginConfig 供撤回
  // 执行链读取——设置页改配置 + 重启后随下一次 init 刷新。
  const pluginConfig = { refillDraft: true, archiveOriginal: true }
  const initMap = new Map<string, Promise<unknown>>()
  function ensureInit(sessionId: string | null | undefined): Promise<unknown> {
    if (!sessionId) return Promise.resolve()
    const cached = initMap.get(sessionId)
    if (cached) return cached
    const done = api<import('../types/api.js').InitResponse>('init', { sessionId }).then((res) => {
      if (res && res.config && typeof res.config === 'object') {
        const cfg = res.config as { refillDraft?: unknown; archiveOriginal?: unknown }
        if (typeof cfg.refillDraft === 'boolean') pluginConfig.refillDraft = cfg.refillDraft
        if (typeof cfg.archiveOriginal === 'boolean') pluginConfig.archiveOriginal = cfg.archiveOriginal
      }
      const notice = res && res.notice
      if (notice && notice.unsupported) {
        showNotice('unsupported', '撤回插件仅支持 Windows / Linux / macOS，当前平台的快照不可用。')
      }
      if (notice && notice.gitMissing) {
        showNotice('git', '未检测到 git CLI，撤回功能不可用（快照引擎依赖 git）。安装 git 并重启 DSH 后即可使用。')
      }
      if (notice && notice.homeFallback) {
        showNotice('home', 'home 目录不可写，快照已降级存储到项目内 .dsh-recall-snapshots 目录。')
      }
    }).catch(() => {
      // init 失败（如页面先于 Host API 就绪加载）时清掉标记：否则本会话内被
      // 判定“已初始化”，撤回按钮永不出现；清掉后下一条消息挂载会重试
      initMap.delete(sessionId)
    })
    initMap.set(sessionId, done)
    return done
  }

  // 复制按钮走浏览器剪贴板；无 primitives 依赖，直接调用并带降级
  function writeClipboard(text: string): Promise<boolean> {
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).then(() => true, () => false)
      }
    } catch (e) { /* fall through */ }
    try {
      if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
        const el = document.createElement('textarea')
        el.value = text
        el.setAttribute('readonly', '')
        el.style.position = 'fixed'
        el.style.left = '-9999px'
        document.body.appendChild(el)
        el.select()
        try {
          return Promise.resolve(document.execCommand('copy'))
        } finally {
          el.remove()
        }
      }
    } catch (e) { /* ignore */ }
    return Promise.resolve(false)
  }

  return { api, messageFor, showNotice, showThrottledToast, ensureInit, clockText, writeClipboard, sizeText, bytesToMb, buildTree, pluginConfig }
}
