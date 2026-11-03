import * as E from "./errors.js";
import { buildFeedbackError } from "./diagnostics.js";
import { buildArtifactRootSegment } from "./exclude-patterns.js";
function parseSkipped(out) {
  const skipped = [];
  for (const line of String(out || "").split(/\r?\n/)) {
    if (line.indexOf("SNAP_SKIP ") === 0) skipped.push(line.slice("SNAP_SKIP ".length));
  }
  return skipped;
}
function parseSnapshotLimit(out) {
  for (const line of String(out || "").split(/\r?\n/)) {
    if (line.indexOf("SNAP_LIMIT ") !== 0) continue;
    const parts = line.slice("SNAP_LIMIT ".length).trim().split(/\s+/);
    const kind = parts[0];
    if (kind !== "bytes" && kind !== "time") continue;
    const value = parseInt(parts[1] ?? "", 10);
    const limit = parseInt(parts[2] ?? "", 10);
    if (!Number.isFinite(value) || !Number.isFinite(limit)) continue;
    return { kind, value, limit };
  }
  return null;
}
function parseScanFail(out) {
  let rc = null;
  let message = "";
  for (const line of String(out || "").split(/\r?\n/)) {
    if (line.indexOf("SNAP_SCAN_FAIL ") === 0) {
      const n = parseInt(line.slice(15).trim(), 10);
      if (Number.isFinite(n)) rc = n;
    } else if (line.indexOf("SNAP_SCAN_ERR ") === 0) {
      message = line.slice(14).trim();
    }
  }
  return rc === null ? null : { rc, message };
}
function bytesText(bytes) {
  if (bytes >= 1048576) return Math.round(bytes / 1048576) + " MB";
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}
function buildSnapshotLimitNotice(limit) {
  if (limit.kind === "scan") {
    return "\u65E0\u6CD5\u7EDF\u8BA1\u8BE5\u5DE5\u4F5C\u533A\u7684\u5FEB\u7167\u8303\u56F4\uFF08git \u9000\u51FA\u7801 " + limit.value + "\uFF09\uFF0C\u672C\u6B21\u5FEB\u7167\u5DF2\u8DF3\u8FC7\uFF1B\u8BE5\u5DE5\u4F5C\u533A\u6682\u505C\u5FEB\u7167\u7EA6 10 \u5206\u949F\uFF0C\u4FEE\u590D\u540E\u81EA\u52A8\u6062\u590D\uFF0C\u8BE6\u60C5\u89C1\u300C\u6700\u8FD1\u9519\u8BEF\u300D";
  }
  if (limit.kind === "bytes") {
    return "\u8BE5\u5DE5\u4F5C\u533A\u53EF\u7EB3\u5165\u5FEB\u7167\u7684\u6587\u4EF6\u603B\u91CF\u8D85\u8FC7\u4E0A\u9650\uFF08\u7EA6 " + bytesText(limit.value) + " / " + bytesText(limit.limit) + "\uFF0C\u5DF2\u6309 .gitignore \u4E0E\u6392\u9664\u8868\u8FC7\u6EE4\uFF09\uFF0C\u5DF2\u505C\u7528\u5FEB\u7167\uFF1B\u53EF\u8C03\u5927\u300C\u5DE5\u4F5C\u533A\u603B\u91CF\u4E0A\u9650\u300D\u6216\u8865\u5145\u6392\u9664\u8868\u540E\u81EA\u52A8\u6062\u590D";
  }
  return "\u5FEB\u7167\u524D\u7684\u6587\u4EF6\u626B\u63CF\u8D85\u8FC7\u65F6\u95F4\u9884\u7B97\uFF08\u7EA6 " + Math.max(1, Math.round(limit.value / 1e3)) + " \u79D2 / " + Math.max(1, Math.round(limit.limit / 1e3)) + " \u79D2\uFF09\uFF0C\u5DF2\u505C\u7528\u5FEB\u7167\uFF1B\u53EF\u8C03\u5927\u300C\u626B\u63CF\u65F6\u95F4\u9884\u7B97\u300D\u6216\u8865\u5145\u6392\u9664\u8868\u540E\u81EA\u52A8\u6062\u590D";
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
function countChanges(list) {
  const counts = { modified: 0, restored: 0, added: 0 };
  for (const c of list) {
    if (c && Object.prototype.hasOwnProperty.call(counts, String(c.kind))) counts[c.kind]++;
  }
  return counts;
}
function parseCounts(line) {
  const parts = line.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  const m = parseInt(parts[0] ?? "", 10);
  const r = parseInt(parts[1] ?? "", 10);
  const a = parseInt(parts[2] ?? "", 10);
  if (!Number.isFinite(m) || !Number.isFinite(r) || !Number.isFinite(a)) return null;
  if (m < 0 || r < 0 || a < 0) return null;
  return { modified: m, restored: r, added: a };
}
function parseDiffOutput(text, isWin, maxChanges) {
  const lines = String(text || "").split(/\r?\n/);
  let total = null;
  let treeId = null;
  let counts = null;
  const body = [];
  for (const line of lines) {
    if (line.indexOf("TREE ") === 0) {
      treeId = line.slice(5).trim() || null;
      continue;
    }
    if (line.indexOf("COUNTS ") === 0) {
      counts = parseCounts(line.slice(7));
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
  const truncated = finalTotal > changes.length;
  const complete = all.length >= finalTotal;
  return { changes, total: finalTotal, truncated, treeId, counts: counts || (complete ? countChanges(all) : null) };
}
function scanCutSeqDetail(events, messageId) {
  let anchor = -1;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e && e.type === "user/message" && e.data && String(e.data.id) === String(messageId)) {
      anchor = i;
      break;
    }
  }
  if (anchor < 0) return { cut: null, found: false };
  for (let i = anchor - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.type === "turn/end" && typeof e.seq === "number") return { cut: e.seq, found: true };
  }
  return { cut: null, found: true };
}
function scanCutSeq(events, messageId) {
  return scanCutSeqDetail(events, messageId).cut;
}
function scanStaleQueueItemIds(events, cutSeq) {
  if (!Array.isArray(events)) return [];
  if (typeof cutSeq !== "number" || !Number.isFinite(cutSeq)) return [];
  const out = [];
  for (const e of events) {
    if (!e || typeof e.seq !== "number" || e.seq <= cutSeq) continue;
    if (e.type === "turn/start") break;
    if (e.type !== "agent/inbox/spliced") continue;
    const inserted = e.data && Array.isArray(e.data.inserted) ? e.data.inserted : [];
    for (const item of inserted) {
      const source = item && item.source;
      if (!source || source.kind !== "user") continue;
      const id = item.id;
      if (typeof id === "string" && id !== "" && out.indexOf(id) < 0) out.push(id);
    }
  }
  return out;
}
function liveEventsOf(live) {
  if (!live) return null;
  if (typeof live.snapshotEvents === "function") {
    const events = live.snapshotEvents();
    if (Array.isArray(events)) return events;
  }
  return Array.isArray(live.events) ? live.events : null;
}
function disposeLease(lease) {
  const disposeSymbol = Symbol.dispose;
  if (!disposeSymbol || lease === null || typeof lease !== "object") return;
  const dispose = lease[disposeSymbol];
  if (typeof dispose === "function") dispose.call(lease);
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
function judgeStoreFormat(raw, supported) {
  if (raw === null) return { ok: false, v: null, reason: "unreadable" };
  const t = String(raw == null ? "" : raw).trim();
  let v;
  if (!t) {
    v = 1;
  } else {
    if (!/^\d+$/.test(t)) return { ok: false, v: null, reason: "corrupt" };
    v = parseInt(t, 10);
    if (v < 1) return { ok: false, v: null, reason: "corrupt" };
  }
  if (v > supported) return { ok: false, v, reason: "future" };
  return { ok: true, v, reason: t ? "ok" : "absent" };
}
function createSnapshots(ctx, rt, config) {
  const sessions = ctx.sessions;
  const state = rt.state;
  const S = rt.scripts;
  const BASE = () => config.baseExcludes;
  const FUSE_AFTER = 3;
  const FUSE_BACKOFF_BASE_MS = 5 * 60 * 1e3;
  const FUSE_BACKOFF_CAP_MS = 60 * 60 * 1e3;
  const EXPENSIVE_FAIL_MS = 60 * 1e3;
  const snapFailures = /* @__PURE__ */ new Map();
  const SNAP_LIMIT_RETRY_MS = 10 * 60 * 1e3;
  const snapLimits = /* @__PURE__ */ new Map();
  const limitBlockedAt = /* @__PURE__ */ new Map();
  function markSnapshotLimited(root, limit) {
    snapLimits.set(root, { ...limit, at: Date.now(), maxWorkspaceBytes: config.maxWorkspaceBytes, scanBudgetMs: config.scanBudgetMs });
  }
  function noteSnapshotBlocked(root, detail) {
    const last = limitBlockedAt.get(root) || 0;
    if (Date.now() - last < 5 * 60 * 1e3) return;
    limitBlockedAt.set(root, Date.now());
    rt.recordError(detail);
  }
  const SUPPORTED_FORMAT = 1;
  const FORMAT_OK_TTL_MS = 3e4;
  const formatOkAt = /* @__PURE__ */ new Map();
  const formatBlockedAt = /* @__PURE__ */ new Map();
  function formatFile(store) {
    return store.dir + (rt.isWin ? "\\" : "/") + "format";
  }
  async function readFormatRaw(store) {
    try {
      return S.stripBom(await rt.runShell(S.fileReadCmd(formatFile(store)), { stdoutMaxBytes: 4096 }));
    } catch (error) {
      return null;
    }
  }
  async function storeFormatVerdict(store) {
    const at = formatOkAt.get(store.dir);
    if (at !== void 0 && Date.now() - at < FORMAT_OK_TTL_MS) return { ok: true, v: SUPPORTED_FORMAT, reason: "ok" };
    const verdict = judgeStoreFormat(await readFormatRaw(store), SUPPORTED_FORMAT);
    if (verdict.ok && verdict.reason === "ok") formatOkAt.set(store.dir, Date.now());
    return verdict;
  }
  function formatBlockedThrottled(store, verdict) {
    const last = formatBlockedAt.get(store.dir) || 0;
    if (Date.now() - last < 5 * 60 * 1e3) return;
    formatBlockedAt.set(store.dir, Date.now());
    const detail = verdict.reason === "future" ? "\u78C1\u76D8\u683C\u5F0F\u6807\u8BB0\u4E3A v" + verdict.v + "\uFF08\u672C\u63D2\u4EF6\u652F\u6301 v" + SUPPORTED_FORMAT + "\uFF09\uFF1A\u5199\u5165\u5DF2\u6682\u505C\uFF08\u5FEB\u7167/\u64A4\u56DE/\u6E05\u7406\uFF09\uFF0C\u5217\u8868\u4ECD\u53EF\u67E5\u770B\uFF1B\u8BF7\u5347\u7EA7\u63D2\u4EF6" : verdict.reason === "corrupt" ? "\u78C1\u76D8\u683C\u5F0F\u6807\u8BB0\u5185\u5BB9\u975E\u6CD5\uFF08\u5E94\u4E3A " + SUPPORTED_FORMAT + "\uFF09\uFF1A\u5199\u5165\u5DF2\u6682\u505C\uFF08\u5FEB\u7167/\u64A4\u56DE/\u6E05\u7406\uFF09\uFF1B\u8BF7\u68C0\u67E5\u8BE5 store \u76EE\u5F55\u4E0B\u7684 format \u6587\u4EF6" : "\u8BFB\u4E0D\u5230\u5FEB\u7167\u5E93\u7684\u78C1\u76D8\u683C\u5F0F\u6807\u8BB0\uFF08\u73AF\u5883\u672A\u5C31\u7EEA\u6216\u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF09\uFF1A\u672C\u6B21\u5199\u5165\u5DF2\u6682\u505C\uFF0C\u4E0B\u4E00\u6761\u6D88\u606F\u81EA\u52A8\u91CD\u8BD5\uFF1B\u6301\u7EED\u51FA\u73B0\u8BF7\u68C0\u67E5\u8BE5 store \u76EE\u5F55\u6743\u9650";
    rt.recordError("recall store format blocked: " + detail);
  }
  async function guardStoreFormat(store) {
    const verdict = await storeFormatVerdict(store);
    if (verdict.ok) return true;
    formatBlockedThrottled(store, verdict);
    return false;
  }
  async function stampStoreFormat(store, verdict) {
    if (!verdict.ok || verdict.reason !== "absent") return;
    try {
      await rt.writeTextViaShell(formatFile(store), String(SUPPORTED_FORMAT));
      formatOkAt.set(store.dir, Date.now());
    } catch (error) {
      rt.recordError("recall format stamp failed: " + String(error));
    }
  }
  async function saveIndex(root, sessionId) {
    const store = state.stores.get(root);
    if (!store) return;
    const verdict = await storeFormatVerdict(store);
    if (!verdict.ok) {
      formatBlockedThrottled(store, verdict);
      return;
    }
    await stampStoreFormat(store, verdict);
    const entries = Array.from(state.snapshots.entries()).filter(([, s]) => s.root === root).map(([id, s]) => {
      const rec = { id, time: s.time, root: s.root, sessionId: s.sessionId };
      if (s.files === false) rec.files = false;
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
    if (!await guardStoreFormat(store)) return;
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
      const info = {
        root,
        time: typeof entry.time === "number" ? entry.time : Date.now(),
        sessionId: entry.sessionId || sessionId || ""
      };
      if (entry.files === false) info.files = false;
      state.snapshots.set(entry.id, info);
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
    if (!await guardStoreFormat(store)) return;
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
  async function captureMessageOnly(root, sessionId, messageId, time) {
    let store = await rt.resolveStore(root);
    store = await rt.tryUpgradeToHome(root);
    if (!await guardStoreFormat(store)) return;
    const g = await rt.ensureGit(root, store);
    if (!g.ok) {
      setFeedback(messageId, { failed: true, ...buildFeedbackError(g.error || "\u672A\u77E5\u539F\u56E0") });
      return;
    }
    await loadIndex(root, sessionId);
    state.snapshots.set(String(messageId), { root, time: time || Date.now(), sessionId, files: false });
    await saveIndex(root, sessionId);
    setFeedback(messageId, { skipped: [] });
  }
  async function captureSnapshot(sessionId, messageId, time) {
    const root = await rt.resolveRoot(sessionId);
    if (!root) return;
    if (config.messageOnly) {
      await captureMessageOnly(root, sessionId, messageId, time);
      return;
    }
    const fused = snapFailures.get(root);
    if (fused && Date.now() < fused.skipUntil) return;
    const limited = snapLimits.get(root);
    if (limited && limited.maxWorkspaceBytes === config.maxWorkspaceBytes && limited.scanBudgetMs === config.scanBudgetMs && Date.now() - limited.at < SNAP_LIMIT_RETRY_MS) return;
    if (buildArtifactRootSegment(root, BASE(), rt.isWin)) return;
    let store = await rt.resolveStore(root);
    store = await rt.tryUpgradeToHome(root);
    if (!await guardStoreFormat(store)) return;
    const g = await rt.ensureGit(root, store);
    if (!g.ok) {
      setFeedback(messageId, { failed: true, ...buildFeedbackError(g.error || "\u672A\u77E5\u539F\u56E0") });
      return;
    }
    await loadIndex(root, sessionId);
    const captureStartedAt = Date.now();
    try {
      const budget = config.snapshotBudgetMs > 0 ? config.snapshotBudgetMs : 864e5;
      const out = await rt.runShell(S.snapshotScript(root, store, state.gitExe || "", messageId, BASE()), { timeoutMs: budget, stdoutMaxBytes: 65536 });
      const limit = parseSnapshotLimit(out);
      if (limit) {
        markSnapshotLimited(root, limit);
        const notice = buildSnapshotLimitNotice(limit);
        noteSnapshotBlocked(root, "recall snapshot disabled for " + root + ": " + notice);
        setFeedback(messageId, { failed: true, kind: "workspaceLimit", error: notice });
        return;
      }
      const scanFail = parseScanFail(out);
      if (scanFail) {
        const pseudo = { kind: "scan", value: scanFail.rc, limit: 0 };
        markSnapshotLimited(root, pseudo);
        const notice = buildSnapshotLimitNotice(pseudo);
        noteSnapshotBlocked(root, "recall snapshot scan failed for " + root + ": rc=" + scanFail.rc + " " + scanFail.message);
        setFeedback(messageId, { failed: true, kind: "scanFail", error: notice });
        return;
      }
      snapFailures.delete(root);
      state.snapshots.set(String(messageId), { root, time: time || Date.now(), sessionId });
      await saveIndex(root, sessionId);
      setFeedback(messageId, { skipped: parseSkipped(out) });
    } catch (error) {
      rt.recordError("recall snapshot failed: " + String(error));
      setFeedback(messageId, { failed: true, ...buildFeedbackError(String(error)) });
      await handleSnapshotFailure(root, store, Date.now() - captureStartedAt);
    }
  }
  function setFeedback(messageId, rec) {
    const id = String(messageId);
    const keep = rec && (rec.failed || Array.isArray(rec.skipped) && rec.skipped.length);
    if (keep) state.snapFeedback.set(id, rec);
    else state.snapFeedback.delete(id);
    if (state.snapFeedback.size > 200) {
      const oldest = state.snapFeedback.keys().next().value;
      if (oldest !== void 0) state.snapFeedback.delete(oldest);
    }
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
  async function handleSnapshotFailure(root, store, elapsedMs = 0) {
    if (store && state.gitExe) {
      try {
        await rt.runShell(S.pruneScript(store, state.gitExe), { timeoutMs: 6e5, stdoutMaxBytes: 4096 });
      } catch (error) {
        rt.recordError("recall prune after snapshot failure failed: " + String(error));
      }
    }
    const f = snapFailures.get(root) || { count: 0, skipUntil: 0 };
    f.count++;
    const expensive = elapsedMs >= EXPENSIVE_FAIL_MS;
    if (expensive && f.count < FUSE_AFTER) f.count = FUSE_AFTER;
    if (f.count >= FUSE_AFTER) {
      const backoff = Math.min(FUSE_BACKOFF_BASE_MS * 2 ** (f.count - FUSE_AFTER), FUSE_BACKOFF_CAP_MS);
      const wasFused = Date.now() < f.skipUntil;
      f.skipUntil = Date.now() + backoff;
      if (!wasFused) {
        rt.recordError("recall snapshot fused after " + f.count + " consecutive failures, backoff " + Math.round(backoff / 6e4) + "min for: " + root + (expensive ? " (last failure took " + Math.round(elapsedMs / 1e3) + "s)" : ""));
      }
    }
    snapFailures.set(root, f);
  }
  const MAX_CHANGES = 500;
  async function diffFor(messageId) {
    const snap = state.snapshots.get(String(messageId));
    if (!snap) return null;
    if (snap.files === false) return { changes: [], total: 0, truncated: false, treeId: null, counts: { modified: 0, restored: 0, added: 0 } };
    const store = state.stores.get(snap.root);
    if (!store) return null;
    const text = S.stripBom(await rt.runShell(S.diffScript(snap.root, store, state.gitExe || "", "snap-" + messageId, BASE(), MAX_CHANGES), { timeoutMs: 6e5, stdoutMaxBytes: 8388608 }));
    const trimmed = text.trim();
    if (!trimmed) return { changes: [], total: 0, truncated: false, treeId: null, counts: { modified: 0, restored: 0, added: 0 } };
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
      const deleted = parseInt(m[1] ?? "", 10);
      const restored = parseInt(m[2] ?? "", 10);
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
        let fallback = false;
        try {
          const log = await query.readSession(sessionId);
          const detail = scanCutSeqDetail(Array.isArray(log && log.events) ? log.events : [], messageId);
          result = detail.cut;
          fallback = !detail.found;
        } catch (error) {
          fallback = true;
        }
        if (fallback && typeof query.observeSession === "function") {
          try {
            const lease = await query.observeSession(sessionId);
            try {
              result = scanCutSeq(lease && Array.isArray(lease.events) ? lease.events : [], messageId);
            } finally {
              disposeLease(lease);
            }
          } catch (error) {
            result = null;
          }
        }
      }
    }
    state.cutSeqCache.set(cacheKey, result);
    return result;
  }
  async function resolveStaleQueueItemIds(sessionId, cutSeq) {
    if (!sessionId || typeof cutSeq !== "number" || !Number.isFinite(cutSeq)) return [];
    const live = liveEventsOf(sessions.get(sessionId));
    if (live) return scanStaleQueueItemIds(live, cutSeq);
    const query = ctx.get("sessionQuery");
    if (!query) return [];
    if (typeof query.observeSession === "function") {
      try {
        const lease = await query.observeSession(sessionId);
        try {
          return lease && Array.isArray(lease.events) ? scanStaleQueueItemIds(lease.events, cutSeq) : [];
        } finally {
          disposeLease(lease);
        }
      } catch (error) {
      }
    }
    try {
      const log = await query.readSession(sessionId);
      return log && Array.isArray(log.events) ? scanStaleQueueItemIds(log.events, cutSeq) : [];
    } catch (error) {
      return [];
    }
  }
  return { saveIndex, loadIndex, readExclude, writeExclude, rebuildOrphans, captureSnapshot, diffFor, rollbackFor, resolveCutSeq, resolveStaleQueueItemIds, feedbackFor, loadLineage, recordLineage, guardStoreFormat };
}
export {
  buildSnapshotLimitNotice,
  createSnapshots,
  isSafetySnapshotId,
  judgeStoreFormat,
  parseChanges,
  parseDiffOutput,
  parseScanFail,
  parseSkipped,
  parseSnapshotLimit,
  parseTagsWithTime,
  parseTreeId,
  rescueRollback,
  scanCutSeq,
  scanCutSeqDetail,
  scanStaleQueueItemIds
};
