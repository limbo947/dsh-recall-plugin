function selectOverLimitVictims(snapshots, limit) {
  if (!limit || limit <= 0) return /* @__PURE__ */ new Map();
  const byRoot = /* @__PURE__ */ new Map();
  for (const [id, s] of snapshots.entries()) {
    if (!s || !s.root) continue;
    if (!byRoot.has(s.root)) byRoot.set(s.root, []);
    byRoot.get(s.root).push({ id, time: s.time });
  }
  const victims = /* @__PURE__ */ new Map();
  for (const [root, list] of byRoot) {
    if (list.length <= limit) continue;
    const excess = list.length - limit;
    list.sort((a, b) => (a.time || 0) - (b.time || 0));
    victims.set(root, list.slice(0, excess));
  }
  return victims;
}
function selectExpiredVictims(snapshots, retentionDays, now) {
  if (!retentionDays || retentionDays <= 0) return /* @__PURE__ */ new Map();
  const cutoff = (typeof now === "number" ? now : Date.now()) - retentionDays * 864e5;
  const byRoot = /* @__PURE__ */ new Map();
  for (const [id, s] of snapshots.entries()) {
    if (!s || !s.root) continue;
    if (s.time > 0 && s.time >= cutoff) continue;
    if (!byRoot.has(s.root)) byRoot.set(s.root, []);
    byRoot.get(s.root).push({ id, time: s.time });
  }
  return byRoot;
}
function createMaintenance(ctx, rt, snaps, config) {
  const sessions = ctx.sessions;
  const state = rt.state;
  const S = rt.scripts;
  async function purgeSession(sessionId) {
    const byRoot = /* @__PURE__ */ new Map();
    for (const [id, s] of state.snapshots.entries()) {
      if (!s || s.sessionId !== sessionId) continue;
      if (!byRoot.has(s.root)) byRoot.set(s.root, []);
      byRoot.get(s.root).push(id);
    }
    let purged = 0;
    for (const [root, ids] of byRoot) {
      let store = state.stores.get(root) || null;
      if (!store) {
        try {
          store = await rt.resolveStore(root);
        } catch (error) {
          store = null;
        }
      }
      if (!store || !state.gitExe) continue;
      try {
        for (let i = 0; i < ids.length; i += 100) {
          await rt.runShell(S.purgeTagsScript(store, state.gitExe, ids.slice(i, i + 100).map((id) => "snap-" + id)), { timeoutMs: 12e4, stdoutMaxBytes: 4096 });
        }
        for (const id of ids) state.snapshots.delete(id);
        await snaps.saveIndex(root, sessionId);
        purged += ids.length;
      } catch (error) {
        rt.recordError("recall purge session failed: " + String(error));
      }
    }
    if (purged > 0) console.error("recall purged snapshots of deleted session:", sessionId, purged);
    return purged;
  }
  async function sweepDeletedSessions() {
    const ids = /* @__PURE__ */ new Set();
    for (const s of state.snapshots.values()) {
      if (s && s.sessionId) ids.add(s.sessionId);
    }
    if (!ids.size) return;
    const query = ctx.get("sessionQuery");
    if (!query || typeof query.listSessions !== "function") return;
    let diskIds;
    try {
      diskIds = new Set((await query.listSessions() || []).map((r) => r && r.header && r.header.id).filter((v) => Boolean(v)));
    } catch (error) {
      return;
    }
    for (const id of ids) {
      if (sessions.get(id)) continue;
      if (diskIds.has(id)) continue;
      await purgeSession(id);
    }
  }
  async function enforceLimits() {
    const victimsMap = selectOverLimitVictims(state.snapshots, config.maxSnapshotsPerWorkspace);
    if (!victimsMap.size) return 0;
    let dropped = 0;
    for (const [root, victims] of victimsMap) {
      let store = state.stores.get(root) || null;
      if (!store) {
        try {
          store = await rt.resolveStore(root);
        } catch (error) {
          store = null;
        }
      }
      if (!store || !state.gitExe) continue;
      try {
        for (let i = 0; i < victims.length; i += 100) {
          await rt.runShell(S.purgeTagsScript(store, state.gitExe, victims.slice(i, i + 100).map((v) => "snap-" + v.id)), { timeoutMs: 12e4, stdoutMaxBytes: 4096 });
        }
        for (const v of victims) state.snapshots.delete(v.id);
        await snaps.saveIndex(root, null);
        dropped += victims.length;
        console.error("recall enforceLimits dropped " + victims.length + " oldest snapshots for: " + root + " (max " + config.maxSnapshotsPerWorkspace + ")");
      } catch (error) {
        rt.recordError("recall enforceLimits failed for " + root + ": " + String(error));
      }
    }
    return dropped;
  }
  async function enforceRetention() {
    const victimsMap = selectExpiredVictims(state.snapshots, config.retentionDays, Date.now());
    if (!victimsMap.size) return 0;
    let dropped = 0;
    for (const [root, victims] of victimsMap) {
      let store = state.stores.get(root) || null;
      if (!store) {
        try {
          store = await rt.resolveStore(root);
        } catch (error) {
          store = null;
        }
      }
      if (!store || !state.gitExe) continue;
      try {
        for (let i = 0; i < victims.length; i += 100) {
          await rt.runShell(S.purgeTagsScript(store, state.gitExe, victims.slice(i, i + 100).map((v) => "snap-" + v.id)), { timeoutMs: 12e4, stdoutMaxBytes: 4096 });
        }
        for (const v of victims) state.snapshots.delete(v.id);
        await snaps.saveIndex(root, null);
        dropped += victims.length;
        console.error("recall enforceRetention dropped " + victims.length + " expired snapshots for: " + root + " (retention " + config.retentionDays + "d)");
      } catch (error) {
        rt.recordError("recall enforceRetention failed for " + root + ": " + String(error));
      }
    }
    return dropped;
  }
  async function runGc(sessionId, force) {
    const root = await rt.resolveRoot(sessionId);
    if (!root) return false;
    const store = state.stores.get(root);
    if (!store || !state.gitExe) return false;
    const now = Date.now();
    const last = state.gcLastAt.get(store.git) || 0;
    const count = (state.gcCount.get(store.git) || 0) + 1;
    state.gcCount.set(store.git, count);
    if (!force && count < config.gcSnaps && now - last < config.gcHours * 36e5) return false;
    state.gcCount.set(store.git, 0);
    try {
      await sweepDeletedSessions();
      await enforceLimits();
      await enforceRetention();
      await rt.runShell(S.gcScript(store, state.gitExe), { timeoutMs: 6e5, stdoutMaxBytes: 4096 });
    } catch (error) {
      rt.recordError("recall maintenance failed: " + String(error));
    }
    state.gcLastAt.set(store.git, Date.now());
    return true;
  }
  async function runGcAll() {
    const stores = Array.from(new Set(Array.from(state.stores.values()).filter((s) => Boolean(s))));
    if (!stores.length || !state.gitExe) return false;
    try {
      await sweepDeletedSessions();
    } catch (error) {
      rt.recordError("recall sweep failed: " + String(error));
    }
    try {
      await enforceLimits();
    } catch (error) {
      rt.recordError("recall enforceLimits failed: " + String(error));
    }
    try {
      await enforceRetention();
    } catch (error) {
      rt.recordError("recall enforceRetention failed: " + String(error));
    }
    let done = 0;
    for (const store of stores) {
      try {
        await rt.runShell(S.gcScript(store, state.gitExe), { timeoutMs: 6e5, stdoutMaxBytes: 4096 });
        done++;
      } catch (error) {
        rt.recordError("recall gc failed for " + (store && store.git) + ": " + String(error));
      }
      state.gcLastAt.set(store.git, Date.now());
      state.gcCount.set(store.git, 0);
    }
    return true;
  }
  async function maybeMaintain(sessionId) {
    await runGc(sessionId, false);
  }
  return { maybeMaintain, runGc, runGcAll, enforceLimits, enforceRetention, sweepDeletedSessions };
}
export {
  createMaintenance,
  selectExpiredVictims,
  selectOverLimitVictims
};
