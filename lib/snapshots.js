import * as E from "./errors.js";
import { buildFeedbackError } from "./diagnostics.js";
function parseSkipped(out) {
  const skipped = [];
  for (const line of String(out || "").split(/\r?\n/)) {
    if (line.indexOf("SNAP_SKIP ") === 0) skipped.push(line.slice("SNAP_SKIP ".length));
  }
  return skipped;
}
function parseChanges(text, isWin) {
  if (isWin) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
    return [];
  }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const tab = line.indexOf("	");
    if (tab < 0) continue;
    out.push({ kind: line.slice(0, tab), rel: line.slice(tab + 1) });
  }
  return out;
}
function parseTreeId(out) {
  for (const line of String(out || "").split(/\r?\n/)) {
    if (line.indexOf("TREE ") === 0) return line.slice(5).trim() || null;
  }
  return null;
}
function parseDiffOutput(text, isWin, maxChanges) {
  const lines = String(text || "").split(/\r?\n/);
  let total = null;
  let treeId = null;
  const body = [];
  for (const line of lines) {
    if (line.indexOf("TREE ") === 0) {
      treeId = line.slice(5).trim() || null;
      continue;
    }
    if (line.indexOf("TOTAL ") === 0) {
      const n = parseInt(line.slice(6), 10);
      if (Number.isFinite(n) && n >= 0) total = n;
      continue;
    }
    body.push(line);
  }
  const raw = body.join("\n").trim();
  const all = raw ? parseChanges(raw, isWin) : [];
  const finalTotal = total !== null ? total : all.length;
  const changes = all.slice(0, maxChanges);
  return { changes, total: finalTotal, truncated: finalTotal > changes.length, treeId };
}
function scanCutSeq(events, messageId) {
  let anchor = -1;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e && e.type === "user/message" && e.data && String(e.data.id) === String(messageId)) {
      anchor = i;
      break;
    }
  }
  if (anchor < 0) return null;
  for (let i = anchor - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.type === "turn/end" && typeof e.seq === "number") return e.seq;
  }
  return null;
}
async function rescueRollback(deps, opts) {
  const { root, store, safetyId, safetyOk, rollbackError } = opts;
  const reason = String(rollbackError || "\u672A\u77E5\u539F\u56E0");
  if (!safetyOk) {
    deps.recordError("recall rollback failed, no rescue snapshot: " + reason);
    return { ok: false, code: E.RECALL_ROLLBACK_FAILED, message: "\u56DE\u9000\u5931\u8D25\uFF1A" + reason + "\uFF08\u65E0\u53EF\u7528\u5B89\u5168\u5FEB\u7167\uFF0C\u5DE5\u4F5C\u533A\u53EF\u80FD\u5904\u4E8E\u534A\u56DE\u9000\u72B6\u6001\uFF09" };
  }
  const tag = "snap-" + safetyId;
  const manual = 'git --git-dir="' + store.git + '" --work-tree="' + root + '" reset --hard ' + tag;
  try {
    const out = await deps.runShell(deps.scripts.rescueScript(root, store, deps.gitExe, tag), { timeoutMs: 6e5, stdoutMaxBytes: 65536 });
    if (String(out || "").indexOf("RESCUE_OK") < 0) throw new Error("rescue \u811A\u672C\u672A\u8F93\u51FA RESCUE_OK \u54E8\u5175");
    deps.recordError("recall rollback failed, rescued to safety tag: " + tag + " \u2014 " + reason);
    return { ok: false, code: E.RECALL_ROLLBACK_FAILED, message: "\u56DE\u9000\u5931\u8D25\uFF1A" + reason + "\uFF1B\u5DF2\u81EA\u52A8\u6062\u590D\u5230\u56DE\u9000\u524D\u7684\u5B89\u5168\u5FEB\u7167\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u540E\u91CD\u8BD5" };
  } catch (rescueError) {
    const re = rescueError;
    const rescueReason = String(re && re.message ? re.message : rescueError);
    deps.recordError("recall rollback failed and rescue failed: " + tag + " \u2014 " + reason + " | rescue: " + rescueReason);
    return { ok: false, code: E.RECALL_ROLLBACK_FAILED, message: "\u56DE\u9000\u5931\u8D25\uFF1A" + reason + "\uFF1B\u81EA\u52A8\u6062\u590D\u4E5F\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u6267\u884C\uFF1A" + manual };
  }
}
function isSafetySnapshotId(id) {
  return typeof id === "string" && id.indexOf("pre-rollback-") === 0;
}
function parseTagsWithTime(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const sp = t.lastIndexOf(" ");
    const name = sp > 0 ? t.slice(0, sp) : t;
    const ts = sp > 0 ? parseInt(t.slice(sp + 1), 10) : NaN;
    out.push({ name, time: Number.isFinite(ts) && ts > 0 ? ts * 1e3 : null });
  }
  return out;
}
function createSnapshots(ctx, rt, config) {
  const sessions = ctx.sessions;
  const state = rt.state;
  const S = rt.scripts;
  const BASE = () => config.baseExcludes;
  const FUSE_AFTER = 3;
  const FUSE_BACKOFF_BASE_MS = 5 * 60 * 1e3;
  const FUSE_BACKOFF_CAP_MS = 60 * 60 * 1e3;
  const snapFailures = /* @__PURE__ */ new Map();
  async function saveIndex(root, sessionId) {
    const store = state.stores.get(root);
    if (!store) return;
    const entries = Array.from(state.snapshots.entries()).filter(([, s]) => s.root === root).map(([id, s]) => {
      const rec = { id, time: s.time, root: s.root, sessionId: s.sessionId };
      const fb = state.snapFeedback.get(id);
      if (fb && (fb.failed || Array.isArray(fb.skipped) && fb.skipped.length)) rec.feedback = fb;
      return rec;
    });
    try {
      await rt.writeTextViaShell(store.dir + (rt.isWin ? "\\" : "/") + "index.json", JSON.stringify(entries));
    } catch (error) {
      rt.recordError("recall saveIndex failed: " + String(error));
    }
  }
  async function loadIndex(root, sessionId) {
    if (state.indexLoaded.has(root)) return;
    const store = state.stores.get(root);
    if (!store) return;
    let raw = "";
    let truncated = false;
    try {
      const meta = await rt.runShellMeta(S.indexReadCmd(store.dir), { stdoutMaxBytes: 4194304 });
      raw = S.stripBom(meta.text).trim();
      truncated = Boolean(meta.truncated);
    } catch (error) {
      return;
    }
    if (truncated) {
      rt.recordError("recall index read truncated: " + root + " \u7684 index.json \u8D85\u8FC7\u8BFB\u53D6\u4E0A\u9650\uFF0C\u6309\u7A7A\u7D22\u5F15\u7EE7\u7EED\uFF08\u539F\u6587\u4EF6\u672A\u6539\u52A8\uFF0C\u4E0B\u6B21\u5199\u7D22\u5F15\u81EA\u7136\u8986\u76D6\uFF09");
      state.indexLoaded.add(root);
      state.indexTruncated.add(root);
      return;
    }
    if (!raw) {
      state.indexLoaded.add(root);
      return;
    }
    let entries = null;
    try {
      entries = JSON.parse(raw);
    } catch (error) {
      if (await quarantineCorruptIndex(store)) state.indexLoaded.add(root);
      return;
    }
    if (!Array.isArray(entries)) {
      if (await quarantineCorruptIndex(store)) state.indexLoaded.add(root);
      return;
    }
    let invalid = 0;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id) {
        invalid++;
        continue;
      }
      state.snapshots.set(entry.id, {
        root,
        time: typeof entry.time === "number" ? entry.time : Date.now(),
        sessionId: entry.sessionId || sessionId || ""
      });
      const fb = entry.feedback;
      if (fb && typeof fb === "object") {
        const rec = {};
        if (fb.failed) {
          rec.failed = true;
          if (typeof fb.error === "string") rec.error = fb.error;
          if (typeof fb.kind === "string") rec.kind = fb.kind;
        }
        if (Array.isArray(fb.skipped)) rec.skipped = fb.skipped.filter((p) => typeof p === "string");
        if (rec.failed || Array.isArray(rec.skipped) && rec.skipped.length) setFeedback(entry.id, rec);
      }
    }
    if (invalid > 0) rt.recordError("recall index has " + invalid + " invalid entries for: " + root);
    state.indexLoaded.add(root);
    state.indexHealthy.add(root);
  }
  const quarantineThrottle = /* @__PURE__ */ new Map();
  function quarantineErrorThrottled(store, text) {
    const last = quarantineThrottle.get(store.dir) || 0;
    if (Date.now() - last < 5 * 60 * 1e3) return;
    quarantineThrottle.set(store.dir, Date.now());
    rt.recordError(text);
  }
  async function quarantineCorruptIndex(store) {
    const sep = rt.isWin ? "\\" : "/";
    const corrupt = store.dir + sep + "index.json.corrupt-" + Date.now();
    try {
      await rt.runShell(S.renameFileCmd(store.dir + sep + "index.json", corrupt), { stdoutMaxBytes: 4096 });
      rt.recordError("recall index corrupt: \u5DF2\u6309\u7A7A\u7D22\u5F15\u7EE7\u7EED\uFF0C\u574F\u6587\u4EF6\u4FDD\u7559\u4E3A " + corrupt);
      return true;
    } catch (error) {
      quarantineErrorThrottled(store, "recall index quarantine failed: " + String(error));
      return false;
    }
  }
  async function loadLineage(root) {
    const store = state.stores.get(root);
    if (!store) return [];
    try {
      const raw = S.stripBom(await rt.runShell(S.lineageReadCmd(store.dir), { stdoutMaxBytes: 1048576 })).trim();
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((e) => e && typeof e.childId === "string" && typeof e.parentId === "string") : [];
    } catch (error) {
      return [];
    }
  }
  async function recordLineage(root, childId, parentId) {
    const store = state.stores.get(root);
    if (!store) return;
    const sep = rt.isWin ? "\\" : "/";
    const existing = await loadLineage(root);
    if (!existing.some((e) => e.childId === childId && e.parentId === parentId)) {
      existing.push({ childId, parentId, time: Date.now() });
      try {
        await rt.writeTextViaShell(store.dir + sep + "lineage.json", JSON.stringify(existing));
      } catch (error) {
        rt.recordError("recall recordLineage failed: " + String(error));
      }
    }
  }
  async function readExclude(store) {
    return S.stripBom(await rt.runShell(S.excludeReadCmd(store.excludeFile), { stdoutMaxBytes: 1048576 }));
  }
  async function writeExclude(store, text) {
    const body = String(text == null ? "" : text);
    const sep = rt.isWin ? "\\" : "/";
    const parent = store.excludeFile.slice(0, store.excludeFile.lastIndexOf(sep));
    await rt.runShell(S.mkdirScript(parent), { stdoutMaxBytes: 4096 });
    await rt.writeTextViaShell(store.excludeFile, body);
  }
  async function rebuildOrphans(root, sessionId) {
    if (state.indexTruncated.has(root)) return;
    if (state.indexHealthy.has(root)) {
      let count = 0;
      for (const s of state.snapshots.values()) {
        if (s && s.root === root) count++;
      }
      if (count > 0) return;
    }
    const store = state.stores.get(root);
    const gitExe = await rt.resolveGit();
    if (!store || !gitExe) return;
    try {
      const listing = S.stripBom(await rt.runShell(S.listTagsWithTimeScript(store, gitExe), { stdoutMaxBytes: 4194304 })).trim();
      if (!listing) return;
      for (const { name, time } of parseTagsWithTime(listing)) {
        const id = name.replace(/^snap-/, "");
        if (!id || isSafetySnapshotId(id) || state.snapshots.has(id)) continue;
        state.snapshots.set(id, { root, time: time || 0, sessionId });
      }
      await saveIndex(root, sessionId);
    } catch (error) {
      rt.recordError("recall rebuildOrphans failed: " + String(error));
    }
  }
  async function captureSnapshot(sessionId, messageId, time) {
    const root = await rt.resolveRoot(sessionId);
    if (!root) return;
    const fused = snapFailures.get(root);
    if (fused && Date.now() < fused.skipUntil) return;
    let store = await rt.resolveStore(root);
    store = await rt.tryUpgradeToHome(root);
    const g = await rt.ensureGit(root, store);
    if (!g.ok) {
      setFeedback(messageId, { failed: true, ...buildFeedbackError(g.error || "\u672A\u77E5\u539F\u56E0") });
      return;
    }
    await loadIndex(root, sessionId);
    try {
      const out = await rt.runShell(S.snapshotScript(root, store, state.gitExe || "", messageId, BASE()), { timeoutMs: 6e5, stdoutMaxBytes: 65536 });
      snapFailures.delete(root);
      state.snapshots.set(String(messageId), { root, time: time || Date.now(), sessionId });
      await saveIndex(root, sessionId);
      setFeedback(messageId, { skipped: parseSkipped(out) });
    } catch (error) {
      rt.recordError("recall snapshot failed: " + String(error));
      setFeedback(messageId, { failed: true, ...buildFeedbackError(String(error)) });
      await handleSnapshotFailure(root, store);
    }
  }
  function setFeedback(messageId, rec) {
    const id = String(messageId);
    const keep = rec && (rec.failed || Array.isArray(rec.skipped) && rec.skipped.length);
    if (keep) state.snapFeedback.set(id, rec);
    else state.snapFeedback.delete(id);
    if (state.snapFeedback.size > 200) state.snapFeedback.delete(state.snapFeedback.keys().next().value);
  }
  async function feedbackFor(sessionId, messageId) {
    const rec = state.snapFeedback.get(String(messageId || ""));
    if (rec) return rec;
    if (!sessionId) return {};
    const root = await rt.resolveRoot(sessionId);
    if (root) {
      const f = snapFailures.get(root);
      if (f && Date.now() < f.skipUntil) {
        return { failed: true, error: "\u5FEB\u7167\u8FDE\u7EED\u5931\u8D25\u5DF2\u6682\u505C\uFF08\u7194\u65AD\uFF09\uFF0C\u7EA6 " + Math.ceil((f.skipUntil - Date.now()) / 6e4) + " \u5206\u949F\u540E\u81EA\u52A8\u91CD\u8BD5\uFF0C\u8BE6\u60C5\u89C1\u8BBE\u7F6E \xB7 \u63D2\u4EF6\u914D\u7F6E \xB7 \u6700\u8FD1\u9519\u8BEF" };
      }
    }
    return {};
  }
  async function handleSnapshotFailure(root, store) {
    if (store && state.gitExe) {
      try {
        await rt.runShell(S.pruneScript(store, state.gitExe), { timeoutMs: 6e5, stdoutMaxBytes: 4096 });
      } catch (error) {
        rt.recordError("recall prune after snapshot failure failed: " + String(error));
      }
    }
    const f = snapFailures.get(root) || { count: 0, skipUntil: 0 };
    f.count++;
    if (f.count >= FUSE_AFTER) {
      const backoff = Math.min(FUSE_BACKOFF_BASE_MS * 2 ** (f.count - FUSE_AFTER), FUSE_BACKOFF_CAP_MS);
      const wasFused = Date.now() < f.skipUntil;
      f.skipUntil = Date.now() + backoff;
      if (!wasFused) rt.recordError("recall snapshot fused after " + f.count + " consecutive failures, backoff " + Math.round(backoff / 6e4) + "min for: " + root);
    }
    snapFailures.set(root, f);
  }
  const MAX_CHANGES = 500;
  async function diffFor(messageId) {
    const snap = state.snapshots.get(String(messageId));
    if (!snap) return null;
    const store = state.stores.get(snap.root);
    if (!store) return null;
    const text = S.stripBom(await rt.runShell(S.diffScript(snap.root, store, state.gitExe || "", "snap-" + messageId, BASE(), MAX_CHANGES), { timeoutMs: 6e5, stdoutMaxBytes: 8388608 }));
    const trimmed = text.trim();
    if (!trimmed) return { changes: [], total: 0, truncated: false, treeId: null };
    return parseDiffOutput(trimmed, rt.isWin, MAX_CHANGES);
  }
  async function rollbackFor(messageId) {
    const snap = state.snapshots.get(String(messageId));
    if (!snap) return { ok: false, error: "\u8BE5\u6D88\u606F\u6CA1\u6709\u53EF\u7528\u7684\u9879\u76EE\u5FEB\u7167" };
    const store = state.stores.get(snap.root);
    if (!store) return { ok: false, error: "\u5FEB\u7167\u5B58\u50A8\u4E0D\u53EF\u7528" };
    try {
      const text = S.stripBom(await rt.runShell(S.rollbackScript(snap.root, store, state.gitExe || "", "snap-" + messageId, BASE()), { timeoutMs: 6e5, stdoutMaxBytes: 65536 }));
      const m = text.trim().match(/^ROLLBACK_OK\s+(\d+)\s+(\d+)/);
      if (!m) {
        return { ok: false, partial: true, error: "\u56DE\u9000\u811A\u672C\u672A\u6B63\u5E38\u5B8C\u6210\uFF08\u5DE5\u4F5C\u533A\u53EF\u80FD\u5904\u4E8E\u534A\u56DE\u9000\u72B6\u6001\uFF09\uFF1A" + text.slice(0, 300) };
      }
      const deleted = parseInt(m[1], 10);
      const restored = parseInt(m[2], 10);
      return { ok: true, count: (Number.isNaN(deleted) ? 0 : deleted) + (Number.isNaN(restored) ? 0 : restored) };
    } catch (error) {
      const re = error;
      const msg = String(re && re.message ? re.message : error);
      return { ok: false, partial: true, error: msg };
    }
  }
  async function resolveCutSeq(sessionId, messageId) {
    if (!sessionId || !messageId) return null;
    const cacheKey = String(sessionId) + "\0" + String(messageId);
    if (state.cutSeqCache.has(cacheKey)) return state.cutSeqCache.get(cacheKey) || null;
    let result = null;
    const live = sessions.get(sessionId);
    if (live && Array.isArray(live.events)) {
      result = scanCutSeq(live.events, messageId);
    } else {
      const query = ctx.get("sessionQuery");
      if (query) {
        try {
          const log = await query.readSession(sessionId);
          result = scanCutSeq(Array.isArray(log && log.events) ? log.events : [], messageId);
        } catch (error) {
          result = null;
        }
      }
    }
    state.cutSeqCache.set(cacheKey, result);
    return result;
  }
  return { saveIndex, loadIndex, readExclude, writeExclude, rebuildOrphans, captureSnapshot, diffFor, rollbackFor, resolveCutSeq, feedbackFor, loadLineage, recordLineage };
}
export {
  createSnapshots,
  isSafetySnapshotId,
  parseChanges,
  parseDiffOutput,
  parseSkipped,
  parseTagsWithTime,
  parseTreeId,
  rescueRollback,
  scanCutSeq
};
