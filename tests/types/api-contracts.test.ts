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
