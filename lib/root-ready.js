import { buildArtifactRootSegment } from "./exclude-patterns.js";
function createEnsureRootReady({ rt, snaps, journal, cfg }) {
  const ready = /* @__PURE__ */ new Map();
  return function ensureRootReady(root, sessionId) {
    if (buildArtifactRootSegment(root, cfg.baseExcludes, rt.isWin)) return Promise.resolve(null);
    const cached = ready.get(root);
    if (cached) return cached;
    const task = (async () => {
      let store = await rt.resolveStore(root);
      store = await rt.tryUpgradeToHome(root);
      const g = await rt.ensureGit(root, store);
      if (g.store) store = g.store;
      await snaps.loadIndex(root, sessionId);
      await snaps.rebuildOrphans(root, sessionId || "");
      if (await snaps.guardStoreFormat(store)) await journal.recover(store);
      rt.cleanupLegacy(root);
      return store;
    })();
    ready.set(root, task);
    task.catch(() => {
      ready.delete(root);
    });
    return task;
  };
}
export {
  createEnsureRootReady
};
