import os from "node:os";
import crypto from "node:crypto";
import * as pwshScripts from "./scripts.pwsh.js";
import * as posixScripts from "./scripts.posix.js";
import { classifyEnvError } from "./diagnostics.js";
const HOME_RETRY_MS = 3e5;
const ERROR_BUFFER_MAX = 20;
function selectPosixHomeBase({ probed, envHome, homedir }) {
  if (probed) return { base: probed, third: false };
  if (envHome) return { base: envHome, third: false };
  return { base: homedir + "/.dsh", third: true };
}
async function resolvePosixHomeBase(deps, inputs) {
  const { probed, envHome, homedir } = inputs;
  const sel = selectPosixHomeBase({ probed, envHome, homedir });
  if (!sel.third) return sel.base;
  try {
    const out = String(await deps.runShell(deps.scripts.legacyHomeMigrateScript(homedir), { timeoutMs: 3e5, stdoutMaxBytes: 4096 })).trim();
    if (out === "MIGRATE_OK" || out === "OLD_ABSENT") return sel.base;
    deps.recordError(
      out === "BOTH_PRESENT" ? "recall home store \u65B0\u65E7\u5BB9\u5668\u5E76\u5B58\uFF08" + homedir + "/dsh-recall-snapshots \u4E0E " + homedir + "/.dsh/dsh-recall-snapshots\uFF09\uFF0C\u6CBF\u7528\u65E7\u4F4D\uFF0C\u672A\u505A\u4EFB\u4F55\u6539\u52A8" : "recall \u65E7\u5FEB\u7167\u5BB9\u5668\u8FC1\u79FB\u5931\u8D25\uFF08MIGRATE_FAIL\uFF09\uFF0C\u6CBF\u7528\u65E7\u4F4D " + homedir + "/dsh-recall-snapshots"
    );
    return homedir;
  } catch (error) {
    deps.recordError("recall \u65E7\u5FEB\u7167\u5BB9\u5668\u8FC1\u79FB\u63A2\u6D4B\u5931\u8D25\uFF0C\u6CBF\u7528\u65E7\u4F4D: " + String(error));
    return homedir;
  }
}
function parseCleanupResult(out) {
  const m = String(out || "").match(/CLEANUP_OTHER_INSTANCE\s+(\d+)/);
  if (m) return { otherPid: parseInt(m[1], 10), skippedFresh: false };
  if (String(out || "").indexOf("CLEANUP_SKIPPED_FRESH_LOCK") >= 0) return { otherPid: null, skippedFresh: true };
  return { otherPid: null, skippedFresh: false };
}
function isTmpConsumedError(error, basename) {
  const s = String(error || "");
  if (!basename || s.indexOf(basename) < 0) return false;
  return /No such file/i.test(s) || /does not exist/i.test(s) || /cannot find path/i.test(s);
}
function createRuntime(ctx, config) {
  const shell = ctx.shell;
  const sessions = ctx.sessions;
  const isWin = process.platform === "win32";
  const SEP = isWin ? "\\" : "/";
  const scripts = isWin ? pwshScripts : posixScripts;
  const state = {
    roots: /* @__PURE__ */ new Map(),
    stores: /* @__PURE__ */ new Map(),
    snapshots: /* @__PURE__ */ new Map(),
    queue: Promise.resolve(),
    indexLoaded: /* @__PURE__ */ new Set(),
    // PF-5 索引终态三/四档标记（rebuildOrphans 守卫的数据源）：
    // - indexHealthy：磁盘索引解析成功且在场（loadIndex 正常载入分支）——
    //   rebuildOrphans 对 healthy 且条目非空的 root 整体跳过（省 1+N 条进程）
    // - indexTruncated：读截断（F-G3，内存是残缺视图）——rebuildOrphans
    //   必须跳过：否则全部 tag 被判孤儿、用残缺孤儿集覆盖完好的大索引
    //   （feedback 全丢、数万条索引按 win32 分块写下是数百条进程的灾难）
    // empty（无索引文件）/quarantined（损坏隔离）不标记 → rebuild 照跑，
    // 自愈链路完整
    indexHealthy: /* @__PURE__ */ new Set(),
    indexTruncated: /* @__PURE__ */ new Set(),
    gitReady: /* @__PURE__ */ new Set(),
    cutSeqCache: /* @__PURE__ */ new Map(),
    homeRetryAt: /* @__PURE__ */ new Map(),
    gcLastAt: /* @__PURE__ */ new Map(),
    gcCount: /* @__PURE__ */ new Map(),
    gitExe: null,
    posixHomeBase: null,
    homeContainer: null,
    errors: [],
    // 逐消息的快照反馈（issue #7 失败可见性）：失败 {failed,error} 或
    // fail-open 跳过 {skipped:[...]}，由 snapshot-info 端点下发给客户端
    // 弹 toast。放共享 state 而非 snapshots.js 闭包：端点在 index.js，
    // 与索引/根缓存同层取用。
    snapFeedback: /* @__PURE__ */ new Map()
  };
  function recordError(text) {
    const message = String(text);
    const last = state.errors[state.errors.length - 1];
    if (last && last.message === message) {
      last.time = Date.now();
      last.count += 1;
      return;
    }
    const rec = { time: Date.now(), message, count: 1, kind: classifyEnvError(message) };
    state.errors.push(rec);
    if (state.errors.length > ERROR_BUFFER_MAX) state.errors.splice(0, state.errors.length - ERROR_BUFFER_MAX);
    console.error(message);
  }
  ;
  (function checkScriptParity() {
    const SKIP = /* @__PURE__ */ new Set(["homeDirScript", "probeHomeScript", "legacyHomeMigrateScript"]);
    const pwshKeys = Object.keys(pwshScripts).filter((k) => !SKIP.has(k) && typeof pwshScripts[k] === "function");
    const posixKeys = Object.keys(posixScripts).filter((k) => !SKIP.has(k) && typeof posixScripts[k] === "function");
    const missing = pwshKeys.filter((k) => posixKeys.indexOf(k) < 0);
    if (missing.length) recordError("recall script parity: posix \u7F3A\u5C11\u5BFC\u51FA " + missing.join(", "));
  })();
  async function runShellMeta(command, opts) {
    const sp = ctx.get("sandboxPolicy");
    const spec = shell.resolve({
      // 编码前导：pwsh 侧统一 UTF-8 输出（中文机器 GBK 代码页不再乱码）；
      // bash 侧 LC_ALL=C 确定序。各模板自带，这里统一前置注入。
      command: scripts.UTF8_PRELUDE + "\n" + command,
      timeoutMs: opts && opts.timeoutMs || 3e5,
      stdoutMaxBytes: opts && opts.stdoutMaxBytes || 4194304,
      // stdin 是官方 ShellExecRequest 契约字段（bash-local/pwsh 均实现），
      // POSIX 侧用它传 index.json 全文，绕开 argv 长度上限
      ...opts && opts.stdin !== void 0 ? { stdin: opts.stdin } : {},
      sandboxPolicy: { mode: "danger-full-access", workspaceRoot: sp && sp.workspaceRoot || process.cwd() }
    });
    const res = await shell.run(spec);
    const out = res && res.stdout && res.stdout.text || "";
    if (res && res.exitCode !== 0) {
      await cleanupAfterGitFailure(command);
      const err = (res && res.stderr && res.stderr.text || "").trim() || "exit " + String(res.exitCode);
      throw new Error(err.slice(0, 1500));
    }
    return {
      text: out,
      truncated: Boolean(res && res.stdout && res.stdout.truncated)
    };
  }
  async function runShell(command, opts) {
    return (await runShellMeta(command, opts)).text;
  }
  function extractGitDir(command) {
    const m = String(command).match(/(?:^|\n)[ \t]*(?:\$g|g)[ \t]*=[ \t]*'([^']+)/);
    return m ? m[1] : null;
  }
  async function cleanupAfterGitFailure(command) {
    if (!command || String(command).indexOf("RECALL_CLEANUP") >= 0) return;
    const gitDir = extractGitDir(command);
    if (!gitDir) return;
    try {
      const out = await runShell(scripts.killOrphansScript(gitDir), { timeoutMs: 6e4, stdoutMaxBytes: 4096 });
      const r = parseCleanupResult(out);
      if (r.otherPid !== null) recordError("recall \u68C0\u6D4B\u5230\u53E6\u4E00\u4E2A DSH \u5B9E\u4F8B\uFF08PID " + r.otherPid + "\uFF09\u6B63\u5728\u4F7F\u7528\u6B64\u5FEB\u7167\u5E93\uFF0C\u5931\u8D25\u6E05\u626B\u5DF2\u8BA9\u8DEF\uFF1A\u672A\u6740\u8FDB\u7A0B\u3001\u672A\u52A8\u9501");
      else if (r.skippedFresh) recordError("recall \u68C0\u6D4B\u5230 5 \u5206\u949F\u5185\u7684\u65B0\u9501\u6587\u4EF6\uFF0C\u7591\u4F3C git \u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u5931\u8D25\u6E05\u626B\u5DF2\u8BA9\u8DEF\uFF08\u9501\u9648\u65E7\u540E\u4F1A\u81EA\u52A8\u6E05\u7406\uFF09");
    } catch (error) {
    }
  }
  async function resolveRoot(sessionId) {
    const key = sessionId ? String(sessionId) : "fallback";
    const cached = state.roots.get(key);
    if (cached) return cached;
    let root = null;
    let authoritative = false;
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session && session.header && session.header.cwd) {
        root = session.header.cwd;
        authoritative = true;
      }
    }
    if (!root && sessionId) {
      try {
        const query = ctx.get("sessionQuery");
        if (query && typeof query.listSessions === "function") {
          const records = await query.listSessions();
          const rec = (records || []).find((r) => r && r.header && r.header.id === sessionId);
          if (rec && rec.header && rec.header.cwd) {
            root = rec.header.cwd;
            authoritative = true;
          }
        }
      } catch (error) {
      }
    }
    if (!root) {
      const sp = ctx.get("sandboxPolicy");
      if (sp && sp.workspaceRoot) root = sp.workspaceRoot;
    }
    if (root) {
      root = root.replace(/[\\/]+$/, "") || (isWin ? root : "/");
      if (isWin && root.length === 2) root += "\\";
      if (authoritative) state.roots.set(key, root);
    }
    return root;
  }
  async function resolveGit() {
    if (state.gitExe !== null) return state.gitExe;
    try {
      const path = scripts.stripBom(await runShell(scripts.resolveGitScript(), { stdoutMaxBytes: 4096 })).trim();
      state.gitExe = path || "";
    } catch (error) {
      state.gitExe = "";
    }
    return state.gitExe;
  }
  async function homeDirForWin(root) {
    const envHome = process.env && process.env.DSH_HOME || "";
    const text = scripts.stripBom(await runShell(scripts.homeDirScript(root, envHome), { stdoutMaxBytes: 4096 })).trim();
    if (!text) return null;
    if (/^\\\\/.test(text)) return "\\\\" + text.slice(2).replace(/\\{2,}/g, "\\");
    return text.replace(/\\{2,}/g, "\\");
  }
  async function posixHomeBaseResolve() {
    if (state.posixHomeBase === null) {
      let probed = "";
      try {
        probed = (await runShell(scripts.probeHomeScript(), { stdoutMaxBytes: 4096 })).trim();
      } catch (error) {
        probed = "";
      }
      state.posixHomeBase = await resolvePosixHomeBase(
        { runShell, scripts, recordError },
        { probed, envHome: process.env && process.env.DSH_HOME || "", homedir: os.homedir() }
      );
    }
    return state.posixHomeBase;
  }
  async function homeDirForPosix(root) {
    const base = await posixHomeBaseResolve();
    const hash = crypto.createHash("sha256").update(root, "utf8").digest("hex");
    return base.replace(/\/+$/, "") + "/dsh-recall-snapshots/" + hash;
  }
  async function homeDirFor(root) {
    return isWin ? homeDirForWin(root) : homeDirForPosix(root);
  }
  async function resolveHomeContainer() {
    if (state.homeContainer) return state.homeContainer;
    let container = null;
    try {
      const probeRoot = Array.from(state.roots.values())[0] || process.cwd();
      const homeDir = await homeDirFor(probeRoot);
      if (homeDir) container = homeDir.slice(0, homeDir.length - 65);
    } catch (error) {
      container = null;
    }
    if (container) state.homeContainer = container;
    return container;
  }
  function makeStore(dir, home) {
    const excludeFile = home ? dir.slice(0, dir.lastIndexOf(SEP)) + SEP + "exclude.txt" : dir + SEP + "exclude.txt";
    return {
      dir,
      repo: dir + SEP + "git",
      git: dir + SEP + "git" + SEP + ".git",
      home,
      excludeFile,
      get maxFileBytes() {
        return config.maxFileBytes;
      }
    };
  }
  function storeFromDir(dir, home) {
    return makeStore(dir, Boolean(home));
  }
  function persistRootHint(store, root) {
    writeTextViaShell(store.dir + SEP + "root.txt", root).catch(() => {
    });
  }
  async function resolveStore(root) {
    const cached = state.stores.get(root);
    if (cached) return cached;
    let homeDir = null;
    try {
      homeDir = await homeDirFor(root);
    } catch (error) {
      homeDir = null;
    }
    if (homeDir) {
      try {
        await runShell(scripts.mkdirScript(homeDir), { stdoutMaxBytes: 4096 });
        const store2 = makeStore(homeDir, true);
        state.stores.set(root, store2);
        persistRootHint(store2, root);
        return store2;
      } catch (error) {
        recordError("recall home store unavailable, falling back to workspace: " + String(error));
      }
    }
    const fallback = root + SEP + ".dsh-recall-snapshots";
    await runShell(scripts.mkdirScript(fallback), { stdoutMaxBytes: 4096 });
    const store = makeStore(fallback, false);
    state.stores.set(root, store);
    persistRootHint(store, root);
    return store;
  }
  async function tryUpgradeToHome(root) {
    const store = state.stores.get(root);
    if (!store || store.home) return store || null;
    const now = Date.now();
    const last = state.homeRetryAt.get(root) || 0;
    if (now - last < HOME_RETRY_MS) return store;
    state.homeRetryAt.set(root, now);
    let homeDir = null;
    try {
      homeDir = await homeDirFor(root);
    } catch (error) {
      homeDir = null;
    }
    if (!homeDir) return store;
    try {
      await runShell(scripts.mkdirScript(homeDir), { stdoutMaxBytes: 4096 });
      await runShell(scripts.migrateScript(store.dir, homeDir), { timeoutMs: 3e5, stdoutMaxBytes: 4096 });
      const upgraded = makeStore(homeDir, true);
      state.stores.set(root, upgraded);
      persistRootHint(upgraded, root);
      state.gitReady.delete(store.git);
      state.gcLastAt.delete(store.git);
      state.gcCount.delete(store.git);
      console.error("recall store upgraded to home:", root);
      return upgraded;
    } catch (error) {
      recordError("recall home upgrade failed: " + String(error));
      return store;
    }
  }
  async function renameTmpQuietly(tmp, file) {
    try {
      await runShell(scripts.renameFileCmd(tmp, file), { stdoutMaxBytes: 4096 });
    } catch (error) {
      const basename = tmp.slice(tmp.lastIndexOf(SEP) + 1);
      if (isTmpConsumedError(error, basename)) {
        console.error("recall writeTextViaShell: " + basename + " \u5DF2\u88AB\u5E76\u53D1\u5199\u8005 rename \u6D88\u8D39\uFF0C\u89C6\u540C\u6210\u529F");
        return;
      }
      throw error;
    }
  }
  async function writeTextViaShell(file, text) {
    const body = String(text == null ? "" : text);
    const tmp = file + ".tmp";
    await runShell(scripts.fileWriteStdinCmd(tmp), { stdin: body, stdoutMaxBytes: 4096 });
    await renameTmpQuietly(tmp, file);
  }
  async function ensureGit(root, store) {
    if (state.gitReady.has(store.git)) return { ok: true };
    const gitExe = await resolveGit();
    if (!gitExe) {
      const error = "\u672A\u68C0\u6D4B\u5230 git CLI\uFF0C\u5FEB\u7167\u4E0D\u53EF\u7528";
      recordError("recall ensureGit: " + error + "\uFF1A\u8BF7\u5B89\u88C5 git \u6216\u68C0\u67E5\u5176\u662F\u5426\u5728 PATH \u4E2D");
      return { ok: false, error };
    }
    try {
      const out = scripts.stripBom(await runShell(scripts.ensureGitScript(store, gitExe, config.baseExcludes), { stdoutMaxBytes: 4096 }));
      state.gitReady.add(store.git);
      const m = out.match(/GIT_OK\s+(\d+)/);
      state.gcLastAt.set(store.git, m ? parseInt(m[1], 10) * 1e3 : Date.now());
      return { ok: true };
    } catch (error) {
      recordError("recall ensureGit failed: " + String(error));
      return { ok: false, error: String(error) };
    }
  }
  const legacyCleaned = /* @__PURE__ */ new Set();
  function cleanupLegacy(root) {
    const store = state.stores.get(root);
    if (!store || !store.home) return;
    if (legacyCleaned.has(root)) return;
    legacyCleaned.add(root);
    runShell(scripts.legacyRmScript(root + SEP + ".dsh-recall-snapshots"), { timeoutMs: 12e4, stdoutMaxBytes: 4096 }).catch(() => {
    });
  }
  return { state, isWin, scripts, recordError, runShell, runShellMeta, writeTextViaShell, resolveRoot, resolveGit, homeDirFor, resolveHomeContainer, resolveStore, storeFromDir, tryUpgradeToHome, ensureGit, cleanupLegacy, cleanupAfterGitFailure };
}
export {
  createRuntime,
  isTmpConsumedError,
  parseCleanupResult,
  resolvePosixHomeBase,
  selectPosixHomeBase
};
