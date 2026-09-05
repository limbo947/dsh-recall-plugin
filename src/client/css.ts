/**
 * dsh-recall-plugin — client CSS（纯常量，无闭包依赖）
 *
 * 从原 lib/client.js apply 内的 css 数组原样抽出：所有撤回气泡、确认面板、
 * toast、设置卡片的样式表。styles 服务可用时经 stylesSvc.insert 注入，否则
 * 降级为直接 <style> 注入（静态 bundle 的 ctx 可能不提供 styles 服务）。
 */
export const CSS = [
  // 语义变量集中声明（V1-5）：btn-danger 的 hover 亮度是令牌体系外补丁，
  // 集中成单一来源避免散落硬编码；前景色用官方实证配对 bg-layer-3（error
  // primary 底色上文本随主题翻转，见 plan-settings-ui V1 核验记录）。
  ':root{--dsh-recall-btn-danger-hover:brightness(1.08);--dsh-recall-tree-indent:24px;--dsh-recall-space-1:4px;--dsh-recall-space-2:8px;--dsh-recall-space-3:12px}',
  '.dsh-recall-row{flex-direction:column;align-items:flex-end;gap:6px;display:flex}',
  '.dsh-recall-stack{flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(525px,82%);display:flex}',
  '.dsh-recall-bubble{background:var(--dsw-specific-bubble);max-width:100%;color:var(--dsw-alias-label-primary);border-radius:22px;padding:10px 16px;font-size:16px;line-height:1.5;white-space:pre-wrap;word-break:break-word}',
  '.dsh-recall-json{margin:0;max-width:100%;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;word-break:break-word;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-markdown-code-block)}',
  '.dsh-recall-actions{align-items:center;gap:10px;height:28px;display:flex}',
  '.dsh-recall-time{color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px;font-size:14px;line-height:1.5}',
  '.dsh-recall-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}',
  '.dsh-recall-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
  '@media (hover:hover){[data-time-hover-root] .dsh-recall-time{opacity:0;transition:opacity 80ms}[data-time-hover-root]:hover .dsh-recall-time,[data-time-hover-root]:focus-within .dsh-recall-time{opacity:1}}',
  '.dsh-recall-panel{width:min(480px,100%);box-sizing:border-box;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;text-align:left;box-shadow:0 8px 28px rgba(0,0,0,.22)}',
  '.dsh-recall-panel-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:1.5}',
  '.dsh-recall-panel-note{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;word-break:break-word}',
  '.dsh-recall-list{max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:2px;padding:4px 0}',
  '.dsh-recall-file{display:flex;gap:8px;align-items:baseline;font-size:12px;line-height:1.5}',
  '.dsh-recall-badge{flex:none;font-size:12px;line-height:1.5;padding:0 6px;border-radius:6px}',
  '.dsh-recall-badge-modified{color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary)}',
  '.dsh-recall-badge-restored{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-recall-badge-added{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-recall-rel{min-width:0;color:var(--dsw-alias-label-primary);word-break:break-all;font-family:var(--dsw-font-code, ui-monospace, SFMono-Regular, Consolas, monospace)}',
  // grid-column 对非 grid 祖先（exclude/快照卡片的 flex 布局）自动无效，无害；
  // 在 cfg-grid 内则保证操作区/占满行不被 auto-placement 塞进第一列撑爆列宽。
  '.dsh-recall-panel-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:2px;grid-column:1/-1}',
  // 按钮体系对齐官方设置卡（dsh-client-ui-settings-plugins PluginCard 底部按钮
  // 组实测产物）：次级 = 描边幽灵（discard 逐字配方——l2 描边 + 透明底，hover
  // 升 label-dimmed 描边 + primary 字色）；官方 discard/save 同高靠 save 也带
  // 1px 描边，故变体统一 border-color:transparent 保同盒模型。hover 用
  // :not(:disabled) 收口后，disabled 的 hover 抵消规则不再需要；disabled 透明度
  // 随官方 .4。
  '.dsh-recall-btn{border:1px solid var(--dsw-alias-border-l2);background:0 0;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;cursor:pointer;color:var(--dsw-alias-label-secondary)}',
  '.dsh-recall-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}',
  '.dsh-recall-btn:disabled,.dsh-recall-ex-chip:disabled{opacity:.4;cursor:default}',
  // 危险/主按钮的 hover 须显式重申文字与描边——基础 ghost hover 带伪类、优先级
  // 更高，会把它们的字色刷回 label-primary 并描出亮边
  '.dsh-recall-btn-danger{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-layer-3);border-color:transparent}',
  '.dsh-recall-btn-danger:hover:not(:disabled){color:var(--dsw-alias-bg-layer-3);border-color:transparent;filter:var(--dsh-recall-btn-danger-hover)}',
  // 主按钮（保存）改用官方插件设置卡 save 的逐字配方：label-primary 反色实心 +
  // bg-layer-3 前景（同列官方插件卡的保存即此形态，比 button-primary-fill 更贴
  // 设置页语境）；官方 save 无 hover 态，这里的 hover 规则只做「不被基础 ghost
  // hover 污染」的抵消，视觉变化为零即是官方行为。只挂「保存」，主次分明。
  '.dsh-recall-btn-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border-color:transparent}',
  '.dsh-recall-btn-primary:hover:not(:disabled){color:var(--dsw-alias-bg-layer-3);border-color:transparent}',
  // 焦点可见性对齐官方设置页实测写法（同上产物）：按钮类 = brand-primary 2px
  // outline（卡片头 offset -2px 内收，其余 +1px）；输入类 = brand-primary 描边
  // 变色、不套 ring。替换 V2-5 的 border-l3 环方案（当时核验的是旧版写法）。
  '.dsh-recall-btn:focus-visible,.dsh-recall-ex-chip:focus-visible,.dsh-recall-tree-toggle:focus-visible,.dsh-recall-cfg-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '.dsh-recall-cardbtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
  '.dsh-recall-ex-input:focus-visible,.dsh-recall-cfg-input:focus-visible,.dsh-recall-ex-area:focus-visible,.dsh-recall-cfg-area:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}',
  '.dsh-recall-toast{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:10000;max-width:min(560px,86vw);box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:10px 16px;font-size:13px;line-height:1.5;box-shadow:0 8px 28px rgba(0,0,0,.22);display:flex;align-items:baseline;gap:8px;opacity:0;transition:opacity .25s ease;pointer-events:auto}',
  '.dsh-recall-toast.dsh-recall-toast-in{opacity:1}',
  '.dsh-recall-toast-tag{flex:none;font-weight:600;color:var(--dsw-alias-state-error-primary)}',
  '.dsh-recall-ex-card{display:flex;flex-direction:column;gap:8px}',
  '.dsh-recall-ex-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:1.5}',
  '.dsh-recall-ex-note{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;word-break:break-word}',
  // 存储路径独立行：等宽字体 + break-all，Windows 长路径整齐折行；12px tertiary
  // 降为辅助信息层级（与说明正文同色系但更轻），margin-top 收紧与上一行说明的
  // 归属关系（ex-card 统一 gap 8px 对「说明→其路径」偏松）。
  '.dsh-recall-ex-path{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;font-family:var(--dsw-font-code, ui-monospace, SFMono-Regular, Consolas, monospace);word-break:break-all;margin-top:-4px}',
  // 输入类控件统一官方 field input 配方（At1oFq_input 逐字）：.5px l4 发丝描边 +
  // layer-3 底 + 8px 圆角 + 0/12px 内边距（单行框 34px 高）；卡片打开态底色是
  // layer-2，layer-3 输入框在其上恰好与官方插件配置卡同层叠关系
  '.dsh-recall-ex-area{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.5;font-family:var(--dsw-font-code, ui-monospace, SFMono-Regular, Consolas, monospace);resize:vertical;min-height:120px}',
  '.dsh-recall-ex-quick{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
  '.dsh-recall-ex-input{flex:1;min-width:180px;box-sizing:border-box;height:34px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}',
  // chip 改官方 badge 丸形配方（bg-module-platform + 999px）——树内小操作与
  // 排除建议属「标签级动作」，与状态徽章同形态更一致；hover 用 :not(:disabled)
  // 收口（与按钮同法）
  '.dsh-recall-ex-chip{border:none;border-radius:999px;padding:1px 10px;font-size:12px;line-height:1.5;cursor:pointer;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform)}',
  '.dsh-recall-ex-chip:hover:not(:disabled){color:var(--dsw-alias-label-primary)}',
  // V9 确认按钮 danger chip：红色文字 + 官方失败状态行底，与 .btn-danger 同义
  // 但保持 chip 尺寸层级（确认条内部不出现大按钮）
  '.dsh-recall-ex-chip-danger{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger)}',
  // 基础 chip hover 带伪类、优先级更高，会把危险 chip 的红字刷回普通色——
  // 显式重申保持 hover 下仍是红字（危险语义在悬停确认时最不能丢）
  '.dsh-recall-ex-chip-danger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary)}',
  '.dsh-recall-ex-status{margin-right:auto;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
  '.dsh-recall-ex-status-error{color:var(--dsw-alias-state-error-primary)}',
  '.dsh-recall-ex-status-success{color:var(--dsw-alias-state-success-primary)}',
  // V6 健康徽章（git 可用性）：pill 配色直接复用官方状态行配对——成功用
  // success-tertiary 底、失败用 interactive-bg-hover-danger 底（error 无
  // tertiary 令牌，官方失败状态行即用此搭配，主题感知）。
  '.dsh-recall-health-pill{display:inline-flex;align-items:center;padding:1px 10px;border-radius:999px;font-size:12px;line-height:1.5}',
  '.dsh-recall-health-pill-ok{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}',
  '.dsh-recall-health-pill-bad{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}',
  // V6 错误区标题：error 色 + 条数，错误不再是灰色小字（fail-loud 可见性）
  '.dsh-recall-errors-title{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5;font-weight:600}',
  '.dsh-recall-tree{display:flex;flex-direction:column;gap:2px;padding:4px 0}',
  '.dsh-recall-tree-node{display:flex;flex-direction:column;gap:1px}',
  '.dsh-recall-tree-row{display:flex;gap:6px;align-items:center;min-width:0;padding:2px 4px;border-radius:6px;cursor:default}',
  '.dsh-recall-tree-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  // V2 树折叠钮 span→button 的 UA 默认样式重置：button 自带 appearance/背景/边框/
  // 内边距，与 span 形态差异在此抹平，保证纯键盘可达不引入视觉回归。
  '.dsh-recall-tree-toggle{appearance:none;background:0 0;border:0;padding:0;font:inherit;flex:none;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:4px;font-size:12px;line-height:1.5;user-select:none}',
  '.dsh-recall-tree-toggle:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-recall-tree-toggle-placeholder{flex:none;width:18px;height:18px}',
  '.dsh-recall-tree-label{flex:1;min-width:0;display:flex;gap:8px;align-items:baseline;font-size:12px;line-height:1.5;overflow:hidden}',
  '.dsh-recall-tree-name{flex:none;font-weight:600;color:var(--dsw-alias-label-secondary)}',
  '.dsh-recall-tree-title{min-width:0;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.dsh-recall-tree-meta{flex:none;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
  // V4 树缩进契约化：总缩进 = --dsh-recall-tree-indent（折叠钮 18px + gap 6px），
  // children 按 2/3（16px margin）与 1/3（8px padding）拆分，恰好让子行文字
  // 与父行折叠钮右缘对齐——把「16+8 恰等于 18+6」的巧合变成单一事实源。
  '.dsh-recall-tree-children{display:flex;flex-direction:column;gap:1px;margin-left:calc(var(--dsh-recall-tree-indent)*2/3);border-left:1px solid var(--dsw-alias-border-l1);padding-left:calc(var(--dsh-recall-tree-indent)/3);animation:dsh-recall-unfold .16s ease-out}',
  '.dsh-recall-tree-confirm{display:flex;gap:8px;align-items:center;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);animation:dsh-recall-unfold .16s ease-out}',
  // V9 展开动效：opacity + 2px 上移入场（确认条/树展开共用一个 keyframes）。
  // 弃用 max-height 过渡：树展开高度可变（长列表数百 px），固定上限会裁切；
  // opacity+位移给出同等显隐反馈且零裁切风险。
  '@keyframes dsh-recall-unfold{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}',
  '@media (prefers-reduced-motion:reduce){.dsh-recall-tree-children,.dsh-recall-tree-confirm{animation:none}}',
  // 卡片对齐同列官方插件设置卡（YyYd_a_card 逐字配方）：.5px l4 发丝描边 +
  // 16px 圆角 + hover 升 label-dimmed 描边；打开态（layer-2 底 + dimmed 描边）
  // 本就与官方一致，保持不变
  '.dsh-recall-card{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;list-style:none;transition:border-color .16s,background .16s;display:flex;flex-direction:column;text-align:left}',
  '.dsh-recall-card:hover{border-color:var(--dsw-alias-label-dimmed)}',
  '.dsh-recall-card.dsh-recall-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
  '.dsh-recall-card-head{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}',
  '.dsh-recall-card-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
  '.dsh-recall-card-desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
  '.dsh-recall-card-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:12px 0 8px;display:flex;flex-direction:column;gap:12px}',
  '.dsh-recall-cardbtn{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}',
  // 折叠头（SectionToggle）复用卡片头 cardbtn：14/16px 内边距在卡片 body 内表现为
  // 16px 左缩进，与分组标题/表单内容错位（用户实测反馈）——body 内覆写为贴左，
  // 卡片头（.dsh-recall-card 直接子级）不受影响。
  '.dsh-recall-card-body .dsh-recall-cardbtn{padding:6px 0}',
  // 折叠头箭头贴左：tree-toggle 是 18px 定宽居中盒，▸/▾ 字形居中使其墨迹比
  // 上方表单标签右偏 ~5px（用户实测折叠头与内容左缘不齐）；盒内改左对齐后，
  // 三个折叠头（高级/排除配置/快照管理）箭头与标签共享同一左缘。
  '.dsh-recall-card-body .dsh-recall-cardbtn .dsh-recall-tree-toggle{justify-content:flex-start}',
  // 分区折叠头箭头旋转化：与官方卡片 chevron 同一动效语言（transition .16s、
  // 开合=旋转），替代 ▸/▾ 字符瞬切；只挂 SectionToggle，树内折叠钮维持字符
  // 切换不受影响
  '.dsh-recall-section-chevron{transition:transform .16s}',
  '.dsh-recall-section-chevron-open{transform:rotate(90deg)}',
  // cfg-grid：ConfigForm 全部行共享的单一 grid 容器。此前每行 cfg-row 是独立
  // grid，「第一列 max-content」各行各算，跨行对齐从未成立（checkbox/输入框
  // 列参差）；cfg-row 改 display:contents 透明化后，label/控件行/hint 直接成为
  // 本容器的 item，第一列列宽由全表单最长 label 决定——跨行对齐自此成立。
  '.dsh-recall-cfg-grid{display:grid;grid-template-columns:max-content minmax(0,1fr);column-gap:8px;row-gap:4px;align-items:start}',
  '.dsh-recall-cfg-row{display:contents}',
  '.dsh-recall-cfg-grid > .dsh-recall-cardbtn{grid-column:1/-1}',
  // V5 表单分组小标题：语义分组分隔符。组间用整行分隔线 + 加倍留白划界
  // （「快照行为」「自动治理」是两个配置维度，仅小标题用户实测分不清组界）；
  // 首组（紧跟卡片头）不需要分隔线，三件套清零。
  // 组间分隔线随官方发丝线规格（.5px l2，与官方卡体/字段分隔同粗细）
  '.dsh-recall-cfg-group{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;font-weight:600;grid-column:1/-1;margin-top:10px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2)}',
  '.dsh-recall-cfg-group:first-child{margin-top:0;padding-top:0;border-top:none}',
  // V4 后 cfg-line 只装控件（label 已是 cfg-row 直接子元素，占 grid 第一列 max-content）
  '.dsh-recall-cfg-line{display:flex;align-items:center;gap:8px;min-width:0;grid-column:2}',
  // 主标签用 label-primary + 官方字段标签字重 500（At1oFq_label），与 12px
  // tertiary 的说明文字拉开层级；说明固定在控件下方第二行，不混排进主标签行。
  '.dsh-recall-cfg-label{color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;font-weight:500}',
  // 数字输入框 = 官方 field input 配方（.5px l4 发丝描边 + layer-3 底 + 34px
  // 高 + 0/12px 内边距）叠加本插件既有约定：定宽 120px + 右对齐（不定宽时框宽
  // 随行内 tag 有无伸缩，实测参差）；tabular-nums 让同列数字等宽、纵向扫描
  // 小数位整齐。120px 足够容纳「0.01」~「1000000」区间。
  '.dsh-recall-cfg-input{flex:none;width:120px;box-sizing:border-box;height:34px;font:inherit;font-size:13px;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:0 12px}',
  // disabled 随官方 input：文字降 tertiary，不动透明度（整框变淡会让「框还在
  // 只是不可写」的语义变含糊）
  '.dsh-recall-cfg-input:disabled,.dsh-recall-cfg-area:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}',
  // 数字输入框隐藏原生加减微调按钮（spinner）：34px 高的定宽框里 spinner 挤占
  // 右侧数字区、跨引擎渲染不一（Chromium 上下箭头 / Firefox 无），与「右对齐
  // 数字」的纵向扫描相冲；隐藏后键盘 ↑↓ 与直接输入仍可用，步进语义不丢。
  // scope 到 cfg-input，不外溢影响宿主或其他插件的 number 输入。
  '.dsh-recall-cfg-input::-webkit-inner-spin-button,.dsh-recall-cfg-input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}',
  '.dsh-recall-cfg-input{-moz-appearance:textfield;appearance:textfield}',
  '.dsh-recall-cfg-area{font-family:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:6px 8px;min-height:64px;box-sizing:border-box;width:100%;grid-column:2}',
  // 布尔开关：官方设置表单的布尔字段用 role=switch 滑钮而非原生 checkbox
  //（vCGm7G_switch 逐字配方：36×20 轨道 border-l3 底、开=brand-primary、
  // 16px 拇指 label-primary-foreground 滑动 16px、transition .12s）
  '.dsh-recall-cfg-switch{box-sizing:border-box;flex:none;width:36px;height:20px;padding:2px;border:0;border-radius:10px;background:var(--dsw-alias-border-l3);cursor:pointer;position:relative}',
  '.dsh-recall-cfg-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}',
  '.dsh-recall-cfg-switch:disabled{opacity:.4;cursor:default}',
  '.dsh-recall-cfg-switch-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:transform .12s}',
  '.dsh-recall-cfg-switch[aria-checked="true"] .dsh-recall-cfg-switch-thumb{transform:translateX(16px)}',
  // hint 的 padding-bottom 即组内行距的单一事实源（row-gap 只管网格行缝）——
  // 行间节奏统一为 8+4=12px，避免各行松紧不一。
  '.dsh-recall-cfg-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;grid-column:2;padding-bottom:8px}',
  // 基础排除表通栏（baseExcludes textarea/hint）：折叠展开后内容顶满卡片宽度，
  // 消除左侧 label 列竖直死区。必须定义在 480px media 之前——media 内的
  // grid-column:auto 同特异性、后出现，窄屏下仍能正确回落单列堆叠。
  '.dsh-recall-cfg-span{grid-column:1/-1}',
  // V4/V8 共用 480px 断点：cfg 表单单列堆叠（V4）；exclude quick 行输入框独占
  // 一行（flex:1 1 100%，basis 100% 强制换行，添加按钮与芯片建议另起一行）、
  // panel-actions 长状态文案不再挤压按钮（wrap 已在基础规则，此处无需重复）。
  '@media (max-width:480px){.dsh-recall-cfg-grid{grid-template-columns:minmax(0,1fr);row-gap:2px}.dsh-recall-cfg-line,.dsh-recall-cfg-hint,.dsh-recall-cfg-area{grid-column:auto}.dsh-recall-ex-quick .dsh-recall-ex-input{flex:1 1 100%}}',
  '.dsh-recall-cfg-tag{flex:none;font-size:12px;line-height:1.4;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary)}',
  // 已修改（用户改了配置）用 warn 底色提示「有未保存变更」——修改不是错误，
  // warn 家族来自 V1 核验的官方配对（tertiary 底 + label 文）。
  '.dsh-recall-cfg-tag-modified{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label)}',
  // 环境变量锁定：系统锁住不可写，区别于「已覆盖」（值被更高优先源覆盖）——
  // 两者同属中性，用左边框做结构级区分，不引入第三色。
  '.dsh-recall-cfg-tag-locked{border-left:2px solid var(--dsw-alias-border-l2)}',
  // V3 快照树加载骨架：items===null 时的 5 条占位行，pulse 明暗呼吸模拟加载。
  '.dsh-recall-tree-skeleton{display:flex;flex-direction:column;gap:2px;padding:4px 0}',
  '.dsh-recall-tree-skeleton-row{height:20px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);animation:dsh-recall-pulse 1.2s ease-in-out infinite}',
  '@keyframes dsh-recall-pulse{0%,100%{opacity:1}50%{opacity:.45}}'
].join('')
