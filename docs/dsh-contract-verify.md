# DSH 可应用契约二次验证记录（dsh-contract-verify）

> 对 [dsh-contract.md](dsh-contract.md) 的配套：逐项核验「哪些契约可应用于本插件、是否可用」。
> 本文档是**事实记录**（无完成态），记录 2026-08-31 的验证基准、候选清单、结论与不适用排除；
> 未来落地候选 A/C 时改 [../AGENTS.md](../AGENTS.md) 与 CHANGELOG，本文档同步标记落地状态。
>
> - 对应版本：**dsh 0.1.2-alpha.2**（npm 安装）
> - **验证基准：以 npm 实际产物为准**（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\*`），
>   非本机构建检出 `D:\workspace\dsh-plugin\deepseek-harness`（该检出为旧版基线，仅作源码注释参考）

---

## 一、验证基准与动机

- dsh-contract.md §头声称「官方源码直接核验（本机构建检出在 `D:\workspace\dsh-plugin\deepseek-harness`）」；
  但该检出是旧版基线，**用户实际运行的是 npm 0.1.2-alpha.2**（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh`，含全部 `@deepseek-ai/dsh-*` 依赖包）。
- 契约可用性必须以 npm 产物（`lib/*.js` + `lib/types/*.d.ts`）为准——本机构建检出可能在 tag 漂移后与已装产物不一致。
- 本次所有签名/行为断言均出自 npm 0.1.2-alpha.2 产物文件与行号，见各候选「出处」。

## 二、可应用候选（二次验证通过）

### 候选 A：`sessionQuery.readTitleSnapshots` —— 冷会话标题官方通道（建议未来落地）

**现状**：`../src/host/routes-manage.ts` titles 端点（L390-413）自研「`readSession` 整日志解压 + `titleFromEvents` 折标题 + `runLimited` 并发 4」。

**官方契约（npm 0.1.2-alpha.2 产物实证）**：

```ts
// dsh-session-query/lib/index.js
async readTitle(sessionId, signal?)                      // → SessionTitleSnapshot | undefined
async readTitleSnapshot(sessionId, signal?)              // → { session, title?: SessionTitleSnapshot }
async readTitleSnapshots(sessionIds, signal?)            // → SessionTitleObservationResult[]
```

- 实现：`readTitleSnapshots` 走 `_corpus.projectMany` + 官方 `foldSessionTitle`（index.js L996-1000）
- 返回形状：`{ sessionId, status: 'fulfilled', value: { session, title? } } | { sessionId, status: 'rejected', reason }`（types.d.ts L136-150）；`title` 为 `SessionTitleSnapshot`，取文本用 `.title.title`（dsh-session-title types.d.ts L42-47）
- 行为：live 会话优先（`ctx.sessions.get` 命中即秒回）；冷会话走 `persistence.inspect`（整日志解压，与现 `readSession` 同量级）；官方并发 `persistedInspectConcurrency ?? 4`（index.js L921，默认 4）；返回**按输入顺序**、单会话失败**隔离为 rejected** 不拖垮整批

**结论：可用。** 收益为「官方通道 + 删除自研折标题与并发治理 + 合规 #8（只依赖官方 API）」；
冷标题语义与官方 `session/title` 事件投影（last-wins）一致，性能与现状等价（冷会话仍要读日志），非数量级提升。

### 候选 B：`conversation.input` 通道 —— refillDraft 已用契约（确认可用，无需改）

**官方契约（npm 0.1.2-alpha.2 产物实证）**：

- `ctx.conversation.input` 运行时为 `InputHub`，额外提供 `shell(id: SessionId): SessionInputShell`（hub.d.ts L47、client.js L12190）
- `SessionInputShell` 同时有 `setDraft(text)`（facade.d.ts L119）与 `readonly actions: InputActions`（facade.d.ts L66）→ `actions.setDraft(text)`（input.d.ts L202-204）
- client guard 的 `ctx.get(name)` 走 `readService(name, requireDeclaration=false)`，**不强制 inject 声明**（cordis-client-runner client.js L325-335），故 `ctx.get('conversation')` 在插件 apply ctx 下可解析

**结论：可用。** `../src/client/recall-node.js` fillDraft 的
`conversation.input.shell(sid).actions.setDraft` / `.setDraft` 探测链在 0.1.2-alpha.2 全部成立；
dsh-contract.md §1.1 conversation 段描述准确，代码无需修改。

### 候选 C：`conversation.chat.turnTail` —— 0.1.2 新增 chain slot（可选功能扩展）

**官方契约（npm 0.1.2-alpha.2 产物实证）**：

```ts
'conversation.chat.turnTail': { kind: 'chain'; scope: 'session'; owner: TurnTailOwnerProps }
interface TurnTailOwnerProps { turn: TurnLocation; seq: number; openFile(path: string): void }
```

- 语义：「完成回合动作行之前的扩展」，chain 依次决策、首个接受的 selector 渲染（slots.d.ts L168-172、L16-20）
- 用途：回合级「撤回最近一段」入口（现有 user/steering 每条消息按钮的回合级补充）；撤回机制不变，仅新增宿主

**结论：契约存在且可用。** 属**新功能而非优化**，2026-08-31 决定不实施，仅记录。

## 三、不适用候选（验证排除）

| 候选 | 排除原因 |
|---|---|
| `sessionQuery.traceSession` | 基于 `listSessions` 目录级 header，不含 fork 关系（I7 归档会话仅从分组表面隐藏）；不能替代插件 lineage.json（F1） |
| `conversation.chat.assistant-actions` | list slot，只服务**助手**消息（owner 仅 `{ messageId }`）；插件撤回 user 消息 |
| `sessionQuery.filterEvents/listEvents/readSurface` | `scanCutSeq` 读**内存 live 会话**事件（`sessions.get`），不涉及冷日志解压 |
| `agents.get/isOwnedBy` | `agentBusy`（`../src/host/index.ts`）已有 `list` + `get` 双分支覆盖运行态判定 |
| webServer gzip（0.1.2-alpha.2 新增） | Host 配置层（默认 none），插件不可控 |

## 四、对 dsh-contract.md 的补充提醒

1. **来源基准**：dsh-contract.md §头声明以本机构建检出为准，但该检出现为旧版基线；下次升级核查建议改为
   「npm 实际产物（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\*`）为准，构建检出仅作源码注释参考」。
2. **conversation 类型面细节**：`.shell(id)` 不在 `SessionInputResolver` 接口上（接口仅 `for(actx: Context)`），
   是 `InputHub` 的 composer-layer 扩展；JS 运行时可用，若未来 TS 化或加探针断言需注意此差异。

## 五、未来落地建议（本次未实施）

**候选 A 落地步骤**（如后续实施）：
1. `../src/host/routes-manage.ts` titles 端点改为一次 `readTitleSnapshots(ids)` 调用，遍历 results 取 `value.title?.title`，`rejected` 按 null 缓存；
2. `sessionQuery` 缺失时兜底退回现 `readSession` + `titleFromEvents` 路径；
3. `../tests/probe/api-surface.test.js` 加 `readTitleSnapshots` 存在性断言；跑 `npm run test:probe` + `npm run verify:host` + 冒烟。

**候选 C 落地步骤**（如后续实施，属功能扩展，先评估 UX）：
1. 新增 turnTail 渲染器（chain slot，select 接受 owner），复用 `executeRecall`/`preview` 链路按 `seq` 定位目标消息；
2. `src/client/app.js` 注册 `conversation.chat.turnTail`；`npm run build` 后跑测试与冒烟。

---

**状态**：记录完成（2026-08-31）。候选 A、C 均为「验证可用、未实施」，落地后本文档同步更新。
