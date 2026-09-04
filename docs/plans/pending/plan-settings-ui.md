# 设置页 UI 优化计划：视觉层次与可访问性专项

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：待实施
> 来源：2026-09-04 设置页 UI 八维审计（布局 / 色彩 / 字体排版 / 间距 / 交互反馈 / 响应式 / 可访问性 / 视觉层次；审计对象：[settings-cards.ts](../../../src/client/settings-cards.ts) + [css.ts](../../../src/client/css.ts)）。
> 前序设置页优化（可用性缺陷 / 新配置项 / S3 打磨）已归档：[completed/plan-settings-ux.md](../completed/plan-settings-ux.md)，本计划不重复其已实施项。
> 关联计划：[plan-competitor-ux.md](./plan-competitor-ux.md) S1（settings-cards 预防性拆分）——V4/V5 落点在 ConfigForm 重组，建议 S1 先拆再改，避免在 848 行巨石文件上叠改动；其余各项独立。

## 任务总览

| 项  | 主题                                        | 优先级 | 前置依赖             |
| -- | ----------------------------------------- | --- | ---------------- |
| V1 | 语义色修复（保存按钮 / 标签三色 / badge 色 / 硬编码收敛）      | 高   | 无（warning 变量须核验） |
| V2 | 可访问性补强（树键盘操作 / 焦点可见 / live region / 标签关联） | 高   | 无                |
| V3 | 交互反馈（按钮禁用态 / 成功消息自动消退 / 加载骨架）             | 高   | 无                |
| V4 | 表单布局 Grid 化（消灭 130/138 魔法数 + 窄屏断点）        | 中   | 建议 S1 拆分后        |
| V5 | 表单分组 + 危险操作固定位                            | 中   | 建议 S1 拆分后        |
| V6 | 健康徽章化 + 错误区升级                             | 中   | 无                |
| V7 | 排版收敛（字阶 / 内联样式清理 / 行高单位统一）                | 低   | 无                |
| V8 | 响应式补全（quick 行 wrap，与 V4 共用断点）             | 低   | V4               |
| V9 | 确认条统一 + 过渡动效（可选）                          | 低   | 无                |

***

## V1 语义色修复

### 目标

颜色只表达真实语义：保存 ≠ 危险、修改 ≠ 错误、三类状态标签一眼可分。

### 现状问题

1. ExcludeCard「保存」用 `dsh-recall-btn-danger`（[settings-cards.ts](../../../src/client/settings-cards.ts) L169），而 ConfigForm「保存」是普通样式（L789）——同一语义两种颜色，红色误导为破坏性操作。
2. `.dsh-recall-badge-modified` 用 error 红表示「已修改」文件（[css.ts](../../../src/client/css.ts) L24），修改不是错误。
3. `已修改` / `已覆盖` / `环境变量锁定` 三种语义共用同一灰色 `cfg-tag`（settings-cards.ts L685-687），无法区分「我改的」与「系统锁的」。
4. `btn-danger` 硬编码 `color:#fff` 与 `filter:brightness(1.08)` hover（css.ts L31-32），是令牌体系外的补丁，浅色主题下对比度无保障。

### 任务分解

1. **须核验（动手前，不写产品代码）**：对照官方 ui-theme 构建产物核验是否存在 warning/accent 语义变量（如 `--dsw-alias-state-warning-primary`）——S3-3 已有先例（success 变量经核验后使用），不臆造变量；结论写回本节。不存在时的降级方案：badge-modified 用 `label-secondary` 灰、「已修改」tag 用左边框强调。
2. ExcludeCard 保存按钮去掉 danger 类，与 ConfigForm 保存样式一致。
3. `cfg-tag` 三色分化：「已修改」→ warning/accent 底色（以核验结论为准）；「已覆盖」→ 维持中性灰；「环境变量锁定」→ 中性灰 + 左边框（或加深底色），三者并列时可分。
4. badge-modified 改 warning 色系——影响面含撤回确认面板的文件清单（同一 class），语义同样成立，一并改。
5. `btn-danger` 前景色与 hover：有配套令牌则用之；无则把 `#fff` 与 hover 亮度提为 css.ts 顶部语义变量集中声明，消灭散落补丁。

### 改动落点

[css.ts](../../../src/client/css.ts)（badge / cfg-tag / btn-danger）；[settings-cards.ts](../../../src/client/settings-cards.ts)（L169 保存按钮类名；L685-687 tag 按语义加修饰 class）。

### 验收

- 两处保存按钮样式一致且非红；三类标签视觉可区分；文件清单「已修改」不再是错误红。

- 浅色 / 深色主题各过一遍设置页与撤回确认面板对照。

- `npm run build && npm test` 全绿。

### 风险与回退

- warning 变量不存在 → 走降级方案，本项仍闭环；改动纯样式，回退 = git revert。

### 实施记录（2026-09-04）

- 全部按核验结论落地，无降级分支被触发。

- 落地差异 1（比计划更进一步）：`btn-danger` 前景色找到配套令牌——官方实证的 error-primary 底上文字配对是 `--dsw-alias-bg-layer-3`（settings-models badge 规则，随主题翻转：浅色 #fff／深色 #353638），直接用令牌替代 `#fff`，未走「语义变量声明」fallback 的前景部分；hover 亮度确认无对应令牌（`--dsw-alias-button-*` 家族只有 primary/info/elevated/floating/ghost，无 danger），按计划集中为 `:root{--dsh-recall-btn-danger-hover:brightness(1.08)}`。

- 落地差异 2：`cfg-tag` 三色按核验结论实施——「已修改」用 warn-tertiary 底 + warn-label 文；「已覆盖」维持中性；「环境变量锁定」中性 + `border-left:2px solid var(--dsw-alias-border-l2)`（左边框色用中性而非 warn，避免与「我改的」语义撞色）。

- 保存按钮去 danger（ExcludeCard L169）与 `badge-modified` 改 warn 色系已一并落地；badge 影响面含撤回确认面板文件清单（同 class）。

- 验收：typecheck + build + 单测（296 例）全绿；双主题视觉对照与撤回确认面板核对列入发版前冒烟。`btn-danger` 的 `filter` 集中在 css.ts 顶部单点声明。

***

## V2 可访问性补强

### 目标

键盘与读屏用户可完整操作设置页——现状树折叠钮是 `<span onClick>`，键盘完全无法触达，是本计划最重的功能性缺陷。

### 任务分解

1. **树折叠钮键盘化**（settings-cards.ts L401-404 / L435-438 两处）：`<span onClick>` → `<button type="button">`（class 保留，css.ts 补 `background:0 0;border:0;font:inherit;padding:0` 重置），补 `aria-expanded` 与 `aria-label`（「展开/收起：节点名」）。树容器 `role="tree"` / 节点 `role="treeitem"` 为可选增强；不做完整 WAI-ARIA 树键盘导航（左右键折叠、Home/End 属过度设计，见「明确不做」），先保 Tab 可达 + Enter/Space 触发。
2. **数字输入标签关联**：`numRow` 的 label 补 `htmlFor`、input 补 `id="dsh-recall-cfg-" + key`——与既有 checkbox 模式一致（S3-3 ③ 已验证的形态）。
3. **状态消息播报**：三处状态 span（ExcludeCard / ManageCard / ConfigForm 的 `panel-actions` 内）加 `role="status"` 与 `aria-live="polite"`；错误文案渲染时加「错误：」文字前缀——不只依赖红色传达。
4. **无标签控件补 aria-label**：快照搜索框（L482-488）、exclude textarea（L143）、快速添加输入框（L150）。
5. **焦点可见**：css.ts 全局加 `:focus-visible` 描边（颜色优先用现成 focus/边线令牌，**须核验**是否存在 `--dsw-alias-state-focus` 类变量，无则用 border-l2 加深一档的现成令牌）。

> 💡 核验结论（2026-09-04，同源）：`--dsw-alias-state-focus` 类变量**不存在**（主题包全量扫描 0 命中 focus/ring/outline 变量）。走降级：border-l2 加深一档 = `--dsw-alias-border-l3`——恰与官方按钮 `:focus-visible` 惯例一致（官方 settings-models/lib/client.js 实证：`box-shadow:0 0 0 2px var(--dsw-alias-border-l3)`）。本计划全局 focus 环统一用此形式（按钮/输入框均适用）。

1. SectionToggle 与卡片头的 `aria-expanded` 现状良好，回归即可。

### 改动落点

settings-cards.ts（树渲染两处、numRow、状态 span 三处、输入控件三处）；css.ts（`:focus-visible` + 树 toggle 的 button 重置）。

### 验收

- 键盘走查清单（实弹）：Tab 可到达树折叠钮 / 全部按钮 / 全部输入框；Enter/Space 可折叠展开树；焦点环全程可见。

- 读屏（Narrator 或 NVDA）走查：label 关联播报正确、保存结果自动播报。

- `npm run build && npm test` 全绿。

### 风险与回退

- span → button 引入 UA 默认样式差异——CSS 重置兜底；纯增量无行为变化，回退 = git revert。

***

## V3 交互反馈：禁用态 / 消息消退 / 加载骨架

### 目标

控件状态所见即所得：禁用看得出来、成功反馈会退场、加载有预期。

### 任务分解

1. **禁用态**：`.dsh-recall-btn:disabled` 与 `.dsh-recall-ex-chip:disabled` 补 `opacity:.5;cursor:default`，且 disabled 时 hover 不变色——现状禁用按钮视觉上完全可点，未修改时的「保存 / 放弃修改」持续误导。
2. **成功消息自动消退**：三处卡片的 `state.message` 在 `error=false` 时 4s 后清空（setTimeout + 卸载清理；busy 进行中的「保存中…」不清）；error 常驻。三处重复逻辑抽成组件内小 helper（落点随 S1 拆分后的文件归属定），不引模块级可变状态。
3. **快照树加载骨架**：`items === null` 时渲染 5 条灰色占位行（CSS pulse 动画，底色复用 `interactive-bg-hover` 令牌），替代打开快照管理时的一段空白。

### 改动落点

css.ts（disabled / 骨架样式）；settings-cards.ts（三处卡片状态逻辑、ManageCard 树区骨架分支）。

### 验收

- 未修改时保存按钮明显置灰且 hover 无反应；保存成功 4s 后提示消失、失败提示常驻；打开快照管理先见骨架再见树。

- `npm run build && npm test` 全绿。

### 风险与回退

- 消退定时器与手动操作的竞态：以「最后一次 setState 为准」，timer 只清 success 类消息；逻辑简单，若抽到可测层则补单测。

***

## V4 表单布局 Grid 化 + 窄屏断点

### 目标

消灭 130px / 138px 魔法数耦合（label 定宽与 hint 缩进两处手写对齐，改一处即错位），窄面板下表单不挤压。

### 任务分解

1. `cfg-row` 改 CSS Grid：`grid-template-columns:max-content minmax(0,1fr)`——label 列宽自适应最长标签；控件行（input + suffix + tag）与 hint 行归 `grid-column:2`，删除 `.dsh-recall-cfg-label` 的定宽 130px 与 `.dsh-recall-cfg-hint` 的 `padding-left:138px`。
2. 新增媒体查询（≤480px）：表单改单列堆叠——label 独占一行、hint 缩进归零、控件满宽。
3. 树缩进契约化：声明 `--dsh-recall-tree-indent`（= toggle 宽 18px + gap 6px），`tree-children` 的 margin/padding 引用同一变量——对齐从「16+8 恰等于 18+6」的巧合变成契约。
4. suffix tag（如 MB）与 input 同行排列方式不变（grid 第二列内 flex 行）。

### 改动落点

css.ts（cfg-row / cfg-label / cfg-hint / tree-children）；settings-cards.ts 结构零改动（纯样式重构）。**建议 S1 拆分后实施**，落点自然归 config-card.ts。

### 验收

- 任意改长 label 文案不再错位；≤480px 窄面板表单纵向堆叠可用、无横向溢出；树层级参考线对齐。

- 视觉回归：设置页全字段走查对照截图。

### 风险与回退

- grid 兼容性：DSH 内核为现代 Chromium，官方设置页自身使用现代布局，风险低（动手前可对照官方设置卡片构建产物确认）。纯样式重构，回退 = git revert。

***

## V5 表单分组 + 危险操作固定位

### 目标

9 字段平铺 → 三组语义分组，降低认知负担；危险操作位置可预期、不漂移。

### 任务分解

1. ConfigForm 字段分三组，组间加小标题（复用 ex-note 加粗或新增小标题 class）：

   - **快照行为**：启用快照 / 撤回后回填输入框 / 撤回后归档原会话；

   - **自动治理**：gc 触发条数 / gc 触发小时 / 文件大小上限 / 快照总量上限 / 快照保留天数；

   - **高级**：基础排除表（维持现有 SectionToggle 折叠，不动）。
2. ManageCard 操作区：「全部删除」固定为操作区最后一个按钮——现状夹在「刷新」与「立即 gc」之间，且「加载更多」出现时整体位置漂移；danger 按钮与普通按钮之间留 8px 间隔形成视觉分组。

### 改动落点

settings-cards.ts（ConfigForm 渲染顺序与分组标题、ManageCard `panel-actions` 按钮顺序）。**建议 S1 拆分后实施**，落点归 config-card.ts / snapshot-manager.ts。

### 验收

- 字段分组与上述一致；无论「加载更多」是否出现，「全部删除」位置固定在末尾。

- 配置改-存-回读全流程回归无异常。

### 风险与回退

- 纯结构重排，零逻辑变化；回退 = git revert。

***

## V6 健康徽章化 + 错误区升级

### 目标

致命状态（git 不可用）一眼可见；错误区可见性与项目 fail-loud 理念匹配。

### 任务分解

1. **健康行徽章化**（settings-cards.ts L476-481）：git 可用 → success 色 pill；不可用 → error 色 pill，且从普通 note 提升为 ManageCard 顶部横幅（渲染到树之前），附「快照引擎依赖 git」说明；存储计数（home N / 降级 M）维持现状文字。
2. **「最近错误」区升级**（L521-532）：标题行改 error 色 + 条数徽章（如「最近错误 (7)」）；整个错误区从卡片最底部上移到操作区上方；每条错误的时间戳格式维持。

### 改动落点

settings-cards.ts（ManageCard 健康行与错误区渲染）；css.ts（pill / 错误区标题样式，色值全用现成令牌）。

### 验收

- git 不可用时横幅醒目且位于卡片顶部；错误区标题红色带计数、位置在操作区之上；git 正常 / 无错误时布局不残留占位。

- 断 git（PATH 移除）实弹验证一次。

### 风险与回退

- 无（展示层重排，数据源不变）。

***

## V7 排版收敛

### 目标

字阶四级、零内联样式、行高单位统一。

### 任务分解

1. 字阶收敛为 15（卡片名）/ 14（分区与卡片标题）/ 13（正文与表单）/ 12（辅助 meta 与 hint）——`.dsh-recall-tree-meta` 与 `.dsh-recall-cfg-tag` 的 11px 升 12px，淘汰 11px。
2. SectionToggle 标题的内联样式（settings-cards.ts L805 `style={{fontWeight:600,fontSize:'14px',lineHeight:'22px'}}`）收敛为 class（与 `ex-title` 同规格，视情况合并或新增）。
3. line-height 全量改无单位写法（以 1.4/1.5 为基准换算取整），消除 px 与无单位混用。
4. 顺手做间距刻度变量化：`--dsh-recall-space-1/2/3`（4/8/12），本计划新增样式一律引用变量；存量逐步收敛，不强求一次改完。

### 改动落点

css.ts（字号 / 行高 / 变量声明）；settings-cards.ts（L805 内联样式删除）。

### 验收

- css.ts 全文搜索无 11px、无 px 行高；settings-cards.ts 无内联 fontSize/fontWeight。

- 视觉回归对照（字级微调可能引起折行变化，树行有 ellipsis 兜底）。

### 风险与回退

- 低；纯样式，回退 = git revert。

***

## V8 响应式补全

### 目标

exclude quick 行与 chip 建议区窄屏不溢出、换行后顺序可读。

### 任务分解

1. exclude quick 行（settings-cards.ts L149-165）：≤480px 时输入框 `flex:1 1 100%` 独占一行，「添加」按钮与 chip 建议项另起一行排列。
2. 快照树行窄屏维持 ellipsis（现状已具备，回归即可）；`panel-actions` 补 `flex-wrap:wrap`，长状态文案不再挤压按钮。
3. 与 V4 共用同一条 480px 断点，不引入第二断点。

### 改动落点

css.ts（quick 行与 panel-actions 的媒体查询分支）。

### 验收

- 360px 宽面板下无横向溢出；chip 换行后视觉顺序可读；长错误文案下按钮不被挤变形。

### 风险与回退

- 无。

***

## V9 确认条统一 + 过渡动效（可选，最后做）

### 目标

四种删除确认（快照 / 会话 / 工作区 / 全部）一个组件；显隐有反馈且尊重系统减少动效设置。

### 任务分解

1. 抽 `ConfirmRow` 组件：props `{ text, onConfirm, onCancel }`——现状 `renderConfirm`（三处复用）与 `renderDeleteAllConfirm` 结构重复，且确认按钮样式不一（普通 chip vs danger 按钮）；统一为「确认 = danger chip、取消 = 普通 chip」。
2. 确认条与树展开加 opacity / max-height 过渡（≤200ms），并在 `prefers-reduced-motion: reduce` 媒体查询下关闭——顺手补全减少动效可访问性。
3. 不做布局防跳与弹窗化：确认条原位展开是既定交互（plan-settings-ux「明确不做」第 5 条已决策不引弹窗），维持。

### 改动落点

settings-cards.ts（ConfirmRow 组件与四处调用点）；css.ts（过渡 + reduced-motion 分支）。

### 验收

- 四处确认同源同样式；动画流畅；系统开启减少动效时过渡自动关闭。

### 风险与回退

- 树行级动画重排开销可忽略；本项可整项不做，不影响其他项闭环。

***

## 明确不做（决策记录）

1. **不引第三方组件库 / 图标库**：client 是 esbuild 单 bundle 且受裸 require 白名单断言约束（build-client.mjs），保持零运行时依赖。
2. **不改官方设置外壳**：settings.plugin.item slot 结构与官方卡片列表样式归 dsh 管，插件只渲染卡片内部。
3. **不自创色板**：一切颜色走 `--dsw-alias-*` 令牌，本计划只修硬编码与语义错配；变量不存在一律走降级方案（S3-3 先例），不臆造。
4. **不做完整 WAI-ARIA 树键盘导航**（左右键折叠、Home/End 跳转）：成本高于收益，V2 保 Tab + Enter/Space 基本盘。
5. **不动撤回气泡侧 UI**：本计划范围限设置页；badge-modified 改色（V1-4）是唯一波及点，语义同源故一并处理。
6. **存量间距不强行变量化**：V7-4 只约束新增样式，存量逐步收敛，避免大范围样式 churn。

## 实施顺序与依赖

```
第一批（S1 拆分前可做的独立小改）：V1 → V2 → V3 → V6
第二批（建议 S1 拆分后）：          V4 → V5
打磨批（任意时机）：                V7 → V8（依赖 V4 断点）→ V9（可选）
```

- 与 plan-competitor-ux S1 的关系：第一批均为局部小改（每项 ≤30 行量级），与拆分冲突面小；若 S1 已排期临近，也可 S1 先行、本计划全量后置——由当期实施者按排期定。

- 每项独立成 PR；client 改动后 `npm run build` 再 `npm test`（CI 产物新鲜度门禁拦截漏跑）。

- 发版类型：patch（纯样式与 a11y 修复，无行为 / 契约变化）；版本号发版时定，计划内不预先指定。

## 冒烟路径（发版前）

1. 键盘走查：Tab 全程可达、焦点环可见、树折叠可键盘操作、状态消息读屏播报（V2）。
2. 视觉对照：浅色 / 深色主题各过一遍设置页三卡片 + 撤回确认面板（V1 / V6 / V7）。
3. 窄屏：360–480px 宽面板走查表单与排除编辑器（V4 / V8）。
4. 功能回归：配置改-存-回读、排除编辑保存、快照树搜索 / 三级删除 / 全部删除 / gc、健康行与错误区显示（V3 / V5 / V6）。
5. 系统减少动效设置下过渡自动关闭（V9）。

