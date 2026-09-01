# docs 目录索引与文档规范

> 新增任何文档前先读本文件，按规则放置与命名，避免目录结构随文档增多而失控。

## 目录布局

```
docs/
├── README.md        # 本文件：目录索引与文档规范
├── dsh-contract.md  # DSH 契约文档：插件依赖面详细契约 + 未依赖面全量清单（dsh 升级核查底稿）
├── routing-interplay.md  # 与 dsh-routing-suite 的交互说明（撤回 × 路由阶段，事实文档）
├── plans/               # 计划文档族（状态即目录：pending/ 待办，completed/ 已完成）
│   ├── improvement-plan.md      # 总索引（单一事实源：计划清单、状态与全局顺序）
│   ├── research-competitors.md  # 竞品调研（改进计划的调研底稿，静态归档，不参与状态分目录）
│   ├── pending/                 # 待实施 / 实施中
│   │   └── plan-p2.md           # P2 打磨项（按需挑选）
│   └── completed/               # 已实施（原地保留实施记录与验收依据，完成不删除）
│       ├── plan-p0.md               # P0 安全洞堵补
│       ├── plan-p1.md               # P1 工程补课
│       ├── plan-settings-ux.md      # 设置页体验优化
│       ├── plan-competitor-improvements.md  # 竞品改进：健壮性补强与结构拆分
│       ├── plan-competitor-fixes.md         # 竞品改进实施审查修复
│       ├── plan-env-diagnostics.md          # 环境错误主动诊断（issue #11）
│       ├── plan-performance.md              # 性能优化实施计划（PF-1〜PF-9，2026-08-29 实施+实弹通过）
│       ├── plan-ts-refactor.md              # TS 迁移（JS → TypeScript，v3.2；M1–M8 已实施，2026-09-01 归档）
│       ├── plan-ts-refactor-m1..m8.md       # TS 迁移 M1–M8 阶段实施文档（随总计划归档）
│       ├── smoke-checklist.md               # 冒烟测试待办清单（七节全部通过，2026-08-29）
│       └── smoke-checklist-records.md       # 冒烟测试执行记录（随清单归档）
└── screenshots/     # README 与文档引用的截图素材（只增不删，删前查引用）
```

## 归类规则

| 文档类型 | 放置位置 | 命名规范 | 现有示例 |
|---|---|---|---|
| 总路线图 / 改进计划 | `docs/plans/` | `<主题>-plan.md` | `improvement-plan.md` |
| 分期 / 专题实施计划（待办） | `docs/plans/pending/` | `plan-<期次或主题>.md` | `pending/plan-p2.md`、未来如 `pending/plan-image-support.md` |
| 分期 / 专题实施计划（已完成） | `docs/plans/completed/` | 同上，**文件名不变**（代码注释/台账按文件名引用） | `completed/plan-p1.md` |
| 冒烟 / 回归验证清单 | `docs/plans/pending/`，全部执行完移入 `completed/` | `smoke-<范围>.md` | `pending/smoke-checklist.md` |
| 长期规范文档（存储格式、安全模型等） | `docs/` 根 | 小写单词，不带 plan | `dsh-contract.md`；未来的 `format.md`、`security.md`（见 pending/plan-p2.md P2-2） |
| 调研报告 | `docs/plans/`（与衍生计划放一起，积累多了再拆 `research/`） | `research-<主题>.md` | `research-competitors.md` |

区分标准一句话：**计划是「要做的事」有完成态，规范是「一直成立的事实」无完成态**——前者进 plans/，后者放根目录。

## 生命周期约定

1. **状态字段**：计划文档头部引用块统一带 `状态：待实施 / 实施中 / 已完成 / 已废弃`；分期计划另带 `上游文档` 链接。目录位置是状态的一级表达，头部状态字段保留为精确表达（如 plan-p0 的「已实施（待发版）」）。
2. **状态即目录，完成不删除**：待办放 `pending/`，完成后移入 `completed/`——验收记录、「为什么做/为什么不做」的决策依据是后续维护的一手材料；只有内容完全过时且无参考价值时才删。移动时必须同步三处：总索引（improvement-plan.md）链接、文内相对链接（子目录深一层，代码链接 `../../` → `../../../`）、上游文档的反向引用。
3. **子计划回链**：新分期/专题计划从总计划拆出后，必须在总计划（improvement-plan.md）相应章节挂上链接，保持单一事实源可导航。
4. **相对链接**：plans/ 根文档指向代码用 `../../src/...`；`pending/`、`completed/` 内文档深一层，用 `../../../src/...`。`lib/` 是构建产物目录，文档指向代码一律用 `src/` 路径；文档互链用相对路径（同目录 `./xxx.md`，跨状态目录 `../` 或 `./completed/` 前缀）。
5. **不预写发版版本号**：计划文档不预先指定具体发版版本号（patch/minor 语义可以写）；版本号在发版流程中确定（见 AGENTS.md 发布流程），避免计划与实际发版节奏漂移。

## 新增计划文档 checklist

- [ ] 放 `docs/plans/pending/`，按命名规范起名（验证清单用 `smoke-<范围>.md`）
- [ ] 头部引用块：状态 + （分期计划）上游文档链接
- [ ] 总计划对应章节挂新文档链接
- [ ] 指向代码的相对链接用 `../../../` 前缀（pending/completed 子目录内）
- [ ] 内容含：目标 / 任务分解 / 改动落点 / 验收标准 / 风险与回退（参照现有 plan-*.md 的结构）
- [ ] 完成后移入 `completed/`，并按生命周期约定第 2 条同步三处链接
