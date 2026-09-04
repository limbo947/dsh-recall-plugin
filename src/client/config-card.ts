/**
 * dsh-recall-plugin — client 插件配置表单卡片（S1 拆分）
 *
 * 从 settings-cards.ts 按域拆出的「插件配置」表单：9 字段 + 恢复默认。纯移动，
 * 零行为变化；依赖注入 React 与 util（api/bytesToMb）。SectionToggle（共享
 * 分区折叠头原子，负责「高级：基础排除表」的展开）由装配层注入，本文件不
 * 反向依赖 settings-cards，避免成环。
 */

import type { ReactApi, UtilApi } from './util.js'
import type { ConfigGetResponse, ConfigSetResponse, ConfigResetResponse } from '../types/api.js'

// SectionToggle 的 props 契约（结构类型，装配点由 TS 校验与 settings-cards
// 内的实现一致；不改动其自身定义）
export interface SectionToggleProps {
  title: string
  open: boolean
  onToggle: () => void
  meta?: string
}

export function buildConfigForm(
  React: ReactApi,
  util: UtilApi,
  SectionToggle: (props: SectionToggleProps) => import('react').ReactNode
): { ConfigForm: () => import('react').ReactNode } {
  const { api, bytesToMb } = util

  // 插件配置表单草稿形状（display 层：数字字段为字符串、排除表为换行文本）
  interface ConfigDraft {
    gcSnaps: string
    gcHours: string
    maxFileBytes: string
    maxSnapshotsPerWorkspace: string
    baseExcludes: string
    refillDraft: boolean
    snapshotEnabled: boolean
    archiveOriginal: boolean
    retentionDays: string
    [key: string]: string | boolean
  }

  // 插件配置表单：值经 Host 的 settings namespace「dsh-recall」读写，保存即
  // 持久化并热生效。只提交相对基线修改过的字段，避免一次保存把全部字段
  // 标成「用户覆盖」。
  function ConfigForm(): import('react').ReactNode {
    const [baseline, setBaseline] = React.useState<ConfigDraft | null>(null)
    const [draft, setDraft] = React.useState<ConfigDraft | null>(null)
    const [envLocks, setEnvLocks] = React.useState<Record<string, boolean>>({})
    const [overridden, setOverridden] = React.useState<Record<string, unknown>>({})
    const [writable, setWritable] = React.useState(true)
    const [state, setState] = React.useState({ busy: false, message: '', error: false })
    const [showAdvanced, setShowAdvanced] = React.useState(false)

    function load(): void {
      api<ConfigGetResponse>('config-get', {}).then((res) => {
        if (res && res.ok) {
          const v = res.values
          const next = {
            gcSnaps: String(v.gcSnaps == null ? '' : v.gcSnaps),
            gcHours: String(v.gcHours == null ? '' : v.gcHours),
            maxFileBytes: bytesToMb(v.maxFileBytes),
            maxSnapshotsPerWorkspace: String(v.maxSnapshotsPerWorkspace == null ? '' : v.maxSnapshotsPerWorkspace),
            baseExcludes: Array.isArray(v.baseExcludes) ? v.baseExcludes.join('\n') : '',
            refillDraft: v.refillDraft !== false,
            snapshotEnabled: v.snapshotEnabled !== false,
            archiveOriginal: v.archiveOriginal !== false,
            retentionDays: String(v.retentionDays == null ? '' : v.retentionDays),
          }
          setDraft(next)
          setBaseline(next)
          setEnvLocks(res.envLocks || {})
          setOverridden(res.overridden || {})
          setWritable(res.writable !== false)
        } else {
          setState({ busy: false, message: (res && ((res as { message?: string }).message || (res as { error?: string }).error)) || '无法读取配置', error: true })
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }))
    }

    React.useEffect(() => { load() }, [])

    function edit(key: string, value: string | boolean): void {
      setDraft((d) => Object.assign({}, d, { [key]: value }))
    }

    function save(): void {
      if (state.busy || !draft || !baseline) return
      const patch: Record<string, string | boolean> = {}
      for (const key of ['gcSnaps', 'gcHours', 'maxFileBytes', 'maxSnapshotsPerWorkspace', 'baseExcludes', 'refillDraft', 'snapshotEnabled', 'archiveOriginal', 'retentionDays']) {
        if (draft[key] !== baseline[key]) patch[key] = draft[key]
      }
      if (!Object.keys(patch).length) {
        setState({ busy: false, message: '没有修改', error: false })
        return
      }
      const clean: Record<string, unknown> = {}
      if (patch.gcSnaps !== undefined) {
        const n = parseInt(String(patch.gcSnaps), 10)
        if (!Number.isFinite(n) || n < 1) { setState({ busy: false, message: '快照条数阈值必须是 >= 1 的整数', error: true }); return }
        clean.gcSnaps = n
      }
      if (patch.gcHours !== undefined) {
        const n = parseInt(String(patch.gcHours), 10)
        if (!Number.isFinite(n) || n < 1) { setState({ busy: false, message: 'gc 小时阈值必须是 >= 1 的整数', error: true }); return }
        clean.gcHours = n
      }
      if (patch.maxFileBytes !== undefined) {
        // display 层是 MB 小数，持久化仍是字节：model 侧不变，往返零改动
        const mb = Number(patch.maxFileBytes)
        if (!Number.isFinite(mb) || mb < 0.01) { setState({ busy: false, message: '文件大小上限至少 0.01 MB', error: true }); return }
        clean.maxFileBytes = Math.round(mb * 1048576)
      }
      if (patch.maxSnapshotsPerWorkspace !== undefined) {
        const n = parseInt(String(patch.maxSnapshotsPerWorkspace), 10)
        if (!Number.isFinite(n) || n < 0) { setState({ busy: false, message: '快照总量上限必须是 >= 0 的整数（0 表示不限制）', error: true }); return }
        clean.maxSnapshotsPerWorkspace = n
      }
      if (patch.refillDraft !== undefined) clean.refillDraft = Boolean(patch.refillDraft)
      if (patch.snapshotEnabled !== undefined) clean.snapshotEnabled = Boolean(patch.snapshotEnabled)
      if (patch.archiveOriginal !== undefined) clean.archiveOriginal = Boolean(patch.archiveOriginal)
      if (patch.retentionDays !== undefined) {
        const n = parseInt(String(patch.retentionDays), 10)
        if (!Number.isFinite(n) || n < 0) { setState({ busy: false, message: '保留天数必须是 >= 0 的整数（0 表示不启用）', error: true }); return }
        clean.retentionDays = n
      }
      if (patch.baseExcludes !== undefined) {
        clean.baseExcludes = String(patch.baseExcludes).split('\n').map((l) => l.trim()).filter(Boolean)
      }
      setState({ busy: true, message: '保存中…', error: false })
      api<ConfigSetResponse>('config-set', { patch: clean }).then((res) => {
        if (res && res.ok) {
          setState({ busy: false, message: '已保存并即时生效', error: false })
          load()
        } else {
          setState({ busy: false, message: (res && ((res as { message?: string }).message || (res as { error?: string }).error)) || '保存失败', error: true })
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }))
    }

    function numRow(key: string, label: string, hint: string, opts?: { min?: number; step?: number; suffix?: string }): import('react').ReactNode {
      const locked = Boolean(envLocks && envLocks[key])
      const changed = Boolean(draft && baseline && draft[key] !== baseline[key])
      return React.createElement('div', { className: 'dsh-recall-cfg-row', key: key },
        React.createElement('div', { className: 'dsh-recall-cfg-line' },
          // V2：数字输入 label/input 经 htmlFor-id 关联（与 checkbox 行既有模式一致），读屏可播报字段名与值
          React.createElement('label', { className: 'dsh-recall-cfg-label', htmlFor: 'dsh-recall-cfg-' + key }, label),
          React.createElement('input', {
            id: 'dsh-recall-cfg-' + key,
            className: 'dsh-recall-cfg-input',
            type: 'number',
            value: draft ? draft[key] : '',
            disabled: locked || !writable,
            min: opts && opts.min,
            step: opts && opts.step,
            onChange: (e: import('react').ChangeEvent<HTMLInputElement>) => edit(key, e.target.value),
          }),
          opts && opts.suffix ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, opts.suffix) : null,
          changed && !locked ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, '已修改') : null,
          overridden && overridden[key] !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, '已覆盖') : null,
          locked ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-locked' }, '环境变量锁定') : null
        ),
        React.createElement('div', { className: 'dsh-recall-cfg-hint' }, hint)
      )
    }

    function resetDefaults(): void {
      if (state.busy || !writable) return
      setState({ busy: true, message: '恢复默认中…', error: false })
      api<ConfigResetResponse>('config-reset', {}).then((res) => {
        if (res && res.ok) {
          load()
          setState({ busy: false, message: '已恢复默认值', error: false })
        } else {
          setState({ busy: false, message: (res && ((res as { message?: string }).message || (res as { error?: string }).error)) || '恢复默认失败', error: true })
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }))
    }

    // draft/baseline 同生同灭（初始同 null、load() 同时赋值）——一并收窄，
    // 渲染区不再需要对 baseline 非空断言
    if (!draft || !baseline) {
      return React.createElement('div', { className: 'dsh-recall-ex-note' }, state.message || '正在读取配置…')
    }

    return React.createElement('div', { className: 'dsh-recall-ex-card' },
      React.createElement('div', { className: 'dsh-recall-cfg-row', key: 'snapshotEnabled' },
        React.createElement('div', { className: 'dsh-recall-cfg-line' },
          React.createElement('label', { className: 'dsh-recall-cfg-label', htmlFor: 'dsh-recall-cfg-snapshot' }, '启用快照'),
          React.createElement('input', {
            id: 'dsh-recall-cfg-snapshot',
            type: 'checkbox',
            checked: Boolean(draft.snapshotEnabled),
            disabled: !writable,
            onChange: (e: import('react').ChangeEvent<HTMLInputElement>) => edit('snapshotEnabled', e.target.checked),
          }),
          draft.snapshotEnabled !== baseline.snapshotEnabled ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, '已修改') : null,
          overridden && overridden.snapshotEnabled !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, '已覆盖') : null
        ),
        React.createElement('div', { className: 'dsh-recall-cfg-hint' }, '关闭后不再新建快照（已有快照仍可撤回），适合临时禁用快照的场合')
      ),
      numRow('gcSnaps', 'gc 触发条数', '每积累多少条快照触发一次 git gc', { min: 1, step: 1 }),
      numRow('gcHours', 'gc 触发小时', '距上次 gc 超过多少小时触发（与条数先到先触发）', { min: 1, step: 1 }),
      numRow('maxFileBytes', '文件大小上限', '超过该大小的文件不进快照、不被回退触碰（单位 MB，支持小数）', { suffix: 'MB', min: 0.01, step: 0.5 }),
      numRow('maxSnapshotsPerWorkspace', '快照总量上限', '每个工作区保留的最大快照数，超限自动删除最旧的；填 0 表示不限制', { min: 0, step: 1 }),
      numRow('retentionDays', '快照保留天数', '按天数保留快照，超期自动删除最旧的；填 0 表示不启用（与快照总数上限各自生效）', { min: 0, step: 1 }),
      React.createElement('div', { className: 'dsh-recall-cfg-row', key: 'refillDraft' },
        React.createElement('div', { className: 'dsh-recall-cfg-line' },
          React.createElement('label', { className: 'dsh-recall-cfg-label', htmlFor: 'dsh-recall-cfg-refill' }, '撤回后回填输入框'),
          React.createElement('input', {
            id: 'dsh-recall-cfg-refill',
            type: 'checkbox',
            checked: Boolean(draft.refillDraft),
            disabled: !writable,
            onChange: (e: import('react').ChangeEvent<HTMLInputElement>) => edit('refillDraft', e.target.checked),
          }),
          draft.refillDraft !== baseline.refillDraft ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, '已修改') : null,
          overridden && overridden.refillDraft !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, '已覆盖') : null
        ),
        React.createElement('div', { className: 'dsh-recall-cfg-hint' }, '撤回成功后把被撤回的消息文本回填到输入框，方便修改后重新发送')
      ),
      React.createElement('div', { className: 'dsh-recall-cfg-row', key: 'archiveOriginal' },
        React.createElement('div', { className: 'dsh-recall-cfg-line' },
          React.createElement('label', { className: 'dsh-recall-cfg-label', htmlFor: 'dsh-recall-cfg-archive' }, '撤回后归档原会话'),
          React.createElement('input', {
            id: 'dsh-recall-cfg-archive',
            type: 'checkbox',
            checked: Boolean(draft.archiveOriginal),
            disabled: !writable,
            onChange: (e: import('react').ChangeEvent<HTMLInputElement>) => edit('archiveOriginal', e.target.checked),
          }),
          draft.archiveOriginal !== baseline.archiveOriginal ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, '已修改') : null,
          overridden && overridden.archiveOriginal !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, '已覆盖') : null
        ),
        React.createElement('div', { className: 'dsh-recall-cfg-hint' }, '撤回后原会话从列表归档隐藏（可从归档找回）；关闭则保留在列表中，方便对照回退前后的上下文')
      ),
      React.createElement(SectionToggle, { title: '高级：基础排除表', open: showAdvanced, onToggle: () => setShowAdvanced((v) => !v) }),
      showAdvanced ? React.createElement('div', { className: 'dsh-recall-cfg-row', key: 'baseExcludes' },
        React.createElement('div', { className: 'dsh-recall-cfg-line' },
          React.createElement('label', { className: 'dsh-recall-cfg-label' }, '基础排除表'),
          draft.baseExcludes !== baseline.baseExcludes ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, '已修改') : null,
          overridden && overridden.baseExcludes !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, '已覆盖') : null
        ),
        React.createElement('textarea', {
          className: 'dsh-recall-cfg-area',
          rows: 4,
          value: draft.baseExcludes,
          disabled: !writable,
          onChange: (e: import('react').ChangeEvent<HTMLTextAreaElement>) => edit('baseExcludes', e.target.value),
        }),
        React.createElement('div', { className: 'dsh-recall-cfg-hint' }, '内置规则，每个工作区共享，建议保持默认；gitignore 语法每行一条，优先级低于「排除配置」里的 exclude.txt（S3-2 折叠）')
      ) : null,
      React.createElement('div', { className: 'dsh-recall-panel-actions' },
        state.message ? React.createElement('span', { role: 'status', 'aria-live': 'polite', className: 'dsh-recall-ex-status' + (state.error ? ' dsh-recall-ex-status-error' : ' dsh-recall-ex-status-success') }, (state.error ? '错误：' : '') + state.message) : null,
        React.createElement('button', { type: 'button', className: 'dsh-recall-btn', disabled: state.busy || !writable, onClick: () => setDraft(baseline ? Object.assign({}, baseline) : null) }, '放弃修改'),
        React.createElement('button', {
          type: 'button',
          className: 'dsh-recall-btn',
          disabled: state.busy || !writable,
          title: '把所有字段恢复到插件出厂默认值',
          onClick: resetDefaults
        }, '恢复默认'),
        React.createElement('button', { type: 'button', className: 'dsh-recall-btn', disabled: state.busy || !writable, onClick: save }, '保存'),
        !writable ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, '只读设置源') : null
      )
    )
  }

  return { ConfigForm }
}