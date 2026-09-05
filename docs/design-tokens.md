# DSH 设计令牌与组件配方参考

> 状态：长期规范（「一直成立的事实」，无完成态；随 dsh 版本巡检维护）
>
> 归档：2026-09-05 核对，dsh 0.1.2-rc.1。**dsh 升级后**：跑 `npm run check:upgrade`，并按 §7 方法重抽令牌清单与本文比对，变化同步回本文与 AGENTS.md 合规清单。

本插件 client UI（设置卡片、撤回气泡、toast 等）要与 DSH 官方观感一致，唯一可靠的办法是**复用官方语义令牌 + 抄官方同部位组件配方**。本文沉淀已核验的令牌清单与配方摘录，作为后续改 UI 的第一参考——先查本文，再查官方产物，禁止凭印象写颜色/圆角/字阶。

## 1. 事实源与核验方法

| 层 | 事实源 | 说明 |
| --- | --- | --- |
| 令牌定义 | `dsh-client-ui-theme/lib/client.js` | `var(--dsw-alias-…)` 等全部在此定义；**一个令牌是否存在以此为准** |
| 设置页组件配方 | `dsh-client-ui-settings-plugins/lib/client.js` | 插件设置卡（卡片/按钮/字段/开关/badge）——与本插件设置卡片同列同语境，最贴近 |
| 设置页外壳 | `dsh-client-ui-settings-general/lib/client.js` | 弹窗/导航/分区容器级样式 |
| 插件列表 | `dsh-client-ui-settings-plugin-inventory/lib/client.js` | 卡片网格/分组折叠/状态点的另一种官方口味 |

路径前缀：`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\`（下文简称 `<pkg>/lib/client.js`）。

核验命令（PowerShell，合规清单 #8「字段假设必须核验」的 CSS 版）：

```powershell
# 某令牌是否存在 + 全量清单
$f = "<pkg前缀>dsh-client-ui-theme\lib\client.js"
Select-String -Path $f -Pattern '--dsw-alias-brand-primary' -Quiet
[regex]::Matches((Get-Content $f -Raw), '--(dsw-alias|dsw-specific|dsw-elevation|dsw-mask|dsw-font|dsh-scrollbar)-[a-z0-9-]+') | ForEach-Object Value | Sort-Object -Unique

# 提取某官方包的组件 CSS（CSS Modules 混淆类名形如 `.AbC123_xxx{…}`）
$c = Get-Content "<pkg前缀>dsh-client-ui-settings-plugins\lib\client.js" -Raw
[regex]::Matches($c, '\.[_a-zA-Z][\w-]*_[\w-]+\{[^}]*\}') | ForEach-Object Value
```

注意：官方 CSS Modules 类名（`YyYd_a_card` 等）是**构建哈希**，随版本会变——引用配方时引「规则内容」，不能引类名。

## 2. 令牌命名空间

| 前缀 | 含义 | 使用立场 |
| --- | --- | --- |
| `--dsw-alias-*` | 语义别名（bg/border/label/state/button/brand…），随主题（明暗）翻转 | **首选**，插件 UI 只用这一层做颜色 |
| `--dsw-specific-*` | 具象场景专用（聊天气泡、侧栏、菜单等） | 仅对应场景使用（如撤回气泡 `specific-bubble`） |
| `--dsw-elevation-*` | 阴影（soft/panel/prominent/stroke） | 浮层、悬浮卡 |
| `--dsw-font-*` | 排版组合令牌（字号+字重+行高成组，如 `xs-13`、`xxs-strong-12`） | 需要与官方逐像素一致时用；一般直接写字号+line-height 即可 |
| `--dsw-mask-*` | 遮罩（`mask-blur: blur(2px)` 等） | 弹窗遮罩 |
| `--dsh-scrollbar-*` | 滚动条 | 自定义滚动区 |
| `--ds-*` | 基础原子（缓动 `--ds-ease-in-out`、代码字体 `--ds-font-family-code`） | 官方组件自身在用，可引用 |

## 3. 颜色令牌速查（含本插件使用处）

> 完整清单按 §1 命令重抽；本表只收「已核验 + 本插件在用/高频」。

### 3.1 背景层

| 令牌 | 用途 | 本插件使用处 |
| --- | --- | --- |
| `bg-base` | 最底色 | 撤回确认面板、toast 底 |
| `bg-layer-1` | 层 1 | — |
| `bg-layer-2` | 卡片打开态底 | 设置卡 `.dsh-recall-card-open` |
| `bg-layer-3` | 常规卡底；**输入框底**；反色实心按钮的文字色 | 设置卡、`cfg-input`/`ex-area`、`btn-danger`/`btn-primary` 前景 |
| `bg-module-platform` | 徽章/芯片底 | `cfg-tag`、`ex-chip` |
| `bg-skeleton` | 骨架屏 | 可选（当前骨架用 `interactive-bg-hover`） |
| `bg-mask-1` | 弹窗遮罩 | — |

层叠关系：设置卡打开态是 `layer-2`，输入框用 `layer-3` 恰好形成官方同款「卡内凹一级」关系。

### 3.2 边框

| 令牌 | 层级 | 本插件使用处 |
| --- | --- | --- |
| `border-l1` | 最浅 | 树缩进引导线 |
| `border-l2` | 中 | **发丝分隔线（.5px）标配**：卡体分隔、字段间分隔、组间分隔 |
| `border-l3` | 深 | switch 关态轨道底 |
| `border-l4` | 最深发丝 | **卡片描边、输入框描边（.5px）标配** |
| `label-dimmed` | — | hover/打开态的描边加深色（官方把文字令牌当边框用，照抄） |

### 3.3 文字层级

| 令牌 | 语义 | 本插件约定 |
| --- | --- | --- |
| `label-primary` | 正文/标题 | 卡片名、字段主标签、输入文字、树标题 |
| `label-secondary` | 次级 | 次级按钮字、badge 默认字、组标题 |
| `label-tertiary` | 辅助说明 | hint、说明 note、meta、单位后缀、disabled 输入文字 |
| `label-dimmed` | 弱化（也用作边框加深） | — |
| `label-primary-foreground` | **反白文字**（配合深底） | switch 拇指、badge 等深底上的前景 |

### 3.4 交互态

| 令牌 | 用途 |
| --- | --- |
| `interactive-bg-hover` | 悬停底（树行 hover、次级 chip 备选底） |
| `interactive-bg-hover-danger` | 危险悬停底（失败 pill 底、危险 chip 底） |
| `interactive-bg-hover-solid` | 实心悬停底 |

### 3.5 状态色（官方成对配方，勿自行混搭）

| 状态 | 文本 | 浅底 | 本插件使用处 |
| --- | --- | --- | --- |
| 成功 | `state-success-primary` | `state-success-tertiary` | 保存成功提示、git 可用 pill |
| 警告 | `state-warn-label` | `state-warn-tertiary` | 「已修改」badge（修改≠错误） |
| 错误 | `state-error-primary` | `interactive-bg-hover-danger`（error 无 tertiary） | 错误文案、危险按钮、删除确认 chip |
| 业务/链接 | `state-business-primary` | `state-business-tertiary` | 跳转链接色（官方 jumpLink 口径） |

### 3.6 品牌与按钮

| 令牌 | 用途 | 本插件使用处 |
| --- | --- | --- |
| `brand-primary` | 品牌主色 | switch 开态轨道、焦点环 |
| `button-primary-fill` / `button-primary-hover` | 聊天侧主按钮填充 | （聊天侧若需主按钮时用；设置页主按钮用反色方案，见 §5.2） |
| `button-primary-dimmed` | 主按钮弱化态 | — |
| `specific-bubble` | 聊天气泡底 | 撤回气泡 `.dsh-recall-bubble` |

## 4. 排版

- 官方字号组（`--dsw-font-*`）：`xxxs-11` / `xxs-12` / `xs-13` / `s-14` / `base-16` / `m-18` / `l-20` / `xl-24`，另有 `-strong-` 变体（同号加粗）。本插件字阶约定 **15/14/13/12 四级**（卡片名 15、分区标题 14、正文/标签 13、辅助 12；badge 例外 11px/500，官方 badge 即 11）。
- 行高写**无单位** `1.4`/`1.5`（官方两种都在用；V7 已全量收敛）。
- 等宽字体：官方定义是 **`--ds-font-family-code`**（值含 SF Mono / JetBrains Mono / Fira Code / Consolas / PingFang SC / Microsoft YaHei 等）。本插件当前写 `var(--dsw-font-code, ui-monospace, …)`——**`--dsw-font-code` 在 theme 中并无定义**，实际始终走兜底栈（观感可用；后续可切 `--ds-font-family-code` 收敛，改动点：`css.ts` 全部 `--dsw-font-code`）。
- 缓动：`--ds-ease-in-out`（官方 chevron 用 `transform .14s var(--ds-ease-in-out)`）；本插件折叠动效统一 `.16s` 档。

## 5. 官方组件配方摘录（2026-09-05 抄自产物，核对版本 0.1.2-rc.1）

> 以下规则内容逐字核对自官方产物，类名已隐去（哈希会漂移）。改动对应部位前先对照本节，改完在产物里复核一遍。

### 5.1 插件设置卡（来源 settings-plugins）

```css
/* 卡片 */
{ border:.5px solid var(--dsw-alias-border-l4); background:var(--dsw-alias-bg-layer-3);
  border-radius:16px; transition:border-color .16s, background .16s }
:hover    { border-color:var(--dsw-alias-label-dimmed) }          /* 悬停描边加深 */
.dsh-open { background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-label-dimmed) }
/* 卡头按钮 */
{ padding:14px 16px; gap:12px; border-radius:12px; align-items:center }
/* 卡名/描述 */
name{ font-size:15px; font-weight:600; line-height:1.4; color:label-primary }
desc{ font-size:13px; line-height:1.5; color:label-tertiary }
/* 卡体 */
{ border-top:.5px solid var(--dsw-alias-border-l2); margin:0 16px; padding-bottom:8px }
/* chevron */
{ color:label-tertiary; transition:transform .14s var(--ds-ease-in-out) } 开=rotate(180deg)
/* 头部焦点环 */
:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:-2px }
```

本插件映射：`.dsh-recall-card` / `.dsh-recall-cardbtn` / `.dsh-recall-card-name|desc` / `.dsh-recall-card-body` / `.dsh-recall-section-chevron(-open)`。

### 5.2 卡 footer 按钮组（来源 settings-plugins，本插件所有次级/主按钮的母版）

```css
/* 共同骨架 */
{ appearance:none; font:inherit; cursor:pointer; border:1px solid #0000;
  border-radius:8px; padding:5px 14px; font-size:13px; line-height:1.5 }
/* 次级（放弃/恢复/刷新…）= 描边幽灵 */
{ border-color:var(--dsw-alias-border-l2); color:var(--dsw-alias-label-secondary); background:0 0 }
:hover:not(:disabled) { color:label-primary; border-color:label-dimmed }
/* 主动作（保存）= 反色实心 */
{ background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-3) }  /* 官方无 hover 态 */
/* 禁用 */
:disabled { opacity:.4; cursor:default }
/* 焦点（footer 组）*/
:focus-visible { outline:2px solid brand-primary; outline-offset:1px }
```

要点：次级与主按钮**同盒模型**（都带 1px 边，主按钮边透明）；danger 变体在本插件为 `state-error-primary` 底 + `bg-layer-3` 文 + 透明边 + hover `brightness(1.08)`。本插件映射：`.dsh-recall-btn` / `.dsh-recall-btn-primary` / `.dsh-recall-btn-danger`。

### 5.3 表单字段（来源 settings-plugins）

```css
/* 字段行 */
{ flex-direction:column; gap:6px; padding:12px 0; display:flex }
field + field { border-top:.5px solid var(--dsw-alias-border-l2) }   /* 字段间发丝线 */
/* 标签 / 说明 */
label{ font-size:13px; font-weight:500; line-height:1.5; color:label-primary }
hint { font-size:12px; line-height:1.5; color:label-tertiary }
/* 单行输入框 */
{ border:.5px solid var(--dsw-alias-border-l4); background:var(--dsw-alias-bg-layer-3);
  height:34px; border-radius:8px; padding:0 12px; font-size:13px; line-height:1.5;
  color:label-primary }
:focus-visible { border-color:var(--dsw-alias-brand-primary); outline:none }
:disabled      { color:label-tertiary; cursor:default }
```

本插件叠加约定（在官方配方之上）：数字框定宽 120px + 右对齐 + `font-variant-numeric:tabular-nums`；label 列 `max-content` 跨行对齐（cfg-grid）。映射：`.dsh-recall-cfg-label|hint|input|area` / `.dsh-recall-ex-input|area`。

### 5.4 badge / 状态标签（来源 settings-plugins）

```css
badge      { background:var(--dsw-alias-bg-module-platform); color:label-secondary;
             border-radius:999px; padding:1px 8px; font-size:11px; font-weight:500; line-height:17px }
badgeMuted { color:label-tertiary; border-radius:999px; padding:1px 8px; font-size:11px;
             line-height:17px }                                    /* 无底色弱化 */
```

映射：`.dsh-recall-cfg-tag(-modified|-locked)`；量纲类文字（条/小时/MB/天）**不用 badge**，用 12px tertiary 纯文本（`.dsh-recall-cfg-unit`）。

### 5.5 switch 开关（来源 settings-plugins，布尔字段的官方形态）

```css
switch   { box-sizing:border-box; background:var(--dsw-alias-border-l3); cursor:pointer;
           border:0; border-radius:10px; width:36px; height:20px; padding:2px; position:relative }
switch 开 { background:var(--dsw-alias-brand-primary) }
thumb    { background:var(--dsw-alias-label-primary-foreground); border-radius:50%;
           width:16px; height:16px; transition:transform .12s }
开 thumb  { transform:translateX(16px) }
/* 行 */
toggleRow { display:flex; justify-content:space-between; gap:16px; font-size:13px; color:label-primary }
```

DOM 约定：`button[type=button][role=switch][aria-checked]` + 内层 thumb span；label 用 `htmlFor` 关联 button id。映射：`.dsh-recall-cfg-switch(-thumb)`（`config-card.ts` `boolRow`）。

### 5.6 分组与分区折叠（来源 plugin-inventory）

```css
group      { border-top:.5px solid var(--dsw-alias-border-l2); padding-top:14px }  /* 组间划界 */
groupTitle { font-size:14px; font-weight:400; line-height:22px; color:label-primary }
chevron    { transition:transform .14s }  开=rotate(180deg)，字形不换
```

本插件映射：`.dsh-recall-cfg-group`（组标题 13px/600 + .5px l2 分隔线，先于 V5 存在，保留自有口径）；`SectionToggle` 箭头用 `▸` 旋转（`.dsh-recall-section-chevron-open` = rotate(90deg)）。

### 5.7 分隔线规格总表

| 场景 | 规格 |
| --- | --- |
| 卡体分隔（card body 顶线） | `.5px solid border-l2` |
| 字段间（field + field） | `.5px solid border-l2` |
| 组间（group 顶线） | `.5px solid border-l2` |
| 卡片/输入框描边 | `.5px solid border-l4` |
| 树缩进引导线 | `1px solid border-l1` |

统一口径：**结构分隔一律 .5px 发丝线**（低 DPR 屏渲染略淡是官方接受的观感），粗线只用于输入框内描边（浏览器对 input 的 .5px 兼容良好）与树线。

### 5.8 阴影

| 令牌 | 场景 |
| --- | --- |
| `elevation-stroke` | 常规卡（描边式轻阴影，官方插件列表卡在用） |
| `elevation-soft` / `panel` | 中度浮起 |
| `elevation-prominent` | 弹窗（官方设置弹窗面板在用） |

本插件确认面板/toast 现用自定阴影 `0 8px 28px rgba(0,0,0,.22)`（历史遗留，观感可接受；若要与官方浮层完全对齐可切 `elevation-prominent`）。

## 6. 本插件落地约定（写 CSS 前读）

1. **颜色只许语义令牌**，禁止硬编码色值/rgba 混色——主题（明暗）翻转才安全。例外：阴影阴影色可用官方 elevation 令牌或既有 rgba 阴影。
2. **新组件先找官方同部位配方**（§5 或按 §1 命令重抽），有配方抄配方，没配方再按令牌语义自组；拿不准的令牌先核验存在。
3. **字号只用 15/14/13/12/11(badge)**，行高 1.4/1.5；等宽场景等官方 `--ds-font-family-code` 或本插件兜底栈。
4. **焦点可见性两套写法**：按钮/可点 chip → `outline:2px solid brand-primary`（卡头 offset -2px，浮层组 +1px）；输入类 → `border-color: brand-primary` + `outline:none`。
5. **禁用态**：按钮/chip/switch → `opacity:.4`；输入框 → 文字降 tertiary（整框不变淡）。
6. **间距/缩进单一事实源**：`css.ts` 顶部 `--dsh-recall-space-1/2/3` 与 `--dsh-recall-tree-indent`；组内行距统一 12px（hint padding-bottom 8 + row-gap 4）。
7. 聊天气泡等聊天侧元素用 `--dsw-specific-*`；设置页元素只用 `--dsw-alias-*`。
8. 改样式后 `npm run build` 产物随源码提交（CI 新鲜度门禁），并按 AGENTS.md 冒烟路径目检明暗两主题。

## 7. 版本巡检与本文维护

1. dsh 升级后：`npm run check:upgrade` 三层门禁 + §1 命令重抽令牌清单，与 §3/§4 比对；官方组件 CSS 重抽后与 §5 逐条比对（类名哈希变化忽略，规则内容变化要记录）。
2. 新增官方调用点（新组件/新令牌）时，把核验结果补进本文对应小节；发现本文与产物冲突，以产物为准并回改本文。
3. 与 `docs/compat-audit.md` 台账的关系：台账管「官方 API 行为不变量」，本文管「视觉配方事实源」；dsh 升级若涉及 client UI 包重组（如 I29），两处都要过。
