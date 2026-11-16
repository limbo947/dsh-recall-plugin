import Schema from "@deepseek-ai/schemastery";
const BASE_EXCLUDES = [
  ".git",
  "node_modules/",
  ".dsh-recall-snapshots/",
  "dsh-recall-snapshots/",
  "target/",
  "dist/",
  "build/",
  "out/",
  "coverage/",
  ".next/",
  ".nuxt/",
  ".output/",
  ".cache/",
  ".gradle/",
  "*.exe",
  "*.dll",
  "*.pdb",
  "*.so",
  "*.dylib",
  "*.msi",
  "*.zip",
  "*.7z",
  "*.rar",
  "*.tar",
  "*.tar.gz",
  "*.iso"
];
function withVolatile(field) {
  const schema = field;
  return typeof schema.volatile === "function" ? schema.volatile() : field;
}
const Config = Schema.object({
  gcSnaps: withVolatile(Schema.number().default(50).description("\u6BCF\u79EF\u7D2F\u591A\u5C11\u6761\u5FEB\u7167\u89E6\u53D1\u4E00\u6B21 git gc")),
  gcHours: withVolatile(Schema.number().default(24).description("\u8DDD\u4E0A\u6B21 gc \u8D85\u8FC7\u591A\u5C11\u5C0F\u65F6\u89E6\u53D1\uFF08\u4E0E\u6761\u6570\u5148\u5230\u5148\u89E6\u53D1\uFF09")),
  maxFileBytes: withVolatile(Schema.number().default(8388608).description("\u8D85\u8FC7\u8BE5\u5B57\u8282\u6570\u7684\u6587\u4EF6\u4E0D\u8FDB\u5FEB\u7167\u3001\u4E0D\u88AB\u56DE\u9000\u89E6\u78B0")),
  // issue #24：单文件上限挡不住「大量小文件」——下载目录 321 个 ≤100MB 文件
  // 合计 1.05GB 全部进快照。总量超限时**整体停用该工作区快照**而非截断：
  // 截断快照回退时，未纳入的文件会命中回退脚本的「当前有、目标无」删除侧。
  maxWorkspaceBytes: withVolatile(Schema.number().default(268435456).description("\u5355\u5DE5\u4F5C\u533A\u53EF\u7EB3\u5165\u5FEB\u7167\u7684\u6587\u4EF6\u603B\u91CF\u4E0A\u9650\uFF0C\u53E3\u5F84\u4E0E git add \u4E00\u81F4\uFF08\u542B .gitignore\uFF09\uFF0C\u8D85\u8FC7\u5373\u505C\u7528\u8BE5\u5DE5\u4F5C\u533A\u5FEB\u7167\uFF1B0 \u8868\u793A\u4E0D\u9650\u5236")),
  scanBudgetMs: withVolatile(Schema.number().default(1e4).description("\u5FEB\u7167\u524D\u7EDF\u8BA1\u7EB3\u5165\u603B\u91CF\u7684\u65F6\u95F4\u9884\u7B97\uFF0C\u8D85\u65F6\u5373\u505C\u7528\u672C\u6B21\u5FEB\u7167\uFF1B0 \u8868\u793A\u4E0D\u9650\u5236")),
  // issue #29：scanBudgetMs 只约束「统计阶段」，真正的耗时与写盘在 add。
  // 这条是整条快照脚本的兜底时限——慢盘或病态工作区上它才是把队列拖住的一段。
  snapshotBudgetMs: withVolatile(Schema.number().default(18e4).description("\u5355\u6B21\u5FEB\u7167\u7684\u603B\u65F6\u9650\uFF08\u6BEB\u79D2\uFF0C\u542B\u626B\u63CF\u4E0E\u5199\u5165\uFF09\uFF0C\u8D85\u65F6\u5373\u4E2D\u6B62\u672C\u6B21\u5FEB\u7167\u5E76\u8BB0\u5F55\uFF1B0 \u8868\u793A\u4E0D\u9650\u5236")),
  maxSnapshotsPerWorkspace: withVolatile(Schema.number().default(500).description("\u6BCF\u4E2A\u5DE5\u4F5C\u533A\u4FDD\u7559\u7684\u6700\u5927\u5FEB\u7167\u6570\uFF0C\u8D85\u9650\u5220\u9664\u6700\u65E7\u7684")),
  baseExcludes: withVolatile(Schema.array(Schema.string()).default(BASE_EXCLUDES).description("\u57FA\u7840\u6392\u9664\u8868\uFF08gitignore \u8BED\u6CD5\uFF0C\u4F18\u5148\u7EA7\u4F4E\u4E8E exclude.txt\uFF09")),
  refillDraft: withVolatile(Schema.boolean().default(true).description("\u64A4\u56DE\u540E\u628A\u88AB\u64A4\u56DE\u7684\u6D88\u606F\uFF08\u6587\u672C\u4E0E\u9644\u4EF6\uFF09\u56DE\u586B\u5230\u8F93\u5165\u6846")),
  snapshotEnabled: withVolatile(Schema.boolean().default(true).description("\u542F\u7528\u6D88\u606F\u5FEB\u7167\uFF08\u5173\u95ED\u540E\u4E0D\u518D\u65B0\u5EFA\uFF0C\u5DF2\u6709\u5FEB\u7167\u4ECD\u53EF\u64A4\u56DE\uFF09")),
  // issue #31：超大工作区（gitignore 过滤后仍上 GB）每条消息写一次全量对象
  // 成本过高。开启后仍登记撤回记录（按钮与对话回退照常），但跳过文件快照；
  // 按条落 files:false，老条目仍可完整回退文件
  messageOnly: withVolatile(Schema.boolean().default(false).description("\u53EA\u56DE\u9000\u6D88\u606F\uFF1A\u6BCF\u6761\u6D88\u606F\u53EA\u767B\u8BB0\u64A4\u56DE\u8BB0\u5F55\uFF0C\u4E0D\u5199\u6587\u4EF6\u5FEB\u7167\uFF08\u9002\u5408\u8D85\u5927\u5DE5\u4F5C\u533A\uFF09")),
  archiveOriginal: withVolatile(Schema.boolean().default(true).description("\u64A4\u56DE\u540E\u5F52\u6863\u539F\u4F1A\u8BDD\uFF08\u5173\u95ED\u540E\u539F\u4F1A\u8BDD\u4FDD\u7559\u5728\u5217\u8868\u4E2D\uFF09")),
  // issue #26：编辑提交后自动发出改后的文本。关闭则退化为「只回填输入框」，
  // 给「只想改稿、不立刻发」的用户留一条与撤回回填一致的出口
  editSubmitsImmediately: withVolatile(Schema.boolean().default(true).description("\u300C\u7F16\u8F91\u5E76\u91CD\u53D1\u300D\u63D0\u4EA4\u540E\u81EA\u52A8\u53D1\u51FA\u6539\u540E\u7684\u6D88\u606F\uFF08\u5173\u95ED\u5219\u53EA\u56DE\u586B\u8F93\u5165\u6846\uFF09")),
  retentionDays: withVolatile(Schema.number().default(0).description("\u6309\u5929\u6570\u4FDD\u7559\u5FEB\u7167\uFF0C\u8D85\u671F\u81EA\u52A8\u5220\u9664\uFF1B0 \u8868\u793A\u4E0D\u542F\u7528")),
  // issue #36：显式快照根。留空＝按 $DSH_HOME 派生（推荐）；沙箱下 home 彻底
  // 不可写时可指到任意可写位置。相对路径在运行时被忽略并告警（见 store.ts）。
  storeRoot: withVolatile(Schema.string().default("").description("\u5FEB\u7167\u5B58\u50A8\u6839\u76EE\u5F55\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u7559\u7A7A\uFF1D$DSH_HOME \u4E0B\u6309\u5DE5\u4F5C\u533A\u54C8\u5E0C\u5206\u76EE\u5F55\uFF09")),
  // A4：界面语言。union 三值而不是自由字符串——非法配置在加载时响亮失败
  //（合规清单 #3）；description 保持中文是 v1 明示限制：它由宿主官方设置
  // 表单在 host 侧渲染，插件无法本地化（自定义配置卡片不受影响，见 README）
  locale: withVolatile(Schema.union(["auto", "zh", "en"]).default("auto").description("\u754C\u9762\u8BED\u8A00\uFF1Aauto \u8DDF\u968F\u7CFB\u7EDF\uFF0C\u53EF\u9009 zh / en\uFF08\u4FDD\u5B58\u540E\u751F\u6548\uFF09"))
});
function isLegacySettingsFace(settings) {
  const svc = settings;
  if (!svc) return false;
  return typeof svc.installSection === "function" || typeof svc.register === "function";
}
const LEGACY_SETTINGS_NS = "dsh-recall";
function resolveSettingsNs(ctx, settings) {
  const entry = ctx && ctx.fiber ? ctx.fiber.entry : null;
  const entryIds = [];
  for (const candidate of [entry && entry.options ? entry.options.id : null, entry ? entry.id : null]) {
    if (typeof candidate === "string" && candidate && entryIds.indexOf(candidate) < 0) entryIds.push(candidate);
  }
  const known = describeNamespaces(settings);
  if (isLegacySettingsFace(settings)) {
    if (known.indexOf(LEGACY_SETTINGS_NS) >= 0) return LEGACY_SETTINGS_NS;
    for (const id of entryIds) {
      if (known.indexOf(id) >= 0) return id;
    }
    return LEGACY_SETTINGS_NS;
  }
  for (const id of entryIds) {
    if (known.indexOf(id) >= 0) return id;
  }
  const first = entryIds[0];
  return first !== void 0 ? first : null;
}
function describeNamespaces(settings) {
  const svc = settings;
  if (!svc || typeof svc.describe !== "function") return [];
  try {
    const list = svc.describe();
    const out = [];
    for (const row of Array.isArray(list) ? list : []) {
      const ns = row && row.ns;
      if (typeof ns === "string" && ns) out.push(ns);
    }
    return out;
  } catch (error) {
    return [];
  }
}
function unwrapConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of Object.keys(source)) out[key] = unwrapOnce(source[key]);
  return out;
}
function unwrapOnce(value) {
  if (isVolatileRef(value)) return value.get();
  if (Array.isArray(value)) return value.map((item) => isVolatileRef(item) ? item.get() : item);
  if (isPlainObject(value)) {
    const out = {};
    const entries = value;
    for (const key of Object.keys(entries)) {
      const item = entries[key];
      out[key] = isVolatileRef(item) ? item.get() : item;
    }
    return out;
  }
  return value;
}
function isVolatileRef(value) {
  return Boolean(value) && typeof value.get === "function";
}
function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
const DEFAULTS = {
  gcSnaps: 50,
  gcHours: 24,
  maxFileBytes: 8388608,
  maxWorkspaceBytes: 268435456,
  scanBudgetMs: 1e4,
  snapshotBudgetMs: 18e4,
  maxSnapshotsPerWorkspace: 500,
  baseExcludes: BASE_EXCLUDES,
  refillDraft: true,
  snapshotEnabled: true,
  messageOnly: false,
  archiveOriginal: true,
  editSubmitsImmediately: true,
  retentionDays: 0,
  locale: "auto",
  storeRoot: ""
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
  const maxFileBytes = pickNumber(cfg.maxFileBytes, 8388608, 1024);
  const maxWorkspaceBytes = pickNumber(cfg.maxWorkspaceBytes, 268435456, 0);
  const scanBudgetMs = pickNumber(cfg.scanBudgetMs, 1e4, 0);
  const snapshotBudgetMs = pickNumber(cfg.snapshotBudgetMs, 18e4, 0);
  const rawMax = typeof cfg.maxSnapshotsPerWorkspace === "number" ? cfg.maxSnapshotsPerWorkspace : parseInt(String(cfg.maxSnapshotsPerWorkspace == null ? "" : cfg.maxSnapshotsPerWorkspace), 10);
  const maxSnapshotsPerWorkspace = Number.isFinite(rawMax) ? Math.max(0, rawMax) : 500;
  const baseExcludes = Array.isArray(cfg.baseExcludes) && cfg.baseExcludes.length ? cfg.baseExcludes.filter((p) => typeof p === "string" && p.trim()) : BASE_EXCLUDES;
  const refillDraft = typeof cfg.refillDraft === "boolean" ? cfg.refillDraft : true;
  const snapshotEnabled = typeof cfg.snapshotEnabled === "boolean" ? cfg.snapshotEnabled : true;
  const messageOnly = cfg.messageOnly === true;
  const archiveOriginal = typeof cfg.archiveOriginal === "boolean" ? cfg.archiveOriginal : true;
  const editSubmitsImmediately = cfg.editSubmitsImmediately !== false;
  const rawDays = typeof cfg.retentionDays === "number" ? cfg.retentionDays : parseInt(String(cfg.retentionDays == null ? "" : cfg.retentionDays), 10);
  const retentionDays = Number.isFinite(rawDays) ? Math.max(0, rawDays) : 0;
  const locale = cfg.locale === "zh" || cfg.locale === "en" ? cfg.locale : "auto";
  const storeRoot = (() => {
    const raw2 = typeof cfg.storeRoot === "string" ? cfg.storeRoot.trim() : "";
    if (!raw2) return "";
    if (/^[A-Za-z]:[\\/]*$/.test(raw2)) return raw2.slice(0, 2) + "\\";
    const trimmed = raw2.replace(/[\\/]+$/, "");
    return trimmed || raw2.slice(0, 1);
  })();
  return { gcSnaps, gcHours, maxFileBytes, maxWorkspaceBytes, scanBudgetMs, snapshotBudgetMs, maxSnapshotsPerWorkspace, baseExcludes, refillDraft, snapshotEnabled, messageOnly, archiveOriginal, editSubmitsImmediately, retentionDays, locale, storeRoot };
}
export {
  Config,
  DEFAULTS,
  LEGACY_SETTINGS_NS,
  createConfig,
  isLegacySettingsFace,
  resolveSettingsNs,
  unwrapConfig,
  withVolatile
};
