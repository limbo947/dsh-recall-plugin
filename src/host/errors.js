/**
 * dsh-recall-plugin — 错误码单一事实源（H3）
 *
 * 端点响应 code 字段的常量表：此前 code 字符串（STALE/NO_SNAPSHOT/...）
 * 散布各 handler 内联，改一处漏一处。这里集中导出、值保持不变（code 是
 * client 已消费的线上契约，不改值只收拢），每条注释说明触发条件与 client
 * 预期行为。client 侧按 code 映射展示文案（见 client.js CODE_TEXT），未
 * 命中回退 host 返回的 message——机器码与人文案分层，为将来 locale 留口
 * （当前插件单语，不预建 i18n 抽象）。
 */

// 预览后项目文件变化（P0-3 STALE total 比对失败）——client 自动重新预览
export const RECALL_STALE = 'STALE'
// 目标消息没有可用项目快照（未捕获/已删除）
export const RECALL_NO_SNAPSHOT = 'NO_SNAPSHOT'
// 快照存储不可用（store 未建/已失配）
export const RECALL_NO_STORE = 'NO_STORE'
// 目标工作区 agent 运行中（P0-1 保护，preview/execute 双处拒绝）
export const RECALL_AGENT_BUSY = 'AGENT_BUSY'
// 回退失败（H1）——可能已自动救援恢复；message 携带救援结果
export const RECALL_ROLLBACK_FAILED = 'ROLLBACK_FAILED'
// 排除配置写入路径不在已知白名单内（防「借 API 写任意文件」）
export const RECALL_UNKNOWN_PATH = 'UNKNOWN_PATH'
// 配置字段类型/取值非法
export const RECALL_BAD_TYPE = 'BAD_TYPE'
// 配置补丁为空（无可写字段）
export const RECALL_EMPTY_PATCH = 'EMPTY_PATCH'
// settings 服务未组装（非 web 部署 / 未挂载）
export const RECALL_SETTINGS_UNAVAILABLE = 'SETTINGS_UNAVAILABLE'
// settings.update 写入被拒
export const RECALL_SETTINGS_WRITE_FAILED = 'SETTINGS_WRITE_FAILED'
// 请求体超过 1MB 上限（errBody 统一映射）
export const RECALL_BODY_TOO_LARGE = 'BODY_TOO_LARGE'
// 系统异常/未分类错误兜底（errBody 统一映射）
export const RECALL_ERROR = 'ERROR'
// 无法解析当前工作区（manage usage/delete）
export const RECALL_NO_ROOT = 'NO_ROOT'
// 缺少会话 ID（manage delete scope=session）
export const RECALL_NO_SESSION = 'NO_SESSION'
// 管理操作部分完成（deleteAll 有 store 失败）
export const RECALL_PARTIAL_DELETE = 'PARTIAL_DELETE'
// 未知管理操作（manage 端点 op 未识别）
export const RECALL_UNKNOWN_OP = 'UNKNOWN_OP'
// 未知 API 端点（webServer 路由 404）
export const RECALL_UNKNOWN_ENDPOINT = 'UNKNOWN_ENDPOINT'

// 语义锚点：H2 的索引损坏经 status 端点 errors 通道暴露（recordError 文本
// 前缀 'recall index corrupt'），不作为端点 code 返回。保留单一命名供
// 一致性扫描与未来若要升级为端点 code 时复用，避免「损坏」这一事实在
// 代码里无归属。
export const RECALL_INDEX_CORRUPT = 'INDEX_CORRUPT'

// 全量常量集合：供单测做「端点返回的 code 都在表内」的一致性扫描
export const ALL_CODES = Object.freeze([
  RECALL_STALE,
  RECALL_NO_SNAPSHOT,
  RECALL_NO_STORE,
  RECALL_AGENT_BUSY,
  RECALL_ROLLBACK_FAILED,
  RECALL_UNKNOWN_PATH,
  RECALL_BAD_TYPE,
  RECALL_EMPTY_PATCH,
  RECALL_SETTINGS_UNAVAILABLE,
  RECALL_SETTINGS_WRITE_FAILED,
  RECALL_BODY_TOO_LARGE,
  RECALL_ERROR,
  RECALL_NO_ROOT,
  RECALL_NO_SESSION,
  RECALL_PARTIAL_DELETE,
  RECALL_UNKNOWN_OP,
  RECALL_UNKNOWN_ENDPOINT,
  RECALL_INDEX_CORRUPT,
])
