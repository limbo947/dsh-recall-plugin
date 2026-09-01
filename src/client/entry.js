/**
 * dsh-recall-plugin — client 构建入口（esbuild 打包）
 *
 * 这是 src/client/ 多文件的唯一构建入口：esbuild 把它与 app/util/recall-node/
 * settings-cards/css 打包成单文件 lib/client.js，react 标记 external——由
 * factory 的 require("react") 在运行时从 loader 平台模块表提供。
 *
 * loader 契约（spike 核验）：window.__ModuleLoader__.load({id, factory})，
 * factory 是 CJS 风格同步 require，只认「包名」粒度；bundle 以 classic
 * <script> 原文 serve，顶层 import 会 SyntaxError 拒载。因此产物必须是
 * 单文件 factory 注册格式，不能是 ESM 多文件相对 import。
 *
 * inject 声明（0.1.2 起硬要求）：client runner 的 dynamicCordisContext 门禁
 * 只对「插件对象 inject 数组里声明过的服务」做跨 scope 解析（ctx.<name> 属
 * 性访问）；未声明服务的 ctx.get() 在新作用域下拿不到服务实例（guard 教学语
 * 也明确要求声明式）。缺一个都会让 apply 拿到 undefined——slots 拿不到直接
 * 静默 return（UI 全消失），其余服务在事件回调里用到，缺失同样不工作。
 *
 * 双版本兼容（0.1.1-rc.2 ↔ 0.1.2-alpha.1，2026-08-31 cordis 4.0.1 实测）：
 * - conversation 服务 0.1.2 才存在（ui-conversation），0.1.1-rc.2 没有。
 *   静态声明它会让 0.1.1-rc.2 上的插件 fiber「合法 pending 不启动」（cordis
 *   对未满足声明的静默跳过），UI 全灭——所以 conversation 不能进 inject，
 *   统一走 ctx.get('conversation') 探测 + 降级（见 recall-node fillDraft）。
 * - 其余 4 个服务两端都存在，声明安全；styles 服务 0.1.2 已不存在，不声明
 *   （声明缺失服务会让 fiber 永久 pending），用 ctx.get 可选探测 + <style> 降级。
 */

// @ts-nocheck —— TS 迁移 M1 临时豁免：window.__ModuleLoader__ 全局在
// M3 client-contract.ts 的 declare global 建档（52 slot + loader 契约），
// M7 entry.ts 迁移时随全局类型接入移除本行。
import { createApp } from './app.js'

window.__ModuleLoader__.load({
  id: 'dsh-recall-plugin',
  factory: (require) => {
    const React = require('react')
    return {
      name: 'dsh-recall-plugin',
      inject: ['slots', 'sessions', 'workspaces', 'timer'],
      apply: createApp(React)
    }
  }
})
