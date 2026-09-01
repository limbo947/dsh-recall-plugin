import { ENV_HINTS } from "./diagnostics.js";
import { parseTreeId } from "./snapshots.js";
function createRoutesCore(deps) {
  const { rt, snaps, state, cfg, supported, enqueue, agentBusy, rescueRollback, E } = deps;
  return {
    "init": async (args) => {
      if (!supported) {
        return { ok: false, root: null, notice: { unsupported: true } };
      }
      const sessionId = args && args.sessionId ? String(args.sessionId) : null;
      const root = await rt.resolveRoot(sessionId);
      let notice = null;
      if (root) {
        let store = await rt.resolveStore(root);
        store = await rt.tryUpgradeToHome(root);
        await rt.ensureGit(root, store);
        await snaps.loadIndex(root, sessionId);
        await snaps.rebuildOrphans(root, sessionId);
        rt.cleanupLegacy(root);
        notice = {
          gitMissing: state.gitExe === "",
          homeFallback: store ? !store.home : false
        };
      }
      return { ok: Boolean(root), root: root || null, notice, config: { refillDraft: cfg.refillDraft, archiveOriginal: cfg.archiveOriginal } };
    },
    "snapshot-info": async (args) => {
      const id = args && args.messageId ? String(args.messageId) : "";
      const snap = state.snapshots.get(id);
      const feedback = await snaps.feedbackFor(args ? args.sessionId : null, id);
      return { has: Boolean(snap), time: snap ? snap.time : null, id, ...feedback };
    },
    "preview": async (args) => {
      const id = args && args.messageId ? String(args.messageId) : "";
      const sessionId = args && args.sessionId ? String(args.sessionId) : null;
      const snap = state.snapshots.get(id);
      if (agentBusy(sessionId, snap ? snap.root : null)) return { ok: false, code: E.RECALL_AGENT_BUSY, message: "Agent \u6B63\u5728\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u5148\u505C\u6B62\u540E\u518D\u64A4\u56DE" };
      const result = await enqueue(() => snaps.diffFor(id));
      if (result === null) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: "\u8BE5\u6D88\u606F\u6CA1\u6709\u53EF\u7528\u7684\u9879\u76EE\u5FEB\u7167" };
      const snap2 = state.snapshots.get(id);
      const cutSeq = await snaps.resolveCutSeq(sessionId, id);
      return { ok: true, changes: result.changes, total: result.total, truncated: result.truncated, treeId: result.treeId || null, time: snap2 ? snap2.time : null, root: snap2 ? snap2.root : null, cutSeq };
    },
    "execute": async (args) => {
      const id = args && args.messageId ? String(args.messageId) : "";
      const sessionId = args && args.sessionId ? String(args.sessionId) : null;
      const result = await enqueue(async () => {
        const snap = state.snapshots.get(id);
        if (!snap) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: "\u8BE5\u6D88\u606F\u6CA1\u6709\u53EF\u7528\u7684\u9879\u76EE\u5FEB\u7167" };
        const store = state.stores.get(snap.root);
        if (!store) return { ok: false, code: E.RECALL_NO_STORE, message: "\u5FEB\u7167\u5B58\u50A8\u4E0D\u53EF\u7528" };
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
        const rolled = await snaps.rollbackFor(id);
        if (rolled.ok) return rolled;
        return rescueRollback(
          { runShell: rt.runShell, scripts: rt.scripts, gitExe: state.gitExe || "", recordError: rt.recordError },
          { root: snap.root, store, safetyId, safetyOk, rollbackError: rolled.error }
        );
      });
      if (!result.ok) return result;
      const cutSeq = await snaps.resolveCutSeq(sessionId, id);
      return { ok: true, count: result.count, cutSeq };
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
    }
  };
}
export {
  createRoutesCore
};
