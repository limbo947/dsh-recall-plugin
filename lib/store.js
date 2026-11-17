import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn as childSpawn } from "node:child_process";
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
  if (m) return { otherPid: parseInt(m[1] ?? "", 10), skippedFresh: false };
  if (String(out || "").indexOf("CLEANUP_SKIPPED_FRESH_LOCK") >= 0) return { otherPid: null, skippedFresh: true };
  return { otherPid: null, skippedFresh: false };
}
function isTmpConsumedError(error, basename) {
  const s = String(error || "");
  if (!basename || s.indexOf(basename) < 0) return false;
  return /No such file/i.test(s) || /does not exist/i.test(s) || /cannot find path/i.test(s);
}
const SHELL_PROBE_SENTINEL = "RCL_DIALECT_PROBE_9f4a2e";
const SHELL_PROBE_COMMAND = "Write-Output " + SHELL_PROBE_SENTINEL;
function judgeShellDialect(res) {
  if (!res || res.exitCode !== 0) return "bash";
  const text = res.stdout && res.stdout.text || "";
  return text.indexOf(SHELL_PROBE_SENTINEL) >= 0 ? "pwsh" : "bash";
}
const SENSITIVE_ENV = /KEY|PASSWORD|SECRET|TOKEN/i;
function isAbsoluteDirPath(value, win) {
  const s = String(value == null ? "" : value);
  if (!s) return false;
  if (win) return /^[A-Za-z]:[\\/]/.test(s) || s.startsWith("\\\\");
  return s.startsWith("/");
}
function hashRootPath(root) {
  return crypto.createHash("sha256").update(String(root), "utf8").digest("hex");
}
function parseStoreProbe(text) {
  let writable = false;
  let hasRepo = false;
  for (const raw of String(text == null ? "" : text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "PROBE WRITABLE") writable = true;
    else if (line === "REPO YES") hasRepo = true;
  }
  return { writable, hasRepo };
}
const STDERR_KEEP_BYTES = 65536;
function scrubChildEnv(env) {
  const out = {};
  for (const key of Object.keys(env)) {
    const value = env[key];
    if (value === void 0) continue;
    if (SENSITIVE_ENV.test(key) || key.toUpperCase().indexOf("DSH_") === 0) continue;
    out[key] = value;
  }
  out.NO_COLOR = "1";
  out.PAGER = "cat";
  out.GIT_PAGER = "cat";
  return out;
}
function collectStdout(chunks, maxBytes) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (total <= maxBytes) return { text: Buffer.concat(chunks).toString("utf8"), truncated: false };
  const all = Buffer.concat(chunks);
  return { text: all.subarray(all.length - maxBytes).toString("utf8"), truncated: true };
}
function directPwshPath(env) {
  return (env.SystemRoot || env.windir || "C:\\Windows") + "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
}
async function runViaSpawn(spawn, req) {
  const child = spawn(directPwshPath(process.env), ["-NoProfile", "-NonInteractive", "-Command", req.command], {
    cwd: req.cwd,
    env: scrubChildEnv(process.env),
    windowsHide: true
  });
  return await new Promise((resolve, reject) => {
    const sink = (maxBytes) => {
      const chunks = [];
      let total = 0;
      return {
        push(chunk) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
          chunks.push(buf);
          total += buf.length;
          while (chunks.length > 1) {
            const head = chunks[0];
            if (!head || total - head.length <= maxBytes) break;
            total -= head.length;
            chunks.shift();
          }
        },
        take() {
          return collectStdout(chunks, maxBytes);
        }
      };
    };
    const outSink = sink(req.stdoutMaxBytes);
    const errSink = sink(STDERR_KEEP_BYTES);
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch (error) {
      }
    }, Math.max(1, req.timeoutMs));
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = outSink.take();
      resolve({ text: stdout.text, truncated: stdout.truncated, exitCode: code, stderr: errSink.take().text, timedOut });
    };
    if (child.stdout) child.stdout.on("data", (chunk) => outSink.push(chunk));
    if (child.stderr) child.stderr.on("data", (chunk) => errSink.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => finish(code === void 0 ? null : code));
    if (child.stdin) {
      child.stdin.on("error", () => {
      });
      child.stdin.end(Buffer.from(req.stdin === void 0 ? "" : req.stdin, "utf8"));
    }
  });
}
async function runViaExecutor(shell, spec) {
  if (typeof shell.run === "function") return await shell.run(spec);
  if (typeof shell.execute === "function") {
    const handle = await shell.execute(spec);
    return await handle.result();
  }
  throw new Error("recall: ctx.shell \u672A\u63D0\u4F9B run \u4E5F\u672A\u63D0\u4F9B execute\uFF0C\u65E0\u6CD5\u6267\u884C\u547D\u4EE4\uFF08dsh \u6267\u884C\u63A5\u7F1D\u4E0D\u517C\u5BB9\uFF09");
}
function createRuntime(ctx, config, deps) {
  const shell = ctx.shell;
  const sessions = ctx.sessions;
  const spawn = deps && deps.spawn || childSpawn;
  const isWin = process.platform === "win32";
  const SEP = isWin ? "\\" : "/";
  const scripts = isWin ? pwshScripts : posixScripts;
  const state = {
    roots: /* @__PURE__ */ new Map(),
    stores: /* @__PURE__ */ new Map(),
    snapshots: /* @__PURE__ */ new Map(),
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
    // 空串＝按 $DSH_HOME 派生；与 config.storeRoot 比对即可发现热更
    storeBase: "",
    // win32 方言探针缓存（issue #15）：判定结果 + in-flight promise（并发首调
    // 只跑一次探针）；POSIX 不探测，两字段恒为 null
    shellDialect: null,
    shellDialectProbe: null,
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
  function resolveShellDialect() {
    if (state.shellDialect) return Promise.resolve(state.shellDialect);
    if (!state.shellDialectProbe) {
      state.shellDialectProbe = (async () => {
        let res = null;
        try {
          const sp = ctx.get("sandboxPolicy");
          res = await runViaExecutor(shell, shell.resolve({
            command: SHELL_PROBE_COMMAND,
            timeoutMs: 3e4,
            stdoutMaxBytes: 4096,
            sandboxPolicy: { mode: "danger-full-access", workspaceRoot: sp && sp.workspaceRoot || process.cwd() }
          }));
        } catch (error) {
          res = null;
        }
        const dialect = judgeShellDialect(res);
        state.shellDialect = dialect;
        console.error("recall shell dialect probe: " + dialect + (dialect === "bash" ? "\uFF08ctx.shell \u975E pwsh\uFF0C\u6539\u7528\u76F4\u8FDE powershell.exe \u901A\u9053\uFF09" : ""));
        return dialect;
      })();
    }
    return state.shellDialectProbe;
  }
  async function shellDialectFor(command) {
    if (command.indexOf("RECALL_CLEANUP") >= 0) return state.shellDialect || "pwsh";
    return await resolveShellDialect();
  }
  async function throwShellFailure(command, stderr, exitCode) {
    await cleanupAfterGitFailure(command);
    const detail = String(stderr || "").trim() || "exit " + String(exitCode);
    throw new Error(detail.slice(0, 1500));
  }
  async function runShellDirect(command, req) {
    const res = await runViaSpawn(spawn, req);
    if (res.timedOut) {
      await throwShellFailure(command, res.stderr + "\n\u76F4\u8FDE powershell.exe \u8D85\u65F6\uFF08" + String(req.timeoutMs) + "ms\uFF09", null);
    }
    if (res.exitCode !== 0) await throwShellFailure(command, res.stderr, res.exitCode);
    return { text: res.text, truncated: res.truncated };
  }
  async function runShellMeta(command, opts) {
    const sp = ctx.get("sandboxPolicy");
    const workspaceRoot = sp && sp.workspaceRoot || process.cwd();
    const timeoutMs = opts && opts.timeoutMs || 3e5;
    const stdoutMaxBytes = opts && opts.stdoutMaxBytes || 4194304;
    const fullCommand = scripts.UTF8_PRELUDE + "\n" + command;
    if (isWin && await shellDialectFor(command) === "bash") {
      return await runShellDirect(command, { command: fullCommand, timeoutMs, stdoutMaxBytes, cwd: workspaceRoot, stdin: opts && opts.stdin });
    }
    const spec = shell.resolve({
      command: fullCommand,
      timeoutMs,
      stdoutMaxBytes,
      // stdin 是官方 ShellExecRequest 契约字段（bash-local/pwsh 均实现），
      // POSIX 侧用它传 index.json 全文，绕开 argv 长度上限
      ...opts && opts.stdin !== void 0 ? { stdin: opts.stdin } : {},
      sandboxPolicy: { mode: "danger-full-access", workspaceRoot }
    });
    const res = await runViaExecutor(shell, spec);
    if (res && res.exitCode !== 0) {
      const stderr = res && res.stderr && res.stderr.text || "";
      const timedOut = res.timedOut === true || res.exitCode === null && !String(stderr).trim();
      const detail = timedOut ? "\u547D\u4EE4\u51C6\u5907\u671F\u8D85\u65F6\uFF08" + String(timeoutMs) + "ms\uFF0C\u6267\u884C\u5668\u672A\u4EA7\u51FA\u8F93\u51FA\uFF09" : stderr;
      await throwShellFailure(command, detail, res.exitCode);
    }
    return {
      text: res && res.stdout && res.stdout.text || "",
      truncated: Boolean(res && res.stdout && res.stdout.truncated)
    };
  }
  async function runShell(command, opts) {
    return (await runShellMeta(command, opts)).text;
  }
  function extractGitDir(command) {
    const m = String(command).match(/(?:^|\n)[ \t]*(?:\$g|g)[ \t]*=[ \t]*'([^']+)/);
    return m ? m[1] ?? null : null;
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
    return base.replace(/\/+$/, "") + "/dsh-recall-snapshots/" + hashRootPath(root);
  }
  function configuredStoreBase() {
    const raw = config.storeRoot;
    if (!raw) return null;
    if (!isAbsoluteDirPath(raw, isWin)) {
      recordError("recall storeRoot is not an absolute path, ignored: " + raw);
      return null;
    }
    return raw;
  }
  function syncStoreBase() {
    const base = config.storeRoot || "";
    if (state.storeBase === base) return;
    state.storeBase = base;
    state.stores.clear();
    state.homeContainer = null;
    state.gitReady.clear();
    state.gcLastAt.clear();
    state.gcCount.clear();
  }
  async function adoptHomeStore(root, targetDir) {
    let legacyDir = null;
    try {
      legacyDir = isWin ? await homeDirForWin(root) : await homeDirForPosix(root);
    } catch (error) {
      legacyDir = null;
    }
    if (!legacyDir || legacyDir === targetDir) return;
    try {
      const exists = scripts.stripBom(await runShell(scripts.dirExistsScript(legacyDir), { stdoutMaxBytes: 4096 })).trim() === "YES";
      if (!exists) return;
      if (!(await probeStore(legacyDir)).hasRepo) return;
      await runShell(scripts.migrateScript(legacyDir, targetDir), { timeoutMs: 3e5, stdoutMaxBytes: 4096 });
      recordError("recall moved existing snapshots into the configured storeRoot: " + targetDir);
    } catch (error) {
      recordError("recall migrate to storeRoot failed (old snapshots kept in place): " + String(error));
    }
  }
  async function homeDirFor(root) {
    const base = configuredStoreBase();
    if (base) {
      const tail = base.endsWith(SEP) ? "" : SEP;
      return base + tail + "dsh-recall-snapshots" + SEP + hashRootPath(root);
    }
    return isWin ? homeDirForWin(root) : homeDirForPosix(root);
  }
  async function resolveHomeContainer() {
    syncStoreBase();
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
      },
      // issue #24 快照护栏：与 maxFileBytes 同款 getter——设置页改完上限，
      // 下一次快照立即按新值判定，无需重启或重建 store 缓存
      get maxWorkspaceBytes() {
        return config.maxWorkspaceBytes;
      },
      get scanBudgetMs() {
        return config.scanBudgetMs;
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
  async function probeStore(dir) {
    try {
      const out = scripts.stripBom(await runShell(scripts.storeProbeScript(dir), { timeoutMs: 6e4, stdoutMaxBytes: 4096 }));
      return parseStoreProbe(out);
    } catch (error) {
      recordError("recall store probe failed: " + String(error));
      return { writable: false, hasRepo: false };
    }
  }
  async function resolveStore(root) {
    syncStoreBase();
    const cached = state.stores.get(root);
    if (cached) return cached;
    let homeDir = null;
    try {
      homeDir = await homeDirFor(root);
    } catch (error) {
      homeDir = null;
    }
    if (homeDir) {
      const probe = await probeStore(homeDir);
      if (probe.writable) {
        if (!probe.hasRepo && configuredStoreBase()) await adoptHomeStore(root, homeDir);
        const store2 = makeStore(homeDir, true);
        state.stores.set(root, store2);
        persistRootHint(store2, root);
        return store2;
      }
      recordError("recall home store not writable, falling back to workspace: " + homeDir);
    }
    const fallback = root + SEP + ".dsh-recall-snapshots";
    await runShell(scripts.mkdirScript(fallback), { stdoutMaxBytes: 4096 });
    const store = makeStore(fallback, false);
    state.stores.set(root, store);
    persistRootHint(store, root);
    return store;
  }
  async function tryUpgradeToHome(root) {
    syncStoreBase();
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
    if (!(await probeStore(homeDir)).writable) {
      recordError("recall home store upgrade skipped (not writable): " + homeDir);
      return store;
    }
    try {
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
  async function downgradeStore(root, from, reason) {
    if (!from.home) return null;
    if ((await probeStore(from.dir)).hasRepo) {
      recordError("recall home store unwritable but holds a repo, keeping it: " + reason);
      return null;
    }
    const fallback = root + SEP + ".dsh-recall-snapshots";
    if (!(await probeStore(fallback)).writable) {
      recordError("recall workspace store not writable either: " + fallback);
      return null;
    }
    const next = makeStore(fallback, false);
    state.stores.set(root, next);
    state.gitReady.delete(from.git);
    state.gcLastAt.delete(from.git);
    state.gcCount.delete(from.git);
    for (const [id, info] of state.snapshots) {
      if (info.root === root) state.snapshots.delete(id);
    }
    state.indexLoaded.delete(root);
    state.indexHealthy.delete(root);
    state.indexTruncated.delete(root);
    recordError("recall switched to workspace store (home store unwritable): " + fallback);
    persistRootHint(next, root);
    return next;
  }
  async function ensureGit(root, store, retried = false) {
    if (state.gitReady.has(store.git)) return { ok: true, store };
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
      state.gcLastAt.set(store.git, m ? parseInt(m[1] ?? "", 10) * 1e3 : Date.now());
      return { ok: true, store };
    } catch (error) {
      recordError("recall ensureGit failed: " + String(error));
      if (!retried) {
        const next = await downgradeStore(root, store, String(error));
        if (next) return await ensureGit(root, next, true);
      }
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
  function homeContainerCandidates() {
    const bases = [];
    const envHome = process.env && process.env.DSH_HOME || "";
    if (envHome) bases.push(envHome);
    const home = os.homedir();
    bases.push(home + SEP + ".dsh");
    if (!isWin) bases.push(home);
    const out = [];
    for (const base of bases) {
      const candidate = base.replace(/[\\/]+$/, "") + SEP + "dsh-recall-snapshots";
      if (out.indexOf(candidate) < 0) out.push(candidate);
    }
    return out;
  }
  async function rootsWithExistingStore(roots) {
    const all = new Set(roots);
    if (roots.length === 0) return all;
    if (configuredStoreBase()) return all;
    const normalize = (p) => {
      let v = String(p).replace(/[\\/]+$/, "") || (isWin ? p : "/");
      if (isWin && v.length === 2) v += "\\";
      return v;
    };
    const exists = (p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch (error) {
        return false;
      }
    };
    const containers = [];
    try {
      for (const candidate of homeContainerCandidates()) {
        try {
          if (fs.statSync(candidate).isDirectory()) containers.push(candidate);
        } catch (error) {
          if (!error || error.code !== "ENOENT") throw error;
        }
      }
    } catch (error) {
      console.error("recall warmup prune skipped (container probe failed):", String(error));
      return all;
    }
    const found = /* @__PURE__ */ new Set();
    for (const root of roots) {
      const normalized = normalize(root);
      const hash = hashRootPath(normalized);
      if (containers.some((container) => exists(container + SEP + hash))) found.add(root);
      else if (exists(normalized + SEP + ".dsh-recall-snapshots")) found.add(root);
    }
    return found;
  }
  return { state, isWin, scripts, recordError, runShell, runShellMeta, writeTextViaShell, resolveRoot, resolveGit, homeDirFor, resolveHomeContainer, resolveStore, storeFromDir, tryUpgradeToHome, ensureGit, cleanupLegacy, cleanupAfterGitFailure, rootsWithExistingStore };
}
export {
  SHELL_PROBE_COMMAND,
  SHELL_PROBE_SENTINEL,
  collectStdout,
  createRuntime,
  directPwshPath,
  hashRootPath,
  isAbsoluteDirPath,
  isTmpConsumedError,
  judgeShellDialect,
  parseCleanupResult,
  parseStoreProbe,
  resolvePosixHomeBase,
  runViaExecutor,
  runViaSpawn,
  scrubChildEnv,
  selectPosixHomeBase
};
