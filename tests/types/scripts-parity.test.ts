// 编译期契约断言（tsc --noEmit 消费，无运行时断言价值；CI typecheck 步守护）：
// 两套模板必须完整满足各自契约——单侧漏导出/签名漂移在此即红，
// 不再只等 store.js 运行时兜底或另一平台用户机器暴雷。
import * as pwsh from '../../src/host/scripts.pwsh.js'
import * as posix from '../../src/host/scripts.posix.js'
import type { PwshScripts, PosixScripts } from '../../src/types/scripts.js'

const _pwsh: PwshScripts = pwsh
const _posix: PosixScripts = posix

// 豁免集结构化核对：平台专属导出恰为这三者，多一个少一个都报错。
// Record<键联合, true> + 对象字面量双向闭环——接口变大（多声明专属键）
// 字面量缺键报「缺少属性」，接口变小则触发新鲜字面量 excess property
// 检查；普通数组形式只证 ⊆，接口多声明时不报错
export type PwshOnly = keyof Omit<PwshScripts, keyof PosixScripts>   // 'homeDirScript'
export type PosixOnly = keyof Omit<PosixScripts, keyof PwshScripts>  // 'probeHomeScript' | 'legacyHomeMigrateScript'
const _pwshOnly: Record<PwshOnly, true> = { homeDirScript: true }
const _posixOnly: Record<PosixOnly, true> = { probeHomeScript: true, legacyHomeMigrateScript: true }
