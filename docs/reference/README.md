# 官方文档镜像（docs/reference）

> 用途：dsh 插件开发相关官方文档的本地副本，改代码前优先查这里，避免每次联网翻文档。
>
> 归档日期：2026-10-09，对应 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 仓库 `dsh-v0.2.1-alpha.2` tag `docs/` 目录（raw.githubusercontent 按 tag 拉取；直连可用，无需代理）。
>
> 归档 dsh 版本：0.2.1-alpha.2（`npm run check:dsh` 的漂移比对基准；重拉镜像后同步更新本字段，见下方「更新方式」）
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

> 2026-09-24 重拉记录：本机 `Invoke-WebRequest`（直连与官方代理两种通道）均在 TLS 握手阶段失败
> （`The SSL connection could not be established`），改用 `curl.exe`（系统自带，`curl.exe -sS -m 60 -o <文件> <URL>`）
> 直连即成功——个别文件需重试 1–2 次（首次 0 字节）。镜像文件统一 LF、无 BOM，比对时应先归一化 CRLF 再逐字节比较。
>
> 2026-09-24 二次重拉（`dsh-v0.1.7-rc.1` → `dsh-v0.1.7-rc.2`）：13 源中仅 `09-architecture.md` 有实质差异
> （3 处替换、净 +55 字符：「循环发送不可变请求」措辞收紧；「模型可见即已记录」新增「工具变更不依赖能力；
> [Session 工具历史](../packages/core/session/README.zh.md)提供提供方声明」；系统提示词段补「包括同时发生的
> 受支持工具更新」——后两处对应本版新增的工具热更能力），其余 12 份逐字节相同。
>
> 2026-09-29 三次重拉（`dsh-v0.1.7-rc.2` → `dsh-v0.2.0-rc.1`）：13 源中同样只有 `09-architecture.md` 有实质差异
> （新增一行「失败步骤会[记录缺失的工具结果](../packages/core/agent-loop/README.zh.md#understand-the-implementation)。」，
> 净 +121 字节——对应本版「修复工具调度异常后对话无法继续」的 `ToolCallRecovery` 重构），其余 12 份逐字节相同。
>
> 2026-09-29 四次重拉（`dsh-v0.2.0-rc.1` → `dsh-v0.2.0-rc.2`）：13 源中依旧只有 `09-architecture.md` 有实质差异
> （「桌面应用」段重写：桌面端在签名资源内携带精确匹配的 dsh 运行时、`Desktop 与 npm CLI 共享产品数据，但包、启用选择与锁文件保持独立。
> Desktop 内置 CLI 管理其已初始化的插件。」，净 **−173 字符**——对应本版「桌面端可在菜单栏管理/安装 dsh 命令与插件」的新能力，
> 属桌面载体说明的措辞更新），其余 12 份逐字节相同；本轮直连 `raw.githubusercontent` 一次成功，无需代理或重试。
>
> 2026-10-03 五次重拉（`dsh-v0.2.0-rc.2` → `dsh-v0.2.1-alpha.1`）：13 源中 **4 份有实质差异、9 份逐字节相同**——
> 01-quickstart 新增「在反向代理之后发布 Web UI」链接（对应 `--public-url`）；09-architecture 两处：桌面端
> 「默认端口为 `19387`」改「默认监听系统分配的端口」（对应 Windows 保留端口启动修复）、「运行时不变量检查模型请求是否可重建」
> 句改「每个模型请求都必须能从日志重建」（invariant 插件移除的文档同步）；11-cookbook-conversation-node 工具 delta 匹配
> 语义放宽（名称未到达即可按 callId 匹配 start、准备态 Tool 节点延后显示）+ 新增 `ConversationNodeDefinitionInput`
> 表形式注册说明；13-cookbook-extension 两处链接改指 reference 新路径 + 定时任务投递改
> `followup(…, {source: {kind: 'schedule'}})`（对应自动化任务改 Web 内置能力）。本轮直连 `raw.githubusercontent` 一次成功（首轮缺
> 4 文件系执行环境中断，补齐后 13/13 齐），无需代理或重试。
>
> 2026-10-09 六次重拉（`dsh-v0.2.1-alpha.1` → `dsh-v0.2.1-alpha.2`）：13 源中 **仅 `09-architecture.md` 有实质差异、其余 12 份逐字节相同**。
> 该份净 **+68 字节**，五处——① 删去两句冗余导语（「建议使用 agent 探索代码库」「以下是向 Cordis 树贡献内容的部分核心包」）；
> ② patch 层语义扩写：新增「`preset` patch 在目标声明的 `config.plugins` 内应用这些操作，沿用相同的层优先级」；
> ③ 核心包表**移除 `webhook/webhook` 行**（webhook 整族包在本版被删，与全树 diff 的「仅 alpha.1 有」清单互证）；
> ④ AgentLoop 与轮次流程伪代码改写：「project runtime context at fallback」「reconcile retained runtime context」、
> 「每次尝试刷新已注册运行时事实、协调绑定的提示词、仅接纳一次用户消息并恢复被移除的运行时上下文」（对应 pi-ai 路由的动态工具增删与系统提示词更新）；
> ⑤ 新增「[工作目录](subsystems/working-directory.zh.md) 提供用户上下文和执行路径，**不改变原始项目标识、沙箱写入根目录或已有进程目录**」
> —— 此句是本轮对撤回插件的关键澄清（工作目录切换不动写入根，影子仓库范围假设不受影响）；Agent Teams 描述改「持久 roster、任务状态和**直接 inbox 消息**协作」（对应 inbox 直投重构）。
> 本轮直连 `raw.githubusercontent` 一次成功，13/13 齐，无需代理或重试。
