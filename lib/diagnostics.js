const ENV_PATTERNS = [
  ["git", [/command not found/i, /not recognized/i, /git: not found/i, /is not a git command/i]],
  ["space", [/no space left on device/i, /disk quota exceeded/i, /enospc/i]],
  ["permission", [/permission denied/i, /operation not permitted/i, /not permitted/i, /access is denied/i]],
  ["lock", [/could not lock .*file exists/i, /unable to create .*\.lock/i, /fatal: cannot lock/i]],
  ["mkdir", [/fatal: cannot mkdir .*file exists/i, /mkdir: cannot create directory/i]]
];
const ENV_HINTS = {
  git: "\u672A\u68C0\u6D4B\u5230 git CLI \u6216\u7248\u672C\u8FC7\u65E7\uFF1A\u8BF7\u5B89\u88C5\u6216\u5347\u7EA7 git\uFF0C\u5B8C\u6210\u540E\u81EA\u52A8\u6062\u590D",
  space: "\u78C1\u76D8\u7A7A\u95F4\u5DF2\u6EE1\uFF0C\u5FEB\u7167\u5199\u5165\u5931\u8D25\uFF1A\u6E05\u7406\u78C1\u76D8\u7A7A\u95F4\u540E\u81EA\u52A8\u6062\u590D",
  permission: "\u5FEB\u7167\u76EE\u5F55\u65E0\u5199\u5165\u6743\u9650\uFF1A\u8BF7\u68C0\u67E5\u76EE\u5F55\u6743\u9650\u540E\u91CD\u8BD5",
  lock: "\u7591\u4F3C\u591A\u4E2A DSH \u5B9E\u4F8B\u5E76\u53D1\u4F7F\u7528\u540C\u4E00\u5FEB\u7167\u5E93\uFF1A\u8BF7\u786E\u8BA4\u53EA\u542F\u52A8\u4E86\u4E00\u4E2A\uFF1B\u786E\u8BA4\u540E\u4ECD\u5931\u8D25\u65F6\uFF0C\u6309\u300C\u8BBE\u7F6E \xB7 \u63D2\u4EF6\u914D\u7F6E \xB7 \u6700\u8FD1\u9519\u8BEF\u300D\u4E2D\u7684\u8DEF\u5F84\u5220\u9664\u9501\u6587\u4EF6",
  mkdir: "\u5FEB\u7167\u5B58\u50A8\u76EE\u5F55\u88AB\u540C\u540D\u6587\u4EF6\u5360\u7528\uFF1A\u5904\u7406\u540E\u81EA\u52A8\u6062\u590D"
};
function classifyEnvError(text) {
  const s = String(text || "");
  for (const [kind, patterns] of ENV_PATTERNS) {
    for (const p of patterns) {
      if (p.test(s)) return kind;
    }
  }
  return null;
}
function buildFeedbackError(raw) {
  const text = String(raw || "");
  const kind = classifyEnvError(text);
  if (!kind) return { error: text.slice(0, 300), kind: "unknown" };
  return { error: ENV_HINTS[kind], kind };
}
export {
  ENV_HINTS,
  buildFeedbackError,
  classifyEnvError
};
