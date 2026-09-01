// 编译期契约断言（tsc --noEmit 消费，无运行时断言价值；CI typecheck 步守护）：
// dump/parse 返回结构与 payloads.ts 持久化类型双向绑定——
// 解析器产出（StoreDumpInfo.entries/lineage）⊆ IndexEntry/LineageEntry，
// 且 IndexEntry/LineageEntry ⊆ 解析器产出（任一方向字段增删/形状漂移在此编译报错）。
import type { IndexEntry, LineageEntry } from '../../src/types/payloads.js'
import { parseStoresDump } from '../../src/host/dump-parse.js'
import type { StoreDumpInfo } from '../../src/host/dump-parse.js'

type ParsedIndex = NonNullable<StoreDumpInfo['entries']>
type ParsedLineage = NonNullable<StoreDumpInfo['lineage']>

// 双向互赋值：解析器产出与持久化条目类型必须互相满足
const _indexToParsed: ParsedIndex = null as unknown as IndexEntry[]
const _parsedToIndex: IndexEntry[] = null as unknown as ParsedIndex
const _lineageToParsed: ParsedLineage = null as unknown as LineageEntry[]
const _parsedToLineage: LineageEntry[] = null as unknown as ParsedLineage

// 解析器入口形态保持：文本输入 → 按目录索引的 dump 结果
const _acceptsText: Map<string, StoreDumpInfo> = parseStoresDump('')
