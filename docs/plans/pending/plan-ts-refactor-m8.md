# TS 迁移 M8：文档同步与计划归档

> 状态：待实施 ｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M8/8
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
