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
import { buildVersionPager } from './version-pager.js'
import { appLog } from './log.js'
import type { ReactApi, UtilApi } from './util.js'
import type { ClientContext, ClientSessionsService, ClientWorkspacesService, SlotsService, SlotEntryOptions, StylesService } from '../types/client-contract.js'

export function nextShadowPriority(entries: SlotEntryOptions[] | null | undefined, key: string): number {
  let priority = -1
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !entry.options || entry.options.key !== key) continue
    const p = entry.options.priority
    const occupied = typeof p === 'number' && Number.isFinite(p) ? p : 0
    if (occupied <= priority) priority = occupied - 1
  }
  return priority
}

export function createApp(React: ReactApi) {
  return function apply(ctx: ClientContext): void {
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
    const stylesSvc = ctx.get<StylesService>('styles')
    if (stylesSvc && typeof stylesSvc.insert === 'function') {
      stylesSvc.insert(CSS)
    } else if (typeof document !== 'undefined') {
      const tag = document.createElement('style')
      tag.setAttribute('data-plugin', 'dsh-recall-plugin')
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    const util = buildUtil()
    // uiWorkspace：0.1.6-alpha.2 起会话导航（openSession）所在服务（0.1.2-alpha.1
    // 起存在，entry.ts inject 已声明）；archiveSession 归档仍走 workspaces（I7）。
    const uiWorkspaceSvc = ctx.uiWorkspace
    const { UserRecallNode } = buildRecallNode(React, util, ctx, sessionsSvc, workspacesSvc, uiWorkspaceSvc)
    const { RecallSettingsCard } = buildSettingsCards(React, util, sessionsSvc, workspacesSvc, uiWorkspaceSvc)
    // 版本翻页器：挂在回合末尾的官方 assistant-actions list 槽（0.2.1 起存在；
    // 旧版宿主没有该槽时 inject 静默 no-op，撤回/编辑主链不受影响）
    const { VersionPager, VersionHeaderAction } = buildVersionPager(React, util, workspacesSvc, uiWorkspaceSvc)

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
        // 单 slot 注册失败只记日志不抛：其余 slot 与插件主链继续（降级可用）
        appLog.error('slot register failed (' + slotKey + '):', error)
      }
    }

    // 版本翻页器（‹ X/N ›）：assistant-actions 是 list 槽（非 keyed），官方在
    // 每个回合的 turn-tail 里渲染一次；组件自身判断「是否当前会话最后一轮」
    // 后才显示，避免同一页出现多个入口。旧版宿主无此槽时 inject 静默 no-op。
    try {
      // list 槽按 id 认条目、order 排位置；inject 拿到的是当前 sessionId
      // （官方 message-feedback 同款写法），翻页器据此查自己的版本家族
      slots.inject('conversation.chat.assistant-actions', () => slots.register(
        {
          name: 'conversation.chat.assistant-actions',
          id: 'recall-version-pager',
          order: 20,
          inject: (sessionId: string) => ({ sessionId }),
        },
        VersionPager
      ))
    } catch (error) {
      appLog.error('version pager register failed:', error)
    }

    // 会话头兜底入口：消息区（含 assistant-actions）因模型 provider 缺失等原因
    // 不渲染时仍可切版本。该槽是 session scope，官方 standard props 会注入
    // sessionId；组件在消息区翻页器可用时自动隐藏，避免双入口。
    try {
      slots.inject('conversation.session.header.actions', () => slots.register(
        {
          name: 'conversation.session.header.actions',
          id: 'recall-version-header',
          order: 20,
        },
        VersionHeaderAction
      ))
    } catch (error) {
      appLog.error('version header action register failed:', error)
    }

    // 「插件配置」分区挂撤回卡片：settings.plugin.item 是 root 级 keyed slot
    // （官方 ui-settings-plugins 的 configurable 标签页声明，按 settings
    // namespace 作为 entryKey 分发）。key 必须与 Host 端注册的 namespace
    // 'dsh-recall' 一致——卡片只渲染「Host 服务的 namespace」与「slot 注册的
    // 卡片」的交集。各 namespace 独占自己的 key，无同 key 抢占，不需要
    // priority（与 conversation.chat.node 覆盖默认渲染器是两套语义）。
    // 0.1.6-alpha.2 起该 slot 随旧设置页插件 tab 一起移除，仅旧版 dsh 有效；
    // slots.inject 对未声明 key 是静默 no-op（spec 为 undefined 直接 return），
    // 两个 slot 键并注册各吃各的版本，无需运行时探测。
    try {
      slots.inject('settings.plugin.item', () => slots.register(
        { name: 'settings.plugin.item', key: 'dsh-recall' },
        RecallSettingsCard
      ))
    } catch (error) {
      // 同上：单 slot 失败不影响其余注册（旧版 dsh 上该 key 本就是静默 no-op）
      appLog.error('settings card register failed:', error)
    }

    // 0.1.6-alpha.2 新插件管理页（ui-plugin-manager）：bundle 自带配置挂
    // plugins.bundle.config（keyed/root，key=bundle 包名），渲染在 bundle 页
    // （page 视图，自含保存控件——RecallSettingsCard 本就自绘完整表单，兼容）。
    // key 必须与 npm 包名一致，插件管理页据此把表单关联回 dsh-recall-plugin 的
    // bundle 页。owner 会下发 { view } prop，组件忽略该字段无副作用。
    try {
      slots.inject('plugins.bundle.config', () => slots.register(
        { name: 'plugins.bundle.config', key: 'dsh-recall-plugin' },
        RecallSettingsCard
      ))
    } catch (error) {
      // 同上：双 slot 键各吃各的版本，单侧失败互不牵连
      appLog.error('plugin manager config register failed:', error)
    }
    // 装配完成一行 info：现场排障（「Host 活 Client 死」类症状，I29）时
    // 开 dsh-recall.debug 开关即可确认 client 半是否真的 apply 过
    appLog.info('client applied')
  }
}
