// 编译期契约断言（tsc --noEmit 消费，无运行时断言价值；CI typecheck 步守护）：
// host 端点返回的 errBody 形状与 types/api.ts 对偶绑定——动态构造对象
// （rescueRollback 错误产物等）必须落入 ErrBody 形状；client 侧请求/响应
// 类型的双向绑定在 M7（src/client/util.ts 类型化后）补齐。
import type { ErrBody, ErrorCode } from '../../src/types/api.js'
import { rescueRollback } from '../../src/host/snapshots.js'
import type { RescueDeps, RescueOpts } from '../../src/host/snapshots.js'

// execute 端点的救援错误返回必须满足 ErrBody 形状（code 落在 ErrorCode 联合内）
declare const deps: RescueDeps
declare const opts: RescueOpts
type RescueResult = Awaited<ReturnType<typeof rescueRollback>>
const _rescueIsErrBody: ErrBody = null as unknown as RescueResult
// ErrBody.code 与 ErrorCode 同一联合：端点 code 字面量必须可落进该联合
const _codeProbe: ErrorCode = 'ROLLBACK_FAILED'
const _codeProbe2: ErrorCode = 'STALE'
const _errBodyCode: ErrorCode = null as unknown as ErrBody['code']

// ---- client 侧双向绑定的另一半（M7 任务项，复审补齐）----
// host 端点 handler 的实际返回类型与 client（util.ts api<T>）消费的响应类型
// 双向互赋值钉住：host 改返回形状、client 改消费类型、或 handler 接错响应
// 类型，任一种漂移此处即编译报错。
import type { createRoutesCore } from '../../src/host/routes-core.js'
import type { createRoutesManage } from '../../src/host/routes-manage.js'
import type {
  InitResponse, SnapshotInfoResponse, PreviewResponse, ExecuteResponse,
  StatusResponse, LineageRecordResponse, ExcludeGetResponse, ExcludeSetResponse,
  ConfigGetResponse, ConfigSetResponse, ConfigResetResponse, ManageResponse,
} from '../../src/types/api.js'

type CoreHandlers = ReturnType<typeof createRoutesCore>
type ManageHandlers = ReturnType<typeof createRoutesManage>
// handler 实际返回（Awaited 后）——对标注了 Promise<XResponse> 的 handler 即
// 声明类型本身；断言的价值在于钉住「端点 ↔ 响应类型」的配对关系
type Actual<T> = T extends (...args: any[]) => infer R ? Awaited<R> : never

const _initH2C: InitResponse = null as unknown as Actual<CoreHandlers['init']>
const _initC2H: Actual<CoreHandlers['init']> = null as unknown as InitResponse
const _snapInfoH2C: SnapshotInfoResponse = null as unknown as Actual<CoreHandlers['snapshot-info']>
const _snapInfoC2H: Actual<CoreHandlers['snapshot-info']> = null as unknown as SnapshotInfoResponse
const _previewH2C: PreviewResponse = null as unknown as Actual<CoreHandlers['preview']>
const _previewC2H: Actual<CoreHandlers['preview']> = null as unknown as PreviewResponse
const _executeH2C: ExecuteResponse = null as unknown as Actual<CoreHandlers['execute']>
const _executeC2H: Actual<CoreHandlers['execute']> = null as unknown as ExecuteResponse
const _statusH2C: StatusResponse = null as unknown as Actual<CoreHandlers['status']>
const _statusC2H: Actual<CoreHandlers['status']> = null as unknown as StatusResponse
const _lineageH2C: LineageRecordResponse = null as unknown as Actual<CoreHandlers['lineage-record']>
const _lineageC2H: Actual<CoreHandlers['lineage-record']> = null as unknown as LineageRecordResponse
const _excludeGetH2C: ExcludeGetResponse = null as unknown as Actual<ManageHandlers['exclude-get']>
const _excludeGetC2H: Actual<ManageHandlers['exclude-get']> = null as unknown as ExcludeGetResponse
const _excludeSetH2C: ExcludeSetResponse = null as unknown as Actual<ManageHandlers['exclude-set']>
const _excludeSetC2H: Actual<ManageHandlers['exclude-set']> = null as unknown as ExcludeSetResponse
const _configGetH2C: ConfigGetResponse = null as unknown as Actual<ManageHandlers['config-get']>
const _configGetC2H: Actual<ManageHandlers['config-get']> = null as unknown as ConfigGetResponse
const _configSetH2C: ConfigSetResponse = null as unknown as Actual<ManageHandlers['config-set']>
const _configSetC2H: Actual<ManageHandlers['config-set']> = null as unknown as ConfigSetResponse
const _configResetH2C: ConfigResetResponse = null as unknown as Actual<ManageHandlers['config-reset']>
const _configResetC2H: Actual<ManageHandlers['config-reset']> = null as unknown as ConfigResetResponse
const _manageH2C: ManageResponse = null as unknown as Actual<ManageHandlers['manage']>
const _manageC2H: Actual<ManageHandlers['manage']> = null as unknown as ManageResponse
