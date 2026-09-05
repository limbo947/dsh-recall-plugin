# 官方文档镜像（docs/reference）

> 用途：dsh 插件开发相关官方文档的本地副本，改代码前优先查这里，避免每次联网翻文档。
>
> 归档日期：2026-09-03，对应 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 仓库 master 分支 `docs/` 目录。
>
> 归档 dsh 版本：0.1.2-rc.1（`npm run check:dsh` 的漂移比对基准；重拉镜像后同步更新本字段，见下方「更新方式」）
>
> 在线站点：https://deepseek-harness.github.io/deepseek-harness/ ｜ 每份文件头部都带「来源」注释，可溯回官方原文。

## 文件清单

| 文件 | 主题 | 官方页面 |
|---|---|---|
| [01-quickstart.md](./01-quickstart.md) | 快速开始：Web UI、工作区、运行任务 | [guide/quickstart](https://deepseek-harness.github.io/deepseek-harness/guide/quickstart) |
| [02-basic.md](./02-basic.md) | 第一个插件：入口形态（name + apply）、inject、三种形态 | [develop/basic/](https://deepseek-harness.github.io/deepseek-harness/develop/basic/) |
| [03-basic-tool.md](./03-basic-tool.md) | 开发一个 Tool（工具定义 DSL）——本项目未注册 tool，留作参照 | [develop/basic/tool](https://deepseek-harness.github.io/deepseek-harness/develop/basic/tool) |
| [04-config.md](./04-config.md) | 插件配置：Schema 校验、无硬编码可调参数、配 HMR | [develop/basic/config](https://deepseek-harness.github.io/deepseek-harness/develop/basic/config) |
| [05-publish.md](./05-publish.md) | 打包与安装：bundle/profile 双 manifest、patch 层语义、git 安装的 prepare 授权 | [develop/basic/publish](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish) |
| [06-framework.md](./06-framework.md) | 插件与生命周期：Fiber 状态机、自动清理、HMR | [develop/framework/](https://deepseek-harness.github.io/deepseek-harness/develop/framework/) |
| [07-framework-service.md](./07-framework-service.md) | 服务与依赖：Service 类、跨插件提供能力 | [develop/framework/service](https://deepseek-harness.github.io/deepseek-harness/develop/framework/service) |
| [08-framework-events.md](./08-framework-events.md) | 事件系统：事件域、事件映射 | [develop/framework/events](https://deepseek-harness.github.io/deepseek-harness/develop/framework/events) |
| [09-architecture.md](./09-architecture.md) | 架构总览：事件域选择、轮次流程、会话日志、扩展点归属 | [reference/](https://deepseek-harness.github.io/deepseek-harness/reference/) |
| [10-cordis-primer.md](./10-cordis-primer.md) | Cordis 入门：底层框架速览 | [reference/cordis-primer](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-primer) |
| [11-cookbook-conversation-node.md](./11-cookbook-conversation-node.md) | Conversation 组装与业务节点扩展路径（官方 cookbook 版 adding-a-conversation-node 已并入 subsystems/conversation；本项目撤回按钮槽位 `conversation.chat.node` 仍按此文档核验） | [reference/cookbook/adding-a-conversation-node](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-conversation-node)（在线站点构建滞后，仍展示 cookbook 版） |
| [12-cookbook-settings-card.md](./12-cookbook-settings-card.md) | 实操：添加设置卡片（本项目设置页卡片 slot） | [reference/cookbook/adding-a-settings-card](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-settings-card) |
| [13-cookbook-extension.md](./13-cookbook-extension.md) | 扩展实操手册：功能 → 能力映射总表 | [reference/cookbook/extension-cookbook](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/extension-cookbook) |

## 与 AGENTS.md 合规清单的对应

| 合规条目 | 支撑文档 |
|---|---|
| #1 入口形态 / inject | 02-basic.md、06-framework.md |
| #2 注册即自动清理 | 06-framework.md |
| #3 Config = Schemastery schema / 参数可配置 | 04-config.md |
| #4 bundle patch 按行替换语义 | 05-publish.md |
| #5 HMR 无跨 apply 状态 | 04-config.md、06-framework.md |
| #6 事件域选对（session/event 持久事实） | 09-architecture.md、08-framework-events.md |
| #7 扩展点归位（Chat 节点 / 设置卡片 / fork） | 09-architecture.md、11、12、13 |

## 更新方式

官方源在 deepseek-harness 仓库的 `docs/` 目录。镜像文件头部**没有**「来源」注释（与旧版 README 声称不符，2026-09-01 重拉时确认）；各文件与官方源路径的对应关系如下，重拉时按此表覆盖同名文件（2026-08-31 归档后官方重构过 docs/ 目录，源路径已从 `docs/guide|develop` 迁至 `docs/user/guide|develop` 等新位置）：

| 镜像文件 | 官方源路径（master `docs/`） |
|---|---|
| 01-quickstart.md | `user/guide/index.zh.md` |
| 02-basic.md | `user/develop/basic/index.zh.md` |
| 03-basic-tool.md | `user/develop/basic/tool.zh.md` |
| 04-config.md | `user/develop/basic/config.zh.md` |
| 05-publish.md | `user/develop/basic/publish.zh.md` |
| 06-framework.md | `user/develop/framework/index.zh.md` |
| 07-framework-service.md | `user/develop/framework/service.zh.md` |
| 08-framework-events.md | `user/develop/framework/events.zh.md` |
| 09-architecture.md | `architecture.zh.md` |
| 10-cordis-primer.md | `cordis-primer.zh.md` |
| 11-cookbook-conversation-node.md | `subsystems/conversation.zh.md`（原 cookbook adding-a-conversation-node 并入） |
| 12-cookbook-settings-card.md | `cookbook/adding-a-settings-card.zh.md` |
| 13-cookbook-extension.md | `cookbook/extension-cookbook.zh.md` |

> 重拉后**必须同步更新**本文件头部的「归档日期」与「归档 dsh 版本」两个字段——`npm run check:dsh` 据此检测镜像漂移（版本一致才安静退出）。

```powershell
# 示例：重拉架构总览（其余文件路径见上表）
iwr -UseBasicParsing 'https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/architecture.zh.md' -OutFile '.\09-architecture.md'
```

直连失败时加 `-Proxy 'http://127.0.0.1:48046'`。
