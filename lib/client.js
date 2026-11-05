"use strict";
(() => {
  // src/client/css.ts
  var CSS = [
    // 语义变量集中声明（V1-5）：btn-danger 的 hover 亮度是令牌体系外补丁，
    // 集中成单一来源避免散落硬编码；前景色用官方实证配对 bg-layer-3（error
    // primary 底色上文本随主题翻转，见 plan-settings-ui V1 核验记录）。
    ":root{--dsh-recall-btn-danger-hover:brightness(1.08);--dsh-recall-tree-indent:24px;--dsh-recall-space-1:4px;--dsh-recall-space-2:8px;--dsh-recall-space-3:12px;--dsh-recall-input-w:120px;--dsh-recall-switch-w:36px}",
    ".dsh-recall-row{flex-direction:column;align-items:flex-end;gap:6px;display:flex}",
    // 新面（factory）本层包裹官方 UserContent，官方 `.userStack` 自带
    // max-width:min(calc(chat*0.702),82%)；外层再限一次即双层收缩，故全宽只在
    // 官方面放开。legacy 自绘面（0.1.x / factory 回落）仍靠原 cap 约束长文本。
    ".dsh-recall-stack{flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(525px,82%);display:flex}",
    ".dsh-recall-stack-official{width:100%;max-width:100%}",
    ".dsh-recall-bubble{background:var(--dsw-specific-bubble);max-width:100%;color:var(--dsw-alias-label-primary);border-radius:22px;padding:10px 16px;font-size:16px;line-height:1.5;white-space:pre-wrap;word-break:break-word}",
    ".dsh-recall-json{margin:0;max-width:100%;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;word-break:break-word;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-markdown-code-block)}",
    // 文件卡片（消息里的 file 块，非图片附件）：复刻官方 UserStyleBubble 的附件卡
    // ——品牌色扩展名徽标 + 文件名（单行省略）+ 「MD 6.7KB」元信息行；令牌沿用
    // 卡片体系（layer-3 底 + 发丝描边），与图片附件的「附件在上」布局并列。
    ".dsh-recall-filecard{display:flex;align-items:center;gap:10px;max-width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:12px;padding:8px 12px}",
    ".dsh-recall-filecard-icon{flex:none;width:34px;height:34px;border-radius:8px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);font-size:11px;font-weight:600;line-height:1;letter-spacing:.02em;display:flex;align-items:center;justify-content:center}",
    ".dsh-recall-filecard-body{display:flex;flex-direction:column;gap:2px;min-width:0}",
    ".dsh-recall-filecard-name{color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".dsh-recall-filecard-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.4}",
    ".dsh-recall-actions{align-items:center;gap:10px;height:28px;display:flex}",
    ".dsh-recall-time{color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px;font-size:14px;line-height:1.5}",
    ".dsh-recall-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;corner-shape:round;justify-content:center;align-items:center;padding:6px;display:inline-flex}",
    ".dsh-recall-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
    "@media (hover:hover){[data-time-hover-root] .dsh-recall-time{opacity:0;transition:opacity 80ms}[data-time-hover-root]:hover .dsh-recall-time,[data-time-hover-root]:focus-within .dsh-recall-time{opacity:1}}",
    ".dsh-recall-panel{width:min(480px,100%);box-sizing:border-box;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;text-align:left;box-shadow:0 8px 28px rgba(0,0,0,.22)}",
    ".dsh-recall-panel-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:1.5}",
    ".dsh-recall-panel-note{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;word-break:break-word}",
    // 消息位置的编辑卡（issue #26）：官方不允许第二个 composer 实例，这张卡是
    // 插件自绘的「官方同款」——外框逐字对齐官方 composer 卡片（panel 圆角 /
    // input-major 底 / soft 阴影 / 14-24 字号行高），底部官方输入框保持原样
    ".dsh-recall-stack-editing{width:100%;max-width:100%}",
    ".dsh-recall-composer{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:10px 12px 8px;border-radius:var(--dsw-radius-panel);background:var(--dsw-specific-input-major);box-shadow:var(--dsw-elevation-soft);font-size:var(--dsh-content-font-size,14px);line-height:calc(24px + var(--dsh-content-font-delta,0px))}",
    // 卡内文本区：透明无环（外框已给足层次），随内容增高到 260px 后内部滚动；
    // 高度由 edit-node 按 scrollHeight 写成内联样式
    ".dsh-recall-composer .dsh-recall-edit-area{width:100%;box-sizing:border-box;min-height:48px;max-height:260px;padding:2px 2px 0;background:0 0;color:var(--dsw-alias-label-primary);border:0;border-radius:0;font-size:inherit;line-height:inherit;font-family:inherit;resize:none;overflow-y:auto;box-shadow:none}",
    // 官方输入区聚焦时没有边框/描边变化（只有光标），编辑区跟随
    ".dsh-recall-edit-area:focus,.dsh-recall-edit-area:focus-visible{outline:none;border:0}",
    ".dsh-recall-edit-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5}",
    ".dsh-recall-composer-attachments{display:flex;flex-wrap:wrap;gap:6px}",
    ".dsh-recall-composer-attach{display:inline-flex;align-items:center;gap:2px;max-width:100%;padding:2px 4px 2px 10px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}",
    ".dsh-recall-composer-attach-name{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".dsh-recall-composer-attach-x{border:0;background:0;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:14px;line-height:1;padding:2px 6px;border-radius:999px;corner-shape:round}",
    ".dsh-recall-composer-attach-x:hover{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}",
    // 图片附件：固定 56px 缩略图，删除键做成角标，避免名字挤占宽度
    ".dsh-recall-composer-attach-image{position:relative;width:56px;height:56px;padding:0;border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-3)}",
    ".dsh-recall-composer-thumb{display:block;width:100%;height:100%;object-fit:cover}",
    ".dsh-recall-composer-attach-x-badge{position:absolute;top:2px;right:2px;width:18px;height:18px;padding:0;display:grid;place-items:center;font-size:12px;line-height:1;color:#fff;background:rgba(0,0,0,.55)}",
    ".dsh-recall-composer-attach-x-badge:hover{background:var(--dsw-alias-state-error-primary);color:#fff}",
    // 底行：加号 → 只读 chip → 提示 → 发送。发送键对齐官方（圆形 brand 底）
    ".dsh-recall-composer-foot{display:flex;align-items:center;gap:8px;min-height:32px}",
    ".dsh-recall-composer-add{position:relative;flex:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:50%;corner-shape:round;background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer}",
    ".dsh-recall-composer-add:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    '.dsh-recall-composer-add[aria-disabled="true"]{opacity:.4;cursor:default}',
    // 视觉隐藏但可聚焦：label 点击开选择框，键盘也能 Tab 进来
    ".dsh-recall-composer-file{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    ".dsh-recall-composer-chip{flex:none;max-width:180px;padding:2px 8px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    // 模型 chip 是按钮：菜单锚在它上方，打开时不改变底行高度
    ".dsh-recall-composer-model{position:relative;flex:none;display:inline-flex;min-width:0}",
    // chip 内部与官方 trigger 同构：模型名（常规色）+ 档位（caption 色）+ chevron
    // 静止态不加底色（官方 trigger 同样透明），只在 hover/展开时给一层 hover 底
    ".dsh-recall-composer-chip-btn{display:inline-flex;align-items:center;gap:4px;height:28px;max-width:260px;padding:0 6px 0 10px;border:0;font-family:inherit;cursor:pointer;background:0 0}",
    ".dsh-recall-composer-chip-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-recall-composer-chip-btn.is-open{background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-recall-composer-chip-btn:disabled{opacity:.6;cursor:default}",
    ".dsh-recall-composer-chip-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}",
    ".dsh-recall-composer-chip-effort{flex:none;color:var(--dsw-alias-label-caption)}",
    ".dsh-recall-composer-chip-chevron{flex:none;display:grid;place-items:center;color:var(--dsw-alias-label-caption);transition:transform .12s}",
    ".dsh-recall-composer-chip-btn.is-open .dsh-recall-composer-chip-chevron{transform:rotate(180deg)}",
    // 模型菜单：度量对齐官方（4px 内边距、34px 行高、13px 名字、md 圆角、prominent 阴影）。
    // 底色用不透明 bg-base——官方那层半透明材质是构建期哈希类名，跨版本不可依赖
    ".dsh-recall-menu{position:absolute;left:0;bottom:calc(100% + 6px);z-index:7;display:flex;flex-direction:column;width:max-content;min-width:min(240px,100vw - 32px);max-width:min(420px,100vw - 32px);max-height:min(360px,100vh - 96px);padding:4px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-elevation-prominent);overflow:hidden}",
    ".dsh-recall-menu-cell{display:flex;align-items:center;gap:6px;width:100%;height:34px;padding:0 8px;border:0;border-radius:var(--dsw-radius-md);background:0 0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;text-align:left;cursor:pointer}",
    ".dsh-recall-menu-cell:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-recall-menu-cell-label{flex:none;white-space:nowrap}",
    ".dsh-recall-menu-cell-value{margin-left:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:13px}",
    ".dsh-recall-menu-cell-chevron{flex:none;display:grid;place-items:center;color:var(--dsw-alias-menu-icon,var(--dsw-alias-label-tertiary))}",
    ".dsh-recall-menu-search-row{flex:none;margin:2px 0 3px}",
    ".dsh-recall-menu-search{display:flex;align-items:center;padding:5px 7px;border-radius:var(--dsw-radius-md)}",
    ".dsh-recall-menu-search input{flex:1;min-width:0;border:0;background:0 0;outline:none;font-family:inherit;font-size:12px;color:var(--dsw-alias-label-primary)}",
    ".dsh-recall-menu-search input::placeholder{color:var(--dsw-alias-label-caption)}",
    ".dsh-recall-menu-groups{min-height:0;overflow-y:auto}",
    // 分组标题吸顶：长列表滚动时保持「当前是哪家」可见，与官方一致
    ".dsh-recall-menu-heading{position:sticky;top:0;z-index:1;padding:4px 7px 2px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}",
    ".dsh-recall-menu-option{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:5px 7px;border:0;border-radius:var(--dsw-radius-md);background:0 0;color:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer}",
    ".dsh-recall-menu-option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-recall-menu-option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}",
    ".dsh-recall-menu-option-active{background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-recall-menu-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".dsh-recall-menu-check{flex:0 0 14px;display:grid;place-items:center;color:var(--dsw-alias-label-primary)}",
    ".dsh-recall-menu-empty{padding:8px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
    ".dsh-recall-composer-hint{margin-left:auto;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".dsh-recall-composer-send{flex:none;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:50%;corner-shape:round;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);cursor:pointer}",
    ".dsh-recall-composer-send:disabled{opacity:.4;cursor:default}",
    ".dsh-recall-composer-dot{width:8px;height:8px;border-radius:50%;corner-shape:round;background:currentColor;animation:dsh-recall-pulse 1.2s ease-in-out infinite}",
    // 窄屏：提示让位，否则 chip 与发送键会被挤到换行
    "@media (max-width:480px){.dsh-recall-composer-hint{display:none}.dsh-recall-composer-chip{max-width:120px}}",
    // 编辑态隐藏底部输入框的统计 dock（回合/步骤、tok/s、缓存、Trace）：编辑焦点
    // 在消息处的卡片上，dock 属全局概览，留着只会分心；挂在既有的 data-editing 上
    'body:has(.dsh-recall-row[data-editing="true"]) [data-composer-dock]{display:none}',
    // 版本翻页器（‹ X/N ›）：灰字 + 无边框的轻量控件，附在回合操作区末尾，
    // 视觉重量低于复制/重试等官方动作，不抢注意力
    ".dsh-recall-pager{display:inline-flex;align-items:center;gap:2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1}",
    ".dsh-recall-pager-btn{border:0;background:0;color:inherit;cursor:pointer;padding:3px 6px;border-radius:6px;font-size:13px;line-height:1}",
    ".dsh-recall-pager-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-recall-pager-btn:disabled{opacity:.35;cursor:default}",
    ".dsh-recall-pager-count{min-width:30px;text-align:center;font-variant-numeric:tabular-nums}",
    ".dsh-recall-pager[data-busy=true]{opacity:.6;pointer-events:none}",
    // 无家族可翻时容器是空的：:empty 让占位为 0，不在操作区留一段空隙
    ".dsh-recall-pager:empty{display:none}",
    ".dsh-recall-list{max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:2px;padding:4px 0}",
    ".dsh-recall-file{display:flex;gap:8px;align-items:baseline;font-size:12px;line-height:1.5}",
    ".dsh-recall-badge{flex:none;font-size:12px;line-height:1.5;padding:0 6px;border-radius:6px}",
    ".dsh-recall-badge-modified{color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary)}",
    ".dsh-recall-badge-restored{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-recall-badge-added{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-recall-rel{min-width:0;color:var(--dsw-alias-label-primary);word-break:break-all;font-family:var(--dsw-font-code, ui-monospace, SFMono-Regular, Consolas, monospace)}",
    // grid-column 对非 grid 祖先（exclude/快照卡片的 flex 布局）自动无效，无害；
    // 在 cfg-grid 内则保证操作区/占满行不被 auto-placement 塞进第一列撑爆列宽。
    ".dsh-recall-panel-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:2px;grid-column:1/-1}",
    // scope radio 组（撤回范围二选一）：原生 input 保留 UA 交互（键盘方向键切换、
    // 空格选中），accent-color 走品牌令牌让选中态随主题翻转；label 整体可点扩大
    // 命中区，字色与 panel-note 同层级（secondary），hover 提亮示意可交互
    ".dsh-recall-scope{display:flex;flex-wrap:wrap;gap:4px 16px;padding:2px 0}",
    ".dsh-recall-scope-item{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary)}",
    ".dsh-recall-scope-item:hover{color:var(--dsw-alias-label-primary)}",
    ".dsh-recall-scope-item input{accent-color:var(--dsw-alias-brand-primary);cursor:pointer;margin:0}",
    // 焦点可见性对齐按钮类约定（brand-primary 2px outline）：UA 默认环跨引擎不一，
    // 统一收敛到与面板内其他控件同一套焦点语言
    ".dsh-recall-scope-item input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
    // 按钮体系对齐官方设置卡（dsh-client-ui-settings-plugins PluginCard 底部按钮
    // 组实测产物）：次级 = 描边幽灵（discard 逐字配方——l2 描边 + 透明底，hover
    // 升 label-dimmed 描边 + primary 字色）；官方 discard/save 同高靠 save 也带
    // 1px 描边，故变体统一 border-color:transparent 保同盒模型。hover 用
    // :not(:disabled) 收口后，disabled 的 hover 抵消规则不再需要；disabled 透明度
    // 随官方 .4。
    ".dsh-recall-btn{border:1px solid var(--dsw-alias-border-l2);background:0 0;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;cursor:pointer;color:var(--dsw-alias-label-secondary)}",
    ".dsh-recall-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
    ".dsh-recall-btn:disabled,.dsh-recall-ex-chip:disabled{opacity:.4;cursor:default}",
    // 按下确认感：hover 只表示「可点」，active 才表示「已触发」；位移 .5px 不引
    // 发布局抖动，对 primary/danger 实心变体同样生效（它们 hover 无视觉变化，
    // 此前点击全程零反馈）
    ".dsh-recall-btn:active:not(:disabled){transform:translateY(.5px)}",
    // 危险按钮与前一按钮的物理间隔：panel-actions 的 gap:8px 对常规按钮是分组，
    // 对危险按钮不够——误点「全部删除」的代价不可逆，再加 8px 拉开
    ".dsh-recall-btn-gap{margin-left:8px}",
    // 危险/主按钮的 hover 须显式重申文字与描边——基础 ghost hover 带伪类、优先级
    // 更高，会把它们的字色刷回 label-primary 并描出亮边
    ".dsh-recall-btn-danger{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-layer-3);border-color:transparent}",
    ".dsh-recall-btn-danger:hover:not(:disabled){color:var(--dsw-alias-bg-layer-3);border-color:transparent;filter:var(--dsh-recall-btn-danger-hover)}",
    // 主按钮（保存）改用官方插件设置卡 save 的逐字配方：label-primary 反色实心 +
    // bg-layer-3 前景（同列官方插件卡的保存即此形态，比 button-primary-fill 更贴
    // 设置页语境）；官方 save 无 hover 态，这里的 hover 规则只做「不被基础 ghost
    // hover 污染」的抵消，视觉变化为零即是官方行为。只挂「保存」，主次分明。
    ".dsh-recall-btn-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border-color:transparent}",
    ".dsh-recall-btn-primary:hover:not(:disabled){color:var(--dsw-alias-bg-layer-3);border-color:transparent}",
    // 焦点可见性对齐官方设置页实测写法（同上产物）：按钮类 = brand-primary 2px
    // outline（卡片头 offset -2px 内收，其余 +1px）；输入类 = brand-primary 描边
    // 变色、不套 ring。替换 V2-5 的 border-l3 环方案（当时核验的是旧版写法）。
    ".dsh-recall-btn:focus-visible,.dsh-recall-ex-chip:focus-visible,.dsh-recall-tree-toggle:focus-visible,.dsh-recall-cfg-switch:focus-visible,.dsh-recall-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
    ".dsh-recall-cardbtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
    ".dsh-recall-ex-input:focus-visible,.dsh-recall-cfg-input:focus-visible,.dsh-recall-cfg-select:focus-visible,.dsh-recall-ex-area:focus-visible,.dsh-recall-cfg-area:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}",
    // 输入类 hover 中间态：rest l4 → hover l3 → focus brand 三级递进，与按钮的
    // 描边 hover 逻辑同语言；:not(:focus-visible) 收口是防 hover 伪类（特异性更
    // 高）把 focus 的品牌色描边刷回 l3
    ".dsh-recall-ex-input:hover:not(:disabled):not(:focus-visible),.dsh-recall-cfg-input:hover:not(:disabled):not(:focus-visible),.dsh-recall-cfg-select:hover:not(:disabled):not(:focus-visible),.dsh-recall-ex-area:hover:not(:disabled):not(:focus-visible),.dsh-recall-cfg-area:hover:not(:disabled):not(:focus-visible){border-color:var(--dsw-alias-border-l3)}",
    ".dsh-recall-toast{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:10000;max-width:min(560px,86vw);box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:10px 16px;font-size:13px;line-height:1.5;box-shadow:0 8px 28px rgba(0,0,0,.22);display:flex;align-items:baseline;gap:8px;opacity:0;transition:opacity .25s ease;pointer-events:auto}",
    ".dsh-recall-toast.dsh-recall-toast-in{opacity:1}",
    ".dsh-recall-toast-tag{flex:none;font-weight:600;color:var(--dsw-alias-state-error-primary)}",
    ".dsh-recall-ex-card{display:flex;flex-direction:column;gap:8px}",
    // 分区折叠头标题：与表单分组标题（cfg-group）同款 14px/700 + label-primary——
    // 折叠头在视觉上是「下一个分组」的入口，同款排版 + 同一条左缘线，扫读时与
    // 上方分组标题连成一体（用户实测反馈：13px/600 secondary 看起来是另一套层级、
    // 且左缘错位）
    ".dsh-recall-section-title{color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;font-weight:700}",
    ".dsh-recall-ex-note{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;word-break:break-word}",
    // 存储路径独立行：等宽字体 + break-all，Windows 长路径整齐折行；12px tertiary
    // 降为辅助信息层级（与说明正文同色系但更轻），margin-top 收紧与上一行说明的
    // 归属关系（ex-card 统一 gap 8px 对「说明→其路径」偏松）。
    ".dsh-recall-ex-path{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;font-family:var(--dsw-font-code, ui-monospace, SFMono-Regular, Consolas, monospace);word-break:break-all;margin-top:-4px}",
    // 输入类控件统一官方 field input 配方（At1oFq_input 逐字）：.5px l4 发丝描边 +
    // layer-3 底 + 8px 圆角 + 0/12px 内边距（单行框 34px 高）；卡片打开态底色是
    // layer-2，layer-3 输入框在其上恰好与官方插件配置卡同层叠关系
    ".dsh-recall-ex-area{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.5;font-family:var(--dsw-font-code, ui-monospace, SFMono-Regular, Consolas, monospace);resize:vertical;min-height:120px}",
    ".dsh-recall-ex-quick{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
    ".dsh-recall-ex-input{flex:1;min-width:180px;box-sizing:border-box;height:34px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}",
    // 快照管理搜索行：框高 34px × 1.2 ≈ 41px（搜索是卡片首屏的主入口，加高后
    // 命中区更大）；图标绝对定位在框内左侧、pointer-events:none 不挡点击，输入框
    // 用 padding-left 让出图标位（覆写只 scope 到 .dsh-recall-search 内，排除配置的
    // 快速添加框维持原高）
    ".dsh-recall-search{position:relative;display:flex;align-items:center}",
    ".dsh-recall-search .dsh-recall-ex-input{height:41px;padding-left:38px}",
    ".dsh-recall-search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--dsw-alias-label-tertiary);pointer-events:none}",
    // chip 改官方 badge 丸形配方（bg-module-platform + 999px）——树内小操作与
    // 排除建议属「标签级动作」，与状态徽章同形态更一致；hover 用 :not(:disabled)
    // 收口（与按钮同法）
    ".dsh-recall-ex-chip{border:none;border-radius:999px;corner-shape:round;padding:1px 10px;font-size:12px;line-height:1.5;cursor:pointer;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform)}",
    ".dsh-recall-ex-chip:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
    // V9 确认按钮 danger chip：红色文字 + 官方失败状态行底，与 .btn-danger 同义
    // 但保持 chip 尺寸层级（确认条内部不出现大按钮）
    ".dsh-recall-ex-chip-danger{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger)}",
    // 基础 chip hover 带伪类、优先级更高，会把危险 chip 的红字刷回普通色——
    // 显式重申保持 hover 下仍是红字（危险语义在悬停确认时最不能丢）
    ".dsh-recall-ex-chip-danger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary)}",
    // 树行内图标按钮（删除）：20px 方盒保证命中区，静息 tertiary 不抢读、hover
    // 转 error 色 + 危险底色（危险语义在悬停确认时显现，安全兜底是行内确认条）。
    // align-self:center 抵消 tree-label 的 baseline 对齐——SVG 的基线在底边，
    // 随基线摆会浮在文字上方
    ".dsh-recall-icon-btn{flex:none;align-self:center;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:0 0;cursor:pointer;color:var(--dsw-alias-label-tertiary)}",
    ".dsh-recall-icon-btn-danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}",
    ".dsh-recall-ex-status{margin-right:auto;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}",
    ".dsh-recall-ex-status-error{color:var(--dsw-alias-state-error-primary)}",
    // 空状态（无快照/搜索无匹配）：居中 + 24px 上下留白，与官方空列表形态
    // 对齐；此前复用 ex-note 左对齐正文样式，空列表区显得是「缺了一行」而非
    // 一个状态
    ".dsh-recall-empty{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5;text-align:center;padding:24px 0}",
    // 列表读取失败条（issue #30 遗留项）：error 前景 + 换行不裁切，右侧带重试 chip。
    // 与空态区分开——「没有快照」和「读不到快照」在用户眼里必须是两件事
    ".dsh-recall-list-error{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5}",
    ".dsh-recall-list-error-text{flex:1;min-width:0;word-break:break-word}",
    ".dsh-recall-ex-status-success{color:var(--dsw-alias-state-success-primary)}",
    // V6 健康徽章（git 可用性）：pill 配色直接复用官方状态行配对——成功用
    // success-tertiary 底、失败用 interactive-bg-hover-danger 底（error 无
    // tertiary 令牌，官方失败状态行即用此搭配，主题感知）。
    ".dsh-recall-health-pill{display:inline-flex;align-items:center;padding:1px 10px;border-radius:999px;corner-shape:round;font-size:12px;line-height:1.5}",
    ".dsh-recall-health-pill-ok{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}",
    ".dsh-recall-health-pill-bad{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}",
    // V6 错误区标题：error 色 + 条数，错误不再是灰色小字（fail-loud 可见性）
    ".dsh-recall-errors-title{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5;font-weight:600}",
    ".dsh-recall-tree{display:flex;flex-direction:column;gap:2px;padding:4px 0}",
    ".dsh-recall-tree-node{display:flex;flex-direction:column;gap:1px}",
    ".dsh-recall-tree-row{display:flex;gap:6px;align-items:center;min-width:0;padding:2px 4px;border-radius:6px;cursor:default}",
    ".dsh-recall-tree-row:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    // 可展开的行整行可点（仅快照管理树）：只命中 18px 折叠钮太难，cursor 也跟着
    // 变指针，提示「这一行都是命中区」
    ".dsh-recall-tree-row-toggle{cursor:pointer}",
    // V2 树折叠钮 span→button 的 UA 默认样式重置：button 自带 appearance/背景/边框/
    // 内边距，与 span 形态差异在此抹平，保证纯键盘可达不引入视觉回归。
    ".dsh-recall-tree-toggle{appearance:none;background:0 0;border:0;padding:0;font:inherit;flex:none;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:4px;font-size:12px;line-height:1.5;user-select:none}",
    ".dsh-recall-tree-toggle:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-recall-tree-toggle-placeholder{flex:none;width:18px;height:18px}",
    ".dsh-recall-tree-label{flex:1;min-width:0;display:flex;gap:8px;align-items:baseline;font-size:12px;line-height:1.5;overflow:hidden}",
    ".dsh-recall-tree-name{flex:none;font-weight:600;color:var(--dsw-alias-label-secondary)}",
    ".dsh-recall-tree-title{min-width:0;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    // issue #31：仅消息条目的静态标记——与 ex-chip 同丸形，但非按钮、无 hover
    ".dsh-recall-tree-tag{flex:none;border-radius:999px;corner-shape:round;padding:0 8px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform);white-space:nowrap}",
    // tabular-nums：树 meta 列（「3 会话 / 28 快照」「v2/3」）多行纵向扫描时
    // 数字等宽，个位对齐不跳动
    ".dsh-recall-tree-meta{flex:none;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-variant-numeric:tabular-nums}",
    // V4 树缩进契约化：总缩进 = --dsh-recall-tree-indent（折叠钮 18px + gap 6px），
    // children 按 2/3（16px margin）与 1/3（8px padding）拆分，恰好让子行文字
    // 与父行折叠钮右缘对齐——把「16+8 恰等于 18+6」的巧合变成单一事实源。
    ".dsh-recall-tree-children{display:flex;flex-direction:column;gap:1px;margin-left:calc(var(--dsh-recall-tree-indent)*2/3);border-left:1px solid var(--dsw-alias-border-l1);padding-left:calc(var(--dsh-recall-tree-indent)/3);animation:dsh-recall-unfold .16s ease-out}",
    ".dsh-recall-tree-confirm{display:flex;gap:8px;align-items:center;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);animation:dsh-recall-unfold .16s ease-out}",
    // V9 展开动效：opacity + 2px 上移入场（确认条/树展开共用一个 keyframes）。
    // 弃用 max-height 过渡：树展开高度可变（长列表数百 px），固定上限会裁切；
    // opacity+位移给出同等显隐反馈且零裁切风险。
    "@keyframes dsh-recall-unfold{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}",
    "@media (prefers-reduced-motion:reduce){.dsh-recall-tree-children,.dsh-recall-tree-confirm,.dsh-recall-settings-body,.dsh-recall-section-body{animation:none}}",
    // 设置块容器：插件设置项直接平铺在设置页上（用户实测反馈——先去掉外层折叠头、
    // 再去掉卡片外框，两层包裹皆属冗余）：无描边、无底色、无圆角，只做纵向排版
    // 与 list-style 归零（li 默认圆点/缩进须清）
    ".dsh-recall-settings{list-style:none;display:flex;flex-direction:column;text-align:left}",
    // settings-body 挂载即播放一次 unfold 入场（opacity + 2px 上移，.16s）：随设置页
    // 进入即挂载，入场动画起到「内容就位」的引导作用；内部两个分区（排除/快照管理）
    // 展开时另有 section-body 容器承载
    ".dsh-recall-settings-body{display:flex;flex-direction:column;gap:12px;animation:dsh-recall-unfold .16s ease-out}",
    // SectionToggle 仍复用卡片头按钮形态（可点整行 + 焦点环），仅在设置块内覆写
    // 内边距：14/16px 会让折叠头相对表单标签右缩进 16px（用户实测与分组标题/
    // 表单内容错位）；纵向 8px 给标题级排版留呼吸，与 cfg-group 的 8px 节奏同档
    ".dsh-recall-settings-body .dsh-recall-cardbtn{padding:8px 0}",
    ".dsh-recall-cardbtn{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
    // 折叠分区列表与上方表单的分界线，挂在首个折叠头上（「高级：基础排除表」）：
    // .5px l2 + 上下各 8px，与 cfg-group 的组间线同规格，整列排版只有一种分割语言。
    // 线用绝对定位的伪元素画，不用 border-top——cardbtn 带 12px 圆角，border-top
    // 会沿圆角走、两端上翘（实测）；伪元素横贯全宽且保持按钮圆角不被破坏（焦点环
    // 仍沿圆角）。双类选择器压过 `.dsh-recall-settings-body .dsh-recall-cardbtn` 的
    // padding 覆写（同为 0,2,0 时靠后取胜）
    ".dsh-recall-cardbtn.dsh-recall-section-divider{position:relative;margin-top:8px;padding-top:8px}",
    '.dsh-recall-cardbtn.dsh-recall-section-divider::before{content:"";position:absolute;top:0;left:0;right:0;height:.5px;background:var(--dsw-alias-border-l2)}',
    // 展开分区的内容容器（排除配置/快照管理）：不再自带描边/底色/圆角——外层
    // 卡片框去掉后，内容区再套一层框等于把「去包裹」又加回来（用户实测反馈）；
    // 容器只保留纵向间距与展开入场动画
    ".dsh-recall-section-body{display:flex;flex-direction:column;gap:12px;animation:dsh-recall-unfold .16s ease-out}",
    // 折叠头 chevron 收在行尾（margin-left:auto 顶到右缘，官方卡片头同布局）：
    // 向下字形，收起态向下、展开态 rotate(180deg) 朝上，transition .16s 与官方
    // 卡片 chevron 同一动效语言。树内折叠钮（snapshot-manager chevronIcon）同枚
    // SVG、在 18px 盒内左侧、旋转挂内联 style，不受这两条类规则约束
    ".dsh-recall-section-chevron{flex:none;margin-left:auto;color:var(--dsw-alias-label-tertiary);transition:transform .16s}",
    ".dsh-recall-section-chevron-open{transform:rotate(180deg)}",
    // hover 反馈只提亮 chevron：标题保持 label-primary（已是最高层级，再变无可变），
    // 可点提示由尾部箭头承担
    ".dsh-recall-settings-body .dsh-recall-cardbtn:hover .dsh-recall-section-chevron{color:var(--dsw-alias-label-primary)}",
    // cfg-grid：ConfigForm 全部行共享的单一 grid 容器。此前每行 cfg-row 是独立
    // grid，「第一列 max-content」各行各算，跨行对齐从未成立（checkbox/输入框
    // 列参差）；cfg-row 改 display:contents 透明化后，label/控件行/hint 直接成为
    // 本容器的 item，第一列列宽由全表单最长 label 决定——跨行对齐自此成立。
    // 三列：标签 | 控件 | 说明。控件列 max-content 取全表单最宽的一行（输入框 120px
    // + 该行 tag），说明列起点因此由列宽统一决定，不随各行 tag 宽度（条/小时/MB/天）
    // 逐行漂移；column-gap 12px（space-3 档）与卡片内其他 12px 节奏同档
    ".dsh-recall-cfg-grid{display:grid;grid-template-columns:max-content max-content minmax(0,1fr);column-gap:12px;row-gap:4px;align-items:start}",
    ".dsh-recall-cfg-row{display:contents}",
    ".dsh-recall-cfg-grid > .dsh-recall-cardbtn{grid-column:1/-1}",
    // V5 表单分组小标题：语义分组分隔符。组间用整行分隔线 + 加倍留白划界
    // （「快照行为」「自动治理」是两个配置维度，仅小标题用户实测分不清组界）；
    // 首组（紧跟卡片头）不需要分隔线，三件套清零。
    // 组间分隔线随官方发丝线规格（.5px l2，与官方卡体/字段分隔同粗细）；
    // 分隔线上下各 8px、总节奏 16px（4 的倍数），替代原 10px 非标准档。
    // 14px/700 + label-primary：分组标题与字段标签（13px/500）必须一眼可辨，
    // 13px/600 secondary 与字段标签只差字重，用户实测反馈「分不清小标题」
    ".dsh-recall-cfg-group{color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;font-weight:700;grid-column:1/-1;margin-top:8px;padding-top:8px;border-top:.5px solid var(--dsw-alias-border-l2)}",
    ".dsh-recall-cfg-group:first-child{margin-top:0;padding-top:0;border-top:none}",
    // 控件行 min-height:34px 与输入框等高——开关行（20px 滑钮）与输入行因此同高，
    // 第一列 label 的垂直居中基准统一，不随控件形态跳动。占第二列（grid-column:2
    // 是显式定位：每字段的 label/控件/说明落在同一行，靠它锚定）
    ".dsh-recall-cfg-line{grid-column:2;display:flex;align-items:center;gap:8px;min-width:0;min-height:34px}",
    // 开关行变体：滑钮右缘对齐数字行输入框的右边框（不是控件列右缘——列右缘由
    // 最宽的单位 tag 决定，`条`/`天` 行的输入框右缘本来就追不上它）。滑钮左推
    // (输入框宽 - 滑钮宽) 后，它占据的正是输入框那一段槽位，其后的状态 tag 也就
    // 与数字行的单位 tag 同起点——两行的「控件 + tag」结构遂逐列对齐
    ".dsh-recall-cfg-line-switch .dsh-recall-cfg-switch{margin-left:calc(var(--dsh-recall-input-w) - var(--dsh-recall-switch-w))}",
    // 主标签用 label-primary + 官方字段标签字重 500（At1oFq_label），与 12px
    // tertiary 的说明文字拉开层级；说明固定在控件下方第二行，不混排进主标签行。
    // line-height:34px 让标签文字在行首 34px 高度内垂直居中——与同排 34px 的
    // 输入框/开关行共用同一中轴（align-self:start 顶到行首，不能靠 grid 居中：
    // 行高由「控件 + 多行 hint」决定，居中的话标签会跟着 hint 高度漂移）
    ".dsh-recall-cfg-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:34px;align-self:start}",
    // 数字输入框 = 官方 field input 配方（.5px l4 发丝描边 + layer-3 底 + 34px
    // 高 + 0/12px 内边距）叠加本插件既有约定：定宽 120px + 右对齐（不定宽时框宽
    // 随行内 tag 有无伸缩，实测参差）；tabular-nums 让同列数字等宽、纵向扫描
    // 小数位整齐。120px 足够容纳「0.01」~「1000000」区间。
    ".dsh-recall-cfg-input{flex:none;width:var(--dsh-recall-input-w);box-sizing:border-box;height:34px;font:inherit;font-size:13px;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:0 12px}",
    // disabled 随官方 input：文字降 tertiary，不动透明度（整框变淡会让「框还在
    // 只是不可写」的语义变含糊）
    ".dsh-recall-cfg-input:disabled,.dsh-recall-cfg-select:disabled,.dsh-recall-cfg-area:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
    // 数字输入框隐藏原生加减微调按钮（spinner）：34px 高的定宽框里 spinner 挤占
    // 右侧数字区、跨引擎渲染不一（Chromium 上下箭头 / Firefox 无），与「右对齐
    // 数字」的纵向扫描相冲；隐藏后键盘 ↑↓ 与直接输入仍可用，步进语义不丢。
    // scope 到 cfg-input，不外溢影响宿主或其他插件的 number 输入。
    ".dsh-recall-cfg-input::-webkit-inner-spin-button,.dsh-recall-cfg-input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}",
    ".dsh-recall-cfg-input{-moz-appearance:textfield;appearance:textfield}",
    // 语言下拉（A4）：与数字输入框同一套描边/底色/高度配方，差异只在文本左对齐
    // 与宽度自适应——select 的选项文本长度不可控（Follow system (auto) 最长），
    // 定宽会截断；min-width 与输入框同宽保住「控件列」的视觉对齐基线
    ".dsh-recall-cfg-select{flex:none;box-sizing:border-box;height:34px;min-width:var(--dsh-recall-input-w);font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:0 8px 0 10px}",
    ".dsh-recall-cfg-area{font-family:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:6px 8px;min-height:64px;box-sizing:border-box;width:100%;grid-column:2}",
    // 布尔开关：官方设置表单的布尔字段用 role=switch 滑钮而非原生 checkbox
    //（vCGm7G_switch 逐字配方：36×20 轨道 border-l3 底、开=brand-primary、
    // 16px 拇指 label-primary-foreground 滑动 16px、transition .12s）
    // 跨引擎一致性的加固（用户实测：同一开关在不同浏览器观感不同）：button 各
    // 引擎自带 UA appearance（Safari 的 -webkit-appearance:button 会覆写圆角与
    // 内边距、Firefox 另有 ::-moz-focus-inner 内衬）与各自的字体度量（匿名行盒
    // 会参与内容高度计算）——故显式收敛为 inline-flex + font:inherit + line-height:0。
    // corner-shape:round 见拇指处的说明（DSH 主题的全局超椭圆圆角）
    ".dsh-recall-cfg-switch{appearance:none;-webkit-appearance:none;box-sizing:border-box;flex:none;display:inline-flex;align-items:center;width:var(--dsh-recall-switch-w);height:20px;padding:2px;margin:0;border:0;border-radius:10px;corner-shape:round;background:var(--dsw-alias-border-l3);font:inherit;line-height:0;cursor:pointer;position:relative}",
    ".dsh-recall-cfg-switch::-moz-focus-inner{border:0;padding:0}",
    '.dsh-recall-cfg-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}',
    ".dsh-recall-cfg-switch:disabled{opacity:.4;cursor:default}",
    // switch hover 微提亮（官方 switch 无 hover 态，此处补上不伤一致性）：开态
    // brand 底与关态 border-l3 底同用 brightness，两态反馈强度一致
    ".dsh-recall-cfg-switch:hover:not(:disabled){filter:brightness(1.05)}",
    // corner-shape:round 是必须的：DSH 主题包在支持该属性的浏览器里给「所有元素」
    // 下发 --dsw-corner-shape: superellipse(1.5)（`*,:before,:after{corner-shape:
    // var(--dsw-corner-shape)}`），圆形/胶囊会被渲染成超椭圆（squircle，观感更方）。
    // 官方同样在 104 处圆形/胶囊元素上显式写回 round（含本开关的轨道与拇指）；
    // 不写回则新版 Edge 与旧内核（如 IDE 内置浏览器，不认该属性）观感不一致
    ".dsh-recall-cfg-switch-thumb{flex:none;display:block;width:16px;height:16px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-label-primary-foreground);transition:transform .12s}",
    '.dsh-recall-cfg-switch[aria-checked="true"] .dsh-recall-cfg-switch-thumb{transform:translateX(16px)}',
    // 说明列（第三列）：padding-top 8px 把首行文字的视觉中线抬到 34px 控件行的
    // 中线上（12px × 1.5 = 18px 行盒，居中需上移 (34-18)/2 = 8px），与标签的
    // line-height:34px 是同一个中轴的两种写法；padding-bottom 即字段间距的单一
    // 事实源（网格 row-gap 只管行缝），行间节奏维持 8+4=12px
    ".dsh-recall-cfg-hint{grid-column:3;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;min-width:0;padding-top:8px;padding-bottom:8px}",
    // 基础排除表通栏（baseExcludes textarea/hint）：折叠展开后内容顶满卡片宽度，
    // 消除左侧 label 列竖直死区。必须定义在 480px media 之前——media 内的
    // grid-column:auto 同特异性、后出现，窄屏下仍能正确回落单列堆叠。
    ".dsh-recall-cfg-span{grid-column:1/-1}",
    // V4/V8 共用 480px 断点：cfg 表单单列堆叠（V4）；exclude quick 行输入框独占
    // 一行（flex:1 1 100%，basis 100% 强制换行，添加按钮与芯片建议另起一行）、
    // panel-actions 长状态文案不再挤压按钮（wrap 已在基础规则，此处无需重复）。
    // 窄屏单列堆叠：三列回落为逐行堆叠（控件行/说明列各自独占一行）。label 的
    // 34px 行高是为「与同排控件共用中轴」而设，堆叠后 label 独占一行、行高与
    // 说明的上边距都要复位，否则标签与控件之间空出一大截
    "@media (max-width:480px){.dsh-recall-cfg-grid{grid-template-columns:minmax(0,1fr);row-gap:2px}.dsh-recall-cfg-line,.dsh-recall-cfg-hint,.dsh-recall-cfg-area{grid-column:auto}.dsh-recall-cfg-label{align-self:auto;line-height:1.5}.dsh-recall-cfg-hint{padding-top:0}.dsh-recall-cfg-line-switch .dsh-recall-cfg-switch{margin-left:0}.dsh-recall-ex-quick .dsh-recall-ex-input{flex:1 1 100%}}",
    ".dsh-recall-cfg-tag{flex:none;font-size:12px;line-height:1.4;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary)}",
    // 已修改（用户改了配置）用 warn 底色提示「有未保存变更」——修改不是错误，
    // warn 家族来自 V1 核验的官方配对（tertiary 底 + label 文）。
    ".dsh-recall-cfg-tag-modified{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label)}",
    // 环境变量锁定：系统锁住不可写，区别于「已覆盖」（值被更高优先源覆盖）——
    // 两者同属中性，用左边框做结构级区分，不引入第三色。
    ".dsh-recall-cfg-tag-locked{border-left:2px solid var(--dsw-alias-border-l2)}",
    // V3 快照树加载骨架：items===null 时的 5 条占位行，pulse 明暗呼吸模拟加载。
    ".dsh-recall-tree-skeleton{display:flex;flex-direction:column;gap:2px;padding:4px 0}",
    ".dsh-recall-tree-skeleton-row{height:20px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);animation:dsh-recall-pulse 1.2s ease-in-out infinite}",
    "@keyframes dsh-recall-pulse{0%,100%{opacity:1}50%{opacity:.45}}"
  ].join("");

  // src/client/locales/zh.ts
  var zh = {
    // ---- 通用（跨模块复用的动作与连接词）----
    "common.close": "\u5173\u95ED",
    "common.cancel": "\u53D6\u6D88",
    "common.confirm": "\u786E\u8BA4",
    "common.save": "\u4FDD\u5B58",
    "common.discard": "\u653E\u5F03\u4FEE\u6539",
    "common.retry": "\u91CD\u8BD5",
    "common.errorPrefix": "\u9519\u8BEF\uFF1A",
    "common.unknownReason": "\u672A\u77E5\u539F\u56E0",
    "common.opFailed": "\u64CD\u4F5C\u5931\u8D25",
    // 列表连接符：中文顿号 / 英文逗号+空格（分隔符本身也是语言事实）
    "common.listSep": "\u3001",
    // 括号包裹模板：中英标点族不同（（x） /  (x)，英文含前导空格），不写死在调用点
    "common.paren": "\uFF08{text}\uFF09",
    // ---- 变更类型（KIND_INFO 单表引用）----
    "kind.modified": "\u4FEE\u6539",
    "kind.restored": "\u6062\u590D",
    "kind.added": "\u5220\u9664",
    // ---- 用户消息内的文件卡片 ----
    "file.unnamed": "\u672A\u547D\u540D\u6587\u4EF6",
    // ---- 快照管理树的节点文案 ----
    "tree.unknownWorkspace": "\u672A\u77E5\u5DE5\u4F5C\u533A",
    "tree.deletedSession": "\uFF08\u5DF2\u5220\u9664\u4F1A\u8BDD\uFF09",
    "tree.expand": "\u5C55\u5F00\uFF1A{label}",
    "tree.collapse": "\u6536\u8D77\uFF1A{label}",
    "tree.snapCount": "{n} \u6761",
    "tree.wsCount": "{n} \u4F1A\u8BDD / {m} \u5FEB\u7167",
    "tree.family.title": "\u7248\u672C\u5BB6\u65CF\uFF1A{chain}",
    "tree.switch": "\u5207\u6362",
    "tree.switch.title": "\u5207\u6362\u5230\u8BE5\u7248\u672C\u4F1A\u8BDD",
    "tree.messageOnly": "\u4EC5\u6D88\u606F",
    "tree.delete.snapshot.title": "\u5220\u9664\u8BE5\u5FEB\u7167\uFF08tag \u4E0E\u7D22\u5F15\u6761\u76EE\uFF09",
    "tree.delete.snapshot.confirm": "\u786E\u8BA4\u5220\u9664\u8BE5\u5FEB\u7167\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002",
    "tree.delete.session.title": "\u5220\u9664\u8BE5\u4F1A\u8BDD\u5168\u90E8\u5FEB\u7167",
    "tree.delete.session.confirm": "\u786E\u8BA4\u5220\u9664\u8BE5\u4F1A\u8BDD\u5168\u90E8\u5FEB\u7167\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002",
    "tree.delete.workspace.title": "\u5220\u9664\u8BE5\u5DE5\u4F5C\u533A\u5168\u90E8\u5FEB\u7167",
    "tree.delete.workspace.confirm": "\u786E\u8BA4\u5220\u9664\u8BE5\u5DE5\u4F5C\u533A\u5168\u90E8\u5FEB\u7167\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002",
    // ---- 撤回确认面板 ----
    "recall.loading": "\u6B63\u5728\u8BA1\u7B97\u53D8\u66F4\u2026",
    "recall.error.title": "\u65E0\u6CD5\u56DE\u9000",
    "recall.confirm.title": "\u6574\u6BB5\u56DE\u9000",
    "recall.truncated.files": "\u2026\u4EC5\u663E\u793A\u524D {shown} \u6761\uFF0C\u5171 {total} \u4E2A\u6587\u4EF6\u5C06\u53D8\u66F4",
    "recall.truncated.chat": "\u2026\u4EC5\u663E\u793A\u524D {shown} \u6761\uFF0C\u5171 {total} \u5904\u5DEE\u5F02",
    "recall.confirm.sessionOnly": "\u9879\u76EE\u6587\u4EF6\u4FDD\u6301\u5F53\u524D\u72B6\u6001\uFF0C\u4E0D\u4F1A\u88AB\u56DE\u9000\u6216\u5220\u9664\uFF1B\u5BF9\u8BDD\u56DE\u9000\u5230\u8BE5\u6D88\u606F\u4E4B\u524D\u3002",
    "recall.confirm.messageOnly": "\u8FD9\u6761\u6D88\u606F\u53EA\u6709\u5BF9\u8BDD\u56DE\u9000\uFF1A\u4E0D\u4F1A\u6539\u52A8\u9879\u76EE\u6587\u4EF6\uFF0C\u5BF9\u8BDD\u56DE\u9000\u5230\u8BE5\u6D88\u606F\u4E4B\u524D\u3002",
    "recall.confirm.noEffect": "\u8BE5\u6D88\u606F\u6CA1\u6709\u6587\u4EF6\u5FEB\u7167\uFF0C\u4E14\u662F\u4F1A\u8BDD\u7B2C\u4E00\u6761\u6D88\u606F\uFF0C\u4E4B\u524D\u6CA1\u6709\u53EF\u56DE\u9000\u7684\u5BF9\u8BDD\u3002",
    "recall.confirm.rollbackAt": "\u5C06\u9879\u76EE\u6062\u590D\u5230 {time} \u53D1\u9001\u8BE5\u6D88\u606F\u65F6\u7684\u72B6\u6001\u3002",
    "recall.confirm.rollbackNoTime": "\u5C06\u9879\u76EE\u6062\u590D\u5230\u53D1\u9001\u8BE5\u6D88\u606F\u65F6\u7684\u72B6\u6001\u3002",
    "recall.confirm.files": "\u5171 {total} \u4E2A\u6587\u4EF6\u5C06\u53D8\u66F4{summary}\u3002\u6B64\u64CD\u4F5C\u4F1A\u8986\u76D6\u5F53\u524D\u6587\u4EF6\u5185\u5BB9\uFF1B\u56DE\u9000\u524D\u4F1A\u81EA\u52A8\u4FDD\u5B58\u4E00\u4EFD\u5F53\u524D\u72B6\u6001\u7684\u5B89\u5168\u5FEB\u7167\uFF08\u4E0D\u542B\u5728\u4E0B\u65B9\u6E05\u5355\u5185\uFF09\u3002",
    "recall.confirm.chatBoth": "\u5BF9\u8BDD\u5C06\u4E00\u5E76\u56DE\u9000\u5230\u8BE5\u6D88\u606F\u4E4B\u524D\uFF1A\u8BE5\u6D88\u606F\u53CA\u4E4B\u540E\u7684\u5168\u90E8\u5BF9\u8BDD\u4F1A\u4ECE\u5F53\u524D\u89C6\u56FE\u79FB\u9664\uFF0C\u539F\u4F1A\u8BDD\u5F52\u6863\u4FDD\u5B58\uFF08\u53EF\u4ECE\u5F52\u6863\u627E\u56DE\uFF09\u3002",
    "recall.confirm.chatFirst": "\u8BE5\u6D88\u606F\u662F\u672C\u4F1A\u8BDD\u4E2D\u7B2C\u4E00\u6761\u7528\u6237\u6D88\u606F\uFF0C\u65E0\u6CD5\u56DE\u9000\u5BF9\u8BDD\uFF1B\u786E\u8BA4\u540E\u4EC5\u56DE\u9000\u9879\u76EE\u6587\u4EF6\u3002",
    "recall.confirm.refNote": "\u4EE5\u4E0B\u5DEE\u5F02\u4EC5\u4F5C\u53C2\u8003\uFF0C\u6240\u9009\u6A21\u5F0F\u4E0D\u4F1A\u6539\u52A8\u6587\u4EF6\u3002",
    "recall.scope.aria": "\u64A4\u56DE\u8303\u56F4",
    "recall.scope.both": "\u56DE\u9000\u6587\u4EF6\u4E0E\u5BF9\u8BDD",
    "recall.scope.sessionOnly": "\u4EC5\u64A4\u56DE\u5BF9\u8BDD",
    "recall.confirm.submit.both": "\u786E\u8BA4\u56DE\u9000",
    "recall.confirm.submit.sessionOnly": "\u786E\u8BA4\u64A4\u56DE\u5BF9\u8BDD",
    "recall.executing.both": "\u6B63\u5728\u56DE\u9000\u2026",
    "recall.executing.sessionOnly": "\u6B63\u5728\u64A4\u56DE\u5BF9\u8BDD\u2026",
    "recall.done.title": "\u56DE\u9000\u5B8C\u6210",
    "recall.done.both.ok": "\u9879\u76EE\u6587\u4EF6\u4E0E\u5BF9\u8BDD\u5DF2\u56DE\u9000\u5230\u8BE5\u6D88\u606F\u4E4B\u524D\u3002\u65B0\u4F1A\u8BDD\u5DF2\u6253\u5F00\uFF0C\u539F\u4F1A\u8BDD\u5DF2\u5F52\u6863\uFF08\u53EF\u4ECE\u5F52\u6863\u627E\u56DE\uFF09\u3002",
    "recall.done.both.partial": "\u9879\u76EE\u5DF2\u6062\u590D\u5230\u53D1\u9001\u8BE5\u6D88\u606F\u65F6\u7684\u72B6\u6001\u3002",
    "recall.done.both.failChat": " \u5BF9\u8BDD\u56DE\u9000\u5931\u8D25\uFF1A{error}",
    "recall.done.sessionOnly.ok": "\u5BF9\u8BDD\u5DF2\u56DE\u9000\u5230\u8BE5\u6D88\u606F\u4E4B\u524D\uFF0C\u9879\u76EE\u6587\u4EF6\u4FDD\u6301\u5F53\u524D\u72B6\u6001\u3002\u65B0\u4F1A\u8BDD\u5DF2\u6253\u5F00\uFF0C\u539F\u4F1A\u8BDD\u5DF2\u5F52\u6863\uFF08\u53EF\u4ECE\u5F52\u6863\u627E\u56DE\uFF09\u3002",
    "recall.done.sessionOnly.fail": "\u5BF9\u8BDD\u56DE\u9000\u5931\u8D25\uFF1A{error}\u3002\u9879\u76EE\u6587\u4EF6\u672A\u505A\u4EFB\u4F55\u6539\u52A8\u3002",
    "recall.chat.noChild": "\u672A\u8FD4\u56DE\u65B0\u4F1A\u8BDD",
    // ---- 用户消息气泡的动作按钮 ----
    "action.copy": "\u590D\u5236",
    "action.copied": "\u5DF2\u590D\u5236",
    "action.recall": "\u64A4\u56DE",
    "action.recall.title": "\u6574\u6BB5\u56DE\u9000\uFF1A\u6587\u4EF6\u4E0E\u5BF9\u8BDD\u4E00\u5E76\u56DE\u5230\u8BE5\u6D88\u606F\u4E4B\u524D",
    "action.edit": "\u7F16\u8F91",
    "action.edit.title": "\u7F16\u8F91\u5E76\u91CD\u53D1\uFF1A\u5C31\u5730\u6539\u5B8C\u518D\u53D1\u51FA\u53BB\uFF08\u65B0\u5EFA\u4F1A\u8BDD\uFF0C\u4E0D\u52A8\u9879\u76EE\u6587\u4EF6\uFF09",
    // ---- 就地编辑面板（issue #26）----
    "edit.title": "\u7F16\u8F91\u5E76\u91CD\u53D1",
    "edit.note": "\u63D0\u4EA4\u540E\u4F1A\u65B0\u5EFA\u4F1A\u8BDD\uFF1A\u8BE5\u6D88\u606F\u53CA\u4E4B\u540E\u7684\u5BF9\u8BDD\u4E0D\u518D\u51FA\u73B0\u5728\u65B0\u4F1A\u8BDD\u91CC\uFF0C\u539F\u4F1A\u8BDD\u5F52\u6863\u4FDD\u5B58\u3002\u9879\u76EE\u6587\u4EF6\u4E0D\u4F1A\u88AB\u6539\u52A8\u3002",
    "edit.attachments": "\u539F\u6D88\u606F\u7684 {n} \u4E2A\u9644\u4EF6\u4F1A\u4E00\u5E76\u5E26\u5165\u65B0\u6D88\u606F\u3002",
    "edit.placeholder": "\u6D88\u606F\u5185\u5BB9",
    "edit.submit": "\u7F16\u8F91\u5E76\u53D1\u9001",
    "edit.submit.draftOnly": "\u7F16\u8F91\u5E76\u56DE\u586B",
    "edit.submitting": "\u6B63\u5728\u56DE\u9000\u5230\u8BE5\u6D88\u606F\u4E4B\u524D\u2026",
    "edit.retry": "\u91CD\u8BD5",
    "edit.error.title": "\u65E0\u6CD5\u7F16\u8F91\u5E76\u91CD\u53D1",
    "edit.back": "\u8FD4\u56DE\u4FEE\u6539",
    "edit.noCut": "\u8BE5\u6D88\u606F\u662F\u672C\u4F1A\u8BDD\u4E2D\u7B2C\u4E00\u6761\u7528\u6237\u6D88\u606F\uFF0C\u6CA1\u6709\u53EF\u56DE\u9000\u7684\u5BF9\u8BDD\u5207\u70B9\uFF0C\u65E0\u6CD5\u7F16\u8F91\u91CD\u53D1\u3002",
    "edit.forkFailed": "\u5BF9\u8BDD\u672A\u80FD\u56DE\u9000\uFF08\u672A\u521B\u5EFA\u65B0\u4F1A\u8BDD\uFF09\uFF0C\u7F16\u8F91\u91CD\u53D1\u5DF2\u4E2D\u6B62\u3002",
    "edit.empty": "\u6D88\u606F\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\u3002",
    // 官方输入框锚定面（issue #26 二次迭代）：输入面就是官方 composer 本身，
    // 这里只提示两条键盘出口，不重复画输入控件
    "edit.official.hint": "Enter \u53D1\u9001\u5E76\u65B0\u5EFA\u4F1A\u8BDD \xB7 Esc \u53D6\u6D88",
    "edit.official.retry": "Enter \u91CD\u8BD5 \xB7 Esc \u53D6\u6D88\u7F16\u8F91",
    "edit.attachment.add": "\u6DFB\u52A0\u9644\u4EF6",
    "edit.attachment.remove": "\u79FB\u9664\u9644\u4EF6 {name}",
    "edit.model.label": "\u6A21\u578B",
    "edit.model.menu": "\u6A21\u578B\u4E0E\u63A8\u7406\u7B49\u7EA7",
    "edit.model.effort": "\u63A8\u7406\u7B49\u7EA7",
    "edit.model.search": "\u641C\u7D22\u6A21\u578B\u2026",
    "edit.model.empty": "\u6CA1\u6709\u5339\u914D\u7684\u6A21\u578B",
    "edit.model.noLevels": "\u8BE5\u6A21\u578B\u6CA1\u6709\u53EF\u9009\u7B49\u7EA7",
    "edit.model.providerDefault": "Default",
    // ---- 版本翻页器（‹ X/N ›）----
    "pager.prev": "\u4E0A\u4E00\u7248\u672C",
    "pager.next": "\u4E0B\u4E00\u7248\u672C",
    "pager.label": "\u7248\u672C {n}/{total}",
    "pager.openUnconfirmed": "\u76EE\u6807\u4F1A\u8BDD\u672A\u5728\u65F6\u9650\u5185\u6253\u5F00\uFF0C\u539F\u4F1A\u8BDD\u4FDD\u6301\u53EF\u8BBF\u95EE\uFF1B\u8BF7\u91CD\u8BD5\u6216\u68C0\u67E5\u6A21\u578B\u63D2\u4EF6",
    // ---- toast（降级提示 / 快照反馈）----
    "toast.tag": "\u64A4\u56DE\u63D2\u4EF6",
    "toast.skipped": "\u5FEB\u7167\u5DF2\u8DF3\u8FC7\u672A\u7EB3\u5165\u7684\u8DEF\u5F84\uFF1A{names}\uFF08\u64A4\u56DE\u4E0D\u4F1A\u6062\u590D\u6216\u5220\u9664\u8FD9\u4E9B\u8DEF\u5F84\uFF09",
    "toast.skippedMore": " \u7B49 {n} \u9879",
    "toast.snapshotFailed": "\u5FEB\u7167\u5931\u8D25\uFF1A{error}",
    "toast.staleQueue": "\u64A4\u56DE\u524D\u7684\u4E00\u6761\u6392\u961F\u6D88\u606F\u672A\u88AB\u81EA\u52A8\u6E05\u7406\uFF0C\u53EF\u70B9\u51FB\u8BE5\u5361\u7247\u53F3\u4E0A\u89D2\u7684\u5220\u9664\u6309\u94AE\u624B\u52A8\u79FB\u9664",
    "toast.fileAttachRefill": "\u88AB\u64A4\u56DE\u6D88\u606F\u91CC\u7684\u6587\u4EF6\u9644\u4EF6\u65E0\u6CD5\u81EA\u52A8\u56DE\u586B\uFF08\u5B98\u65B9\u63A5\u53E3\u53EA\u652F\u6301\u56FE\u7247\u56DE\u8BFB\uFF09\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u6587\u4EF6",
    "toast.pagerFailed": "\u5207\u6362\u7248\u672C\u5931\u8D25\uFF1A{error}",
    // ---- init / snapshot-info 下发的一次性说明 ----
    "notice.unsupported": "\u64A4\u56DE\u63D2\u4EF6\u4EC5\u652F\u6301 Windows / Linux / macOS\uFF0C\u5F53\u524D\u5E73\u53F0\u7684\u5FEB\u7167\u4E0D\u53EF\u7528\u3002",
    "notice.gitMissing": "\u672A\u68C0\u6D4B\u5230 git CLI\uFF0C\u64A4\u56DE\u529F\u80FD\u4E0D\u53EF\u7528\uFF08\u5FEB\u7167\u5F15\u64CE\u4F9D\u8D56 git\uFF09\u3002\u5B89\u88C5 git \u5E76\u91CD\u542F DSH \u540E\u5373\u53EF\u4F7F\u7528\u3002",
    "notice.homeFallback": "home \u76EE\u5F55\u4E0D\u53EF\u5199\uFF0C\u5FEB\u7167\u5DF2\u964D\u7EA7\u5B58\u50A8\u5230\u9879\u76EE\u5185 .dsh-recall-snapshots \u76EE\u5F55\u3002",
    "notice.buildRoot": "\u5F53\u524D\u5DE5\u4F5C\u533A\u4F4D\u4E8E\u6784\u5EFA\u4EA7\u7269\u76EE\u5F55\uFF08\u8DEF\u5F84\u6BB5 {seg}\uFF09\uFF0C\u5DF2\u8DF3\u8FC7\u9879\u76EE\u5FEB\u7167\uFF1B\u5982\u9700\u5728\u6B64\u76EE\u5F55\u4F7F\u7528\u64A4\u56DE\uFF0C\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u91CC\u4ECE\u300C\u57FA\u7840\u6392\u9664\u8868\u300D\u79FB\u9664\u8BE5\u9879\u3002",
    // ---- 错误码文案（host 静态 message 的本地化副本；动态细节码不在表内）----
    "err.STALE": "\u9884\u89C8\u540E\u9879\u76EE\u6587\u4EF6\u53D1\u751F\u4E86\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u786E\u8BA4",
    "err.DUMP_FAILED": "\u8BFB\u53D6\u78C1\u76D8\u5FEB\u7167\u5931\u8D25\uFF0C\u5217\u8868\u4E0E\u6279\u91CF\u5220\u9664\u6682\u4E0D\u53EF\u7528\uFF1B\u8BF7\u67E5\u770B\u300C\u6700\u8FD1\u9519\u8BEF\u300D\u540E\u91CD\u8BD5",
    "err.AGENT_BUSY": "Agent \u6B63\u5728\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u5148\u505C\u6B62\u540E\u518D\u64A4\u56DE",
    "err.NO_SNAPSHOT": "\u8BE5\u6D88\u606F\u6CA1\u6709\u53EF\u7528\u7684\u9879\u76EE\u5FEB\u7167",
    "err.NO_STORE": "\u5FEB\u7167\u5B58\u50A8\u4E0D\u53EF\u7528",
    "err.FORMAT_BLOCKED": "\u78C1\u76D8\u683C\u5F0F\u4E0D\u53D7\u652F\u6301\uFF0C\u5199\u5165\u5DF2\u6682\u505C\uFF08\u8BE6\u89C1\u6700\u8FD1\u9519\u8BEF\uFF09",
    "err.UNKNOWN_PATH": "\u672A\u77E5\u7684\u6392\u9664\u6587\u4EF6\u8DEF\u5F84",
    "err.EMPTY_PATCH": "\u6CA1\u6709\u53EF\u5199\u5165\u7684\u914D\u7F6E\u5B57\u6BB5",
    "err.SETTINGS_UNAVAILABLE": "\u8BBE\u7F6E\u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u8BF7\u5728 profile \u7684 cordis.patch.yml \u6309 id: recall \u8986\u76D6\u914D\u7F6E",
    "err.BODY_TOO_LARGE": "\u8BF7\u6C42\u4F53\u8D85\u8FC7\u5927\u5C0F\u4E0A\u9650",
    "err.NO_ROOT": "\u65E0\u6CD5\u89E3\u6790\u5DE5\u4F5C\u533A",
    "err.NO_SESSION": "\u7F3A\u5C11\u4F1A\u8BDD ID",
    "err.UNKNOWN_OP": "\u672A\u77E5\u7684\u7BA1\u7406\u64CD\u4F5C",
    "err.UNKNOWN_ENDPOINT": "\u672A\u77E5\u7684 API \u7AEF\u70B9",
    "err.INDEX_CORRUPT": "\u5FEB\u7167\u7D22\u5F15\u635F\u574F",
    // ---- 面板内的兜底文案（res 缺失时的最后一级回落）----
    "fallback.preview": "\u65E0\u6CD5\u83B7\u53D6\u5FEB\u7167",
    "fallback.rollback": "\u56DE\u9000\u5931\u8D25",
    // ---- 设置页：快照管理的错误区（按 host kind 键控渲染）----
    "errorKind.git": "\u672A\u68C0\u6D4B\u5230 git CLI \u6216\u7248\u672C\u8FC7\u65E7\uFF1A\u8BF7\u5B89\u88C5\u6216\u5347\u7EA7 git\uFF0C\u5B8C\u6210\u540E\u81EA\u52A8\u6062\u590D",
    "errorKind.space": "\u78C1\u76D8\u7A7A\u95F4\u5DF2\u6EE1\uFF0C\u5FEB\u7167\u5199\u5165\u5931\u8D25\uFF1A\u6E05\u7406\u78C1\u76D8\u7A7A\u95F4\u540E\u81EA\u52A8\u6062\u590D",
    "errorKind.permission": "\u5FEB\u7167\u76EE\u5F55\u65E0\u5199\u5165\u6743\u9650\uFF1A\u8BF7\u68C0\u67E5\u76EE\u5F55\u6743\u9650\u540E\u91CD\u8BD5",
    "errorKind.lock": "\u7591\u4F3C\u591A\u4E2A DSH \u5B9E\u4F8B\u5E76\u53D1\u4F7F\u7528\u540C\u4E00\u5FEB\u7167\u5E93\uFF1A\u8BF7\u786E\u8BA4\u53EA\u542F\u52A8\u4E86\u4E00\u4E2A\uFF1B\u786E\u8BA4\u540E\u4ECD\u5931\u8D25\u65F6\uFF0C\u6309\u300C\u8BBE\u7F6E \xB7 \u63D2\u4EF6\u914D\u7F6E \xB7 \u6700\u8FD1\u9519\u8BEF\u300D\u4E2D\u7684\u8DEF\u5F84\u5220\u9664\u9501\u6587\u4EF6",
    "errorKind.mkdir": "\u5FEB\u7167\u5B58\u50A8\u76EE\u5F55\u88AB\u540C\u540D\u6587\u4EF6\u5360\u7528\uFF1A\u5904\u7406\u540E\u81EA\u52A8\u6062\u590D",
    // ---- 设置页：快照管理卡片 ----
    "manage.busy": "\u6267\u884C\u4E2D\u2026",
    "manage.deletedCount": "\u5DF2\u5220\u9664 {deleted} \u6761\u5FEB\u7167",
    "manage.done.delete": "\u5DF2\u5220\u9664",
    "manage.done.deleteAll": "\u5DF2\u6E05\u7A7A\u5168\u90E8\u5FEB\u7167",
    "manage.done.gc": "gc \u5B8C\u6210",
    "manage.confirm.all": "\u786E\u8BA4\u5220\u9664\u6240\u6709\u5DE5\u4F5C\u533A\u7684\u5168\u90E8\u5FEB\u7167\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002",
    "manage.countLoading": "\u5171 \u2026 \u6761\u5FEB\u7167",
    "manage.countLoaded": "\u5171 {total} \u6761\u5FEB\u7167",
    "manage.countShown": "\uFF08\u5F53\u524D\u663E\u793A\u6700\u65B0 {shown} \u6761\uFF09",
    "manage.countEnd": "\u3002",
    "manage.usageSuffix": "\uFF0C\u5168\u90E8\u5DE5\u4F5C\u533A\u5FEB\u7167\u5B58\u50A8\u5360\u7528 {size}\u3002",
    "manage.health.gitTitle": "\u5FEB\u7167\u5F15\u64CE\u4F9D\u8D56 git",
    "manage.health.gitOk": "git \u53EF\u7528",
    "manage.health.gitBad": "git \u4E0D\u53EF\u7528\uFF08\u5FEB\u7167\u5F15\u64CE\u4F9D\u8D56 git\uFF09",
    "manage.health.stores": " \xB7 \u5FEB\u7167\u5B58\u50A8\uFF1Ahome {n} \u4E2A\u5DE5\u4F5C\u533A",
    "manage.health.storesFallback": "\uFF0C\u964D\u7EA7 {n} \u4E2A",
    "manage.search.placeholder": "\u641C\u7D22\u5DE5\u4F5C\u533A / \u4F1A\u8BDD\u6807\u9898 / \u6D88\u606F\u5185\u5BB9 / ID",
    "manage.search.aria": "\u641C\u7D22\u5FEB\u7167",
    "manage.empty": "\u5728\u4EFB\u610F\u5DE5\u4F5C\u533A\u53D1\u9001\u4E00\u6761\u6D88\u606F\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u5FEB\u7167\u3002",
    "manage.loadFailed": "\u8BFB\u53D6\u78C1\u76D8\u5FEB\u7167\u5931\u8D25",
    "manage.emptyFiltered": "\u65E0\u5339\u914D\u5FEB\u7167",
    "manage.errors.title": "\u6700\u8FD1\u9519\u8BEF ({n})",
    "manage.errors.collapse": "\u6536\u8D77",
    "manage.errors.expand": "\u5C55\u5F00\u5168\u90E8 ({n})",
    "manage.errors.clear": "\u6E05\u7A7A",
    "manage.errors.dup": "\uFF08\xD7{n}\uFF09",
    "manage.loadMore": "\u52A0\u8F7D\u66F4\u591A",
    "manage.refresh": "\u5237\u65B0",
    "manage.gc": "\u7ACB\u5373 gc",
    "manage.gc.title": "\u7ACB\u5373\u5BF9\u5168\u90E8\u5DE5\u4F5C\u533A\u6267\u884C\u4E00\u6B21 git gc\uFF08\u538B\u7F29\u5BF9\u8C61\u5E93\u91CA\u653E\u7A7A\u95F4\uFF09",
    "manage.deleteAll": "\u5168\u90E8\u5220\u9664",
    "manage.deleteAll.title": "\u5220\u9664\u5168\u90E8\u5DE5\u4F5C\u533A\u7684\u6240\u6709\u5FEB\u7167\uFF1B\u4F1A\u76F4\u63A5\u6838\u5BF9\u5E76\u5220\u9664 git tag\uFF08\u5373\u4F7F\u5217\u8868\u4E3A\u7A7A\u4E5F\u53EF\u6E05\u7406\u6B8B\u7559\uFF09",
    // ---- 设置页：插件配置表单 ----
    "config.group.snapshot": "\u5FEB\u7167\u884C\u4E3A",
    "config.group.auto": "\u81EA\u52A8\u6CBB\u7406",
    "config.group.ui": "\u754C\u9762",
    "config.snapshotEnabled.label": "\u542F\u7528\u5FEB\u7167",
    "config.snapshotEnabled.hint": "\u5173\u95ED\u540E\u4E0D\u518D\u65B0\u5EFA\u5FEB\u7167\uFF1B\u5DF2\u6709\u5FEB\u7167\u4ECD\u53EF\u64A4\u56DE",
    "config.messageOnly.label": "\u53EA\u56DE\u9000\u6D88\u606F",
    "config.messageOnly.hint": "\u6BCF\u6761\u6D88\u606F\u53EA\u767B\u8BB0\u64A4\u56DE\u8BB0\u5F55\uFF0C\u4E0D\u5199\u6587\u4EF6\u5FEB\u7167\uFF08\u8D85\u5927\u5DE5\u4F5C\u533A\u7701\u65F6\u7701\u76D8\uFF09\uFF1B\u5DF2\u6709\u5FEB\u7167\u4ECD\u53EF\u56DE\u9000\u6587\u4EF6",
    "config.refillDraft.label": "\u56DE\u586B\u8F93\u5165\u6846",
    "config.refillDraft.hint": "\u64A4\u56DE\u540E\u628A\u6D88\u606F\u6587\u672C\u56DE\u586B\u8F93\u5165\u6846\uFF0C\u4FBF\u4E8E\u6539\u5B8C\u91CD\u53D1",
    "config.archiveOriginal.label": "\u5F52\u6863\u539F\u4F1A\u8BDD",
    "config.archiveOriginal.hint": "\u539F\u4F1A\u8BDD\u5F52\u6863\u9690\u85CF\uFF0C\u53EF\u4ECE\u5F52\u6863\u627E\u56DE\uFF1B\u5173\u95ED\u5219\u7559\u5728\u5217\u8868\u4FBF\u4E8E\u5BF9\u7167",
    "config.editSubmitsImmediately.label": "\u7F16\u8F91\u540E\u81EA\u52A8\u53D1\u9001",
    "config.editSubmitsImmediately.hint": "\u300C\u7F16\u8F91\u5E76\u91CD\u53D1\u300D\u63D0\u4EA4\u540E\u76F4\u63A5\u53D1\u51FA\u6539\u540E\u7684\u6D88\u606F\uFF1B\u5173\u95ED\u5219\u53EA\u56DE\u586B\u8F93\u5165\u6846\uFF0C\u7531\u4F60\u6309\u56DE\u8F66\u53D1\u9001",
    "config.gcSnaps.label": "gc \u89E6\u53D1\u6761\u6570",
    "config.gcSnaps.hint": "\u6BCF\u79EF\u7D2F\u591A\u5C11\u6761\u5FEB\u7167\u89E6\u53D1\u4E00\u6B21 gc",
    "config.gcSnaps.suffix": "\u6761",
    "config.gcHours.label": "gc \u89E6\u53D1\u5C0F\u65F6",
    "config.gcHours.hint": "\u8DDD\u4E0A\u6B21 gc \u8D85\u8FC7\u591A\u5C11\u5C0F\u65F6\u89E6\u53D1\uFF0C\u4E0E\u6761\u6570\u5148\u5230\u5148\u89E6\u53D1",
    "config.gcHours.suffix": "\u5C0F\u65F6",
    "config.maxFileBytes.label": "\u6587\u4EF6\u5927\u5C0F\u4E0A\u9650",
    "config.maxFileBytes.hint": "\u8D85\u8FC7\u8BE5\u5927\u5C0F\u7684\u6587\u4EF6\u4E0D\u8FDB\u5FEB\u7167\u3001\u4E0D\u88AB\u56DE\u9000\u89E6\u78B0",
    "config.maxFileBytes.suffix": "MB",
    "config.maxWorkspaceBytes.label": "\u5DE5\u4F5C\u533A\u603B\u91CF\u4E0A\u9650",
    "config.maxWorkspaceBytes.hint": "\u5355\u5DE5\u4F5C\u533A\u53EF\u7EB3\u5165\u5FEB\u7167\u7684\u6587\u4EF6\u603B\u91CF\uFF0C\u53E3\u5F84\u4E0E git add \u4E00\u81F4\uFF08\u542B .gitignore\uFF09\uFF0C\u8D85\u8FC7\u5373\u505C\u7528\u8BE5\u5DE5\u4F5C\u533A\u5FEB\u7167\uFF08\u4E0D\u622A\u65AD\uFF0C\u907F\u514D\u56DE\u9000\u8BEF\u5220\uFF09\uFF1B0 \u8868\u793A\u4E0D\u9650\u5236",
    "config.maxWorkspaceBytes.suffix": "MB",
    "config.scanBudgetMs.label": "\u626B\u63CF\u65F6\u95F4\u9884\u7B97",
    "config.scanBudgetMs.hint": "\u5FEB\u7167\u524D\u7EDF\u8BA1\u7EB3\u5165\u603B\u91CF\u8D85\u8FC7\u8BE5\u65F6\u957F\u5373\u505C\u7528\u672C\u6B21\u5FEB\u7167\uFF1B0 \u8868\u793A\u4E0D\u9650\u5236",
    "config.scanBudgetMs.suffix": "\u79D2",
    "config.snapshotBudgetMs.label": "\u5355\u6B21\u5FEB\u7167\u65F6\u9650",
    "config.snapshotBudgetMs.hint": "\u5355\u6B21\u5FEB\u7167\u4ECE\u626B\u63CF\u5230\u5199\u5165\u7684\u603B\u65F6\u9650\uFF0C\u8D85\u65F6\u5373\u4E2D\u6B62\u672C\u6B21\u5FEB\u7167\u5E76\u8BB0\u5165\u6700\u8FD1\u9519\u8BEF\uFF1B0 \u8868\u793A\u4E0D\u9650\u5236",
    "config.snapshotBudgetMs.suffix": "\u79D2",
    "config.maxSnapshotsPerWorkspace.label": "\u5FEB\u7167\u603B\u91CF\u4E0A\u9650",
    "config.maxSnapshotsPerWorkspace.hint": "\u6BCF\u5DE5\u4F5C\u533A\u4FDD\u7559\u7684\u6700\u5927\u5FEB\u7167\u6570\uFF0C\u8D85\u9650\u5220\u9664\u6700\u65E7\u7684\uFF1B0 \u8868\u793A\u4E0D\u9650\u5236",
    "config.maxSnapshotsPerWorkspace.suffix": "\u6761",
    "config.retentionDays.label": "\u5FEB\u7167\u4FDD\u7559\u5929\u6570",
    "config.retentionDays.hint": "\u8D85\u671F\u5FEB\u7167\u81EA\u52A8\u5220\u9664\u6700\u65E7\u7684\uFF1B0 \u8868\u793A\u4E0D\u542F\u7528",
    "config.retentionDays.suffix": "\u5929",
    "config.locale.label": "\u754C\u9762\u8BED\u8A00",
    "config.locale.hint": "auto \u8DDF\u968F\u7CFB\u7EDF\u8BED\u8A00\uFF1B\u4FDD\u5B58\u540E\u751F\u6548\uFF08\u5BBF\u4E3B\u4FA7\u300C\u63D2\u4EF6\u914D\u7F6E\u300D\u81EA\u5E26\u7684\u5B57\u6BB5\u8BF4\u660E\u4ECD\u4E3A\u4E2D\u6587\uFF09",
    "config.locale.auto": "\u8DDF\u968F\u7CFB\u7EDF (auto)",
    "config.tag.modified": "\u5DF2\u4FEE\u6539",
    "config.tag.overridden": "\u5DF2\u8986\u76D6",
    "config.tag.locked": "\u73AF\u5883\u53D8\u91CF\u9501\u5B9A",
    "config.tag.readonly": "\u53EA\u8BFB\u8BBE\u7F6E\u6E90",
    "config.reset": "\u6062\u590D\u9ED8\u8BA4",
    "config.reset.title": "\u628A\u6240\u6709\u5B57\u6BB5\u6062\u590D\u5230\u63D2\u4EF6\u51FA\u5382\u9ED8\u8BA4\u503C",
    "config.advanced.title": "\u9AD8\u7EA7\uFF1A\u57FA\u7840\u6392\u9664\u8868",
    "config.baseExcludes.label": "\u57FA\u7840\u6392\u9664\u8868",
    "config.baseExcludes.hint": "\u5404\u5DE5\u4F5C\u533A\u5171\u4EAB\u7684\u5185\u7F6E\u89C4\u5219\uFF1Bgitignore \u8BED\u6CD5\uFF0C\u6BCF\u884C\u4E00\u6761\uFF1B\u4F18\u5148\u7EA7\u4F4E\u4E8E\u300C\u6392\u9664\u914D\u7F6E\u300D\u7684 exclude.txt",
    "config.msg.loading": "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026",
    "config.msg.loadFailed": "\u65E0\u6CD5\u8BFB\u53D6\u914D\u7F6E",
    "config.msg.noChange": "\u6CA1\u6709\u4FEE\u6539",
    "config.msg.saving": "\u4FDD\u5B58\u4E2D\u2026",
    "config.msg.saved": "\u5DF2\u4FDD\u5B58\u5E76\u5373\u65F6\u751F\u6548",
    "config.msg.saveFailed": "\u4FDD\u5B58\u5931\u8D25",
    "config.msg.resetting": "\u6062\u590D\u9ED8\u8BA4\u4E2D\u2026",
    "config.msg.resetDone": "\u5DF2\u6062\u590D\u9ED8\u8BA4\u503C",
    "config.msg.resetFailed": "\u6062\u590D\u9ED8\u8BA4\u5931\u8D25",
    "config.err.gcSnaps": "\u5FEB\u7167\u6761\u6570\u9608\u503C\u5FC5\u987B\u662F >= 1 \u7684\u6574\u6570",
    "config.err.gcHours": "gc \u5C0F\u65F6\u9608\u503C\u5FC5\u987B\u662F >= 1 \u7684\u6574\u6570",
    "config.err.maxFileBytes": "\u6587\u4EF6\u5927\u5C0F\u4E0A\u9650\u81F3\u5C11 0.01 MB",
    "config.err.maxWorkspaceBytes": "\u5DE5\u4F5C\u533A\u603B\u91CF\u4E0A\u9650\u5FC5\u987B\u662F >= 0 \u7684\u6570\u5B57\uFF080 \u8868\u793A\u4E0D\u9650\u5236\uFF09",
    "config.err.scanBudgetMs": "\u626B\u63CF\u65F6\u95F4\u9884\u7B97\u5FC5\u987B\u662F >= 0 \u7684\u6570\u5B57\uFF080 \u8868\u793A\u4E0D\u9650\u5236\uFF09",
    "config.err.snapshotBudgetMs": "\u5355\u6B21\u5FEB\u7167\u65F6\u9650\u5FC5\u987B\u662F >= 0 \u7684\u6570\u5B57\uFF080 \u8868\u793A\u4E0D\u9650\u5236\uFF09",
    "config.err.maxSnapshots": "\u5FEB\u7167\u603B\u91CF\u4E0A\u9650\u5FC5\u987B\u662F >= 0 \u7684\u6574\u6570\uFF080 \u8868\u793A\u4E0D\u9650\u5236\uFF09",
    "config.err.retentionDays": "\u4FDD\u7559\u5929\u6570\u5FC5\u987B\u662F >= 0 \u7684\u6574\u6570\uFF080 \u8868\u793A\u4E0D\u542F\u7528\uFF09",
    "config.err.locale": "\u754C\u9762\u8BED\u8A00\u5FC5\u987B\u662F auto / zh / en \u4E4B\u4E00",
    // ---- 设置页：排除配置卡片 ----
    "exclude.note.home": "\u6B64\u914D\u7F6E\u5168\u5C40\u5171\u4EAB\uFF0C\u5BF9\u6240\u6709\u5DE5\u4F5C\u533A\u7684\u5FEB\u7167\u751F\u6548\u3002",
    "exclude.note.fallback": "home \u76EE\u5F55\u4E0D\u53EF\u5199\u65F6\u6B64\u5DE5\u4F5C\u533A\u964D\u7EA7\u5B58\u50A8\uFF0C\u6392\u9664\u914D\u7F6E\u72EC\u7ACB\u751F\u6548\u3002",
    "exclude.path": "\u5B58\u50A8\u4F4D\u7F6E\uFF1A{path}",
    "exclude.syntax": "gitignore \u8BED\u6CD5\uFF0C\u4E00\u884C\u4E00\u6761\uFF0C\u652F\u6301 # \u6CE8\u91CA\uFF1B\u547D\u4E2D\u9879\u4E0D\u8FDB\u5FEB\u7167\u3001\u4E0D\u88AB\u56DE\u9000\u89E6\u78B0\u3002",
    "exclude.area.aria": "\u5FEB\u7167\u6392\u9664\u6A21\u5F0F\u5217\u8868\uFF08gitignore \u8BED\u6CD5\uFF0C\u4E00\u884C\u4E00\u6761\uFF09",
    "exclude.quick.placeholder": "\u8F93\u5165\u8DEF\u5F84\u6216\u6A21\u5F0F\uFF0C\u56DE\u8F66\u5FEB\u901F\u6DFB\u52A0",
    "exclude.quick.aria": "\u5FEB\u901F\u6DFB\u52A0\u6392\u9664\u6A21\u5F0F",
    "exclude.add": "\u6DFB\u52A0",
    "exclude.chip.title": "\u70B9\u51FB\u8FFD\u52A0 {pattern}",
    "exclude.msg.saving": "\u4FDD\u5B58\u4E2D\u2026",
    "exclude.msg.saved": "\u5DF2\u4FDD\u5B58\uFF0C\u4E0B\u4E00\u6B21\u5FEB\u7167 / \u9884\u89C8 / \u56DE\u9000\u65F6\u751F\u6548",
    "exclude.msg.saveFailed": "\u4FDD\u5B58\u5931\u8D25",
    "exclude.loadFailed": "\u65E0\u6CD5\u8BFB\u53D6\u6392\u9664\u914D\u7F6E",
    "exclude.unsupported": "\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301\u5FEB\u7167\u529F\u80FD\uFF0C\u6392\u9664\u914D\u7F6E\u4E0D\u53EF\u7528\u3002",
    "exclude.loading": "\u6B63\u5728\u52A0\u8F7D\u6392\u9664\u914D\u7F6E\u2026",
    "exclude.empty": "\u5C1A\u672A\u521B\u5EFA\u4EFB\u4F55\u5FEB\u7167\u5B58\u50A8\uFF1A\u5728\u4EFB\u610F\u5DE5\u4F5C\u533A\u53D1\u9001\u4E00\u6761\u6D88\u606F\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u53EF\u7F16\u8F91\u7684\u6392\u9664\u914D\u7F6E\u3002",
    // ---- 设置页：分区折叠头 ----
    "section.exclude": "\u6392\u9664\u914D\u7F6E\uFF08exclude.txt\uFF09",
    "section.manage": "\u5FEB\u7167\u7BA1\u7406"
  };

  // src/client/locales/en.ts
  var en = {
    // ---- 通用 ----
    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.save": "Save",
    "common.discard": "Discard changes",
    "common.retry": "Retry",
    "common.errorPrefix": "Error: ",
    "common.unknownReason": "unknown reason",
    "common.opFailed": "Operation failed",
    "common.listSep": ", ",
    "common.paren": " ({text})",
    // ---- 变更类型 ----
    "kind.modified": "modified",
    "kind.restored": "restored",
    "kind.added": "deleted",
    // ---- 用户消息内的文件卡片 ----
    "file.unnamed": "unnamed file",
    // ---- 快照管理树的节点文案 ----
    "tree.unknownWorkspace": "Unknown workspace",
    "tree.deletedSession": "(deleted session)",
    "tree.expand": "Expand: {label}",
    "tree.collapse": "Collapse: {label}",
    "tree.snapCount": "{n} snapshots",
    "tree.wsCount": "{n} sessions / {m} snapshots",
    "tree.family.title": "Version family: {chain}",
    "tree.switch": "Switch",
    "tree.switch.title": "Switch to this version session",
    "tree.messageOnly": "Messages only",
    "tree.delete.snapshot.title": "Delete this snapshot (tag and index entry)",
    "tree.delete.snapshot.confirm": "Delete this snapshot? This cannot be undone.",
    "tree.delete.session.title": "Delete all snapshots of this session",
    "tree.delete.session.confirm": "Delete all snapshots of this session? This cannot be undone.",
    "tree.delete.workspace.title": "Delete all snapshots of this workspace",
    "tree.delete.workspace.confirm": "Delete all snapshots of this workspace? This cannot be undone.",
    // ---- 撤回确认面板 ----
    "recall.loading": "Computing changes\u2026",
    "recall.error.title": "Cannot roll back",
    "recall.confirm.title": "Roll back",
    "recall.truncated.files": "\u2026showing the first {shown} of {total} files to change",
    "recall.truncated.chat": "\u2026showing the first {shown} of {total} differences",
    "recall.confirm.sessionOnly": "Project files stay as they are \u2014 nothing is reverted or deleted; only the chat rewinds to before this message.",
    "recall.confirm.messageOnly": "This message only rewinds the chat: project files are untouched, and the chat goes back to before this message.",
    "recall.confirm.noEffect": "This message has no file snapshot, and as the first message of the session there is no earlier chat to rewind to.",
    "recall.confirm.rollbackAt": "Restore the project to its state at {time}, when this message was sent.",
    "recall.confirm.rollbackNoTime": "Restore the project to its state when this message was sent.",
    // 句首空格是有意的：本句与 recall.confirm.rollbackAt 拼接成一段（前句以句点
    // 收尾），英文标点族需要空格（与 common.paren / tellChat 同类；中文版不需要）
    "recall.confirm.files": " {total} files will change{summary}. This overwrites current file contents; a safety snapshot of the current state is saved automatically before the rollback (not listed below).",
    "recall.confirm.chatBoth": "The chat also rewinds to before this message: this message and everything after it leaves the current view, and the original session is archived (recoverable from Archive).",
    "recall.confirm.chatFirst": "This is the first user message in this session, so the chat cannot rewind; only project files will be restored.",
    "recall.confirm.refNote": "The differences below are for reference only; the selected mode will not touch any file.",
    "recall.scope.aria": "Recall scope",
    "recall.scope.both": "Files and chat",
    "recall.scope.sessionOnly": "Chat only",
    "recall.confirm.submit.both": "Roll back",
    "recall.confirm.submit.sessionOnly": "Rewind chat",
    "recall.executing.both": "Rolling back\u2026",
    "recall.executing.sessionOnly": "Rewinding chat\u2026",
    "recall.done.title": "Rollback complete",
    "recall.done.both.ok": "Project files and the chat have been rewound to before this message. A new session is open and the original one is archived (recoverable from Archive).",
    "recall.done.both.partial": "The project has been restored to its state when this message was sent.",
    "recall.done.both.failChat": " Chat rewind failed: {error}",
    "recall.done.sessionOnly.ok": "The chat has been rewound to before this message; project files stay as they are. A new session is open and the original one is archived (recoverable from Archive).",
    "recall.done.sessionOnly.fail": "Chat rewind failed: {error}. No project files were touched.",
    "recall.chat.noChild": "no new session returned",
    // ---- 用户消息气泡的动作按钮 ----
    "action.copy": "Copy",
    "action.copied": "Copied",
    "action.recall": "Recall",
    "action.recall.title": "Roll back: files and chat return to before this message",
    "action.edit": "Edit",
    "action.edit.title": "Edit and resend in place (new session, project files untouched)",
    // ---- 就地编辑面板（issue #26）----
    "edit.title": "Edit and resend",
    "edit.note": "Submitting creates a new session: this message and everything after it will not appear there, and the original session is archived. Project files are left untouched.",
    "edit.attachments": "{n} attachment(s) from the original message will be carried over.",
    "edit.placeholder": "Message text",
    "edit.submit": "Edit and send",
    "edit.submit.draftOnly": "Edit and refill",
    "edit.submitting": "Rolling back to before this message\u2026",
    "edit.retry": "Retry",
    "edit.error.title": "Could not edit and resend",
    "edit.back": "Back to editing",
    "edit.noCut": "This is the first user message in the session, so there is no earlier turn boundary to fork from.",
    "edit.forkFailed": "The chat could not be rolled back (no new session was created), so the edit was not sent.",
    "edit.empty": "Message text cannot be empty.",
    "edit.official.hint": "Enter sends into a new session \xB7 Esc cancels",
    "edit.official.retry": "Enter to retry \xB7 Esc to cancel",
    "edit.attachment.add": "Add attachment",
    "edit.attachment.remove": "Remove attachment {name}",
    "edit.model.label": "Model",
    "edit.model.menu": "Model and reasoning effort",
    "edit.model.effort": "Reasoning effort",
    "edit.model.search": "Search models\u2026",
    "edit.model.empty": "No matching models",
    "edit.model.noLevels": "No effort levels for this model",
    "edit.model.providerDefault": "Default",
    // ---- 版本翻页器（‹ X/N ›）----
    "pager.prev": "Previous version",
    "pager.next": "Next version",
    "pager.label": "Version {n} of {total}",
    "pager.openUnconfirmed": "The target session did not open in time; the current session is still available. Retry or check its model provider",
    // ---- toast ----
    "toast.tag": "Recall plugin",
    "toast.skipped": "Snapshot skipped unlisted paths: {names} (rollback will not restore or delete them)",
    "toast.skippedMore": " and {n} more",
    "toast.snapshotFailed": "Snapshot failed: {error}",
    "toast.staleQueue": "A queued message from before the recall could not be cleaned up automatically; remove it with the delete button on that card",
    "toast.fileAttachRefill": "File attachments from the recalled message cannot be refilled automatically (the official API only reads images back); please re-select the files",
    "toast.pagerFailed": "Could not switch version: {error}",
    // ---- init / snapshot-info 说明 ----
    "notice.unsupported": "The recall plugin supports Windows / Linux / macOS only; snapshots are unavailable on this platform.",
    "notice.gitMissing": "git CLI not found, so recall is unavailable (the snapshot engine depends on git). Install git and restart DSH to enable it.",
    "notice.homeFallback": "The home directory is not writable; snapshots fall back to .dsh-recall-snapshots inside the project.",
    "notice.buildRoot": 'This workspace is a build-artifact directory (path segment {seg}), so project snapshots are skipped; to use recall here, remove that entry from "Base excludes" in the plugin settings.',
    // ---- 错误码文案 ----
    "err.STALE": "Project files changed after the preview; preview again to confirm",
    "err.DUMP_FAILED": 'Could not read snapshots from disk; the list and bulk delete are unavailable. Check "Recent errors" and retry',
    "err.AGENT_BUSY": "The agent is running; stop it before recalling",
    "err.NO_SNAPSHOT": "No project snapshot is available for this message",
    "err.NO_STORE": "Snapshot storage is unavailable",
    "err.FORMAT_BLOCKED": "Unsupported disk format; writes are paused (see Recent errors)",
    "err.UNKNOWN_PATH": "Unknown exclude file path",
    "err.EMPTY_PATCH": "No config field to write",
    "err.SETTINGS_UNAVAILABLE": "Settings service unavailable: override the config by id: recall in the profile cordis.patch.yml",
    "err.BODY_TOO_LARGE": "Request body exceeds the size limit",
    "err.NO_ROOT": "Cannot resolve the workspace",
    "err.NO_SESSION": "Missing session ID",
    "err.UNKNOWN_OP": "Unknown manage operation",
    "err.UNKNOWN_ENDPOINT": "Unknown API endpoint",
    "err.INDEX_CORRUPT": "Snapshot index is corrupted",
    // ---- 面板兜底 ----
    "fallback.preview": "Failed to load the snapshot",
    "fallback.rollback": "Rollback failed",
    // ---- 设置页：最近错误（按 host kind 键控）----
    "errorKind.git": "git CLI not found or too old: install or upgrade git; snapshots resume automatically afterwards",
    "errorKind.space": "Disk is full, snapshot writes failed: free up disk space to resume automatically",
    "errorKind.permission": "No write permission on the snapshot directory: check directory permissions and retry",
    "errorKind.lock": "Possibly multiple DSH instances sharing one snapshot store: make sure only one is running; if it still fails, delete the lock file at the path shown in Settings \xB7 Plugin config \xB7 Recent errors",
    "errorKind.mkdir": "The snapshot directory is occupied by a file of the same name: resolve it to resume automatically",
    // ---- 设置页：快照管理卡片 ----
    "manage.busy": "Working\u2026",
    "manage.deletedCount": "Deleted {deleted} snapshots",
    "manage.done.delete": "Deleted",
    "manage.done.deleteAll": "All snapshots cleared",
    "manage.done.gc": "gc finished",
    "manage.confirm.all": "Delete all snapshots in every workspace? This cannot be undone.",
    "manage.countLoading": "Loading snapshot count\u2026",
    "manage.countLoaded": "{total} snapshots in total",
    "manage.countShown": " (showing the newest {shown})",
    "manage.countEnd": ".",
    "manage.usageSuffix": ", using {size} across all workspaces.",
    "manage.health.gitTitle": "The snapshot engine depends on git",
    "manage.health.gitOk": "git available",
    "manage.health.gitBad": "git unavailable (the snapshot engine depends on git)",
    "manage.health.stores": " \xB7 Snapshot storage: {n} workspaces in home",
    "manage.health.storesFallback": ", {n} in fallback",
    "manage.search.placeholder": "Search workspace / session title / message / ID",
    "manage.search.aria": "Search snapshots",
    "manage.empty": "Send a message in any workspace and its snapshot will appear here.",
    "manage.loadFailed": "Could not read snapshots from disk",
    "manage.emptyFiltered": "No matching snapshots",
    "manage.errors.title": "Recent errors ({n})",
    "manage.errors.collapse": "Collapse",
    "manage.errors.expand": "Show all ({n})",
    "manage.errors.clear": "Clear",
    "manage.errors.dup": " (\xD7{n})",
    "manage.loadMore": "Load more",
    "manage.refresh": "Refresh",
    "manage.gc": "Run gc",
    "manage.gc.title": "Run git gc once for every workspace (compacts the object store to free space)",
    "manage.deleteAll": "Delete all",
    "manage.deleteAll.title": "Delete all snapshots in every workspace; git tags are checked and removed directly (leftovers can be cleaned even when the list is empty)",
    // ---- 设置页：插件配置表单 ----
    "config.group.snapshot": "Snapshot behavior",
    "config.group.auto": "Automatic maintenance",
    "config.group.ui": "Interface",
    "config.snapshotEnabled.label": "Enable snapshots",
    "config.snapshotEnabled.hint": "When off, no new snapshots are created; existing ones can still be recalled",
    "config.messageOnly.label": "Messages only",
    "config.messageOnly.hint": "Register recall records without writing file snapshots (saves time and disk in huge workspaces); existing snapshots can still roll back files",
    "config.refillDraft.label": "Refill input box",
    "config.refillDraft.hint": "Put the message text back into the input box after a recall, so you can edit and resend",
    "config.archiveOriginal.label": "Archive original session",
    "config.archiveOriginal.hint": "Archive and hide the original session (recoverable from Archive); when off it stays in the list for comparison",
    "config.editSubmitsImmediately.label": "Send after editing",
    "config.editSubmitsImmediately.hint": "Edit and resend sends the changed message right away; when off it only refills the input box so you can press Enter yourself",
    "config.gcSnaps.label": "gc trigger count",
    "config.gcSnaps.hint": "Run gc after this many snapshots accumulate",
    "config.gcSnaps.suffix": "snapshots",
    "config.gcHours.label": "gc trigger hours",
    "config.gcHours.hint": "Run gc when this many hours passed since the last one; whichever comes first",
    "config.gcHours.suffix": "hours",
    "config.maxFileBytes.label": "File size limit",
    "config.maxFileBytes.hint": "Files larger than this are not snapshotted and never touched by rollback",
    "config.maxFileBytes.suffix": "MB",
    "config.maxWorkspaceBytes.label": "Workspace total limit",
    "config.maxWorkspaceBytes.hint": "Total snapshot-eligible file size per workspace, measured the same way as git add (so .gitignore applies); beyond it snapshots are disabled for that workspace (no truncation, which would make rollback delete skipped files); 0 means unlimited",
    "config.maxWorkspaceBytes.suffix": "MB",
    "config.scanBudgetMs.label": "Scan time budget",
    "config.scanBudgetMs.hint": "Skip this snapshot when measuring the snapshot-eligible total exceeds this duration; 0 means unlimited",
    "config.scanBudgetMs.suffix": "s",
    "config.snapshotBudgetMs.label": "Snapshot time limit",
    "config.snapshotBudgetMs.hint": "Total time for one snapshot from scan to write; exceeding it aborts the snapshot and records it under recent errors; 0 means unlimited",
    "config.snapshotBudgetMs.suffix": "s",
    "config.maxSnapshotsPerWorkspace.label": "Snapshot count limit",
    "config.maxSnapshotsPerWorkspace.hint": "Maximum snapshots kept per workspace; the oldest are deleted beyond it; 0 means unlimited",
    "config.maxSnapshotsPerWorkspace.suffix": "snapshots",
    "config.retentionDays.label": "Snapshot retention days",
    "config.retentionDays.hint": "Delete snapshots older than this; the oldest first; 0 disables it",
    "config.retentionDays.suffix": "days",
    "config.locale.label": "Language",
    "config.locale.hint": "auto follows the system language; takes effect after saving (field descriptions rendered by the host-side plugin config form stay in Chinese)",
    "config.locale.auto": "Follow system (auto)",
    "config.tag.modified": "Modified",
    "config.tag.overridden": "Overridden",
    "config.tag.locked": "Locked by env var",
    "config.tag.readonly": "Read-only settings source",
    "config.reset": "Restore defaults",
    "config.reset.title": "Restore every field to the plugin factory defaults",
    "config.advanced.title": "Advanced: base excludes",
    "config.baseExcludes.label": "Base excludes",
    "config.baseExcludes.hint": 'Built-in rules shared by all workspaces; gitignore syntax, one per line; lower priority than exclude.txt in "Exclude config"',
    "config.msg.loading": "Loading configuration\u2026",
    "config.msg.loadFailed": "Failed to load configuration",
    "config.msg.noChange": "No changes",
    "config.msg.saving": "Saving\u2026",
    "config.msg.saved": "Saved and applied immediately",
    "config.msg.saveFailed": "Failed to save",
    "config.msg.resetting": "Restoring defaults\u2026",
    "config.msg.resetDone": "Defaults restored",
    "config.msg.resetFailed": "Failed to restore defaults",
    "config.err.gcSnaps": "The snapshot count threshold must be an integer >= 1",
    "config.err.gcHours": "The gc hour threshold must be an integer >= 1",
    "config.err.maxFileBytes": "The file size limit must be at least 0.01 MB",
    "config.err.maxWorkspaceBytes": "The workspace total limit must be a number >= 0 (0 means unlimited)",
    "config.err.scanBudgetMs": "The scan time budget must be a number >= 0 (0 means unlimited)",
    "config.err.snapshotBudgetMs": "The snapshot time limit must be a number >= 0 (0 means unlimited)",
    "config.err.maxSnapshots": "The snapshot count limit must be an integer >= 0 (0 means unlimited)",
    "config.err.retentionDays": "Retention days must be an integer >= 0 (0 disables it)",
    "config.err.locale": "Language must be one of auto / zh / en",
    // ---- 设置页：排除配置卡片 ----
    "exclude.note.home": "This configuration is shared globally and applies to snapshots in every workspace.",
    "exclude.note.fallback": "This workspace stores snapshots in the fallback location (home is not writable), so its exclude config is separate.",
    "exclude.path": "Location: {path}",
    "exclude.syntax": "gitignore syntax, one per line, # comments supported; matched paths are not snapshotted and never touched by rollback.",
    "exclude.area.aria": "Snapshot exclude patterns (gitignore syntax, one per line)",
    "exclude.quick.placeholder": "Type a path or pattern, press Enter to add",
    "exclude.quick.aria": "Quickly add an exclude pattern",
    "exclude.add": "Add",
    "exclude.chip.title": "Click to append {pattern}",
    "exclude.msg.saving": "Saving\u2026",
    "exclude.msg.saved": "Saved; takes effect on the next snapshot / preview / rollback",
    "exclude.msg.saveFailed": "Failed to save",
    "exclude.loadFailed": "Failed to load the exclude configuration",
    "exclude.unsupported": "This platform does not support snapshots, so exclude configuration is unavailable.",
    "exclude.loading": "Loading exclude configuration\u2026",
    "exclude.empty": "No snapshot store exists yet: send a message in any workspace and its editable exclude configuration will appear here.",
    // ---- 设置页：分区折叠头 ----
    "section.exclude": "Exclude config (exclude.txt)",
    "section.manage": "Snapshot manager"
  };

  // src/client/locales/index.ts
  var DICTS = { zh, en };
  function resolveLocale(pref) {
    if (pref === "zh" || pref === "en") return pref;
    try {
      const nav = typeof navigator === "undefined" ? null : navigator;
      const lang = nav && typeof nav.language === "string" ? nav.language : "";
      if (!lang) return "zh";
      return lang.toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
    } catch (error) {
      return "zh";
    }
  }
  function interpolate(template, params) {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (raw, name) => {
      const value = params[name];
      return value === void 0 ? raw : String(value);
    });
  }
  function translate(locale, key, params) {
    const dict = DICTS[locale];
    const hit = dict[key] !== void 0 ? dict[key] : zh[key];
    return interpolate(hit !== void 0 ? hit : key, params);
  }
  var zhTranslate = (key, params) => translate("zh", key, params);
  function hasTranslation(key) {
    return zh[key] !== void 0;
  }

  // src/client/util.ts
  function clockText(ms) {
    try {
      if (!ms || isNaN(new Date(ms).getTime())) return "";
      const d = new Date(ms);
      const now = /* @__PURE__ */ new Date();
      const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return sameDay ? hh + ":" + mm : d.getMonth() + 1 + "/" + d.getDate() + " " + hh + ":" + mm;
    } catch (e) {
      return "";
    }
  }
  function sizeText(bytes) {
    const n = Number(bytes);
    if (!bytes || n <= 0) return "0 MB";
    if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
    if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
    return (n / 1073741824).toFixed(2) + " GB";
  }
  function bytesToMb(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return "";
    return String(Math.round(n / 1048576 * 100) / 100);
  }
  function buildTree(list, t = zhTranslate) {
    const workspaces = /* @__PURE__ */ new Map();
    for (const it of list || []) {
      const rootKey = it.root || "unknown-root";
      let ws = workspaces.get(rootKey);
      if (!ws) {
        ws = { root: it.root || null, name: it.workspace || t("tree.unknownWorkspace"), sessions: /* @__PURE__ */ new Map() };
        workspaces.set(rootKey, ws);
      }
      const sidKey = it.sessionId || "unknown-session";
      if (!ws.sessions.has(sidKey)) ws.sessions.set(sidKey, { root: ws.root, sessionId: it.sessionId || null, title: it.sessionTitle || null, items: [] });
      const session = ws.sessions.get(sidKey);
      if (session) session.items.push(it);
    }
    const wsList = Array.from(workspaces.values()).map((ws) => ({ root: ws.root, name: ws.name, sessions: Array.from(ws.sessions.values()) }));
    wsList.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    for (const ws of wsList) {
      ws.sessions.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      for (const s of ws.sessions) s.items.sort((a, b) => (b.time || 0) - (a.time || 0));
    }
    return wsList;
  }
  function recallApiUrl(name, base) {
    const root = base ?? (typeof document === "undefined" ? "" : document.baseURI);
    if (!root) return "/api/recall/" + name;
    try {
      const baseUrl = new URL(root);
      if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
      return new URL("api/recall/" + name, baseUrl).href;
    } catch (e) {
      return "/api/recall/" + name;
    }
  }
  function buildRecallNotify(base, o) {
    if (o.outcome === "complete") {
      return {
        status: "complete",
        sessionId: base.sessionId,
        messageId: base.messageId,
        scope: base.scope,
        cutSeq: o.cutSeq,
        childSessionId: o.childSessionId,
        count: o.count,
        chatReverted: o.chatReverted,
        archiveRequested: o.archiveRequested
      };
    }
    const stage = o.outcome === "fork-failed" ? "fork" : "execute";
    const code = o.outcome === "execute-rejected" && typeof o.code === "string" && o.code ? o.code : void 0;
    return {
      status: "failed",
      stage,
      sessionId: base.sessionId,
      messageId: base.messageId,
      scope: base.scope,
      cutSeq: o.cutSeq,
      ...code ? { code } : {},
      error: typeof o.error === "string" && o.error ? o.error : String(o.error || "recall failed")
    };
  }
  function useAutoDismissMessage(React, state, setState) {
    React.useEffect(() => {
      if (!state.message || state.error || state.busy) return;
      const timer = setTimeout(() => {
        setState((prev) => prev.message === state.message && !prev.error && !prev.busy ? Object.assign({}, prev, { message: "" }) : prev);
      }, 4e3);
      return () => clearTimeout(timer);
    }, [state.message, state.error, state.busy]);
  }
  function buildUtil() {
    let locale = resolveLocale("auto");
    function t(key, params) {
      return translate(locale, key, params);
    }
    function setLocalePref(pref) {
      locale = resolveLocale(pref);
    }
    function api(name, args) {
      return fetch(recallApiUrl(name), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args || {})
      }).then((r) => r.json());
    }
    function messageFor(res, fallback) {
      if (!res) return fallback;
      const code = res.code;
      const key = code ? "err." + String(code) : "";
      if (key && hasTranslation(key)) return t(key);
      const m = res.message;
      const e = res.error;
      return String(m || e || fallback);
    }
    const noticeShown = /* @__PURE__ */ new Set();
    function mountToast(text2) {
      if (typeof document === "undefined") return;
      try {
        let dismiss2 = function() {
          if (dismissed) return;
          dismissed = true;
          clearTimeout(timer);
          el.classList.remove("dsh-recall-toast-in");
          setTimeout(() => el.remove(), 300);
        };
        var dismiss = dismiss2;
        const el = document.createElement("div");
        el.className = "dsh-recall-toast";
        const tag = document.createElement("span");
        tag.className = "dsh-recall-toast-tag";
        tag.textContent = t("toast.tag");
        const body = document.createElement("span");
        body.textContent = text2;
        el.appendChild(tag);
        el.appendChild(body);
        el.addEventListener("click", () => dismiss2(), { once: true });
        document.body.appendChild(el);
        requestAnimationFrame(() => el.classList.add("dsh-recall-toast-in"));
        const timer = setTimeout(dismiss2, 7e3);
        let dismissed = false;
      } catch (e) {
      }
    }
    function showNotice(kind, text2) {
      if (noticeShown.has(kind)) return;
      noticeShown.add(kind);
      mountToast(text2);
    }
    const toastLastShown = /* @__PURE__ */ new Map();
    function showThrottledToast(text2) {
      const key = String(text2).slice(0, 80);
      const now = Date.now();
      if (now - (toastLastShown.get(key) || 0) < 10 * 60 * 1e3) return;
      if (toastLastShown.size > 50) toastLastShown.clear();
      toastLastShown.set(key, now);
      mountToast(text2);
    }
    const pluginConfig = { refillDraft: true, archiveOriginal: true, editSubmitsImmediately: true };
    const initMap = /* @__PURE__ */ new Map();
    function ensureInit(sessionId) {
      if (!sessionId) return Promise.resolve();
      const cached = initMap.get(sessionId);
      if (cached) return cached;
      const done = api("init", { sessionId }).then((res) => {
        if (res && res.config && typeof res.config === "object") {
          const cfg = res.config;
          if (typeof cfg.refillDraft === "boolean") pluginConfig.refillDraft = cfg.refillDraft;
          if (typeof cfg.archiveOriginal === "boolean") pluginConfig.archiveOriginal = cfg.archiveOriginal;
          if (typeof cfg.editSubmitsImmediately === "boolean") pluginConfig.editSubmitsImmediately = cfg.editSubmitsImmediately;
          setLocalePref(cfg.locale);
        }
        const notice = res && res.notice;
        if (notice && notice.unsupported) {
          showNotice("unsupported", t("notice.unsupported"));
        }
        if (notice && notice.gitMissing) {
          showNotice("git", t("notice.gitMissing"));
        }
        if (notice && notice.homeFallback) {
          showNotice("home", t("notice.homeFallback"));
        }
        if (notice && typeof notice.buildRootArtifactSeg === "string" && notice.buildRootArtifactSeg) {
          showNotice("buildRoot", t("notice.buildRoot", { seg: notice.buildRootArtifactSeg }));
        } else if (notice && notice.buildRootNotice) {
          showNotice("buildRoot", String(notice.buildRootNotice).slice(0, 140));
        }
      }).catch(() => {
        initMap.delete(sessionId);
      });
      initMap.set(sessionId, done);
      return done;
    }
    function writeClipboard(text2) {
      try {
        if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          return navigator.clipboard.writeText(text2).then(() => true, () => false);
        }
      } catch (e) {
      }
      try {
        if (typeof document !== "undefined" && typeof document.execCommand === "function") {
          const el = document.createElement("textarea");
          el.value = text2;
          el.setAttribute("readonly", "");
          el.style.position = "fixed";
          el.style.left = "-9999px";
          document.body.appendChild(el);
          el.select();
          try {
            return Promise.resolve(document.execCommand("copy"));
          } finally {
            el.remove();
          }
        }
      } catch (e) {
      }
      return Promise.resolve(false);
    }
    return { api, messageFor, showNotice, showThrottledToast, ensureInit, clockText, writeClipboard, sizeText, bytesToMb, buildTree, t, setLocalePref, pluginConfig };
  }

  // src/client/log.ts
  function debugFlag() {
    try {
      return String(localStorage.getItem("dsh-recall.debug") || "");
    } catch (error) {
      return "";
    }
  }
  function debugEnabled(ns) {
    const raw = debugFlag();
    if (!raw) return false;
    for (const part of raw.split(",")) {
      const t = part.trim();
      if (t === "*" || t === ns) return true;
    }
    return false;
  }
  function createLogger(ns) {
    const prefix = "[dsh-recall:" + ns + "]";
    return {
      error: (...args) => {
        console.error(prefix, ...args);
      },
      warn: (...args) => {
        console.warn(prefix, ...args);
      },
      info: (...args) => {
        if (debugEnabled(ns)) console.info(prefix, ...args);
      },
      debug: (...args) => {
        if (debugEnabled(ns)) console.debug(prefix, ...args);
      }
    };
  }
  var appLog = createLogger("app");
  var recallNodeLog = createLogger("recall-node");

  // src/client/user-content.ts
  var USER_CONTENT_FACTORY = "conversation.chat.user.content";
  function projectUserContent(blocks) {
    const texts = [];
    const attachments = [];
    const extraBlocks = [];
    for (const block of blocks) {
      const b = block;
      if (b && b.type === "text" && typeof b.text === "string") texts.push(b.text);
      else if (b && b.type === "image" && b.attachment !== void 0) attachments.push({ type: "image", image: { attachment: b.attachment } });
      else if (b && b.type === "file" && b.attachment !== void 0) attachments.push({ type: "file", file: b.attachment });
      else extraBlocks.push(block);
    }
    return { text: texts.join(""), attachments, extraBlocks };
  }
  function userContentFacts(referenceLabels, skillNames) {
    const facts = {};
    if (referenceLabels !== void 0) facts.sessionLabels = referenceLabels;
    if (skillNames !== void 0) facts.skillNames = skillNames;
    return facts;
  }
  function resolveUserContentFace(props) {
    if (typeof props.renderMessageImages === "function") return "legacy";
    if (typeof props.renderFactorySlot === "function" && typeof props.loadImage === "function") return "factory";
    return "legacy";
  }
  function renderOfficialUserContent(renderFactorySlot, blocks, data, loadImage, interactive) {
    if (typeof renderFactorySlot !== "function") return { ok: false };
    const projected = projectUserContent(blocks);
    const content = {
      text: projected.text,
      attachments: projected.attachments,
      extraBlocks: projected.extraBlocks
    };
    if (data.referenceLabels !== void 0) content.referenceLabels = data.referenceLabels;
    try {
      const render = renderFactorySlot;
      const node = render(USER_CONTENT_FACTORY, {
        content,
        loadImage,
        facts: userContentFacts(data.referenceLabels, data.skillNames),
        interactive
      });
      if (node === null || node === void 0 || node === false) return { ok: false };
      return { ok: true, node };
    } catch (error) {
      return { ok: false, error };
    }
  }

  // src/client/edit-node.ts
  function buildEditFlow(React, t) {
    function EditIcon() {
      return React.createElement(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
        React.createElement("path", { d: "M10.6 2.9 13.1 5.4 5.8 12.7 3 13.4l.7-2.8 6.9-7.7z" }),
        React.createElement("path", { d: "M9.4 4.1 11.9 6.6" })
      );
    }
    function EditPanel(props) {
      const stage = props.stage;
      const text2 = stage.stage === "editing" || stage.stage === "error" ? stage.text : "";
      if (stage.stage === "idle") return null;
      const error = stage.stage === "error" ? stage.message : "";
      const busy = stage.stage === "submitting";
      const empty = text2.trim() === "" && props.attachments.length === 0;
      const intake = (list) => {
        if (!list) return;
        const files = [];
        for (const file of Array.from(list)) files.push(file);
        if (files.length) props.onAddFiles(files);
      };
      return React.createElement(
        "div",
        {
          className: "dsh-recall-edit dsh-recall-composer",
          onPaste: (event) => {
            const files = event.clipboardData ? event.clipboardData.files : null;
            if (!files || files.length === 0) return;
            event.preventDefault();
            intake(files);
          },
          onDragOver: (event) => {
            if (event.dataTransfer && Array.from(event.dataTransfer.types).indexOf("Files") >= 0) event.preventDefault();
          },
          onDrop: (event) => {
            const files = event.dataTransfer ? event.dataTransfer.files : null;
            if (!files || files.length === 0) return;
            event.preventDefault();
            intake(files);
          }
        },
        React.createElement("textarea", {
          className: "dsh-recall-edit-area",
          value: text2,
          // 行数按内容估算（这里不能挂 hooks：EditPanel 是以普通函数被父组件
          // 调用的，hook 会记到父组件身上导致数量不一致）
          rows: Math.min(8, Math.max(2, text2.split("\n").length + 1)),
          autoFocus: true,
          disabled: busy,
          placeholder: t("edit.placeholder"),
          "aria-label": t("edit.placeholder"),
          onChange: (e) => props.onChange(e.target.value),
          // Enter 发送、Shift+Enter 换行：与官方 composer 同一套键盘语义；输入法
          // 组合期间的 Enter 是在选词，必须放行
          onKeyDown: (e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            if (e.nativeEvent && e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (!empty && !busy) props.onSubmit();
          }
        }),
        props.attachments.length > 0 ? React.createElement(
          "div",
          { className: "dsh-recall-composer-attachments" },
          props.attachments.map((item) => item.previewUrl !== void 0 ? React.createElement(
            "span",
            { className: "dsh-recall-composer-attach dsh-recall-composer-attach-image", key: item.key },
            React.createElement("img", { className: "dsh-recall-composer-thumb", src: item.previewUrl, alt: item.name, title: item.name }),
            React.createElement("button", {
              type: "button",
              className: "dsh-recall-composer-attach-x dsh-recall-composer-attach-x-badge",
              "aria-label": t("edit.attachment.remove", { name: item.name }),
              onClick: () => props.onRemoveAttachment(item.key)
            }, "\xD7")
          ) : React.createElement(
            "span",
            { className: "dsh-recall-composer-attach", key: item.key },
            React.createElement("span", { className: "dsh-recall-composer-attach-name", title: item.name }, item.name),
            React.createElement("button", {
              type: "button",
              className: "dsh-recall-composer-attach-x",
              "aria-label": t("edit.attachment.remove", { name: item.name }),
              onClick: () => props.onRemoveAttachment(item.key)
            }, "\xD7")
          ))
        ) : null,
        error !== "" ? React.createElement("div", { className: "dsh-recall-edit-error", role: "alert" }, error) : null,
        React.createElement(
          "div",
          { className: "dsh-recall-composer-foot" },
          // label 包住隐藏的 file input：原生点击即开选择框，不需要 ref 与命令式
          // 点击；input 用视觉隐藏而不是 display:none，键盘仍能 Tab 到它
          React.createElement(
            "label",
            {
              className: "dsh-recall-composer-add",
              title: t("edit.attachment.add"),
              "aria-label": t("edit.attachment.add"),
              "aria-disabled": busy ? "true" : void 0
            },
            React.createElement(
              "svg",
              { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", "aria-hidden": true },
              React.createElement("path", { d: "M8 3.2v9.6M3.2 8h9.6" })
            ),
            React.createElement("input", {
              className: "dsh-recall-composer-file",
              type: "file",
              multiple: true,
              disabled: busy,
              onChange: (e) => {
                intake(e.target.files);
              }
            })
          ),
          props.meta.permission !== "" ? React.createElement("span", { className: "dsh-recall-composer-chip" }, props.meta.permission) : null,
          // 模型：目录服务可用时是下拉（选择走官方 selectModel，同步到底部 chip），
          // 不可用则退回只读 chip（值抄自底部输入框）
          props.modelLabel !== "" ? React.createElement(
            "span",
            { className: "dsh-recall-composer-model" },
            React.createElement(
              "button",
              {
                type: "button",
                // 与官方 trigger 同构：模型名 + 淡色档位 + 尾部 chevron（展开时翻转）
                className: "dsh-recall-composer-chip dsh-recall-composer-chip-btn" + (props.modelOpen ? " is-open" : ""),
                "aria-haspopup": "menu",
                "aria-expanded": props.modelOpen,
                disabled: props.modelBusy,
                onClick: props.onToggleModel
              },
              React.createElement("span", { className: "dsh-recall-composer-chip-name" }, props.modelLabel),
              React.createElement(
                "span",
                { className: "dsh-recall-composer-chip-effort" },
                props.modelEffort !== "" ? props.modelEffort : t("edit.model.providerDefault")
              ),
              React.createElement(
                "span",
                { className: "dsh-recall-composer-chip-chevron" },
                React.createElement(
                  "svg",
                  { width: 12, height: 12, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
                  React.createElement("path", { d: "M4 6.2l4 4 4-4", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" })
                )
              )
            ),
            props.modelNodes
          ) : props.meta.model !== "" ? React.createElement("span", { className: "dsh-recall-composer-chip" }, props.meta.model) : null,
          // 仅做「这是编辑而非新消息」的说明；细节（新建会话/归档）由提示承担
          React.createElement(
            "span",
            { className: "dsh-recall-composer-hint" },
            busy ? t("edit.submitting") : error !== "" ? t("edit.official.retry") : t("edit.official.hint")
          ),
          React.createElement("button", {
            type: "button",
            className: "dsh-recall-composer-send",
            "aria-label": busy ? t("edit.submitting") : error !== "" ? t("edit.retry") : props.submitLabel,
            title: busy ? t("edit.submitting") : error !== "" ? t("edit.retry") : props.submitLabel,
            disabled: busy || error === "" && empty,
            onClick: props.onSubmit
          }, busy ? React.createElement("span", { className: "dsh-recall-composer-dot" }) : React.createElement(
            "svg",
            { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true },
            React.createElement("path", {
              d: "M8.31 0.98c.36.07.67.22.95.45.22.18.47.43.72.68l4.73 4.73-1.42 1.41L9 3.96v11.08H7V3.96L2.71 8.25 1.29 6.83l4.73-4.73c.25-.25.49-.49.72-.68.24-.19.55-.39.95-.45.21-.03.41-.02.62.01z",
              fill: "currentColor"
            })
          ))
        )
      );
    }
    return { EditIcon, EditPanel };
  }

  // src/client/edit-dismiss.ts
  function installEditDismiss(doc, opts) {
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (opts.popupSelector !== "" && doc.querySelector(opts.popupSelector) !== null) return;
      event.preventDefault();
      event.stopPropagation();
      opts.onDismiss();
    };
    doc.addEventListener("keydown", onKeyDown, true);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      doc.removeEventListener("keydown", onKeyDown, true);
    };
  }

  // src/client/model-picker.ts
  var text = (value) => typeof value === "string" ? value : "";
  function buildModelPicker(ctx, sessionId) {
    if (!sessionId) return null;
    let directory = null;
    const resolve = () => {
      if (directory !== null) return directory;
      try {
        const resolver = ctx.get("modelDirectories");
        if (!resolver || typeof resolver.directoryFor !== "function") return null;
        directory = resolver.directoryFor(sessionId) || null;
        return directory;
      } catch (e) {
        return null;
      }
    };
    const readState = () => {
      const dir = resolve();
      const snapshot = dir && dir.store && typeof dir.store.getSnapshot === "function" ? dir.store.getSnapshot() : null;
      return snapshot && typeof snapshot === "object" ? snapshot : null;
    };
    return {
      async load() {
        const dir = resolve();
        if (!dir) return null;
        if (typeof dir.load === "function") {
          try {
            await dir.load();
          } catch (e) {
          }
        }
        const state = readState();
        if (!state) return null;
        const groups = [];
        for (const group of Array.isArray(state.groups) ? state.groups : []) {
          const provider = text(group && group.id);
          if (provider === "") continue;
          const options = [];
          for (const model of Array.isArray(group.models) ? group.models : []) {
            const modelId = text(model && model.id);
            if (modelId === "") continue;
            const efforts = [];
            for (const level of model.reasoning && Array.isArray(model.reasoning.efforts) ? model.reasoning.efforts : []) {
              const id = text(level && level.id);
              if (id !== "") efforts.push({ id, name: text(level.name) || id });
            }
            const defaultEffort = text(model.reasoning && model.reasoning.defaultEffort);
            options.push({
              key: provider + "/" + modelId,
              provider,
              model: modelId,
              label: text(model.name) || modelId,
              efforts,
              ...defaultEffort === "" ? {} : { defaultEffort }
            });
          }
          groups.push({ id: provider, name: text(group.name) || provider, options });
        }
        const current = state.current || null;
        const currentProvider = text(current && current.provider);
        const currentModel = text(current && current.model);
        const flat = groups.reduce((all, group) => all.concat(group.options), []);
        const active = flat.find((option) => option.provider === currentProvider && option.model === currentModel);
        const effortId = text(current && current.reasoningEffort) || active && active.defaultEffort || "";
        const effortHit = active ? active.efforts.find((level) => level.id === effortId) : void 0;
        return {
          label: active ? active.label : currentModel,
          activeKey: active ? active.key : "",
          effortLabel: effortHit ? effortHit.name : "",
          activeEffortId: effortId,
          groups
        };
      },
      async select(option, effortId) {
        const dir = resolve();
        if (!dir || typeof dir.select !== "function") return "model selection is unavailable";
        try {
          const result = await dir.select({
            provider: option.provider,
            model: option.model,
            ...effortId === "" ? {} : { reasoningEffort: effortId }
          });
          if (result && result.ok === false) {
            const error = result.error || {};
            return text(error.message) || text(error.code) || "model selection failed";
          }
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      }
    };
  }

  // src/client/model-menu.ts
  function renderModelMenu(React, t, props) {
    const chevron = () => React.createElement("svg", {
      width: 14,
      height: 14,
      viewBox: "0 0 16 16",
      fill: "none",
      "aria-hidden": true,
      strokeWidth: 1
    }, React.createElement("path", { d: "M6 12L9.29289 8.70711C9.68342 8.31658 9.68342 7.68342 9.29289 7.29289L6 4", stroke: "currentColor" }));
    const check = () => React.createElement(
      "span",
      { className: "dsh-recall-menu-check" },
      React.createElement(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
        React.createElement("path", { d: "M3.2 8.4l3.1 3.1 6.5-6.9", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" })
      )
    );
    const cell = (label, value, onClick) => React.createElement(
      "button",
      {
        type: "button",
        role: "menuitem",
        className: "dsh-recall-menu-cell",
        onClick
      },
      React.createElement("span", { className: "dsh-recall-menu-cell-label" }, label),
      React.createElement("span", { className: "dsh-recall-menu-cell-value" }, value),
      React.createElement("span", { className: "dsh-recall-menu-cell-chevron" }, chevron())
    );
    if (props.pane === "main") {
      return React.createElement(
        "div",
        { className: "dsh-recall-menu", role: "menu", "aria-label": t("edit.model.menu") },
        cell(t("edit.model.label"), props.modelLabel, () => props.onPane("list")),
        cell(t("edit.model.effort"), props.effortLabel !== "" ? props.effortLabel : t("edit.model.providerDefault"), () => props.onPane("effort"))
      );
    }
    if (props.pane === "effort") {
      const option = props.activeOption;
      const levels = [];
      if (option === null || option.defaultEffort === void 0) levels.push({ id: "", name: t("edit.model.providerDefault") });
      for (const level of option ? option.efforts : []) levels.push(level);
      return React.createElement(
        "div",
        { className: "dsh-recall-menu", role: "menu", "aria-label": t("edit.model.effort") },
        levels.length === 0 ? React.createElement("div", { className: "dsh-recall-menu-empty" }, t("edit.model.noLevels")) : levels.map((level) => React.createElement(
          "button",
          {
            key: "effort-" + level.id,
            type: "button",
            role: "menuitemradio",
            "aria-checked": level.id === props.activeEffortId,
            disabled: props.busy,
            className: "dsh-recall-menu-option" + (level.id === props.activeEffortId ? " dsh-recall-menu-option-active" : ""),
            onClick: () => props.onPickEffort(level.id)
          },
          React.createElement("span", { className: "dsh-recall-menu-name" }, level.name),
          level.id === props.activeEffortId ? check() : React.createElement("span", { className: "dsh-recall-menu-check" })
        ))
      );
    }
    const query = props.query.trim().toLowerCase();
    const groups = props.groups.map((group) => ({
      id: group.id,
      name: group.name,
      options: query === "" ? group.options : group.options.filter((option) => option.label.toLowerCase().indexOf(query) >= 0)
    })).filter((group) => group.options.length > 0);
    const total = groups.reduce((count, group) => count + group.options.length, 0);
    return React.createElement(
      "div",
      { className: "dsh-recall-menu", role: "group", "aria-label": t("edit.model.menu") },
      // 搜索：官方在候选超过 4 条时才显示，这里同样按总数决定
      props.groups.reduce((count, group) => count + group.options.length, 0) > 4 ? React.createElement(
        "div",
        { className: "dsh-recall-menu-search-row" },
        React.createElement(
          "span",
          { className: "dsh-recall-menu-search" },
          React.createElement("input", {
            type: "text",
            role: "searchbox",
            value: props.query,
            placeholder: t("edit.model.search"),
            "aria-label": t("edit.model.search"),
            onChange: (e) => props.onQuery(e.target.value)
          })
        )
      ) : null,
      React.createElement(
        "div",
        { className: "dsh-recall-menu-groups", role: "menu", "aria-label": t("edit.model.label") },
        total === 0 ? React.createElement("div", { className: "dsh-recall-menu-empty" }, t("edit.model.empty")) : groups.map((group) => React.createElement(
          "section",
          { key: "group-" + group.id, className: "dsh-recall-menu-group" },
          React.createElement("div", { className: "dsh-recall-menu-heading" }, group.name),
          group.options.map((option) => React.createElement(
            "button",
            {
              key: option.key,
              type: "button",
              role: "menuitemradio",
              "aria-checked": option.key === props.activeKey,
              disabled: props.busy,
              title: option.label,
              className: "dsh-recall-menu-option" + (option.key === props.activeKey ? " dsh-recall-menu-option-active" : ""),
              onClick: () => props.onPick(option)
            },
            React.createElement("span", { className: "dsh-recall-menu-name" }, option.label),
            option.key === props.activeKey ? check() : React.createElement("span", { className: "dsh-recall-menu-check" })
          ))
        ))
      )
    );
  }

  // src/client/draft-fill.ts
  function defaultAttachmentName(mediaType, index) {
    const text2 = String(mediaType || "");
    const slash = text2.indexOf("/");
    const sub = (slash >= 0 ? text2.slice(slash + 1) : text2).replace(/[^a-z0-9.+-]/gi, "");
    return "attachment-" + String(index + 1) + "." + (sub || "bin");
  }
  function buildDraftFill(ctx) {
    function fillDraft(targetSessionId, draftText, attachmentFiles, opts) {
      if (!targetSessionId || !draftText && attachmentFiles === null) return;
      let attempts = 0;
      let attachStarted = false;
      let attachDone = attachmentFiles === null;
      let submitted = false;
      let shellRef = null;
      const submitIfReady = () => {
        if (!opts || opts.submit !== true || submitted || !shellRef) return;
        submitted = true;
        submitShell(shellRef, draftText);
      };
      const attempt = () => {
        let textDone = draftText === "";
        try {
          const conversation = ctx.get("conversation");
          if (conversation && conversation.input && typeof conversation.input.shell === "function") {
            const shell = conversation.input.shell(targetSessionId);
            if (shell) {
              shellRef = shell;
              if (!textDone) {
                if (shell.actions && typeof shell.actions.setDraft === "function") {
                  shell.actions.setDraft(draftText);
                  textDone = true;
                } else if (typeof shell.setDraft === "function") {
                  shell.setDraft(draftText);
                  textDone = true;
                }
              }
              if (!attachStarted && attachmentFiles !== null) {
                attachStarted = startAttachDrafts(conversation, shell, targetSessionId, attachmentFiles, () => {
                  attachDone = true;
                  submitIfReady();
                }, opts === void 0 || opts.submit !== true);
              }
            }
          }
        } catch (e) {
        }
        if (textDone && attachDone) {
          submitIfReady();
          return;
        }
        if ((!textDone || !attachStarted) && attempts++ < 8) setTimeout(attempt, 150);
      };
      attempt();
    }
    function submitShell(shell, expected) {
      const actions = shell.actions;
      const submit = actions && actions.submit;
      if (typeof submit !== "function") {
        recallNodeLog.warn("\u8F93\u5165\u533A\u672A\u66B4\u9732 submit\uFF0C\u7F16\u8F91\u540E\u7684\u6D88\u606F\u672A\u80FD\u81EA\u52A8\u53D1\u51FA");
        return;
      }
      let tries = 0;
      const tick = () => {
        const snap = shell.snapshot;
        const draft = snap && typeof snap.draft === "string" ? snap.draft : null;
        if (draft !== null && draft !== expected && tries++ < 6) {
          setTimeout(tick, 50);
          return;
        }
        try {
          submit.call(actions);
        } catch (error) {
          recallNodeLog.warn("send after edit failed:", error);
        }
      };
      setTimeout(tick, 0);
    }
    function startAttachDrafts(conversation, shell, sessionId, files, onDone, eagerUpload = true) {
      if (typeof conversation.createDrafts !== "function") return false;
      const actions = shell.actions;
      let add = null;
      if (actions && typeof actions.addAttachments === "function") add = (ids) => actions.addAttachments ? actions.addAttachments(ids) : false;
      else if (typeof shell.addAttachments === "function") add = (ids) => shell.addAttachments ? shell.addAttachments(ids) : false;
      if (add === null) return false;
      (async () => {
        try {
          let list = [];
          try {
            list = await files;
          } catch (e) {
            return;
          }
          if (!Array.isArray(list) || list.length === 0) return;
          try {
            let drafts;
            try {
              drafts = conversation.createDrafts ? conversation.createDrafts(sessionId, list, eagerUpload) : [];
            } catch (e) {
              drafts = conversation.createDrafts ? conversation.createDrafts(sessionId, list) : [];
            }
            const descriptors = Array.isArray(drafts) ? drafts : [];
            const ids = descriptors.map((draft) => draft && draft.id).filter((id) => typeof id === "string" && id !== "");
            if (ids.length === 0) return;
            const accepted = add(ids);
            if (accepted === false && typeof conversation.releaseDraftAttachments === "function") conversation.releaseDraftAttachments(descriptors);
          } catch (e) {
          }
        } finally {
          if (onDone) onDone();
        }
      })();
      return true;
    }
    let attachmentShape = null;
    async function readAttachmentBytes(read, ref) {
      const refArg = ref.attachment && typeof ref.attachment === "object" ? ref.attachment : null;
      const idArg = typeof ref.attachmentId === "string" && ref.attachmentId !== "" ? ref.attachmentId : null;
      const attempts = [];
      if (attachmentShape === "id") {
        if (idArg !== null) attempts.push({ shape: "id", arg: idArg });
        if (refArg !== null) attempts.push({ shape: "ref", arg: refArg });
      } else {
        if (refArg !== null) attempts.push({ shape: "ref", arg: refArg });
        if (idArg !== null) attempts.push({ shape: "id", arg: idArg });
      }
      for (const attempt of attempts) {
        try {
          const result = await read(attempt.arg);
          if (result && result.ok === true && result.value && result.value.data !== void 0 && result.value.data !== null) {
            attachmentShape = attempt.shape;
            return { attachment: result.value.attachment, data: result.value.data };
          }
        } catch (e) {
        }
      }
      return null;
    }
    function preloadAttachmentFiles(sourceSessionId, refs) {
      return (async () => {
        const sessions = ctx.sessions;
        const binding = sessions && typeof sessions.binding === "function" ? sessions.binding(sourceSessionId) : void 0;
        const session = binding && binding.session;
        if (!session || typeof session.readAttachment !== "function") return [];
        const read = session.readAttachment.bind(session);
        const out = [];
        for (const ref of refs) {
          try {
            const value = await readAttachmentBytes(read, ref);
            if (!value) continue;
            const raw = value.data;
            const bytes = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
            const meta = value.attachment;
            const mediaType = meta && typeof meta.mediaType === "string" && meta.mediaType !== "" ? meta.mediaType : "application/octet-stream";
            const name = ref.name || (meta && typeof meta.name === "string" && meta.name !== "" ? meta.name : defaultAttachmentName(mediaType, out.length));
            const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            out.push(new File([buffer], name, { type: mediaType }));
          } catch (e) {
          }
        }
        return out;
      })();
    }
    return { fillDraft, preloadAttachmentFiles };
  }

  // src/client/version-tree.ts
  var KEY_PREFIX = "dsh-recall:versions:";
  var activeSession = { id: "" };
  function storage() {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch (e) {
      return null;
    }
  }
  function readIds(rootId) {
    const store = storage();
    if (!store || !rootId) return [];
    try {
      const raw = store.getItem(KEY_PREFIX + rootId);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id !== "") : [];
    } catch (e) {
      return [];
    }
  }
  function writeIds(rootId, ids) {
    const store = storage();
    if (!store || !rootId) return;
    try {
      store.setItem(KEY_PREFIX + rootId, JSON.stringify(ids));
    } catch (e) {
    }
  }
  function findRootOf(sessionId) {
    const store = storage();
    if (!store || !sessionId) return null;
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      const rootId = key.slice(KEY_PREFIX.length);
      if (readIds(rootId).indexOf(sessionId) >= 0) return rootId;
    }
    return null;
  }
  function familyOf(sessionId) {
    const id = String(sessionId || "");
    if (!id) return null;
    const rootId = findRootOf(id);
    if (!rootId) return null;
    const ids = readIds(rootId);
    const index = ids.indexOf(id);
    if (index < 0 || ids.length < 2) return null;
    return { rootId, ids, index };
  }
  function recordVersion(parentId, childId) {
    const parent = String(parentId || "");
    const child = String(childId || "");
    if (!parent || !child || parent === child) return;
    const rootId = findRootOf(parent) || parent;
    const ids = readIds(rootId);
    const next = ids.length === 0 ? [parent] : ids.slice();
    if (next.indexOf(child) >= 0) return;
    next.push(child);
    writeIds(rootId, next);
  }

  // src/client/message-blocks.ts
  function attachmentRefsFromBlocks(blocks) {
    const refs = [];
    for (const block of blocks) {
      if (!block || block.type !== "image" && block.type !== "file") continue;
      const ref = block.attachment;
      if (!ref || typeof ref.attachmentId !== "string" || ref.attachmentId === "") continue;
      const entry = { attachmentId: ref.attachmentId, kind: block.type, attachment: block.attachment };
      if (typeof ref.name === "string" && ref.name !== "") entry.name = ref.name;
      refs.push(entry);
    }
    return refs;
  }
  function projectMessageBlocks(blocks) {
    return {
      text: blocks.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text).join(""),
      // 官方契约：images 传 image 块数组（{attachment}），官方内部取
      // image.attachment.attachmentId —— 不是裸 attachment 对象
      images: blocks.filter((b) => b && b.type === "image" && b.attachment).map((b) => ({ attachment: b.attachment })),
      // file 块（文档/表格等非图片附件）：官方渲染成文件卡片（图标 + 文件名 +
      // 扩展名/大小）——自绘路径必须复刻，否则它落进 rest 的 JSON 兜底
      files: blocks.filter((b) => b && b.type === "file"),
      rest: blocks.filter((b) => !b || !(b.type === "text" && typeof b.text === "string") && !(b.type === "image" && b.attachment) && b.type !== "file")
    };
  }
  function fileExtOf(name) {
    const dot = name.lastIndexOf(".");
    const raw = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : "";
    const ext = raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
    return ext ? ext.slice(0, 4) : "FILE";
  }
  function fileCardSizeText(bytes) {
    const n = typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 ? bytes : NaN;
    if (Number.isNaN(n)) return "";
    if (n < 1024) return String(Math.round(n)) + "B";
    if (n < 1048576) return (n / 1024).toFixed(1) + "KB";
    if (n < 1073741824) return (n / 1048576).toFixed(1) + "MB";
    return (n / 1073741824).toFixed(1) + "GB";
  }
  function fileCardInfo(block, t = zhTranslate) {
    if (!block || block.type !== "file") return null;
    const ref = block.attachment;
    const name = ref && typeof ref === "object" && typeof ref.name === "string" && ref.name !== "" ? ref.name : t("file.unnamed");
    return { name, ext: fileExtOf(name), size: fileCardSizeText(ref && typeof ref === "object" ? ref.bytes : void 0) };
  }

  // src/client/diff-kinds.ts
  var KIND_INFO = {
    modified: { labelKey: "kind.modified", cls: "modified" },
    restored: { labelKey: "kind.restored", cls: "restored" },
    added: { labelKey: "kind.added", cls: "added" }
  };
  function isChangeKind(kind) {
    return typeof kind === "string" && Object.prototype.hasOwnProperty.call(KIND_INFO, kind);
  }
  function summaryText(counts, t = zhTranslate) {
    const parts = [];
    for (const kind of Object.keys(KIND_INFO)) {
      if (counts[kind] > 0) parts.push(t(KIND_INFO[kind].labelKey) + " " + counts[kind]);
    }
    return parts.join(" \xB7 ");
  }

  // src/client/recall-node.ts
  function buildRecallNode(React, util, ctx, sessionsSvc, workspacesSvc, uiWorkspaceSvc) {
    const { api, ensureInit, showThrottledToast, writeClipboard, clockText: clockText2, pluginConfig, messageFor, t } = util;
    const { EditIcon, EditPanel } = buildEditFlow(React, t);
    const { fillDraft, preloadAttachmentFiles } = buildDraftFill(ctx);
    function CopyIcon() {
      return React.createElement(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, "aria-hidden": true },
        React.createElement("rect", { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5 }),
        React.createElement("path", { d: "M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" })
      );
    }
    function CheckIcon() {
      return React.createElement(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
        React.createElement("path", { d: "m3 8.5 3.2 3.2L13 5" })
      );
    }
    function UndoIcon() {
      return React.createElement(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
        React.createElement(
          "g",
          { transform: "translate(0 -1.1)" },
          React.createElement("path", { d: "M6.3 4.7 3.5 7.5l2.8 2.8" }),
          React.createElement("path", { d: "M4.5 7.5h5a3 3 0 0 1 0 6H6.3" })
        )
      );
    }
    function recallPanel(recall, closePanel, executeRecall, scope, onScopeChange) {
      if (recall.stage === "loading") {
        return React.createElement(
          "div",
          { className: "dsh-recall-panel" },
          React.createElement("div", { className: "dsh-recall-panel-title" }, t("recall.loading"))
        );
      }
      if (recall.stage === "error") {
        return React.createElement(
          "div",
          { className: "dsh-recall-panel" },
          React.createElement("div", { className: "dsh-recall-panel-title" }, t("recall.error.title")),
          React.createElement("div", { className: "dsh-recall-panel-note" }, recall.message || ""),
          React.createElement(
            "div",
            { className: "dsh-recall-panel-actions" },
            React.createElement("button", { type: "button", className: "dsh-recall-btn", onClick: closePanel }, t("common.close"))
          )
        );
      }
      if (recall.stage === "confirm") {
        const changes = recall.changes || [];
        const total = typeof recall.total === "number" ? recall.total : changes.length;
        let counts = recall.counts || null;
        if (!counts && !recall.truncated) {
          counts = { modified: 0, restored: 0, added: 0 };
          for (const c of changes) {
            if (c && isChangeKind(c.kind)) counts[c.kind]++;
          }
        }
        const rows = changes.map((c, i) => {
          const info = KIND_INFO[c.kind];
          return React.createElement(
            "div",
            { className: "dsh-recall-file", key: i },
            React.createElement("span", { className: "dsh-recall-badge dsh-recall-badge-" + (info ? info.cls : "") }, info ? t(info.labelKey) : c.kind || ""),
            React.createElement("span", { className: "dsh-recall-rel" }, c.rel || "")
          );
        });
        const canRevertChat = typeof recall.cutSeq === "number";
        const noFiles = recall.files === false;
        const sessionOnly = noFiles || canRevertChat && scope === "session-only";
        const noEffect = noFiles && !canRevertChat;
        if (recall.truncated) {
          rows.push(React.createElement(
            "div",
            { className: "dsh-recall-panel-note", key: "truncated" },
            t(sessionOnly ? "recall.truncated.chat" : "recall.truncated.files", { shown: changes.length, total })
          ));
        }
        const summary = counts ? summaryText(counts, t) : "";
        const rollbackLead = recall.time ? t("recall.confirm.rollbackAt", { time: clockText2(recall.time) }) : t("recall.confirm.rollbackNoTime");
        const filesLead = t("recall.confirm.files", {
          total,
          summary: summary ? t("common.paren", { text: summary }) : ""
        });
        return React.createElement(
          "div",
          { className: "dsh-recall-panel" },
          React.createElement("div", { className: "dsh-recall-panel-title" }, t("recall.confirm.title")),
          sessionOnly ? (
            // session-only：零文件改动即无不可逆操作缺口——安全快照预告随之隐藏
            //（不打安全快照），主说明换成模式语义；仅消息条目另给专属说明
            React.createElement(
              "div",
              { className: "dsh-recall-panel-note" },
              t(noFiles ? "recall.confirm.messageOnly" : "recall.confirm.sessionOnly")
            )
          ) : React.createElement(
            "div",
            { className: "dsh-recall-panel-note" },
            rollbackLead + filesLead
          ),
          sessionOnly ? null : React.createElement(
            "div",
            { className: "dsh-recall-panel-note" },
            t(canRevertChat ? "recall.confirm.chatBoth" : "recall.confirm.chatFirst")
          ),
          sessionOnly && changes.length > 0 ? (
            // 文件清单保留展示但降级为参考语义：清单照常算（Host preview 链路
            // 不分叉），只是告知用户所选模式不会真的改这些文件
            React.createElement(
              "div",
              { className: "dsh-recall-panel-note", key: "ref-note" },
              t("recall.confirm.refNote")
            )
          ) : null,
          changes.length > 0 ? React.createElement("div", { className: "dsh-recall-list" }, ...rows) : null,
          canRevertChat && !noFiles ? (
            // 模式二选一（原生 radio，键盘方向键可达）：临场选择不设全局配置项；
            // 默认 both 与现状一致，面板每次打开都复位到默认起点。仅消息条目
            // 没有可选项（没有文件树），整组隐藏
            React.createElement(
              "div",
              { className: "dsh-recall-scope", role: "radiogroup", "aria-label": t("recall.scope.aria") },
              React.createElement(
                "label",
                { className: "dsh-recall-scope-item" },
                React.createElement("input", { type: "radio", name: "dsh-recall-scope", checked: scope === "both", onChange: () => onScopeChange("both") }),
                React.createElement("span", { className: "dsh-recall-scope-label" }, t("recall.scope.both"))
              ),
              React.createElement(
                "label",
                { className: "dsh-recall-scope-item" },
                React.createElement("input", { type: "radio", name: "dsh-recall-scope", checked: scope === "session-only", onChange: () => onScopeChange("session-only") }),
                React.createElement("span", { className: "dsh-recall-scope-label" }, t("recall.scope.sessionOnly"))
              )
            )
          ) : null,
          noEffect ? (
            // 仅消息 + 首条消息：文件无快照、对话无更早切点，提交只会空转
            React.createElement("div", { className: "dsh-recall-panel-note", key: "no-effect" }, t("recall.confirm.noEffect"))
          ) : null,
          React.createElement(
            "div",
            { className: "dsh-recall-panel-actions" },
            React.createElement("button", { type: "button", className: "dsh-recall-btn", onClick: closePanel }, t("common.cancel")),
            React.createElement("button", { type: "button", className: "dsh-recall-btn dsh-recall-btn-danger", disabled: noEffect, onClick: executeRecall }, t(sessionOnly ? "recall.confirm.submit.sessionOnly" : "recall.confirm.submit.both"))
          )
        );
      }
      if (recall.stage === "executing") {
        const active = recall.scope || scope;
        return React.createElement(
          "div",
          { className: "dsh-recall-panel" },
          React.createElement("div", { className: "dsh-recall-panel-title" }, t(active === "session-only" ? "recall.executing.sessionOnly" : "recall.executing.both"))
        );
      }
      if (recall.stage === "done") {
        const active = recall.scope || scope;
        return React.createElement(
          "div",
          { className: "dsh-recall-panel" },
          React.createElement("div", { className: "dsh-recall-panel-title" }, t("recall.done.title")),
          React.createElement(
            "div",
            { className: "dsh-recall-panel-note" },
            active === "session-only" ? (
              // session-only 文案矩阵：文件侧零改动是确定事实，失败时也只描述对话侧
              recall.chatReverted ? t("recall.done.sessionOnly.ok") : t("recall.done.sessionOnly.fail", { error: recall.chatError || t("common.unknownReason") })
            ) : recall.chatReverted ? t("recall.done.both.ok") : t("recall.done.both.partial") + (recall.chatError ? t("recall.done.both.failChat", { error: recall.chatError }) : "")
          ),
          React.createElement(
            "div",
            { className: "dsh-recall-panel-actions" },
            React.createElement("button", { type: "button", className: "dsh-recall-btn", onClick: closePanel }, t("common.close"))
          )
        );
      }
      return null;
    }
    function removeStaleQueueItems(targetSessionId, itemIds) {
      if (!Array.isArray(itemIds) || itemIds.length === 0) return;
      const deadline = Date.now() + 5e3;
      const attempt = () => {
        try {
          const binding = sessionsSvc && typeof sessionsSvc.binding === "function" ? sessionsSvc.binding(targetSessionId) : null;
          const face = binding && binding.session;
          if (face && typeof face.updateQueue === "function") {
            for (const itemId of itemIds) {
              if (typeof itemId !== "string" || itemId === "") continue;
              face.updateQueue(itemId, { kind: "remove" }).catch(() => {
              });
            }
            return;
          }
        } catch (error) {
        }
        if (Date.now() >= deadline) {
          recallNodeLog.warn("\u6B8B\u7559\u6392\u961F\u6D88\u606F\u672A\u80FD\u81EA\u52A8\u6E05\u7406\uFF08\u4F1A\u8BDD\u9762\u672A\u5C31\u7EEA\uFF09\uFF1A", itemIds);
          showThrottledToast(t("toast.staleQueue"));
          return;
        }
        setTimeout(attempt, 250);
      };
      attempt();
    }
    function UserRecallNode(props) {
      const node = props && props.node;
      const renderMessageImages = props && props.renderMessageImages;
      const renderFactorySlot = props && props.renderFactorySlot;
      const loadImage = props && props.loadImage;
      const sessionId = props && props.sessionId;
      const data = node && node.data ? node.data : {};
      const messageId = node ? String(node.id || node.key || "") : "";
      const blocks = Array.isArray(data.content) ? data.content : [];
      const { text: text2, images: imageBlocks, files: fileBlocks, rest } = projectMessageBlocks(blocks);
      const attachmentRefs = attachmentRefsFromBlocks(blocks);
      activeSession.id = String(sessionId || "");
      const [copied, setCopied] = React.useState(false);
      const [hasSnapshot, setHasSnapshot] = React.useState(false);
      const [recall, setRecall] = React.useState({ stage: "idle" });
      const [scope, setScope] = React.useState("both");
      const [edit, setEdit] = React.useState({ stage: "idle" });
      const stackRef = React.useRef(null);
      const [editFiles, setEditFiles] = React.useState([]);
      const [droppedRefs, setDroppedRefs] = React.useState([]);
      const [refPreviews, setRefPreviews] = React.useState({});
      const fileUrlsRef = React.useRef(/* @__PURE__ */ new Map());
      const [editMeta, setEditMeta] = React.useState({ permission: "", model: "" });
      const [modelState, setModelState] = React.useState(null);
      const [modelOpen, setModelOpen] = React.useState(false);
      const [modelBusy, setModelBusy] = React.useState(false);
      const [modelPane, setModelPane] = React.useState("main");
      const [modelQuery, setModelQuery] = React.useState("");
      const pickerRef = React.useRef(null);
      React.useEffect(() => {
        let alive = true;
        let timer = null;
        let attempts = 0;
        const RETRY_WINDOW_MS = 5 * 60 * 1e3;
        const MAX_ATTEMPTS = 20;
        const RETRY_MS = 1e3;
        const msgTime = data && typeof data.time === "number" ? data.time : NaN;
        const recent = !isNaN(msgTime) && Date.now() - msgTime <= RETRY_WINDOW_MS;
        function schedule() {
          if (!alive || !messageId) return;
          attempts++;
          api("snapshot-info", { messageId, sessionId }).then((res) => {
            if (!alive) return;
            if (res && res.has) {
              if (recent && Array.isArray(res.skipped) && res.skipped.length) {
                const names = res.skipped.slice(0, 5).join(t("common.listSep")) + (res.skipped.length > 5 ? t("toast.skippedMore", { n: res.skipped.length }) : "");
                showThrottledToast(t("toast.skipped", { names }));
              }
              setHasSnapshot(true);
              return;
            }
            if (res && res.failed) {
              if (recent) showThrottledToast(t("toast.snapshotFailed", { error: String(res.error || t("common.unknownReason")).slice(0, 140) }));
              return;
            }
            if (res && (res.artifactSeg || res.notice)) {
              if (recent) {
                const text3 = res.artifactSeg ? t("notice.buildRoot", { seg: res.artifactSeg }) : String(res.notice).slice(0, 140);
                showThrottledToast(text3);
              }
              return;
            }
            if (recent && attempts < MAX_ATTEMPTS) timer = setTimeout(schedule, RETRY_MS);
          }).catch(() => {
            if (alive && recent && attempts < MAX_ATTEMPTS) timer = setTimeout(schedule, RETRY_MS);
          });
        }
        ensureInit(sessionId).then(() => {
          if (!messageId || !alive) return;
          schedule();
        }).catch(() => {
          if (alive && messageId) timer = setTimeout(schedule, RETRY_MS);
        });
        return () => {
          alive = false;
          if (timer !== null) clearTimeout(timer);
        };
      }, [messageId, sessionId]);
      const onCopy = () => {
        if (copied) return;
        writeClipboard(text2).then(() => {
          setCopied(true);
          const timer = ctx.timer;
          if (timer && typeof timer.timeout === "function") {
            timer.timeout(() => setCopied(false), 1200);
          } else {
            setTimeout(() => setCopied(false), 1200);
          }
        });
      };
      const readComposerMeta = () => {
        const empty = { permission: "", model: "" };
        if (typeof document === "undefined") return empty;
        const card = document.querySelector("[data-composer-card]");
        if (!card) return empty;
        const textOf = (slot) => {
          const el = card.querySelector('[data-slot="' + slot + '"]');
          if (!el) return "";
          const raw = typeof el.innerText === "string" ? el.innerText : el.textContent;
          return String(raw || "").replace(/\s+/g, " ").trim();
        };
        return { permission: textOf("conversation.input.permission"), model: textOf("conversation.input.model") };
      };
      const resolveImage = typeof loadImage === "function" ? loadImage : null;
      const revokePreview = (url) => {
        if (url.indexOf("blob:") !== 0) return;
        if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
      };
      const previewOfFile = (file) => {
        const cached = fileUrlsRef.current.get(file);
        if (cached !== void 0) return cached;
        if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "";
        const url = URL.createObjectURL(file);
        fileUrlsRef.current.set(file, url);
        return url;
      };
      const keptRefs = () => attachmentRefs.filter((ref) => droppedRefs.indexOf(ref.attachmentId) < 0);
      const editAttachments = () => {
        const items = [];
        let index = 0;
        for (const ref of keptRefs()) {
          const item = { key: "ref:" + ref.attachmentId, name: ref.name || defaultAttachmentName("application/octet-stream", index) };
          const preview = refPreviews[ref.attachmentId];
          if (ref.kind === "image" && typeof preview === "string" && preview !== "") item.previewUrl = preview;
          items.push(item);
          index++;
        }
        for (const [fileIndex, file] of editFiles.entries()) {
          const item = { key: "file:" + fileIndex, name: file.name || "attachment-" + (fileIndex + 1) };
          if (typeof file.type === "string" && file.type.indexOf("image/") === 0) {
            const preview = previewOfFile(file);
            if (preview !== "") item.previewUrl = preview;
          }
          items.push(item);
        }
        return items;
      };
      const removeEditAttachment = (key) => {
        if (key.indexOf("ref:") === 0) {
          setDroppedRefs((prev) => prev.concat(key.slice(4)));
          return;
        }
        if (key.indexOf("file:") !== 0) return;
        const index = Number(key.slice(5));
        if (!Number.isFinite(index)) return;
        const removed = editFiles[index];
        if (removed !== void 0) {
          const url = fileUrlsRef.current.get(removed);
          if (url !== void 0) {
            revokePreview(url);
            fileUrlsRef.current.delete(removed);
          }
        }
        setEditFiles((prev) => prev.filter((_, i) => i !== index));
      };
      const openEdit = () => {
        if (edit.stage === "submitting" || recall.stage === "loading" || recall.stage === "executing") return;
        if (edit.stage === "editing") return;
        if (edit.stage === "error") {
          setEdit({ stage: "editing", text: edit.text, attachments: edit.attachments });
          return;
        }
        setRecall({ stage: "idle" });
        setEditFiles([]);
        setDroppedRefs([]);
        setRefPreviews({});
        setEditMeta(readComposerMeta());
        setModelState(null);
        setModelOpen(false);
        setModelPane("main");
        setModelQuery("");
        const picker = buildModelPicker(ctx, String(sessionId || ""));
        pickerRef.current = picker;
        if (picker) {
          picker.load().then((state) => {
            if (state) setModelState(state);
          }).catch(() => {
          });
        }
        if (resolveImage) {
          for (const block of imageBlocks) {
            const attachment = block.attachment;
            const id = attachment && typeof attachment.attachmentId === "string" ? attachment.attachmentId : "";
            if (id === "") continue;
            Promise.resolve(resolveImage(attachment)).then((url) => {
              if (typeof url !== "string" || url === "") return;
              setRefPreviews((prev) => prev[id] !== void 0 ? prev : { ...prev, [id]: url });
            }).catch(() => {
            });
          }
        }
        setEdit({ stage: "editing", text: text2, attachments: attachmentRefs.length });
      };
      const editFail = (nextText, message) => {
        setEdit({ stage: "error", text: nextText, attachments: attachmentRefs.length, message });
      };
      const closeEdit = () => {
        setEdit({ stage: "idle" });
        setEditFiles([]);
        setDroppedRefs([]);
        setRefPreviews({});
        for (const url of fileUrlsRef.current.values()) revokePreview(url);
        fileUrlsRef.current.clear();
        setModelState(null);
        setModelOpen(false);
        pickerRef.current = null;
      };
      React.useEffect(() => () => {
        for (const url of fileUrlsRef.current.values()) revokePreview(url);
        fileUrlsRef.current.clear();
      }, []);
      const toggleModelMenu = () => {
        if (!pickerRef.current || modelBusy) return;
        setModelOpen((prev) => {
          if (prev) return false;
          setModelPane("main");
          setModelQuery("");
          return true;
        });
      };
      const activeModelOption = () => {
        if (!modelState) return null;
        for (const group of modelState.groups) {
          for (const option of group.options) {
            if (option.key === modelState.activeKey) return option;
          }
        }
        return null;
      };
      const commitModel = (option, effortId) => {
        const picker = pickerRef.current;
        if (!picker || modelBusy) return;
        setModelBusy(true);
        picker.select(option, effortId).then((error) => {
          if (error !== null) {
            setModelBusy(false);
            showThrottledToast(error);
            return;
          }
          return picker.load().then((state) => {
            setModelBusy(false);
            setModelOpen(false);
            setModelPane("main");
            if (state) setModelState(state);
          });
        }).catch(() => {
          setModelBusy(false);
        });
      };
      const pickModel = (option) => {
        const current = modelState;
        const effort = current !== null && option.key === current.activeKey ? current.activeEffortId : option.defaultEffort || "";
        commitModel(option, effort);
      };
      const pickEffort = (effortId) => {
        const option = activeModelOption();
        if (option) commitModel(option, effortId);
      };
      React.useEffect(() => {
        if (!modelOpen) return;
        const doc = typeof document === "undefined" ? null : document;
        if (!doc) return;
        const onPointerDown = (event) => {
          const target = event.target;
          if (target && typeof target.closest === "function" && target.closest(".dsh-recall-composer-model") !== null) return;
          setModelOpen(false);
        };
        doc.addEventListener("pointerdown", onPointerDown, true);
        return () => doc.removeEventListener("pointerdown", onPointerDown, true);
      }, [modelOpen]);
      const editPanelOpen = edit.stage === "editing" || edit.stage === "error";
      React.useEffect(() => {
        if (!editPanelOpen) return;
        const doc = typeof document === "undefined" ? null : document;
        if (!doc) return;
        return installEditDismiss(doc, {
          popupSelector: "",
          onDismiss: () => {
            if (modelOpen) {
              setModelOpen(false);
              return;
            }
            closeEdit();
          }
        });
      }, [editPanelOpen, modelOpen]);
      const submitEdit = () => {
        if (edit.stage !== "editing" && edit.stage !== "error") return;
        const nextText = edit.text;
        const kept = keptRefs();
        if (nextText.trim() === "" && kept.length === 0 && editFiles.length === 0) {
          editFail(nextText, t("edit.empty"));
          return;
        }
        const extraFiles = editFiles.length > 0 ? Promise.resolve(editFiles.slice()) : null;
        setEdit({ stage: "submitting" });
        api("preview", { messageId, sessionId }).then((res) => {
          if (!res || !res.ok) {
            editFail(nextText, messageFor(res, t("fallback.preview")));
            return;
          }
          const cut = typeof res.cutSeq === "number" ? res.cutSeq : null;
          if (cut === null) {
            editFail(nextText, t("edit.noCut"));
            return;
          }
          executeRecall({
            scope: "session-only",
            cutSeq: cut,
            total: typeof res.total === "number" ? res.total : (res.changes || []).length,
            treeId: res.treeId || null,
            editText: nextText,
            editRefs: kept,
            editFiles: extraFiles
          });
        }).catch((error) => {
          editFail(nextText, String(error));
        });
      };
      const openPreview = () => {
        if (recall.stage === "loading" || recall.stage === "executing") return;
        closeEdit();
        setScope("both");
        setRecall({ stage: "loading" });
        api("preview", { messageId, sessionId }).then((res) => {
          if (!res || !res.ok) {
            setRecall({ stage: "error", message: messageFor(res, t("fallback.preview")) });
            return;
          }
          setRecall({
            stage: "confirm",
            changes: res.changes || [],
            total: typeof res.total === "number" ? res.total : (res.changes || []).length,
            truncated: Boolean(res.truncated),
            treeId: res.treeId || null,
            time: res.time || null,
            cutSeq: typeof res.cutSeq === "number" ? res.cutSeq : null,
            // 全量分类计数（changes 是截断后的清单，不能拿来统计）
            counts: res.counts || null,
            // issue #31：仅消息条目没有文件树（老 Host 无该字段 → 按 true）
            files: res.files !== false
          });
        }).catch((error) => {
          setRecall({ stage: "error", message: String(error) });
        });
      };
      const executeRecall = (overrides) => {
        const editText = overrides && typeof overrides.editText === "string" ? overrides.editText : null;
        const isEdit = editText !== null;
        if (!isEdit && recall.stage !== "confirm") return;
        const changes = recall.stage === "confirm" ? recall.changes || [] : [];
        const activeScope = overrides && overrides.scope === "session-only" ? "session-only" : overrides && overrides.scope === "both" ? "both" : recall.stage === "confirm" && recall.files === false ? "session-only" : scope;
        const previewCut = overrides && overrides.cutSeq !== void 0 ? overrides.cutSeq : recall.stage === "confirm" && typeof recall.cutSeq === "number" ? recall.cutSeq : null;
        const setStage = (stage) => {
          if (!isEdit) {
            setRecall(stage);
            return;
          }
          if (stage.stage === "error") {
            setEdit({ stage: "error", text: editText === null ? "" : editText, attachments: attachmentRefs.length, message: stage.message });
          }
        };
        const notifyBase = { sessionId: String(sessionId || ""), messageId, scope: activeScope };
        const previewTotal = overrides && typeof overrides.total === "number" ? overrides.total : recall.stage === "confirm" && typeof recall.total === "number" ? recall.total : changes.length;
        const previewTreeId = overrides && overrides.treeId !== void 0 ? overrides.treeId : recall.stage === "confirm" ? recall.treeId : null;
        const refsForFiles = overrides && overrides.editRefs ? overrides.editRefs : attachmentRefs;
        const wantAttachments = refsForFiles.length > 0 && sessionId && (isEdit || pluginConfig.refillDraft);
        const baseFiles = wantAttachments ? preloadAttachmentFiles(sessionId, refsForFiles) : null;
        const inlineFiles = overrides && overrides.editFiles ? overrides.editFiles : null;
        const attachmentFiles = baseFiles !== null && inlineFiles !== null ? Promise.all([baseFiles, inlineFiles]).then(([base, extra]) => base.concat(extra)) : baseFiles !== null ? baseFiles : inlineFiles;
        setStage({ stage: "executing", changes, scope: activeScope });
        api("execute", { messageId, sessionId, previewTotal, previewTreeId: previewTreeId || void 0, scope: activeScope, previewAt: Date.now() }).then(async (res) => {
          if (!res || !res.ok) {
            if (res && res.code === "STALE") {
              if (isEdit) {
                setStage({ stage: "error", message: t("err.STALE") });
                return;
              }
              setStage({ stage: "loading" });
              api("preview", { messageId, sessionId }).then((res2) => {
                if (!res2 || !res2.ok) {
                  setStage({ stage: "error", message: messageFor(res2, t("fallback.preview")) });
                  return;
                }
                setStage({
                  stage: "confirm",
                  changes: res2.changes || [],
                  total: typeof res2.total === "number" ? res2.total : (res2.changes || []).length,
                  truncated: Boolean(res2.truncated),
                  treeId: res2.treeId || null,
                  time: res2.time || null,
                  cutSeq: typeof res2.cutSeq === "number" ? res2.cutSeq : null,
                  counts: res2.counts || null,
                  files: res2.files !== false
                });
              }).catch((error) => {
                setStage({ stage: "error", message: String(error) });
              });
              return;
            }
            api("notify", buildRecallNotify(notifyBase, {
              outcome: "execute-rejected",
              cutSeq: previewCut,
              code: res && typeof res.code === "string" ? res.code : void 0,
              error: messageFor(res, "")
            })).catch(() => {
            });
            setStage({ stage: "error", message: messageFor(res, t("fallback.rollback")) });
            return;
          }
          const cutSeq = typeof res.cutSeq === "number" ? res.cutSeq : previewCut;
          let chatReverted = false;
          let chatError = "";
          let archiveRequested = false;
          let fillTarget = sessionId;
          if (cutSeq !== null && sessionsSvc && typeof sessionsSvc.fork === "function") {
            try {
              const childId = await sessionsSvc.fork({ sessionId, atSeq: cutSeq });
              if (childId) {
                if (uiWorkspaceSvc && typeof uiWorkspaceSvc.openSession === "function") uiWorkspaceSvc.openSession(childId);
                else if (typeof sessionsSvc.open === "function") sessionsSvc.open(childId);
                chatReverted = true;
                fillTarget = childId;
                recordVersion(String(sessionId || ""), childId);
                removeStaleQueueItems(childId, res.staleQueueItemIds);
                api("lineage-record", { childId, parentId: sessionId }).catch(() => {
                });
                if (pluginConfig.archiveOriginal && workspacesSvc && typeof workspacesSvc.archiveSession === "function") {
                  archiveRequested = true;
                  workspacesSvc.archiveSession(sessionId, { stopActivity: true }).catch((error) => {
                    recallNodeLog.warn("archive original session failed:", error);
                  });
                }
              } else {
                chatError = t("recall.chat.noChild");
                api("notify", buildRecallNotify(notifyBase, { outcome: "fork-failed", cutSeq, error: chatError })).catch(() => {
                });
              }
            } catch (error) {
              chatError = String(error);
              api("notify", buildRecallNotify(notifyBase, { outcome: "fork-failed", cutSeq, error: chatError })).catch(() => {
              });
            }
          }
          setHasSnapshot(false);
          if (isEdit) {
            if (chatReverted) {
              fillDraft(fillTarget, editText === null ? "" : editText, attachmentFiles, {
                submit: pluginConfig.editSubmitsImmediately
              });
              closeEdit();
            } else {
              setEdit({ stage: "error", text: editText === null ? "" : editText, attachments: attachmentRefs.length, message: chatError || t("edit.forkFailed") });
            }
          } else {
            if (pluginConfig.refillDraft) {
              fillDraft(fillTarget, text2, attachmentFiles);
              if (fileBlocks.length > 0) showThrottledToast(t("toast.fileAttachRefill"));
            }
            setRecall({ stage: "done", count: typeof res.count === "number" ? res.count : changes.length, chatReverted, chatError, scope: activeScope });
          }
          if (chatError === "") {
            api("notify", buildRecallNotify(notifyBase, {
              outcome: "complete",
              cutSeq,
              childSessionId: chatReverted ? String(fillTarget || "") || null : null,
              count: typeof res.count === "number" ? res.count : changes.length,
              chatReverted,
              archiveRequested
            })).catch(() => {
            });
          }
        }).catch((error) => {
          setStage({ stage: "error", message: String(error) });
          api("notify", buildRecallNotify(notifyBase, { outcome: "execute-threw", cutSeq: previewCut, error: String(error) })).catch(() => {
          });
        });
      };
      const closePanel = () => {
        setScope("both");
        setRecall({ stage: "idle" });
      };
      const bubbleChildren = [];
      let officialFace = resolveUserContentFace({ renderMessageImages, renderFactorySlot, loadImage }) === "factory";
      if (officialFace) {
        const official = renderOfficialUserContent(renderFactorySlot, blocks, data, loadImage, true);
        if (official.ok) {
          bubbleChildren.push(React.createElement(React.Fragment, { key: "official" }, official.node));
        } else {
          officialFace = false;
          recallNodeLog.warn("user.content factory unavailable; falling back to own rendering:", official.error);
        }
      }
      if (!officialFace) {
        if (imageBlocks.length && typeof renderMessageImages === "function") {
          const render = renderMessageImages;
          bubbleChildren.push(React.createElement(
            React.Fragment,
            { key: "images" },
            render({ images: imageBlocks, align: "end" })
          ));
        }
        for (let i = 0; i < fileBlocks.length; i++) {
          const info = fileCardInfo(fileBlocks[i], t);
          if (!info) continue;
          bubbleChildren.push(React.createElement(
            "div",
            { className: "dsh-recall-filecard", key: "file-" + i },
            React.createElement("span", { className: "dsh-recall-filecard-icon" }, info.ext),
            React.createElement(
              "span",
              { className: "dsh-recall-filecard-body" },
              React.createElement("span", { className: "dsh-recall-filecard-name", title: info.name }, info.name),
              React.createElement("span", { className: "dsh-recall-filecard-meta" }, info.size ? info.ext + " " + info.size : info.ext)
            )
          ));
        }
        if (text2 !== "") {
          bubbleChildren.push(React.createElement("div", { className: "dsh-recall-bubble", key: "text" }, text2));
        }
        for (let i = 0; i < rest.length; i++) {
          bubbleChildren.push(React.createElement("pre", { className: "dsh-recall-json", key: "rest-" + i }, JSON.stringify(rest[i], null, 2)));
        }
      }
      const actions = [];
      actions.push(React.createElement("span", { className: "dsh-recall-time", key: "time" }, clockText2(data.time)));
      actions.push(React.createElement("button", {
        key: "copy",
        type: "button",
        className: "dsh-recall-action",
        "aria-label": copied ? t("action.copied") : t("action.copy"),
        title: copied ? t("action.copied") : t("action.copy"),
        onClick: onCopy
      }, copied ? React.createElement(CheckIcon, {}) : React.createElement(CopyIcon, {})));
      if (hasSnapshot) {
        actions.push(React.createElement("button", {
          key: "recall",
          type: "button",
          className: "dsh-recall-action",
          "aria-label": t("action.recall"),
          title: t("action.recall.title"),
          onClick: openPreview
        }, React.createElement(UndoIcon, {})));
        if (edit.stage === "idle") {
          actions.push(React.createElement("button", {
            key: "edit",
            type: "button",
            className: "dsh-recall-action",
            "aria-label": t("action.edit"),
            title: t("action.edit.title"),
            onClick: openEdit
          }, React.createElement(EditIcon, {})));
        }
      }
      const stackClass = "dsh-recall-stack" + (officialFace ? " dsh-recall-stack-official" : "");
      const editing = edit.stage !== "idle";
      const modelNodes = modelOpen && modelState ? renderModelMenu(React, t, {
        pane: modelPane,
        query: modelQuery,
        groups: modelState.groups,
        activeKey: modelState.activeKey,
        activeOption: activeModelOption(),
        modelLabel: modelState.label,
        effortLabel: modelState.effortLabel,
        activeEffortId: modelState.activeEffortId,
        busy: modelBusy,
        onPane: (next) => {
          setModelPane(next);
          if (next !== "list") setModelQuery("");
        },
        onQuery: setModelQuery,
        onPick: pickModel,
        onPickEffort: pickEffort
      }) : null;
      const bubble = bubbleChildren.length > 0 ? React.createElement("div", { className: stackClass, key: "stack", ref: stackRef }, ...bubbleChildren) : null;
      const stack = editing ? React.createElement(
        "div",
        { className: "dsh-recall-stack dsh-recall-stack-editing", key: "stack" },
        EditPanel({
          stage: edit,
          submitLabel: t(pluginConfig.editSubmitsImmediately ? "edit.submit" : "edit.submit.draftOnly"),
          meta: editMeta,
          attachments: editAttachments(),
          // chip 与官方同构：模型名与思考强度分两个 span（档位空 = provider default）
          modelLabel: modelState ? modelState.label : "",
          modelEffort: modelState ? modelState.effortLabel : "",
          modelOpen,
          modelBusy,
          modelNodes,
          onToggleModel: toggleModelMenu,
          onChange: (next) => setEdit((prev) => prev.stage === "editing" || prev.stage === "error" ? { stage: "editing", text: next, attachments: prev.attachments } : prev),
          onSubmit: submitEdit,
          onClose: closeEdit,
          onAddFiles: (files) => setEditFiles((prev) => prev.concat(files)),
          onRemoveAttachment: removeEditAttachment
        })
      ) : bubble;
      return React.createElement(
        "div",
        {
          className: "dsh-recall-row",
          "data-time-hover-root": true,
          "data-editing": editing ? "true" : void 0,
          // 版本翻页器据此确认「当前是哪个会话」（官方槽只给 messageId）
          "data-recall-session": sessionId || void 0
        },
        stack,
        React.createElement("div", { className: "dsh-recall-actions", key: "actions" }, ...actions),
        recallPanel(recall, closePanel, () => executeRecall(), scope, setScope)
      );
    }
    return { UserRecallNode };
  }

  // src/client/config-card.ts
  function buildConfigForm(React, util, SectionToggle) {
    const { api, bytesToMb: bytesToMb2, t, setLocalePref } = util;
    function ConfigForm(props) {
      const [baseline, setBaseline] = React.useState(null);
      const [draft, setDraft] = React.useState(null);
      const [envLocks, setEnvLocks] = React.useState({});
      const [overridden, setOverridden] = React.useState({});
      const [writable, setWritable] = React.useState(true);
      const [state, setState] = React.useState({ busy: false, message: "", error: false });
      useAutoDismissMessage(React, state, setState);
      const [showAdvanced, setShowAdvanced] = React.useState(false);
      function load() {
        api("config-get", {}).then((res) => {
          if (res && res.ok) {
            const v = res.values;
            const next = {
              gcSnaps: String(v.gcSnaps == null ? "" : v.gcSnaps),
              gcHours: String(v.gcHours == null ? "" : v.gcHours),
              maxFileBytes: bytesToMb2(v.maxFileBytes),
              maxWorkspaceBytes: bytesToMb2(v.maxWorkspaceBytes),
              // 扫描预算持久化为毫秒、展示为秒（整数）；0 表示不限制，原样显示 0
              scanBudgetMs: String(v.scanBudgetMs == null ? "" : Math.round(Number(v.scanBudgetMs) / 1e3)),
              // issue #29：单次快照总时限，同样按秒展示
              snapshotBudgetMs: String(v.snapshotBudgetMs == null ? "" : Math.round(Number(v.snapshotBudgetMs) / 1e3)),
              maxSnapshotsPerWorkspace: String(v.maxSnapshotsPerWorkspace == null ? "" : v.maxSnapshotsPerWorkspace),
              baseExcludes: Array.isArray(v.baseExcludes) ? v.baseExcludes.join("\n") : "",
              refillDraft: v.refillDraft !== false,
              snapshotEnabled: v.snapshotEnabled !== false,
              // issue #31：老 Host 无该字段 → 按默认 false（现状）处理
              messageOnly: v.messageOnly === true,
              archiveOriginal: v.archiveOriginal !== false,
              // issue #26：老 Host 的 values 无该字段时按默认 true（与 util 同口径）
              editSubmitsImmediately: v.editSubmitsImmediately !== false,
              retentionDays: String(v.retentionDays == null ? "" : v.retentionDays),
              locale: typeof v.locale === "string" && v.locale ? v.locale : "auto"
            };
            setLocalePref(next.locale);
            if (props.onLocaleApplied) props.onLocaleApplied();
            setDraft(next);
            setBaseline(next);
            setEnvLocks(res.envLocks || {});
            setOverridden(res.overridden || {});
            setWritable(res.writable !== false);
          } else {
            setState({ busy: false, message: res && (res.message || res.error) || t("config.msg.loadFailed"), error: true });
          }
        }).catch((e) => setState({ busy: false, message: String(e), error: true }));
      }
      React.useEffect(() => {
        load();
      }, []);
      function edit(key, value) {
        setDraft((d) => Object.assign({}, d, { [key]: value }));
      }
      function save() {
        if (state.busy || !draft || !baseline) return;
        const patch = {};
        for (const key of ["gcSnaps", "gcHours", "maxFileBytes", "maxWorkspaceBytes", "scanBudgetMs", "snapshotBudgetMs", "maxSnapshotsPerWorkspace", "baseExcludes", "refillDraft", "snapshotEnabled", "messageOnly", "archiveOriginal", "editSubmitsImmediately", "retentionDays", "locale"]) {
          const value = draft[key];
          if (value !== void 0 && value !== baseline[key]) patch[key] = value;
        }
        if (!Object.keys(patch).length) {
          setState({ busy: false, message: t("config.msg.noChange"), error: false });
          return;
        }
        const clean = {};
        if (patch.gcSnaps !== void 0) {
          const n = parseInt(String(patch.gcSnaps), 10);
          if (!Number.isFinite(n) || n < 1) {
            setState({ busy: false, message: t("config.err.gcSnaps"), error: true });
            return;
          }
          clean.gcSnaps = n;
        }
        if (patch.gcHours !== void 0) {
          const n = parseInt(String(patch.gcHours), 10);
          if (!Number.isFinite(n) || n < 1) {
            setState({ busy: false, message: t("config.err.gcHours"), error: true });
            return;
          }
          clean.gcHours = n;
        }
        if (patch.maxFileBytes !== void 0) {
          const mb = Number(patch.maxFileBytes);
          if (!Number.isFinite(mb) || mb < 0.01) {
            setState({ busy: false, message: t("config.err.maxFileBytes"), error: true });
            return;
          }
          clean.maxFileBytes = Math.round(mb * 1048576);
        }
        if (patch.maxWorkspaceBytes !== void 0) {
          const mb = Number(patch.maxWorkspaceBytes);
          if (!Number.isFinite(mb) || mb < 0) {
            setState({ busy: false, message: t("config.err.maxWorkspaceBytes"), error: true });
            return;
          }
          clean.maxWorkspaceBytes = Math.round(mb * 1048576);
        }
        if (patch.scanBudgetMs !== void 0) {
          const s = Number(patch.scanBudgetMs);
          if (!Number.isFinite(s) || s < 0) {
            setState({ busy: false, message: t("config.err.scanBudgetMs"), error: true });
            return;
          }
          clean.scanBudgetMs = Math.round(s * 1e3);
        }
        if (patch.snapshotBudgetMs !== void 0) {
          const s = Number(patch.snapshotBudgetMs);
          if (!Number.isFinite(s) || s < 0) {
            setState({ busy: false, message: t("config.err.snapshotBudgetMs"), error: true });
            return;
          }
          clean.snapshotBudgetMs = Math.round(s * 1e3);
        }
        if (patch.maxSnapshotsPerWorkspace !== void 0) {
          const n = parseInt(String(patch.maxSnapshotsPerWorkspace), 10);
          if (!Number.isFinite(n) || n < 0) {
            setState({ busy: false, message: t("config.err.maxSnapshots"), error: true });
            return;
          }
          clean.maxSnapshotsPerWorkspace = n;
        }
        if (patch.refillDraft !== void 0) clean.refillDraft = Boolean(patch.refillDraft);
        if (patch.snapshotEnabled !== void 0) clean.snapshotEnabled = Boolean(patch.snapshotEnabled);
        if (patch.messageOnly !== void 0) clean.messageOnly = Boolean(patch.messageOnly);
        if (patch.archiveOriginal !== void 0) clean.archiveOriginal = Boolean(patch.archiveOriginal);
        if (patch.editSubmitsImmediately !== void 0) clean.editSubmitsImmediately = Boolean(patch.editSubmitsImmediately);
        if (patch.retentionDays !== void 0) {
          const n = parseInt(String(patch.retentionDays), 10);
          if (!Number.isFinite(n) || n < 0) {
            setState({ busy: false, message: t("config.err.retentionDays"), error: true });
            return;
          }
          clean.retentionDays = n;
        }
        if (patch.locale !== void 0) {
          const v = String(patch.locale);
          if (v !== "auto" && v !== "zh" && v !== "en") {
            setState({ busy: false, message: t("config.err.locale"), error: true });
            return;
          }
          clean.locale = v;
        }
        if (patch.baseExcludes !== void 0) {
          clean.baseExcludes = String(patch.baseExcludes).split("\n").map((l) => l.trim()).filter(Boolean);
        }
        setState({ busy: true, message: t("config.msg.saving"), error: false });
        api("config-set", { patch: clean }).then((res) => {
          if (res && res.ok) {
            if (clean.locale !== void 0) setLocalePref(clean.locale);
            setState({ busy: false, message: t("config.msg.saved"), error: false });
            load();
          } else {
            setState({ busy: false, message: res && (res.message || res.error) || t("config.msg.saveFailed"), error: true });
          }
        }).catch((e) => setState({ busy: false, message: String(e), error: true }));
      }
      function numRow(key, label, hint, opts) {
        const locked = Boolean(envLocks && envLocks[key]);
        const changed = Boolean(draft && baseline && draft[key] !== baseline[key]);
        return React.createElement(
          "div",
          { className: "dsh-recall-cfg-row", key },
          // V4：标签上提为 cfg-row 直接子元素——grid 第一列（max-content）跨行
          // 对齐最长标签，消灭 130px 定宽魔法数与 hint 138px 缩进耦合。
          // 标签用 span + aria-labelledby 而非 label[for]：label 关联会让点击左侧
          // 标签直接触发右侧控件（输入框被聚焦），用户实测反馈为误触
          React.createElement("span", { className: "dsh-recall-cfg-label", id: "dsh-recall-cfg-label-" + key }, label),
          // 控件行（grid 第二列）与说明文字（第三列）分别为独立 grid item：三列
          // 各自成像，说明列起点由该列列宽统一决定——说明若跟在控件后面按流排，
          // 起笔位置会随行内 tag（条/小时/MB/天）的宽度逐行漂移（实测逐行参差）
          React.createElement(
            "div",
            { className: "dsh-recall-cfg-line" },
            React.createElement("input", {
              id: "dsh-recall-cfg-" + key,
              "aria-labelledby": "dsh-recall-cfg-label-" + key,
              className: "dsh-recall-cfg-input",
              type: "number",
              value: draft ? draft[key] : "",
              disabled: locked || !writable,
              min: opts && opts.min,
              step: opts && opts.step,
              onChange: (e) => edit(key, e.target.value)
            }),
            opts && opts.suffixKey ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, t(opts.suffixKey)) : null,
            changed && !locked ? React.createElement("span", { className: "dsh-recall-cfg-tag dsh-recall-cfg-tag-modified" }, t("config.tag.modified")) : null,
            overridden && overridden[key] !== void 0 ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, t("config.tag.overridden")) : null,
            locked ? React.createElement("span", { className: "dsh-recall-cfg-tag dsh-recall-cfg-tag-locked" }, t("config.tag.locked")) : null
          ),
          React.createElement("div", { className: "dsh-recall-cfg-hint" }, hint)
        );
      }
      function boolRow(key, label, hint) {
        const changed = Boolean(draft && baseline && draft[key] !== baseline[key]);
        const on = Boolean(draft && draft[key]);
        return React.createElement(
          "div",
          { className: "dsh-recall-cfg-row", key },
          // 标签上提为 cfg-row 直接子元素（与 numRow 同法，V4 跨行对齐契约）
          React.createElement("span", { className: "dsh-recall-cfg-label", id: "dsh-recall-cfg-label-" + key }, label),
          // 与 numRow 同法：控件行（第二列）+ 说明（第三列）各自为 grid item。
          // -line-switch 修饰类把滑钮右缘推到数字行输入框的右边框上（滑钮只 36px
          // 宽，左对齐会在右侧留空档、与相邻数字行参差，用户实测反馈）
          React.createElement(
            "div",
            { className: "dsh-recall-cfg-line dsh-recall-cfg-line-switch" },
            React.createElement("button", {
              id: "dsh-recall-cfg-" + key,
              type: "button",
              role: "switch",
              "aria-checked": on,
              "aria-labelledby": "dsh-recall-cfg-label-" + key,
              className: "dsh-recall-cfg-switch",
              disabled: !writable,
              onClick: () => edit(key, !on)
            }, React.createElement("span", { className: "dsh-recall-cfg-switch-thumb" })),
            changed ? React.createElement("span", { className: "dsh-recall-cfg-tag dsh-recall-cfg-tag-modified" }, t("config.tag.modified")) : null,
            overridden && overridden[key] !== void 0 ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, t("config.tag.overridden")) : null
          ),
          React.createElement("div", { className: "dsh-recall-cfg-hint" }, hint)
        );
      }
      function localeRow() {
        const changed = Boolean(draft && baseline && draft.locale !== baseline.locale);
        return React.createElement(
          "div",
          { className: "dsh-recall-cfg-row", key: "locale" },
          React.createElement("span", { className: "dsh-recall-cfg-label", id: "dsh-recall-cfg-label-locale" }, t("config.locale.label")),
          React.createElement(
            "div",
            { className: "dsh-recall-cfg-line" },
            React.createElement(
              "select",
              {
                id: "dsh-recall-cfg-locale",
                "aria-labelledby": "dsh-recall-cfg-label-locale",
                className: "dsh-recall-cfg-select",
                value: draft ? draft.locale : "auto",
                disabled: !writable,
                onChange: (e) => edit("locale", e.target.value)
              },
              React.createElement("option", { value: "auto" }, t("config.locale.auto")),
              React.createElement("option", { value: "zh" }, "\u4E2D\u6587"),
              React.createElement("option", { value: "en" }, "English")
            ),
            changed ? React.createElement("span", { className: "dsh-recall-cfg-tag dsh-recall-cfg-tag-modified" }, t("config.tag.modified")) : null,
            overridden && overridden.locale !== void 0 ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, t("config.tag.overridden")) : null
          ),
          React.createElement("div", { className: "dsh-recall-cfg-hint" }, t("config.locale.hint"))
        );
      }
      function resetDefaults() {
        if (state.busy || !writable) return;
        setState({ busy: true, message: t("config.msg.resetting"), error: false });
        api("config-reset", {}).then((res) => {
          if (res && res.ok) {
            load();
            setState({ busy: false, message: t("config.msg.resetDone"), error: false });
          } else {
            setState({ busy: false, message: res && (res.message || res.error) || t("config.msg.resetFailed"), error: true });
          }
        }).catch((e) => setState({ busy: false, message: String(e), error: true }));
      }
      if (!draft || !baseline) {
        return React.createElement("div", { className: "dsh-recall-ex-note" }, state.message || t("config.msg.loading"));
      }
      return React.createElement(
        "div",
        { className: "dsh-recall-ex-card" },
        // 全部行包进单一 cfg-grid：cfg-row 是 display:contents 透明层（css.ts），
        // 每字段留下标签／控件行／说明三个 grid item，分占第一/二/三列——第一列
        // max-content 由全表单最长标签决定（跨行对齐），第二列同理（说明列起点
        // 逐行齐平）。此前每行是独立 grid 容器，max-content 各算各的，实测参差。
        React.createElement(
          "div",
          { className: "dsh-recall-cfg-grid" },
          // V5 表单分组：9 字段平铺 → 「快照行为 / 自动治理 / 界面」三组语义分组
          // 小标题，降低认知负担；「高级：基础排除表」沿用 SectionToggle 折叠，
          // 不重复加标题。
          React.createElement("div", { className: "dsh-recall-cfg-group" }, t("config.group.snapshot")),
          boolRow("snapshotEnabled", t("config.snapshotEnabled.label"), t("config.snapshotEnabled.hint")),
          // issue #31：只回退消息——紧挨总开关，语义上是「快照写什么」的下一层
          boolRow("messageOnly", t("config.messageOnly.label"), t("config.messageOnly.hint")),
          boolRow("refillDraft", t("config.refillDraft.label"), t("config.refillDraft.hint")),
          boolRow("archiveOriginal", t("config.archiveOriginal.label"), t("config.archiveOriginal.hint")),
          boolRow("editSubmitsImmediately", t("config.editSubmitsImmediately.label"), t("config.editSubmitsImmediately.hint")),
          React.createElement("div", { className: "dsh-recall-cfg-group" }, t("config.group.auto")),
          // 单位后缀统一挂输入框右侧（与状态标签同基线），不再只藏在说明文字里；
          // 传词表键而非字面量——单位词也是语言事实（条/小时 vs snapshots/hours）
          numRow("gcSnaps", t("config.gcSnaps.label"), t("config.gcSnaps.hint"), { suffixKey: "config.gcSnaps.suffix", min: 1, step: 1 }),
          numRow("gcHours", t("config.gcHours.label"), t("config.gcHours.hint"), { suffixKey: "config.gcHours.suffix", min: 1, step: 1 }),
          numRow("maxFileBytes", t("config.maxFileBytes.label"), t("config.maxFileBytes.hint"), { suffixKey: "config.maxFileBytes.suffix", min: 0.01, step: 0.5 }),
          // issue #24 护栏：单文件上限之外的两道闸（总量 + 扫描耗时），0 = 不限制
          numRow("maxWorkspaceBytes", t("config.maxWorkspaceBytes.label"), t("config.maxWorkspaceBytes.hint"), { suffixKey: "config.maxWorkspaceBytes.suffix", min: 0, step: 16 }),
          numRow("scanBudgetMs", t("config.scanBudgetMs.label"), t("config.scanBudgetMs.hint"), { suffixKey: "config.scanBudgetMs.suffix", min: 0, step: 1 }),
          // issue #29：扫描阶段之外还有 add/写索引——单次快照的总时限兜底
          numRow("snapshotBudgetMs", t("config.snapshotBudgetMs.label"), t("config.snapshotBudgetMs.hint"), { suffixKey: "config.snapshotBudgetMs.suffix", min: 0, step: 30 }),
          numRow("maxSnapshotsPerWorkspace", t("config.maxSnapshotsPerWorkspace.label"), t("config.maxSnapshotsPerWorkspace.hint"), { suffixKey: "config.maxSnapshotsPerWorkspace.suffix", min: 0, step: 1 }),
          numRow("retentionDays", t("config.retentionDays.label"), t("config.retentionDays.hint"), { suffixKey: "config.retentionDays.suffix", min: 0, step: 1 }),
          React.createElement("div", { className: "dsh-recall-cfg-group" }, t("config.group.ui")),
          localeRow(),
          // 操作区在「基础排除表」折叠头之前：按钮服务整个表单（含折叠区之外的字段），
          // 排在折叠头之后会被误读为折叠区内容、折叠时像漏收起（用户实测反馈）；
          // 因此也不把按钮藏进折叠分支——否则折叠基础排除表后将无法保存。
          React.createElement(
            "div",
            { className: "dsh-recall-panel-actions" },
            state.message ? React.createElement("span", { role: "status", "aria-live": "polite", className: "dsh-recall-ex-status" + (state.error ? " dsh-recall-ex-status-error" : " dsh-recall-ex-status-success") }, (state.error ? t("common.errorPrefix") : "") + state.message) : null,
            React.createElement("button", { type: "button", className: "dsh-recall-btn", disabled: state.busy || !writable, onClick: () => setDraft(baseline ? Object.assign({}, baseline) : null) }, t("common.discard")),
            React.createElement("button", {
              type: "button",
              className: "dsh-recall-btn",
              disabled: state.busy || !writable,
              title: t("config.reset.title"),
              onClick: resetDefaults
            }, t("config.reset")),
            // 「保存」是表单唯一主动作，升主色实心按钮；放弃修改/恢复默认维持次级
            // 灰底（同排按钮只有一个视觉焦点，配色令牌经官方主题产物核验，见 css.ts）
            React.createElement("button", { type: "button", className: "dsh-recall-btn dsh-recall-btn-primary", disabled: state.busy || !writable, onClick: save }, t("common.save")),
            !writable ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, t("config.tag.readonly")) : null
          ),
          // divider：本条是折叠分区列表的首项，上方分界线把「字段表单」与「折叠
          // 分区」分开（否则保存按钮行紧贴折叠头，读起来像同一组字段）
          React.createElement(SectionToggle, { title: t("config.advanced.title"), open: showAdvanced, onToggle: () => setShowAdvanced((v) => !v), divider: true }),
          showAdvanced ? React.createElement(
            "div",
            { className: "dsh-recall-cfg-row", key: "baseExcludes" },
            // V4：标签上提（与 numRow 同法）；cfg-line 只剩 tags，textarea/hint 通栏
            React.createElement("span", { className: "dsh-recall-cfg-label", id: "dsh-recall-cfg-label-baseExcludes" }, t("config.baseExcludes.label")),
            React.createElement(
              "div",
              { className: "dsh-recall-cfg-line" },
              draft.baseExcludes !== baseline.baseExcludes ? React.createElement("span", { className: "dsh-recall-cfg-tag dsh-recall-cfg-tag-modified" }, t("config.tag.modified")) : null,
              overridden && overridden.baseExcludes !== void 0 ? React.createElement("span", { className: "dsh-recall-cfg-tag" }, t("config.tag.overridden")) : null
            ),
            // textarea/hint 加 cfg-span 通栏：折叠区在共享 grid 内展开时，内容若只占
            // 第二列，左侧标签列会成为竖直死区（实测 textarea 被挤窄）；通栏后与
            // 标签/tags 行左缘对齐。名称经 aria-labelledby 给出（与 numRow 同法，
            // 不建立 label 关联）
            React.createElement("textarea", {
              id: "dsh-recall-cfg-baseExcludes",
              "aria-labelledby": "dsh-recall-cfg-label-baseExcludes",
              className: "dsh-recall-cfg-area dsh-recall-cfg-span",
              rows: 4,
              value: draft.baseExcludes,
              disabled: !writable,
              onChange: (e) => edit("baseExcludes", e.target.value)
            }),
            React.createElement("div", { className: "dsh-recall-cfg-hint dsh-recall-cfg-span" }, t("config.baseExcludes.hint"))
          ) : null
        )
      );
    }
    return { ConfigForm };
  }

  // src/client/exclude-card.ts
  var EXCLUDE_SUGGESTIONS = ["dist/", "build/", "out/", "coverage/", "*.log", ".env"];
  function buildExcludeCards(React, util) {
    const { api, t } = util;
    function ExcludeCard(props) {
      const file = props.file;
      const [draft, setDraft] = React.useState(file.content || "");
      const [baseline, setBaseline] = React.useState(file.content || "");
      const [quick, setQuick] = React.useState("");
      const [state, setState] = React.useState({ busy: false, message: "", error: false });
      useAutoDismissMessage(React, state, setState);
      const dirty = draft !== baseline;
      function appendPattern(pattern) {
        setDraft((d) => (d && !d.endsWith("\n") ? d + "\n" : d) + pattern + "\n");
      }
      function addQuick() {
        const pattern = quick.trim();
        if (!pattern) return;
        appendPattern(pattern);
        setQuick("");
      }
      function save() {
        if (state.busy || !dirty) return;
        setState({ busy: true, message: t("exclude.msg.saving"), error: false });
        api("exclude-set", { path: file.path, content: draft }).then((res) => {
          if (res && res.ok) {
            setBaseline(draft);
            setState({ busy: false, message: t("exclude.msg.saved"), error: false });
          } else {
            setState({ busy: false, message: res && (res.message || res.error) || t("exclude.msg.saveFailed"), error: true });
          }
        }).catch((error) => {
          setState({ busy: false, message: String(error), error: true });
        });
      }
      function discard() {
        if (state.busy) return;
        setDraft(baseline);
        setState({ busy: false, message: "", error: false });
      }
      const draftLines = draft.split("\n").map((l) => l.trim());
      const suggestions = EXCLUDE_SUGGESTIONS.filter((s) => draftLines.indexOf(s) < 0);
      return React.createElement(
        "div",
        { className: "dsh-recall-ex-card" },
        // 不渲染「快照排除项」内标题（与折叠头「排除配置（exclude.txt）」语义重复）；
        // 多文件场景（降级工作区）靠紧随说明的存储路径行区分，标题文本本就相同、
        // 不承担区分职责。路径从长句中抽出独立等宽行——Windows 长路径内联在句号
        // 前会撑出断裂换行（实测丑），独立行 break-all 整齐折行。
        React.createElement(
          "div",
          { className: "dsh-recall-ex-note" },
          file.home ? t("exclude.note.home") : t("exclude.note.fallback")
        ),
        React.createElement("div", { className: "dsh-recall-ex-path" }, t("exclude.path", { path: file.path })),
        React.createElement("div", { className: "dsh-recall-ex-note" }, t("exclude.syntax")),
        React.createElement("textarea", {
          className: "dsh-recall-ex-area",
          "aria-label": t("exclude.area.aria"),
          value: draft,
          spellCheck: false,
          onChange: (e) => setDraft(e.target.value)
        }),
        React.createElement(
          "div",
          { className: "dsh-recall-ex-quick" },
          React.createElement("input", {
            className: "dsh-recall-ex-input",
            value: quick,
            placeholder: t("exclude.quick.placeholder"),
            "aria-label": t("exclude.quick.aria"),
            onChange: (e) => setQuick(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addQuick();
              }
            }
          }),
          React.createElement("button", { type: "button", className: "dsh-recall-btn", onClick: addQuick }, t("exclude.add")),
          ...suggestions.map((s) => React.createElement("button", {
            key: "chip-" + s,
            type: "button",
            className: "dsh-recall-ex-chip",
            title: t("exclude.chip.title", { pattern: s }),
            onClick: () => appendPattern(s)
          }, s))
        ),
        React.createElement(
          "div",
          { className: "dsh-recall-panel-actions" },
          state.message ? React.createElement("span", { role: "status", "aria-live": "polite", className: "dsh-recall-ex-status" + (state.error ? " dsh-recall-ex-status-error" : " dsh-recall-ex-status-success") }, (state.error ? t("common.errorPrefix") : "") + state.message) : null,
          React.createElement("button", { type: "button", className: "dsh-recall-btn", disabled: !dirty || state.busy, onClick: discard }, t("common.discard")),
          // 保存升主色实心（与配置表单同一约定：每卡唯一主动作，对齐官方插件卡
          // footer 的 discard 幽灵 + save 实心组合）
          React.createElement("button", { type: "button", className: "dsh-recall-btn dsh-recall-btn-primary", disabled: !dirty || state.busy, onClick: save }, t("common.save"))
        )
      );
    }
    function ExcludeFilesSection() {
      const [files, setFiles] = React.useState(null);
      const [error, setError] = React.useState("");
      function load() {
        api("exclude-get", {}).then((res) => {
          if (res && res.ok) {
            setFiles(res.files || []);
            setError("");
            return;
          }
          if (res && res.unsupported) {
            setError(t("exclude.unsupported"));
            return;
          }
          setError(res && (res.message || res.error) || t("exclude.loadFailed"));
        }).catch((e) => setError(String(e)));
      }
      React.useEffect(() => {
        load();
      }, []);
      if (error) {
        return React.createElement(
          "div",
          { className: "dsh-recall-ex-card" },
          React.createElement("div", { className: "dsh-recall-ex-note" }, error),
          React.createElement(
            "div",
            { className: "dsh-recall-panel-actions" },
            React.createElement("button", { type: "button", className: "dsh-recall-btn", onClick: load }, t("common.retry"))
          )
        );
      }
      if (files === null) {
        return React.createElement("div", { className: "dsh-recall-ex-note" }, t("exclude.loading"));
      }
      if (!files.length) {
        return React.createElement("div", { className: "dsh-recall-ex-note" }, t("exclude.empty"));
      }
      return React.createElement(
        "div",
        { className: "dsh-recall-ex-card" },
        ...files.map((f) => React.createElement(ExcludeCard, { key: f.path, file: f }))
      );
    }
    return { ExcludeFilesSection };
  }

  // src/client/snapshot-manager.ts
  function groupByLineage(ids, lineage) {
    const childOf = /* @__PURE__ */ new Map();
    const childrenOf = /* @__PURE__ */ new Map();
    for (const e of lineage || []) {
      if (e && e.childId && e.parentId) {
        const child = String(e.childId);
        const parent = String(e.parentId);
        childOf.set(child, parent);
        const kids = childrenOf.get(parent) || [];
        kids.push(child);
        childrenOf.set(parent, kids);
      }
    }
    const idSet = new Set((ids || []).map((v) => String(v)));
    const result = /* @__PURE__ */ new Map();
    const assigned = /* @__PURE__ */ new Set();
    for (const id of idSet) {
      if (assigned.has(id)) continue;
      let root = id;
      const seen = /* @__PURE__ */ new Set();
      while (childOf.has(root) && idSet.has(childOf.get(root)) && !seen.has(root)) {
        seen.add(root);
        root = childOf.get(root);
      }
      const chain = [];
      const queue = [root];
      while (queue.length) {
        const cur = queue.shift();
        if (!cur || !idSet.has(cur) || assigned.has(cur)) continue;
        chain.push(cur);
        assigned.add(cur);
        for (const k of childrenOf.get(cur) || []) queue.push(k);
      }
      if (chain.length > 1) {
        chain.forEach((sid, i) => result.set(sid, { family: chain, index: i + 1 }));
      }
    }
    return result;
  }
  function buildSnapshotManager(React, util, sessionsSvc, workspacesSvc, uiWorkspaceSvc) {
    const { api, clockText: clockText2, sizeText: sizeText2, buildTree: buildTree2, messageFor, t } = util;
    function DeleteButton(props) {
      return React.createElement("button", {
        type: "button",
        className: "dsh-recall-icon-btn dsh-recall-icon-btn-danger",
        title: props.title,
        "aria-label": props.title,
        // 阻止冒泡：行本身可点（展开/收起），删除按钮不该顺带折叠该行
        onClick: (e) => {
          e.stopPropagation();
          props.onClick();
        }
      }, React.createElement(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 48 48", fill: "none", "aria-hidden": true },
        React.createElement("path", { d: "M9 10V44H39V10H9Z", stroke: "currentColor", strokeWidth: 4, strokeLinejoin: "round" }),
        React.createElement("path", { d: "M20 20V33", stroke: "currentColor", strokeWidth: 4, strokeLinecap: "round", strokeLinejoin: "round" }),
        React.createElement("path", { d: "M28 20V33", stroke: "currentColor", strokeWidth: 4, strokeLinecap: "round", strokeLinejoin: "round" }),
        React.createElement("path", { d: "M4 10H44", stroke: "currentColor", strokeWidth: 4, strokeLinecap: "round", strokeLinejoin: "round" }),
        React.createElement("path", { d: "M16 10L19.289 4H28.7771L32 10H16Z", stroke: "currentColor", strokeWidth: 4, strokeLinejoin: "round" })
      ));
    }
    function chevronIcon(open) {
      return React.createElement("svg", {
        width: 12,
        height: 12,
        viewBox: "0 0 16 16",
        style: { transition: "transform .16s", transform: open ? "none" : "rotate(-90deg)" }
      }, React.createElement("path", {
        d: "M4 6l4 4 4-4",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.5,
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }));
    }
    function ManageCard() {
      const [items, setItems] = React.useState(null);
      const [listError, setListError] = React.useState(null);
      const [usage, setUsage] = React.useState(null);
      const [errors, setErrors] = React.useState(null);
      const [state, setState] = React.useState({ busy: false, message: "", error: false });
      useAutoDismissMessage(React, state, setState);
      const [limit, setLimit] = React.useState(200);
      const [total, setTotal] = React.useState(0);
      const [health, setHealth] = React.useState(null);
      const [query, setQuery] = React.useState("");
      const [showAllErrors, setShowAllErrors] = React.useState(false);
      const [titlesPending, setTitlesPending] = React.useState(false);
      const [lineage, setLineage] = React.useState([]);
      function fetchTitles(list) {
        const missing = Array.from(new Set(
          (list || []).filter((it) => it.sessionId && !it.sessionTitle).map((it) => it.sessionId)
        )).slice(0, 100);
        if (!missing.length) {
          setTitlesPending(false);
          return;
        }
        setTitlesPending(true);
        api("manage", { op: "titles", sessionIds: missing }).then((res) => {
          const map = res && res.ok ? res.titles : null;
          if (map) {
            setItems((prev) => (prev || []).map((it) => it.sessionId && map[it.sessionId] ? Object.assign({}, it, { sessionTitle: map[it.sessionId] }) : it));
          }
          setTitlesPending(false);
        }).catch(() => setTitlesPending(false));
      }
      function fetchMessages(list) {
        const requests = (list || []).filter((it) => it.sessionId && it.id && !Object.prototype.hasOwnProperty.call(it, "messageText")).map((it) => ({ sessionId: it.sessionId, messageId: it.id })).slice(0, 200);
        if (!requests.length) return;
        api("manage", { op: "messages", requests }).then((res) => {
          const map = res && res.ok ? res.messageTexts : null;
          if (map) {
            setItems((prev) => (prev || []).map((it) => it.id && Object.prototype.hasOwnProperty.call(map, it.id) ? Object.assign({}, it, { messageText: map[it.id] }) : it));
          }
        }).catch(() => {
        });
      }
      function refresh(overLimit) {
        const useLimit = overLimit || limit;
        api("manage", { op: "list", limit: useLimit }).then((res) => {
          if (res && res.ok) {
            setListError(null);
            setItems(res.items || []);
            setTotal(typeof res.total === "number" ? res.total : (res.items || []).length);
            fetchTitles(res.items || []);
            fetchMessages(res.items || []);
            if (res.stale) {
              api("manage", { op: "list", limit: useLimit }).then((res2) => {
                if (res2 && res2.ok && !res2.stale) {
                  setItems(res2.items || []);
                  setTotal(typeof res2.total === "number" ? res2.total : (res2.items || []).length);
                  fetchTitles(res2.items || []);
                  fetchMessages(res2.items || []);
                }
              }).catch(() => {
              });
            }
          } else if (res) {
            setListError(messageFor(res, t("manage.loadFailed")));
            setItems([]);
            setTotal(0);
          }
          api("manage", { op: "lineage" }).then((res2) => {
            if (res2 && res2.ok && Array.isArray(res2.lineage)) setLineage(res2.lineage);
          }).catch(() => {
          });
          api("manage", { op: "usage" }).then((res2) => {
            if (res2 && res2.ok) {
              setUsage(res2.bytes || 0);
              setHealth({ gitAvailable: res2.gitAvailable !== false, homeStores: res2.homeStores || 0, fallbackStores: res2.fallbackStores || 0 });
            }
          }).catch(() => {
          });
          api("status", {}).then((res2) => {
            if (res2 && res2.ok) setErrors(res2.errors || []);
          }).catch(() => {
          });
        }).catch(() => {
          api("manage", { op: "usage" }).then((res) => {
            if (res && res.ok) {
              setUsage(res.bytes || 0);
              setHealth({ gitAvailable: res.gitAvailable !== false, homeStores: res.homeStores || 0, fallbackStores: res.fallbackStores || 0 });
            }
          }).catch(() => {
          });
          api("status", {}).then((res) => {
            if (res && res.ok) setErrors(res.errors || []);
          }).catch(() => {
          });
        });
      }
      React.useEffect(() => {
        refresh();
      }, []);
      function clearErrors() {
        setErrors([]);
        api("status", { op: "clear" }).catch(() => {
        });
      }
      function run(op, extra, doneKey) {
        if (state.busy) return;
        setState({ busy: true, message: t("manage.busy"), error: false });
        api("manage", Object.assign({ op }, extra || {})).then((res) => {
          if (res && res.ok) {
            const deleted = res.deleted;
            setState({ busy: false, message: typeof deleted === "number" ? t("manage.deletedCount", { deleted }) : t(doneKey), error: false });
            refresh();
          } else {
            setState({ busy: false, message: res && (res.message || res.error) || t("common.opFailed"), error: true });
          }
        }).catch((e) => setState({ busy: false, message: String(e), error: true }));
      }
      const [expanded, setExpanded] = React.useState(() => /* @__PURE__ */ new Set());
      const [confirming, setConfirming] = React.useState(null);
      function ConfirmRow(props) {
        return React.createElement(
          "div",
          { className: "dsh-recall-tree-confirm" },
          props.text,
          React.createElement("button", { type: "button", className: "dsh-recall-ex-chip dsh-recall-ex-chip-danger", onClick: props.onConfirm }, t("common.confirm")),
          React.createElement("button", { type: "button", className: "dsh-recall-ex-chip", onClick: props.onCancel }, t("common.cancel"))
        );
      }
      function renderDeleteAllConfirm() {
        if (!confirming || confirming.kind !== "all") return null;
        return React.createElement(ConfirmRow, {
          text: t("manage.confirm.all"),
          onConfirm: () => {
            setConfirming(null);
            run("deleteAll", {}, "manage.done.deleteAll");
          },
          onCancel: () => setConfirming(null)
        });
      }
      function toggle(key) {
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      }
      const q = query.trim().toLowerCase();
      const filteredItems = q ? (items || []).filter(
        (it) => (it.workspace || "").toLowerCase().indexOf(q) >= 0 || (it.sessionTitle || "").toLowerCase().indexOf(q) >= 0 || (it.messageText || "").toLowerCase().indexOf(q) >= 0 || String(it.id || "").toLowerCase().indexOf(q) >= 0
      ) : items;
      const tree = buildTree2(filteredItems, t);
      const allSessionIds = Array.from(new Set((items || []).map((it) => it.sessionId).filter(Boolean)));
      const versionMap = groupByLineage(allSessionIds, lineage);
      let listById = null;
      try {
        if (sessionsSvc && sessionsSvc.list && typeof sessionsSvc.list.getSnapshot === "function") {
          const snapshot = sessionsSvc.list.getSnapshot();
          listById = snapshot && snapshot.byId || null;
        }
      } catch (e) {
        listById = null;
      }
      let archivedIds = null;
      try {
        const snapshot = workspacesSvc && workspacesSvc.list && typeof workspacesSvc.list.getSnapshot === "function" ? workspacesSvc.list.getSnapshot() : null;
        archivedIds = new Set(snapshot && snapshot.archivedSessionIds || []);
      } catch (e) {
        archivedIds = null;
      }
      function confirmDelete(kind, key, extra, textKey) {
        setConfirming({ kind, key, extra, text: textKey });
      }
      function renderConfirm(kind, key, extra, textKey) {
        if (!confirming || confirming.kind !== kind || confirming.key !== key) return null;
        return React.createElement(ConfirmRow, {
          text: t(textKey),
          onConfirm: () => {
            const c = confirming;
            setConfirming(null);
            run("delete", c.extra, "manage.done.delete");
          },
          onCancel: () => setConfirming(null)
        });
      }
      function renderLeaf(it) {
        const key = "snap-" + it.id;
        const text2 = it.messageText;
        const title = text2 || it.id;
        const label = text2 ? clockText2(it.time) + "  " + text2 : clockText2(it.time) + "  " + it.id.slice(0, 12) + "\u2026";
        return React.createElement(
          "div",
          { className: "dsh-recall-tree-node", key },
          React.createElement(
            "div",
            { className: "dsh-recall-tree-row", title },
            React.createElement("span", { className: "dsh-recall-tree-toggle-placeholder" }),
            React.createElement(
              "span",
              { className: "dsh-recall-tree-label" },
              React.createElement("span", { className: "dsh-recall-tree-title" }, label),
              // issue #31：仅消息条目没有文件树，标出来——否则用户会以为这条能回退文件
              it.files === false ? React.createElement("span", { className: "dsh-recall-tree-tag", key: "message-only" }, t("tree.messageOnly")) : null,
              // 删除紧贴本条消息摘要（而非行尾）：按行扫读时动作落在「看的那一行」，
              // 不必横跳到右侧同列按钮再回读行号
              React.createElement(DeleteButton, {
                title: t("tree.delete.snapshot.title"),
                onClick: () => confirmDelete("snapshot", key, { messageId: it.id, root: it.root || null }, "tree.delete.snapshot.confirm")
              })
            )
          ),
          renderConfirm("snapshot", key, { messageId: it.id, root: it.root || null }, "tree.delete.snapshot.confirm")
        );
      }
      function renderSession(s) {
        const key = "session-" + (s.root || "") + "-" + s.sessionId;
        const open = expanded.has(key);
        const label = s.title || (titlesPending && s.sessionId ? "\u2026" : t("tree.deletedSession"));
        const version = s.sessionId ? versionMap.get(String(s.sessionId)) : null;
        const switchable = Boolean(s.sessionId && listById && listById[s.sessionId] && !(archivedIds && archivedIds.has(String(s.sessionId))));
        return React.createElement(
          "div",
          { className: "dsh-recall-tree-node", key },
          // 整行可点即展开/收起（用户实测反馈：只能精确命中箭头才展开）；行内的
          // 图标/芯片按钮各自 stopPropagation，避免连带折叠。折叠钮仍是键盘与
          // 读屏的可达入口（aria-expanded 播报），行点击只是给鼠标补命中区
          React.createElement(
            "div",
            { className: "dsh-recall-tree-row dsh-recall-tree-row-toggle", onClick: () => toggle(key) },
            // V2：折叠钮 span→button——Tab/Enter/Space 可达，读屏经 aria-expanded
            // 与 aria-label 播报展开语义与节点名；CSS 已做 button 重置防视觉回归。
            React.createElement("button", {
              type: "button",
              className: "dsh-recall-tree-toggle",
              "aria-expanded": open,
              "aria-label": t(open ? "tree.collapse" : "tree.expand", { label }),
              onClick: (e) => {
                e.stopPropagation();
                toggle(key);
              }
            }, chevronIcon(open)),
            React.createElement(
              "span",
              { className: "dsh-recall-tree-label", title: s.sessionId || "" },
              React.createElement("span", { className: "dsh-recall-tree-title" }, label),
              version ? React.createElement("span", { className: "dsh-recall-tree-meta", title: t("tree.family.title", { chain: version.family.join(" \u2192 ") }) }, "v" + version.index + "/" + version.family.length) : null,
              React.createElement("span", { className: "dsh-recall-tree-meta" }, t("tree.snapCount", { n: s.items.length })),
              s.sessionId ? React.createElement(DeleteButton, {
                title: t("tree.delete.session.title"),
                onClick: () => confirmDelete("session", key, { scope: "session", sessionId: s.sessionId, root: s.root || null }, "tree.delete.session.confirm")
              }) : null
            ),
            // 「切换」留在行尾单占右侧：它是导航动作（离开当前视图），与行内
            // 删除的危险动作分开摆放，避免两类语义在同一个位置上误点
            switchable ? React.createElement("button", {
              type: "button",
              className: "dsh-recall-ex-chip",
              title: t("tree.switch.title"),
              onClick: (ev) => {
                ev.stopPropagation();
                try {
                  if (uiWorkspaceSvc && typeof uiWorkspaceSvc.openSession === "function") uiWorkspaceSvc.openSession(s.sessionId);
                  else if (typeof sessionsSvc.open === "function") sessionsSvc.open(s.sessionId);
                } catch (e) {
                }
              }
            }, t("tree.switch")) : null
          ),
          open ? React.createElement("div", { className: "dsh-recall-tree-children" }, ...s.items.map(renderLeaf)) : null,
          s.sessionId ? renderConfirm("session", key, { scope: "session", sessionId: s.sessionId, root: s.root || null }, "tree.delete.session.confirm") : null
        );
      }
      function renderWorkspace(ws) {
        const key = "ws-" + ws.root;
        const open = expanded.has(key);
        const sessionCount = ws.sessions.length;
        const snapCount = ws.sessions.reduce((n, s) => n + s.items.length, 0);
        return React.createElement(
          "div",
          { className: "dsh-recall-tree-node", key },
          // 整行可点即展开/收起，语义与 renderSession 一致
          React.createElement(
            "div",
            { className: "dsh-recall-tree-row dsh-recall-tree-row-toggle", onClick: () => toggle(key) },
            // V2：工作区折叠钮同 renderSession——span→button 键盘化，aria 语义并列播报
            React.createElement("button", {
              type: "button",
              className: "dsh-recall-tree-toggle",
              "aria-expanded": open,
              "aria-label": t(open ? "tree.collapse" : "tree.expand", { label: ws.name }),
              onClick: (e) => {
                e.stopPropagation();
                toggle(key);
              }
            }, chevronIcon(open)),
            React.createElement(
              "span",
              { className: "dsh-recall-tree-label", title: ws.root || "" },
              React.createElement("span", { className: "dsh-recall-tree-name" }, ws.name),
              React.createElement("span", { className: "dsh-recall-tree-meta" }, t("tree.wsCount", { n: sessionCount, m: snapCount })),
              ws.root ? React.createElement(DeleteButton, {
                title: t("tree.delete.workspace.title"),
                onClick: () => confirmDelete("workspace", key, { scope: "workspace", root: ws.root }, "tree.delete.workspace.confirm")
              }) : null
            )
          ),
          open ? React.createElement("div", { className: "dsh-recall-tree-children" }, ...ws.sessions.map(renderSession)) : null,
          ws.root ? renderConfirm("workspace", key, { scope: "workspace", root: ws.root }, "tree.delete.workspace.confirm") : null
        );
      }
      const treeNodes = tree.map(renderWorkspace);
      const loaded = items ? items.length : null;
      const countText = loaded === null ? t("manage.countLoading") : t("manage.countLoaded", { total }) + (limit < total ? t("manage.countShown", { shown: loaded }) : "");
      function errorLine(e, key) {
        const kindKey = e.kind ? "errorKind." + e.kind : "";
        const localized = kindKey !== "" && hasTranslation(kindKey);
        const base = localized ? t(kindKey) + (typeof e.count === "number" && e.count > 1 ? t("manage.errors.dup", { n: e.count }) : "") : String(e.hint || e.message || "");
        return React.createElement("div", { className: "dsh-recall-ex-note", key, title: e.message || "" }, clockText2(e.time) + "  " + base);
      }
      function loadMore() {
        const next = Math.min(Math.max(total, limit), 2e3);
        if (next <= limit) return;
        setLimit(next);
        refresh(next);
      }
      return React.createElement(
        "div",
        { className: "dsh-recall-ex-card" },
        // 不再渲染「快照管理」内标题：折叠头（SectionToggle）已承担分区标题
        // 角色，展开后再出现同名大标题是纯重复（实测观感噪音）；计数 note 紧跟
        // 折叠头，信息层级 = 折叠头（标题）→ 计数/健康（摘要）→ 搜索 → 树。
        React.createElement(
          "div",
          { className: "dsh-recall-ex-note" },
          usage === null ? countText + t("manage.countEnd") : countText + t("manage.usageSuffix", { size: sizeText2(usage) })
        ),
        // V6 健康行徽章化：git 状态用彩色 pill（成功/失败，官方状态行配对），
        // 从普通 note 提升为卡片顶部横幅（渲染在搜索框与树之前）；存储计数
        // 维持文字，避免 pill 堆叠丢失信息。
        health ? React.createElement(
          "div",
          { className: "dsh-recall-ex-note", key: "health" },
          React.createElement("span", {
            className: "dsh-recall-health-pill " + (health.gitAvailable ? "dsh-recall-health-pill-ok" : "dsh-recall-health-pill-bad"),
            title: t("manage.health.gitTitle")
          }, t(health.gitAvailable ? "manage.health.gitOk" : "manage.health.gitBad")),
          t("manage.health.stores", { n: health.homeStores }) + (health.fallbackStores ? t("manage.health.storesFallback", { n: health.fallbackStores }) : "")
        ) : null,
        // 搜索行：图标绝对定位在框内左侧（pointer-events:none 不挡点击），输入框
        // 靠 padding-left 让出图标位；高度由 CSS 的 .dsh-recall-search 覆写加高 20%
        React.createElement(
          "div",
          { className: "dsh-recall-search" },
          React.createElement(
            "svg",
            {
              className: "dsh-recall-search-icon",
              width: 16,
              height: 16,
              viewBox: "0 0 48 48",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 4,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              "aria-hidden": true
            },
            React.createElement("path", { d: "M21 38C30.3888 38 38 30.3888 38 21C38 11.6112 30.3888 4 21 4C11.6112 4 4 11.6112 4 21C4 30.3888 11.6112 38 21 38Z" }),
            React.createElement("path", { d: "M26.657 14.3431C25.2093 12.8954 23.2093 12 21.0001 12C18.791 12 16.791 12.8954 15.3433 14.3431" }),
            React.createElement("path", { d: "M33.2216 33.2217L41.7069 41.707" })
          ),
          React.createElement("input", {
            className: "dsh-recall-ex-input",
            placeholder: t("manage.search.placeholder"),
            "aria-label": t("manage.search.aria"),
            value: query,
            spellCheck: false,
            onChange: (e) => setQuery(e.target.value)
          })
        ),
        // 读取失败提示：role=alert 让读屏立即播报；「重试」复用 refresh，不新造入口
        listError ? React.createElement(
          "div",
          { key: "list-error", className: "dsh-recall-list-error", role: "alert" },
          React.createElement("span", { className: "dsh-recall-list-error-text" }, listError),
          React.createElement("button", { type: "button", className: "dsh-recall-ex-chip", onClick: () => refresh() }, t("common.retry"))
        ) : null,
        // V3 加载骨架：items===null 表示首查未回——用 5 条 pulse 灰条占位替代
        // 打开快照管理时的一段空白；aria-hidden 纯装饰不打扰读屏
        items === null ? React.createElement(
          "div",
          { className: "dsh-recall-tree-skeleton", "aria-hidden": true },
          ...[1, 2, 3, 4, 5].map((n) => React.createElement("div", { key: "sk-" + n, className: "dsh-recall-tree-skeleton-row" }))
        ) : null,
        treeNodes.length > 0 ? React.createElement("div", { className: "dsh-recall-tree" }, ...treeNodes) : null,
        items && items.length === 0 && !q ? React.createElement("div", { className: "dsh-recall-empty", key: "empty" }, t("manage.empty")) : null,
        q && filteredItems && filteredItems.length === 0 ? React.createElement("div", { className: "dsh-recall-empty", key: "no-match" }, t("manage.emptyFiltered")) : null,
        renderDeleteAllConfirm(),
        // V6：错误区从卡片最底上移到操作区上方（fail-loud 可见性）；标题
        // error 色带条数徽章，时间戳格式维持原样
        errors && errors.length > 0 ? React.createElement(
          "div",
          { key: "errors" },
          React.createElement("div", { className: "dsh-recall-errors-title" }, t("manage.errors.title", { n: errors.length })),
          (showAllErrors ? errors : errors.slice(0, 5)).map(errorLine),
          React.createElement(
            "div",
            { className: "dsh-recall-panel-actions" },
            errors.length > 5 ? React.createElement("button", { type: "button", className: "dsh-recall-ex-chip", onClick: () => setShowAllErrors((v) => !v) }, showAllErrors ? t("manage.errors.collapse") : t("manage.errors.expand", { n: errors.length })) : null,
            React.createElement("button", { type: "button", className: "dsh-recall-ex-chip", onClick: clearErrors }, t("manage.errors.clear"))
          )
        ) : null,
        React.createElement(
          "div",
          { className: "dsh-recall-panel-actions" },
          state.message ? React.createElement("span", { role: "status", "aria-live": "polite", className: "dsh-recall-ex-status" + (state.error ? " dsh-recall-ex-status-error" : " dsh-recall-ex-status-success") }, (state.error ? t("common.errorPrefix") : "") + state.message) : null,
          limit < total ? React.createElement("button", {
            type: "button",
            className: "dsh-recall-btn",
            disabled: state.busy,
            onClick: loadMore
          }, t("manage.loadMore")) : null,
          React.createElement("button", { type: "button", className: "dsh-recall-btn", disabled: state.busy, onClick: () => refresh() }, t("manage.refresh")),
          React.createElement("button", {
            type: "button",
            className: "dsh-recall-btn",
            disabled: state.busy,
            title: t("manage.gc.title"),
            onClick: () => run("gc", {}, "manage.done.gc")
          }, t("manage.gc")),
          // V5：全部删除固定为操作区最后一个按钮（排在立即 gc 之后）——即使
          // 「加载更多」出现/消失也不漂移；danger 与普通按钮间在 panel-actions
          // 统一 gap:8px 之上再加 btn-gap 的 8px 物理间隔，危险按钮与常规按钮
          // 拉开距离防误点
          React.createElement("button", {
            type: "button",
            className: "dsh-recall-btn dsh-recall-btn-danger dsh-recall-btn-gap",
            disabled: state.busy,
            title: t("manage.deleteAll.title"),
            onClick: () => setConfirming({ kind: "all" })
          }, t("manage.deleteAll"))
        )
      );
    }
    return { ManageCard };
  }

  // src/client/settings-cards.ts
  function buildSettingsCards(React, util, sessionsSvc, workspacesSvc, uiWorkspaceSvc) {
    function SectionToggle(props) {
      return React.createElement(
        "button",
        {
          type: "button",
          className: "dsh-recall-cardbtn" + (props.divider ? " dsh-recall-section-divider" : ""),
          "aria-expanded": props.open,
          onClick: props.onToggle
        },
        // 标题在前、chevron 收尾（官方卡片头同为「左标题 + 右 chevron」）：chevron
        // 在前的布局会把标题推到 18px 盒 + 12px gap 之后，实测与上方分组标题
        // （cfg-group）左缘差出约 30px、视觉上不齐；标题独占行首后与分组标题、
        // 表单标签共享同一条左缘线
        React.createElement("span", { className: "dsh-recall-section-title" }, props.title),
        props.meta ? React.createElement("span", { className: "dsh-recall-tree-meta" }, props.meta) : null,
        // 向下字形 14px chevron：收起不旋转、展开 rotate(180deg) 朝上（transition
        // .16s）；读屏状态由 aria-expanded 播报，字形只承担可点提示
        React.createElement("svg", {
          width: 14,
          height: 14,
          viewBox: "0 0 16 16",
          className: "dsh-recall-section-chevron" + (props.open ? " dsh-recall-section-chevron-open" : ""),
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.5,
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }, React.createElement("path", { d: "M4 6l4 4 4-4" }))
      );
    }
    const { ConfigForm } = buildConfigForm(React, util, SectionToggle);
    const { ExcludeFilesSection } = buildExcludeCards(React, util);
    const { ManageCard } = buildSnapshotManager(React, util, sessionsSvc, workspacesSvc, uiWorkspaceSvc);
    const { t } = util;
    function RecallSettingsCard() {
      const [sections, setSections] = React.useState({ exclude: false, manage: false });
      const [, setLocaleTick] = React.useState(0);
      const notifyLocale = React.useCallback(() => setLocaleTick((n) => n + 1), []);
      function toggle(key) {
        setSections((prev) => Object.assign({}, prev, { [key]: !prev[key] }));
      }
      return React.createElement(
        "li",
        { className: "dsh-recall-settings" },
        React.createElement(
          "div",
          { className: "dsh-recall-settings-body" },
          React.createElement(ConfigForm, { onLocaleApplied: notifyLocale }),
          React.createElement(SectionToggle, { title: t("section.exclude"), open: sections.exclude, onToggle: () => toggle("exclude") }),
          // section-body 只做纵向间距与展开入场动画，不带描边/底色：外层卡片框
          // 去掉后内容区再套一层框等于把「去包裹」加回来（用户实测反馈）。「高级：
          // 基础排除表」不包——它在 cfg-grid 内本就走通栏，且 label 列对齐依赖
          // grid item 身份，包容器会破坏跨行对齐。
          sections.exclude ? React.createElement("div", { className: "dsh-recall-section-body" }, React.createElement(ExcludeFilesSection)) : null,
          React.createElement(SectionToggle, { title: t("section.manage"), open: sections.manage, onToggle: () => toggle("manage") }),
          sections.manage ? React.createElement("div", { className: "dsh-recall-section-body" }, React.createElement(ManageCard)) : null
        )
      );
    }
    return { RecallSettingsCard };
  }

  // src/client/version-pager.ts
  function currentSessionId() {
    if (activeSession.id) return activeSession.id;
    if (typeof document === "undefined") return "";
    const rows = document.querySelectorAll("[data-recall-session]");
    const last = rows.length > 0 ? rows[rows.length - 1] : null;
    return last ? last.getAttribute("data-recall-session") || "" : "";
  }
  function isLastTurnTail(node) {
    if (!node || typeof document === "undefined") return false;
    const own = node.closest("[data-turn-tail]");
    if (!own) return false;
    const all = document.querySelectorAll("[data-turn-tail]");
    return all.length === 0 || all[all.length - 1] === own;
  }
  function scrollerOf(node) {
    let cur = node ? node.parentElement : null;
    while (cur) {
      if (cur instanceof HTMLElement && cur.scrollHeight > cur.clientHeight) {
        const style = typeof getComputedStyle === "function" ? getComputedStyle(cur) : null;
        if (style && /(auto|scroll)/.test(style.overflowY)) return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }
  function captureAnchor() {
    if (typeof document === "undefined") return null;
    const rows = document.querySelectorAll("[data-chat-anchor-key]");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rect = row.getBoundingClientRect();
      if (rect.bottom > 0) {
        const key = row.getAttribute("data-chat-anchor-key") || "";
        return key ? { key, top: rect.top } : null;
      }
    }
    return null;
  }
  function restoreAnchor(scroller, anchor) {
    if (!scroller || !anchor || typeof document === "undefined") return;
    const rows = document.querySelectorAll("[data-chat-anchor-key]");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.getAttribute("data-chat-anchor-key") !== anchor.key) continue;
      const delta = row.getBoundingClientRect().top - anchor.top;
      if (Math.abs(delta) > 1) scroller.scrollTop += delta;
      return;
    }
  }
  var READY_TIMEOUT_MS = 5e3;
  function pagerClass(variant) {
    return variant === "header" ? "dsh-recall-pager dsh-recall-pager-header" : "dsh-recall-pager";
  }
  function buildVersionPager(React, util, workspacesSvc, uiWorkspaceSvc) {
    const { t, showThrottledToast } = util;
    let pending = null;
    let archiving = false;
    let primarySessionId = null;
    const headerListeners = /* @__PURE__ */ new Set();
    function setPrimarySessionId(sessionId) {
      if (primarySessionId === sessionId) return;
      primarySessionId = sessionId;
      for (const notify of headerListeners) notify();
    }
    function settlePending(sessionId) {
      const job = pending;
      if (!job || job.to !== sessionId) return;
      pending = null;
      if (job.timer) clearTimeout(job.timer);
      archiving = true;
      Promise.resolve().then(() => workspacesSvc.archiveSession(job.from)).catch((error) => {
        showThrottledToast(t("toast.pagerFailed", { error: String(error).slice(0, 120) }));
      }).then(() => {
        archiving = false;
        job.done();
      });
    }
    function PagerView(props) {
      const variant = props.variant === "header" ? "header" : "message";
      const sessionId = variant === "header" ? String(props.sessionId || "") : String(props.sessionId || currentSessionId());
      const ref = React.useRef(null);
      const [family, setFamily] = React.useState(null);
      const [visible, setVisible] = React.useState(false);
      const [primaryPresent, setPrimaryPresent] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      React.useEffect(() => {
        if (props.sessionId) settlePending(props.sessionId);
        if (variant === "header") {
          setFamily(familyOf(sessionId));
          const sync = () => setPrimaryPresent(primarySessionId === sessionId);
          sync();
          headerListeners.add(sync);
          return () => {
            headerListeners.delete(sync);
          };
        }
        const measure = () => {
          const nextFamily = familyOf(sessionId);
          const nextVisible = isLastTurnTail(ref.current);
          setFamily(nextFamily);
          setVisible(nextVisible);
          setPrimarySessionId(nextVisible && nextFamily && nextFamily.ids.length >= 2 ? sessionId : null);
        };
        measure();
        const timer = setTimeout(measure, 60);
        return () => {
          clearTimeout(timer);
          if (primarySessionId === sessionId) setPrimarySessionId(null);
        };
      }, [variant, sessionId, props.messageId]);
      const show = Boolean(family && family.ids.length >= 2 && (variant === "header" ? !primaryPresent : visible));
      if (!show || !family) {
        return React.createElement("div", { className: pagerClass(variant), ref });
      }
      const total = family.ids.length;
      const index = family.index;
      const go = (delta) => {
        if (busy || pending || archiving) return;
        const target = family.ids[index + delta];
        if (!target) return;
        const current = family.ids[index];
        if (!current || current === target) return;
        setBusy(true);
        const scroller = scrollerOf(ref.current);
        const anchor = captureAnchor();
        const done = () => setBusy(false);
        const job = { from: current, to: target, done };
        pending = job;
        job.timer = setTimeout(() => {
          if (pending !== job) return;
          pending = null;
          showThrottledToast(t("toast.pagerFailed", { error: t("pager.openUnconfirmed") }));
          done();
        }, READY_TIMEOUT_MS);
        let targetWasArchived = false;
        try {
          const snapshot = workspacesSvc.list && workspacesSvc.list.getSnapshot();
          targetWasArchived = Boolean(snapshot && snapshot.archivedSessionIds && snapshot.archivedSessionIds.includes(target));
        } catch (e) {
        }
        let unarchived = false;
        let navigationReturned = false;
        Promise.resolve().then(() => uiWorkspaceSvc && typeof uiWorkspaceSvc.unarchiveSession === "function" ? uiWorkspaceSvc.unarchiveSession(target) : void 0).then(() => {
          unarchived = true;
          if (uiWorkspaceSvc && typeof uiWorkspaceSvc.openSession === "function") uiWorkspaceSvc.openSession(target);
          navigationReturned = true;
          setTimeout(() => restoreAnchor(scroller, anchor), 80);
          setTimeout(() => restoreAnchor(scroller, anchor), 320);
        }).catch(async (error) => {
          if (pending === job) {
            if (job.timer) clearTimeout(job.timer);
            pending = null;
          }
          if (unarchived && !navigationReturned && targetWasArchived && uiWorkspaceSvc) {
            try {
              await uiWorkspaceSvc.archiveSession(target);
            } catch (e) {
            }
          }
          showThrottledToast(t("toast.pagerFailed", { error: String(error).slice(0, 120) }));
          done();
        });
      };
      return React.createElement(
        "div",
        { className: pagerClass(variant), ref, "data-busy": busy ? "true" : void 0 },
        React.createElement("button", {
          type: "button",
          className: "dsh-recall-pager-btn",
          "aria-label": t("pager.prev"),
          title: t("pager.prev"),
          disabled: busy || index <= 0,
          onClick: () => go(-1)
        }, "\u2039"),
        React.createElement("span", { className: "dsh-recall-pager-count", "aria-label": t("pager.label", { n: index + 1, total }) }, index + 1 + "/" + total),
        React.createElement("button", {
          type: "button",
          className: "dsh-recall-pager-btn",
          "aria-label": t("pager.next"),
          title: t("pager.next"),
          disabled: busy || index >= total - 1,
          onClick: () => go(1)
        }, "\u203A")
      );
    }
    function VersionPager(props) {
      return React.createElement(PagerView, { ...props, variant: "message" });
    }
    function VersionHeaderAction(props) {
      return React.createElement(PagerView, { ...props, variant: "header" });
    }
    return { VersionPager, VersionHeaderAction };
  }

  // src/client/app.ts
  function nextShadowPriority(entries, key) {
    let priority = -1;
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || !entry.options || entry.options.key !== key) continue;
      const p = entry.options.priority;
      const occupied = typeof p === "number" && Number.isFinite(p) ? p : 0;
      if (occupied <= priority) priority = occupied - 1;
    }
    return priority;
  }
  function createApp(React) {
    return function apply(ctx) {
      const slots = ctx.slots;
      if (!slots) return;
      const sessionsSvc = ctx.sessions;
      const workspacesSvc = ctx.workspaces;
      const stylesSvc = ctx.get("styles");
      if (stylesSvc && typeof stylesSvc.insert === "function") {
        stylesSvc.insert(CSS);
      } else if (typeof document !== "undefined") {
        const tag = document.createElement("style");
        tag.setAttribute("data-plugin", "dsh-recall-plugin");
        tag.textContent = CSS;
        document.head.appendChild(tag);
      }
      const util = buildUtil();
      const uiWorkspaceSvc = ctx.uiWorkspace;
      const { UserRecallNode } = buildRecallNode(React, util, ctx, sessionsSvc, workspacesSvc, uiWorkspaceSvc);
      const { RecallSettingsCard } = buildSettingsCards(React, util, sessionsSvc, workspacesSvc, uiWorkspaceSvc);
      const { VersionPager, VersionHeaderAction } = buildVersionPager(React, util, workspacesSvc, uiWorkspaceSvc);
      for (const slotKey of ["user", "steering"]) {
        try {
          slots.inject("conversation.chat.node", () => {
            const priority = nextShadowPriority(slots.entries("conversation.chat.node"), slotKey);
            return slots.register(
              { name: "conversation.chat.node", key: slotKey, priority },
              UserRecallNode
            );
          });
        } catch (error) {
          appLog.error("slot register failed (" + slotKey + "):", error);
        }
      }
      try {
        slots.inject("conversation.chat.assistant-actions", () => slots.register(
          {
            name: "conversation.chat.assistant-actions",
            id: "recall-version-pager",
            order: 20,
            inject: (sessionId) => ({ sessionId })
          },
          VersionPager
        ));
      } catch (error) {
        appLog.error("version pager register failed:", error);
      }
      try {
        slots.inject("conversation.session.header.actions", () => slots.register(
          {
            name: "conversation.session.header.actions",
            id: "recall-version-header",
            order: 20
          },
          VersionHeaderAction
        ));
      } catch (error) {
        appLog.error("version header action register failed:", error);
      }
      try {
        slots.inject("settings.plugin.item", () => slots.register(
          { name: "settings.plugin.item", key: "dsh-recall" },
          RecallSettingsCard
        ));
      } catch (error) {
        appLog.error("settings card register failed:", error);
      }
      try {
        slots.inject("plugins.bundle.config", () => slots.register(
          { name: "plugins.bundle.config", key: "dsh-recall-plugin" },
          RecallSettingsCard
        ));
      } catch (error) {
        appLog.error("plugin manager config register failed:", error);
      }
      appLog.info("client applied");
    };
  }

  // src/client/entry.ts
  window.__ModuleLoader__.load({
    id: "dsh-recall-plugin",
    factory: (require2) => {
      const React = require2("react");
      return {
        name: "dsh-recall-plugin",
        // uiWorkspace（ui-workspace 的 UiWorkspace）：0.1.6-alpha.2 起 ISessions
        // 移除 open，会话导航（fork 后打开子会话）移交其 openSession——0.1.2-alpha.1
        // 起该服务即存在，声明安全；0.1.1-rc.2 无此服务（同线亦无 sessions/
        // workspaces），声明会令 fiber pending——该线段已从 peer 范围移除
        // （见 compat-audit I37「服务可用性」）。
        inject: ["slots", "sessions", "workspaces", "uiWorkspace", "timer"],
        apply: createApp(React)
      };
    }
  });
})();
