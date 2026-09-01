// src/client/css.js
var CSS = [
  ".dsh-recall-row{flex-direction:column;align-items:flex-end;gap:6px;display:flex}",
  ".dsh-recall-stack{flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(525px,82%);display:flex}",
  ".dsh-recall-bubble{background:var(--dsw-specific-bubble);max-width:100%;color:var(--dsw-alias-label-primary);border-radius:22px;padding:10px 16px;font-size:16px;line-height:24px;white-space:pre-wrap;word-break:break-word}",
  ".dsh-recall-json{margin:0;max-width:100%;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;word-break:break-word;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-markdown-code-block)}",
  ".dsh-recall-actions{align-items:center;gap:10px;height:28px;display:flex}",
  ".dsh-recall-time{color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px;font-size:14px;line-height:24px}",
  ".dsh-recall-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}",
  ".dsh-recall-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
  "@media (hover:hover){[data-time-hover-root] .dsh-recall-time{opacity:0;transition:opacity 80ms}[data-time-hover-root]:hover .dsh-recall-time,[data-time-hover-root]:focus-within .dsh-recall-time{opacity:1}}",
  ".dsh-recall-panel{width:min(480px,100%);box-sizing:border-box;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;text-align:left;box-shadow:0 8px 28px rgba(0,0,0,.22)}",
  ".dsh-recall-panel-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:22px}",
  ".dsh-recall-panel-note{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;word-break:break-word}",
  ".dsh-recall-list{max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:2px;padding:4px 0}",
  ".dsh-recall-file{display:flex;gap:8px;align-items:baseline;font-size:12px;line-height:20px}",
  ".dsh-recall-badge{flex:none;font-size:11px;line-height:18px;padding:0 6px;border-radius:6px}",
  ".dsh-recall-badge-modified{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover)}",
  ".dsh-recall-badge-restored{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}",
  ".dsh-recall-badge-added{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover)}",
  ".dsh-recall-rel{min-width:0;color:var(--dsw-alias-label-primary);word-break:break-all;font-family:var(--dsw-font-code, ui-monospace, SFMono-Regular, Consolas, monospace)}",
  ".dsh-recall-panel-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:2px}",
  ".dsh-recall-btn{border:none;border-radius:8px;padding:5px 14px;font-size:13px;line-height:20px;cursor:pointer;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}",
  ".dsh-recall-btn:hover{color:var(--dsw-alias-label-primary)}",
  ".dsh-recall-btn-danger{background:var(--dsw-alias-state-error-primary);color:#fff}",
  ".dsh-recall-btn-danger:hover{color:#fff;filter:brightness(1.08)}",
  ".dsh-recall-toast{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:10000;max-width:min(560px,86vw);box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:10px 16px;font-size:13px;line-height:20px;box-shadow:0 8px 28px rgba(0,0,0,.22);display:flex;align-items:baseline;gap:8px;opacity:0;transition:opacity .25s ease;pointer-events:auto}",
  ".dsh-recall-toast.dsh-recall-toast-in{opacity:1}",
  ".dsh-recall-toast-tag{flex:none;font-weight:600;color:var(--dsw-alias-state-error-primary)}",
  ".dsh-recall-ex-card{display:flex;flex-direction:column;gap:8px}",
  ".dsh-recall-ex-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:22px}",
  ".dsh-recall-ex-note{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;word-break:break-word}",
  ".dsh-recall-ex-area{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;font-size:12px;line-height:20px;font-family:var(--dsw-font-code, ui-monospace, SFMono-Regular, Consolas, monospace);resize:vertical;min-height:120px}",
  ".dsh-recall-ex-quick{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
  ".dsh-recall-ex-input{flex:1;min-width:180px;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 10px;font-size:13px;line-height:20px}",
  ".dsh-recall-ex-chip{border:none;border-radius:6px;padding:2px 8px;font-size:12px;line-height:18px;cursor:pointer;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}",
  ".dsh-recall-ex-chip:hover{color:var(--dsw-alias-label-primary)}",
  ".dsh-recall-ex-status{margin-right:auto;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}",
  ".dsh-recall-ex-status-error{color:var(--dsw-alias-state-error-primary)}",
  ".dsh-recall-ex-status-success{color:var(--dsw-alias-state-success-primary)}",
  ".dsh-recall-tree{display:flex;flex-direction:column;gap:2px;padding:4px 0}",
  ".dsh-recall-tree-node{display:flex;flex-direction:column;gap:1px}",
  ".dsh-recall-tree-row{display:flex;gap:6px;align-items:center;min-width:0;padding:2px 4px;border-radius:6px;cursor:default}",
  ".dsh-recall-tree-row:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".dsh-recall-tree-toggle{flex:none;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:4px;font-size:11px;line-height:18px;user-select:none}",
  ".dsh-recall-tree-toggle:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
  ".dsh-recall-tree-toggle-placeholder{flex:none;width:18px;height:18px}",
  ".dsh-recall-tree-label{flex:1;min-width:0;display:flex;gap:8px;align-items:baseline;font-size:12px;line-height:20px;overflow:hidden}",
  ".dsh-recall-tree-name{flex:none;font-weight:600;color:var(--dsw-alias-label-secondary)}",
  ".dsh-recall-tree-title{min-width:0;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".dsh-recall-tree-meta{flex:none;font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}",
  ".dsh-recall-tree-children{display:flex;flex-direction:column;gap:1px;margin-left:16px;border-left:1px solid var(--dsw-alias-border-l1);padding-left:8px}",
  ".dsh-recall-tree-confirm{display:flex;gap:8px;align-items:center;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}",
  ".dsh-recall-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s;display:flex;flex-direction:column;text-align:left}",
  ".dsh-recall-card.dsh-recall-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
  ".dsh-recall-card-head{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
  ".dsh-recall-card-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}",
  ".dsh-recall-card-desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
  ".dsh-recall-card-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:12px 0 8px;display:flex;flex-direction:column;gap:12px}",
  ".dsh-recall-cardbtn{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
  ".dsh-recall-cfg-row{display:flex;flex-direction:column;gap:4px}",
  ".dsh-recall-cfg-line{display:flex;align-items:center;gap:8px}",
  ".dsh-recall-cfg-label{flex:none;width:130px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}",
  ".dsh-recall-cfg-input{flex:1;min-width:0;box-sizing:border-box;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 8px}",
  ".dsh-recall-cfg-input:disabled{opacity:.5}",
  ".dsh-recall-cfg-area{font-family:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 8px;min-height:64px}",
  ".dsh-recall-cfg-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding-left:138px}",
  ".dsh-recall-cfg-tag{flex:none;font-size:11px;line-height:16px;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary)}"
].join("");

// src/client/util.js
function clockText(ms) {
  try {
    if (!ms || isNaN(new Date(ms).getTime())) return "";
    const d = new Date(ms);
    const now = /* @__PURE__ */ new Date();
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return sameDay ? hh + ":" + mm : d.getMonth() + 1 + "/" + d.getDate() + " " + hh + ":" + mm;
  } catch (e) {
    return "";
  }
}
function sizeText(bytes) {
  if (!bytes || bytes <= 0) return "0 MB";
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1073741824).toFixed(2) + " GB";
}
function bytesToMb(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n / 1048576 * 100) / 100);
}
function buildTree(list) {
  const workspaces = /* @__PURE__ */ new Map();
  for (const it of list || []) {
    const rootKey = it.root || "unknown-root";
    if (!workspaces.has(rootKey)) workspaces.set(rootKey, { root: it.root || null, name: it.workspace || "\u672A\u77E5\u5DE5\u4F5C\u533A", sessions: /* @__PURE__ */ new Map() });
    const ws = workspaces.get(rootKey);
    const sidKey = it.sessionId || "unknown-session";
    if (!ws.sessions.has(sidKey)) ws.sessions.set(sidKey, { root: ws.root, sessionId: it.sessionId || null, title: it.sessionTitle || null, items: [] });
    ws.sessions.get(sidKey).items.push(it);
  }
  const wsList = Array.from(workspaces.values());
  wsList.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  for (const ws of wsList) {
    ws.sessions = Array.from(ws.sessions.values());
    ws.sessions.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    for (const s of ws.sessions) s.items.sort((a, b) => (b.time || 0) - (a.time || 0));
  }
  return wsList;
}
function buildUtil() {
  function api(name, args) {
    return fetch("/api/recall/" + name, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args || {})
    }).then((r) => r.json());
  }
  const CODE_TEXT = {
    STALE: "\u9884\u89C8\u540E\u9879\u76EE\u6587\u4EF6\u53D1\u751F\u4E86\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u786E\u8BA4",
    AGENT_BUSY: "Agent \u6B63\u5728\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u5148\u505C\u6B62\u540E\u518D\u64A4\u56DE",
    NO_SNAPSHOT: "\u8BE5\u6D88\u606F\u6CA1\u6709\u53EF\u7528\u7684\u9879\u76EE\u5FEB\u7167",
    NO_STORE: "\u5FEB\u7167\u5B58\u50A8\u4E0D\u53EF\u7528",
    ROLLBACK_FAILED: "\u56DE\u9000\u5931\u8D25"
  };
  function messageFor(res, fallback) {
    if (!res) return fallback;
    const code = res && res.code;
    if (code && CODE_TEXT[code]) return CODE_TEXT[code];
    return res && (res.message || res.error) || fallback;
  }
  const noticeShown = /* @__PURE__ */ new Set();
  function mountToast(text) {
    if (typeof document === "undefined") return;
    try {
      let dismiss = function() {
        if (dismissed) return;
        dismissed = true;
        clearTimeout(timer);
        el.classList.remove("dsh-recall-toast-in");
        setTimeout(() => el.remove(), 300);
      };
      const el = document.createElement("div");
      el.className = "dsh-recall-toast";
      const tag = document.createElement("span");
      tag.className = "dsh-recall-toast-tag";
      tag.textContent = "\u64A4\u56DE\u63D2\u4EF6";
      const body = document.createElement("span");
      body.textContent = text;
      el.appendChild(tag);
      el.appendChild(body);
      el.addEventListener("click", () => dismiss(), { once: true });
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add("dsh-recall-toast-in"));
      const timer = setTimeout(dismiss, 7e3);
      let dismissed = false;
    } catch (e) {
    }
  }
  function showNotice(kind, text) {
    if (noticeShown.has(kind)) return;
    noticeShown.add(kind);
    mountToast(text);
  }
  const toastLastShown = /* @__PURE__ */ new Map();
  function showThrottledToast(text) {
    const key = String(text).slice(0, 80);
    const now = Date.now();
    if (now - (toastLastShown.get(key) || 0) < 10 * 60 * 1e3) return;
    if (toastLastShown.size > 50) toastLastShown.clear();
    toastLastShown.set(key, now);
    mountToast(text);
  }
  const pluginConfig = { refillDraft: true, archiveOriginal: true };
  const initMap = /* @__PURE__ */ new Map();
  function ensureInit(sessionId) {
    if (!sessionId) return Promise.resolve();
    const cached = initMap.get(sessionId);
    if (cached) return cached;
    const done = api("init", { sessionId }).then((res) => {
      if (res && res.config && typeof res.config === "object") {
        if (typeof res.config.refillDraft === "boolean") pluginConfig.refillDraft = res.config.refillDraft;
        if (typeof res.config.archiveOriginal === "boolean") pluginConfig.archiveOriginal = res.config.archiveOriginal;
      }
      const notice = res && res.notice;
      if (notice && notice.unsupported) {
        showNotice("unsupported", "\u64A4\u56DE\u63D2\u4EF6\u4EC5\u652F\u6301 Windows / Linux / macOS\uFF0C\u5F53\u524D\u5E73\u53F0\u7684\u5FEB\u7167\u4E0D\u53EF\u7528\u3002");
      }
      if (notice && notice.gitMissing) {
        showNotice("git", "\u672A\u68C0\u6D4B\u5230 git CLI\uFF0C\u64A4\u56DE\u529F\u80FD\u4E0D\u53EF\u7528\uFF08\u5FEB\u7167\u5F15\u64CE\u4F9D\u8D56 git\uFF09\u3002\u5B89\u88C5 git \u5E76\u91CD\u542F DSH \u540E\u5373\u53EF\u4F7F\u7528\u3002");
      }
      if (notice && notice.homeFallback) {
        showNotice("home", "home \u76EE\u5F55\u4E0D\u53EF\u5199\uFF0C\u5FEB\u7167\u5DF2\u964D\u7EA7\u5B58\u50A8\u5230\u9879\u76EE\u5185 .dsh-recall-snapshots \u76EE\u5F55\u3002");
      }
    }).catch(() => {
      initMap.delete(sessionId);
    });
    initMap.set(sessionId, done);
    return done;
  }
  function writeClipboard(text) {
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        return navigator.clipboard.writeText(text).then(() => true, () => false);
      }
    } catch (e) {
    }
    try {
      if (typeof document !== "undefined" && typeof document.execCommand === "function") {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        try {
          return Promise.resolve(document.execCommand("copy"));
        } finally {
          el.remove();
        }
      }
    } catch (e) {
    }
    return Promise.resolve(false);
  }
  return { api, messageFor, showNotice, showThrottledToast, ensureInit, clockText, writeClipboard, sizeText, bytesToMb, buildTree, pluginConfig };
}

// src/client/recall-node.js
var KIND_INFO = {
  modified: { label: "\u4FEE\u6539", cls: "modified" },
  restored: { label: "\u6062\u590D", cls: "restored" },
  added: { label: "\u5220\u9664", cls: "added" }
};
function summaryText(counts) {
  const parts = [];
  for (const kind of Object.keys(KIND_INFO)) {
    if (counts[kind] > 0) parts.push(KIND_INFO[kind].label + " " + counts[kind]);
  }
  return parts.join(" \xB7 ");
}
function buildRecallNode(React, util, ctx, sessionsSvc, workspacesSvc) {
  const { api, ensureInit, showThrottledToast, writeClipboard, clockText: clockText2, pluginConfig, messageFor } = util;
  function CopyIcon() {
    return React.createElement(
      "svg",
      { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, "aria-hidden": true },
      React.createElement("rect", { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5 }),
      React.createElement("path", { d: "M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" })
    );
  }
  function CheckIcon() {
    return React.createElement(
      "svg",
      { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
      React.createElement("path", { d: "m3 8.5 3.2 3.2L13 5" })
    );
  }
  function UndoIcon() {
    return React.createElement(
      "svg",
      { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
      React.createElement("path", { d: "M7.5 3.5 3.5 7.5l4 4" }),
      React.createElement("path", { d: "M4.5 7.5h5a3 3 0 0 1 0 6H8" })
    );
  }
  function recallPanel(recall, closePanel, executeRecall) {
    if (recall.stage === "loading") {
      return React.createElement(
        "div",
        { className: "dsh-recall-panel" },
        React.createElement("div", { className: "dsh-recall-panel-title" }, "\u6B63\u5728\u8BA1\u7B97\u53D8\u66F4\u2026")
      );
    }
    if (recall.stage === "error") {
      return React.createElement(
        "div",
        { className: "dsh-recall-panel" },
        React.createElement("div", { className: "dsh-recall-panel-title" }, "\u65E0\u6CD5\u56DE\u9000"),
        React.createElement("div", { className: "dsh-recall-panel-note" }, recall.message || ""),
        React.createElement(
          "div",
          { className: "dsh-recall-panel-actions" },
          React.createElement("button", { type: "button", className: "dsh-recall-btn", onClick: closePanel }, "\u5173\u95ED")
        )
      );
    }
    if (recall.stage === "confirm") {
      const changes = recall.changes || [];
      const total = typeof recall.total === "number" ? recall.total : changes.length;
      const counts = { modified: 0, restored: 0, added: 0 };
      for (const c of changes) {
        if (c && counts[c.kind] !== void 0) counts[c.kind]++;
      }
      const rows = changes.map((c, i) => {
        const info = KIND_INFO[c.kind];
        return React.createElement(
          "div",
          { className: "dsh-recall-file", key: i },
          React.createElement("span", { className: "dsh-recall-badge dsh-recall-badge-" + (info ? info.cls : "") }, info ? info.label : c.kind || ""),
          React.createElement("span", { className: "dsh-recall-rel" }, c.rel || "")
        );
      });
      if (recall.truncated) {
        rows.push(React.createElement("div", { className: "dsh-recall-panel-note", key: "truncated" }, "\u2026\u4EC5\u663E\u793A\u524D " + changes.length + " \u6761\uFF0C\u5171 " + total + " \u4E2A\u6587\u4EF6\u5C06\u53D8\u66F4"));
      }
      const canRevertChat = typeof recall.cutSeq === "number";
      return React.createElement(
        "div",
        { className: "dsh-recall-panel" },
        React.createElement("div", { className: "dsh-recall-panel-title" }, "\u6574\u6BB5\u56DE\u9000"),
        React.createElement(
          "div",
          { className: "dsh-recall-panel-note" },
          "\u5C06\u9879\u76EE\u6062\u590D\u5230" + (recall.time ? " " + clockText2(recall.time) + " " : " ") + "\u53D1\u9001\u8BE5\u6D88\u606F\u65F6\u7684\u72B6\u6001\u3002\u5171 " + total + " \u4E2A\u6587\u4EF6\u5C06\u53D8\u66F4" + (summaryText(counts) ? "\uFF08" + summaryText(counts) + "\uFF09" : "") + "\u3002\u6B64\u64CD\u4F5C\u4F1A\u8986\u76D6\u5F53\u524D\u6587\u4EF6\u5185\u5BB9\uFF1B\u56DE\u9000\u524D\u4F1A\u81EA\u52A8\u4FDD\u5B58\u4E00\u4EFD\u5F53\u524D\u72B6\u6001\u7684\u5B89\u5168\u5FEB\u7167\uFF08\u4E0D\u542B\u5728\u4E0B\u65B9\u6E05\u5355\u5185\uFF09\u3002"
        ),
        React.createElement(
          "div",
          { className: "dsh-recall-panel-note" },
          canRevertChat ? "\u5BF9\u8BDD\u5C06\u4E00\u5E76\u56DE\u9000\u5230\u8BE5\u6D88\u606F\u4E4B\u524D\uFF1A\u8BE5\u6D88\u606F\u53CA\u4E4B\u540E\u7684\u5168\u90E8\u5BF9\u8BDD\u4F1A\u4ECE\u5F53\u524D\u89C6\u56FE\u79FB\u9664\uFF0C\u539F\u4F1A\u8BDD\u5F52\u6863\u4FDD\u5B58\uFF08\u53EF\u4ECE\u5F52\u6863\u627E\u56DE\uFF09\u3002" : "\u8BE5\u6D88\u606F\u662F\u672C\u4F1A\u8BDD\u4E2D\u7B2C\u4E00\u6761\u7528\u6237\u6D88\u606F\uFF0C\u65E0\u6CD5\u56DE\u9000\u5BF9\u8BDD\uFF1B\u786E\u8BA4\u540E\u4EC5\u56DE\u9000\u9879\u76EE\u6587\u4EF6\u3002"
        ),
        changes.length > 0 ? React.createElement("div", { className: "dsh-recall-list" }, ...rows) : null,
        React.createElement(
          "div",
          { className: "dsh-recall-panel-actions" },
          React.createElement("button", { type: "button", className: "dsh-recall-btn", onClick: closePanel }, "\u53D6\u6D88"),
          React.createElement("button", { type: "button", className: "dsh-recall-btn dsh-recall-btn-danger", onClick: executeRecall }, "\u786E\u8BA4\u56DE\u9000")
        )
      );
    }
    if (recall.stage === "executing") {
      return React.createElement(
        "div",
        { className: "dsh-recall-panel" },
        React.createElement("div", { className: "dsh-recall-panel-title" }, "\u6B63\u5728\u56DE\u9000\u2026")
      );
    }
    if (recall.stage === "done") {
      return React.createElement(
        "div",
        { className: "dsh-recall-panel" },
        React.createElement("div", { className: "dsh-recall-panel-title" }, "\u56DE\u9000\u5B8C\u6210"),
        React.createElement(
          "div",
          { className: "dsh-recall-panel-note" },
          recall.chatReverted ? "\u9879\u76EE\u6587\u4EF6\u4E0E\u5BF9\u8BDD\u5DF2\u56DE\u9000\u5230\u8BE5\u6D88\u606F\u4E4B\u524D\u3002\u65B0\u4F1A\u8BDD\u5DF2\u6253\u5F00\uFF0C\u539F\u4F1A\u8BDD\u5DF2\u5F52\u6863\uFF08\u53EF\u4ECE\u5F52\u6863\u627E\u56DE\uFF09\u3002" : "\u9879\u76EE\u5DF2\u6062\u590D\u5230\u53D1\u9001\u8BE5\u6D88\u606F\u65F6\u7684\u72B6\u6001\u3002" + (recall.chatError ? " \u5BF9\u8BDD\u56DE\u9000\u5931\u8D25\uFF1A" + recall.chatError : "")
        ),
        React.createElement(
          "div",
          { className: "dsh-recall-panel-actions" },
          React.createElement("button", { type: "button", className: "dsh-recall-btn", onClick: closePanel }, "\u5173\u95ED")
        )
      );
    }
    return null;
  }
  function fillDraft(targetSessionId, draftText) {
    if (!draftText || !targetSessionId) return;
    let attempts = 0;
    const attempt = () => {
      try {
        const conversation = ctx.get("conversation");
        if (conversation && conversation.input && typeof conversation.input.shell === "function") {
          const shell = conversation.input.shell(targetSessionId);
          if (shell) {
            if (shell.actions && typeof shell.actions.setDraft === "function") {
              shell.actions.setDraft(draftText);
              return;
            }
            if (typeof shell.setDraft === "function") {
              shell.setDraft(draftText);
              return;
            }
          }
        }
      } catch (e) {
      }
      if (attempts++ < 8) setTimeout(attempt, 150);
    };
    attempt();
  }
  function UserRecallNode(props) {
    const node = props && props.node;
    const renderMessageImages = props && props.renderMessageImages;
    const sessionId = props && props.sessionId;
    const data = node && node.data ? node.data : {};
    const messageId = node ? String(node.id || node.key || "") : "";
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
    const imageBlocks = blocks.filter((b) => b && b.type === "image" && b.attachment).map((b) => ({ attachment: b.attachment }));
    const rest = blocks.filter((b) => !b || !(b.type === "text" && typeof b.text === "string") && !(b.type === "image" && b.attachment));
    const [copied, setCopied] = React.useState(false);
    const [hasSnapshot, setHasSnapshot] = React.useState(false);
    const [recall, setRecall] = React.useState({ stage: "idle" });
    React.useEffect(() => {
      let alive = true;
      let timer = null;
      let attempts = 0;
      const RETRY_WINDOW_MS = 5 * 60 * 1e3;
      const MAX_ATTEMPTS = 20;
      const RETRY_MS = 1e3;
      const msgTime = data && typeof data.time === "number" ? data.time : NaN;
      const recent = !isNaN(msgTime) && Date.now() - msgTime <= RETRY_WINDOW_MS;
      function schedule() {
        if (!alive || !messageId) return;
        attempts++;
        api("snapshot-info", { messageId, sessionId }).then((res) => {
          if (!alive) return;
          if (res && res.has) {
            if (recent && Array.isArray(res.skipped) && res.skipped.length) {
              const names = res.skipped.slice(0, 5).join("\u3001") + (res.skipped.length > 5 ? " \u7B49 " + res.skipped.length + " \u9879" : "");
              showThrottledToast("\u5FEB\u7167\u5DF2\u8DF3\u8FC7\u672A\u7EB3\u5165\u7684\u8DEF\u5F84\uFF1A" + names + "\uFF08\u64A4\u56DE\u4E0D\u4F1A\u6062\u590D\u6216\u5220\u9664\u8FD9\u4E9B\u8DEF\u5F84\uFF09");
            }
            setHasSnapshot(true);
            return;
          }
          if (res && res.failed) {
            if (recent) showThrottledToast("\u5FEB\u7167\u5931\u8D25\uFF1A" + String(res.error || "\u672A\u77E5\u539F\u56E0").slice(0, 140));
            return;
          }
          if (recent && attempts < MAX_ATTEMPTS) timer = setTimeout(schedule, RETRY_MS);
        }).catch(() => {
          if (alive && recent && attempts < MAX_ATTEMPTS) timer = setTimeout(schedule, RETRY_MS);
        });
      }
      ensureInit(sessionId).then(() => {
        if (!messageId || !alive) return;
        schedule();
      }).catch(() => {
        if (alive && messageId) timer = setTimeout(schedule, RETRY_MS);
      });
      return () => {
        alive = false;
        if (timer !== null) clearTimeout(timer);
      };
    }, [messageId, sessionId]);
    const onCopy = () => {
      if (copied) return;
      writeClipboard(text).then(() => {
        setCopied(true);
        const timer = ctx.timer;
        if (timer && typeof timer.timeout === "function") {
          timer.timeout(() => setCopied(false), 1200);
        } else {
          setTimeout(() => setCopied(false), 1200);
        }
      });
    };
    const openPreview = () => {
      if (recall.stage === "loading" || recall.stage === "executing") return;
      setRecall({ stage: "loading" });
      api("preview", { messageId, sessionId }).then((res) => {
        if (!res || !res.ok) {
          setRecall({ stage: "error", message: messageFor(res, "\u65E0\u6CD5\u83B7\u53D6\u5FEB\u7167") });
          return;
        }
        setRecall({
          stage: "confirm",
          changes: res.changes || [],
          total: typeof res.total === "number" ? res.total : (res.changes || []).length,
          truncated: Boolean(res.truncated),
          treeId: res.treeId || null,
          time: res.time || null,
          cutSeq: typeof res.cutSeq === "number" ? res.cutSeq : null
        });
      }).catch((error) => {
        setRecall({ stage: "error", message: String(error) });
      });
    };
    const executeRecall = () => {
      if (recall.stage !== "confirm") return;
      const changes = recall.changes || [];
      const previewCut = typeof recall.cutSeq === "number" ? recall.cutSeq : null;
      const previewTotal = typeof recall.total === "number" ? recall.total : changes.length;
      setRecall({ stage: "executing", changes });
      api("execute", { messageId, sessionId, previewTotal, previewTreeId: recall.treeId || void 0, previewAt: Date.now() }).then(async (res) => {
        if (!res || !res.ok) {
          if (res && res.code === "STALE") {
            setRecall({ stage: "loading" });
            api("preview", { messageId, sessionId }).then((res2) => {
              if (!res2 || !res2.ok) {
                setRecall({ stage: "error", message: messageFor(res2, "\u65E0\u6CD5\u83B7\u53D6\u5FEB\u7167") });
                return;
              }
              setRecall({
                stage: "confirm",
                changes: res2.changes || [],
                total: typeof res2.total === "number" ? res2.total : (res2.changes || []).length,
                truncated: Boolean(res2.truncated),
                treeId: res2.treeId || null,
                time: res2.time || null,
                cutSeq: typeof res2.cutSeq === "number" ? res2.cutSeq : null
              });
            }).catch((error) => {
              setRecall({ stage: "error", message: String(error) });
            });
            return;
          }
          setRecall({ stage: "error", message: messageFor(res, "\u56DE\u9000\u5931\u8D25") });
          return;
        }
        const cutSeq = typeof res.cutSeq === "number" ? res.cutSeq : previewCut;
        let chatReverted = false;
        let chatError = "";
        let fillTarget = sessionId;
        if (cutSeq !== null && sessionsSvc && typeof sessionsSvc.fork === "function") {
          try {
            const childId = await sessionsSvc.fork({ sessionId, atSeq: cutSeq });
            if (childId) {
              if (typeof sessionsSvc.open === "function") sessionsSvc.open(childId);
              chatReverted = true;
              fillTarget = childId;
              api("lineage-record", { childId, parentId: sessionId }).catch(() => {
              });
              if (pluginConfig.archiveOriginal && workspacesSvc && typeof workspacesSvc.archiveSession === "function") {
                workspacesSvc.archiveSession(sessionId).catch(() => {
                });
              }
            } else {
              chatError = "\u672A\u8FD4\u56DE\u65B0\u4F1A\u8BDD";
            }
          } catch (error) {
            chatError = String(error);
          }
        }
        if (pluginConfig.refillDraft) fillDraft(fillTarget, text);
        setHasSnapshot(false);
        setRecall({ stage: "done", count: typeof res.count === "number" ? res.count : changes.length, chatReverted, chatError });
      }).catch((error) => {
        setRecall({ stage: "error", message: String(error) });
      });
    };
    const closePanel = () => setRecall({ stage: "idle" });
    const bubbleChildren = [];
    if (imageBlocks.length && typeof renderMessageImages === "function") {
      bubbleChildren.push(React.createElement(
        React.Fragment,
        { key: "images" },
        renderMessageImages({ images: imageBlocks, align: "end" })
      ));
    }
    if (text !== "") bubbleChildren.push(React.createElement("div", { className: "dsh-recall-bubble", key: "text" }, text));
    for (let i = 0; i < rest.length; i++) {
      bubbleChildren.push(React.createElement("pre", { className: "dsh-recall-json", key: "rest-" + i }, JSON.stringify(rest[i], null, 2)));
    }
    const actions = [];
    actions.push(React.createElement("span", { className: "dsh-recall-time", key: "time" }, clockText2(data.time)));
    actions.push(React.createElement("button", {
      key: "copy",
      type: "button",
      className: "dsh-recall-action",
      "aria-label": copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236",
      title: copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236",
      onClick: onCopy
    }, copied ? React.createElement(CheckIcon, {}) : React.createElement(CopyIcon, {})));
    if (hasSnapshot) {
      actions.push(React.createElement("button", {
        key: "recall",
        type: "button",
        className: "dsh-recall-action",
        "aria-label": "\u64A4\u56DE",
        title: "\u6574\u6BB5\u56DE\u9000\uFF1A\u6587\u4EF6\u4E0E\u5BF9\u8BDD\u4E00\u5E76\u56DE\u5230\u8BE5\u6D88\u606F\u4E4B\u524D",
        onClick: openPreview
      }, React.createElement(UndoIcon, {})));
    }
    return React.createElement(
      "div",
      { className: "dsh-recall-row", "data-time-hover-root": true },
      bubbleChildren.length > 0 ? React.createElement("div", { className: "dsh-recall-stack", key: "stack" }, ...bubbleChildren) : null,
      React.createElement("div", { className: "dsh-recall-actions", key: "actions" }, ...actions),
      recallPanel(recall, closePanel, executeRecall)
    );
  }
  return { UserRecallNode };
}

// src/client/settings-cards.js
function groupByLineage(ids, lineage) {
  const childOf = /* @__PURE__ */ new Map();
  const childrenOf = /* @__PURE__ */ new Map();
  for (const e of lineage || []) {
    if (e && e.childId && e.parentId) {
      const child = String(e.childId);
      const parent = String(e.parentId);
      childOf.set(child, parent);
      const kids = childrenOf.get(parent) || [];
      kids.push(child);
      childrenOf.set(parent, kids);
    }
  }
  const idSet = new Set((ids || []).map(String));
  const result = /* @__PURE__ */ new Map();
  const assigned = /* @__PURE__ */ new Set();
  for (const id of idSet) {
    if (assigned.has(id)) continue;
    let root = id;
    const seen = /* @__PURE__ */ new Set();
    while (childOf.has(root) && idSet.has(childOf.get(root)) && !seen.has(root)) {
      seen.add(root);
      root = childOf.get(root);
    }
    const chain = [];
    const queue = [root];
    while (queue.length) {
      const cur = queue.shift();
      if (!cur || !idSet.has(cur) || assigned.has(cur)) continue;
      chain.push(cur);
      assigned.add(cur);
      for (const k of childrenOf.get(cur) || []) queue.push(k);
    }
    if (chain.length > 1) {
      chain.forEach((sid, i) => result.set(sid, { family: chain, index: i + 1 }));
    }
  }
  return result;
}
function buildSettingsCards(React, util, sessionsSvc) {
  const { api, clockText: clockText2, sizeText: sizeText2, bytesToMb: bytesToMb2, buildTree: buildTree2 } = util;
  const EXCLUDE_SUGGESTIONS = ["dist/", "build/", "out/", "coverage/", "*.log", ".env"];
  function ExcludeCard(props) {
    const file = props.file;
    const [draft, setDraft] = React.useState(file.content || "");
    const [baseline, setBaseline] = React.useState(file.content || "");
    const [quick, setQuick] = React.useState("");
    const [state, setState] = React.useState({ busy: false, message: "", error: false });
    const dirty = draft !== baseline;
    function appendPattern(pattern) {
      setDraft((d) => (d && !d.endsWith("\n") ? d + "\n" : d) + pattern + "\n");
    }
    function addQuick() {
      const t = quick.trim();
      if (!t) return;
      appendPattern(t);
      setQuick("");
    }
    function save() {
      if (state.busy || !dirty) return;
      setState({ busy: true, message: "\u4FDD\u5B58\u4E2D\u2026", error: false });
      api("exclude-set", { path: file.path, content: draft }).then((res) => {
        if (res && res.ok) {
          setBaseline(draft);
          setState({ busy: false, message: "\u5DF2\u4FDD\u5B58\uFF0C\u4E0B\u4E00\u6B21\u5FEB\u7167 / \u9884\u89C8 / \u56DE\u9000\u65F6\u751F\u6548", error: false });
        } else {
          setState({ busy: false, message: res && (res.message || res.error) || "\u4FDD\u5B58\u5931\u8D25", error: true });
        }
      }).catch((error) => {
        setState({ busy: false, message: String(error), error: true });
      });
    }
    function discard() {
      if (state.busy) return;
      setDraft(baseline);
      setState({ busy: false, message: "", error: false });
    }
    const draftLines = draft.split("\n").map((l) => l.trim());
    const suggestions = EXCLUDE_SUGGESTIONS.filter((s) => draftLines.indexOf(s) < 0);
    return React.createElement(
      "div",
      { className: "dsh-recall-ex-card" },
      React.createElement("div", { className: "dsh-recall-ex-title" }, "\u5FEB\u7167\u6392\u9664\u9879"),
      React.createElement(
        "div",
        { className: "dsh-recall-ex-note" },
        file.home ? "\u6B64\u914D\u7F6E\u5168\u5C40\u5171\u4EAB\uFF0C\u5BF9\u6240\u6709\u5DE5\u4F5C\u533A\u7684\u5FEB\u7167\u751F\u6548\uFF08\u5B58\u50A8\u4F4D\u7F6E\uFF1A" + file.path + "\uFF09\u3002" : "home \u76EE\u5F55\u4E0D\u53EF\u5199\u65F6\u6B64\u5DE5\u4F5C\u533A\u964D\u7EA7\u5B58\u50A8\uFF0C\u6392\u9664\u914D\u7F6E\u72EC\u7ACB\u751F\u6548\uFF08\u5B58\u50A8\u4F4D\u7F6E\uFF1A" + file.path + "\uFF09\u3002"
      ),
      React.createElement("div", { className: "dsh-recall-ex-note" }, "gitignore \u8BED\u6CD5\uFF0C\u4E00\u884C\u4E00\u6761\uFF0C\u652F\u6301 # \u6CE8\u91CA\uFF1B\u547D\u4E2D\u6392\u9664\u7684\u6587\u4EF6\u4E0E\u76EE\u5F55\u4E0D\u8FDB\u5165\u5FEB\u7167\uFF0C\u4E5F\u4E0D\u4F1A\u88AB\u56DE\u9000\u89E6\u78B0\u3002"),
      React.createElement("textarea", {
        className: "dsh-recall-ex-area",
        value: draft,
        spellCheck: false,
        onChange: (e) => setDraft(e.target.value)
      }),
      React.createElement(
        "div",
        { className: "dsh-recall-ex-quick" },
        React.createElement("input", {
          className: "dsh-recall-ex-input",
          value: quick,
          placeholder: "\u8F93\u5165\u8DEF\u5F84\u6216\u6A21\u5F0F\uFF0C\u56DE\u8F66\u5FEB\u901F\u6DFB\u52A0",
          onChange: (e) => setQuick(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addQuick();
            }
          }
        }),
        React.createElement("button", { type: "button", className: "dsh-recall-btn", onClick: addQuick }, "\u6DFB\u52A0"),
        ...suggestions.map((s) => React.createElement("button", {
          key: "chip-" + s,
          type: "button",
          className: "dsh-recall-ex-chip",
          title: "\u70B9\u51FB\u8FFD\u52A0 " + s,
          onClick: () => appendPattern(s)
        }, s))
      ),
      React.createElement(
        "div",
        { className: "dsh-recall-panel-actions" },
        state.message ? React.createElement("span", { className: "dsh-recall-ex-status" + (state.error ? " dsh-recall-ex-status-error" : " dsh-recall-ex-status-success") }, state.message) : null,
        React.createElement("button", { type: "button", className: "dsh-recall-btn", disabled: !dirty || state.busy, onClick: discard }, "\u653E\u5F03\u4FEE\u6539"),
        React.createElement("button", { type: "button", className: "dsh-recall-btn dsh-recall-btn-danger", disabled: !dirty || state.busy, onClick: save }, "\u4FDD\u5B58")
      )
    );
  }
  function ManageCard(props) {
    const [items, setItems] = React.useState(null);
    const [usage, setUsage] = React.useState(null);
    const [errors, setErrors] = React.useState(null);
    const [state, setState] = React.useState({ busy: false, message: "", error: false });
    const [limit, setLimit] = React.useState(200);
    const [total, setTotal] = React.useState(0);
    const [health, setHealth] = React.useState(null);
    const [query, setQuery] = React.useState("");
    const [showAllErrors, setShowAllErrors] = React.useState(false);
    const [titlesPending, setTitlesPending] = React.useState(false);
    const [lineage, setLineage] = React.useState([]);
    function fetchTitles(list) {
      const missing = Array.from(new Set(
        (list || []).filter((it) => it.sessionId && !it.sessionTitle).map((it) => it.sessionId)
      )).slice(0, 100);
      if (!missing.length) {
        setTitlesPending(false);
        return;
      }
      setTitlesPending(true);
      api("manage", { op: "titles", sessionIds: missing }).then((res) => {
        const map = res && res.ok ? res.titles : null;
        if (map) {
          setItems((prev) => (prev || []).map((it) => it.sessionId && map[it.sessionId] ? Object.assign({}, it, { sessionTitle: map[it.sessionId] }) : it));
        }
        setTitlesPending(false);
      }).catch(() => setTitlesPending(false));
    }
    function fetchMessages(list) {
      const requests = (list || []).filter((it) => it.sessionId && it.id && !Object.prototype.hasOwnProperty.call(it, "messageText")).map((it) => ({ sessionId: it.sessionId, messageId: it.id })).slice(0, 200);
      if (!requests.length) return;
      api("manage", { op: "messages", requests }).then((res) => {
        const map = res && res.ok ? res.messageTexts : null;
        if (map) {
          setItems((prev) => (prev || []).map((it) => it.id && Object.prototype.hasOwnProperty.call(map, it.id) ? Object.assign({}, it, { messageText: map[it.id] }) : it));
        }
      }).catch(() => {
      });
    }
    function refresh(overLimit) {
      const useLimit = overLimit || limit;
      api("manage", { op: "list", limit: useLimit }).then((res) => {
        if (res && res.ok) {
          setItems(res.items || []);
          setTotal(typeof res.total === "number" ? res.total : (res.items || []).length);
          fetchTitles(res.items || []);
          fetchMessages(res.items || []);
          if (res.stale) {
            api("manage", { op: "list", limit: useLimit }).then((res2) => {
              if (res2 && res2.ok && !res2.stale) {
                setItems(res2.items || []);
                setTotal(typeof res2.total === "number" ? res2.total : (res2.items || []).length);
                fetchTitles(res2.items || []);
                fetchMessages(res2.items || []);
              }
            }).catch(() => {
            });
          }
        }
        api("manage", { op: "lineage" }).then((res2) => {
          if (res2 && res2.ok && Array.isArray(res2.lineage)) setLineage(res2.lineage);
        }).catch(() => {
        });
        api("manage", { op: "usage" }).then((res2) => {
          if (res2 && res2.ok) {
            setUsage(res2.bytes || 0);
            setHealth({ gitAvailable: res2.gitAvailable !== false, homeStores: res2.homeStores || 0, fallbackStores: res2.fallbackStores || 0 });
          }
        }).catch(() => {
        });
        api("status", {}).then((res2) => {
          if (res2 && res2.ok) setErrors(res2.errors || []);
        }).catch(() => {
        });
      }).catch(() => {
        api("manage", { op: "usage" }).then((res) => {
          if (res && res.ok) {
            setUsage(res.bytes || 0);
            setHealth({ gitAvailable: res.gitAvailable !== false, homeStores: res.homeStores || 0, fallbackStores: res.fallbackStores || 0 });
          }
        }).catch(() => {
        });
        api("status", {}).then((res) => {
          if (res && res.ok) setErrors(res.errors || []);
        }).catch(() => {
        });
      });
    }
    React.useEffect(() => {
      refresh();
    }, []);
    function clearErrors() {
      setErrors([]);
      api("status", { op: "clear" }).catch(() => {
      });
    }
    function run(op, extra, doneText) {
      if (state.busy) return;
      setState({ busy: true, message: "\u6267\u884C\u4E2D\u2026", error: false });
      api("manage", Object.assign({ op }, extra || {})).then((res) => {
        if (res && res.ok) {
          setState({ busy: false, message: typeof res.deleted === "number" ? "\u5DF2\u5220\u9664 " + res.deleted + " \u6761\u5FEB\u7167" : doneText, error: false });
          refresh();
        } else {
          setState({ busy: false, message: res && (res.message || res.error) || "\u64CD\u4F5C\u5931\u8D25", error: true });
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }));
    }
    const [expanded, setExpanded] = React.useState(() => /* @__PURE__ */ new Set());
    const [confirming, setConfirming] = React.useState(null);
    function renderDeleteAllConfirm() {
      if (!confirming || confirming.kind !== "all") return null;
      return React.createElement(
        "div",
        { className: "dsh-recall-tree-confirm" },
        "\u786E\u8BA4\u5220\u9664\u6240\u6709\u5DE5\u4F5C\u533A\u7684\u5168\u90E8\u5FEB\u7167\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002",
        React.createElement("button", {
          type: "button",
          className: "dsh-recall-btn dsh-recall-btn-danger",
          onClick: () => {
            setConfirming(null);
            run("deleteAll", {}, "\u5DF2\u6E05\u7A7A\u5168\u90E8\u5FEB\u7167");
          }
        }, "\u786E\u8BA4\u5168\u90E8\u5220\u9664"),
        React.createElement("button", { type: "button", className: "dsh-recall-ex-chip", onClick: () => setConfirming(null) }, "\u53D6\u6D88")
      );
    }
    function toggle(key) {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }
    const q = query.trim().toLowerCase();
    const filteredItems = q ? (items || []).filter(
      (it) => (it.workspace || "").toLowerCase().indexOf(q) >= 0 || (it.sessionTitle || "").toLowerCase().indexOf(q) >= 0 || (it.messageText || "").toLowerCase().indexOf(q) >= 0 || String(it.id || "").toLowerCase().indexOf(q) >= 0
    ) : items;
    const tree = buildTree2(filteredItems);
    const allSessionIds = Array.from(new Set((items || []).map((it) => it.sessionId).filter(Boolean)));
    const versionMap = groupByLineage(allSessionIds, lineage);
    let listById = null;
    try {
      if (sessionsSvc && sessionsSvc.list && typeof sessionsSvc.list.getSnapshot === "function") {
        listById = sessionsSvc.list.getSnapshot().byId || null;
      }
    } catch (e) {
      listById = null;
    }
    function confirmDelete(kind, key, extra, text) {
      setConfirming({ kind, key, extra, text });
    }
    function renderConfirm(kind, key, extra, text) {
      if (!confirming || confirming.kind !== kind || confirming.key !== key) return null;
      return React.createElement(
        "div",
        { className: "dsh-recall-tree-confirm" },
        text,
        React.createElement("button", {
          type: "button",
          className: "dsh-recall-ex-chip",
          onClick: () => {
            const c = confirming;
            setConfirming(null);
            run("delete", c.extra, "\u5DF2\u5220\u9664");
          }
        }, "\u786E\u8BA4"),
        React.createElement("button", { type: "button", className: "dsh-recall-ex-chip", onClick: () => setConfirming(null) }, "\u53D6\u6D88")
      );
    }
    function renderLeaf(it) {
      const key = "snap-" + it.id;
      const text = it.messageText;
      const title = text || it.id;
      const label = text ? clockText2(it.time) + "  " + text : clockText2(it.time) + "  " + it.id.slice(0, 12) + "\u2026";
      return React.createElement(
        "div",
        { className: "dsh-recall-tree-node", key },
        React.createElement(
          "div",
          { className: "dsh-recall-tree-row", title },
          React.createElement("span", { className: "dsh-recall-tree-toggle-placeholder" }),
          React.createElement(
            "span",
            { className: "dsh-recall-tree-label" },
            React.createElement("span", { className: "dsh-recall-tree-title" }, label)
          ),
          React.createElement("button", {
            type: "button",
            className: "dsh-recall-ex-chip",
            title: "\u5220\u9664\u8BE5\u5FEB\u7167\uFF08tag \u4E0E\u7D22\u5F15\u6761\u76EE\uFF09",
            onClick: () => confirmDelete("snapshot", key, { messageId: it.id, root: it.root || null }, "\u786E\u8BA4\u5220\u9664\u8BE5\u5FEB\u7167\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002")
          }, "\u5220\u9664")
        ),
        renderConfirm("snapshot", key, { messageId: it.id, root: it.root || null }, "\u786E\u8BA4\u5220\u9664\u8BE5\u5FEB\u7167\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002")
      );
    }
    function renderSession(s) {
      const key = "session-" + (s.root || "") + "-" + s.sessionId;
      const open = expanded.has(key);
      const label = s.title || (titlesPending && s.sessionId ? "\u2026" : "\uFF08\u5DF2\u5220\u9664\u4F1A\u8BDD\uFF09");
      const version = s.sessionId ? versionMap.get(String(s.sessionId)) : null;
      const switchable = Boolean(s.sessionId && listById && listById[s.sessionId]);
      return React.createElement(
        "div",
        { className: "dsh-recall-tree-node", key },
        React.createElement(
          "div",
          { className: "dsh-recall-tree-row" },
          React.createElement("span", {
            className: "dsh-recall-tree-toggle",
            onClick: () => toggle(key)
          }, open ? "\u25BE" : "\u25B8"),
          React.createElement(
            "span",
            { className: "dsh-recall-tree-label", title: s.sessionId || "" },
            React.createElement("span", { className: "dsh-recall-tree-title" }, label),
            version ? React.createElement("span", { className: "dsh-recall-tree-meta", title: "\u7248\u672C\u5BB6\u65CF\uFF1A" + version.family.join(" \u2192 ") }, "v" + version.index + "/" + version.family.length) : null,
            React.createElement("span", { className: "dsh-recall-tree-meta" }, s.items.length + " \u6761")
          ),
          switchable ? React.createElement("button", {
            type: "button",
            className: "dsh-recall-ex-chip",
            title: "\u5207\u6362\u5230\u8BE5\u7248\u672C\u4F1A\u8BDD",
            onClick: () => {
              try {
                sessionsSvc.open(s.sessionId);
              } catch (e) {
              }
            }
          }, "\u5207\u6362") : null,
          s.sessionId ? React.createElement("button", {
            type: "button",
            className: "dsh-recall-ex-chip",
            title: "\u5220\u9664\u8BE5\u4F1A\u8BDD\u5168\u90E8\u5FEB\u7167",
            onClick: () => confirmDelete("session", key, { scope: "session", sessionId: s.sessionId, root: s.root || null }, "\u786E\u8BA4\u5220\u9664\u8BE5\u4F1A\u8BDD\u5168\u90E8\u5FEB\u7167\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002")
          }, "\u5220\u9664") : null
        ),
        open ? React.createElement("div", { className: "dsh-recall-tree-children" }, ...s.items.map(renderLeaf)) : null,
        s.sessionId ? renderConfirm("session", key, { scope: "session", sessionId: s.sessionId, root: s.root || null }, "\u786E\u8BA4\u5220\u9664\u8BE5\u4F1A\u8BDD\u5168\u90E8\u5FEB\u7167\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002") : null
      );
    }
    function renderWorkspace(ws) {
      const key = "ws-" + ws.root;
      const open = expanded.has(key);
      const sessionCount = ws.sessions.length;
      const snapCount = ws.sessions.reduce((n, s) => n + s.items.length, 0);
      return React.createElement(
        "div",
        { className: "dsh-recall-tree-node", key },
        React.createElement(
          "div",
          { className: "dsh-recall-tree-row" },
          React.createElement("span", {
            className: "dsh-recall-tree-toggle",
            onClick: () => toggle(key)
          }, open ? "\u25BE" : "\u25B8"),
          React.createElement(
            "span",
            { className: "dsh-recall-tree-label", title: ws.root || "" },
            React.createElement("span", { className: "dsh-recall-tree-name" }, ws.name),
            React.createElement("span", { className: "dsh-recall-tree-meta" }, sessionCount + " \u4F1A\u8BDD / " + snapCount + " \u5FEB\u7167")
          ),
          ws.root ? React.createElement("button", {
            type: "button",
            className: "dsh-recall-ex-chip",
            title: "\u5220\u9664\u8BE5\u5DE5\u4F5C\u533A\u5168\u90E8\u5FEB\u7167",
            onClick: () => confirmDelete("workspace", key, { scope: "workspace", root: ws.root }, "\u786E\u8BA4\u5220\u9664\u8BE5\u5DE5\u4F5C\u533A\u5168\u90E8\u5FEB\u7167\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002")
          }, "\u5220\u9664") : null
        ),
        open ? React.createElement("div", { className: "dsh-recall-tree-children" }, ...ws.sessions.map(renderSession)) : null,
        ws.root ? renderConfirm("workspace", key, { scope: "workspace", root: ws.root }, "\u786E\u8BA4\u5220\u9664\u8BE5\u5DE5\u4F5C\u533A\u5168\u90E8\u5FEB\u7167\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002") : null
      );
    }
    const treeNodes = tree.map(renderWorkspace);
    const loaded = items ? items.length : null;
    const countText = loaded === null ? "\u5171 \u2026 \u6761\u5FEB\u7167" : "\u5171 " + total + " \u6761\u5FEB\u7167" + (limit < total ? "\uFF08\u5F53\u524D\u663E\u793A\u6700\u65B0 " + loaded + " \u6761\uFF09" : "");
    function loadMore() {
      const next = Math.min(Math.max(total, limit), 2e3);
      if (next <= limit) return;
      setLimit(next);
      refresh(next);
    }
    return React.createElement(
      "div",
      { className: "dsh-recall-ex-card" },
      React.createElement("div", { className: "dsh-recall-ex-title" }, "\u5FEB\u7167\u7BA1\u7406"),
      React.createElement(
        "div",
        { className: "dsh-recall-ex-note" },
        usage === null ? countText + "\u3002" : countText + "\uFF0C\u5168\u90E8\u5DE5\u4F5C\u533A\u5FEB\u7167\u5B58\u50A8\u5360\u7528 " + sizeText2(usage) + "\u3002"
      ),
      health ? React.createElement(
        "div",
        { className: "dsh-recall-ex-note", key: "health" },
        React.createElement("span", {
          className: health.gitAvailable ? "" : "dsh-recall-ex-status-error"
        }, health.gitAvailable ? "git \u53EF\u7528" : "git \u4E0D\u53EF\u7528\uFF08\u5FEB\u7167\u5F15\u64CE\u4F9D\u8D56 git\uFF09"),
        " \xB7 \u5FEB\u7167\u5B58\u50A8\uFF1Ahome " + health.homeStores + " \u4E2A\u5DE5\u4F5C\u533A" + (health.fallbackStores ? "\uFF0C\u964D\u7EA7 " + health.fallbackStores + " \u4E2A" : "")
      ) : null,
      React.createElement("input", {
        className: "dsh-recall-ex-input",
        placeholder: "\u641C\u7D22\u5DE5\u4F5C\u533A / \u4F1A\u8BDD\u6807\u9898 / \u6D88\u606F\u5185\u5BB9 / ID",
        value: query,
        spellCheck: false,
        onChange: (e) => setQuery(e.target.value)
      }),
      treeNodes.length > 0 ? React.createElement("div", { className: "dsh-recall-tree" }, ...treeNodes) : null,
      items && items.length === 0 && !q ? React.createElement("div", { className: "dsh-recall-ex-note", key: "empty" }, "\u5728\u4EFB\u610F\u5DE5\u4F5C\u533A\u53D1\u9001\u4E00\u6761\u6D88\u606F\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u5FEB\u7167\u3002") : null,
      q && filteredItems && filteredItems.length === 0 ? React.createElement("div", { className: "dsh-recall-ex-note", key: "no-match" }, "\u65E0\u5339\u914D\u5FEB\u7167") : null,
      renderDeleteAllConfirm(),
      React.createElement(
        "div",
        { className: "dsh-recall-panel-actions" },
        state.message ? React.createElement("span", { className: "dsh-recall-ex-status" + (state.error ? " dsh-recall-ex-status-error" : " dsh-recall-ex-status-success") }, state.message) : null,
        limit < total ? React.createElement("button", {
          type: "button",
          className: "dsh-recall-btn",
          disabled: state.busy,
          onClick: loadMore
        }, "\u52A0\u8F7D\u66F4\u591A") : null,
        React.createElement("button", { type: "button", className: "dsh-recall-btn", disabled: state.busy, onClick: refresh }, "\u5237\u65B0"),
        React.createElement("button", {
          type: "button",
          className: "dsh-recall-btn dsh-recall-btn-danger",
          disabled: state.busy,
          title: "\u5220\u9664\u5168\u90E8\u5DE5\u4F5C\u533A\u7684\u6240\u6709\u5FEB\u7167\uFF1B\u4F1A\u76F4\u63A5\u6838\u5BF9\u5E76\u5220\u9664 git tag\uFF08\u5373\u4F7F\u5217\u8868\u4E3A\u7A7A\u4E5F\u53EF\u6E05\u7406\u6B8B\u7559\uFF09",
          onClick: () => setConfirming({ kind: "all" })
        }, "\u5168\u90E8\u5220\u9664"),
        React.createElement("button", {
          type: "button",
          className: "dsh-recall-btn",
          disabled: state.busy,
          title: "\u7ACB\u5373\u5BF9\u5168\u90E8\u5DE5\u4F5C\u533A\u6267\u884C\u4E00\u6B21 git gc\uFF08\u538B\u7F29\u5BF9\u8C61\u5E93\u91CA\u653E\u7A7A\u95F4\uFF09",
          onClick: () => run("gc", {}, "gc \u5B8C\u6210")
        }, "\u7ACB\u5373 gc")
      ),
      errors && errors.length > 0 ? React.createElement(
        "div",
        { className: "dsh-recall-ex-note", key: "errors" },
        React.createElement(
          "div",
          { className: "dsh-recall-ex-status" },
          "\u6700\u8FD1\u9519\u8BEF\uFF1A",
          (showAllErrors ? errors : errors.slice(0, 5)).map((e, i) => React.createElement("div", { key: i, className: "dsh-recall-ex-note" }, clockText2(e.time) + "  " + e.message))
        ),
        React.createElement(
          "div",
          { className: "dsh-recall-panel-actions" },
          errors.length > 5 ? React.createElement("button", { type: "button", className: "dsh-recall-ex-chip", onClick: () => setShowAllErrors((v) => !v) }, showAllErrors ? "\u6536\u8D77" : "\u5C55\u5F00\u5168\u90E8 (" + errors.length + ")") : null,
          React.createElement("button", { type: "button", className: "dsh-recall-ex-chip", onClick: clearErrors }, "\u6E05\u7A7A")
        )
      ) : null
    );
  }
  function ExcludeFilesSection() {
    const [files, setFiles] = React.useState(null);
    const [error, setError] = React.useState("");
    function load() {
      api("exclude-get", {}).then((res) => {
        if (res && res.ok) {
          setFiles(res.files || []);
          setError("");
          return;
        }
        if (res && res.unsupported) {
          setError("\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301\u5FEB\u7167\u529F\u80FD\uFF0C\u6392\u9664\u914D\u7F6E\u4E0D\u53EF\u7528\u3002");
          return;
        }
        setError(res && (res.message || res.error) || "\u65E0\u6CD5\u8BFB\u53D6\u6392\u9664\u914D\u7F6E");
      }).catch((e) => setError(String(e)));
    }
    React.useEffect(() => {
      load();
    }, []);
    if (error) {
      return React.createElement(
        "div",
        { className: "dsh-recall-ex-card" },
        React.createElement("div", { className: "dsh-recall-ex-note" }, error),
        React.createElement(
          "div",
          { className: "dsh-recall-panel-actions" },
          React.createElement("button", { type: "button", className: "dsh-recall-btn", onClick: load }, "\u91CD\u8BD5")
        )
      );
    }
    if (files === null) {
      return React.createElement("div", { className: "dsh-recall-ex-note" }, "\u6B63\u5728\u52A0\u8F7D\u6392\u9664\u914D\u7F6E\u2026");
    }
    if (!files.length) {
      return React.createElement("div", { className: "dsh-recall-ex-note" }, "\u5C1A\u672A\u521B\u5EFA\u4EFB\u4F55\u5FEB\u7167\u5B58\u50A8\uFF1A\u5728\u4EFB\u610F\u5DE5\u4F5C\u533A\u53D1\u9001\u4E00\u6761\u6D88\u606F\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u53EF\u7F16\u8F91\u7684\u6392\u9664\u914D\u7F6E\u3002");
    }
    return React.createElement(
      "div",
      { className: "dsh-recall-ex-card" },
      ...files.map((f) => React.createElement(ExcludeCard, { key: f.path, file: f }))
    );
  }
  function ConfigForm() {
    const [baseline, setBaseline] = React.useState(null);
    const [draft, setDraft] = React.useState(null);
    const [envLocks, setEnvLocks] = React.useState({});
    const [overridden, setOverridden] = React.useState({});
    const [writable, setWritable] = React.useState(true);
    const [state, setState] = React.useState({ busy: false, message: "", error: false });
    const [showAdvanced, setShowAdvanced] = React.useState(false);
    function load() {
      api("config-get", {}).then((res) => {
        if (res && res.ok) {
          const v = res.values || {};
          const next = {
            gcSnaps: String(v.gcSnaps == null ? "" : v.gcSnaps),
            gcHours: String(v.gcHours == null ? "" : v.gcHours),
            maxFileBytes: bytesToMb2(v.maxFileBytes),
            maxSnapshotsPerWorkspace: String(v.maxSnapshotsPerWorkspace == null ? "" : v.maxSnapshotsPerWorkspace),
            baseExcludes: Array.isArray(v.baseExcludes) ? v.baseExcludes.join("\n") : "",
            refillDraft: v.refillDraft !== false,
            snapshotEnabled: v.snapshotEnabled !== false,
            archiveOriginal: v.archiveOriginal !== false,
            retentionDays: String(v.retentionDays == null ? "" : v.retentionDays)
          };
          setDraft(next);
          setBaseline(next);
          setEnvLocks(res.envLocks || {});
          setOverridden(res.overridden || {});
          setWritable(res.writable !== false);
        } else {
          setState({ busy: false, message: res && (res.message || res.error) || "\u65E0\u6CD5\u8BFB\u53D6\u914D\u7F6E", error: true });
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }));
    }
    React.useEffect(() => {
      load();
    }, []);
    function edit(key, value) {
      setDraft((d) => Object.assign({}, d, { [key]: value }));
    }
    function save() {
      if (state.busy || !draft || !baseline) return;
      const patch = {};
      for (const key of ["gcSnaps", "gcHours", "maxFileBytes", "maxSnapshotsPerWorkspace", "baseExcludes", "refillDraft", "snapshotEnabled", "archiveOriginal", "retentionDays"]) {
        if (draft[key] !== baseline[key]) patch[key] = draft[key];
      }
      if (!Object.keys(patch).length) {
        setState({ busy: false, message: "\u6CA1\u6709\u4FEE\u6539", error: false });
        return;
      }
      const clean = {};
      if (patch.gcSnaps !== void 0) {
        const n = parseInt(patch.gcSnaps, 10);
        if (!Number.isFinite(n) || n < 1) {
          setState({ busy: false, message: "\u5FEB\u7167\u6761\u6570\u9608\u503C\u5FC5\u987B\u662F >= 1 \u7684\u6574\u6570", error: true });
          return;
        }
        clean.gcSnaps = n;
      }
      if (patch.gcHours !== void 0) {
        const n = parseInt(patch.gcHours, 10);
        if (!Number.isFinite(n) || n < 1) {
          setState({ busy: false, message: "gc \u5C0F\u65F6\u9608\u503C\u5FC5\u987B\u662F >= 1 \u7684\u6574\u6570", error: true });
          return;
        }
        clean.gcHours = n;
      }
      if (patch.maxFileBytes !== void 0) {
        const mb = Number(patch.maxFileBytes);
        if (!Number.isFinite(mb) || mb < 0.01) {
          setState({ busy: false, message: "\u6587\u4EF6\u5927\u5C0F\u4E0A\u9650\u81F3\u5C11 0.01 MB", error: true });
          return;
        }
        clean.maxFileBytes = Math.round(mb * 1048576);
      }
      if (patch.maxSnapshotsPerWorkspace !== void 0) {
        const n = parseInt(patch.maxSnapshotsPerWorkspace, 10);
        if (!Number.isFinite(n) || n < 0) {
          setState({ busy: false, message: "\u5FEB\u7167\u603B\u91CF\u4E0A\u9650\u5FC5\u987B\u662F >= 0 \u7684\u6574\u6570\uFF080 \u8868\u793A\u4E0D\u9650\u5236\uFF09", error: true });
          return;
        }
        clean.maxSnapshotsPerWorkspace = n;
      }
      if (patch.refillDraft !== void 0) clean.refillDraft = Boolean(patch.refillDraft);
      if (patch.snapshotEnabled !== void 0) clean.snapshotEnabled = Boolean(patch.snapshotEnabled);
      if (patch.archiveOriginal !== void 0) clean.archiveOriginal = Boolean(patch.archiveOriginal);
      if (patch.retentionDays !== void 0) {
        const n = parseInt(patch.retentionDays, 10);
        if (!Number.isFinite(n) || n < 0) {
          setState({ busy: false, message: "\u4FDD\u7559\u5929\u6570\u5FC5\u987B\u662F >= 0 \u7684\u6574\u6570\uFF080 \u8868\u793A\u4E0D\u542F\u7528\uFF09", error: true });
          return;
        }
        clean.retentionDays = n;
      }
      if (patch.baseExcludes !== void 0) {
        clean.baseExcludes = String(patch.baseExcludes).split("\n").map((l) => l.trim()).filter(Boolean);
      }
      setState({ busy: true, message: "\u4FDD\u5B58\u4E2D\u2026", error: false });
      api("config-set", { patch: clean }).then((res) => {
        if (res && res.ok) {
          setState({ busy: false, message: "\u5DF2\u4FDD\u5B58\u5E76\u5373\u65F6\u751F\u6548", error: false });
          load();
        } else {
          setState({ busy: false, message: res && (res.message || res.error) || "\u4FDD\u5B58\u5931\u8D25", error: true });
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }));
    }
    function numRow(key, label, hint, opts) {
      const locked = Boolean(envLocks && envLocks[key]);
      const changed = Boolean(draft && baseline && draft[key] !== baseline[key]);
      return React.createElement(
        "div",
        { className: "dsh-recall-cfg-row", key },
        React.createElement(
          "div",
          { className: "dsh-recall-cfg-line" },
          React.createElement("label", { className: "dsh-recall-cfg-label" }, label),
          React.createElement("input", {
            className: "dsh-recall-cfg-input",
            type: "number",
            value: draft ? draft[key] : "",
            disabled: locked || !writable,
            min: opts && opts.min,
            step: opts && opts.step,
            onChange: (e) => edit(key, e.target.value)
          }),
          opts && opts.suffix ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, opts.suffix) : null,
          changed && !locked ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u5DF2\u4FEE\u6539") : null,
          overridden && overridden[key] !== void 0 ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u5DF2\u8986\u76D6") : null,
          locked ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u73AF\u5883\u53D8\u91CF\u9501\u5B9A") : null
        ),
        React.createElement("div", { className: "dsh-recall-cfg-hint" }, hint)
      );
    }
    function resetDefaults() {
      if (state.busy || !writable) return;
      setState({ busy: true, message: "\u6062\u590D\u9ED8\u8BA4\u4E2D\u2026", error: false });
      api("config-reset", {}).then((res) => {
        if (res && res.ok) {
          load();
          setState({ busy: false, message: "\u5DF2\u6062\u590D\u9ED8\u8BA4\u503C", error: false });
        } else {
          setState({ busy: false, message: res && (res.message || res.error) || "\u6062\u590D\u9ED8\u8BA4\u5931\u8D25", error: true });
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }));
    }
    if (!draft) {
      return React.createElement("div", { className: "dsh-recall-ex-note" }, state.message || "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026");
    }
    return React.createElement(
      "div",
      { className: "dsh-recall-ex-card" },
      React.createElement(
        "div",
        { className: "dsh-recall-cfg-row", key: "snapshotEnabled" },
        React.createElement(
          "div",
          { className: "dsh-recall-cfg-line" },
          React.createElement("label", { className: "dsh-recall-cfg-label", htmlFor: "dsh-recall-cfg-snapshot" }, "\u542F\u7528\u5FEB\u7167"),
          React.createElement("input", {
            id: "dsh-recall-cfg-snapshot",
            type: "checkbox",
            checked: Boolean(draft.snapshotEnabled),
            disabled: !writable,
            onChange: (e) => edit("snapshotEnabled", e.target.checked)
          }),
          draft.snapshotEnabled !== baseline.snapshotEnabled ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u5DF2\u4FEE\u6539") : null,
          overridden && overridden.snapshotEnabled !== void 0 ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u5DF2\u8986\u76D6") : null
        ),
        React.createElement("div", { className: "dsh-recall-cfg-hint" }, "\u5173\u95ED\u540E\u4E0D\u518D\u65B0\u5EFA\u5FEB\u7167\uFF08\u5DF2\u6709\u5FEB\u7167\u4ECD\u53EF\u64A4\u56DE\uFF09\uFF0C\u9002\u5408\u4E34\u65F6\u7981\u7528\u5FEB\u7167\u7684\u573A\u5408")
      ),
      numRow("gcSnaps", "gc \u89E6\u53D1\u6761\u6570", "\u6BCF\u79EF\u7D2F\u591A\u5C11\u6761\u5FEB\u7167\u89E6\u53D1\u4E00\u6B21 git gc", { min: 1, step: 1 }),
      numRow("gcHours", "gc \u89E6\u53D1\u5C0F\u65F6", "\u8DDD\u4E0A\u6B21 gc \u8D85\u8FC7\u591A\u5C11\u5C0F\u65F6\u89E6\u53D1\uFF08\u4E0E\u6761\u6570\u5148\u5230\u5148\u89E6\u53D1\uFF09", { min: 1, step: 1 }),
      numRow("maxFileBytes", "\u6587\u4EF6\u5927\u5C0F\u4E0A\u9650", "\u8D85\u8FC7\u8BE5\u5927\u5C0F\u7684\u6587\u4EF6\u4E0D\u8FDB\u5FEB\u7167\u3001\u4E0D\u88AB\u56DE\u9000\u89E6\u78B0\uFF08\u5355\u4F4D MB\uFF0C\u652F\u6301\u5C0F\u6570\uFF09", { suffix: "MB", min: 0.01, step: 0.5 }),
      numRow("maxSnapshotsPerWorkspace", "\u5FEB\u7167\u603B\u91CF\u4E0A\u9650", "\u6BCF\u4E2A\u5DE5\u4F5C\u533A\u4FDD\u7559\u7684\u6700\u5927\u5FEB\u7167\u6570\uFF0C\u8D85\u9650\u81EA\u52A8\u5220\u9664\u6700\u65E7\u7684\uFF1B\u586B 0 \u8868\u793A\u4E0D\u9650\u5236", { min: 0, step: 1 }),
      numRow("retentionDays", "\u5FEB\u7167\u4FDD\u7559\u5929\u6570", "\u6309\u5929\u6570\u4FDD\u7559\u5FEB\u7167\uFF0C\u8D85\u671F\u81EA\u52A8\u5220\u9664\u6700\u65E7\u7684\uFF1B\u586B 0 \u8868\u793A\u4E0D\u542F\u7528\uFF08\u4E0E\u5FEB\u7167\u603B\u6570\u4E0A\u9650\u5404\u81EA\u751F\u6548\uFF09", { min: 0, step: 1 }),
      React.createElement(
        "div",
        { className: "dsh-recall-cfg-row", key: "refillDraft" },
        React.createElement(
          "div",
          { className: "dsh-recall-cfg-line" },
          React.createElement("label", { className: "dsh-recall-cfg-label", htmlFor: "dsh-recall-cfg-refill" }, "\u64A4\u56DE\u540E\u56DE\u586B\u8F93\u5165\u6846"),
          React.createElement("input", {
            id: "dsh-recall-cfg-refill",
            type: "checkbox",
            checked: Boolean(draft.refillDraft),
            disabled: !writable,
            onChange: (e) => edit("refillDraft", e.target.checked)
          }),
          draft.refillDraft !== baseline.refillDraft ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u5DF2\u4FEE\u6539") : null,
          overridden && overridden.refillDraft !== void 0 ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u5DF2\u8986\u76D6") : null
        ),
        React.createElement("div", { className: "dsh-recall-cfg-hint" }, "\u64A4\u56DE\u6210\u529F\u540E\u628A\u88AB\u64A4\u56DE\u7684\u6D88\u606F\u6587\u672C\u56DE\u586B\u5230\u8F93\u5165\u6846\uFF0C\u65B9\u4FBF\u4FEE\u6539\u540E\u91CD\u65B0\u53D1\u9001")
      ),
      React.createElement(
        "div",
        { className: "dsh-recall-cfg-row", key: "archiveOriginal" },
        React.createElement(
          "div",
          { className: "dsh-recall-cfg-line" },
          React.createElement("label", { className: "dsh-recall-cfg-label", htmlFor: "dsh-recall-cfg-archive" }, "\u64A4\u56DE\u540E\u5F52\u6863\u539F\u4F1A\u8BDD"),
          React.createElement("input", {
            id: "dsh-recall-cfg-archive",
            type: "checkbox",
            checked: Boolean(draft.archiveOriginal),
            disabled: !writable,
            onChange: (e) => edit("archiveOriginal", e.target.checked)
          }),
          draft.archiveOriginal !== baseline.archiveOriginal ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u5DF2\u4FEE\u6539") : null,
          overridden && overridden.archiveOriginal !== void 0 ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u5DF2\u8986\u76D6") : null
        ),
        React.createElement("div", { className: "dsh-recall-cfg-hint" }, "\u64A4\u56DE\u540E\u539F\u4F1A\u8BDD\u4ECE\u5217\u8868\u5F52\u6863\u9690\u85CF\uFF08\u53EF\u4ECE\u5F52\u6863\u627E\u56DE\uFF09\uFF1B\u5173\u95ED\u5219\u4FDD\u7559\u5728\u5217\u8868\u4E2D\uFF0C\u65B9\u4FBF\u5BF9\u7167\u56DE\u9000\u524D\u540E\u7684\u4E0A\u4E0B\u6587")
      ),
      React.createElement(SectionToggle, { title: "\u9AD8\u7EA7\uFF1A\u57FA\u7840\u6392\u9664\u8868", open: showAdvanced, onToggle: () => setShowAdvanced((v) => !v) }),
      showAdvanced ? React.createElement(
        "div",
        { className: "dsh-recall-cfg-row", key: "baseExcludes" },
        React.createElement(
          "div",
          { className: "dsh-recall-cfg-line" },
          React.createElement("label", { className: "dsh-recall-cfg-label" }, "\u57FA\u7840\u6392\u9664\u8868"),
          draft.baseExcludes !== baseline.baseExcludes ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u5DF2\u4FEE\u6539") : null,
          overridden && overridden.baseExcludes !== void 0 ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u5DF2\u8986\u76D6") : null
        ),
        React.createElement("textarea", {
          className: "dsh-recall-cfg-area",
          rows: 4,
          value: draft.baseExcludes,
          disabled: !writable,
          onChange: (e) => edit("baseExcludes", e.target.value)
        }),
        React.createElement("div", { className: "dsh-recall-cfg-hint" }, "\u5185\u7F6E\u89C4\u5219\uFF0C\u6BCF\u4E2A\u5DE5\u4F5C\u533A\u5171\u4EAB\uFF0C\u5EFA\u8BAE\u4FDD\u6301\u9ED8\u8BA4\uFF1Bgitignore \u8BED\u6CD5\u6BCF\u884C\u4E00\u6761\uFF0C\u4F18\u5148\u7EA7\u4F4E\u4E8E\u300C\u6392\u9664\u914D\u7F6E\u300D\u91CC\u7684 exclude.txt\uFF08S3-2 \u6298\u53E0\uFF09")
      ) : null,
      React.createElement(
        "div",
        { className: "dsh-recall-panel-actions" },
        state.message ? React.createElement("span", { className: "dsh-recall-ex-status" + (state.error ? " dsh-recall-ex-status-error" : " dsh-recall-ex-status-success") }, state.message) : null,
        React.createElement("button", { type: "button", className: "dsh-recall-btn", disabled: state.busy || !writable, onClick: () => setDraft(Object.assign({}, baseline)) }, "\u653E\u5F03\u4FEE\u6539"),
        React.createElement("button", {
          type: "button",
          className: "dsh-recall-btn",
          disabled: state.busy || !writable,
          title: "\u628A\u6240\u6709\u5B57\u6BB5\u6062\u590D\u5230\u63D2\u4EF6\u51FA\u5382\u9ED8\u8BA4\u503C",
          onClick: resetDefaults
        }, "\u6062\u590D\u9ED8\u8BA4"),
        React.createElement("button", { type: "button", className: "dsh-recall-btn", disabled: state.busy || !writable, onClick: save }, "\u4FDD\u5B58"),
        !writable ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, "\u53EA\u8BFB\u8BBE\u7F6E\u6E90") : null
      )
    );
  }
  function SectionToggle(props) {
    return React.createElement(
      "button",
      {
        type: "button",
        className: "dsh-recall-cardbtn",
        "aria-expanded": props.open,
        onClick: props.onToggle
      },
      React.createElement("span", { className: "dsh-recall-tree-toggle" }, props.open ? "\u25BE" : "\u25B8"),
      React.createElement("span", { style: { fontWeight: 600, fontSize: "14px", lineHeight: "22px" } }, props.title),
      props.meta ? React.createElement("span", { className: "dsh-recall-tree-meta" }, props.meta) : null
    );
  }
  function RecallSettingsCard() {
    const [open, setOpen] = React.useState(false);
    const [sections, setSections] = React.useState({ exclude: false, manage: false });
    function toggle(key) {
      setSections((prev) => Object.assign({}, prev, { [key]: !prev[key] }));
    }
    return React.createElement(
      "li",
      { className: "dsh-recall-card" + (open ? " dsh-recall-card-open" : "") },
      React.createElement(
        "button",
        {
          type: "button",
          className: "dsh-recall-cardbtn",
          "aria-expanded": open,
          "aria-label": (open ? "\u6536\u8D77" : "\u5C55\u5F00") + ": \u64A4\u56DE\u63D2\u4EF6",
          onClick: () => setOpen((v) => !v)
        },
        React.createElement(
          "span",
          { className: "dsh-recall-card-head" },
          React.createElement("span", { className: "dsh-recall-card-name" }, "\u64A4\u56DE\u63D2\u4EF6"),
          React.createElement("span", { className: "dsh-recall-card-desc" }, "\u6D88\u606F\u64A4\u56DE\uFF08\u6587\u4EF6\u5FEB\u7167 + \u5BF9\u8BDD\u56DE\u9000\uFF09\u7684\u9608\u503C\u4E0E\u6CBB\u7406")
        ),
        React.createElement("svg", {
          width: 14,
          height: 14,
          viewBox: "0 0 16 16",
          style: { color: "var(--dsw-alias-label-tertiary)", flex: "none", transition: "transform .16s", transform: open ? "rotate(180deg)" : "none" }
        }, React.createElement("path", { d: "M4 6l4 4 4-4", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }))
      ),
      open ? React.createElement(
        "div",
        { className: "dsh-recall-card-body" },
        React.createElement(ConfigForm),
        React.createElement(SectionToggle, { title: "\u6392\u9664\u914D\u7F6E\uFF08exclude.txt\uFF09", open: sections.exclude, onToggle: () => toggle("exclude") }),
        sections.exclude ? React.createElement(ExcludeFilesSection) : null,
        React.createElement(SectionToggle, { title: "\u5FEB\u7167\u7BA1\u7406", open: sections.manage, onToggle: () => toggle("manage") }),
        sections.manage ? React.createElement(ManageCard) : null
      ) : null
    );
  }
  return { RecallSettingsCard };
}

// src/client/app.js
function nextShadowPriority(entries, key) {
  let priority = -1;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !entry.options || entry.options.key !== key) continue;
    const occupied = Number.isFinite(entry.options.priority) ? entry.options.priority : 0;
    if (occupied <= priority) priority = occupied - 1;
  }
  return priority;
}
function createApp(React) {
  return function apply(ctx) {
    const slots = ctx.slots;
    if (!slots) return;
    const sessionsSvc = ctx.sessions;
    const workspacesSvc = ctx.workspaces;
    const stylesSvc = ctx.get("styles");
    if (stylesSvc && typeof stylesSvc.insert === "function") {
      stylesSvc.insert(CSS);
    } else if (typeof document !== "undefined") {
      const tag = document.createElement("style");
      tag.setAttribute("data-plugin", "dsh-recall-plugin");
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }
    const util = buildUtil();
    const { UserRecallNode } = buildRecallNode(React, util, ctx, sessionsSvc, workspacesSvc);
    const { RecallSettingsCard } = buildSettingsCards(React, util, sessionsSvc);
    for (const slotKey of ["user", "steering"]) {
      try {
        slots.inject("conversation.chat.node", () => {
          const priority = nextShadowPriority(slots.entries("conversation.chat.node"), slotKey);
          return slots.register(
            { name: "conversation.chat.node", key: slotKey, priority },
            UserRecallNode
          );
        });
      } catch (error) {
        console.error("[dsh-recall-plugin] slot register failed (" + slotKey + "):", error);
      }
    }
    try {
      slots.inject("settings.plugin.item", () => slots.register(
        { name: "settings.plugin.item", key: "dsh-recall" },
        RecallSettingsCard
      ));
    } catch (error) {
      console.error("[dsh-recall-plugin] settings card register failed:", error);
    }
  };
}

// src/client/entry.js
window.__ModuleLoader__.load({
  id: "dsh-recall-plugin",
  factory: (require2) => {
    const React = require2("react");
    return {
      name: "dsh-recall-plugin",
      inject: ["slots", "sessions", "workspaces", "timer"],
      apply: createApp(React)
    };
  }
});
