import { ENV_HINTS } from "./diagnostics.js";
import { parseTreeId } from "./snapshots.js";
import { buildArtifactRootSegment, buildRootNotice } from "./exclude-patterns.js";
const RECALL_EVENT_COMPLETE_HOST = "dsh-recall/complete";
const RECALL_EVENT_FAILED_HOST = "dsh-recall/failed";
function createRoutesCore(deps) {
  const { rt, snaps, state, cfg, supported, enqueueFor, agentBusy, rescueRollback, intentJournal, ensureRootReady, emitEvent, E } = deps;
  return {
    "init": async (args) => {
      if (!supported) {
        return { ok: false, root: null, notice: { unsupported: true } };
      }
      const sessionId = args && args.sessionId ? String(args.sessionId) : null;
      const root = await rt.resolveRoot(sessionId);
      let notice = null;
      if (root) {
        const store = await ensureRootReady(root, sessionId);
        notice = {
          gitMissing: state.gitExe === "",
          homeFallback: store ? !store.home : false
        };
        const artifactSeg = buildArtifactRootSegment(root, cfg.baseExcludes, rt.isWin);
        if (artifactSeg) {
          notice.buildRootArtifactSeg = artifactSeg;
          notice.buildRootNotice = buildRootNotice(artifactSeg);
        }
      }
      return { ok: Boolean(root), root: root || null, notice, config: { refillDraft: cfg.refillDraft, archiveOriginal: cfg.archiveOriginal, editSubmitsImmediately: cfg.editSubmitsImmediately, locale: cfg.locale } };
    },
    "snapshot-info": async (args) => {
      const id = args && args.messageId ? String(args.messageId) : "";
      const snap = state.snapshots.get(id);
      const feedback = await snaps.feedbackFor(args ? args.sessionId : null, id);
      const sroot = await rt.resolveRoot(args && args.sessionId ? String(args.sessionId) : null);
      const artifactSeg = sroot ? buildArtifactRootSegment(sroot, cfg.baseExcludes, rt.isWin) : null;
      return {
        has: Boolean(snap),
        time: snap ? snap.time : null,
        id,
        ...feedback,
        // issue #31：按钮照常出现，但界面要知道这条没有文件树（隐藏范围单选）
        files: snap ? snap.files !== false : void 0,
        // A4：段名与中文 notice 并存下发（client 优先段名本地取词，见 init 同处注释）
        notice: artifactSeg ? buildRootNotice(artifactSeg) : void 0,
        artifactSeg: artifactSeg || void 0
      };
    },
    "preview": async (args) => {
      const id = args && args.messageId ? String(args.messageId) : "";
      const sessionId = args && args.sessionId ? String(args.sessionId) : null;
      const snap = state.snapshots.get(id);
      if (agentBusy(sessionId, snap ? snap.root : null)) return { ok: false, code: E.RECALL_AGENT_BUSY, message: "Agent \u6B63\u5728\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u5148\u505C\u6B62\u540E\u518D\u64A4\u56DE" };
      const result = await enqueueFor(snap ? snap.root : null, () => snaps.diffFor(id));
      if (result === null) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: "\u8BE5\u6D88\u606F\u6CA1\u6709\u53EF\u7528\u7684\u9879\u76EE\u5FEB\u7167" };
      const snap2 = state.snapshots.get(id);
      const cutSeq = await snaps.resolveCutSeq(sessionId, id);
      return { ok: true, changes: result.changes, total: result.total, truncated: result.truncated, treeId: result.treeId || null, time: snap2 ? snap2.time : null, root: snap2 ? snap2.root : null, cutSeq, counts: result.counts, files: snap2 ? snap2.files !== false : void 0 };
    },
    "execute": async (args) => {
      const id = args && args.messageId ? String(args.messageId) : "";
      const sessionId = args && args.sessionId ? String(args.sessionId) : null;
      const entry = state.snapshots.get(id);
      const scope = args && args.scope === "session-only" || entry !== void 0 && entry.files === false ? "session-only" : "both";
      if (scope === "session-only") {
        const snap = entry;
        if (!snap) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: "\u8BE5\u6D88\u606F\u6CA1\u6709\u53EF\u7528\u7684\u9879\u76EE\u5FEB\u7167" };
        if (agentBusy(sessionId, snap.root)) return { ok: false, code: E.RECALL_AGENT_BUSY, message: "Agent \u6B63\u5728\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u5148\u505C\u6B62\u540E\u518D\u64A4\u56DE" };
        const cutSeq2 = await snaps.resolveCutSeq(sessionId, id);
        const staleQueueItemIds2 = await snaps.resolveStaleQueueItemIds(sessionId, cutSeq2);
        return { ok: true, count: 0, cutSeq: cutSeq2, staleQueueItemIds: staleQueueItemIds2 };
      }
      const initialSnap = state.snapshots.get(id);
      const result = await enqueueFor(initialSnap ? initialSnap.root : null, async () => {
        const snap = state.snapshots.get(id);
        if (!snap) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: "\u8BE5\u6D88\u606F\u6CA1\u6709\u53EF\u7528\u7684\u9879\u76EE\u5FEB\u7167" };
        const store = state.stores.get(snap.root);
        if (!store) return { ok: false, code: E.RECALL_NO_STORE, message: "\u5FEB\u7167\u5B58\u50A8\u4E0D\u53EF\u7528" };
        if (!await snaps.guardStoreFormat(store)) {
          return { ok: false, code: E.RECALL_FORMAT_BLOCKED, message: "\u78C1\u76D8\u683C\u5F0F\u4E0D\u53D7\u652F\u6301\uFF0C\u5DF2\u505C\u6B62\u5199\u5165\uFF1B\u8BE6\u89C1\u300C\u6700\u8FD1\u9519\u8BEF\u300D" };
        }
        if (agentBusy(sessionId, snap.root)) return { ok: false, code: E.RECALL_AGENT_BUSY, message: "Agent \u6B63\u5728\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u5148\u505C\u6B62\u540E\u518D\u64A4\u56DE" };
        const previewTreeId = args && typeof args.previewTreeId === "string" && args.previewTreeId ? args.previewTreeId : null;
        if (!previewTreeId && args && typeof args.previewTotal === "number") {
          const fresh = await snaps.diffFor(id);
          if (!fresh || fresh.total !== args.previewTotal) {
            return { ok: false, code: E.RECALL_STALE, message: "\u9884\u89C8\u540E\u9879\u76EE\u6587\u4EF6\u53D1\u751F\u4E86\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u786E\u8BA4" };
          }
        }
        const safetyId = "pre-rollback-" + Date.now();
        let safetyOk = false;
        let safetyTreeId = null;
        try {
          const out = await rt.runShell(rt.scripts.snapshotScript(snap.root, store, state.gitExe || "", safetyId, cfg.baseExcludes), { timeoutMs: 6e5, stdoutMaxBytes: 65536 });
          safetyOk = true;
          safetyTreeId = parseTreeId(out);
        } catch (error) {
          rt.recordError("recall safety snapshot failed: " + String(error));
        }
        if (previewTreeId && safetyTreeId && safetyTreeId !== previewTreeId) {
          return { ok: false, code: E.RECALL_STALE, message: "\u9884\u89C8\u540E\u9879\u76EE\u6587\u4EF6\u53D1\u751F\u4E86\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u786E\u8BA4" };
        }
        await intentJournal.begin(store, snap.root, { messageId: id, safetyId, safetyOk });
        const rolled = await snaps.rollbackFor(id);
        if (rolled.ok) {
          await intentJournal.clear(store);
          return rolled;
        }
        await intentJournal.advance(store, "rescue");
        const rescueResult = await rescueRollback(
          { runShell: rt.runShell, scripts: rt.scripts, gitExe: state.gitExe || "", recordError: rt.recordError },
          { root: snap.root, store, safetyId, safetyOk, rollbackError: rolled.error }
        );
        await intentJournal.clear(store);
        if (rescueResult && rescueResult.message) rescueResult.message += "\uFF08\u4E2D\u65AD\u70B9\u8BB0\u5F55\uFF1A" + intentJournal.file(store) + "\uFF09";
        return rescueResult;
      });
      if (!result.ok) return result;
      const cutSeq = await snaps.resolveCutSeq(sessionId, id);
      const staleQueueItemIds = await snaps.resolveStaleQueueItemIds(sessionId, cutSeq);
      return { ok: true, count: result.count, cutSeq, staleQueueItemIds };
    },
    // 设置页排障：最近错误（Host 侧 console.error 的页面可见副本）。
    // M1-D3/D5：条目自带 count/kind（recordError 富集）——count 在服务端
    // 拼成「（×N）」展示文本，设置页按 message 渲染即显示重复计数，零
    // Client 改动；hint 是分类后的可行动提示（API 自描述，本次无客户端
    // 消费，设置页未来展示零成本）。storeBase（M2-D3）暴露快照存储根，
    // 供设置页未来展示「快照存在哪里」，失败为 null。
    "status": async (args) => {
      const storeBase = await rt.resolveHomeContainer();
      if (args && args.op === "clear") {
        state.errors.length = 0;
        return { ok: true, errors: [], storeBase };
      }
      const errors = state.errors.slice(-20).reverse().map((e) => ({
        ...e,
        message: e.message + (e.count > 1 ? "\uFF08\xD7" + e.count + "\uFF09" : ""),
        hint: e.kind ? ENV_HINTS[e.kind] : null
      }));
      return { ok: true, errors, storeBase };
    },
    // F1：client fork 成功后上报撤回链（childId ↔ parentId），Host 持久化到
    // lineage.json 供快照管理树聚族展示「版本家族」。root 优先按 fork 源
    // parentId 解析（fork 时它仍是 live 会话；归档只隐藏列表、对象在内存），
    // 失败回退 childId。
    "lineage-record": async (args) => {
      const childId = args && args.childId ? String(args.childId) : "";
      const parentId = args && args.parentId ? String(args.parentId) : "";
      if (!childId || !parentId) return { ok: false, code: E.RECALL_BAD_TYPE, message: "\u7F3A\u5C11\u4F1A\u8BDD ID" };
      const root = await rt.resolveRoot(parentId) || await rt.resolveRoot(childId);
      if (!root) return { ok: false, code: E.RECALL_NO_ROOT, message: "\u65E0\u6CD5\u89E3\u6790\u5DE5\u4F5C\u533A" };
      let store = state.stores.get(root) || null;
      if (!store) {
        try {
          store = await rt.resolveStore(root);
        } catch (error) {
          store = null;
        }
      }
      if (!store) return { ok: false, code: E.RECALL_NO_STORE, message: "\u5FEB\u7167\u5B58\u50A8\u4E0D\u53EF\u7528" };
      await snaps.recordLineage(root, childId, parentId);
      return { ok: true };
    },
    // issue #19：client 撤回终态上报 → cordis 事件广播（dsh-recall/complete
    // | dsh-recall/failed）。不进串行队列（零 git 操作）、不依赖 store——
    // lineage-record 的 NO_STORE 早退在这里是缺陷（原会话已归档时解析不到
    // store 会吞掉事件），端点只做 enrich 与转发。恒 { ok: true }：事件
    // 发送失败不影响撤回主流程（client 侧 fire-and-forget，连响应都不等）。
    "notify": async (args) => {
      const status = args && args.status;
      const sessionId = args && args.sessionId ? String(args.sessionId) : "";
      const messageId = args && args.messageId ? String(args.messageId) : "";
      if (status !== "complete" && status !== "failed" || !sessionId || !messageId) {
        return { ok: false, code: E.RECALL_BAD_TYPE, message: "\u64A4\u56DE\u4E0A\u62A5\u7F3A\u5C11\u5FC5\u8981\u53C2\u6570" };
      }
      const scope = args && args.scope === "session-only" ? "session-only" : "both";
      const cutSeq = args && typeof args.cutSeq === "number" ? args.cutSeq : null;
      let root = null;
      try {
        root = await rt.resolveRoot(sessionId) || null;
      } catch {
        root = null;
      }
      let eventName;
      let payload;
      if (status === "complete") {
        eventName = RECALL_EVENT_COMPLETE_HOST;
        payload = {
          version: 1,
          sessionId,
          childSessionId: args && args.childSessionId ? String(args.childSessionId) : null,
          scope,
          cutSeq,
          messageId,
          root,
          count: args && typeof args.count === "number" ? args.count : 0,
          chatReverted: Boolean(args && args.chatReverted),
          archiveRequested: Boolean(args && args.archiveRequested),
          time: Date.now()
        };
      } else {
        eventName = RECALL_EVENT_FAILED_HOST;
        const code = args && typeof args.code === "string" && args.code ? args.code : void 0;
        payload = {
          version: 1,
          stage: args && args.stage === "fork" ? "fork" : "execute",
          sessionId,
          messageId,
          scope,
          cutSeq,
          root,
          ...code ? { code } : {},
          error: args && typeof args.error === "string" && args.error ? args.error : "unknown recall failure",
          time: Date.now()
        };
      }
      queueMicrotask(() => {
        try {
          emitEvent(eventName, payload);
        } catch (error) {
          rt.recordError("recall event emit failed: " + String(error));
        }
      });
      return { ok: true };
    }
  };
}
export {
  RECALL_EVENT_COMPLETE_HOST,
  RECALL_EVENT_FAILED_HOST,
  createRoutesCore
};
