# TS 迁移 M8：文档同步与计划归档

> 状态：已完成（2026-09-01 实施）｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M8/8
>
> 一句话：所有指向源码路径的文档与代码现状对齐，CHANGELOG 记账，计划族归档 completed/。

## 目标

消除「源码进 `src/`、`lib/` 变纯产物」带来的文档漂移；本地工作流约定成文；本计划按 docs 规范完成生命周期闭环。

## 前置

M7 完成（代码终态）。

## 任务分解

### 1. AGENTS.md / CODEBUDDY.md 文件地图

- 「项目架构与文件地图」表：`lib/` 各行标注「**构建产物**（esbuild 自 src/host 转译，勿直接编辑）」；新增 `src/host/`、`src/types/`、`src/client/` 行，职责描述沿用现表内容
- 命令脚本表：`npm run build` 语义更新为「host+client 全量打包（13 host 产物 + client.js）」；新增 `npm run typecheck` 行（何时跑：改任何 src 后、发版前）
- 本地工作流约定成文：**改 `src/` 后先 `npm run build` 再 `npm test`**（package-layout 断言基于产物，忘 build 会假绿/假红）
- 「重要约束」（两套脚本同名导出）补充：契约事实源已升级为 `src/types/scripts.ts` + tests/types 编译期断言

### 2. docs/ 引用核对

- `grep -rn "lib/" docs/` 逐处核对：指向源码的改指 `src/host/`，指向产物的保留并注明
- `dsh-contract.md` 第七节升级核查指引：补充「类型源 diff 核对法」——dsh 升级时 diff `src/types/dsh-contract.ts` 与 `client-contract.ts`（上游风险表承诺的流程变化，在此成文）
- `compat-audit.md`、routing-interplay.md 等顺带核对路径引用

### 3. README 双语

核对 `README.md` / `README.en.md` 是否引用 `lib/` 源码路径或描述 build 行为；有则同步（面向用户的安装/使用部分预期零改动——包布局未变）。

### 4. CHANGELOG 记账

`CHANGELOG.md`（Keep a Changelog）Unreleased 段新增工程变更条目：`### Changed - 源码整体迁移 TypeScript（同形态复刻，行为与包布局零变化；lib/ 转为构建产物目录）`。不预写版本号（docs 规范第 5 条）。

### 5. check:upgrade 评估

评估 `scripts/check-upgrade.mjs` 串联是否纳入 `typecheck`（check:dsh + test:probe + verify:host 现状三步）。决策与理由记入本文件实施记录：纳入则改脚本并同步 AGENTS.md 命令表；不纳入须写明理由（如 typecheck 已被 CI 门禁覆盖、本机核验重复）。

### 6. 计划归档（docs 规范生命周期约定第 2 条）

- `plan-ts-refactor.md` 与 `plan-ts-refactor-m1..m8.md` 移入 `docs/plans/completed/`
- 同步三处：`improvement-plan.md` 索引行（链接改 `./completed/`、状态改已完成）；被移动文内的相对链接（代码链接 `../../../` 前缀不变——pending 与 completed 同深度，无需改；指向 `../improvement-plan.md` 的链接不变）；上游文档反向引用
- `docs/README.md` 目录树同步

### 7. 终验（上游 §六 四项）

1. 行为零变化：对照 README 功能清单逐条走查
2. 契约零变化：package-layout / test:probe / verify:host / cordis.patch.yml
3. 工程质量：`tsc --noEmit` 全绿、`@ts-ignore` 零残留
4. 文档一致：本阶段 1–3 项完成

## 验收标准

- 上述 1–6 全项完成；`npm test` / `test:probe` / `verify:host` / `typecheck` / build 新鲜度全绿
- `grep -rn "lib/" docs/ AGENTS.md` 无指向源码的残留引用

## 风险与回退

| 风险 | 对策 |
| --- | --- |
| 文档漂移遗漏（某处引用未更新） | grep 清单化核对，逐项打勾 |
| 归档移动漏同步链接 | 严格按生命周期约定第 2 条三处清单执行 |

回退：文档类变更，revert 即还原。

## 实施记录

> 2026-09-01 实施完成。基线 HEAD `8b075a2`（M7 收口）。任务 1–6 全部落地；终验（任务 7）全绿后归档 `completed/`（本文件与总计划、M1–M7 同批移动，状态字段同步改为已完成）。

### check:upgrade 评估决策（任务 5）

**不纳入 typecheck**，`scripts/check-upgrade.mjs` 保持三步（check:dsh + test:probe + verify:host）不变。理由：

- check:upgrade 定位是「dsh 升级后的一键核验门禁」，三步全是 dsh 兼容面（版本漂移/镜像比对、官方字段探针、装配门禁）；
- typecheck 只检查插件自身代码的类型一致性，与 dsh 版本无关——`src/types/*` 是插件自持的 ambient 声明，dsh 升级不改变它们；类型断言与官方漂移的发现靠 `test:probe` + dsh-contract.md 第七节「类型源 diff 核对法」；
- typecheck 已被 CI 类型门禁覆盖（置于单测前，见 AGENTS.md 命令表），本机跑 check:upgrade 重复核验无增量价值；
- verify:host 消费 `lib/` 产物的新鲜度由「改 src 先 build」本地工作流约定 + CI 产物新鲜度门禁双重兜底。

### 逐项落地

| 任务 | 结果 |
| --- | --- |
| 1 AGENTS.md/CODEBUDDY.md 文件地图 | 文件地图表改指 `src/host/*.ts`/`src/client/*.ts` 并新增 `src/types/` 行；`lib/*.js` 标注纯产物；命令表补 typecheck、build 语义改全量、CI 描述更新；本地工作流「改 src 先 build 再 test」成文；重要约束补契约事实源升级；运行时形态/协作流程/link 模式同步（CODEBUDDY.md 是 AGENTS.md 符号链接，自动同步） |
| 2 docs/ 引用核对 | `compat-audit.md` I9/I14-I20/I23-I26/I29 项目源码引用改指 `src/host/*.ts`（官方包路径保留）；`dsh-contract.md` 两处 `lib/index.js` 改指 + 第七节补「类型源 diff 核对法」；`docs/README.md` 目录树（pending 移除 TS 迁移、completed 新增）与相对链接规范（`src/` 前缀）；`plan-p2.md` recallPanel 改指 `src/client/recall-node.ts`；historical completed/ 计划文档与 research-competitors 为归档记录，保留原样 |
| 3 README 双语 | `README.md`/`README.en.md` 本地开发段与测试段同步（link 模式需先 build、`lib/` 纯产物目录、build/typecheck/CI 描述）；面向用户功能段零改动 |
| 4 CHANGELOG | `[Unreleased]` 段新增「源码整体迁移 TypeScript（同形态复刻）」工程变更条目，不预写版本号 |
| 5 check:upgrade 评估 | 见上——不纳入 typecheck，脚本零改动 |
| 6 计划归档 | 9 文件 `git mv` pending/ → completed/（rename-only）；`improvement-plan.md` 索引行改 `./completed/` + 状态已完成；docs/README.md 目录树已同步；M 文档头部状态改已完成；相对链接同深度验证无误 |

### 终验（任务 7 四项）

1. 行为零变化：README 功能清单逐条走查，本次仅文档/工程变更，无行为改动；
2. 契约零变化：package-layout / test:probe / verify:host / cordis.patch.yml 全绿（见 commit 验证）；
3. 工程质量：`npm run typecheck` 全绿、`@ts-ignore` 零残留；
4. 文档一致：任务 1–6 完成，`grep -rn "lib/" docs/ AGENTS.md` 无指向源码的残留引用（剩余引用均为产物语义或官方包路径）。

### 复审补录（2026-09-02）

任务 2 的核对口径是 `grep "lib/"` + src/host 路径，漏了迁移前就存在、指向 `src/client/*.js` 旧扩展名的引用与两处行号漂移，复审发现后已修：`dsh-contract-verify.md`（recall-node.js/app.js 改 .ts、titles 端点行号 L390-413 → L428 起）、`compat-audit.md`（recall-node.js ×2/util.js/entry.js 改 .ts）、`plan-p2.md`（recallPanel 行号 L285 → L86）。教训入库：今后源码路径类核对应同时覆盖「目录迁移」与「扩展名变化」两种模式，行号引用在迁移类 commit 后必须重核。
