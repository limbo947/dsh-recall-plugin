/**
 * dsh-recall-plugin — client 装配（apply 组装各子模块）
 *
 * 原 lib/client.js 的 apply(ctx) 主体：注入 CSS、组装 util / 撤回节点 /
 * 设置卡片，注册 chat.node（user+steering，负值 priority 冲突递减重试）与
 * settings.plugin.item（key=namespace 'dsh-recall'）。React 由构建入口的
 * factory 通过 require("react") 传入（loader 平台模块表提供）。
 */

import { CSS } from './css.js'
import { buildUtil } from './util.js'
import { buildRecallNode } from './recall-node.js'
import { buildSettingsCards } from './settings-cards.js'

export function nextShadowPriority(entries, key) {
  let priority = -1
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !entry.options || entry.options.key !== key) continue
    const occupied = Number.isFinite(entry.options.priority) ? entry.options.priority : 0
    if (occupied <= priority) priority = occupied - 1
  }
  return priority
}

export function createApp(React) {
  return function apply(ctx) {
    // 0.1.2 起 client runner 用 guard facade 包 ctx：只有插件对象 inject 数组
    // 声明过的服务才可经 ctx.<name> 属性访问（跨 scope 解析由 cordis inject
    // 机制完成）；ctx.get() 在新作用域下拿不到 slots 等服务，会静默拿到
    // undefined——必须声明式访问（见 entry.js 的 inject 清单）。
    const slots = ctx.slots
    if (!slots) return
    // 官方会话服务：fork 到已完成 turn 前缀 + open 切到新会话；
    // workspaces 的归档只是从列表隐藏、可恢复，用来收走回退前的原会话。
    const sessionsSvc = ctx.sessions
    const workspacesSvc = ctx.workspaces

    // styles 服务 0.1.2 已不存在（CSS 由官方打包管道按 materialize 注入，
    // 本插件是手写常量注入），保留 get 探测 + <style> 降级——get 对缺失服务
    // 安全返回 undefined，不会像未声明的属性访问那样抛守卫错误。
    const stylesSvc = ctx.get('styles')
    if (stylesSvc && typeof stylesSvc.insert === 'function') {
      stylesSvc.insert(CSS)
    } else if (typeof document !== 'undefined') {
      const tag = document.createElement('style')
      tag.setAttribute('data-plugin', 'dsh-recall-plugin')
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    const util = buildUtil()
    const { UserRecallNode } = buildRecallNode(React, util, ctx, sessionsSvc, workspacesSvc)
    const { RecallSettingsCard } = buildSettingsCards(React, util, sessionsSvc)

    // conversation.chat.node 是 keyed slot，同一 key 的最低 priority 渲染。
    // 默认平台渲染器通常为 0，dsh-turn-fold 等插件可能已占 -1；旧实现固定
    // 尝试 -1..-3，但 slots.inject 的回调可能晚于 inject 返回才执行，冲突异常
    // 无法被外层 try/catch 可靠捕获，实际不会继续重试。改为在 slot 回调真正
    // 执行时读取现有 entries，为每个 key 动态选择“当前最低值 - 1”，因此既能
    // 覆盖默认渲染器，也能避开任意第三方插件已占用的负 priority。
    // chat.node 的 keyed key 与节点 UI 投影 kind 对齐：'user' 是常规用户消息；
    // 'steering' 是 agent 运行中插入的转向指令。两个 key 独立计算，互不抢占。
    for (const slotKey of ['user', 'steering']) {
      try {
        slots.inject('conversation.chat.node', () => {
          const priority = nextShadowPriority(slots.entries('conversation.chat.node'), slotKey)
          return slots.register(
            { name: 'conversation.chat.node', key: slotKey, priority },
            UserRecallNode
          )
        })
      } catch (error) {
        console.error('[dsh-recall-plugin] slot register failed (' + slotKey + '):', error)
      }
    }

    // 「插件配置」分区挂撤回卡片：settings.plugin.item 是 root 级 keyed slot
    // （官方 ui-settings-plugins 的 configurable 标签页声明，按 settings
    // namespace 作为 entryKey 分发）。key 必须与 Host 端注册的 namespace
    // 'dsh-recall' 一致——卡片只渲染「Host 服务的 namespace」与「slot 注册的
    // 卡片」的交集。各 namespace 独占自己的 key，无同 key 抢占，不需要
    // priority（与 conversation.chat.node 覆盖默认渲染器是两套语义）。
    try {
      slots.inject('settings.plugin.item', () => slots.register(
        { name: 'settings.plugin.item', key: 'dsh-recall' },
        RecallSettingsCard
      ))
    } catch (error) {
      console.error('[dsh-recall-plugin] settings card register failed:', error)
    }
  }
}
