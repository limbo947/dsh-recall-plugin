/**
 * dsh-recall-plugin — client 设置卡片装配（S1 拆分后）
 *
 * 原单文件按域拆为三份后，本文件只留装配层：分区折叠头 SectionToggle（共享
 * UI 原子）与撤回卡片外壳 RecallSettingsCard，组装配置表单 / 排除配置 /
 * 快照管理三张卡片。拆分动机见各子模块头部注释；引用路径与导出面保持不变，
 * app.ts 无需改动。
 */

import type { ReactApi, UtilApi } from './util.js'
import type { ClientSessionsService } from '../types/client-contract.js'
import { buildConfigForm } from './config-card.js'
import { buildExcludeCards } from './exclude-card.js'
import { buildSnapshotManager } from './snapshot-manager.js'

export function buildSettingsCards(React: ReactApi, util: UtilApi, sessionsSvc: ClientSessionsService): { RecallSettingsCard: () => import('react').ReactNode } {
  // 分区折叠头：官方卡片列表纵向排布，排除配置/快照管理是重内容，默认折叠、
  // 按需展开（展开后由设置外壳保持挂载，草稿不丢）。作为共享原子注入
  // config-card（见其 SectionToggleProps 契约）。
  function SectionToggle(props: { title: string; open: boolean; onToggle: () => void; meta?: string }): import('react').ReactNode {
    return React.createElement('button', {
      type: 'button',
      className: 'dsh-recall-cardbtn',
      'aria-expanded': props.open,
      onClick: props.onToggle,
    },
      React.createElement('span', { className: 'dsh-recall-tree-toggle' }, props.open ? '▾' : '▸'),
      React.createElement('span', { style: { fontWeight: 600, fontSize: '14px', lineHeight: '22px' } }, props.title),
      props.meta ? React.createElement('span', { className: 'dsh-recall-tree-meta' }, props.meta) : null
    )
  }

  const { ConfigForm } = buildConfigForm(React, util, SectionToggle)
  const { ExcludeFilesSection } = buildExcludeCards(React, util)
  const { ManageCard } = buildSnapshotManager(React, util, sessionsSvc)

  // 「插件配置」分区里的撤回卡片（settings.plugin.item keyed slot，key =
  // Host 端注册的 settings namespace 'dsh-recall'）。整卡默认收起、点卡片头
  // 展开。展开后内含三段：插件配置表单 + 排除配置（折叠）+ 快照管理（折叠）。
  function RecallSettingsCard(): import('react').ReactNode {
    const [open, setOpen] = React.useState(false)
    const [sections, setSections] = React.useState({ exclude: false, manage: false })
    function toggle(key: string): void {
      setSections((prev) => Object.assign({}, prev, { [key]: !(prev as Record<string, boolean>)[key] }))
    }
    return React.createElement('li', { className: 'dsh-recall-card' + (open ? ' dsh-recall-card-open' : '') },
      React.createElement('button', {
        type: 'button',
        className: 'dsh-recall-cardbtn',
        'aria-expanded': open,
        'aria-label': (open ? '收起' : '展开') + ': 撤回插件',
        onClick: () => setOpen((v) => !v),
      },
        React.createElement('span', { className: 'dsh-recall-card-head' },
          React.createElement('span', { className: 'dsh-recall-card-name' }, '撤回插件'),
          React.createElement('span', { className: 'dsh-recall-card-desc' }, '消息撤回（文件快照 + 对话回退）的阈值与治理')
        ),
        React.createElement('svg', {
          width: 14, height: 14, viewBox: '0 0 16 16',
          style: { color: 'var(--dsw-alias-label-tertiary)', flex: 'none', transition: 'transform .16s', transform: open ? 'rotate(180deg)' : 'none' }
        }, React.createElement('path', { d: 'M4 6l4 4 4-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
      ),
      open ? React.createElement('div', { className: 'dsh-recall-card-body' },
        React.createElement(ConfigForm),
        React.createElement(SectionToggle, { title: '排除配置（exclude.txt）', open: sections.exclude, onToggle: () => toggle('exclude') }),
        sections.exclude ? React.createElement(ExcludeFilesSection) : null,
        React.createElement(SectionToggle, { title: '快照管理', open: sections.manage, onToggle: () => toggle('manage') }),
        sections.manage ? React.createElement(ManageCard) : null
      ) : null
    )
  }

  return { RecallSettingsCard }
}