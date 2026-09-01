function titleFromEvents(events) {
  if (!Array.isArray(events)) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.type === "session/title" && e.data && typeof e.data.title === "string" && e.data.title) return e.data.title;
  }
  return null;
}
function messageTextFromEvents(events, messageId) {
  if (!Array.isArray(events) || !messageId) return null;
  for (const e of events) {
    if (e && e.type === "user/message" && e.data && String(e.data.id) === String(messageId)) {
      const blocks = Array.isArray(e.data.content) ? e.data.content : [];
      const text = blocks.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
      return text || null;
    }
  }
  return null;
}
function createSessionInfo(ctx) {
  const sessionTitles = /* @__PURE__ */ new Map();
  const messageTexts = /* @__PURE__ */ new Map();
  function liveMessageTextFast(sessionId, messageId) {
    if (!sessionId || !messageId) return null;
    const key = String(sessionId) + "\0" + String(messageId);
    if (messageTexts.has(key)) return messageTexts.get(key);
    let text = null;
    try {
      const live = ctx.sessions.get(sessionId);
      if (live) text = messageTextFromEvents(live.events, messageId);
    } catch (error) {
      text = null;
    }
    if (text !== null) messageTexts.set(key, text);
    return text;
  }
  function liveTitleFast(sessionId) {
    if (!sessionId) return null;
    if (sessionTitles.has(sessionId)) return sessionTitles.get(sessionId);
    let t = null;
    try {
      const live = ctx.sessions.get(sessionId);
      if (live) t = titleFromEvents(live.events);
    } catch (error) {
      t = null;
    }
    if (t !== null) sessionTitles.set(sessionId, t);
    return t;
  }
  return { sessionTitles, messageTexts, liveTitleFast, liveMessageTextFast };
}
export {
  createSessionInfo,
  messageTextFromEvents,
  titleFromEvents
};
