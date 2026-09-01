import { isSafetySnapshotId } from "./snapshots.js";
import { parseExcludeDump } from "./dump-parse.js";
function createRoutesManage(deps) {
  const {
    ctx,
    rt,
    snaps,
    maint,
    state,
    cfg,
    supported,
    enqueue,
    runLimited,
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
    applyResolvedConfig,
    readSettings,
    DEFAULTS,
    E
  } = deps;
  const { sessionTitles, messageTexts, liveTitleFast, liveMessageTextFast } = sessionInfo;
  async function buildListItems() {
    const allItems = [];
    const dump = await dumpStores();
    const hints = /* @__PURE__ */ new Map();
    for (const [root, st] of state.stores.entries()) {
      if (st && st.dir) hints.set(st.dir, root);
    }
    const byId = /* @__PURE__ */ new Map();
    function push(id, time, root, sessionId) {
      if (!id || typeof id !== "string") return;
      if (isSafetySnapshotId(id)) return;
      const old = byId.get(id);
      if (!old) {
        const rec = {
          id,
          time: typeof time === "number" ? time : 0,
          root: root || null,
          workspace: root ? root.replace(/[\\/]+$/, "").split(/[\\/]/).pop() : null,
          sessionId: sessionId || null,
          sessionTitle: liveTitleFast(sessionId)
        };
        const liveText = liveMessageTextFast(sessionId, id);
        if (liveText) rec.messageText = liveText;
        byId.set(id, rec);
        allItems.push(rec);
        return;
      }
      if (!old.root && root) {
        old.root = root;
        old.workspace = root.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || null;
      }
      if (!old.sessionId && sessionId) {
        old.sessionId = sessionId;
        old.sessionTitle = liveTitleFast(sessionId);
      }
      if (!old.messageText && id) {
        const t = liveMessageTextFast(sessionId, id);
        if (t) old.messageText = t;
      }
      if (!old.time && time) old.time = time;
    }
    for (const [dir, info] of dump) {
      const baseRoot = info.root || hints.get(dir) || null;
      for (const e of info.entries || []) {
        if (!e || typeof e.id !== "string") continue;
        push(e.id, e.time, baseRoot || typeof e.root === "string" && e.root || null, e.sessionId);
      }
    }
    for (const [id, s] of state.snapshots.entries()) {
      push(id, s.time, s.root, s.sessionId);
    }
    allItems.sort((a, b) => (b.time || 0) - (a.time || 0));
    return allItems;
  }
  function refreshListCacheInBackground() {
    if (listCache.refreshing) return listCache.refreshing;
    listCache.refreshing = buildListItems().then((allItems) => {
      listCache.items = allItems;
      listCache.at = Date.now();
      listCache.stale = false;
    }).catch((error) => {
      console.error("recall list refresh failed:", String(error && error.stack || error));
    }).finally(() => {
      listCache.refreshing = null;
    });
    return listCache.refreshing;
  }
  async function deleteSnapshotsByFilter(match, sessionId) {
    let records;
    if (Array.isArray(listCache.items) && listCache.items.length) {
      records = /* @__PURE__ */ new Map();
      for (const it of listCache.items) {
        if (!it || typeof it.id !== "string") continue;
        records.set(it.id, { id: it.id, root: it.root || null, sessionId: it.sessionId || null, time: typeof it.time === "number" ? it.time : 0 });
      }
    } else {
      records = await collectAllSnapshotRecords();
    }
    const byRoot = /* @__PURE__ */ new Map();
    for (const rec of records.values()) {
      if (!match(rec) || !rec.root) continue;
      if (!byRoot.has(rec.root)) byRoot.set(rec.root, []);
      byRoot.get(rec.root).push(rec.id);
    }
    let deleted = 0;
    await enqueue(async () => {
      for (const [root, rootIds] of byRoot) {
        let store = state.stores.get(root);
        if (!store) {
          try {
            store = await rt.resolveStore(root);
          } catch (error) {
            store = null;
          }
        }
        if (!store) continue;
        try {
          if (state.gitExe) {
            const tags = rootIds.map((id) => "snap-" + id);
            for (let i = 0; i < tags.length; i += 100) {
              await rt.runShell(rt.scripts.purgeTagsScript(store, state.gitExe, tags.slice(i, i + 100)), { timeoutMs: 12e4, stdoutMaxBytes: 4096 });
            }
          }
          if (!state.indexLoaded.has(root)) {
            try {
              await snaps.loadIndex(root, sessionId);
            } catch (error) {
            }
          }
          for (const id of rootIds) state.snapshots.delete(id);
          await snaps.saveIndex(root, sessionId);
          deleted += rootIds.length;
        } catch (error) {
          rt.recordError("recall batch delete failed for " + root + ": " + String(error));
        }
      }
      listCache.items = null;
      usageCache.payload = null;
    });
    return deleted;
  }
  async function deleteAllSnapshots() {
    return enqueue(async () => {
      const stores = /* @__PURE__ */ new Map();
      for (const [root, store] of state.stores.entries()) {
        if (store && store.dir) stores.set(store.dir, { store, root });
      }
      const dump = await dumpStores();
      for (const [dir, info] of dump.entries()) {
        const known = stores.get(dir);
        if (known) {
          if (!known.root && info.root) known.root = info.root;
          known.entries = info.entries || [];
        } else {
          stores.set(dir, {
            // 全局删除只动该目录下的 git/index；不必、也不能依赖可反解的 root。
            store: rt.storeFromDir(dir, false),
            root: info.root || null,
            entries: info.entries || []
          });
        }
      }
      if (stores.size === 0) return { deleted: 0, stores: 0, failed: 0 };
      const gitExe = await rt.resolveGit();
      if (!gitExe) {
        const message = "\u672A\u68C0\u6D4B\u5230 git CLI\uFF0C\u65E0\u6CD5\u9A8C\u8BC1\u5E76\u5220\u9664\u5FEB\u7167 tag";
        rt.recordError("recall delete all failed: " + message);
        return { deleted: 0, stores: 0, failed: stores.size || 1, message };
      }
      let deleted = 0;
      let clearedStores = 0;
      let failed = 0;
      for (const { store, root } of stores.values()) {
        try {
          const output = await rt.runShell(rt.scripts.listTagsScript(store, gitExe), { timeoutMs: 12e4, stdoutMaxBytes: 4194304 });
          const tags = rt.scripts.stripBom(output).split(/\r?\n/).map((tag) => tag.trim()).filter((tag) => tag.indexOf("snap-") === 0);
          for (let i = 0; i < tags.length; i += 100) {
            await rt.runShell(rt.scripts.purgeTagsScript(store, gitExe, tags.slice(i, i + 100)), { timeoutMs: 12e4, stdoutMaxBytes: 4096 });
          }
          const remainedOutput = await rt.runShell(rt.scripts.listTagsScript(store, gitExe), { timeoutMs: 12e4, stdoutMaxBytes: 4194304 });
          const remained = rt.scripts.stripBom(remainedOutput).split(/\r?\n/).map((tag) => tag.trim()).filter((tag) => tag.indexOf("snap-") === 0);
          if (remained.length) throw new Error("\u4ECD\u6709 " + remained.length + " \u4E2A\u5FEB\u7167 tag \u672A\u5220\u9664");
          await rt.writeTextViaShell(store.dir + (rt.isWin ? "\\" : "/") + "index.json", "[]");
          for (const tag of tags) state.snapshots.delete(tag.slice("snap-".length));
          if (root) {
            for (const [id, snap] of state.snapshots.entries()) {
              if (snap && snap.root === root) state.snapshots.delete(id);
            }
            state.indexLoaded.add(root);
          }
          deleted += tags.length;
          clearedStores += 1;
        } catch (error) {
          failed += 1;
          rt.recordError("recall delete all failed for " + store.dir + ": " + String(error));
        }
      }
      listCache.items = null;
      usageCache.payload = null;
      return { deleted, stores: clearedStores, failed };
    });
  }
  return {
    "exclude-get": async () => {
      if (!supported) return { ok: false, unsupported: true };
      if (excludeCache.payload && Date.now() - excludeCache.at < 3e4) return excludeCache.payload;
      const byFile = await listExcludeFiles();
      let contents = /* @__PURE__ */ new Map();
      try {
        const text = rt.scripts.stripBom(await rt.runShell(rt.scripts.excludeDumpScript(Array.from(byFile.keys())), { stdoutMaxBytes: 1048576 }));
        contents = parseExcludeDump(text);
      } catch (error) {
      }
      const payload = {
        ok: true,
        files: Array.from(byFile.entries()).map(([path, info]) => ({
          path,
          home: Boolean(info.store.home),
          roots: info.roots,
          content: contents.get(path) || ""
        }))
      };
      excludeCache.at = Date.now();
      excludeCache.payload = payload;
      return payload;
    },
    "exclude-set": async (args) => {
      if (!supported) return { ok: false, unsupported: true };
      const path = args && args.path ? String(args.path) : "";
      const content = args && typeof args.content === "string" ? args.content : "";
      const byFile = await listExcludeFiles();
      const info = byFile.get(path);
      if (!info) return { ok: false, code: E.RECALL_UNKNOWN_PATH, message: "\u672A\u77E5\u7684\u6392\u9664\u6587\u4EF6\u8DEF\u5F84" };
      await snaps.writeExclude(info.store, content);
      excludeCache.payload = null;
      return { ok: true };
    },
    // 设置页「插件配置」卡片读配置：resolved 全量值 + 用户已覆盖字段 + env
    // 锁定字段（环境变量优先级最高）+ 可写性（只读 provider 禁存）。
    "config-get": async () => {
      const envLocks = {
        gcSnaps: Boolean(process.env && process.env.DSH_RECALL_GC_SNAPS),
        gcHours: Boolean(process.env && process.env.DSH_RECALL_GC_HOURS)
      };
      let overridden = {};
      let writable = false;
      try {
        const settings = ctx.get("settings");
        if (settings && typeof settings.describe === "function") {
          const list = settings.describe();
          const ours = (Array.isArray(list) ? list : []).find((d) => d && d.ns === "dsh-recall");
          if (ours && ours.user && typeof ours.user === "object") overridden = ours.user;
          writable = settings.writable !== false;
        }
      } catch (error) {
      }
      return {
        ok: true,
        values: {
          gcSnaps: cfg.gcSnaps,
          gcHours: cfg.gcHours,
          maxFileBytes: cfg.maxFileBytes,
          maxSnapshotsPerWorkspace: cfg.maxSnapshotsPerWorkspace,
          baseExcludes: cfg.baseExcludes.slice(),
          refillDraft: cfg.refillDraft,
          snapshotEnabled: cfg.snapshotEnabled,
          archiveOriginal: cfg.archiveOriginal,
          retentionDays: cfg.retentionDays
        },
        overridden,
        envLocks,
        writable
      };
    },
    // 设置页「插件配置」卡片存配置：白名单字段 + 类型清洗后经 settings.update
    // 写进用户层，watch 链路把新值热更新进 cfg，无需重启。
    "config-set": async (args) => {
      const patch = args && args.patch && typeof args.patch === "object" ? args.patch : {};
      const clean = {};
      if (patch.gcSnaps !== void 0) clean.gcSnaps = Number(patch.gcSnaps);
      if (patch.gcHours !== void 0) clean.gcHours = Number(patch.gcHours);
      if (patch.maxFileBytes !== void 0) clean.maxFileBytes = Number(patch.maxFileBytes);
      if (patch.maxSnapshotsPerWorkspace !== void 0) {
        const n = Number(patch.maxSnapshotsPerWorkspace);
        if (!Number.isFinite(n)) return { ok: false, code: E.RECALL_BAD_TYPE, message: "\u5FEB\u7167\u603B\u91CF\u4E0A\u9650\u5FC5\u987B\u662F\u6570\u5B57" };
        clean.maxSnapshotsPerWorkspace = Math.max(0, n);
      }
      if (patch.refillDraft !== void 0) clean.refillDraft = Boolean(patch.refillDraft);
      if (patch.snapshotEnabled !== void 0) clean.snapshotEnabled = Boolean(patch.snapshotEnabled);
      if (patch.archiveOriginal !== void 0) clean.archiveOriginal = Boolean(patch.archiveOriginal);
      if (patch.retentionDays !== void 0) {
        const n = Number(patch.retentionDays);
        if (!Number.isFinite(n) || n < 0) return { ok: false, code: E.RECALL_BAD_TYPE, message: "\u4FDD\u7559\u5929\u6570\u5FC5\u987B\u662F >= 0 \u7684\u6570\u5B57\uFF080 \u8868\u793A\u4E0D\u542F\u7528\uFF09" };
        clean.retentionDays = Math.trunc(n);
      }
      if (patch.baseExcludes !== void 0) {
        if (!Array.isArray(patch.baseExcludes)) return { ok: false, code: E.RECALL_BAD_TYPE, message: "baseExcludes \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4" };
        clean.baseExcludes = patch.baseExcludes.filter((p) => typeof p === "string" && p.trim());
      }
      if (!Object.keys(clean).length) return { ok: false, code: E.RECALL_EMPTY_PATCH, message: "\u6CA1\u6709\u53EF\u5199\u5165\u7684\u914D\u7F6E\u5B57\u6BB5" };
      let settings = null;
      try {
        settings = ctx.get("settings");
      } catch (error) {
        settings = null;
      }
      if (!settings || typeof settings.update !== "function") {
        return { ok: false, code: E.RECALL_SETTINGS_UNAVAILABLE, message: "\u8BBE\u7F6E\u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u8BF7\u5728 profile \u7684 cordis.patch.yml \u6309 id: recall \u8986\u76D6\u914D\u7F6E" };
      }
      try {
        await settings.update("dsh-recall", clean);
      } catch (error) {
        return { ok: false, code: E.RECALL_SETTINGS_WRITE_FAILED, message: "\u914D\u7F6E\u5199\u5165\u5931\u8D25\uFF1A" + String(error && error.message ? error.message : error) };
      }
      return { ok: true };
    },
    // 设置页「快照管理」卡片：列表 / 磁盘占用 / 单条删除 / 手动 gc。
    // 全部走串行队列——删除 tag 与 gc 与快照争的是同一个 git 仓库。
    "manage": async (args) => {
      if (!supported) return { ok: false, unsupported: true };
      const op = args && args.op ? String(args.op) : "list";
      const sessionId = args && args.sessionId ? String(args.sessionId) : null;
      if (op === "list") {
        const limitRaw = args && args.limit !== void 0 ? Number(args.limit) : 200;
        const safeLimit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 200, 1), 2e3);
        if (listCache.items && (Date.now() - listCache.at < 3e4 || listCache.stale)) {
          const stale = Boolean(listCache.stale);
          if (stale) refreshListCacheInBackground();
          return { ok: true, items: listCache.items.slice(0, safeLimit), total: listCache.items.length, stale };
        }
        const allItems = await buildListItems();
        listCache.at = Date.now();
        listCache.items = allItems;
        listCache.stale = false;
        return { ok: true, items: allItems.slice(0, safeLimit), total: allItems.length };
      }
      if (op === "titles") {
        const ids = Array.from(new Set(
          (Array.isArray(args && args.sessionIds) ? args.sessionIds.map(String) : []).filter(Boolean)
        )).slice(0, 100);
        const out = {};
        await runLimited(ids.map((sid) => async () => {
          if (out[sid] !== void 0) return;
          let title = liveTitleFast(sid);
          if (title === null) {
            const query = ctx.get("sessionQuery");
            if (query && typeof query.readSession === "function") {
              try {
                const log = await query.readSession(sid);
                title = titleFromEvents(log && log.events);
              } catch (error) {
                title = null;
              }
            }
          }
          sessionTitles.set(sid, title);
          out[sid] = title;
        }), 4);
        return { ok: true, titles: out };
      }
      if (op === "messages") {
        const reqs = Array.isArray(args && args.requests) ? args.requests.slice(0, 200) : [];
        const bySession = /* @__PURE__ */ new Map();
        for (const r of reqs) {
          const sid = r && r.sessionId ? String(r.sessionId) : null;
          const mid = r && r.messageId ? String(r.messageId) : null;
          if (!sid || !mid) continue;
          if (!bySession.has(sid)) bySession.set(sid, []);
          bySession.get(sid).push(mid);
        }
        const texts = {};
        await runLimited(Array.from(bySession.entries()).map(([sid, mids]) => async () => {
          const allCached = mids.every((mid) => messageTexts.has(String(sid) + "\0" + String(mid)));
          let log = null;
          if (!allCached) {
            const query = ctx.get("sessionQuery");
            if (query && typeof query.readSession === "function") {
              try {
                log = await query.readSession(sid);
              } catch (error) {
                log = null;
              }
            }
          }
          for (const mid of mids) {
            const key = String(sid) + "\0" + String(mid);
            if (messageTexts.has(key)) {
              texts[mid] = messageTexts.get(key);
              continue;
            }
            let text = liveMessageTextFast(sid, mid);
            if (text === null && log && Array.isArray(log.events)) {
              text = messageTextFromEvents(log.events, mid);
            }
            messageTexts.set(key, text);
            texts[mid] = text;
          }
        }), 4);
        return { ok: true, messageTexts: texts };
      }
      if (op === "usage") {
        if (!sessionId && usageCache.payload && Date.now() - usageCache.at < 3e4) {
          return usageCache.payload;
        }
        let bytes = 0;
        let homeStores = 0;
        let fallbackStores = 0;
        if (sessionId) {
          const root = await rt.resolveRoot(sessionId);
          if (!root) return { ok: false, code: E.RECALL_NO_ROOT, message: "\u65E0\u6CD5\u89E3\u6790\u5F53\u524D\u5DE5\u4F5C\u533A" };
          const store = state.stores.get(root);
          if (!store) return { ok: false, code: E.RECALL_NO_STORE, message: "\u5F53\u524D\u5DE5\u4F5C\u533A\u5C1A\u672A\u521B\u5EFA\u5FEB\u7167\u5B58\u50A8" };
          if (store.home) homeStores++;
          else fallbackStores++;
          const out = await rt.runShell(rt.scripts.diskUsageScript(store.dir), { stdoutMaxBytes: 4096 });
          bytes = parseInt(rt.scripts.stripBom(out).trim(), 10) || 0;
        } else {
          const knownStores = Array.from(state.stores.values()).filter((s) => s && s.dir);
          const perStore = /* @__PURE__ */ new Map();
          await runLimited(knownStores.map((store) => async () => {
            try {
              const out = await rt.runShell(rt.scripts.diskUsageScript(store.dir), { stdoutMaxBytes: 4096 });
              perStore.set(store.dir, parseInt(rt.scripts.stripBom(out).trim(), 10) || 0);
            } catch (error) {
            }
          }), 4);
          for (const store of knownStores) {
            if (store.home) homeStores++;
            else fallbackStores++;
            bytes += perStore.get(store.dir) || 0;
          }
        }
        const payload = { ok: true, bytes, gitAvailable: state.gitExe !== "", homeStores, fallbackStores };
        if (!sessionId) {
          usageCache.at = Date.now();
          usageCache.payload = payload;
        }
        return payload;
      }
      if (op === "delete") {
        const scope = args && args.scope ? String(args.scope) : "snapshot";
        const root = args && args.root ? String(args.root) : null;
        const targetSessionId = args && args.sessionId ? String(args.sessionId) : null;
        const id = args && args.messageId ? String(args.messageId) : "";
        if (scope === "workspace") {
          if (!root) return { ok: false, code: E.RECALL_NO_ROOT, message: "\u7F3A\u5C11\u5DE5\u4F5C\u533A\u8DEF\u5F84" };
          const deleted = await deleteSnapshotsByFilter((rec) => rec.root === root, sessionId);
          return { ok: true, deleted };
        }
        if (scope === "session") {
          if (!targetSessionId) return { ok: false, code: E.RECALL_NO_SESSION, message: "\u7F3A\u5C11\u4F1A\u8BDD ID" };
          const deleted = await deleteSnapshotsByFilter(
            (rec) => rec.sessionId === targetSessionId && (!root || rec.root === root),
            sessionId
          );
          return { ok: true, deleted };
        }
        let snap = state.snapshots.get(id) || null;
        let snapRoot = snap ? snap.root : root;
        let store = null;
        if (snapRoot) {
          try {
            store = await rt.resolveStore(snapRoot);
          } catch (error) {
            store = null;
          }
        }
        if (!store) {
          const found = await locateSnapshotOnDisk(id);
          if (found) {
            store = found.store;
            snapRoot = found.root;
          }
        }
        if (!store) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: "\u8BE5\u5FEB\u7167\u4E0D\u5B58\u5728" };
        const finalStore = store;
        const finalRoot = snapRoot;
        await enqueue(async () => {
          if (state.gitExe) {
            await rt.runShell(rt.scripts.purgeTagsScript(finalStore, state.gitExe, ["snap-" + id]), { timeoutMs: 12e4, stdoutMaxBytes: 4096 });
          }
          if (!state.indexLoaded.has(finalRoot)) {
            try {
              await snaps.loadIndex(finalRoot, sessionId);
            } catch (error) {
            }
          }
          state.snapshots.delete(id);
          await snaps.saveIndex(finalRoot, sessionId);
          listCache.items = null;
          usageCache.payload = null;
        });
        return { ok: true };
      }
      if (op === "deleteAll") {
        const result = await deleteAllSnapshots();
        if (result.failed > 0) {
          return {
            ok: false,
            code: E.RECALL_PARTIAL_DELETE,
            deleted: result.deleted,
            message: result.message || "\u5DF2\u5220\u9664 " + result.deleted + " \u6761\u5FEB\u7167\uFF0C\u4F46\u6709 " + result.failed + " \u4E2A\u5B58\u50A8\u672A\u5B8C\u6210\uFF1B\u8BF7\u67E5\u770B\u6700\u8FD1\u9519\u8BEF\u540E\u91CD\u8BD5"
          };
        }
        return { ok: true, deleted: result.deleted, stores: result.stores };
      }
      if (op === "gc") {
        const done = sessionId ? await enqueue(() => maint.runGc(sessionId, true)) : await enqueue(() => maint.runGcAll());
        usageCache.payload = null;
        return { ok: true, gc: Boolean(done) };
      }
      if (op === "lineage") {
        const hints = /* @__PURE__ */ new Map();
        for (const [root, st] of state.stores.entries()) {
          if (st && st.dir) hints.set(st.dir, root);
        }
        let dump;
        try {
          dump = await dumpStores();
        } catch (error) {
          dump = /* @__PURE__ */ new Map();
        }
        const out = [];
        for (const info of dump.values()) {
          for (const e of info.lineage || []) out.push(e);
        }
        return { ok: true, lineage: out };
      }
      return { ok: false, code: E.RECALL_UNKNOWN_OP, message: "\u672A\u77E5\u7684\u7BA1\u7406\u64CD\u4F5C: " + op };
    },
    // 设置页「插件配置」卡片恢复默认：整段清空 user 层回组合 base——官方
    // settings RPC 的 replace 明确是「restoration/reset 路径」。老版本服务
    // 没有 replace 时降级 settings.update 写 DEFAULTS。
    "config-reset": async () => {
      let settings = null;
      try {
        settings = ctx.get("settings");
      } catch (error) {
        settings = null;
      }
      if (!settings || typeof settings.update !== "function") {
        return { ok: false, code: E.RECALL_SETTINGS_UNAVAILABLE, message: "\u8BBE\u7F6E\u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u8BF7\u5728 profile \u7684 cordis.patch.yml \u6309 id: recall \u8986\u76D6\u914D\u7F6E" };
      }
      try {
        if (typeof settings.replace === "function") {
          await settings.replace("dsh-recall", {});
        } else {
          await settings.update("dsh-recall", Object.assign({}, DEFAULTS, { baseExcludes: DEFAULTS.baseExcludes.slice() }));
        }
      } catch (error) {
        return { ok: false, code: E.RECALL_SETTINGS_WRITE_FAILED, message: "\u6062\u590D\u9ED8\u8BA4\u5931\u8D25\uFF1A" + String(error && error.message ? error.message : error) };
      }
      applyResolvedConfig(readSettings());
      return { ok: true };
    }
  };
}
export {
  createRoutesManage
};
