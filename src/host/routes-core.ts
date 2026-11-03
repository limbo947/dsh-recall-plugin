/**
 * dsh-recall-plugin — 核心路由域（R2 从 index.js 拆出）
 *
 * init / snapshot-info / preview / execute / status / lineage-record 六个核心
 * 端点。依赖经 deps 注入（rt/snaps/state/cfg/enqueue/agentBusy/rescueRollback
 * 等），无模块级可变状态（HMR 假设）。preview/execute 内部跑 git add -A，
 * 经 enqueue 排进与快照/gc 同一条串行队列，避免 index.lock 竞态。
 */

import { ENV_HINTS } from './diagnostics.js'
import { parseTreeId } from './snapshots.js'
import { buildArtifactRootSegment, buildRootNotice } from './exclude-patterns.js'
import type { Runtime, SharedState, ErrorRecord, StoreInfo } from '../types/state.js'
import type { ResolvedConfig } from '../types/config.js'
import type { SnapshotsApi } from './snapshots.js'
            import type { IntentJournal } from './intent-journal.js'
import type { EnvErrorKind } from './diagnostics.js'
import type { InitArgs, InitResponse, InitNotice, SnapshotInfoArgs, SnapshotInfoResponse, PreviewArgs, PreviewResponse, ExecuteArgs, ExecuteResponse, RecallScope, StatusArgs, StatusResponse, LineageRecordArgs, LineageRecordResponse, RecallNotifyArgs, RecallNotifyResponse, ErrBody } from '../types/api.js'
import type { RecallCompleteEvent, RecallFailedEvent } from '../types/events.js'

// 撤回终态事件名（issue #19）：事件契约唯一事实源是 src/types/events.ts，
// 但 build-host 逐文件转译只覆盖 src/host/（types/ 不落 lib/），host 产物
// 运行时 import 它会 MODULE_NOT_FOUND——事件名在此按字面量声明、类型注解
// 钉死，与契约文件的绑定由 tests/types/events-contract.test.ts 编译期双向
// 赋值断言（漂移即 typecheck 红）。client 侧 bundle 打包不受此限，正常 import。
export const RECALL_EVENT_COMPLETE_HOST: 'dsh-recall/complete' = 'dsh-recall/complete'
export const RECALL_EVENT_FAILED_HOST: 'dsh-recall/failed' = 'dsh-recall/failed'

// 端点依赖注入面（index.ts 装配时逐项提供；ctx 不解构的 A4 纪律见工厂注释）
export interface RoutesCoreDeps {
  rt: Runtime
  snaps: SnapshotsApi
  // A2 操作意图 journal（init 端点是 recover 的第二挂载点；execute 三针写记录）
  intentJournal: IntentJournal
  state: SharedState
  cfg: ResolvedConfig
  supported: boolean
  // 按工作区隔离的任务队列（queues.ts）：同 root 串行、跨 root 并行
  enqueueFor<T>(root: string | null | undefined, task: () => Promise<T>): Promise<T>
  enqueueMany<T>(roots: Array<string | null | undefined>, task: () => Promise<T>): Promise<T>
  // issue #24：根就绪链（resolveStore/ensureGit/loadIndex/rebuild/recover）
  // 与启动预热共享，in-flight 去重——每个恢复的会话各跑一遍会叠出数十条
  // pwsh 并发。返回解析出的 store 供 init 计算降级 notice。
  ensureRootReady(root: string, sessionId: string | null): Promise<StoreInfo | null>
  agentBusy(sessionId: string | null, root: string | null): boolean
  rescueRollback: typeof import('./snapshots.js').rescueRollback
  E: typeof import('./errors.js')
  // issue #19：撤回终态事件广播（index.ts 注入 (event, payload) => ctx.emit(event, payload)）。
  // 经 deps 注入而非本域直接摸 ctx：工厂分层纪律（本域不持有 ctx）+ 单测可注入桩
  emitEvent(event: string, payload: unknown): void
}

export function createRoutesCore(deps: RoutesCoreDeps) {
  // ctx 不解构（A4）：本域所有服务访问都已由 rt/snaps 封装，直接摸 ctx 会
  // 绕过工厂分层——留空位只会诱导未来代码破坏依赖注入约定
  const { rt, snaps, state, cfg, supported, enqueueFor, agentBusy, rescueRollback, intentJournal, ensureRootReady, emitEvent, E } = deps

  return {
    'init': async (args: InitArgs): Promise<InitResponse> => {
      if (!supported) {
        return { ok: false, root: null, notice: { unsupported: true } }
      }
      const sessionId = args && args.sessionId ? String(args.sessionId) : null
      const root = await rt.resolveRoot(sessionId)
      let notice: InitNotice | null = null
      if (root) {
        // issue #24：与启动预热共享同一条根就绪链（in-flight 去重）——同一
        // root 在本进程内只跑一次 resolveStore/ensureGit/loadIndex/rebuild/
        // recover。失败原样上抛（端点兜底转错误响应），与改造前语义一致。
        const store = await ensureRootReady(root, sessionId)
        // 降级状态随 init 下发，Client 弹一次性提示（每次页面加载各弹一次）：
        // gitMissing=未检测到 git CLI（撤回按钮不出现）；homeFallback=home
        // 不可写，快照降级存进项目内 .dsh-recall-snapshots。
        notice = {
          gitMissing: state.gitExe === '',
          homeFallback: store ? !store.home : false
        }
        // issue #18：root 自身是构建产物目录时快照被停用（captureSnapshot 早退），
        // 会话级说明一次——否则用户只会看到「撤回按钮不出现」而无从判断原因。
        // A4：段名（artifactSeg）与拼好的中文文案（buildRootNotice）一并下发——
        // client 优先按段名本地取词，中文字段保留一个版本周期
        const artifactSeg = buildArtifactRootSegment(root, cfg.baseExcludes, rt.isWin)
        if (artifactSeg) {
          notice.buildRootArtifactSeg = artifactSeg
          notice.buildRootNotice = buildRootNotice(artifactSeg)
        }
      }
      // 顺带下发客户端行为开关（fillDraft 等）：Client 无须为读配置单开请求，
      // init 是每会话必经的预热通道；A4 追加 locale（界面语言偏好）
      return { ok: Boolean(root), root: root || null, notice, config: { refillDraft: cfg.refillDraft, archiveOriginal: cfg.archiveOriginal, editSubmitsImmediately: cfg.editSubmitsImmediately, locale: cfg.locale } }
    },

    'snapshot-info': async (args: SnapshotInfoArgs): Promise<SnapshotInfoResponse> => {
      const id = args && args.messageId ? String(args.messageId) : ''
      const snap = state.snapshots.get(id)
      // 失败/跳过/熔断反馈（issue #7 失败可见性）：客户端轮询到 failed 即
      // 终止轮询并 toast，不再空等 20 次；has 时附带 skipped 让用户知道
      // fail-open 跳过了哪些路径
      const feedback = await snaps.feedbackFor(args ? args.sessionId : null, id)
      // issue #18：构建产物工作区根不会有快照（captureSnapshot 早退），客户端轮询
      // 到 has:false 且无 failed 会静默放弃——补一条说明性 notice 让「按钮不出现」
      // 有原因可查。root 解析走 state.roots 缓存，重复轮询不额外付费用。
      const sroot = await rt.resolveRoot(args && args.sessionId ? String(args.sessionId) : null)
      const artifactSeg = sroot ? buildArtifactRootSegment(sroot, cfg.baseExcludes, rt.isWin) : null
      return {
        has: Boolean(snap), time: snap ? snap.time : null, id, ...feedback,
        // issue #31：按钮照常出现，但界面要知道这条没有文件树（隐藏范围单选）
        files: snap ? snap.files !== false : undefined,
        // A4：段名与中文 notice 并存下发（client 优先段名本地取词，见 init 同处注释）
        notice: artifactSeg ? buildRootNotice(artifactSeg) : undefined,
        artifactSeg: artifactSeg || undefined
      }
    },

    'preview': async (args: PreviewArgs): Promise<PreviewResponse> => {
      const id = args && args.messageId ? String(args.messageId) : ''
      const sessionId = args && args.sessionId ? String(args.sessionId) : null
      // P0-1：目标工作区 agent 运行中直接拒绝预览（避免用户确认时文件被
      // agent 改动，预览清单与实际回退内容脱节）。同会话优先命中（最常见
      // 场景），快照存在时叠加跨会话同工作区检查。
      const snap = state.snapshots.get(id)
      if (agentBusy(sessionId, snap ? snap.root : null)) return { ok: false, code: E.RECALL_AGENT_BUSY, message: 'Agent 正在运行中，请先停止后再撤回' }
      // 只锁该快照所属工作区：别的项目的预览/快照不该排在同一个队列后面
      const result = await enqueueFor(snap ? snap.root : null, () => snaps.diffFor(id))
      if (result === null) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: '该消息没有可用的项目快照' }
      const snap2 = state.snapshots.get(id)
      const cutSeq = await snaps.resolveCutSeq(sessionId, id)
      // PF-1：treeId 是 preview 时 add -A 后的 index 树指纹，Client 确认时
      // 透传回 execute——Host 与安全快照指纹比对即可判定「预览后文件是否
      // 变化」，省掉 execute 侧整条重复 diff。旧版 Client 不认识该字段，
      // 无值时 execute 退回 previewTotal 校验（向后兼容）。
      return { ok: true, changes: result.changes, total: result.total, truncated: result.truncated, treeId: result.treeId || null, time: snap2 ? snap2.time : null, root: snap2 ? snap2.root : null, cutSeq, counts: result.counts, files: snap2 ? snap2.files !== false : undefined }
    },

    'execute': async (args: ExecuteArgs): Promise<ExecuteResponse> => {
      const id = args && args.messageId ? String(args.messageId) : ''
      const sessionId = args && args.sessionId ? String(args.sessionId) : null
      // scope 解析：缺省/非法值一律回落 both——老 Client 不发、直调 API 乱发都
      // 落回现状链路；issue #31 的仅消息条目（files:false）另强制 session-only，
      // 因为放行 both 会去打安全快照并 rollback 一个不存在的 tag，必然失败。
      // session-only 走独立短路径：不进串行队列（队列是为 git 锁互斥而设，
      // 本路径零 git 写操作，入队只添延迟）、跳过 STALE 校验/安全快照/
      // rollbackFor/rescue 全链——无文件覆盖即无不可逆操作，无需救援锚点。
      // 保留 NO_SNAPSHOT（快照存在性仍是消息归属的判定依据，且防御直调 API）
      // 与 agentBusy 拦截（fork + 归档会把运行中的 agent 留在被归档的原会话里
      // 继续写日志）；检查在队列外进行：无文件变更，P0-1「检查后紧接执行、
      // 窗口为零」的动机不成立，检查退化为护栏而非不变量。
      const entry = state.snapshots.get(id)
      const scope: RecallScope = (args && args.scope === 'session-only') || (entry !== undefined && entry.files === false)
        ? 'session-only'
        : 'both'
      if (scope === 'session-only') {
        const snap = entry
        if (!snap) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: '该消息没有可用的项目快照' }
        if (agentBusy(sessionId, snap.root)) return { ok: false, code: E.RECALL_AGENT_BUSY, message: 'Agent 正在运行中，请先停止后再撤回' }
        const cutSeq = await snaps.resolveCutSeq(sessionId, id)
        // fork 仍会把切点窗口内的入队事件 seed 进子会话（与模式无关），清理链
        // 照常走（both 分支下方的注释有完整说明）
        const staleQueueItemIds = await snaps.resolveStaleQueueItemIds(sessionId, cutSeq)
        // count 语义 = 回退文件数：session-only 恒为 0（done 面板本就不展示 count）
        return { ok: true, count: 0, cutSeq, staleQueueItemIds }
      }
      // 队列 key 取快照所属工作区（入队前先查一次，仅用于选锁；真正的判定
      // 仍在队列内——入队期间快照可能被删除，那时照样返回 NO_SNAPSHOT）
      const initialSnap = state.snapshots.get(id)
      const result = await enqueueFor(initialSnap ? initialSnap.root : null, async (): Promise<{ ok: true; count: number } | ErrBody> => {
        const snap = state.snapshots.get(id)
        if (!snap) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: '该消息没有可用的项目快照' }
        const store = state.stores.get(snap.root)
        if (!store) return { ok: false, code: E.RECALL_NO_STORE, message: '快照存储不可用' }
        // A3：格式守卫（fail-closed）——安全快照打 tag 与工作区 reset 都是写
        // 操作，高版本/损坏 store 拒执行；预览/列表等读路径不受影响
        if (!(await snaps.guardStoreFormat(store))) {
          return { ok: false, code: E.RECALL_FORMAT_BLOCKED, message: '磁盘格式不受支持，已停止写入；详见「最近错误」' }
        }
        // P0-1：队列内第一步——执行前再查一次 agent 状态。检查放在互斥
        // 队列内，检查后紧接执行，中间不可能插进别的操作，窗口为零。
        if (agentBusy(sessionId, snap.root)) return { ok: false, code: E.RECALL_AGENT_BUSY, message: 'Agent 正在运行中，请先停止后再撤回' }
        // P0-3 / PF-1：preview→execute 失效校验，两代并存——
        // - 新版 Client 透传 previewTreeId（preview 时 add -A 后的 index 树
        //   指纹）：与下方安全快照输出的指纹比对，内容级一致判定，且免掉
        //   一整条重复 diff 进程（一次撤回 4 条重进程 → 3 条）。
        // - 旧版 Client 只带 previewTotal：退回条目总数校验（多付一次 diff，
        //   同数不同文件的边缘情形由安全快照兜底）。
        // - 都不带（直调 API）：不校验，与 P0-3 同款可选语义。
        const previewTreeId = args && typeof args.previewTreeId === 'string' && args.previewTreeId ? args.previewTreeId : null
        if (!previewTreeId && args && typeof args.previewTotal === 'number') {
          const fresh = await snaps.diffFor(id)
          if (!fresh || fresh.total !== args.previewTotal) {
            return { ok: false, code: E.RECALL_STALE, message: '预览后项目文件发生了变化，请重新预览确认' }
          }
        }
        // 回退前自动打安全快照：回退覆盖工作区且不回写 index（旧的
        // 「当前状态」从此无任何快照可找回），用消息 ID 打 tag 会与该消息
        // 的既有快照碰撞，故用独立前缀的时间戳 tag——不进 index.json
        // （列表不展示），但孤儿重建/手动 git tag 仍能找到它，误回退后
        // 用户可让插件从该 tag 恢复，堵住唯一的不可逆操作缺口。
        // 失败时 safetyOk 置 false：后续回退若也失败将无救援点（H1），
        // 行为退化为现状（fail-loud），不更差。
        // PF-1：安全快照输出的树指纹就是「执行时刻的工作区状态」——与
        // previewTreeId 不一致 → STALE（此时安全快照已打下，isSafetySnapshotId
        // 让它不进索引，反而是额外的救援点）。安全快照失败时无指纹可比对，
        // 跳过指纹校验继续回退（不阻断主流程的既有语义）。
        const safetyId = 'pre-rollback-' + Date.now()
        let safetyOk = false
        let safetyTreeId = null
        try {
          const out = await rt.runShell(rt.scripts.snapshotScript(snap.root, store, state.gitExe || '', safetyId, cfg.baseExcludes), { timeoutMs: 600000, stdoutMaxBytes: 65536 })
          safetyOk = true
          safetyTreeId = parseTreeId(out)
        } catch (error) {
          // 安全快照失败不阻断回退本身：用户已确认覆盖，记录后照原计划执行
          rt.recordError('recall safety snapshot failed: ' + String(error))
        }
        if (previewTreeId && safetyTreeId && safetyTreeId !== previewTreeId) {
          return { ok: false, code: E.RECALL_STALE, message: '预览后项目文件发生了变化，请重新预览确认' }
        }
        // A2 针 1：安全快照后、动磁盘前落意图（回退中途断电时启动/init 的
        // recover 据此续做；写失败只告警不阻断主流程——U4 纪律）
        await intentJournal.begin(store, snap.root, { messageId: id, safetyId, safetyOk })
        const rolled = await snaps.rollbackFor(id)
        if (rolled.ok) {
          // A2 针 2：回退成功清记录（残留会被下次启动误判为中断，见 recover）
          await intentJournal.clear(store)
          return rolled
        }
        // A2 针 3：救援也会写工作区（reset 到安全快照），先推进 phase 再执行；
        // rescue 后无论成败都 clear——失败虽留下现场，但手动命令逃生门已在
        // 结果面板给出：留着记录会让下次启动的自动 reset 覆盖用户按手动命令
        // 恢复后的新改动（记录内容由下方提示的路径可查）。
        // 回退失败（rollbackFor 返回 partial，工作区可能半回退）：用安全快照
        // 救援（H1）。rescueRollback 是 snapshots.js 模块级纯逻辑，副作用经
        // deps 注入，三分支（无救援点/救援成功/救援失败）单测直接钉。
        await intentJournal.advance(store, 'rescue')
        const rescueResult = await rescueRollback(
          { runShell: rt.runShell, scripts: rt.scripts, gitExe: state.gitExe || '', recordError: rt.recordError },
          { root: snap.root, store, safetyId, safetyOk, rollbackError: rolled.error }
        )
        await intentJournal.clear(store)
        // U4 留痕：提示附意图文件路径（中断点记录位置，用户可精确知道恢复
        // 到了哪一步、现场在哪）
        if (rescueResult && rescueResult.message) rescueResult.message += '（中断点记录：' + intentJournal.file(store) + '）'
        return rescueResult
      })
      if (!result.ok) return result
      // 文件回退后再解析切点：切点只依赖会话日志，与快照是否删除无关（命中缓存，瞬时）
      const cutSeq = await snaps.resolveCutSeq(sessionId, id)
      // 顺带解析 fork 会带进子会话的残留排队项 id（见 snapshots.ts
      // scanStaleQueueItemIds 的窗口说明）：Client 在 fork 出子会话后按 id 直删，
      // 否则输入框上方会凭空多出一条被撤回消息的「排队消息」。
      const staleQueueItemIds = await snaps.resolveStaleQueueItemIds(sessionId, cutSeq)
      return { ok: true, count: result.count, cutSeq, staleQueueItemIds }
    },

    // 设置页排障：最近错误（Host 侧 console.error 的页面可见副本）。
    // M1-D3/D5：条目自带 count/kind（recordError 富集）——count 在服务端
    // 拼成「（×N）」展示文本，设置页按 message 渲染即显示重复计数，零
    // Client 改动；hint 是分类后的可行动提示（API 自描述，本次无客户端
    // 消费，设置页未来展示零成本）。storeBase（M2-D3）暴露快照存储根，
    // 供设置页未来展示「快照存在哪里」，失败为 null。
    'status': async (args: StatusArgs): Promise<StatusResponse> => {
      const storeBase = await rt.resolveHomeContainer()
      if (args && args.op === 'clear') {
        state.errors.length = 0
        return { ok: true, errors: [], storeBase }
      }
      const errors = state.errors.slice(-20).reverse().map((e: ErrorRecord) => ({
        ...e,
        message: e.message + (e.count > 1 ? '（×' + e.count + '）' : ''),
        hint: e.kind ? ENV_HINTS[e.kind] : null
      }))
      return { ok: true, errors, storeBase }
    },

    // F1：client fork 成功后上报撤回链（childId ↔ parentId），Host 持久化到
    // lineage.json 供快照管理树聚族展示「版本家族」。root 优先按 fork 源
    // parentId 解析（fork 时它仍是 live 会话；归档只隐藏列表、对象在内存），
    // 失败回退 childId。
    'lineage-record': async (args: LineageRecordArgs): Promise<LineageRecordResponse> => {
      const childId = args && args.childId ? String(args.childId) : ''
      const parentId = args && args.parentId ? String(args.parentId) : ''
      if (!childId || !parentId) return { ok: false, code: E.RECALL_BAD_TYPE, message: '缺少会话 ID' }
      const root = (await rt.resolveRoot(parentId)) || (await rt.resolveRoot(childId))
      if (!root) return { ok: false, code: E.RECALL_NO_ROOT, message: '无法解析工作区' }
      let store: StoreInfo | null = state.stores.get(root) || null
      if (!store) {
        // 现场解析失败按无 store：下行 NO_STORE 响应
        try { store = await rt.resolveStore(root) } catch (error) { store = null }
      }
      if (!store) return { ok: false, code: E.RECALL_NO_STORE, message: '快照存储不可用' }
      await snaps.recordLineage(root, childId, parentId)
      return { ok: true }
    },

    // issue #19：client 撤回终态上报 → cordis 事件广播（dsh-recall/complete
    // | dsh-recall/failed）。不进串行队列（零 git 操作）、不依赖 store——
    // lineage-record 的 NO_STORE 早退在这里是缺陷（原会话已归档时解析不到
    // store 会吞掉事件），端点只做 enrich 与转发。恒 { ok: true }：事件
    // 发送失败不影响撤回主流程（client 侧 fire-and-forget，连响应都不等）。
    'notify': async (args: RecallNotifyArgs): Promise<RecallNotifyResponse> => {
      const status = args && args.status
      const sessionId = args && args.sessionId ? String(args.sessionId) : ''
      const messageId = args && args.messageId ? String(args.messageId) : ''
      // 复用 BAD_TYPE 不加新错误码：非法上报是插件版本错位/直调 API 的
      // 编程错误，新码只会膨胀 client 词典；client 对响应本就不消费
      if ((status !== 'complete' && status !== 'failed') || !sessionId || !messageId) {
        return { ok: false, code: E.RECALL_BAD_TYPE, message: '撤回上报缺少必要参数' }
      }
      const scope: RecallScope = args && args.scope === 'session-only' ? 'session-only' : 'both'
      const cutSeq = args && typeof args.cutSeq === 'number' ? args.cutSeq : null
      // root enrich 尽力而为（Q3）：归档只隐藏列表、对象还在内存，大概率
      // 成功；archiveOriginal 可关、resolveRoot 可返空——任一失败落 null，
      // 不阻断事件（下游按 root 过滤的诉求退化为按 sessionId 过滤）
      let root: string | null = null
      try {
        root = (await rt.resolveRoot(sessionId)) || null
      } catch {
        // 解析失败按无 root 继续发事件：事件可见性优先于 enrich 完整性，
        // 抛错会让终态事件整条丢失（下游记忆清理漏做，比字段缺失更糟）
        root = null
      }
      let eventName: string
      let payload: RecallCompleteEvent | RecallFailedEvent
      if (status === 'complete') {
        eventName = RECALL_EVENT_COMPLETE_HOST
        payload = {
          version: 1,
          sessionId,
          childSessionId: args && args.childSessionId ? String(args.childSessionId) : null,
          scope,
          cutSeq,
          messageId,
          root,
          count: args && typeof args.count === 'number' ? args.count : 0,
          chatReverted: Boolean(args && args.chatReverted),
          archiveRequested: Boolean(args && args.archiveRequested),
          time: Date.now(),
        }
      } else {
        eventName = RECALL_EVENT_FAILED_HOST
        const code = args && typeof args.code === 'string' && args.code ? args.code : undefined
        payload = {
          version: 1,
          stage: args && args.stage === 'fork' ? 'fork' : 'execute',
          sessionId,
          messageId,
          scope,
          cutSeq,
          root,
          ...(code ? { code } : {}),
          error: args && typeof args.error === 'string' && args.error ? args.error : 'unknown recall failure',
          time: Date.now(),
        }
      }
      // queueMicrotask + try/catch 是硬要求（规格 §3.2）：同步 emit 时下游
      // 监听器抛错/慢执行会直接反噬端点响应与撤回链路。emitEvent 本身抛错
      // 与 microtask 内的异常同权吞掉——事件是尽力而为的旁路，失败只留痕
      queueMicrotask(() => {
        try {
          emitEvent(eventName, payload)
        } catch (error) {
          rt.recordError('recall event emit failed: ' + String(error))
        }
      })
      return { ok: true }
    }
  }
}
