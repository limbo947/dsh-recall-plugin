import { createConfig, Config, DEFAULTS } from "./config.js";
import { parseStoresDump, parseExcludeDump } from "./dump-parse.js";
import { createRuntime } from "./store.js";
import { createSnapshots, rescueRollback } from "./snapshots.js";
import { createMaintenance } from "./maintenance.js";
import { createSessionInfo, titleFromEvents, messageTextFromEvents } from "./session-info.js";
import { createRoutesCore } from "./routes-core.js";
import { createRoutesManage } from "./routes-manage.js";
import * as dshSettings from "@deepseek-ai/dsh-settings";
import * as E from "./errors.js";
const name = "dsh-recall-plugin";
const inject = ["shell", "sessions", "webServer", "agents"];
function apply(ctx, config) {
  const webServer = ctx.webServer;
  const cfg = createConfig(config);
  const rt = createRuntime(ctx, cfg);
  const snaps = createSnapshots(ctx, rt, cfg);
  const maint = createMaintenance(ctx, rt, snaps, cfg);
  const state = rt.state;
  let readSettings = () => config;
  function applyResolvedConfig(resolved) {
    Object.assign(cfg, createConfig(resolved && typeof resolved === "object" ? resolved : {}));
  }
  const settingsHooks = {
    setSource: (fn) => {
      readSettings = fn;
    },
    onChange: () => applyResolvedConfig(readSettings())
  };
  try {
    if (typeof dshSettings.installSettingsSection === "function") {
      dshSettings.installSettingsSection(ctx, "dsh-recall", Config, config, settingsHooks);
    } else if (typeof ctx.inject === "function") {
      ctx.inject(["settings"], (settingsCtx) => {
        const settingsService = settingsCtx.settings;
        if (typeof settingsService.installSection === "function") {
          settingsService.installSection(ctx, "dsh-recall", Config, config, settingsHooks);
        } else if (typeof settingsService.register === "function") {
          const scope = settingsService.register("dsh-recall", Config, { base: config });
          settingsHooks.setSource(() => scope.get());
          settingsHooks.onChange();
          scope.watch(() => settingsHooks.onChange());
          settingsCtx.effect(() => () => {
            settingsHooks.setSource(() => config);
            settingsHooks.onChange();
          });
        }
      });
    }
  } catch (error) {
    rt.recordError("recall settings namespace skipped: " + String(error));
  }
  const supported = process.platform === "win32" || process.platform === "linux" || process.platform === "darwin";
  const MAX_BODY_BYTES = 1048576;
  const listCache = { at: 0, items: null, stale: false, refreshing: null };
  const excludeCache = { at: 0, payload: null };
  const usageCache = { at: 0, payload: null };
  const sessionInfo = createSessionInfo(ctx);
  async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new Error(E.RECALL_BODY_TOO_LARGE);
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text.trim()) return {};
    return JSON.parse(text);
  }
  function sendJson(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  }
  function errBody(error) {
    const text = String(error && error.message ? error.message : error);
    if (text === E.RECALL_BODY_TOO_LARGE) return { ok: false, code: E.RECALL_BODY_TOO_LARGE, message: "\u8BF7\u6C42\u4F53\u8D85\u8FC7 1MB \u4E0A\u9650" };
    return { ok: false, code: E.RECALL_ERROR, message: text };
  }
  function enqueue(task) {
    const run = state.queue.then(task);
    state.queue = run.catch(() => {
    });
    return run;
  }
  async function runLimited(tasks, concurrency) {
    const limit = concurrency > 0 ? concurrency : 4;
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (index < tasks.length) {
        const task = tasks[index++];
        await task();
      }
    });
    await Promise.all(workers);
  }
  function normalizeWorkdir(path) {
    if (!path) return "";
    let p = String(path);
    return (process.platform === "win32" ? p.toLowerCase() : p).replace(/[\\/]+$/, "");
  }
  function agentBusy(sessionId, root) {
    let reg = null;
    try {
      reg = ctx.agents;
    } catch (error) {
      return false;
    }
    if (!reg) return false;
    try {
      if (typeof reg.list === "function") {
        for (const agent of reg.list()) {
          if (!agent || agent.status !== "running") continue;
          if (sessionId && String(agent.id) === String(sessionId)) return true;
          const cwd = agent.session && agent.session.header && agent.session.header.cwd;
          if (root && cwd && normalizeWorkdir(cwd) === normalizeWorkdir(root)) return true;
        }
        return false;
      }
      if (sessionId && typeof reg.get === "function") {
        const agent = reg.get(sessionId);
        return Boolean(agent && agent.status === "running");
      }
    } catch (error) {
    }
    return false;
  }
  async function listExcludeFiles() {
    const roots = new Set(state.stores.keys());
    for (const session of ctx.sessions.list()) {
      const cwd = session && session.header && session.header.cwd;
      if (cwd) roots.add(cwd);
    }
    const byFile = /* @__PURE__ */ new Map();
    await Promise.all(Array.from(roots).map(async (root) => {
      try {
        const store = await rt.resolveStore(root);
        if (store && !byFile.has(store.excludeFile)) byFile.set(store.excludeFile, { store, roots: [] });
        byFile.get(store.excludeFile).roots.push(root);
      } catch (error) {
      }
    }));
    try {
      const container = await rt.resolveHomeContainer();
      if (container) {
        const probe = rt.scripts.stripBom(await rt.runShell(rt.scripts.dirExistsScript(container), { stdoutMaxBytes: 4096 })).trim();
        if (probe === "YES") {
          const excludeFile = container + (rt.isWin ? "\\" : "/") + "exclude.txt";
          if (!byFile.has(excludeFile)) {
            byFile.set(excludeFile, { store: { dir: container, home: true, excludeFile }, roots: [] });
          }
        }
      }
    } catch (error) {
    }
    return byFile;
  }
  async function collectCwds() {
    const cwds = /* @__PURE__ */ new Set();
    for (const session of ctx.sessions.list()) {
      const cwd = session && session.header && session.header.cwd;
      if (cwd) cwds.add(cwd);
    }
    try {
      const querySvc = ctx.get("sessionQuery");
      if (querySvc && typeof querySvc.listSessions === "function") {
        for (const record of await querySvc.listSessions()) {
          const cwd = record && record.header && record.header.cwd;
          if (cwd) cwds.add(cwd);
        }
      }
    } catch (error) {
    }
    return cwds;
  }
  async function dumpStores() {
    const container = await rt.resolveHomeContainer();
    const extras = Array.from(await collectCwds()).map((cwd) => cwd + (rt.isWin ? "\\" : "/") + ".dsh-recall-snapshots");
    try {
      const text = rt.scripts.stripBom(await rt.runShell(rt.scripts.storesDumpScript(container || "", extras), { timeoutMs: 12e4, stdoutMaxBytes: 8388608 }));
      return parseStoresDump(text);
    } catch (error) {
      console.error("recall stores dump failed:", String(error && error.stack || error));
      return /* @__PURE__ */ new Map();
    }
  }
  async function locateSnapshotOnDisk(id) {
    if (!id) return null;
    const dump = await dumpStores();
    const hints = /* @__PURE__ */ new Map();
    for (const [root, st] of state.stores.entries()) {
      if (st && st.dir) hints.set(st.dir, root);
    }
    for (const [dir, info] of dump) {
      const hit = (info.entries || []).find((e) => e && e.id === id);
      if (!hit) continue;
      const root = info.root || hints.get(dir) || typeof hit.root === "string" && hit.root || null;
      if (!root) continue;
      try {
        const store = await rt.resolveStore(root);
        if (store) return { store, root };
      } catch (error) {
      }
    }
    return null;
  }
  async function collectAllSnapshotRecords() {
    const records = /* @__PURE__ */ new Map();
    function add(id, root, sessionId, time) {
      if (!id || typeof id !== "string") return;
      const old = records.get(id);
      if (!old) {
        records.set(id, {
          id,
          root: root || null,
          sessionId: sessionId || null,
          time: typeof time === "number" ? time : 0
        });
        return;
      }
      if (!old.root && root) old.root = root;
      if (!old.sessionId && sessionId) old.sessionId = sessionId;
      if (!old.time && time) old.time = time;
    }
    for (const [id, s] of state.snapshots.entries()) {
      if (s) add(id, s.root, s.sessionId, s.time);
    }
    const dump = await dumpStores();
    const hints = /* @__PURE__ */ new Map();
    for (const [root, st] of state.stores.entries()) {
      if (st && st.dir) hints.set(st.dir, root);
    }
    for (const [dir, info] of dump) {
      const baseRoot = info.root || hints.get(dir) || null;
      for (const e of info.entries || []) {
        if (!e || typeof e.id !== "string") continue;
        add(e.id, baseRoot || typeof e.root === "string" && e.root || null, e.sessionId, e.time);
      }
    }
    return records;
  }
  const deps = {
    ctx,
    rt,
    snaps,
    maint,
    state,
    cfg,
    supported,
    enqueue,
    agentBusy,
    runLimited,
    readJsonBody,
    sendJson,
    errBody,
    listExcludeFiles,
    dumpStores,
    locateSnapshotOnDisk,
    collectAllSnapshotRecords,
    listCache,
    excludeCache,
    usageCache,
    sessionInfo,
    titleFromEvents,
    messageTextFromEvents,
    // readSettings 传活绑定而非当前引用（A1）：dsh-settings 服务晚挂载时
    // setSource 会重绑定 readSettings——按值捕获的副本停在旧闭包（入口
    // config），config-reset 会按旧值「恢复默认」。活绑定让消费者每次调用
    // 都取到当前闭包。
    applyResolvedConfig,
    readSettings: () => readSettings(),
    DEFAULTS,
    rescueRollback,
    E
  };
  const endpoints = {
    ...createRoutesCore(deps),
    ...createRoutesManage(deps)
  };
  ctx.effect(() => webServer.register({
    kind: "prefix",
    path: "/api/recall",
    handler: async (req, res) => {
      const path = (req.url || "").split("?")[0];
      const name2 = path.replace(/^\/api\/recall\/?/, "").split("/")[0];
      const endpoint = endpoints[name2];
      if (!endpoint) {
        sendJson(res, 404, { ok: false, code: E.RECALL_UNKNOWN_ENDPOINT, message: "unknown endpoint: " + name2 });
        return;
      }
      try {
        const args = await readJsonBody(req);
        sendJson(res, 200, await endpoint(args));
      } catch (error) {
        sendJson(res, 200, errBody(error));
      }
    }
  }));
  if (!supported) return;
  ctx.on("session/event", (session, event) => {
    if (!event || event.type !== "user/message") return;
    const data = event.data;
    if (!data || typeof data.id !== "string" || !data.id) return;
    const source = data.source;
    if (!source || source.kind !== "user") return;
    if (session && session.header && session.header.origin === "subagent") return;
    const messageId = data.id;
    const time = event.time;
    state.queue = state.queue.then(() => cfg.snapshotEnabled ? snaps.captureSnapshot(session.id, messageId, time) : null).then(() => maint.maybeMaintain(session.id)).then(() => {
      listCache.stale = true;
    }).catch((error) => rt.recordError("recall snapshot error: " + String(error)));
  });
  (async () => {
    const warmupRoots = /* @__PURE__ */ new Map();
    for (const session of ctx.sessions.list()) {
      const cwd = session && session.header && session.header.cwd;
      if (cwd && !warmupRoots.has(cwd)) warmupRoots.set(cwd, session.id);
    }
    const querySvc = ctx.get("sessionQuery");
    if (querySvc && typeof querySvc.listSessions === "function") {
      try {
        const records = await querySvc.listSessions();
        for (const record of records || []) {
          const id = record && record.header && record.header.id ? record.header.id : null;
          const cwd = record && record.header && record.header.cwd;
          if (cwd && !warmupRoots.has(cwd)) warmupRoots.set(cwd, id);
        }
      } catch (error) {
      }
    }
    for (const [cwd, sessionId] of warmupRoots) {
      Promise.resolve(rt.resolveStore(cwd)).then(() => rt.tryUpgradeToHome(cwd)).then((store) => rt.ensureGit(cwd, store)).then(() => snaps.loadIndex(cwd, sessionId)).then(() => snaps.rebuildOrphans(cwd, sessionId)).then(() => rt.cleanupLegacy(cwd)).catch(() => {
      });
    }
  })();
}
export {
  Config,
  apply,
  inject,
  name,
  parseExcludeDump,
  parseStoresDump
};
