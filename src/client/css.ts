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
  '.dsh-recall-panel-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:2px}',
  '.dsh-recall-btn{border:none;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;cursor:pointer;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-recall-btn:hover{color:var(--dsw-alias-label-primary)}',
  '.dsh-recall-btn:disabled,.dsh-recall-ex-chip:disabled{opacity:.5;cursor:default}',
  '.dsh-recall-btn:disabled:hover,.dsh-recall-ex-chip:disabled:hover{color:var(--dsw-alias-label-secondary)}',
  '.dsh-recall-btn-danger{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-layer-3)}',
  '.dsh-recall-btn-danger:hover{color:var(--dsw-alias-bg-layer-3);filter:var(--dsh-recall-btn-danger-hover)}',
  // 焦点环（V2-5）：focus-visible 令牌不存在（核验见计划文档），按官方按钮
  // 惯例用 border-l3 2px 环 + outline:none——border-l2 加深一档即 border-l3，
  // 与官方 settings 卡片按钮 focus 写法逐字一致。
  '.dsh-recall-btn:focus-visible,.dsh-recall-ex-chip:focus-visible,.dsh-recall-tree-toggle:focus-visible,.dsh-recall-cardbtn:focus-visible,.dsh-recall-ex-input:focus-visible,.dsh-recall-cfg-input:focus-visible,.dsh-recall-ex-area:focus-visible,.dsh-recall-cfg-area:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3);outline:none}',
  '.dsh-recall-toast{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:10000;max-width:min(560px,86vw);box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:10px 16px;font-size:13px;line-height:1.5;box-shadow:0 8px 28px rgba(0,0,0,.22);display:flex;align-items:baseline;gap:8px;opacity:0;transition:opacity .25s ease;pointer-events:auto}',
  '.dsh-recall-toast.dsh-recall-toast-in{opacity:1}',
  '.dsh-recall-toast-tag{flex:none;font-weight:600;color:var(--dsw-alias-state-error-primary)}',
  '.dsh-recall-ex-card{display:flex;flex-direction:column;gap:8px}',
  '.dsh-recall-ex-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:1.5}',
  '.dsh-recall-ex-note{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;word-break:break-word}',
  '.dsh-recall-ex-area{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;font-size:12px;line-height:1.5;font-family:var(--dsw-font-code, ui-monospace, SFMono-Regular, Consolas, monospace);resize:vertical;min-height:120px}',
  '.dsh-recall-ex-quick{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
  '.dsh-recall-ex-input{flex:1;min-width:180px;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 10px;font-size:13px;line-height:1.5}',
  '.dsh-recall-ex-chip{border:none;border-radius:6px;padding:2px 8px;font-size:12px;line-height:1.5;cursor:pointer;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-recall-ex-chip:hover{color:var(--dsw-alias-label-primary)}',
  // V9 确认按钮 danger chip：红色文字 + 官方失败状态行底，与 .btn-danger 同义
  // 但保持 chip 尺寸层级（确认条内部不出现大按钮）
  '.dsh-recall-ex-chip-danger{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger)}',
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
  '.dsh-recall-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s;display:flex;flex-direction:column;text-align:left}',
  '.dsh-recall-card.dsh-recall-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
  '.dsh-recall-card-head{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}',
  '.dsh-recall-card-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
  '.dsh-recall-card-desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
  '.dsh-recall-card-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:12px 0 8px;display:flex;flex-direction:column;gap:12px}',
  '.dsh-recall-cardbtn{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}',
  '.dsh-recall-cfg-row{display:grid;grid-template-columns:max-content minmax(0,1fr);column-gap:8px;row-gap:4px;align-items:start}',
  // V5 表单分组小标题：语义分组分隔符，字号与 hint 同级、加粗 + label-secondary
  // 作层级区分，不引入第三层字阶。
  '.dsh-recall-cfg-group{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;font-weight:600}',
  // V4 后 cfg-line 只装控件（label 已是 cfg-row 直接子元素，占 grid 第一列 max-content）
  '.dsh-recall-cfg-line{display:flex;align-items:center;gap:8px;min-width:0;grid-column:2}',
  '.dsh-recall-cfg-label{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5}',
  '.dsh-recall-cfg-input{flex:1;min-width:0;box-sizing:border-box;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 8px}',
  '.dsh-recall-cfg-input:disabled{opacity:.5}',
  '.dsh-recall-cfg-area{font-family:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 8px;min-height:64px;box-sizing:border-box;width:100%;grid-column:2}',
  '.dsh-recall-cfg-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;grid-column:2}',
  // V4/V8 共用 480px 断点：cfg 表单单列堆叠（V4）；exclude quick 行输入框独占
  // 一行（flex:1 1 100%，basis 100% 强制换行，添加按钮与芯片建议另起一行）、
  // panel-actions 长状态文案不再挤压按钮（wrap 已在基础规则，此处无需重复）。
  '@media (max-width:480px){.dsh-recall-cfg-row{grid-template-columns:minmax(0,1fr);row-gap:2px}.dsh-recall-cfg-line,.dsh-recall-cfg-hint,.dsh-recall-cfg-area{grid-column:auto}.dsh-recall-ex-quick .dsh-recall-ex-input{flex:1 1 100%}}',
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
