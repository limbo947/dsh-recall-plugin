# dsh-recall-plugin 改进计划（总索引）

> 状态：进行中 ｜ 更新：2026-09-01
> 本文档是计划族的导航索引与单一事实源：子计划从这里拆出并回链，任务细节一律住在子计划里，这里只维护清单、状态与全局顺序。
> 调研背景与路线决策依据：[research-competitors.md](./research-competitors.md)（竞品调研，2026-08-26）。
> 发版版本号在发版时确定，计划文档内不预先指定（规范见 [../README.md](../README.md)）。

## 计划索引

| 计划 | 范围 | 状态 |
|---|---|---|
| [P0 安全洞堵补](./completed/plan-p0.md) | 运行中 agent 拦截、preview→execute 失效校验、fs/observed 观察层验证（复现后按设计行为关闭） | 已实施（待发版） |
| [P1 工程补课](./completed/plan-p1.md) | 最小测试集 + CI、快照跳过记录持久化、存储总量上限 | 已实施 |
| [设置页体验优化](./completed/plan-settings-ux.md) | 设置卡片可用性缺陷、新增配置项、UI 打磨 | 已实施 |
| [P2 打磨项](./pending/plan-p2.md) | 键盘导航、FORMAT/SECURITY 文档、OIDC 发布、包完整性、版本巡检 | 待实施（按需；P2-4、P2-5 已完成 2026-08-27） |
| [TS 迁移（JS → TypeScript）](./completed/plan-ts-refactor.md) | 同形态复刻：源码迁移 TS、逐文件转译保包布局、编译期类型锁契约 | 已完成（2026-09-01，M1–M8 全部实施；单测/探针/verify:host/typecheck 全绿，实施记录见各 M 文档） |
| [竞品改进：健壮性补强与结构拆分](./completed/plan-competitor-improvements.md) | rescue 救援闭环、index 原子写+校验、错误码收敛、client/index 拆分、版本家族 spike、verify-host、compat 台账 | 已实施（2026-08-28 审查发现的缺陷经修复计划全数闭环） |
| [竞品改进实施审查修复](./completed/plan-competitor-fixes.md) | rescue tag 前缀契约（S1 致命）、孤儿重建过滤、POSIX 删除侧 if/fi、索引截断区分、errors 门禁、verify-host 装配复刻、产物新鲜度 CI | 已完成（2026-08-28；单测 172/172 绿、verify:host 绿，实施记录见该文档文末） |
| [环境错误主动诊断（issue #11）](./completed/plan-env-diagnostics.md) | 错误分类与可行动提示、ensureGit/快照失败 toast 可见化、recordError 去重、POSIX home 漂移修复 + 旧容器迁移、并发实例探测 + stale 锁分级（M3） | 已完成（2026-08-28，含 M3；单测 212/212 绿、verify:host 绿，实施记录见该文档文末） |
| [冒烟测试待办清单](./completed/smoke-checklist.md) | 常规回归 + 竞品改进批次 + 环境诊断（M1/M2）+ M3 的实弹验收项（各计划验收标准中「需活体验证」的汇总） | 已全部执行通过（2026-08-29：Windows + WSL + v2.1.1 本机验证 + PF 批次第七节 9/9；执行记录见同目录 smoke-checklist-records.md） |
| [性能优化实施计划](./completed/plan-performance.md) | 撤回主路径（tree hash 校验消重复 diff、win32 stdin 写、.NET 枚举）与设置页/管理/维护（lineage 串行、rebuildOrphans、listCache 增量、listSessions 替代日志冷读、exclude 合并、脚本内 git 瘦身），PF-1〜PF-9 | 已完成（2026-08-29 实施 + 探针前置 + 合成基准 + 实弹 9/9 通过；PF-2 采用 OpenStandardInput 形态 B、PF-7 titles 半项废弃见实施记录） |
| [竞品评估优化计划：交互补强与可靠性钉子](./pending/plan-competitor-ux.md) | 第三轮竞品改进（2026-09-04 三竞品评估驱动）：草稿保护、仅回退对话模式、crash-safety 测试、settings-cards 拆分、preview TTL、还原 journal、版本翻页器调研 | 待实施（U3/U2 建议先行，各项独立按需挑选） |
| [设置页 UI 优化：视觉层次与可访问性](./pending/plan-settings-ui.md) | 2026-09-04 八维 UI 审计驱动：语义色修复、可访问性补强、交互反馈、布局 Grid 化、表单分组、健康/错误视觉升级、排版/响应式/动效打磨（V1–V9） | 待实施（V1–V3/V6 独立小改可先行；V4/V5 建议 plan-competitor-ux S1 拆分后） |

## 全局实施顺序

P0 → P1 → 设置页体验优化 → P2 按需。P0 / P1 / 设置页体验优化均已实施，剩余 P2 按需；竞品改进专项（H1→H2→H3→R1→R2→F1→E1→D1，顺序与理由见该文档）代码已落地，审查修复项（F-S1→F-G2→F-G1→…，见 [plan-competitor-fixes.md](./completed/plan-competitor-fixes.md)）已于 2026-08-28 全部完成。[环境错误主动诊断（issue #11）](./completed/plan-env-diagnostics.md)已于 2026-08-28 实施完成（纯 Host 侧增量，含 POSIX home 漂移修复与并发实例探测/stale 锁分级 M3）。[性能优化实施计划](./completed/plan-performance.md)（2026-08-29 生成并实施，基于全代码路径性能审查）PF-1〜PF-9 全部落地（PF-2 经探针决策采用 OpenStandardInput 形态 B、PF-7 titles 半项废弃）。**发版前置条件已全部满足**：[冒烟测试待办清单](./completed/smoke-checklist.md) 七节全部实弹通过（2026-08-29，含 PF 批次 9/9；执行记录见 [smoke-checklist-records.md](./completed/smoke-checklist-records.md)），可按语义发版（PF-1/PF-6/PF-7 含行为变化与 client 改动 → minor）。[竞品评估优化计划](./pending/plan-competitor-ux.md)（第三轮竞品改进，2026-09-04 三竞品评估驱动）待实施：U3 crash-safety 测试与 U2 仅回退对话模式建议先行，其余各项独立按需。[设置页 UI 优化计划](./pending/plan-settings-ui.md)（2026-09-04 八维 UI 审计驱动）待实施：V1–V3 与 V6 为独立小改可先行，V4/V5 建议随 plan-competitor-ux S1 拆分后做。

- 每项实施前过一遍 AGENTS.md 官方文档合规清单（尤其 #3 Config、#8 字段核验）。
- 子计划状态变化时同步本表；新子计划从本索引拆出并在表内挂链接（docs 规范见 [../README.md](../README.md)）。
