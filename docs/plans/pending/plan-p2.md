# P2 实施计划：打磨项（按需逐项做，无固定版本）

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：待实施（P0/P1 完成后按需挑选）
> 五项相互独立，每项可单独实施发版；标注了各自的「值得做的时机」。

---

## P2-1 确认面板键盘导航

**值得做的时机**：任何一次 UI 改动顺带做。

### 目标

撤回确认面板支持 ↑↓ 移动焦点、Enter 确认、Esc 取消/关闭。

### 任务分解

1. **Esc 关闭**（[src/client/recall-node.ts](../../../src/client/recall-node.ts) `recallPanel`，L86 起）
   - 面板挂载时 `document.addEventListener('keydown', handler, true)`（**capture 阶段**，先于 composer 的全局快捷键拿到 Esc——dsh-rewind 实证必须 capture 才能从输入框偷键），卸载时移除（React 卸载成对清理，AGENTS.md 半 UI 约束）。
   - Esc 仅在面板打开（stage 为 confirm）时拦截；done/error 阶段不拦（让用户正常关闭）。
2. **Enter 确认**
   - confirm 阶段 Enter 触发 `executeRecall`；焦点管理从简——不做完整 focus trap，Enter 直接绑在面板 keydown 上，与按钮 onClick 走同一函数。
   - 边界：面板内有输入类控件时（当前没有，未来若有）需排除。
3. **↑↓ 循环焦点**（可选，面板按钮少，价值有限）
   - 若面板只有「确认回退/取消」两个按钮，↑↓ 意义不大——**砍掉不做**，除非未来面板选项变多（如引入模式选择）。
4. 防双击：`executeRecall` 执行中禁用按钮（stage 变 running 时 disabled）——查现状，`stage: 'running'` 若已有禁用逻辑则零改动。

### 验收

- 面板打开时按 Esc → 关闭；Enter → 执行回退；鼠标流不受影响；面板关闭后 Esc/Enter 恢复默认行为（监听已移除）。

---

## P2-2 FORMAT / SECURITY 文档

**值得做的时机**：存储格式或 API 面将要稳定时（P1-2/P1-3 落地后）。

### 目标

公开存储格式说明与威胁模型审视，对标 turn-rewind 的 FORMAT.md/SECURITY.md。

### 任务分解

1. **docs/FORMAT.md**：影子仓库布局（`~/.dsh/dsh-recall-snapshots/<SHA256>/`、git/、index.json）、tag 命名（`snap-<messageId>`、`pre-rollback-<timestamp>`）、index.json 条目 schema（含 P1-2 的 feedback 扩展）、降级存储布局、exclude.txt 语义与优先级。素材全部来自 AGENTS.md「存储布局」节，扩写为用户可读文档。
2. **docs/SECURITY.md（威胁模型审视，先审后写）**：
   - `/api/recall/*` 是同源 HTTP 端点，浏览器内任意脚本可直调——逐端点过一遍：
     - `execute`（破坏性）：现有防线 = preview 确认在 client、安全快照兜底、（P0 后）agent 忙检查、（P0-3 后）STALE 校验。评估：恶意脚本调 execute 回退到任意有快照的消息——危害=文件状态回退（有 safety tag 可恢复），可接受？或需加 sessionId 绑定校验？
     - `exclude-set`：路径白名单已拒任意路径（现有）。
     - `manage`（删除）：评估 scope 删除的防护是否充分。
   - 结论写成文档：已防住的、接受的残余风险、建议（若有 P0 级发现，回填 improvement-plan 而不是静默修）。
3. 两文档写完在 README 链接（中英双语 README 均加）。

### 验收

- 文档与实现一致（对照代码逐条核对）；SECURITY.md 每个威胁项有明确「已防/接受/待办」结论。

---

## P2-3 OIDC Trusted Publishing

**值得做的时机**：下次发版前顺手做（一次性配置）。

### 目标

npm 发布免本地 NPM_TOKEN，走 GitHub Actions OIDC（dsh-rewind 已实证该流程，含 `--provenance`）。

### 任务分解

1. npm 侧：npmjs.com 上为 `dsh-recall-plugin` 配置 Trusted Publisher（repo `limbo947/dsh-recall-plugin`、workflow 文件名、environment）。
2. 新增 `.github/workflows/publish.yml`：推 `v<版本>` tag 触发 → 校验 tag 与 package.json version 一致 → `npm ci && npm test`（依赖 P1-1 的 CI 内容）→ `npm publish --provenance`（`id-token: write` 权限，无 NPM_TOKEN secret）→ GitHub Release。
3. 幂等：已发布版本跳过（防重跑重复发布失败）。
4. 首次配置后手动触发一次验证；旧的手动发布流程从 AGENTS.md 更新为新流程。
5. **注意**：发版仍需 bump version + commit + push tag 的动作，只是 publish 步骤进了 CI；tag 推送走代理（用户环境已知约束）。

### 验收

- 推 tag → Actions 全绿 → npm 上新版本带 provenance 徽标；GitHub Release 自动创建。

---

## P2-4 发布包完整性校验

> ✅ 已完成（2026-08-27）。
>
> **核验结论**：P1-1 的 CI 已含 `package-layout.test.js`（npm pack --dry-run 断言），按计划「值得做的时机」预设条件**本项关闭**。对照任务分解逐条核对后补两处收口：
> - required 列表补 `package.json`（计划任务分解明确要求，原实现遗漏）；
> - disallowed 列表补 `scripts/`（P2-5 新增的发布前巡检脚本目录，防未来 files 配置回归误发）。
> 验收标准「删 lib/snapshots.js → 测试红」机制已满足：required 枚举全部 lib 模块，任一从 files 白名单漏出即红。

**值得做的时机**：若 P1-1 的 CI 已含 `package-layout.test.js`（npm pack --dry-run 断言），本项已被覆盖，关闭。

### 目标

防 package.json `files` 列表回归（漏发 `lib/`、`cordis.patch.yml` 等导致用户装到空包）。

### 任务分解

1. `tests/unit/package-layout.test.js`：child_process 跑 `npm pack --dry-run --json`，断言 tarball 含 `lib/*.js`（全部现有模块枚举）、`cordis.patch.yml`、`README.md`、`LICENSE`、`package.json`；断言**不含** `AGENTS.md`、`docs/`（含 docs/reference 镜像）、`tests/`、`scripts/`（防误发，AGENTS.md 明确不进分发包）。
2. 该测试进 P1-1 CI 的 `npm test`，无需单独步骤。

### 验收

- 故意从 files 删 `lib/snapshots.js` → 测试红。

---

## P2-5 peer 依赖版本提醒脚本

> ✅ 已完成（2026-08-27）。
>
> **核验结论**：本项目**声明了** `@deepseek-ai/*` peerDependencies（8 个子包 + schemastery + react，见 package.json）——「零依赖哲学不声明 peer」的假设不成立，故本项按**综合巡检形态**实现（不采用计划原文预设的"不声明 peer → 仅镜像比对"分支）。

**值得做的时机**：dsh 发新版本且插件 peer 需要扩范围时。

### 目标

对齐 dsh-rewind 的 `check-dsh-version.mjs`：对比 npm 最新 dsh 版本与本项目 peer/兼容性假设，提醒扩范围或重新核验。

### 任务分解

1. **先核验现状**：读 [package.json](../../../package.json) 的 peerDependencies/engines——本项目是否声明 `@deepseek-ai/*` peer（AGENTS.md 记载 Host 按模块真实路径解析，可能刻意不声明 peer）。**核验结果：已声明 8 个 `@deepseek-ai/*` peer（`^0.1.1-rc.2` 线）+ schemastery + react**，故不落入"零依赖哲学"分支。实现为三层巡检：
   - 本地已装 dsh 版本 vs `reference/README.md`「归档 dsh 版本」——镜像漂移哨兵（计划原预设形态）；
   - npm 最新 `@deepseek-ai/dsh` vs 各 peer 范围——越界即扩范围/重核验（计划标题"peer 依赖版本提醒"主菜）；
   - npm 最新 vs 本地——提示可升级（升级后镜像基准漂移由第一层下次运行捕获）。
2. `scripts/check-dsh-version.mjs`（CLI + 可测纯函数导出）+ package.json script `check:dsh`；不进 CI（版本巡检是本地/发布前动作）。
3. 与 AGENTS.md「漂移控制：每 release 周期按 reference/README.md 重拉镜像」条款联动——脚本是这个流程的自动化哨兵。

### 实施记录

- 范围解析不引入 semver 依赖：只支持 peer 现状实际使用的 `^x.y.z[-pre]` / `~` / 精确三种形态，未知形态 fail-open 警告跳过（提醒脚本宁可漏报不挡主流程），语义由 `tests/unit/check-dsh-version.test.js` 钉住。
- `reference/README.md` 新增「归档 dsh 版本」字段（= 本地 0.1.1-rc.2），重拉镜像流程同步更新（更新方式节已注明）。
- 环境变量 `DSH_CHECK_LOCAL` / `DSH_CHECK_MIRROR` / `DSH_CHECK_LATEST` 可覆盖对应输入，用于演示/测试差异输出，不改任何文件。
- 退出码：一致 0，任一差异 1（"安静退出"指无差异时正常返回，非零只在有提醒时出现）。

### 验收

- dsh 升级后跑 `npm run check:dsh` 输出差异提醒；版本一致时安静退出。

---

## 汇总：依赖关系与推进建议

| 项 | 依赖 | 建议时机 |
|---|---|---|
| P2-1 键盘导航 | 无 | 下次 UI 改动顺带 |
| P2-2 FORMAT/SECURITY | P1-2/P1-3 落地后（格式定型） | P1 发版后 |
| P2-3 OIDC 发布 | P1-1 的 CI（publish 复用测试步骤） | 下次发版前 |
| P2-4 包完整性 | P1-1（就是其一部分） | 随 P1-1 关闭 |
| P2-5 版本巡检 | 无（先核验 package.json 现状再定形态） | ✅ 已完成（2026-08-27） |

各项均为 patch 级（文档/CI/脚本）或并入当期 minor 发版，不单独占版本号。
