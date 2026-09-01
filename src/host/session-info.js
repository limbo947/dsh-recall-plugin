/**
 * dsh-recall-plugin — 会话信息域（R2 从 index.js 拆出）
 *
 * 会话标题/消息文本的「两段式」读取：纯函数（titleFromEvents /
 * messageTextFromEvents）模块级导出供单测与工厂共用；live 快速查询
 * （liveTitleFast / liveMessageTextFast）带 apply 级跨请求缓存（sessionTitles /
 * messageTexts Map），由 createSessionInfo 工厂生产——无模块级可变状态（HMR 假设）。
 *
 * 冷会话标题/文本要 readSession 整日志解压（10 秒级），列表首屏只查 live/缓存
 * （同步、瞬时），冷数据由 Client 拿到列表后异步调 titles/messages 端点补齐。
 */

// 从事件序列里取最新一条 session/title（倒序，标题事件通常靠后）
export function titleFromEvents(events) {
  if (!Array.isArray(events)) return null
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e && e.type === 'session/title' && e.data && typeof e.data.title === 'string' && e.data.title) return e.data.title
  }
  return null
}

// 从事件序列里取指定用户消息的纯文本（text 块拼接）
export function messageTextFromEvents(events, messageId) {
  if (!Array.isArray(events) || !messageId) return null
  for (const e of events) {
    if (e && e.type === 'user/message' && e.data && String(e.data.id) === String(messageId)) {
      const blocks = Array.isArray(e.data.content) ? e.data.content : []
      const text = blocks
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('')
      return text || null
    }
  }
  return null
}

export function createSessionInfo(ctx) {
  // 会话标题缓存：值为 null 表示「查过、确实没有」（已删除会话），同样命中缓存
  const sessionTitles = new Map()
  // 消息文本缓存：null 也缓存（避免无文本消息每次刷新重复解压冷日志）
  const messageTexts = new Map()

  function liveMessageTextFast(sessionId, messageId) {
    if (!sessionId || !messageId) return null
    const key = String(sessionId) + '\u0000' + String(messageId)
    if (messageTexts.has(key)) return messageTexts.get(key)
    let text = null
    try {
      const live = ctx.sessions.get(sessionId)
      if (live) text = messageTextFromEvents(live.events, messageId)
    } catch (error) { text = null }
    if (text !== null) messageTexts.set(key, text)
    return text
  }

  function liveTitleFast(sessionId) {
    if (!sessionId) return null
    if (sessionTitles.has(sessionId)) return sessionTitles.get(sessionId)
    let t = null
    try {
      const live = ctx.sessions.get(sessionId)
      if (live) t = titleFromEvents(live.events)
    } catch (error) { t = null }
    if (t !== null) sessionTitles.set(sessionId, t)
    return t
  }

  return { sessionTitles, messageTexts, liveTitleFast, liveMessageTextFast }
}
