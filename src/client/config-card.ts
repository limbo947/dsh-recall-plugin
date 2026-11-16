/**
 * dsh-recall-plugin — client 插件配置表单卡片（S1 拆分）
 *
 * 从 settings-cards.ts 按域拆出的「插件配置」表单：9 字段 + 恢复默认。纯移动，
 * 零行为变化；依赖注入 React 与 util（api/bytesToMb）。SectionToggle（共享
 * 分区折叠头原子，负责「高级：基础排除表」的展开）由装配层注入，本文件不
 * 反向依赖 settings-cards，避免成环。
 */

import type { ReactApi, UtilApi } from './util.js'
import { useAutoDismissMessage } from './util.js'
import type { ConfigGetResponse, ConfigSetResponse, ConfigResetResponse } from '../types/api.js'

// SectionToggle 的 props 契约（结构类型，装配点由 TS 校验与 settings-cards
// 内的实现一致；不改动其自身定义）
export interface SectionToggleProps {
  title: string
  open: boolean
  onToggle: () => void
  meta?: string
  divider?: boolean
}

// ConfigForm 的 props 契约（可选回调）：语言落地时回调设置外壳——外壳的
// 分区折叠头在 ConfigForm 之外渲染（settings-cards.ts），不重渲染就停在
// 挂载时刻的语言（实弹发现：卡片字段已切 English，而「排除配置/快照管理」
// 两个折叠头仍是中文，直到离开再回到该页重新挂载才跟上）
export interface ConfigFormProps {
  onLocaleApplied?: () => void
}

export function buildConfigForm(
  React: ReactApi,
  util: UtilApi,
  SectionToggle: (props: SectionToggleProps) => import('react').ReactNode
): { ConfigForm: import('react').FunctionComponent<ConfigFormProps> } {
  const { api, bytesToMb, t, setLocalePref } = util

  // 插件配置表单草稿形状（display 层：数字字段为字符串、排除表为换行文本、
  // locale 为三值字符串）
  interface ConfigDraft {
    gcSnaps: string
    gcHours: string
    maxFileBytes: string
    maxWorkspaceBytes: string
    scanBudgetMs: string
    snapshotBudgetMs: string
    maxSnapshotsPerWorkspace: string
    baseExcludes: string
    refillDraft: boolean
    snapshotEnabled: boolean
    // issue #31：只回退消息（不写文件快照）
    messageOnly: boolean
    archiveOriginal: boolean
    editSubmitsImmediately: boolean
    retentionDays: string
    locale: string
    // issue #36：显式快照根（空串＝按 $DSH_HOME 派生）
    storeRoot: string
    [key: string]: string | boolean
  }

  // 插件配置表单：值经 Host 的 settings namespace「dsh-recall」读写，保存即
  // 持久化并热生效。只提交相对基线修改过的字段，避免一次保存把全部字段
  // 标成「用户覆盖」。
  function ConfigForm(props: ConfigFormProps): import('react').ReactNode {
    const [baseline, setBaseline] = React.useState<ConfigDraft | null>(null)
    const [draft, setDraft] = React.useState<ConfigDraft | null>(null)
    const [envLocks, setEnvLocks] = React.useState<Record<string, boolean>>({})
    const [overridden, setOverridden] = React.useState<Record<string, unknown>>({})
    const [writable, setWritable] = React.useState(true)
    const [state, setState] = React.useState({ busy: false, message: '', error: false })
    // V3：成功消息 4s 后自动消退（错误常驻），共享 hook 见 util.ts
    useAutoDismissMessage(React, state, setState)
    const [showAdvanced, setShowAdvanced] = React.useState(false)

    function load(): void {
      api<ConfigGetResponse>('config-get', {}).then((res) => {
        if (res && res.ok) {
          const v = res.values
          const next = {
            gcSnaps: String(v.gcSnaps == null ? '' : v.gcSnaps),
            gcHours: String(v.gcHours == null ? '' : v.gcHours),
            maxFileBytes: bytesToMb(v.maxFileBytes),
            maxWorkspaceBytes: bytesToMb(v.maxWorkspaceBytes),
            // 扫描预算持久化为毫秒、展示为秒（整数）；0 表示不限制，原样显示 0
            scanBudgetMs: String(v.scanBudgetMs == null ? '' : Math.round(Number(v.scanBudgetMs) / 1000)),
            // issue #29：单次快照总时限，同样按秒展示
            snapshotBudgetMs: String(v.snapshotBudgetMs == null ? '' : Math.round(Number(v.snapshotBudgetMs) / 1000)),
            maxSnapshotsPerWorkspace: String(v.maxSnapshotsPerWorkspace == null ? '' : v.maxSnapshotsPerWorkspace),
            baseExcludes: Array.isArray(v.baseExcludes) ? v.baseExcludes.join('\n') : '',
            refillDraft: v.refillDraft !== false,
            snapshotEnabled: v.snapshotEnabled !== false,
            // issue #31：老 Host 无该字段 → 按默认 false（现状）处理
            messageOnly: v.messageOnly === true,
            archiveOriginal: v.archiveOriginal !== false,
            // issue #26：老 Host 的 values 无该字段时按默认 true（与 util 同口径）
            editSubmitsImmediately: v.editSubmitsImmediately !== false,
            retentionDays: String(v.retentionDays == null ? '' : v.retentionDays),
            locale: typeof v.locale === 'string' && v.locale ? v.locale : 'auto',
            // issue #36：老 Host 的 values 无该字段 → 空串（默认按 home 派生）
            storeRoot: typeof v.storeRoot === 'string' ? v.storeRoot : '',
          }
          // 语言随读到的配置落地（设置页立即按新语言渲染）；老 Host 的 values
          // 无 locale 字段时回落 auto（按 navigator.language 解析）
          setLocalePref(next.locale)
          if (props.onLocaleApplied) props.onLocaleApplied()
          setDraft(next)
          setBaseline(next)
          setEnvLocks(res.envLocks || {})
          setOverridden(res.overridden || {})
          setWritable(res.writable !== false)
        } else {
          setState({ busy: false, message: (res && ((res as { message?: string }).message || (res as { error?: string }).error)) || t('config.msg.loadFailed'), error: true })
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }))
    } // ↑ 读取异常落错误态（与响应 ok=false 同显式面，用户可见可重试）

    React.useEffect(() => { load() }, [])

    function edit(key: string, value: string | boolean): void {
      setDraft((d) => Object.assign({}, d, { [key]: value }))
    }

    function save(): void {
      if (state.busy || !draft || !baseline) return
      const patch: Record<string, string | boolean> = {}
      for (const key of ['gcSnaps', 'gcHours', 'maxFileBytes', 'maxWorkspaceBytes', 'scanBudgetMs', 'snapshotBudgetMs', 'maxSnapshotsPerWorkspace', 'baseExcludes', 'refillDraft', 'snapshotEnabled', 'messageOnly', 'archiveOriginal', 'editSubmitsImmediately', 'retentionDays', 'locale', 'storeRoot']) {
        // 按值判空再纳补丁（A6）：draft 是宽松载荷加载来的全量草稿，索引读取
        // 在类型层可能 undefined；未定义的键与基线无从比较，直接跳过（等价于
        // 原实现里「undefined !== 基线值」的隐式行为，只是不再依赖隐式）。
        const value = draft[key]
        if (value !== undefined && value !== baseline[key]) patch[key] = value
      }
      if (!Object.keys(patch).length) {
        setState({ busy: false, message: t('config.msg.noChange'), error: false })
        return
      }
      const clean: Record<string, unknown> = {}
      if (patch.gcSnaps !== undefined) {
        const n = parseInt(String(patch.gcSnaps), 10)
        if (!Number.isFinite(n) || n < 1) { setState({ busy: false, message: t('config.err.gcSnaps'), error: true }); return }
        clean.gcSnaps = n
      }
      if (patch.gcHours !== undefined) {
        const n = parseInt(String(patch.gcHours), 10)
        if (!Number.isFinite(n) || n < 1) { setState({ busy: false, message: t('config.err.gcHours'), error: true }); return }
        clean.gcHours = n
      }
      if (patch.maxFileBytes !== undefined) {
        // display 层是 MB 小数，持久化仍是字节：model 侧不变，往返零改动
        const mb = Number(patch.maxFileBytes)
        if (!Number.isFinite(mb) || mb < 0.01) { setState({ busy: false, message: t('config.err.maxFileBytes'), error: true }); return }
        clean.maxFileBytes = Math.round(mb * 1048576)
      }
      if (patch.maxWorkspaceBytes !== undefined) {
        // 与 maxFileBytes 同款 MB↔字节往返；0 = 不限制，允许输入
        const mb = Number(patch.maxWorkspaceBytes)
        if (!Number.isFinite(mb) || mb < 0) { setState({ busy: false, message: t('config.err.maxWorkspaceBytes'), error: true }); return }
        clean.maxWorkspaceBytes = Math.round(mb * 1048576)
      }
      if (patch.scanBudgetMs !== undefined) {
        // 展示单位是秒，持久化毫秒；0 = 不限制
        const s = Number(patch.scanBudgetMs)
        if (!Number.isFinite(s) || s < 0) { setState({ busy: false, message: t('config.err.scanBudgetMs'), error: true }); return }
        clean.scanBudgetMs = Math.round(s * 1000)
      }
      if (patch.snapshotBudgetMs !== undefined) {
        // issue #29：展示秒、持久化毫秒；0 = 不限制
        const s = Number(patch.snapshotBudgetMs)
        if (!Number.isFinite(s) || s < 0) { setState({ busy: false, message: t('config.err.snapshotBudgetMs'), error: true }); return }
        clean.snapshotBudgetMs = Math.round(s * 1000)
      }
      if (patch.maxSnapshotsPerWorkspace !== undefined) {
        const n = parseInt(String(patch.maxSnapshotsPerWorkspace), 10)
        if (!Number.isFinite(n) || n < 0) { setState({ busy: false, message: t('config.err.maxSnapshots'), error: true }); return }
        clean.maxSnapshotsPerWorkspace = n
      }
      if (patch.refillDraft !== undefined) clean.refillDraft = Boolean(patch.refillDraft)
      if (patch.snapshotEnabled !== undefined) clean.snapshotEnabled = Boolean(patch.snapshotEnabled)
      if (patch.messageOnly !== undefined) clean.messageOnly = Boolean(patch.messageOnly)
      if (patch.archiveOriginal !== undefined) clean.archiveOriginal = Boolean(patch.archiveOriginal)
      if (patch.editSubmitsImmediately !== undefined) clean.editSubmitsImmediately = Boolean(patch.editSubmitsImmediately)
      if (patch.retentionDays !== undefined) {
        const n = parseInt(String(patch.retentionDays), 10)
        if (!Number.isFinite(n) || n < 0) { setState({ busy: false, message: t('config.err.retentionDays'), error: true }); return }
        clean.retentionDays = n
      }
      // locale：选项由 select 固定枚举，非法值理论上不可达；仍收窄到三值
      //（直调 API / 脏 payload 时由 Host 侧白名单再拒一次）
      if (patch.locale !== undefined) {
        const v = String(patch.locale)
        if (v !== 'auto' && v !== 'zh' && v !== 'en') { setState({ busy: false, message: t('config.err.locale'), error: true }); return }
        clean.locale = v
      }
      if (patch.baseExcludes !== undefined) {
        clean.baseExcludes = String(patch.baseExcludes).split('\n').map((l) => l.trim()).filter(Boolean)
      }
      // issue #36：显式快照根。空串＝默认（home 派生）；非空必须是绝对路径，
      // 判据与 host 端点同源（win32 盘符/UNC、POSIX 以 / 开头）
      if (patch.storeRoot !== undefined) {
        const v = String(patch.storeRoot).trim()
        if (v && !/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(v)) {
          setState({ busy: false, message: t('config.err.storeRoot'), error: true })
          return
        }
        clean.storeRoot = v
      }
      setState({ busy: true, message: t('config.msg.saving'), error: false })
      api<ConfigSetResponse>('config-set', { patch: clean }).then((res) => {
        if (res && res.ok) {
          // 语言补丁先本地落地再报成功：否则「已保存并即时生效」用切换前的
          // 旧语言渲染（实弹发现：卡片已英文、提示仍中文——提示是保存时刻
          // 取词的字符串，落地顺序决定它跟哪一边）
          if (clean.locale !== undefined) setLocalePref(clean.locale)
          setState({ busy: false, message: t('config.msg.saved'), error: false })
          load()
        } else {
          setState({ busy: false, message: (res && ((res as { message?: string }).message || (res as { error?: string }).error)) || t('config.msg.saveFailed'), error: true })
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }))
    } // ↑ 保存异常落错误态（显式面同上，失败可重试）

    function numRow(key: string, label: string, hint: string, opts?: { min?: number; step?: number; suffixKey?: string }): import('react').ReactNode {
      const locked = Boolean(envLocks && envLocks[key])
      const changed = Boolean(draft && baseline && draft[key] !== baseline[key])
      return React.createElement('div', { className: 'dsh-recall-cfg-row', key: key },
        // V4：标签上提为 cfg-row 直接子元素——grid 第一列（max-content）跨行
        // 对齐最长标签，消灭 130px 定宽魔法数与 hint 138px 缩进耦合。
        // 标签用 span + aria-labelledby 而非 label[for]：label 关联会让点击左侧
        // 标签直接触发右侧控件（输入框被聚焦），用户实测反馈为误触
        React.createElement('span', { className: 'dsh-recall-cfg-label', id: 'dsh-recall-cfg-label-' + key }, label),
        // 控件行（grid 第二列）与说明文字（第三列）分别为独立 grid item：三列
        // 各自成像，说明列起点由该列列宽统一决定——说明若跟在控件后面按流排，
        // 起笔位置会随行内 tag（条/小时/MB/天）的宽度逐行漂移（实测逐行参差）
        React.createElement('div', { className: 'dsh-recall-cfg-line' },
          React.createElement('input', {
            id: 'dsh-recall-cfg-' + key,
            'aria-labelledby': 'dsh-recall-cfg-label-' + key,
            className: 'dsh-recall-cfg-input',
            type: 'number',
            value: draft ? draft[key] : '',
            disabled: locked || !writable,
            min: opts && opts.min,
            step: opts && opts.step,
            onChange: (e: import('react').ChangeEvent<HTMLInputElement>) => edit(key, e.target.value),
          }),
          opts && opts.suffixKey ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, t(opts.suffixKey)) : null,
          changed && !locked ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, t('config.tag.modified')) : null,
          overridden && overridden[key] !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, t('config.tag.overridden')) : null,
          locked ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-locked' }, t('config.tag.locked')) : null
        ),
        React.createElement('div', { className: 'dsh-recall-cfg-hint' }, hint)
      )
    }

    // 文本行（issue #36 显式快照根）：与 numRow 同构（标签上提 + 控件行 +
    // 说明），只是 type=text、无单位后缀。路径本身说明一切，占位符只提示
    // 「留空＝默认」，不塞示例路径（两个平台写法不同、写一个必误导另一个）
    function textRow(key: string, label: string, hint: string, placeholder?: string): import('react').ReactNode {
      const locked = Boolean(envLocks && envLocks[key])
      const changed = Boolean(draft && baseline && draft[key] !== baseline[key])
      return React.createElement('div', { className: 'dsh-recall-cfg-row', key: key },
        React.createElement('span', { className: 'dsh-recall-cfg-label', id: 'dsh-recall-cfg-label-' + key }, label),
        React.createElement('div', { className: 'dsh-recall-cfg-line' },
          React.createElement('input', {
            id: 'dsh-recall-cfg-' + key,
            'aria-labelledby': 'dsh-recall-cfg-label-' + key,
            className: 'dsh-recall-cfg-input',
            type: 'text',
            value: draft ? draft[key] : '',
            disabled: locked || !writable,
            placeholder: placeholder,
            onChange: (e: import('react').ChangeEvent<HTMLInputElement>) => edit(key, e.target.value),
          }),
          changed && !locked ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, t('config.tag.modified')) : null,
          overridden && overridden[key] !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, t('config.tag.overridden')) : null,
          locked ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-locked' }, t('config.tag.locked')) : null
        ),
        React.createElement('div', { className: 'dsh-recall-cfg-hint' }, hint)
      )
    }

    // 布尔行：官方设置表单的布尔字段是 role=switch 滑钮（dsh-client-ui-settings-
    // plugins 实测），而非原生 checkbox——滑钮形态是 DSH 设置页的强视觉特征。
    // 名称经 aria-labelledby 关联标签文本（button 属 labelable 元素，用 label[for]
    // 关联会让点击标签直接切换开关——误触代价是配置被改），读屏经 role=switch +
    // aria-checked 播报开关语义与状态，不弱于原生 checkbox。
    function boolRow(key: string, label: string, hint: string): import('react').ReactNode {
      const changed = Boolean(draft && baseline && draft[key] !== baseline[key])
      const on = Boolean(draft && draft[key])
      return React.createElement('div', { className: 'dsh-recall-cfg-row', key: key },
        // 标签上提为 cfg-row 直接子元素（与 numRow 同法，V4 跨行对齐契约）
        React.createElement('span', { className: 'dsh-recall-cfg-label', id: 'dsh-recall-cfg-label-' + key }, label),
        // 与 numRow 同法：控件行（第二列）+ 说明（第三列）各自为 grid item。
        // -line-switch 修饰类把滑钮右缘推到数字行输入框的右边框上（滑钮只 36px
        // 宽，左对齐会在右侧留空档、与相邻数字行参差，用户实测反馈）
        React.createElement('div', { className: 'dsh-recall-cfg-line dsh-recall-cfg-line-switch' },
          React.createElement('button', {
            id: 'dsh-recall-cfg-' + key,
            type: 'button',
            role: 'switch',
            'aria-checked': on,
            'aria-labelledby': 'dsh-recall-cfg-label-' + key,
            className: 'dsh-recall-cfg-switch',
            disabled: !writable,
            onClick: () => edit(key, !on),
          }, React.createElement('span', { className: 'dsh-recall-cfg-switch-thumb' })),
          changed ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, t('config.tag.modified')) : null,
          overridden && overridden[key] !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, t('config.tag.overridden')) : null
        ),
        React.createElement('div', { className: 'dsh-recall-cfg-hint' }, hint)
      )
    }

    // 语言行：三值下拉（auto/zh/en）。与数字/滑钮行同构（label + 控件行 +
    // 说明），但控件是原生 select——选项值即配置值，无表单校验面（非法值只
    // 能来自直调 API，Host 侧白名单再拒一次）；两个语言自名（中文 / English）
    // 用本族语写法不做翻译，auto 项走词表（它的语义是「跟随系统」不是语言名）
    function localeRow(): import('react').ReactNode {
      const changed = Boolean(draft && baseline && draft.locale !== baseline.locale)
      return React.createElement('div', { className: 'dsh-recall-cfg-row', key: 'locale' },
        React.createElement('span', { className: 'dsh-recall-cfg-label', id: 'dsh-recall-cfg-label-locale' }, t('config.locale.label')),
        React.createElement('div', { className: 'dsh-recall-cfg-line' },
          React.createElement('select', {
            id: 'dsh-recall-cfg-locale',
            'aria-labelledby': 'dsh-recall-cfg-label-locale',
            className: 'dsh-recall-cfg-select',
            value: draft ? draft.locale : 'auto',
            disabled: !writable,
            onChange: (e: import('react').ChangeEvent<HTMLSelectElement>) => edit('locale', e.target.value),
          },
            React.createElement('option', { value: 'auto' }, t('config.locale.auto')),
            React.createElement('option', { value: 'zh' }, '中文'),
            React.createElement('option', { value: 'en' }, 'English')
          ),
          changed ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, t('config.tag.modified')) : null,
          overridden && overridden.locale !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, t('config.tag.overridden')) : null
        ),
        React.createElement('div', { className: 'dsh-recall-cfg-hint' }, t('config.locale.hint'))
      )
    }

    function resetDefaults(): void {
      if (state.busy || !writable) return
      setState({ busy: true, message: t('config.msg.resetting'), error: false })
      api<ConfigResetResponse>('config-reset', {}).then((res) => {
        if (res && res.ok) {
          load()
          setState({ busy: false, message: t('config.msg.resetDone'), error: false })
        } else {
          setState({ busy: false, message: (res && ((res as { message?: string }).message || (res as { error?: string }).error)) || t('config.msg.resetFailed'), error: true })
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }))
    } // ↑ 恢复默认异常落错误态（显式面同上）

    // draft/baseline 同生同灭（初始同 null、load() 同时赋值）——一并收窄，
    // 渲染区不再需要对 baseline 非空断言
    if (!draft || !baseline) {
      return React.createElement('div', { className: 'dsh-recall-ex-note' }, state.message || t('config.msg.loading'))
    }

    return React.createElement('div', { className: 'dsh-recall-ex-card' },
      // 全部行包进单一 cfg-grid：cfg-row 是 display:contents 透明层（css.ts），
      // 每字段留下标签／控件行／说明三个 grid item，分占第一/二/三列——第一列
      // max-content 由全表单最长标签决定（跨行对齐），第二列同理（说明列起点
      // 逐行齐平）。此前每行是独立 grid 容器，max-content 各算各的，实测参差。
      React.createElement('div', { className: 'dsh-recall-cfg-grid' },
      // V5 表单分组：9 字段平铺 → 「快照行为 / 自动治理 / 界面」三组语义分组
      // 小标题，降低认知负担；「高级：基础排除表」沿用 SectionToggle 折叠，
      // 不重复加标题。
      React.createElement('div', { className: 'dsh-recall-cfg-group' }, t('config.group.snapshot')),
      boolRow('snapshotEnabled', t('config.snapshotEnabled.label'), t('config.snapshotEnabled.hint')),
      // issue #31：只回退消息——紧挨总开关，语义上是「快照写什么」的下一层
      boolRow('messageOnly', t('config.messageOnly.label'), t('config.messageOnly.hint')),
      boolRow('refillDraft', t('config.refillDraft.label'), t('config.refillDraft.hint')),
      boolRow('archiveOriginal', t('config.archiveOriginal.label'), t('config.archiveOriginal.hint')),
      boolRow('editSubmitsImmediately', t('config.editSubmitsImmediately.label'), t('config.editSubmitsImmediately.hint')),
      React.createElement('div', { className: 'dsh-recall-cfg-group' }, t('config.group.auto')),
      // 单位后缀统一挂输入框右侧（与状态标签同基线），不再只藏在说明文字里；
      // 传词表键而非字面量——单位词也是语言事实（条/小时 vs snapshots/hours）
      numRow('gcSnaps', t('config.gcSnaps.label'), t('config.gcSnaps.hint'), { suffixKey: 'config.gcSnaps.suffix', min: 1, step: 1 }),
      numRow('gcHours', t('config.gcHours.label'), t('config.gcHours.hint'), { suffixKey: 'config.gcHours.suffix', min: 1, step: 1 }),
      numRow('maxFileBytes', t('config.maxFileBytes.label'), t('config.maxFileBytes.hint'), { suffixKey: 'config.maxFileBytes.suffix', min: 0.01, step: 0.5 }),
      // issue #24 护栏：单文件上限之外的两道闸（总量 + 扫描耗时），0 = 不限制
      numRow('maxWorkspaceBytes', t('config.maxWorkspaceBytes.label'), t('config.maxWorkspaceBytes.hint'), { suffixKey: 'config.maxWorkspaceBytes.suffix', min: 0, step: 16 }),
      numRow('scanBudgetMs', t('config.scanBudgetMs.label'), t('config.scanBudgetMs.hint'), { suffixKey: 'config.scanBudgetMs.suffix', min: 0, step: 1 }),
      // issue #29：扫描阶段之外还有 add/写索引——单次快照的总时限兜底
      numRow('snapshotBudgetMs', t('config.snapshotBudgetMs.label'), t('config.snapshotBudgetMs.hint'), { suffixKey: 'config.snapshotBudgetMs.suffix', min: 0, step: 30 }),
      numRow('maxSnapshotsPerWorkspace', t('config.maxSnapshotsPerWorkspace.label'), t('config.maxSnapshotsPerWorkspace.hint'), { suffixKey: 'config.maxSnapshotsPerWorkspace.suffix', min: 0, step: 1 }),
      numRow('retentionDays', t('config.retentionDays.label'), t('config.retentionDays.hint'), { suffixKey: 'config.retentionDays.suffix', min: 0, step: 1 }),
      React.createElement('div', { className: 'dsh-recall-cfg-group' }, t('config.group.ui')),
      localeRow(),
      // 操作区在「基础排除表」折叠头之前：按钮服务整个表单（含折叠区之外的字段），
      // 排在折叠头之后会被误读为折叠区内容、折叠时像漏收起（用户实测反馈）；
      // 因此也不把按钮藏进折叠分支——否则折叠基础排除表后将无法保存。
      React.createElement('div', { className: 'dsh-recall-panel-actions' },
        state.message ? React.createElement('span', { role: 'status', 'aria-live': 'polite', className: 'dsh-recall-ex-status' + (state.error ? ' dsh-recall-ex-status-error' : ' dsh-recall-ex-status-success') }, (state.error ? t('common.errorPrefix') : '') + state.message) : null,
        React.createElement('button', { type: 'button', className: 'dsh-recall-btn', disabled: state.busy || !writable, onClick: () => setDraft(baseline ? Object.assign({}, baseline) : null) }, t('common.discard')),
        React.createElement('button', {
          type: 'button',
          className: 'dsh-recall-btn',
          disabled: state.busy || !writable,
          title: t('config.reset.title'),
          onClick: resetDefaults
        }, t('config.reset')),
        // 「保存」是表单唯一主动作，升主色实心按钮；放弃修改/恢复默认维持次级
        // 灰底（同排按钮只有一个视觉焦点，配色令牌经官方主题产物核验，见 css.ts）
        React.createElement('button', { type: 'button', className: 'dsh-recall-btn dsh-recall-btn-primary', disabled: state.busy || !writable, onClick: save }, t('common.save')),
        !writable ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, t('config.tag.readonly')) : null
      ),
      // divider：本条是折叠分区列表的首项，上方分界线把「字段表单」与「折叠
      // 分区」分开（否则保存按钮行紧贴折叠头，读起来像同一组字段）
      React.createElement(SectionToggle, { title: t('config.advanced.title'), open: showAdvanced, onToggle: () => setShowAdvanced((v) => !v), divider: true }),
      showAdvanced ? [
        // issue #36：显式快照根也是环境性配置，与基础排除表同住「高级」区
        textRow('storeRoot', t('config.storeRoot.label'), t('config.storeRoot.hint'), t('config.storeRoot.placeholder')),
        React.createElement('div', { className: 'dsh-recall-cfg-row', key: 'baseExcludes' },
        // V4：标签上提（与 numRow 同法）；cfg-line 只剩 tags，textarea/hint 通栏
        React.createElement('span', { className: 'dsh-recall-cfg-label', id: 'dsh-recall-cfg-label-baseExcludes' }, t('config.baseExcludes.label')),
        React.createElement('div', { className: 'dsh-recall-cfg-line' },
          draft.baseExcludes !== baseline.baseExcludes ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, t('config.tag.modified')) : null,
          overridden && overridden.baseExcludes !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, t('config.tag.overridden')) : null
        ),
        // textarea/hint 加 cfg-span 通栏：折叠区在共享 grid 内展开时，内容若只占
        // 第二列，左侧标签列会成为竖直死区（实测 textarea 被挤窄）；通栏后与
        // 标签/tags 行左缘对齐。名称经 aria-labelledby 给出（与 numRow 同法，
        // 不建立 label 关联）
        React.createElement('textarea', {
          id: 'dsh-recall-cfg-baseExcludes',
          'aria-labelledby': 'dsh-recall-cfg-label-baseExcludes',
          className: 'dsh-recall-cfg-area dsh-recall-cfg-span',
          rows: 4,
          value: draft.baseExcludes,
          disabled: !writable,
          onChange: (e: import('react').ChangeEvent<HTMLTextAreaElement>) => edit('baseExcludes', e.target.value),
        }),
        React.createElement('div', { className: 'dsh-recall-cfg-hint dsh-recall-cfg-span' }, t('config.baseExcludes.hint'))
        )
      ] : null
      )
    )
  }

  return { ConfigForm }
}