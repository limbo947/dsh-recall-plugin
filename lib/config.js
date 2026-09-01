import Schema from "@deepseek-ai/schemastery";
const Config = Schema.object({
  gcSnaps: Schema.number().default(50).description("\u6BCF\u79EF\u7D2F\u591A\u5C11\u6761\u5FEB\u7167\u89E6\u53D1\u4E00\u6B21 git gc"),
  gcHours: Schema.number().default(24).description("\u8DDD\u4E0A\u6B21 gc \u8D85\u8FC7\u591A\u5C11\u5C0F\u65F6\u89E6\u53D1\uFF08\u4E0E\u6761\u6570\u5148\u5230\u5148\u89E6\u53D1\uFF09"),
  maxFileBytes: Schema.number().default(104857600).description("\u8D85\u8FC7\u8BE5\u5B57\u8282\u6570\u7684\u6587\u4EF6\u4E0D\u8FDB\u5FEB\u7167\u3001\u4E0D\u88AB\u56DE\u9000\u89E6\u78B0"),
  maxSnapshotsPerWorkspace: Schema.number().default(500).description("\u6BCF\u4E2A\u5DE5\u4F5C\u533A\u4FDD\u7559\u7684\u6700\u5927\u5FEB\u7167\u6570\uFF0C\u8D85\u9650\u5220\u9664\u6700\u65E7\u7684"),
  // 排除表必须同时覆盖两种存储目录名：降级存储是项目内 .dsh-recall-snapshots/，
  // 而 home 存储目录名是 dsh-recall-snapshots/（无点）——工作区 root 恰为
  // HOME 时（容器 root=/root 等）它落在工作区内，漏排除会让 git add -A
  // 把影子仓库自己吞进去、快照全部失败（issue #6）
  baseExcludes: Schema.array(Schema.string()).default([".git", "node_modules/", ".dsh-recall-snapshots/", "dsh-recall-snapshots/"]).description("\u57FA\u7840\u6392\u9664\u8868\uFF08gitignore \u8BED\u6CD5\uFF0C\u4F18\u5148\u7EA7\u4F4E\u4E8E exclude.txt\uFF09"),
  refillDraft: Schema.boolean().default(true).description("\u64A4\u56DE\u540E\u628A\u88AB\u64A4\u56DE\u7684\u6D88\u606F\u6587\u672C\u56DE\u586B\u5230\u8F93\u5165\u6846"),
  snapshotEnabled: Schema.boolean().default(true).description("\u542F\u7528\u6D88\u606F\u5FEB\u7167\uFF08\u5173\u95ED\u540E\u4E0D\u518D\u65B0\u5EFA\uFF0C\u5DF2\u6709\u5FEB\u7167\u4ECD\u53EF\u64A4\u56DE\uFF09"),
  archiveOriginal: Schema.boolean().default(true).description("\u64A4\u56DE\u540E\u5F52\u6863\u539F\u4F1A\u8BDD\uFF08\u5173\u95ED\u540E\u539F\u4F1A\u8BDD\u4FDD\u7559\u5728\u5217\u8868\u4E2D\uFF09"),
  retentionDays: Schema.number().default(0).description("\u6309\u5929\u6570\u4FDD\u7559\u5FEB\u7167\uFF0C\u8D85\u671F\u81EA\u52A8\u5220\u9664\uFF1B0 \u8868\u793A\u4E0D\u542F\u7528")
});
const BASE_EXCLUDES = [".git", "node_modules/", ".dsh-recall-snapshots/", "dsh-recall-snapshots/"];
const DEFAULTS = {
  gcSnaps: 50,
  gcHours: 24,
  maxFileBytes: 104857600,
  maxSnapshotsPerWorkspace: 500,
  baseExcludes: BASE_EXCLUDES,
  refillDraft: true,
  snapshotEnabled: true,
  archiveOriginal: true,
  retentionDays: 0
};
function createConfig(raw) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  function pickNumber(value, fallback, min) {
    const n = typeof value === "number" ? value : parseInt(String(value == null ? "" : value), 10);
    if (!Number.isFinite(n) || n < min) return fallback;
    return n;
  }
  const gcSnaps = pickNumber(process.env.DSH_RECALL_GC_SNAPS, pickNumber(cfg.gcSnaps, 50, 1), 1);
  const gcHours = pickNumber(process.env.DSH_RECALL_GC_HOURS, pickNumber(cfg.gcHours, 24, 1), 1);
  const maxFileBytes = pickNumber(cfg.maxFileBytes, 104857600, 1024);
  const rawMax = typeof cfg.maxSnapshotsPerWorkspace === "number" ? cfg.maxSnapshotsPerWorkspace : parseInt(String(cfg.maxSnapshotsPerWorkspace == null ? "" : cfg.maxSnapshotsPerWorkspace), 10);
  const maxSnapshotsPerWorkspace = Number.isFinite(rawMax) ? Math.max(0, rawMax) : 500;
  const baseExcludes = Array.isArray(cfg.baseExcludes) && cfg.baseExcludes.length ? cfg.baseExcludes.filter((p) => typeof p === "string" && p.trim()) : BASE_EXCLUDES;
  const refillDraft = typeof cfg.refillDraft === "boolean" ? cfg.refillDraft : true;
  const snapshotEnabled = typeof cfg.snapshotEnabled === "boolean" ? cfg.snapshotEnabled : true;
  const archiveOriginal = typeof cfg.archiveOriginal === "boolean" ? cfg.archiveOriginal : true;
  const rawDays = typeof cfg.retentionDays === "number" ? cfg.retentionDays : parseInt(String(cfg.retentionDays == null ? "" : cfg.retentionDays), 10);
  const retentionDays = Number.isFinite(rawDays) ? Math.max(0, rawDays) : 0;
  return { gcSnaps, gcHours, maxFileBytes, maxSnapshotsPerWorkspace, baseExcludes, refillDraft, snapshotEnabled, archiveOriginal, retentionDays };
}
export {
  Config,
  DEFAULTS,
  createConfig
};
