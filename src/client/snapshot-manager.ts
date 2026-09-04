/**
 * dsh-recall-plugin — client 快照树管理卡片（S1 拆分）
 *
 * 从 settings-cards.ts 按域拆出的「快照管理」卡片：列表（时间倒序）/ 磁盘
 * 占用 / 单条删除 / 手动 gc / 最近错误，以及 F1 版本家族聚族用的纯函数
 * groupByLineage。拆分动机：settings-cards 逼近 800 行红线，而快照树是四段
 * 中最大的一块（约 400 行），先拆再为其他域留位（U1/U5 表单项后续还要加）。
 * 纯移动，零行为变化；依赖注入 React 与 util（api/clockText/sizeText/
 * buildTree），sessionsSvc 用于「切换到该版本会话」。
 */

import type { ReactApi, UtilApi, TreeWorkspace, TreeSession } from './util.js'
import type { ClientSessionsService } from '../types/client-contract.js'
import type { ManageListItem, ManageResponse, ManageListOk, ManageTitlesOk, ManageMessagesOk, ManageUsageOk, ManageLineageOk, StatusErrorItem, StatusResponse } from '../types/api.js'
import type { LineageEntry } from '../types/payloads.js'

// F1：按 fork lineage 计算会话的版本家族。lineage 是 [{childId, parentId}]，
// 返回 Map<sessionId, {family: string[], index: number}>——family 是按 fork
// 顺序（parent→child）排列的家族链，index 从 1 起（v1/v2/v3）。仅 ≥2 成员的
// 家族有映射；单会话无版本概念。纯函数、渲染期零副作用，供单测钉边界。
export interface FamilyInfo {
  family: string[]
  index: number
}

export function groupByLineage(ids: Array<string | null | undefined>, lineage: LineageEntry[] | null | undefined): Map<string, FamilyInfo> {
  const childOf = new Map<string, string>()    // childId -> parentId（回溯根用）
  const childrenOf = new Map<string, string[]>() // parentId -> [childIds]（向下收集链用）
  for (const e of lineage || []) {
    if (e && e.childId && e.parentId) {
      const child = String(e.childId)
      const parent = String(e.parentId)
      childOf.set(child, parent)
      const kids = childrenOf.get(parent) || []
      kids.push(child)
      childrenOf.set(parent, kids)
    }
  }
  const idSet = new Set((ids || []).map((v) => String(v)))
  const result = new Map<string, FamilyInfo>()
  const assigned = new Set<string>()
  for (const id of idSet) {
    if (assigned.has(id)) continue
    // 回溯到链根（父不在集合里的节点）
    let root = id
    const seen = new Set<string>()
    while (childOf.has(root) && idSet.has(childOf.get(root) as string) && !seen.has(root)) {
      seen.add(root)
      root = childOf.get(root) as string
    }
    // 从根向下按 childrenOf BFS 收集整条家族链（线性链退化为顺序遍历）
    const chain: string[] = []
    const queue: string[] = [root]
    while (queue.length) {
      const cur = queue.shift()
      if (!cur || !idSet.has(cur) || assigned.has(cur)) continue
      chain.push(cur)
      assigned.add(cur)
      for (const k of childrenOf.get(cur) || []) queue.push(k)
    }
    if (chain.length > 1) {
      chain.forEach((sid, i) => result.set(sid, { family: chain, index: i + 1 }))
    }
  }
  return result
}

export function buildSnapshotManager(React: ReactApi, util: UtilApi, sessionsSvc: ClientSessionsService): { ManageCard: () => import('react').ReactNode } {
  const { api, clockText, sizeText, buildTree } = util

  // 快照管理卡片：列表（时间倒序）/ 磁盘占用 / 单条删除 / 手动 gc / 最近错误。
  // 全部操作走 Host 的 manage/status 端点（串行队列在 Host 侧保证）。
  function ManageCard() {
    const [items, setItems] = React.useState<ManageListItem[] | null>(null)
    const [usage, setUsage] = React.useState<number | null>(null)
    const [errors, setErrors] = React.useState<StatusErrorItem[] | null>(null)
    const [state, setState] = React.useState({ busy: false, message: '', error: false })
    // 快照全量计数与当前拉取上限：Host 按 limit 切片返回，total 是全量
    const [limit, setLimit] = React.useState(200)
    const [total, setTotal] = React.useState(0)
    const [health, setHealth] = React.useState<{ gitAvailable: boolean; homeStores: number; fallbackStores: number } | null>(null)
    const [query, setQuery] = React.useState('')
    const [showAllErrors, setShowAllErrors] = React.useState(false)
    const [titlesPending, setTitlesPending] = React.useState(false)
    // F1：fork lineage（childId ↔ parentId 撤回链），来自 manage op='lineage'
    const [lineage, setLineage] = React.useState<LineageEntry[]>([])

    function fetchTitles(list: ManageListItem[] | null | undefined): void {
      const missing = Array.from(new Set(
        (list || []).filter((it) => it.sessionId && !it.sessionTitle).map((it) => it.sessionId)
      )).slice(0, 100)
      if (!missing.length) { setTitlesPending(false); return }
      setTitlesPending(true)
      api<ManageTitlesOk>('manage', { op: 'titles', sessionIds: missing }).then((res) => {
        const map = res && res.ok ? res.titles : null
        if (map) {
          setItems((prev) => (prev || []).map((it) => (
            it.sessionId && map[it.sessionId] ? Object.assign({}, it, { sessionTitle: map[it.sessionId] }) : it
          )))
        }
        setTitlesPending(false)
      }).catch(() => setTitlesPending(false))
    }

    // 消息文本补齐：只请求 live 拿不到文本的快照；同一会话多条消息在 Host 端
    // 共享一次 readSession，避免为每条消息重复解压大日志。
    function fetchMessages(list: ManageListItem[] | null | undefined): void {
      const requests = (list || [])
        .filter((it) => it.sessionId && it.id && !Object.prototype.hasOwnProperty.call(it, 'messageText'))
        .map((it) => ({ sessionId: it.sessionId, messageId: it.id }))
        .slice(0, 200)
      if (!requests.length) return
      api<ManageMessagesOk>('manage', { op: 'messages', requests }).then((res) => {
        const map = res && res.ok ? res.messageTexts : null
        if (map) {
          setItems((prev) => (prev || []).map((it) => (
            it.id && Object.prototype.hasOwnProperty.call(map, it.id) ? Object.assign({}, it, { messageText: map[it.id] }) : it
          )))
        }
      }).catch(() => {})
    }

    function refresh(overLimit?: number): void {
      const useLimit = overLimit || limit
      api<ManageListOk>('manage', { op: 'list', limit: useLimit }).then((res) => {
        if (res && res.ok) {
          setItems(res.items || [])
          setTotal(typeof res.total === 'number' ? res.total : (res.items || []).length)
          fetchTitles(res.items || [])
          fetchMessages(res.items || [])
          // PF-6：stale 表示响应来自旧缓存、有新快照未入列表——静默再拉
          // 一次让新快照渐进补上。再拉仍 stale 时止步不更新（不循环，防
          // 抖动），等用户下次手动刷新。
          if (res.stale) {
            api<ManageListOk>('manage', { op: 'list', limit: useLimit }).then((res2) => {
              if (res2 && res2.ok && !res2.stale) {
                setItems(res2.items || [])
                setTotal(typeof res2.total === 'number' ? res2.total : (res2.items || []).length)
                fetchTitles(res2.items || [])
                fetchMessages(res2.items || [])
              }
            }).catch(() => {})
          }
        }
        // F1：加载 fork lineage（版本家族），列表成功后异步补齐，不阻塞首屏
        api<ManageLineageOk>('manage', { op: 'lineage' }).then((res) => {
          if (res && res.ok && Array.isArray(res.lineage)) setLineage(res.lineage)
        }).catch(() => {})
        // 列表返回后再补 usage/status：首次冷启动时磁盘占用和错误日志都各要
        // 一条 shell，和 list 并发会抢资源拖慢首屏；延后到列表渲染后。
        api<ManageUsageOk>('manage', { op: 'usage' }).then((res) => {
          if (res && res.ok) {
            setUsage(res.bytes || 0)
            setHealth({ gitAvailable: res.gitAvailable !== false, homeStores: res.homeStores || 0, fallbackStores: res.fallbackStores || 0 })
          }
        }).catch(() => {})
        api<StatusResponse>('status', {}).then((res) => {
          if (res && res.ok) setErrors(res.errors || [])
        }).catch(() => {})
      }).catch(() => {
        // list 失败时仍尝试补 usage/status，避免整卡全空
        api<ManageUsageOk>('manage', { op: 'usage' }).then((res) => {
          if (res && res.ok) {
            setUsage(res.bytes || 0)
            setHealth({ gitAvailable: res.gitAvailable !== false, homeStores: res.homeStores || 0, fallbackStores: res.fallbackStores || 0 })
          }
        }).catch(() => {})
        api<StatusResponse>('status', {}).then((res) => {
          if (res && res.ok) setErrors(res.errors || [])
        }).catch(() => {})
      })
    }

    React.useEffect(() => { refresh() }, [])

    function clearErrors(): void {
      setErrors([])
      api<unknown>('status', { op: 'clear' }).catch(() => {})
    }

    function run(op: string, extra: Record<string, unknown> | null | undefined, doneText: string): void {
      if (state.busy) return
      setState({ busy: true, message: '执行中…', error: false })
      api<ManageResponse>('manage', Object.assign({ op }, extra || {})).then((res) => {
        if (res && res.ok) {
          const deleted = (res as { deleted?: unknown }).deleted
          setState({ busy: false, message: typeof deleted === 'number' ? '已删除 ' + deleted + ' 条快照' : doneText, error: false })
          refresh()
        } else {
          setState({ busy: false, message: (res && ((res as { message?: string }).message || (res as { error?: string }).error)) || '操作失败', error: true })
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }))
    }

    const [expanded, setExpanded] = React.useState(() => new Set())
    const [confirming, setConfirming] = React.useState<{ kind: string; key?: string; extra?: Record<string, unknown>; text?: string } | null>(null)

    function renderDeleteAllConfirm(): import('react').ReactNode {
      if (!confirming || confirming.kind !== 'all') return null
      return React.createElement('div', { className: 'dsh-recall-tree-confirm' },
          '确认删除所有工作区的全部快照？此操作不可恢复。',
          React.createElement('button', {
            type: 'button',
            className: 'dsh-recall-btn dsh-recall-btn-danger',
            onClick: () => {
              setConfirming(null)
              run('deleteAll', {}, '已清空全部快照')
            }
          }, '确认全部删除'),
          React.createElement('button', { type: 'button', className: 'dsh-recall-ex-chip', onClick: () => setConfirming(null) }, '取消')
        )
    }

    function toggle(key: string): void {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    }

    const q = query.trim().toLowerCase()
    const filteredItems = q
      ? (items || []).filter((it) =>
          (it.workspace || '').toLowerCase().indexOf(q) >= 0 ||
          (it.sessionTitle || '').toLowerCase().indexOf(q) >= 0 ||
          (it.messageText || '').toLowerCase().indexOf(q) >= 0 ||
          String(it.id || '').toLowerCase().indexOf(q) >= 0
        )
      : items
    const tree = buildTree(filteredItems)
    // F1：版本家族映射 + 可切换会话（仍在 sessions.list 里的）。versionMap
    // 用全部快照会话 id 与 lineage 推导；sessions.list 快照同步读取。已归档
    // 会话不在 list（无法 open），故不渲染切换按钮，只显示版本号。
    const allSessionIds = Array.from(new Set((items || []).map((it) => it.sessionId).filter(Boolean)))
    const versionMap = groupByLineage(allSessionIds, lineage)
    let listById: Record<string, unknown> | null = null
    try {
      if (sessionsSvc && sessionsSvc.list && typeof sessionsSvc.list.getSnapshot === 'function') {
        const snapshot = sessionsSvc.list.getSnapshot()
        listById = (snapshot && snapshot.byId) || null
      }
    } catch (e) { listById = null }

    function confirmDelete(kind: string, key: string, extra: Record<string, unknown>, text: string): void {
      setConfirming({ kind, key, extra, text })
    }
    function renderConfirm(kind: string, key: string, extra: Record<string, unknown>, text: string): import('react').ReactNode {
      if (!confirming || confirming.kind !== kind || confirming.key !== key) return null
      return React.createElement('div', { className: 'dsh-recall-tree-confirm' },
        text,
        React.createElement('button', {
          type: 'button',
          className: 'dsh-recall-ex-chip',
          onClick: () => {
            const c = confirming
            setConfirming(null)
            run('delete', c.extra, '已删除')
          }
        }, '确认'),
        React.createElement('button', { type: 'button', className: 'dsh-recall-ex-chip', onClick: () => setConfirming(null) }, '取消')
      )
    }
    // 叶子节点：展开箭头占位 + 时间 + 消息内容摘要 + 截断 ID。
    function renderLeaf(it: ManageListItem): import('react').ReactNode {
      const key = 'snap-' + it.id
      const text = it.messageText
      const title = text || it.id
      const label = text
        ? clockText(it.time) + '  ' + text
        : clockText(it.time) + '  ' + it.id.slice(0, 12) + '…'
      return React.createElement('div', { className: 'dsh-recall-tree-node', key: key },
        React.createElement('div', { className: 'dsh-recall-tree-row', title: title },
          React.createElement('span', { className: 'dsh-recall-tree-toggle-placeholder' }),
          React.createElement('span', { className: 'dsh-recall-tree-label' },
            React.createElement('span', { className: 'dsh-recall-tree-title' }, label)
          ),
          React.createElement('button', {
            type: 'button',
            className: 'dsh-recall-ex-chip',
            title: '删除该快照（tag 与索引条目）',
            onClick: () => confirmDelete('snapshot', key, { messageId: it.id, root: it.root || null }, '确认删除该快照？此操作不可恢复。')
          }, '删除')
        ),
        renderConfirm('snapshot', key, { messageId: it.id, root: it.root || null }, '确认删除该快照？此操作不可恢复。')
      )
    }
    // 会话节点：折叠按钮 + 标题 + 快照数 + 删除按钮；子节点为叶子。
    function renderSession(s: TreeSession): import('react').ReactNode {
      const key = 'session-' + (s.root || '') + '-' + s.sessionId
      const open = expanded.has(key)
      const label = s.title || (titlesPending && s.sessionId ? '…' : '（已删除会话）')
      const version = s.sessionId ? versionMap.get(String(s.sessionId)) : null
      const switchable = Boolean(s.sessionId && listById && listById[s.sessionId])
      return React.createElement('div', { className: 'dsh-recall-tree-node', key: key },
        React.createElement('div', { className: 'dsh-recall-tree-row' },
          // V2：折叠钮 span→button——Tab/Enter/Space 可达，读屏经 aria-expanded
          // 与 aria-label 播报展开语义与节点名；CSS 已做 button 重置防视觉回归。
          React.createElement('button', {
            type: 'button',
            className: 'dsh-recall-tree-toggle',
            'aria-expanded': open,
            'aria-label': (open ? '收起' : '展开') + '：' + label,
            onClick: () => toggle(key)
          }, open ? '▾' : '▸'),
          React.createElement('span', { className: 'dsh-recall-tree-label', title: s.sessionId || '' },
            React.createElement('span', { className: 'dsh-recall-tree-title' }, label),
            version ? React.createElement('span', { className: 'dsh-recall-tree-meta', title: '版本家族：' + version.family.join(' → ') }, 'v' + version.index + '/' + version.family.length) : null,
            React.createElement('span', { className: 'dsh-recall-tree-meta' }, s.items.length + ' 条')
          ),
          switchable ? React.createElement('button', {
            type: 'button',
            className: 'dsh-recall-ex-chip',
            title: '切换到该版本会话',
            onClick: () => { try { sessionsSvc.open(s.sessionId as string) } catch (e) { /* 会话已不可切换则静默 */ } }
          }, '切换') : null,
          s.sessionId ? React.createElement('button', {
            type: 'button',
            className: 'dsh-recall-ex-chip',
            title: '删除该会话全部快照',
            onClick: () => confirmDelete('session', key, { scope: 'session', sessionId: s.sessionId, root: s.root || null }, '确认删除该会话全部快照？此操作不可恢复。')
          }, '删除') : null
        ),
        open ? React.createElement('div', { className: 'dsh-recall-tree-children' }, ...s.items.map(renderLeaf)) : null,
        s.sessionId ? renderConfirm('session', key, { scope: 'session', sessionId: s.sessionId, root: s.root || null }, '确认删除该会话全部快照？此操作不可恢复。') : null
      )
    }
    // 工作区节点：折叠按钮 + 文件夹名 + 会话数/快照数 + 删除按钮。
    function renderWorkspace(ws: TreeWorkspace): import('react').ReactNode {
      const key = 'ws-' + ws.root
      const open = expanded.has(key)
      const sessionCount = ws.sessions.length
      const snapCount = ws.sessions.reduce((n, s) => n + s.items.length, 0)
      return React.createElement('div', { className: 'dsh-recall-tree-node', key: key },
        React.createElement('div', { className: 'dsh-recall-tree-row' },
          // V2：工作区折叠钮同 renderSession——span→button 键盘化，aria 语义并列播报
          React.createElement('button', {
            type: 'button',
            className: 'dsh-recall-tree-toggle',
            'aria-expanded': open,
            'aria-label': (open ? '收起' : '展开') + '：' + ws.name,
            onClick: () => toggle(key)
          }, open ? '▾' : '▸'),
          React.createElement('span', { className: 'dsh-recall-tree-label', title: ws.root || '' },
            React.createElement('span', { className: 'dsh-recall-tree-name' }, ws.name),
            React.createElement('span', { className: 'dsh-recall-tree-meta' }, sessionCount + ' 会话 / ' + snapCount + ' 快照')
          ),
          ws.root ? React.createElement('button', {
            type: 'button',
            className: 'dsh-recall-ex-chip',
            title: '删除该工作区全部快照',
            onClick: () => confirmDelete('workspace', key, { scope: 'workspace', root: ws.root }, '确认删除该工作区全部快照？此操作不可恢复。')
          }, '删除') : null
        ),
        open ? React.createElement('div', { className: 'dsh-recall-tree-children' }, ...ws.sessions.map(renderSession)) : null,
        ws.root ? renderConfirm('workspace', key, { scope: 'workspace', root: ws.root }, '确认删除该工作区全部快照？此操作不可恢复。') : null
      )
    }
    const treeNodes = tree.map(renderWorkspace)

    // 计数用 Host 返回的全量 total 而非已加载条数
    const loaded = items ? items.length : null
    const countText = loaded === null
      ? '共 … 条快照'
      : '共 ' + total + ' 条快照' + (limit < total ? '（当前显示最新 ' + loaded + ' 条）' : '')

    function loadMore(): void {
      const next = Math.min(Math.max(total, limit), 2000)
      if (next <= limit) return
      setLimit(next)
      refresh(next)
    }

    return React.createElement('div', { className: 'dsh-recall-ex-card' },
      React.createElement('div', { className: 'dsh-recall-ex-title' }, '快照管理'),
      React.createElement('div', { className: 'dsh-recall-ex-note' },
        usage === null
          ? countText + '。'
          : countText + '，全部工作区快照存储占用 ' + sizeText(usage) + '。'
      ),
      health ? React.createElement('div', { className: 'dsh-recall-ex-note', key: 'health' },
        React.createElement('span', {
          className: health.gitAvailable ? '' : 'dsh-recall-ex-status-error'
        }, health.gitAvailable ? 'git 可用' : 'git 不可用（快照引擎依赖 git）'),
        ' · 快照存储：home ' + health.homeStores + ' 个工作区' + (health.fallbackStores ? '，降级 ' + health.fallbackStores + ' 个' : '')
      ) : null,
      React.createElement('input', {
        className: 'dsh-recall-ex-input',
        placeholder: '搜索工作区 / 会话标题 / 消息内容 / ID',
        'aria-label': '搜索快照',
        value: query,
        spellCheck: false,
        onChange: (e) => setQuery(e.target.value),
      }),
      treeNodes.length > 0 ? React.createElement('div', { className: 'dsh-recall-tree' }, ...treeNodes) : null,
      items && items.length === 0 && !q
        ? React.createElement('div', { className: 'dsh-recall-ex-note', key: 'empty' }, '在任意工作区发送一条消息后，这里会出现快照。')
        : null,
      q && filteredItems && filteredItems.length === 0
        ? React.createElement('div', { className: 'dsh-recall-ex-note', key: 'no-match' }, '无匹配快照')
        : null,
      renderDeleteAllConfirm(),
      React.createElement('div', { className: 'dsh-recall-panel-actions' },
        state.message ? React.createElement('span', { role: 'status', 'aria-live': 'polite', className: 'dsh-recall-ex-status' + (state.error ? ' dsh-recall-ex-status-error' : ' dsh-recall-ex-status-success') }, (state.error ? '错误：' : '') + state.message) : null,
        limit < total ? React.createElement('button', {
          type: 'button',
          className: 'dsh-recall-btn',
          disabled: state.busy,
          onClick: loadMore
        }, '加载更多') : null,
        React.createElement('button', { type: 'button', className: 'dsh-recall-btn', disabled: state.busy, onClick: refresh }, '刷新'),
        React.createElement('button', {
          type: 'button',
          className: 'dsh-recall-btn dsh-recall-btn-danger',
          disabled: state.busy,
          title: '删除全部工作区的所有快照；会直接核对并删除 git tag（即使列表为空也可清理残留）',
          onClick: () => setConfirming({ kind: 'all' })
        }, '全部删除'),
        React.createElement('button', {
          type: 'button',
          className: 'dsh-recall-btn',
          disabled: state.busy,
          title: '立即对全部工作区执行一次 git gc（压缩对象库释放空间）',
          onClick: () => run('gc', {}, 'gc 完成')
        }, '立即 gc')
      ),
      errors && errors.length > 0
        ? React.createElement('div', { className: 'dsh-recall-ex-note', key: 'errors' },
            React.createElement('div', { className: 'dsh-recall-ex-status' },
              '最近错误：',
              (showAllErrors ? errors : errors.slice(0, 5)).map((e, i) => React.createElement('div', { key: i, className: 'dsh-recall-ex-note' }, clockText(e.time) + '  ' + e.message))
            ),
            React.createElement('div', { className: 'dsh-recall-panel-actions' },
              errors.length > 5 ? React.createElement('button', { type: 'button', className: 'dsh-recall-ex-chip', onClick: () => setShowAllErrors((v) => !v) }, showAllErrors ? '收起' : '展开全部 (' + errors.length + ')') : null,
              React.createElement('button', { type: 'button', className: 'dsh-recall-ex-chip', onClick: clearErrors }, '清空')
            )
          )
        : null
    )
  }

  return { ManageCard }
}